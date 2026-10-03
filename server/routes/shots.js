import express from 'express';
import { geminiService } from '../services/geminiService.js';
import { ollamaService } from '../services/ollamaService.js';
import { visualService } from '../services/visualService.js';
import { CONFIG } from '../config.js';

const router = express.Router();

const SCENE_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          onScreenText: { type: 'string' },
          narration: { type: 'string' },
          duration: { type: 'integer' },
          imagePrompt: { type: 'string' },
          motionPrompt: { type: 'string' },
        },
        required: ['onScreenText', 'narration', 'duration', 'imagePrompt', 'motionPrompt'],
      },
    },
  },
  required: ['scenes'],
};

// --- duplicate detection -------------------------------------------------
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const wordSet = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
const similar = (a, b) => {
  const A = wordSet(a), B = wordSet(b);
  if (!A.size || !B.size) return false;
  let shared = 0;
  A.forEach((w) => B.has(w) && shared++);
  return shared / Math.min(A.size, B.size) >= 0.8;
};
function findDuplicates(scenes) {
  const dupes = [];
  for (let i = 0; i < scenes.length; i++) {
    for (let j = i + 1; j < scenes.length; j++) {
      const a = scenes[i], b = scenes[j];
      if (norm(a.onScreenText) === norm(b.onScreenText) || similar(a.narration, b.narration) || similar(a.visualDescription, b.visualDescription)) {
        dupes.push([i + 1, j + 1]);
      }
    }
  }
  return dupes;
}

function scenePrompt({ brief, count, tone, voiceName, length, avoid = [], seed, retryNote = '' }) {
  const perScene = Math.max(4, Math.min(8, Math.round(length / count)));
  return `You are a director of short vertical videos for Qoneqt, a social media platform.
Turn this brief into exactly ${count} scenes for one ${length}-second, 9:16 video.

Brief title: ${brief.title || brief.topic}
What the creator asked for: ${brief.topic || brief.title}
Hook: ${brief.hook || ''}
Key points: ${(brief.scenes || []).map((s) => s.narration || s.onScreenText).filter(Boolean).join(' | ')}
Tone: ${tone}. Narrator: ${voiceName || 'a natural creator voice'}.

Rules:
- Scene 1 is a scroll-stopping hook. The last scene ends with a clear call to action.
- Every scene makes a DIFFERENT point and shows a DIFFERENT picture: new subject, setting, framing and colours. Never repeat a sentence, phrase or image idea across scenes.
- onScreenText: 5 to 8 words, punchy and complete, no hashtags or emoji.
- narration: what the narrator says, about ${Math.round(perScene * 2.9)} words (two short sentences), natural spoken English.
- duration: whole seconds between 4 and 8 (aim for ${perScene}).
- imagePrompt: a detailed photographic description of one vertical frame: subject, setting, lighting, camera angle. No text, letters, logos or watermarks in the image.
- motionPrompt: camera movement and subject action for a short cinematic clip of that frame.
${avoid.length ? `- Do not reuse any of these lines from a previous version: ${avoid.map((a) => `"${a}"`).join(', ')}.\n` : ''}${retryNote ? `- ${retryNote}\n` : ''}Variation seed ${seed}: use fresh, specific examples rather than generic phrasing.
Return JSON: {"scenes":[{"onScreenText":"","narration":"","duration":6,"imagePrompt":"","motionPrompt":""}]}`;
}

// Captions must fit on screen: keep the first clause when a model writes a whole sentence.
const shortCaption = (raw) => {
  const text = String(raw || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (text.split(' ').length <= 10) return text;
  const clause = text.split(/[,:;.!?]/)[0].trim();
  if (clause.split(' ').length >= 3) return clause;
  return text.split(' ').slice(0, 9).join(' ');
};

const clean = (scenes, count) => (scenes || []).slice(0, count).map((s) => ({
  onScreenText: shortCaption(s.onScreenText),
  narration: String(s.narration || '').trim(),
  duration: Math.max(3, Math.min(10, parseInt(s.duration, 10) || 6)),
  visualDescription: String(s.imagePrompt || s.visualDescription || '').trim(),
  motionPrompt: String(s.motionPrompt || '').trim(),
}));

/** GET /api/shots/status: is a Gemini key configured and valid? */
router.get('/status', async (req, res) => {
  res.json(await geminiService.status());
});

/** POST /api/shots/scenes: brief -> N distinct scenes (Gemini, else the local model, else the brief itself). */
router.post('/scenes', async (req, res) => {
  const { brief = {}, tone = 'Informative', voiceName = '', length = 30, avoid = [] } = req.body || {};
  const count = Math.max(2, Math.min(5, parseInt(req.body?.count, 10) || 3));
  if (!brief.title && !brief.topic) return res.status(400).json({ error: 'A script brief is required' });
  const seed = Number(req.body?.seed) || Date.now();
  const notes = [];
  const base = { brief, count, tone, voiceName, length: Number(length) || 30, avoid: Array.isArray(avoid) ? avoid.slice(0, 20) : [], seed };

  // Ask a model; if it repeated itself, ask once more with the duplicates called out.
  const ask = async (name, call) => {
    let scenes = clean(await call(scenePrompt(base)), count);
    if (scenes.length !== count) { notes.push(`${name} returned ${scenes.length} of ${count} scenes`); return null; }
    const dupes = findDuplicates(scenes);
    if (dupes.length) {
      notes.push(`${name} repeated scenes ${dupes.map((d) => d.join('&')).join(', ')}; asked again`);
      const retryNote = `Your previous attempt repeated scenes ${dupes.map((d) => d.join(' and ')).join('; ')}. Every scene must carry a different message and a different image.`;
      const retry = clean(await call(scenePrompt({ ...base, seed: seed + 1, retryNote })), count);
      if (retry.length === count && findDuplicates(retry).length < dupes.length) scenes = retry;
    }
    return scenes;
  };

  if (geminiService.isConfigured()) {
    try {
      const scenes = await ask('Gemini', async (p) => (await geminiService.generateJSON(p, SCENE_SCHEMA)).scenes);
      if (scenes) return res.json({ scenes, provider: 'gemini', model: CONFIG.GEMINI.TEXT_MODEL, notes });
    } catch (err) {
      notes.push(`Gemini: ${err.message}`);
    }
  }

  try {
    const status = await ollamaService.checkStatus();
    if (status.online) {
      const scenes = await ask('Local model', async (p) => {
        const out = await ollamaService.generate(CONFIG.DEFAULT_MODEL, p, 'You write JSON only.', { format: 'json', timeoutMs: 90000, maxTokens: 1500, temperature: 0.9 });
        return JSON.parse(out.response).scenes;
      });
      if (scenes) return res.json({ scenes, provider: 'local', model: CONFIG.DEFAULT_MODEL, notes });
    }
  } catch (err) {
    notes.push(`Local model: ${err.message}`);
  }

  // Last resort: reuse the brief's own scenes, trimmed or repeated to the requested count.
  const fallback = brief.scenes?.length ? brief.scenes : [{ onScreenText: brief.title, narration: brief.hook || brief.title }];
  const scenes = clean(Array.from({ length: count }, (_, i) => fallback[Math.min(i, fallback.length - 1)]), count);
  res.json({ scenes, provider: 'template', notes });
});

/** POST /api/shots/image: one 9:16 scene image (Gemini, else open-source image search, never one already used). */
router.post('/image', async (req, res) => {
  const { prompt = '', text = '', narration = '', topic = '', index = 0, exclude = [] } = req.body || {};
  const used = new Set((Array.isArray(exclude) ? exclude : []).map((v) => String(v).split('?')[0]));
  const isUsed = (v) => used.has(String(v.localPath || '')) || used.has(String(v.url || '').split('?')[0]);

  // Give the image model the whole picture: the video's topic, this scene's caption and what it shows.
  const subject = String(prompt || narration || text || topic).trim();
  if (geminiService.isConfigured() && subject) {
    try {
      const full = [
        `Photorealistic vertical 9:16 photograph for a short video about "${topic || subject}".`,
        `Scene ${Number(index) + 1}${text ? `, titled "${text}"` : ''}: ${subject}.`,
        'Cinematic natural light, sharp focus, one clear subject filling the frame. No text, letters, captions, logos or watermarks.',
      ].join(' ');
      return res.json(await geminiService.generateImage(full, topic));
    } catch (err) {
      console.warn('[Shots] Gemini image failed, using image search:', err.message);
    }
  }
  try {
    let visual = null;
    for (let k = 0; k < 4; k++) {
      visual = await visualService.getSceneVisual(text || prompt, topic, Number(index) + k * 7, { variation: Math.floor(Math.random() * 1000), forceRegenerate: k > 0 });
      if (!isUsed(visual)) break;
    }
    res.json({ url: visual.url, localPath: visual.localPath, provider: 'search' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
