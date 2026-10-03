import express from 'express';
import path from 'path';
import fs from 'fs';
import { visualService } from '../services/visualService.js';
import { CONFIG } from '../config.js';

const router = express.Router();

router.get('/image/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(CONFIG.STORAGE.CACHE_DIR, 'images', safeFilename);

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  }

  // Redirect to high-res portrait fallback if not cached yet
  res.redirect(`https://picsum.photos/720/1280?random=1`);
});

router.post('/generate-scene-visual', async (req, res) => {
  const { sceneText, topic, sceneIndex } = req.body;
  try {
    const visual = await visualService.getSceneVisual(
      sceneText || 'technology',
      topic || '',
      sceneIndex || 0
    );
    res.json({ success: true, visual });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/populate-project-visuals', async (req, res) => {
  const { project } = req.body;
  if (!project) return res.status(400).json({ error: 'Project required' });

  try {
    const updated = await visualService.populateProjectVisuals(project);
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
