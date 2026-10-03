import express from 'express';
import os from 'os';
import fs from 'fs';
import { ollamaService } from '../services/ollamaService.js';
import { ttsService } from '../services/ttsService.js';
import { videoRenderer } from '../services/videoRenderer.js';
import { CONFIG } from '../config.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // 1. System Info
    const platform = process.platform;
    const arch = process.arch;
    const nodeVersion = process.version;
    const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const freeMemoryGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);

    // Disk space
    let diskFreeGB = 'Unknown';
    try {
      const stats = fs.statfsSync(process.cwd());
      diskFreeGB = Math.round((stats.bavail * stats.bsize) / (1024 * 1024 * 1024));
    } catch (e) {}

    // 2. Ollama Status
    const ollamaStatus = await ollamaService.checkStatus();
    let defaultModelInstalled = false;
    let installedModels = [];
    if (ollamaStatus.online && ollamaStatus.models) {
      installedModels = ollamaStatus.models;
      defaultModelInstalled = installedModels.some(m => m.name.startsWith(CONFIG.DEFAULT_MODEL));
    }

    // 3. TTS Status
    const voices = await ttsService.getAvailableVoices();
    const hasLocalVoice = voices.some(v => v.id !== 'none');

    // 4. Video Rendering Status
    const ffmpegInfo = videoRenderer.getFFmpegInfo();

    // 5. Directories
    const directories = {
      projects: fs.existsSync(CONFIG.STORAGE.PROJECTS_DIR),
      exports: fs.existsSync(CONFIG.STORAGE.EXPORTS_DIR),
      cache: fs.existsSync(CONFIG.STORAGE.CACHE_DIR)
    };

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      system: {
        platform,
        arch,
        nodeVersion,
        totalMemoryGB,
        freeMemoryGB,
        diskFreeGB,
        targetNodeOk: parseInt(process.versions.node.split('.')[0], 10) >= 20
      },
      aiRuntime: {
        provider: 'Ollama',
        host: CONFIG.OLLAMA_HOST,
        online: ollamaStatus.online,
        error: ollamaStatus.error || null,
        defaultModel: CONFIG.DEFAULT_MODEL,
        defaultModelInstalled,
        installedModels,
        supportedModels: CONFIG.SUPPORTED_MODELS
      },
      speech: {
        hasLocalVoice,
        voicesCount: voices.length,
        voices
      },
      videoRenderer: ffmpegInfo,
      directories
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

export default router;
