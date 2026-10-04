import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load secrets (e.g. GEMINI_API_KEY) from the project's .env file, if present.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try { process.loadEnvFile(envPath); } catch (err) { console.warn('[Config] Could not read .env:', err.message); }
}

export const CONFIG = {
  PORT: process.env.PORT || 3001,
  HOST: '127.0.0.1', // strictly localhost for privacy and security
  OLLAMA_HOST: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  DEFAULT_MODEL: 'qwen2.5:1.5b',
  GEMINI: {
    API_KEY: process.env.GEMINI_API_KEY || '',
    TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview',
    // Tried in order when the main text model is busy or unreachable.
    TEXT_FALLBACKS: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.8-flash'],
    IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
    VIDEO_MODEL: process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview',
    VIDEO_ENABLED: process.env.GEMINI_VIDEO !== 'off'
  },
  // Optional free account token from auth.pollinations.ai: faster image generation without the watermark.
  POLLINATIONS_TOKEN: process.env.POLLINATIONS_TOKEN || '',
  SUPPORTED_MODELS: [
    {
      id: 'qwen2.5:1.5b',
      name: 'Qwen 2.5 1.5B (Verified Default)',
      size: '~986 MB',
      license: 'Apache 2.0',
      description: 'Ultra-fast, high accuracy script generation with native JSON support'
    },
    {
      id: 'qwen2.5:3b',
      name: 'Qwen 2.5 3B (Extended Depth)',
      size: '~1.9 GB',
      license: 'Apache 2.0',
      description: 'Richer vocabulary and complex multi-scene story structure'
    },
    {
      id: 'llama3.2:3b',
      name: 'Llama 3.2 3B',
      size: '~2.0 GB',
      license: 'Llama 3.2 Community License',
      description: 'Concise short-form storytelling optimized for reels & shorts'
    }
  ],
  COMFYUI_BASE_URL: process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188',
  COMFYUI_ENABLED: process.env.COMFYUI_ENABLED !== 'false',
  COMFYUI_WORKFLOW_PATH: process.env.COMFYUI_WORKFLOW_PATH || path.join(__dirname, 'workflows', 'wan2.1_t2v.json'),
  DEMO_MODE: process.env.DEMO_MODE === 'true',
  STORAGE: {
    PROJECTS_DIR: path.join(__dirname, 'data', 'projects'),
    EXPORTS_DIR: path.join(__dirname, 'data', 'exports'),
    CACHE_DIR: path.join(__dirname, 'data', 'cache'),
    VIDEOS_DIR: path.join(__dirname, 'data', 'videos'),
    JOBS_DIR: path.join(__dirname, 'data', 'jobs')
  },
  TREND_SOURCES: [
    {
      id: 'hackernews',
      name: 'Hacker News (Algolia API)',
      type: 'free_api',
      url: 'https://hn.algolia.com/api/v1/search?tags=front_page',
      status: 'active',
      badge: 'Tech & Dev'
    },
    {
      id: 'gdelt',
      name: 'GDELT Global News Feed',
      type: 'free_api',
      url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=sourcecountry:US&mode=artlist&format=json&maxrecords=25',
      status: 'active',
      badge: 'World News'
    },
    {
      id: 'bbc_tech',
      name: 'BBC News Technology RSS',
      type: 'rss',
      url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
      status: 'active',
      badge: 'Broadcasting'
    },
    {
      id: 'reddit',
      name: 'Reddit Trending',
      type: 'credential_required',
      status: 'requires_credentials',
      note: 'Official Reddit OAuth API requires developer credentials. Not required for Qoneqt Shots.'
    },
    {
      id: 'x_twitter',
      name: 'X (Twitter) Trends',
      type: 'credential_required',
      status: 'requires_credentials',
      note: 'X API v2 requires paid subscription and API keys. Not required for Qoneqt Shots.'
    }
  ]
};
