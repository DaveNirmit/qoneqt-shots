import path from 'path';
import fs from 'fs';
import { ComfyUIProvider } from './ComfyUIProvider.js';
import { WorkflowBuilder } from './WorkflowBuilder.js';
import { CONFIG } from '../../config.js';

/**
 * ComfyUIWanProvider
 * Specialized provider executing the Wan2.1 end-to-end video pipeline on ComfyUI.
 * Reference: lilinsong1/comfyui-wan-video-pipeline
 */
export class ComfyUIWanProvider extends ComfyUIProvider {
  constructor(baseUrl = CONFIG.COMFYUI_BASE_URL) {
    super(baseUrl);
    this.name = 'ComfyUIWanProvider';
    this.videosDir = CONFIG.STORAGE.VIDEOS_DIR;

    if (!fs.existsSync(this.videosDir)) {
      fs.mkdirSync(this.videosDir, { recursive: true });
    }
  }

  /**
   * Generates a single video scene using the Wan2.1 pipeline
   * @param {Object} sceneConfig - Planned scene object
   * @param {Object} options - { aspectRatio, duration, referenceImage, onProgress }
   */
  async generateSceneVideo(sceneConfig, options = {}) {
    const sceneId = sceneConfig.sceneId || `scene_${Date.now()}`;
    const duration = sceneConfig.duration || 5;
    const aspectRatio = options.aspectRatio || '9:16';
    const onProgress = options.onProgress;

    console.log(`[WanProvider] Initiating scene generation: ${sceneId} (${duration}s, ${aspectRatio})`);

    // 1. Build Wan workflow payload
    const workflow = WorkflowBuilder.buildWanT2VWorkflow({
      prompt: sceneConfig.visualPrompt,
      negativePrompt: sceneConfig.negativePrompt,
      aspectRatio,
      duration,
      filenamePrefix: `qoneqt_${sceneId}`
    });

    // 2. Submit prompt to ComfyUI
    const promptId = await this.queuePrompt(workflow);
    console.log(`[WanProvider] Workflow submitted to ComfyUI, prompt_id: ${promptId}`);

    // 3. Poll for completion
    const result = await this.pollPromptCompletion(promptId, onProgress);

    // 4. Locate video output node in outputs
    const videoNodeOutput = this.findVideoOutput(result.outputs);
    if (!videoNodeOutput) {
      throw new Error(`ComfyUI executed prompt ${promptId} but no video output was returned`);
    }

    // 5. Download and store the generated scene MP4 locally
    const outputFilename = `scene_${sceneId}_${Date.now()}.mp4`;
    const localDestPath = path.join(this.videosDir, outputFilename);

    await this.downloadOutputVideo(
      videoNodeOutput.filename,
      videoNodeOutput.subfolder || '',
      videoNodeOutput.type || 'output',
      localDestPath
    );

    console.log(`[WanProvider] Scene ${sceneId} saved to ${localDestPath}`);

    return {
      success: true,
      sceneId,
      promptId,
      filename: outputFilename,
      localPath: localDestPath,
      videoUrl: `/api/video/clips/${outputFilename}`,
      duration,
      provider: this.name,
      aspectRatio
    };
  }

  findVideoOutput(outputs) {
    if (!outputs) return null;
    for (const nodeId of Object.keys(outputs)) {
      const nodeOut = outputs[nodeId];
      if (Array.isArray(nodeOut?.gifs) && nodeOut.gifs.length > 0) {
        return nodeOut.gifs[0];
      }
      if (Array.isArray(nodeOut?.videos) && nodeOut.videos.length > 0) {
        return nodeOut.videos[0];
      }
      if (Array.isArray(nodeOut?.images) && nodeOut.images.length > 0) {
        const first = nodeOut.images[0];
        if (first.filename?.endsWith('.mp4') || first.filename?.endsWith('.webm')) {
          return first;
        }
      }
    }
    return null;
  }
}
