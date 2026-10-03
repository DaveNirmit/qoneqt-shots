import { VisualStyles, CameraMovements } from './types.js';

/**
 * Visual Prompt Engine
 * Enriches scene descriptions into high-quality video generation prompts
 * containing: Subject, Environment, Lighting, Camera, Motion, Composition, Style, and Mood.
 */
export class VisualPromptEngine {
  /**
   * Generates an optimized positive and negative prompt for Wan video models
   * @param {Object} sceneConfig
   * @param {string} sceneConfig.subject - Core subject of the scene
   * @param {string} sceneConfig.narration - Spoken narration or context
   * @param {string} sceneConfig.visualDescription - Base visual idea
   * @param {string} [sceneConfig.style] - Style key (Cinematic, Realistic, etc.)
   * @param {string} [sceneConfig.cameraMovement] - Camera motion specification
   * @param {string} [sceneConfig.topic] - Overall project topic
   * @returns {{ visualPrompt: string, negativePrompt: string, camera: string }}
   */
  static buildPrompt(sceneConfig = {}) {
    const styleKey = sceneConfig.style || 'Cinematic';
    const styleDef = VisualStyles[styleKey] || VisualStyles.Cinematic;
    const camera = sceneConfig.cameraMovement || this.pickCameraMovement(sceneConfig.sceneIndex || 0);

    const baseIdea = sceneConfig.visualDescription || sceneConfig.narration || sceneConfig.topic || 'futuristic technology breakthrough';

    // Extract or enhance subject
    const subject = this.cleanSubject(baseIdea);

    // Environment & lighting enhancements based on tech / topic context
    const lighting = this.selectLighting(sceneConfig.sceneIndex || 0);
    const motion = this.selectMotion(sceneConfig.sceneIndex || 0);

    // Synthesize structured prompt
    const visualPrompt = [
      subject,
      `set in a high-tech modern environment`,
      `${lighting} lighting`,
      `${camera}`,
      `${motion}`,
      `wide 8k composition`,
      styleDef.promptSuffix
    ].filter(Boolean).join(', ');

    return {
      visualPrompt,
      negativePrompt: styleDef.negativePrompt,
      camera
    };
  }

  static cleanSubject(text) {
    return text
      .replace(/^"(.*)"$/, '$1')
      .replace(/[\r\n]+/g, ' ')
      .replace(/Are you ready\?|Follow for more/gi, '')
      .trim();
  }

  static pickCameraMovement(index) {
    return CameraMovements[index % CameraMovements.length];
  }

  static selectLighting(index) {
    const lightings = [
      'dramatic volumetric neon glow with deep shadows',
      'cool cinematic cyber blue and amber rim lights',
      'high-contrast dramatic studio lighting with subtle back glow',
      'diffused soft natural directional window light',
      'crisp electric violet and neon pink backlight'
    ];
    return lightings[index % lightings.length];
  }

  static selectMotion(index) {
    const motions = [
      'subtle kinetic elements floating smoothly in foreground',
      'ambient motion blur with steady focused subject',
      'smooth physical motion with realistic dynamic momentum',
      'gentle atmospheric particles drifting through beam of light'
    ];
    return motions[index % motions.length];
  }
}
