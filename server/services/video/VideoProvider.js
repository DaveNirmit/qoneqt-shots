/**
 * VideoProvider
 * Abstract base class for video generation backends.
 * Allows seamless switching between ComfyUIWanProvider, ComfyUILTXProvider, and DemoVideoProvider.
 */
export class VideoProvider {
  constructor(name = 'GenericVideoProvider') {
    this.name = name;
  }

  /**
   * Check if backend provider is available and healthy
   * @returns {Promise<{ available: boolean, status: string, details?: any }>}
   */
  async checkHealth() {
    throw new Error('Method checkHealth() must be implemented by subclass');
  }

  /**
   * Generate video clip for a single scene
   * @param {Object} sceneConfig - Scene parameters
   * @param {Object} options - Render options
   * @returns {Promise<{ success: boolean, videoUrl: string, localPath: string, duration: number }>}
   */
  async generateSceneVideo(sceneConfig, options = {}) {
    throw new Error('Method generateSceneVideo() must be implemented by subclass');
  }

  /**
   * Check the progress of a running generation job
   * @param {string} jobId
   * @returns {Promise<{ status: string, progress: number, outputUrl?: string }>}
   */
  async getJobStatus(jobId) {
    throw new Error('Method getJobStatus() must be implemented by subclass');
  }

  /**
   * Cancel a generation job
   * @param {string} jobId
   * @returns {Promise<boolean>}
   */
  async cancelJob(jobId) {
    return false;
  }
}
