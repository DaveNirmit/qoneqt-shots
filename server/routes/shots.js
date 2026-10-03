import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
  res.json({ ...(await geminiService.status()), pollinationsToken: Boolean(CONFIG.POLLINATIONS_TOKEN) });
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

// Content hash of a cached image, so two differently named copies of the same picture count as the same.
const fileHash = (p) => {
  try { return p && fs.existsSync(p) ? crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex') : null; } catch { return null; }
};

// Free image generation from the full scene description. A different seed gives a different picture.
// Anonymous use allows about one image every 45 s (measured; the docs say 15 s) and adds a small watermark
// (cropped away by the renderer, which is why we ask for 1360 px tall). A free account token
// (auth.pollinations.ai, POLLINATIONS_TOKEN in .env) allows one per 5 s without the watermark.
// Requests are spaced out and retried on 402/429.
let nextPollinationsAt = 0;
async function pollinationsImage(prompt, nameHint, seed) {
  const token = CONFIG.POLLINATIONS_TOKEN;
  const gapMs = token ? 5500 : 45000;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 600))}?width=720&height=1360&seed=${seed}&nologo=true&private=true&model=flux`;
  const headers = { 'User-Agent': 'QoneqtShots/1.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = nextPollinationsAt - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      nextPollinationsAt = Date.now() + gapMs;
      const r = await fetch(url, { signal: ctrl.signal, headers });
      if (r.status === 402 || r.status === 429) {
        nextPollinationsAt = Date.now() + gapMs * (attempt + 1); // back off harder each time
        console.warn(`[Shots] Pollinations busy (HTTP ${r.status}); retry ${attempt + 1}/3 in ${Math.round((nextPollinationsAt - Date.now()) / 1000)}s`);
        continue;
      }
      if (!r.ok || !String(r.headers.get('content-type') || '').startsWith('image/')) {
        console.warn(`[Shots] Pollinations answered HTTP ${r.status}`);
        return null;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 4000) return null;
      const safe = String(nameHint).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'scene';
      const filename = `pol_${safe}_${Date.now()}_${seed}.jpg`;
      const localPath = path.join(CONFIG.STORAGE.CACHE_DIR, 'images', filename);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buf);
      return { url: `/api/visuals/image/${filename}`, localPath, provider: 'pollinations' };
    } catch (err) {
      console.warn('[Shots] Pollinations failed:', err.message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * POST /api/shots/image: one 9:16 scene image.
 * Gemini when the key's tier allows it, else Pollinations (free, no key), else image search.
 * Never returns a picture whose content matches one already used in this project.
 */
router.post('/image', async (req, res) => {
  const { prompt = '', text = '', narration = '', topic = '', index = 0, exclude = [] } = req.body || {};
  const usedHashes = new Set((Array.isArray(exclude) ? exclude : []).map(fileHash).filter(Boolean));
  const isUsed = (localPath) => usedHashes.has(fileHash(localPath));

  // Give the image model the whole picture: the video's topic, this scene's caption and what it shows.
  const subject = String(prompt || narration || text || topic).trim();
  const full = [
    `Photorealistic vertical 9:16 photograph for a short video about "${topic || subject}".`,
    `Scene ${Number(index) + 1}${text ? `, titled "${text}"` : ''}: ${subject}.`,
    'Cinematic natural light, sharp focus, one clear subject filling the frame. No text, letters, captions, logos or watermarks.',
  ].join(' ');

  if (geminiService.canMakeImages() && subject) {
    try {
      return res.json(await geminiService.generateImage(full, topic));
    } catch (err) {
      console.warn('[Shots] Gemini image unavailable, using Pollinations:', err.message);
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const seed = (Number(index) + 1) * 1000 + Math.floor(Math.random() * 1000);
    const made = await pollinationsImage(full, topic, seed);
    if (!made) break; // the generator is unavailable right now; use real photos instead
    if (!isUsed(made.localPath)) return res.json(made);
  }

  // Last resort: real photos from Wikimedia Commons, skipping any already used in this project.
  try {
    const keywords = visualService.extractKeywords(text || prompt, topic);
    const hits = await visualService.searchWikimediaImages(keywords, 12);
    for (let k = 0; k < hits.length; k++) {
      const pick = hits[(Number(index) + k) % hits.length];
      const saved = await visualService.fetchAndCacheImage(pick, `wiki_${Date.now()}_${k}.jpg`);
      if (saved && !isUsed(saved)) return res.json({ url: `/api/visuals/image/${path.basename(saved)}`, localPath: saved, provider: 'search' });
    }
    const visual = await visualService.getSceneVisual(text || prompt, topic, Number(index), { forceRegenerate: true });
    res.json({ url: visual.url, localPath: visual.localPath, provider: 'search' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
