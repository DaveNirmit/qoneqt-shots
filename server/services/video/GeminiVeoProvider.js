import fs from 'fs';
import path from 'path';
import { VideoProvider } from './VideoProvider.js';
import { CONFIG } from '../../config.js';
import { geminiService } from '../geminiService.js';
import { videoRenderer } from '../videoRenderer.js';

/**
 * GeminiVeoProvider
 * Animates each scene image with Veo, then burns in captions and narration with FFmpeg.
 * If Veo fails for a scene, that scene falls back to the local motion renderer.
 */
export class GeminiVeoProvider extends VideoProvider {
  constructor() {
    super('GeminiVeoProvider');
    this.videosDir = CONFIG.STORAGE.VIDEOS_DIR;
    fs.mkdirSync(this.videosDir, { recursive: true });
  }

  async checkHealth() {
    return { available: geminiService.canMakeVideo(), status: 'gemini', note: `Veo model: ${CONFIG.GEMINI.VIDEO_MODEL}` };
  }

  async generateSceneVideo(scene, options = {}) {
    const sceneNumber = scene.sceneNumber || 1;
    const onProgress = options.onProgress;
    let veoPath = null;
    let note = '';

    try {
      const prompt = [scene.motionPrompt, scene.visualDescription].filter(Boolean).join('. ')
        || scene.onScreenText || 'Slow cinematic push-in';
      veoPath = await geminiService.generateVideo(
        `${prompt}. Vertical 9:16 framing. No on-screen text.`,
        scene.imageLocalPath,
        (p) => onProgress?.({ progress: Math.round(p * 0.9), status: 'GENERATING' })
      );
    } catch (err) {
      note = `Veo failed (${err.message}); used local motion instead`;
      console.warn(`[GeminiVeoProvider] Scene ${sceneNumber}: ${note}`);
    }

    const clip = await videoRenderer.renderSceneClip(
      {
        narration: scene.narration,
        onScreenText: scene.onScreenText,
        imageLocalPath: scene.imageLocalPath,
        videoLocalPath: veoPath,
        visualDescription: scene.visualDescription,
        duration: scene.duration,
      },
      sceneNumber - 1,
      options.title || 'Qoneqt Shots',
      options.voice || 'en-US-ChristopherNeural'
    );

    const filename = `scene_${sceneNumber}_${Date.now()}.mp4`;
    const dest = path.join(this.videosDir, filename);
    fs.copyFileSync(clip, dest);
    try { fs.unlinkSync(clip); } catch (e) {}
    onProgress?.({ progress: 100, status: 'COMPLETED' });

    return {
      success: true,
      sceneId: scene.sceneId,
      filename,
      localPath: dest,
      videoUrl: `/api/video/clips/${filename}`,
      duration: scene.duration,
      provider: veoPath ? this.name : 'LocalMotion',
      note,
      demoMode: false,
    };
  }
}
