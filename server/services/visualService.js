import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Broad fallback photos categorized by domain
const CURATED_CATEGORY_IMAGES = {
  ai_tech: [
    'scene_ai_datacenter.jpg',
    'scene_ai_laptop.jpg',
    'scene_ai_robotics.jpg',
    'scene_ai_servers.jpg'
  ],
  creator_media: [
    'scene_creator_phone.jpg',
    'scene_creator_mic.jpg',
    'scene_creator_condenser.jpg',
    'scene_creator_phone.jpg'
  ],
  business_finance: [
    'scene_ai_servers.jpg',
    'scene_ai_datacenter.jpg',
    'scene_ai_laptop.jpg'
  ],
  general: [
    'scene_ai_datacenter.jpg',
    'scene_creator_phone.jpg',
    'scene_ai_laptop.jpg',
    'scene_ai_robotics.jpg'
  ]
};

const STOP_WORDS = new Set([
  'the', 'and', 'this', 'that', 'with', 'from', 'what', 'your', 'have', 'more',
  'about', 'video', 'could', 'would', 'should', 'here', 'when', 'will', 'are',
  'was', 'were', 'been', 'being', 'they', 'their', 'them', 'just', 'like', 'than',
  'some', 'very', 'into', 'over', 'after', 'scene', 'visual', 'shot', 'clip',
  'cinematic', 'prompt', 'high', 'quality', 'look', 'make', 'which', 'there',
  'stopping', 'scroll', 'scrolling', 'follow', 'insights', 'daily'
]);

class VisualService {
  constructor() {
    this.imagesDir = path.join(CONFIG.STORAGE.CACHE_DIR, 'images');
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
  }

  /**
   * Extracts meaningful semantic keywords from topic and scene description
   */
  extractKeywords(sceneText = '', topic = '') {
    const raw = `${topic} ${sceneText}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ');

    const tokens = raw
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    // Return the top 3-4 distinct meaningful words
    const unique = Array.from(new Set(tokens));
    if (unique.length === 0) return 'modern technology';
    return unique.slice(0, 4).join(' ');
  }

  /**
   * Search Wikimedia Commons for real, high-resolution topical photos
   */
  async searchWikimediaImages(query, limit = 8) {
    try {
      const q = encodeURIComponent(query.trim());
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|mime|size&format=json`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(url, {
        headers: { 'User-Agent': 'QoneqtForgeVideoStudio/2.0 (https://qoneqt.org; contact@qoneqt.org)' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {});
      
      const hits = pages
        .filter(p => {
          const info = p.imageinfo?.[0];
          const mime = info?.mime || '';
          return (mime === 'image/jpeg' || mime === 'image/png') && (!info.size || info.size > 20000);
        })
        .map(p => p.imageinfo[0].url);

      return hits;
    } catch (e) {
      return [];
    }
  }

  /**
   * Download and cache an image URL locally
   */
  async fetchAndCacheImage(imageUrl, filename) {
    const destPath = path.join(this.imagesDir, filename);
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 2000) {
      return destPath;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(imageUrl, {
        headers: { 'User-Agent': 'QoneqtForgeVideoStudio/2.0 (https://qoneqt.org; contact@qoneqt.org)' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 2000) return null;
      fs.writeFileSync(destPath, Buffer.from(buffer));
      return destPath;
    } catch (e) {
      return null;
    }
  }

  /**
   * Free AI Image Generation via Pollinations
   */
  async generateAIVisual(promptText, filename) {
    const destPath = path.join(this.imagesDir, filename);
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 4000) {
      return destPath;
    }

    try {
      const cleanPrompt = promptText
        .replace(/[^a-zA-Z0-9\s,.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);

      const enhancedPrompt = `${cleanPrompt}, cinematic lighting, 8k, award winning photo`;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?nologo=true`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 4000) return null;

      fs.writeFileSync(destPath, Buffer.from(buffer));
      return destPath;
    } catch (e) {
      return null;
    }
  }

  /**
   * Main visual retriever with full topic relevance and regeneration support
   */
  async getSceneVisual(sceneText = '', topic = '', sceneIdx = 0, options = {}) {
    const { forceRegenerate = false, variation = 0 } = options;
    const keywords = this.extractKeywords(sceneText, topic);

    // Compute stable or randomized seed
    const randomVariation = forceRegenerate
      ? Math.floor(Math.random() * 999999)
      : variation;

    const hash = Math.abs(
      (keywords + sceneIdx).split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    );

    const safeKeywordSlug = keywords.replace(/\s+/g, '_').slice(0, 24);
    const aiFilename = `img_${safeKeywordSlug}_s${sceneIdx + 1}_${hash % 9999}_v${randomVariation}.jpg`;
    const aiLocalPath = path.join(this.imagesDir, aiFilename);

    // 1. Return cached if not forcing regeneration
    if (!forceRegenerate && fs.existsSync(aiLocalPath) && fs.statSync(aiLocalPath).size > 4000) {
      return {
        filename: aiFilename,
        localPath: aiLocalPath,
        url: `/api/visuals/image/${aiFilename}?t=${Date.now()}`,
        keywords
      };
    }

    // 2. Try Pollinations AI with the clean topic prompt
    const promptInput = `${keywords}, dramatic cinematic photography`;
    const aiGeneratedPath = await this.generateAIVisual(promptInput, aiFilename);
    if (aiGeneratedPath) {
      return {
        filename: aiFilename,
        localPath: aiGeneratedPath,
        url: `/api/visuals/image/${aiFilename}?t=${Date.now()}`,
        keywords
      };
    }

    // 3. Search Wikimedia Commons for real photos matching the EXACT keywords
    const searchHits = await this.searchWikimediaImages(keywords, 10);
    if (searchHits.length > 0) {
      const selectedIndex = (sceneIdx + randomVariation) % searchHits.length;
      const remoteUrl = searchHits[selectedIndex];
      const targetFilename = `wiki_${safeKeywordSlug}_s${sceneIdx + 1}_v${randomVariation}.jpg`;
      const saved = await this.fetchAndCacheImage(remoteUrl, targetFilename);
      if (saved) {
        return {
          filename: targetFilename,
          localPath: saved,
          url: `/api/visuals/image/${targetFilename}?t=${Date.now()}`,
          keywords
        };
      }
    }

    // 4. Broader topic search if specific scene search was empty
    const topicOnly = this.extractKeywords('', topic);
    if (topicOnly !== keywords) {
      const broadHits = await this.searchWikimediaImages(topicOnly, 8);
      if (broadHits.length > 0) {
        const selectedIndex = (sceneIdx + randomVariation) % broadHits.length;
        const remoteUrl = broadHits[selectedIndex];
        const targetFilename = `wiki_${safeKeywordSlug}_broad_s${sceneIdx + 1}_v${randomVariation}.jpg`;
        const saved = await this.fetchAndCacheImage(remoteUrl, targetFilename);
        if (saved) {
          return {
            filename: targetFilename,
            localPath: saved,
            url: `/api/visuals/image/${targetFilename}?t=${Date.now()}`,
            keywords: topicOnly
          };
        }
      }
    }

    // 5. Fallback to distinct local images
    const fallbackList = CURATED_CATEGORY_IMAGES.general;
    const fallbackFilename = fallbackList[(sceneIdx + randomVariation) % fallbackList.length];
    const fallbackPath = path.join(this.imagesDir, fallbackFilename);

    return {
      filename: fallbackFilename,
      localPath: fallbackPath,
      url: `/api/visuals/image/${fallbackFilename}?t=${Date.now()}`,
      keywords
    };
  }

  async populateProjectVisuals(project) {
    if (!project || !Array.isArray(project.scenes)) return project;

    const topic = project.title || project.concept || 'technology';
    const updatedScenes = await Promise.all(
      project.scenes.map(async (scene, idx) => {
        const visual = await this.getSceneVisual(
          scene.visualPrompt || scene.visualDescription || scene.onScreenText || scene.narration,
          topic,
          idx
        );
        return {
          ...scene,
          imageUrl: visual.url,
          imageLocalPath: visual.localPath
        };
      })
    );

    project.scenes = updatedScenes;
    return project;
  }
}

export const visualService = new VisualService();
