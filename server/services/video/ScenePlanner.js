import { VisualPromptEngine } from './VisualPromptEngine.js';
import { CameraMovements } from './types.js';

/**
 * Scene Planner
 * Converts an AI Director script or story outline into 4-6 timed production scenes
 * with prompt enrichment, camera motion, negative prompts, and transitions.
 */
export class ScenePlanner {
  /**
   * Plans scenes from script data
   * @param {Object} scriptData - Script with title, concept, hook, raw scenes
   * @param {Object} options - { style, aspectRatio, targetDuration }
   * @returns {Array<Object>} Planned scenes
   */
  static planScenes(scriptData, options = {}) {
    const rawScenes = Array.isArray(scriptData?.scenes) && scriptData.scenes.length > 0
      ? scriptData.scenes
      : this.getDefaultStoryOutline(scriptData?.topic || scriptData?.title || 'Local AI Innovation');

    const style = options.style || scriptData?.style || 'Cinematic';
    const topic = scriptData?.title || scriptData?.topic || 'Tech Innovation';

    const plannedScenes = rawScenes.map((raw, idx) => {
      const sceneId = raw.id || raw.sceneId || `scene_${idx + 1}`;
      const sceneNumber = idx + 1;
      const duration = Math.max(3, Math.min(10, Number(raw.duration) || 5));
      const narration = (raw.narration || '').trim();
      const onScreenText = (raw.onScreenText || raw.text || raw.title || `SCENE 0${sceneNumber}`).trim();

      const cameraMovement = raw.cameraMovement || CameraMovements[idx % CameraMovements.length];
      const visualStyle = raw.visualStyle || style;
      const transition = raw.transition || (idx === 0 ? 'fade-in' : 'cut');

      // Generate optimized visual prompts using VisualPromptEngine
      const { visualPrompt, negativePrompt, camera } = VisualPromptEngine.buildPrompt({
        subject: raw.visualDescription || raw.subject || narration,
        narration,
        visualDescription: raw.visualDescription,
        style: visualStyle,
        cameraMovement,
        sceneIndex: idx,
        topic
      });

      return {
        sceneId,
        sceneNumber,
        timing: this.formatTiming(idx, duration),
        duration,
        narration,
        onScreenText,
        visualPrompt,
        negativePrompt,
        cameraMovement: camera,
        visualStyle,
        transition,
        status: 'PENDING',
        progress: 0,
        videoUrl: null,
        localPath: null,
        imageUrl: raw.imageUrl || `/api/visuals/image/scene_ai_datacenter.jpg`,
        imageLocalPath: raw.imageLocalPath || null,
        visualDescription: raw.visualDescription || '',
        motionPrompt: raw.motionPrompt || ''
      };
    });

    return plannedScenes;
  }

  static formatTiming(index, duration) {
    const start = index * 5;
    const end = start + duration;
    return `${start}-${end}s`;
  }

  static getDefaultStoryOutline(topic) {
    return [
      {
        sceneId: 'scene_1',
        duration: 4,
        narration: `Stop scrolling. A major breakthrough just dropped in ${topic}.`,
        onScreenText: `THE BREAKTHROUGH IN\n${topic.toUpperCase()}`,
        visualDescription: 'Kinetic futuristic interface glowing with neon purple data streams',
        cameraMovement: 'slow push-in',
        transition: 'fade-in'
      },
      {
        sceneId: 'scene_2',
        duration: 6,
        narration: `Legacy systems are slow and overpriced, but modern architectures change everything.`,
        onScreenText: 'LEGACY STACKS: TOO SLOW\nNEW ERA: REAL-TIME',
        visualDescription: 'High-speed server hardware with pulsing fiber optics and cool blue light',
        cameraMovement: 'low-angle pan',
        transition: 'cut'
      },
      {
        sceneId: 'scene_3',
        duration: 6,
        narration: `Builders utilizing local and open-source models gain 10x leverage and full control.`,
        onScreenText: '10X LEVERAGE\nZERO CLOUD LOCK-IN',
        visualDescription: 'Developer workstation with interactive 3D code visualization and neon accents',
        cameraMovement: 'tracking shot',
        transition: 'cut'
      },
      {
        sceneId: 'scene_4',
        duration: 5,
        narration: `Are you ready for the next wave? Follow for more daily AI insights.`,
        onScreenText: 'ARE YOU READY?\nFOLLOW FOR MORE',
        visualDescription: 'Cinematic broadcast microphone and digital waveform glow in dark modern studio',
        cameraMovement: 'slow zoom-out',
        transition: 'dissolve'
      }
    ];
  }
}
