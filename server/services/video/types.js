/**
 * Qoneqt AI Content Pipeline - Video Generation Types & Constants
 * Reference: lilinsong1/comfyui-wan-video-pipeline & Comfy-Org workflow templates
 */

export const JobStatus = {
  QUEUED: 'QUEUED',
  ANALYZING: 'ANALYZING',
  SCRIPT_GENERATING: 'SCRIPT_GENERATING',
  SCENE_PLANNING: 'SCENE_PLANNING',
  AUDIO_SYNTHESIS: 'AUDIO_SYNTHESIS',
  VISUAL_GENERATION: 'VISUAL_GENERATION',
  POST_PROCESSING: 'POST_PROCESSING',
  QUALITY_CHECK: 'QUALITY_CHECK',
  READY: 'READY',
  FAILED: 'FAILED'
};

export const SceneStatus = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  GENERATING: 'GENERATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

export const CameraMovements = [
  'slow push-in',
  'slow zoom-out',
  'low-angle pan',
  'tracking shot',
  'dynamic orbit',
  'aerial tilt down',
  'high-angle establishing shot'
];

export const AspectRatios = {
  '9:16': { width: 512, height: 896, name: 'Portrait (Reel / Shorts)', fps: 16 },
  '16:9': { width: 896, height: 512, name: 'Landscape (Desktop / Widescreen)', fps: 16 },
  '1:1': { width: 640, height: 640, name: 'Square (Feed)', fps: 16 },
  '4:5': { width: 576, height: 720, name: 'Vertical Feed', fps: 16 }
};

export const VisualStyles = {
  Cinematic: {
    promptSuffix: 'cinematic lighting, 35mm film still, photorealistic, volumetric atmosphere, 8k resolution, award-winning cinematography',
    negativePrompt: 'cartoon, low quality, blurry, distorted, watermark, oversaturated, amateur footage, glitch'
  },
  Realistic: {
    promptSuffix: 'ultra-realistic documentary footage, natural lighting, high dynamic range, sharp focus, clean digital camera shot',
    negativePrompt: 'cgi, animated, illustration, saturated, noisy, deformed, text, lowres'
  },
  '3D Render': {
    promptSuffix: 'octane render, unreal engine 5, raytracing, subsurface scattering, ambient occlusion, futuristic technology art',
    negativePrompt: 'flat, sketch, 2d, blurry, pixelated, washed out, low polygon'
  },
  Anime: {
    promptSuffix: 'makoto shinkai aesthetic, vibrant anime art, beautiful lighting, detailed background, key animation still',
    negativePrompt: 'photorealistic, live action, 3d render, noisy, low resolution, Western comic'
  },
  Minimal: {
    promptSuffix: 'minimalist visual design, elegant studio composition, soft shadow, clean background, modern Scandinavian aesthetic',
    negativePrompt: 'cluttered, chaotic, noisy, high saturation, messy, text, watermark'
  },
  Documentary: {
    promptSuffix: 'BBC tech documentary cinematography, authentic environment, high end broadcast production, cinematic color grade',
    negativePrompt: 'fantasy, cartoon, artificial, exaggerated, fake, blurry'
  }
};
