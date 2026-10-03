import express from 'express';
import fs from 'fs';
import path from 'path';
import { trendService } from '../services/trendService.js';
import { CONFIG } from '../config.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const data = await trendService.getAllTrends(false);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message, items: trendService.getDemoItems() });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const data = await trendService.getAllTrends(true);
    res.json(data);
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
