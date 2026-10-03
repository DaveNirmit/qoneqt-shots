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

function scenePrompt({ brief, count, tone, voiceName, length }) {
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
- onScreenText: 5 to 8 words, punchy and complete, no hashtags or emoji.
- narration: what the narrator says, about ${Math.round(perScene * 2.9)} words (two short sentences), natural spoken English.
- duration: whole seconds between 4 and 8 (aim for ${perScene}).
- imagePrompt: a detailed photographic description of a single vertical frame. No text, letters, logos or watermarks in the image.
- motionPrompt: camera movement and subject action for a short cinematic clip of that frame.
Return JSON: {"scenes":[{"onScreenText":"","narration":"","duration":6,"imagePrompt":"","motionPrompt":""}]}`;
}

const clean = (scenes, count) => (scenes || []).slice(0, count).map((s) => ({
  onScreenText: String(s.onScreenText || '').trim(),
  narration: String(s.narration || '').trim(),
  duration: Math.max(3, Math.min(10, parseInt(s.duration, 10) || 6)),
  visualDescription: String(s.imagePrompt || s.visualDescription || '').trim(),
  motionPrompt: String(s.motionPrompt || '').trim(),
}));

/** GET /api/shots/status: is a Gemini key configured and valid? */
router.get('/status', async (req, res) => {
  res.json(await geminiService.status());
});

/** POST /api/shots/scenes: brief -> N scenes (Gemini, else the local model, else the brief itself). */
router.post('/scenes', async (req, res) => {
  const { brief = {}, tone = 'Informative', voiceName = '', length = 30 } = req.body || {};
  const count = Math.max(2, Math.min(5, parseInt(req.body?.count, 10) || 3));
  if (!brief.title && !brief.topic) return res.status(400).json({ error: 'A script brief is required' });
  const prompt = scenePrompt({ brief, count, tone, voiceName, length: Number(length) || 30 });
  const notes = [];

  if (geminiService.isConfigured()) {
    try {
      const out = await geminiService.generateJSON(prompt, SCENE_SCHEMA);
      const scenes = clean(out.scenes, count);
      if (scenes.length === count) return res.json({ scenes, provider: 'gemini', model: CONFIG.GEMINI.TEXT_MODEL });
      notes.push(`Gemini returned ${scenes.length} of ${count} scenes`);
    } catch (err) {
      notes.push(`Gemini: ${err.message}`);
    }
  }

  try {
    const status = await ollamaService.checkStatus();
    if (status.online) {
      const out = await ollamaService.generate(CONFIG.DEFAULT_MODEL, prompt, 'You write JSON only.', { format: 'json', timeoutMs: 90000, maxTokens: 1500 });
      const parsed = JSON.parse(out.response);
      const scenes = clean(parsed.scenes, count);
      if (scenes.length === count) return res.json({ scenes, provider: 'local', model: CONFIG.DEFAULT_MODEL, notes });
      notes.push(`Local model returned ${scenes.length} of ${count} scenes`);
    }
  } catch (err) {
    notes.push(`Local model: ${err.message}`);
  }

  // Last resort: reuse the brief's own scenes, trimmed or repeated to the requested count.
  const base = brief.scenes?.length ? brief.scenes : [{ onScreenText: brief.title, narration: brief.hook || brief.title }];
  const scenes = clean(Array.from({ length: count }, (_, i) => base[Math.min(i, base.length - 1)]), count);
  res.json({ scenes, provider: 'template', notes });
});

/** POST /api/shots/image: one 9:16 scene image (Gemini, else open-source image search). */
router.post('/image', async (req, res) => {
  const { prompt = '', text = '', topic = '', index = 0 } = req.body || {};
  if (geminiService.isConfigured() && prompt) {
    try {
      return res.json(await geminiService.generateImage(`${prompt}. Vertical 9:16 photograph, cinematic light, no text.`, topic));
    } catch (err) {
      console.warn('[Shots] Gemini image failed, using image search:', err.message);
    }
  }
  try {
    const visual = await visualService.getSceneVisual(text || prompt, topic, index, { variation: Math.floor(Math.random() * 1000) });
    res.json({ url: visual.url, localPath: visual.localPath, provider: 'search' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
