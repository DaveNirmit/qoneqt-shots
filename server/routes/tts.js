import express from 'express';
import path from 'path';
import fs from 'fs';
import { ttsService } from '../services/ttsService.js';
import { CONFIG } from '../config.js';

const router = express.Router();

router.get('/voices', async (req, res) => {
  try {
    const voices = await ttsService.getAvailableVoices();
    res.json({ voices });
  } catch (err) {
    res.status(500).json({ error: err.message, voices: [] });
  }
});

router.post('/synthesize', async (req, res) => {
  const { text, voice } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required for TTS synthesis' });
  }

  try {
    const result = await ttsService.generateSpeechWav(text, voice);
    if (!result) {
      return res.status(400).json({
        success: false,
        error: 'Voice synthesis returned no audio or voice is set to none'
      });
    }
    res.json({ success: true, audio: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  // Security: prevent directory traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(CONFIG.STORAGE.CACHE_DIR, 'audio', safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Audio file not found');
  }

  res.setHeader('Content-Type', 'audio/wav');
  res.sendFile(filePath);
});

export default router;
