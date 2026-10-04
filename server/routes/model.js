import express from 'express';
import { scriptGenerator } from '../services/scriptGenerator.js';
import { visualService } from '../services/visualService.js';
import { CONFIG } from '../config.js';

const router = express.Router();

router.post('/generate', async (req, res) => {
  const {
    topic,
    audience,
    language,
    tone,
    duration,
    visualStyle,
    sourceContext,
    modelName
  } = req.body;

  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: 'A topic or prompt is required' });
  }

  const startTime = Date.now();
  try {
    const script = await scriptGenerator.generateScript({
      topic,
      audience,
      language,
      tone,
      duration: duration || 30,
      visualStyle: visualStyle || 'kinetic_bold',
      sourceContext,
      modelName: modelName || CONFIG.DEFAULT_MODEL
    });

    // Images are chosen per scene later, from the scene text itself (see /api/shots/image).

    const elapsedMs = Date.now() - startTime;
    res.json({
      success: true,
      script,
      elapsedMs,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

router.post('/regenerate-scene', async (req, res) => {
  const { sceneNumber, currentScene, projectContext, modelName } = req.body;
  if (!currentScene) {
    return res.status(400).json({ error: 'currentScene data is required' });
  }

  try {
    const updated = await scriptGenerator.regenerateScene(
      sceneNumber,
      currentScene,
      projectContext || {},
      modelName || CONFIG.DEFAULT_MODEL
    );
    res.json({ success: true, scene: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
