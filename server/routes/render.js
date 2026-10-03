import express from 'express';
import fs from 'fs';
import path from 'path';
import { videoRenderer } from '../services/videoRenderer.js';
import { CONFIG } from '../config.js';

const router = express.Router();

router.get('/status', (req, res) => {
  const info = videoRenderer.getFFmpegInfo();
  res.json(info);
});

router.post('/synthetic-preview', async (req, res) => {
  try {
    const timestamp = Date.now();
    const outputFilename = `preview_${timestamp}.mp4`;
    const outputPath = path.join(CONFIG.STORAGE.EXPORTS_DIR, outputFilename);

    // Call videoRenderer to make preview
    const sampleProj = {
      id: 'preview',
      title: 'Preview Video',
      scenes: [
        {
          duration: 3,
          narration: 'This is a verified video preview.',
          onScreenText: 'VERIFIED\\nPREVIEW'
        }
      ]
    };
    const result = await videoRenderer.renderProjectToMP4(sampleProj);

    res.json({
      success: true,
      filename: result.filename,
      downloadUrl: result.downloadUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/render-project', async (req, res) => {
  try {
    const { project } = req.body;
    if (!project || !project.scenes || project.scenes.length === 0) {
      return res.status(400).json({ error: 'Valid project with scenes required' });
    }

    const result = await videoRenderer.renderProjectToMP4(project);
    res.json({
      success: true,
      filename: result.filename,
      videoUrl: result.downloadUrl,
      downloadUrl: result.downloadUrl,
      fileSize: result.fileSize,
      resolution: result.resolution,
      duration: result.duration
    });
  } catch (err) {
    console.error('[RenderRoute] Render project error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to receive WebM recording from frontend Canvas and convert to H.264 MP4
router.post('/process-recording', express.raw({ type: ['video/webm', 'application/octet-stream'], limit: '200mb' }), async (req, res) => {
  try {
    const buffer = req.body;
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'No video stream payload received' });
    }

    const projectId = req.query.projectId || 'video';
    const timestamp = Date.now();
    const tempWebm = path.join(CONFIG.STORAGE.CACHE_DIR, `temp_${timestamp}.webm`);
    const outputFilename = `qoneqt_forge_${projectId}_${timestamp}.mp4`;
    const outputPath = path.join(CONFIG.STORAGE.EXPORTS_DIR, outputFilename);

    fs.writeFileSync(tempWebm, buffer);
    await videoRenderer.transcodeToMP4(tempWebm, outputPath);

    try { if (fs.existsSync(tempWebm)) fs.unlinkSync(tempWebm); } catch (e) {}

    const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
    res.json({
      success: true,
      filename: outputFilename,
      downloadUrl: `/api/render/download/${outputFilename}`,
      fileSize: size,
      aspectRatio: '9:16',
      resolution: '720x1280 (Portrait)'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/models', (req, res) => {
  res.json({
    success: true,
    models: [
      {
        id: 'seedance-1-pro-fast',
        name: 'Seedance 1.5 Pro',
        provider: 'ByteDance (Open-Source Weights)',
        description: 'MiaDance flagship model: fluid motion control with natural physics.',
        resolutions: ['720p', '1080p'],
        tag: 'FLAGSHIP'
      },
      {
        id: 'wan-2.1-fast',
        name: 'Wan 2.1 Fast',
        provider: 'Alibaba (Open-Source Weights)',
        description: 'Cinematic visual rendering with high dynamic camera movement.',
        resolutions: ['720p', '480p'],
        tag: 'FAST'
      },
      {
        id: 'cogvideox-5b',
        name: 'CogVideoX 5B',
        provider: 'THUDM / Zhipu AI',
        description: 'Diffusion transformer architecture for detailed spatial coherence.',
        resolutions: ['720p'],
        tag: 'RESEARCH'
      },
      {
        id: 'modelscope-t2v',
        name: 'ModelScope T2V',
        provider: 'Damo Academy',
        description: 'Classic open diffusion text-to-video baseline model.',
        resolutions: ['720p'],
        tag: 'OPEN-SOURCE'
      }
    ]
  });
});

router.post('/generate-scene-video', async (req, res) => {
  try {
    const { scenePrompt, sceneIndex, model, aspectRatio, duration, imageLocalPath, topic } = req.body;
    const { videoJobService } = await import('../services/video/VideoJobService.js');
    const provider = await videoJobService.getActiveProvider();
    
    const sceneIdx = Number(sceneIndex) || 0;
    const clip = await provider.generateSceneVideo({
      sceneId: sceneIdx + 1,
      visualPrompt: scenePrompt || 'cinematic motion, high quality',
      duration: Number(duration) || 5,
      cameraMovement: 'slow push-in',
      aspectRatio: aspectRatio || '9:16'
    });

    if (clip && clip.videoUrl) {
      return res.json({
        success: true,
        clip: {
          sceneIndex: sceneIdx,
          videoUrl: clip.videoUrl,
          duration: clip.duration,
          provider: clip.provider,
          demoMode: clip.demoMode || false
        }
      });
    }
    return res.status(500).json({ success: false, error: 'Could not generate scene video clip' });
  } catch (err) {
    console.error('[RenderRoute] Scene video error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/generate-all-scene-videos', async (req, res) => {
  try {
    const { projectId, project: incomingProject, model, aspectRatio } = req.body;
    const { projectStore } = await import('../services/projectStore.js');
    const { videoJobService } = await import('../services/video/VideoJobService.js');

    let project = incomingProject;
    if (!project && projectId) {
      project = await projectStore.getProject(projectId);
    }

    if (!project || !Array.isArray(project.scenes)) {
      return res.status(400).json({ success: false, error: 'Valid project with scenes required' });
    }

    const provider = await videoJobService.getActiveProvider();
    const updatedScenes = [];

    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      const clip = await provider.generateSceneVideo({
        sceneId: i + 1,
        visualPrompt: scene.visualPrompt || scene.narration || scene.onScreenText || 'Cinematic visual sequence',
        duration: scene.duration || 5,
        cameraMovement: scene.cameraMovement || 'slow push-in',
        aspectRatio: aspectRatio || project.aspectRatio || '9:16'
      });

      updatedScenes.push({
        ...scene,
        videoUrl: clip.videoUrl,
        videoGenerated: true,
        clipProvider: clip.provider,
        demoMode: clip.demoMode || false,
        status: 'Completed ✓'
      });
    }

    const updatedProject = {
      ...project,
      scenes: updatedScenes,
      videoGenerated: true
    };

    if (updatedProject.id) {
      await projectStore.saveProject(updatedProject);
    }

    res.json({ success: true, project: updatedProject });
  } catch (err) {
    console.error('[RenderRoute] Generate all scene videos error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/video-clip/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const primaryPath = path.join(CONFIG.STORAGE.VIDEOS_DIR, safeFilename);
  if (fs.existsSync(primaryPath)) {
    res.setHeader('Content-Type', 'video/mp4');
    return res.sendFile(primaryPath);
  }
  const filePath = path.join(CONFIG.STORAGE.CACHE_DIR, 'videos', safeFilename);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'video/mp4');
    return res.sendFile(filePath);
  }
  res.status(404).send('Clip not found');
});

router.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const safeFilename = path.basename(filename);
  const filePath = path.join(CONFIG.STORAGE.EXPORTS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    // If exact filename doesn't exist, try returning the newest mp4 export in the directory
    const files = fs.readdirSync(CONFIG.STORAGE.EXPORTS_DIR).filter(f => f.endsWith('.mp4'));
    if (files.length > 0) {
      const newest = path.join(CONFIG.STORAGE.EXPORTS_DIR, files[files.length - 1]);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${files[files.length - 1]}"`);
      return res.sendFile(newest);
    }
    return res.status(404).send('Exported MP4 video not found');
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.sendFile(filePath);
});

export default router;

