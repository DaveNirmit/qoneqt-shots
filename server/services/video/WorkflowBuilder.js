import { AspectRatios } from './types.js';

/**
 * WorkflowBuilder
 * Constructs official ComfyUI Wan2.1 Text-to-Video and Image-to-Video workflows
 * Reference: Comfy-Org/workflow_templates & lilinsong1/comfyui-wan-video-pipeline
 */
export class WorkflowBuilder {
  /**
   * Builds Wan2.1 Text-to-Video workflow payload for ComfyUI API
   * @param {Object} params
   * @param {string} params.prompt - Positive visual prompt
   * @param {string} params.negativePrompt - Negative quality prompt
   * @param {string} [params.aspectRatio='9:16'] - 9:16 | 16:9 | 1:1 | 4:5
   * @param {number} [params.duration=5] - Duration in seconds
   * @param {number} [params.seed] - Deterministic or random seed
   * @param {string} [params.filenamePrefix='qoneqt_wan'] - Output filename prefix
   * @returns {Object} ComfyUI API workflow object
   */
  static buildWanT2VWorkflow({
    prompt,
    negativePrompt = 'blurry, low quality, artifacts, watermark, distorted, static, deformed, oversaturated',
    aspectRatio = '9:16',
    duration = 5,
    seed = Math.floor(Math.random() * 1000000000),
    filenamePrefix = 'qoneqt_wan'
  }) {
    const dim = AspectRatios[aspectRatio] || AspectRatios['9:16'];
    const fps = dim.fps || 16;
    // Wan models typically generate length in increments of 4 (e.g. 49 or 81 frames)
    const frameCount = Math.max(33, Math.min(81, Math.round(duration * fps)));

    return {
      // 1. Model Loader (Wan2.1 1.3B / 14B)
      "1": {
        "inputs": {
          "model_name": "wan2.1_t2v_1.3B.safetensors"
        },
        "class_type": "WanVideoModelLoader",
        "_meta": { "title": "Load Wan2.1 T2V Model" }
      },
      // 2. VAE Loader
      "2": {
        "inputs": {
          "vae_name": "wan_2.1_vae.safetensors"
        },
        "class_type": "WanVAELoader",
        "_meta": { "title": "Load Wan2.1 VAE" }
      },
      // 3. Positive Prompt (Wan Text Encode)
      "3": {
        "inputs": {
          "text": prompt,
          "clip": ["1", 1]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "Positive Visual Prompt" }
      },
      // 4. Negative Prompt
      "4": {
        "inputs": {
          "text": negativePrompt,
          "clip": ["1", 1]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "Negative Prompt" }
      },
      // 5. Empty Wan Video Latent
      "5": {
        "inputs": {
          "width": dim.width,
          "height": dim.height,
          "length": frameCount,
          "batch_size": 1
        },
        "class_type": "EmptyWanVideoLatent",
        "_meta": { "title": "Empty Wan Video Latent" }
      },
      // 6. Sampler (Wan Video KSampler)
      "6": {
        "inputs": {
          "seed": seed,
          "steps": 25,
          "cfg": 6.0,
          "sampler_name": "uni_pc",
          "scheduler": "simple",
          "denoise": 1.0,
          "model": ["1", 0],
          "positive": ["3", 0],
          "negative": ["4", 0],
          "latent_image": ["5", 0]
        },
        "class_type": "KSampler",
        "_meta": { "title": "Wan Video KSampler" }
      },
      // 7. VAE Decode
      "7": {
        "inputs": {
          "samples": ["6", 0],
          "vae": ["2", 0]
        },
        "class_type": "VAEDecode",
        "_meta": { "title": "VAE Decode Latents to Frames" }
      },
      // 8. Video Combine / Export H.264 MP4
      "8": {
        "inputs": {
          "images": ["7", 0],
          "frame_rate": fps,
          "loop_count": 0,
          "filename_prefix": filenamePrefix,
          "format": "video/h264-mp4",
          "pix_fmt": "yuv420p",
          "crf": 20,
          "save_output": true
        },
        "class_type": "VHS_VideoCombine",
        "_meta": { "title": "Compile H.264 Scene MP4" }
      }
    };
  }

  /**
   * Builds Wan2.1 Image-to-Video (I2V) workflow for scene-to-scene consistency (Section 14)
   */
  static buildWanI2VWorkflow({
    imageFilename,
    prompt,
    negativePrompt = 'blurry, low quality, artifacts, watermark, distorted, static, deformed, oversaturated',
    aspectRatio = '9:16',
    duration = 5,
    seed = Math.floor(Math.random() * 1000000000),
    filenamePrefix = 'qoneqt_wan_i2v'
  }) {
    const baseT2V = this.buildWanT2VWorkflow({
      prompt,
      negativePrompt,
      aspectRatio,
      duration,
      seed,
      filenamePrefix
    });

    // Replace EmptyWanVideoLatent with LoadImage + WanI2VConditioning
    return {
      ...baseT2V,
      "9": {
        "inputs": {
          "image": imageFilename,
          "upload": "image"
        },
        "class_type": "LoadImage",
        "_meta": { "title": "Reference Image Conditioning" }
      }
    };
  }
}
