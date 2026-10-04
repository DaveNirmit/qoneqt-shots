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
          imagePrompt: { type: 'string' },
          motionPrompt: { type: 'string' },
          searchQuery: { type: 'string' },
        },
        required: ['onScreenText', 'narration', 'imagePrompt', 'motionPrompt', 'searchQuery'],
      },
    },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['scenes', 'caption', 'hashtags'],
};

const WORDS_PER_SECOND = 2.5; // natural speaking pace for narration
const wordCount = (s) => (String(s || '').match(/\S+/g) || []).length;
const totalWords = (scenes) => scenes.reduce((n, s) => n + wordCount(s.narration), 0);
const normalizeTags = (tags) => {
  const list = (Array.isArray(tags) ? tags : String(tags || '').split(/[\s,]+/))
    .map((t) => String(t).replace(/[^A-Za-z0-9_]/g, ''))
    .filter((t) => t.length > 1)
    .map((t) => `#${t}`);
  return [...new Set(list)].slice(0, 7);
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
  const words = Math.round(length * WORDS_PER_SECOND);
  const perScene = Math.round(words / count);
  const points = (Array.isArray(brief.keyPoints) && brief.keyPoints.length ? brief.keyPoints : (brief.scenes || []).map((s) => s.narration || s.onScreenText))
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return `You write voice-over scripts for short vertical videos on Qoneqt, a social media platform.
Write one ${length}-second video as exactly ${count} scenes. Read in order, the narration of all scenes must sound like one natural, connected voice-over.

What the creator asked for, in their own words: "${brief.topic || brief.title}"
Working title: ${brief.title || ''}
Core idea: ${brief.concept || ''}
${brief.creatorNotes ? `Creator's wishes (follow them): ${brief.creatorNotes}\n` : ''}Audience: ${brief.audience || 'everyday Qoneqt viewers'}
Hook idea: ${brief.hook || ''}
Points to cover:${points.map((p, i) => `\n  ${i + 1}. ${p}`).join('')}
Call to action idea: ${brief.cta || 'Follow for more.'}
Tone: ${tone}. Narrator: ${voiceName || 'a natural creator voice'}.
(The points were drafted by a small local model. Keep what is right, fix anything vague or wrong, and add concrete detail.)

Story shape:
- Scene 1 is the hook: grab attention in the first sentence with a question or a surprising, true fact, then say what the viewer will get.
- Middle scenes explain clearly, one idea per scene, each building on the one before. Use concrete examples, everyday comparisons and details the viewer can picture.
- The last scene gives the takeaway in one line, then the call to action.

Writing rules:
- narration: about ${perScene} words per scene; the whole video is about ${words} spoken words. Write for the ear: short sentences, contractions, talk to "you". No filler such as "In this video" or "Let's dive in".
- Facts: only state things that are true. No invented statistics, studies or quotes, and no percentages or "rules" presented as fact unless they are well-established common knowledge. If you are not sure of a number, describe it without one.
- Call to action: ask viewers to follow or comment on Qoneqt. Never say "subscribe", "like this video" or "smash the button".
- onScreenText: a 3 to 7 word headline shown at the top of the screen for the whole scene (the narration itself is shown as subtitles). Sum up the scene; do not copy the narration's first words. No hashtags or emoji.
- imagePrompt: a detailed photographic description of one vertical frame showing the concrete thing this scene's narration talks about (the object, person or place named in the narration, not a mood). Subject, setting, lighting, camera angle. Each scene shows a different subject or setting. No text, letters, logos or watermarks.
- The narration of each scene must be understandable on its own and must describe or explain what is in its picture, so the words and the image always agree.
- motionPrompt: camera movement and subject action for a short clip of that frame.
- searchQuery: 2 to 4 plain words to find a real photo of this scene's subject in a photo library (for example "sleeping cat sofa").
- Every scene makes a different point. Never repeat a sentence, phrase or image idea.
${avoid.length ? `- Do not reuse any of these lines from a previous version: ${avoid.map((a) => `"${a}"`).join(', ')}.\n` : ''}${retryNote ? `- ${retryNote}\n` : ''}
Also write the post text:
- caption: 2 or 3 sentences for the Qoneqt post that tease the video's value and end with a question that invites comments.
- hashtags: 5 to 7 relevant hashtags in CamelCase, no spaces.

Variation seed ${seed}: prefer fresh, specific examples over generic phrasing.
Return JSON: {"scenes":[{"onScreenText":"","narration":"","imagePrompt":"","motionPrompt":"","searchQuery":""}],"caption":"","hashtags":[""]}`;
}

// Captions must fit on screen: keep the first clause when a model writes a whole sentence.
const shortCaption = (raw) => {
  const text = String(raw || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  if (text.split(' ').length <= 9) return text;
  const clause = text.split(/[,:;.!?]/)[0].trim();
  const n = clause.split(' ').length;
  if (n >= 3 && n <= 9) return clause;
  return text.split(' ').slice(0, 7).join(' ');
};

// Scene length follows the narration: about 2.5 words per second plus a short pause.
const clean = (scenes, count) => (scenes || []).slice(0, count).map((s) => {
  const narration = String(s.narration || '').replace(/\s+/g, ' ').trim();
  return {
    onScreenText: shortCaption(s.onScreenText),
    narration,
    duration: Math.max(4, Math.min(15, Math.round(wordCount(narration) / WORDS_PER_SECOND + 0.8))),
    visualDescription: String(s.imagePrompt || s.visualDescription || '').trim(),
    motionPrompt: String(s.motionPrompt || '').trim(),
    searchQuery: String(s.searchQuery || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' '),
  };
});

// Spread the brief's lines over the requested number of scenes (used only when no model is available).
function scenesFromBrief(brief, count) {
  const lines = [brief.hook, ...(brief.keyPoints || []), brief.cta].map((l) => String(l || '').trim()).filter(Boolean);
  const source = lines.length ? lines : (brief.scenes || []).map((s) => s.narration).filter(Boolean);
  const groups = Array.from({ length: count }, () => []);
  source.forEach((line, i) => groups[Math.min(count - 1, Math.floor((i * count) / source.length))].push(line));
  return groups.map((g, i) => ({ onScreenText: g[0] || brief.title, narration: g.join(' ') || brief.title, imagePrompt: `${brief.title}, scene ${i + 1}`, searchQuery: brief.title }));
}

/** GET /api/shots/status: is a Gemini key configured and valid? */
router.get('/status', async (req, res) => {
  res.json({ ...(await geminiService.status()), pollinationsToken: Boolean(CONFIG.POLLINATIONS_TOKEN) });
});

/** POST /api/shots/scenes: brief -> N distinct, connected scenes plus post text (Gemini, else the local model, else the brief). */
router.post('/scenes', async (req, res) => {
  const { brief = {}, tone = 'Informative', voiceName = '', avoid = [] } = req.body || {};
  const count = Math.max(2, Math.min(5, parseInt(req.body?.count, 10) || 3));
  if (!brief.title && !brief.topic) return res.status(400).json({ error: 'A script brief is required' });
  const length = Math.max(15, Math.min(90, Number(req.body?.length) || 30));
  const seed = Number(req.body?.seed) || Date.now();
  const notes = [];
  const base = { brief, count, tone, voiceName, length, avoid: Array.isArray(avoid) ? avoid.slice(0, 20) : [], seed };
  const minWords = Math.round((length * WORDS_PER_SECOND) / count * 0.5);

  // Ask a model; if it repeated itself or wrote too little, ask once more and keep the better answer.
  const ask = async (name, call, allowRetry = true) => {
    let out = await call(scenePrompt(base));
    let scenes = clean(out?.scenes, count);
    if (scenes.length !== count) { notes.push(`${name} returned ${scenes.length} of ${count} scenes`); return null; }
    const dupes = findDuplicates(scenes);
    const thin = scenes.filter((x) => wordCount(x.narration) < minWords).length;
    if (allowRetry && (dupes.length || thin)) {
      notes.push(`${name}: ${dupes.length ? `repeated scenes ${dupes.map((d) => d.join('&')).join(', ')}` : ''}${dupes.length && thin ? '; ' : ''}${thin ? `${thin} scene(s) too short` : ''}; asked again`);
      const retryNote = [
        dupes.length ? `Your previous attempt repeated scenes ${dupes.map((d) => d.join(' and ')).join('; ')}. Every scene must carry a different message and a different image.` : '',
        thin ? `Your previous narration was far too short. Each scene needs about ${Math.round((length * WORDS_PER_SECOND) / count)} words.` : '',
      ].filter(Boolean).join(' ');
      const retryOut = await call(scenePrompt({ ...base, seed: seed + 1, retryNote }));
      const retry = clean(retryOut?.scenes, count);
      if (retry.length === count && findDuplicates(retry).length <= dupes.length && totalWords(retry) >= totalWords(scenes) * 0.9) {
        scenes = retry;
        out = retryOut;
      }
    }
    return { scenes, caption: String(out?.caption || '').trim(), hashtags: normalizeTags(out?.hashtags) };
  };

  if (geminiService.isConfigured()) {
    try {
      const r = await ask('Gemini', (p) => geminiService.generateJSON(p, SCENE_SCHEMA));
      if (r) return res.json({ ...r, provider: 'gemini', model: geminiService.lastTextModel || CONFIG.GEMINI.TEXT_MODEL, notes });
    } catch (err) {
      notes.push(`Gemini: ${err.message}`);
    }
  }

  try {
    const status = await ollamaService.checkStatus();
    if (status.online) {
      const r = await ask('Local model', async (p) => {
        // The small local model is slow on long prompts: one attempt only, capped at 90 seconds.
        const out = await ollamaService.generate(CONFIG.DEFAULT_MODEL, p, 'You write JSON only.', { format: 'json', timeoutMs: 90000, maxTokens: 1400, temperature: 0.8 });
        return JSON.parse(out.response);
      }, false);
      if (r) return res.json({ ...r, provider: 'local', model: CONFIG.DEFAULT_MODEL, notes });
    }
  } catch (err) {
    notes.push(`Local model: ${err.message}`);
  }

  // Last resort: the brief's own hook, key points and call to action, spread over the scenes.
  res.json({ scenes: clean(scenesFromBrief(brief, count), count), caption: '', hashtags: [], provider: 'template', notes });
});

// Content hash of a cached image, so two differently named copies of the same picture count as the same.
const fileHash = (p) => {
  try { return p && fs.existsSync(p) ? crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex') : null; } catch { return null; }
};

// Free image generation from the full scene description. A different seed gives a different picture.
// Anonymous use allows about one image every 33 s (measured; the docs say 15 s; failed requests extend the wait) and adds a small watermark
// (cropped away by the renderer, which is why we ask for 1360 px tall). A free account token
// (auth.pollinations.ai, POLLINATIONS_TOKEN in .env) allows one per 5 s without the watermark.
// Requests are spaced out and retried on 402/429.
let nextPollinationsAt = 0;
async function pollinationsImage(prompt, nameHint, seed) {
  const token = CONFIG.POLLINATIONS_TOKEN;
  const gapMs = token ? 5500 : 33000;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 600))}?width=720&height=1360&seed=${seed}&nologo=true&private=true&model=flux`;
  const headers = { 'User-Agent': 'QoneqtShots/1.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = nextPollinationsAt - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      nextPollinationsAt = Date.now() + gapMs;
      const r = await fetch(url, { signal: ctrl.signal, headers });
      if (r.status === 402 || r.status === 429) {
        nextPollinationsAt = Date.now() + gapMs * (attempt + 1); // back off harder each time
        console.warn(`[Shots] Pollinations busy (HTTP ${r.status}); retry ${attempt + 1}/2 in ${Math.round((nextPollinationsAt - Date.now()) / 1000)}s`);
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

// Fast real photos: Openverse (openly licensed images, no key; 20 requests/min, 200/day anonymous).
const UA = 'QoneqtShots/1.0 (hackathon demo)';
const photoSearchCache = new Map(); // query -> { at, results }: "New image" reuses a search instead of spending the rate limit
let openverseBlockedUntil = 0;
// Real photographs only: skip collages, screenshots and graphics (whole words only).
const JUNK = /\b(mosaic|collage|screenshots?|logo|poster|diagram|chart|infographic|meme)\b/i;

async function searchOpenverse(q) {
  const hit = photoSearchCache.get(q);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.results;
  if (Date.now() < openverseBlockedUntil) return [];
  const search = async (text) => {
    try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(text)}&page_size=20&category=photograph`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
      if (r.status === 429) {
        openverseBlockedUntil = Date.now() + 60000;
        console.warn('[Shots] Openverse rate limit reached; using other sources for a minute');
        return [];
      }
      if (!r.ok) return [];
      return ((await r.json()).results || []).filter((x) => x.url && (x.width || 0) >= 600 && (x.height || 0) >= 600
        && !JUNK.test(`${x.title || ''} ${(x.tags || []).map((t) => t.name).join(' ')}`));
    } catch { return []; }
  };
  // Openverse needs every word to match, so relax the phrase step by step: all words, first three, first two.
  // Usually one request (the anonymous limit is 20 a minute).
  const words = q.split(' ');
  let results = [];
  for (const variant of [...new Set([words.join(' '), words.slice(0, 3).join(' '), words.slice(0, 2).join(' ')])]) {
    results = results.concat(await search(variant));
    if (results.length >= 6) break;
  }
  const seen = new Set();
  results = results.filter((x) => !seen.has(x.url) && seen.add(x.url));
  results.sort((a, b) => b.height / b.width - a.height / a.width); // portrait photos first
  if (results.length) photoSearchCache.set(q, { at: Date.now(), results });
  return results;
}

async function openversePhoto(query, usedHashes, nameHint, index) {
  const q = String(query || '').replace(/[^\w\s-]/g, ' ').trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase();
  if (!q) return null;
  const results = await searchOpenverse(q);
  const pool = results.slice(0, 12);
  const offset = Math.floor(Math.random() * Math.max(1, Math.min(4, pool.length)));
  for (let k = 0; k < pool.length; k++) {
    const item = pool[(Number(index) * 2 + offset + k) % pool.length];
    try {
      const img = await fetch(item.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      const type = String(img.headers.get('content-type') || '');
      if (!img.ok || !/image\/(jpe?g|png|webp)/.test(type)) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 8000 || buf.length > 15e6) continue;
      if (usedHashes.has(crypto.createHash('sha1').update(buf).digest('hex'))) continue;
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const safe = String(nameHint).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) || 'scene';
      const filename = `ov_${safe}_${Date.now()}_${k}.${ext}`;
      const localPath = path.join(CONFIG.STORAGE.CACHE_DIR, 'images', filename);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buf);
      const lic = String(item.license || '').toLowerCase();
      const credit = ['cc0', 'pdm'].includes(lic) ? '' : `Photo: ${String(item.creator || 'unknown').slice(0, 40)}, CC ${lic.toUpperCase()} ${item.license_version || ''}`.trim();
      return { url: `/api/visuals/image/${filename}`, localPath, provider: 'photo', credit, source: item.foreign_landing_url || '' };
    } catch { /* try the next result */ }
  }
  return null;
}

/**
 * POST /api/shots/image: one 9:16 scene image.
 * mode "photo": a matching real photo in about two seconds (Openverse, then Wikimedia).
 * mode "ai" (default): an AI image painted from the scene description (slower on the free tier).
 * Gemini when the key's tier allows it, else Pollinations (free, no key), else image search.
 * Never returns a picture whose content matches one already used in this project.
 */
router.post('/image', async (req, res) => {
  const { prompt = '', text = '', narration = '', topic = '', index = 0, exclude = [], mode = 'ai', query = '' } = req.body || {};
  const usedHashes = new Set((Array.isArray(exclude) ? exclude : []).map(fileHash).filter(Boolean));
  const isUsed = (localPath) => usedHashes.has(fileHash(localPath));

  // Give the image model the whole picture: the video's topic, this scene's caption and what it shows.
  const subject = String(prompt || narration || text || topic).trim();
  const full = [
    `Photorealistic vertical 9:16 photograph for a short video about "${topic || subject}".`,
    `Scene ${Number(index) + 1}${text ? `, titled "${text}"` : ''}: ${subject}.`,
    'Cinematic natural light, sharp focus, one clear subject filling the frame. No text, letters, captions, logos or watermarks.',
  ].join(' ');

  if (mode === 'photo') {
    const photo = await openversePhoto(query || text || topic, usedHashes, topic, index);
    if (photo) return res.json(photo);
  }

  if (mode !== 'photo' && geminiService.canMakeImages() && subject) {
    try {
      return res.json(await geminiService.generateImage(full, topic));
    } catch (err) {
      console.warn('[Shots] Gemini image unavailable, using Pollinations:', err.message);
    }
  }

  for (let attempt = 0; mode !== 'photo' && attempt < 2; attempt++) {
    const seed = (Number(index) + 1) * 1000 + Math.floor(Math.random() * 1000);
    const made = await pollinationsImage(full, topic, seed);
    if (!made) break; // the generator is unavailable right now; use real photos instead
    if (!isUsed(made.localPath)) return res.json(made);
  }

  // The painter is unavailable: a matching real photo beats a generic stock frame.
  if (mode !== 'photo') {
    const photo = await openversePhoto(query || text || topic, usedHashes, topic, index);
    if (photo) return res.json(photo);
  }

  // Last resort: real photos from Wikimedia Commons, skipping any already used in this project.
  try {
    const keywords = query ? String(query) : visualService.extractKeywords(text || prompt, topic);
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
