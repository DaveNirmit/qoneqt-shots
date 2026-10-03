import fs from 'fs';
import path from 'path';
import { VideoProvider } from './VideoProvider.js';
import { CONFIG } from '../../config.js';

/**
 * ComfyUIProvider
 * Handles low-level HTTP communication with the ComfyUI API server
 * Reference: official ComfyUI API endpoints
 */
export class ComfyUIProvider extends VideoProvider {
  constructor(baseUrl = CONFIG.COMFYUI_BASE_URL) {
    super('ComfyUIProvider');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.clientId = 'qoneqt_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Check connection to ComfyUI server and get system stats
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${this.baseUrl}/system_stats`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return { available: false, status: 'error', error: `HTTP ${res.status}` };
      }

      const stats = await res.json();
      return {
        available: true,
        status: 'online',
        baseUrl: this.baseUrl,
        devices: stats.devices || [],
        system: stats.system || {}
      };
    } catch (err) {
      return {
        available: false,
        status: 'offline',
        baseUrl: this.baseUrl,
        error: err.name === 'AbortError' ? 'Connection timed out' : err.message
      };
    }
  }

  /**
   * Submit a workflow graph to ComfyUI
   * @param {Object} workflow - ComfyUI node graph
   * @returns {Promise<string>} prompt_id
   */
  async queuePrompt(workflow) {
    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        client_id: this.clientId
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to queue ComfyUI workflow: ${res.status} ${errText}`);
    }

    const data = await res.json();
    return data.prompt_id;
  }

  /**
   * Poll ComfyUI history until job completes or fails
   * @param {string} promptId
   * @param {Function} [onProgress]
   * @param {number} [timeoutMs=300000]
   */
  async pollPromptCompletion(promptId, onProgress = null, timeoutMs = 300000) {
    const startTime = Date.now();
    let pollInterval = 1500;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, pollInterval));

      try {
        const res = await fetch(`${this.baseUrl}/history/${promptId}`);
        if (!res.ok) continue;

        const history = await res.json();
        const promptData = history[promptId];

        if (promptData) {
          // Check for errors
          if (promptData.status?.status_str === 'error') {
            const errDetails = promptData.status?.messages || 'Unknown execution error in ComfyUI';
            throw new Error(`ComfyUI execution error: ${JSON.stringify(errDetails)}`);
          }

          // Check outputs
          if (promptData.outputs && Object.keys(promptData.outputs).length > 0) {
            return {
              completed: true,
              outputs: promptData.outputs,
              status: promptData.status
            };
          }
        }

        // Notify progress callback if still executing
        if (onProgress) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          onProgress({ promptId, elapsed, status: 'EXECUTING' });
        }
      } catch (pollErr) {
        if (pollErr.message.includes('ComfyUI execution error')) throw pollErr;
      }
    }

    throw new Error(`ComfyUI prompt ${promptId} timed out after ${timeoutMs / 1000}s`);
  }

  /**
   * Download rendered output from ComfyUI to local storage
   */
  async downloadOutputVideo(filename, subfolder = '', type = 'output', destPath) {
    const params = new URLSearchParams({ filename, subfolder, type });
    const url = `${this.baseUrl}/view?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ComfyUI output from ${url}: HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(destPath, buffer);
    return destPath;
  }
}
