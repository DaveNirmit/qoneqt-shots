import express from 'express';
import { ollamaService } from '../services/ollamaService.js';
import { CONFIG } from '../config.js';

const router = express.Router();

router.get('/status', async (req, res) => {
  const status = await ollamaService.checkStatus();
  let defaultModelInstalled = false;
  if (status.online && status.models) {
    defaultModelInstalled = status.models.some(m => m.name.startsWith(CONFIG.DEFAULT_MODEL));
  }
  res.json({
    online: status.online,
    error: status.error,
    models: status.models || [],
    defaultModel: CONFIG.DEFAULT_MODEL,
    defaultModelInstalled,
    supportedModels: CONFIG.SUPPORTED_MODELS
  });
});

router.post('/start-runtime', async (req, res) => {
  try {
    const check = await ollamaService.checkStatus();
    if (check.online) {
      return res.json({ success: true, message: 'Ollama is already running' });
    }
    await ollamaService.startDaemon();
    // Wait for it to become responsive
    let online = false;
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await ollamaService.checkStatus();
      if (status.online) {
        online = true;
        break;
      }
    }
    if (online) {
      res.json({ success: true, message: 'Ollama daemon started successfully' });
    } else {
      res.status(503).json({
        success: false,
        error: 'Ollama command was invoked, but daemon did not respond on 127.0.0.1:11434. Please ensure Ollama is installed and run "ollama serve" manually.'
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SSE endpoint for streaming download progress
router.get('/pull-stream', async (req, res) => {
  const model = req.query.model || CONFIG.DEFAULT_MODEL;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent({ status: 'Starting pull', model, percent: 0 });

    await ollamaService.pullModel(model, (chunk) => {
      let percent = 0;
      if (chunk.total && chunk.completed) {
        percent = Math.floor((chunk.completed / chunk.total) * 100);
      }
      sendEvent({
        status: chunk.status,
        completed: chunk.completed,
        total: chunk.total,
        percent,
        model
      });
    });

    sendEvent({ status: 'success', percent: 100, completed: true, model });
    res.end();
  } catch (err) {
    sendEvent({ status: 'error', error: err.message, model });
    res.end();
  }
});

router.post('/verify-model', async (req, res) => {
  const model = req.body.model || CONFIG.DEFAULT_MODEL;
  try {
    const result = await ollamaService.verifyModel(model);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
