import express from 'express';
import path from 'path';
import fs from 'fs';
import { videoJobService } from '../services/video/VideoJobService.js';
import { ScenePlanner } from '../services/video/ScenePlanner.js';
import { CONFIG } from '../config.js';

const router = express.Router();

/**
 * GET /api/video/health
 * Inspects ComfyUI connection and reports active provider
 */
router.get('/health', async (req, res) => {
  try {
    const provider = await videoJobService.getActiveProvider();
    const health = await provider.checkHealth();
    res.json({
      success: true,
      activeProvider: provider.name,
      demoMode: provider.name === 'DemoVideoProvider',
      health,
      comfyBaseUrl: CONFIG.COMFYUI_BASE_URL
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/video/models
 * Video models catalog
 */
router.get('/models', (req, res) => {
  res.json({
    success: true,
    models: [
      {
        id: 'wan-2.1-fast',
        name: 'Wan 2.1 Video Pipeline (ComfyUI)',
        provider: 'Alibaba / ComfyUI Wan2.1 Workflow',
        description: 'End-to-end shot-by-shot cinematic video generation with dynamic camera movement.',
        resolutions: ['512x896 (9:16)', '896x512 (16:9)', '640x640 (1:1)'],
        defaultFps: 16,
        tag: 'PRIMARY'
      },
      {
        id: 'ltx-video',
        name: 'LTX-Video (Lightricks)',
        provider: 'Lightricks / ComfyUI LTX Provider',
        description: 'High-speed diffusion transformer with audio/video synchronized synthesis.',
        resolutions: ['720p', '1080p'],
        defaultFps: 24,
        tag: 'PLANNED'
      }
    ]
  });
});

/**
 * POST /api/video/plan-scenes
 * AI Director / Scene Planner endpoint
 */
router.post('/plan-scenes', (req, res) => {
  try {
    const { script, topic, style, aspectRatio, duration } = req.body;
    const scenes = ScenePlanner.planScenes(script || { topic, title: topic }, {
      style,
      aspectRatio,
      targetDuration: duration
    });
    res.json({ success: true, scenes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/video/jobs
 * Creates and starts a video generation pipeline job
 */
router.post('/jobs', async (req, res) => {
  try {
    const { projectId, topic, script, aspectRatio, duration, style, voice, music } = req.body;
    if (!topic && (!script || !script.title)) {
      return res.status(400).json({ success: false, error: 'Topic or script is required' });
    }

    const job = await videoJobService.createVideoJob({
      projectId,
      topic: topic || script?.title,
      script,
      aspectRatio: aspectRatio || '9:16',
      duration: duration || 30,
      style: style || 'Cinematic',
      voice: voice || 'en-US-ChristopherNeural',
      music: music || 'Upbeat'
    });

    res.json({ success: true, job });
  } catch (err) {
    console.error('[VideoRoute] Error creating job:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/video/jobs/:jobId
 * Real-time job status tracking
 */
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const job = await videoJobService.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/video/jobs/:jobId/regenerate-scene
 * Regenerates ONLY a specific scene
 */
router.post('/jobs/:jobId/regenerate-scene', async (req, res) => {
  try {
    const { sceneId } = req.body;
    if (!sceneId) {
      return res.status(400).json({ success: false, error: 'sceneId is required' });
    }
    const result = await videoJobService.regenerateScene(req.params.jobId, sceneId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/video/clips/:filename
 * Streams scene video clips
 */
router.get('/clips/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(CONFIG.STORAGE.VIDEOS_DIR, safeFilename);

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'video/mp4');
    return res.sendFile(filePath);
  }

  // Fallback to exports dir or cache dir
  const fallbackPath = path.join(CONFIG.STORAGE.EXPORTS_DIR, safeFilename);
  if (fs.existsSync(fallbackPath)) {
    res.setHeader('Content-Type', 'video/mp4');
    return res.sendFile(fallbackPath);
  }

  res.status(404).send('Clip not found');
});

export default router;
