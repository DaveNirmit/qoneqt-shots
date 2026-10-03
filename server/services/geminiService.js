import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The Gemini API has two response shapes (interactions and generateContent).
// These helpers find text or image data in either.
function findText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.output_text === 'string') return node.output_text;
  const parts = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.text === 'string' && !n.thought) parts.push(n.text);
    Object.values(n).forEach((v) => typeof v === 'object' && walk(v));
  };
  walk(node);
  return parts.join('');
}

function findImage(node) {
  let found = null;
  const walk = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const mime = n.mime_type || n.mimeType || '';
    if (typeof n.data === 'string' && n.data.length > 1000 && (!mime || mime.startsWith('image/'))) {
      found = { data: n.data, mime: mime || 'image/jpeg' };
      return;
    }
    Object.values(n).forEach((v) => typeof v === 'object' && walk(v));
  };
  walk(node);
  return found;
}

function parseJSON(text) {
  const clean = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Gemini did not return valid JSON');
  }
}

class GeminiService {
  get key() { return CONFIG.GEMINI.API_KEY; }
  isConfigured() { return Boolean(this.key); }
  canMakeVideo() { return this.isConfigured() && CONFIG.GEMINI.VIDEO_ENABLED; }

  async request(pathname, { method = 'GET', body, timeoutMs = 60000, raw = false } = {}) {
    const url = pathname.startsWith('http') ? pathname : `${BASE}/${pathname}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'x-goog-api-key': this.key, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (raw && res.ok) return Buffer.from(await res.arrayBuffer());
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
      if (!res.ok) {
        const err = new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Gemini request timed out');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Try request variants in order (newer API shape first); return the first that works.
  async firstWorking(variants) {
    const errors = [];
    let last = null;
    for (const fn of variants) {
      try { return await fn(); } catch (err) {
        last = err;
        errors.push(err.message);
        if ([401, 403, 429, 503].includes(err.status)) throw err; // another shape will not help
      }
    }
    const e = new Error(errors.join(' | '));
    e.status = last?.status;
    throw e;
  }

  // Wait and try again when the free-tier quota or the service is briefly unavailable.
  async withRetry(fn, { tries = 3, baseMs = 8000 } = {}) {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (err) {
        const retriable = err.status === 429 || err.status === 503 || /quota|rate|overloaded|resource exhausted|unavailable/i.test(err.message);
        if (!retriable || i >= tries - 1) throw err;
        console.warn(`[Gemini] ${err.message}. Retrying in ${(baseMs * (i + 1)) / 1000}s`);
        await sleep(baseMs * (i + 1));
      }
    }
  }

  /** Validates the key and reports which configured models it can see. */
  async status() {
    const models = {
      text: CONFIG.GEMINI.TEXT_MODEL,
      image: CONFIG.GEMINI.IMAGE_MODEL,
      video: CONFIG.GEMINI.VIDEO_MODEL,
    };
    if (!this.isConfigured()) return { configured: false, models };
    try {
      const names = new Set();
      let token = '';
      do {
        const d = await this.request(`models?pageSize=1000${token ? `&pageToken=${token}` : ''}`, { timeoutMs: 15000 });
        (d.models || []).forEach((m) => names.add(String(m.name).replace(/^models\//, '')));
        token = d.nextPageToken;
      } while (token && names.size < 3000);
      const listed = Object.fromEntries(Object.entries(models).map(([k, id]) => [k, names.has(id)]));
      return { configured: true, valid: true, models, listed, videoEnabled: CONFIG.GEMINI.VIDEO_ENABLED };
    } catch (err) {
      return { configured: true, valid: false, error: err.message, models };
    }
  }

  async generateJSON(prompt, schema) {
    const model = CONFIG.GEMINI.TEXT_MODEL;
    const text = await this.withRetry(() => this.firstWorking([
      async () => findText(await this.request('interactions', {
        method: 'POST',
        body: { model, input: prompt, response_format: { type: 'text', mime_type: 'application/json', schema } },
      })),
      async () => findText(await this.request(`models/${model}:generateContent`, {
        method: 'POST',
        body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } },
      })),
    ]));
    return parseJSON(text);
  }

  /** Generates a 9:16 image and stores it in the image cache. */
  async generateImage(prompt, nameHint = 'scene') {
    const model = CONFIG.GEMINI.IMAGE_MODEL;
    const img = await this.withRetry(() => this.firstWorking([
      async () => findImage(await this.request('interactions', {
        method: 'POST', timeoutMs: 120000,
        body: {
          model,
          input: [{ type: 'text', text: prompt }],
          response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '9:16', image_size: '1K' },
        },
      })) || Promise.reject(new Error('No image in interactions response')),
      async () => findImage(await this.request(`models/${model}:generateContent`, {
        method: 'POST', timeoutMs: 120000,
        body: {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
        },
      })) || Promise.reject(new Error('No image in generateContent response')),
    ]));
    const ext = img.mime.includes('png') ? 'png' : 'jpg';
    const safe = String(nameHint).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'scene';
    const filename = `gem_${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const localPath = path.join(CONFIG.STORAGE.CACHE_DIR, 'images', filename);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, Buffer.from(img.data, 'base64'));
    return { url: `/api/visuals/image/${filename}`, localPath, provider: 'gemini' };
  }

  /**
   * Generates a vertical video clip with Veo (image-to-video when imagePath is given).
   * Resolves to the local path of the downloaded MP4.
   */
  async generateVideo(prompt, imagePath, onProgress) {
    const model = CONFIG.GEMINI.VIDEO_MODEL;
    const instance = { prompt };
    if (imagePath && fs.existsSync(imagePath)) {
      const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      instance.image = { inlineData: { mimeType, data: fs.readFileSync(imagePath).toString('base64') } };
    }
    const submit = (parameters) => this.request(`models/${model}:predictLongRunning`, {
      method: 'POST', body: { instances: [instance], parameters },
    });

    let op;
    for (let attempt = 0; ; attempt++) {
      try {
        op = await this.firstWorking([
          () => submit({ aspectRatio: '9:16', personGeneration: instance.image ? 'allow_adult' : 'allow_all' }),
          () => submit({ aspectRatio: '9:16' }),
        ]);
        break;
      } catch (err) {
        if (/429|quota|rate/i.test(err.message) && attempt < 3) { await sleep(20000 * (attempt + 1)); continue; }
        throw err;
      }
    }
    if (!op?.name) throw new Error('Veo did not return an operation id');

    const started = Date.now();
    const limitMs = 8 * 60 * 1000;
    while (true) {
      await sleep(8000);
      const elapsed = Date.now() - started;
      if (elapsed > limitMs) throw new Error('Veo took longer than 8 minutes');
      onProgress?.(Math.min(95, Math.round((elapsed / 90000) * 100)));
      const status = await this.request(op.name, { timeoutMs: 30000 });
      if (!status.done) continue;
      if (status.error) throw new Error(status.error.message || 'Veo generation failed');
      const resp = status.response?.generateVideoResponse || {};
      const uri = resp.generatedSamples?.[0]?.video?.uri;
      if (!uri) {
        const reason = resp.raiMediaFilteredReasons?.[0];
        throw new Error(reason ? `Blocked by safety filter: ${reason}` : 'Veo returned no video');
      }
      const buf = await this.request(uri, { raw: true, timeoutMs: 120000 });
      const out = path.join(CONFIG.STORAGE.VIDEOS_DIR, `veo_${Date.now()}.mp4`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      onProgress?.(100);
      return out;
    }
  }
}

export const geminiService = new GeminiService();
