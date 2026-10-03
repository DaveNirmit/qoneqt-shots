import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';

// Route imports
import doctorRouter from './routes/doctor.js';
import setupRouter from './routes/setup.js';
import modelRouter from './routes/model.js';
import trendsRouter from './routes/trends.js';
import projectsRouter from './routes/projects.js';
import ttsRouter from './routes/tts.js';
import renderRouter from './routes/render.js';
import visualsRouter from './routes/visuals.js';
import videoRouter from './routes/video.js';
import shotsRouter from './routes/shots.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Ensure local data storage directories exist
for (const dir of Object.values(CONFIG.STORAGE)) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Security: CORS restricted to local origin
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    `http://localhost:${CONFIG.PORT}`,
    `http://127.0.0.1:${CONFIG.PORT}`
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// Body parsers with generous limits for local project data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount API routes
app.use('/api/doctor', doctorRouter);
app.use('/api/setup', setupRouter);
app.use('/api/model', modelRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/render', renderRouter);
app.use('/api/visuals', visualsRouter);
app.use('/api/video', videoRouter);
app.use('/api/shots', shotsRouter);

// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Qoneqt Shots',
    version: '1.0.0',
    mode: 'local-first',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend build in production mode if dist exists
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    // If request starts with /api, pass to 404 or next
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Bind strictly to 127.0.0.1 (Localhost only)
const server = app.listen(CONFIG.PORT, CONFIG.HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 QONEQT SHOTS STUDIO BACKEND`);
  console.log(`📡 Local API listening on: http://${CONFIG.HOST}:${CONFIG.PORT}`);
  console.log(`🔒 Bound strictly to localhost for privacy and security`);
  console.log(`🧠 Local AI Engine: Ollama (${CONFIG.DEFAULT_MODEL})`);
  console.log(`=======================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${CONFIG.PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
});

export default app;
