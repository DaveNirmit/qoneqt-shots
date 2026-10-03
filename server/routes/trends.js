import express from 'express';
import fs from 'fs';
import path from 'path';
import { trendService } from '../services/trendService.js';
import { CONFIG } from '../config.js';

const router = express.Router();

// Keep the Trends page safe to show on stage: drop stories whose title or summary contains profanity.
const BLOCKED = ['ass', 'asses', 'asshole', 'bastard', 'bitch', 'bitches', 'bollocks', 'boobs', 'bullshit', 'cock', 'crap', 'cum', 'cunt',
  'damn', 'dick', 'dildo', 'douche', 'fag', 'faggot', 'fuck', 'fucked', 'fucker', 'fucking', 'goddamn', 'handjob', 'horny', 'jizz', 'kike',
  'milf', 'motherfucker', 'nigga', 'nigger', 'nude', 'nudes', 'orgasm', 'penis', 'piss', 'pissed', 'porn', 'porno', 'pussy', 'rape', 'rapist',
  'retard', 'retarded', 'scrotum', 'sex', 'sexy', 'shit', 'shitty', 'slut', 'spic', 'tits', 'twat', 'vagina', 'wank', 'wanker', 'whore', 'xxx'];
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED.join('|')})\\b`, 'i');
const isClean = (t) => !BLOCKED_RE.test(`${t.title || ''} ${t.summary || ''}`);
// Mix the sources (Hacker News, BBC, GDELT) instead of listing one source first, so the page shows varied topics.
const interleave = (items) => {
  const groups = new Map();
  items.forEach((t) => { const k = t.sourceId || t.sourceName; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const lists = [...groups.values()];
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) lists.forEach((l) => i < l.length && out.push(l[i]));
  return out;
};
const familyFriendly = (data) => (data && Array.isArray(data.items) ? { ...data, items: interleave(data.items.filter(isClean)) } : data);

router.get('/', async (req, res) => {
  try {
    const data = await trendService.getAllTrends(false);
    res.json(familyFriendly(data));
  } catch (err) {
    res.status(500).json({ error: err.message, items: trendService.getDemoItems() });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const data = await trendService.getAllTrends(true);
    res.json(familyFriendly(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trending on Qoneqt: read from server/data/qoneqt-trends.json until a Qoneqt API is available.
router.get('/qoneqt', (req, res) => {
  const file = path.join(CONFIG.STORAGE.PROJECTS_DIR, '..', 'qoneqt-trends.json');
  if (!fs.existsSync(file)) return res.json({ configured: false, items: [] });
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    res.json({ configured: true, updatedAt: data.updatedAt || fs.statSync(file).mtime, source: data.source || 'Qoneqt', items: Array.isArray(data.items) ? data.items : [] });
  } catch (err) {
    res.json({ configured: false, items: [], error: `qoneqt-trends.json is not valid JSON: ${err.message}` });
  }
});

export default router;
