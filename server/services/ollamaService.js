import http from 'http';
import { spawn } from 'child_process';
import { CONFIG } from '../config.js';

class OllamaService {
  constructor() {
    let raw = String(CONFIG.OLLAMA_HOST || 'http://127.0.0.1:11434').trim();
    if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
    try { this.host = new URL(raw); } catch { this.host = new URL('http://127.0.0.1:11434'); }
    if (this.host.hostname === '0.0.0.0') this.host.hostname = '127.0.0.1';
    if (!this.host.port) this.host.port = '11434';
    this.baseUrl = `${this.host.protocol}//${this.host.hostname}:${this.host.port}`;
    this.currentPull = null;
  }

  async checkStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { online: false, error: `HTTP ${res.status} from Ollama` };
      }
      const data = await res.json();
      const models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
        details: m.details
      }));
      return { online: true, models };
    } catch (err) {
      return { online: false, error: err.message || 'Ollama is unreachable' };
    }
  }

  async isModelInstalled(modelName) {
    const status = await this.checkStatus();
    if (!status.online || !status.models) return false;
    return status.models.some(m => m.name === modelName || m.name.startsWith(`${modelName}:`));
  }

  async pullModel(modelName, onChunk) {
    if (this.currentPull) {
      throw new Error(`A download is already in progress for ${this.currentPull}`);
    }
    this.currentPull = modelName;

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ name: modelName, stream: true });
      const req = http.request(
        {
          hostname: this.host.hostname,
          port: this.host.port,
          path: '/api/pull',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        },
        (res) => {
          if (res.statusCode !== 200) {
            this.currentPull = null;
            res.resume();
            return reject(new Error(`Model download failed: HTTP ${res.statusCode}`));
          }
          let pullError = null;
          res.on('error', (e) => { this.currentPull = null; reject(e); });
          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep remainder
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const data = JSON.parse(line);
                if (data.error) pullError = data.error;
                if (onChunk) onChunk(data);
              } catch (e) {
                // ignore unparseable line
              }
            }
          });

          res.on('end', () => {
            this.currentPull = null;
            if (pullError) return reject(new Error(pullError));
            resolve({ success: true, model: modelName });
          });
        }
      );

      req.on('error', (err) => {
        this.currentPull = null;
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }

  async generate(modelName, prompt, systemPrompt = '', options = {}) {
    const controller = new AbortController();
    const timeout = options.timeoutMs || 90000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelName,
          prompt,
          system: systemPrompt,
          stream: false,
          format: options.format || 'json',
          keep_alive: '30m',
          options: {
            temperature: options.temperature ?? 0.7,
            top_p: 0.9,
            num_predict: options.maxTokens || 1200,
            num_ctx: 4096
          }
        })
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama generation failed: HTTP ${res.status} - ${text}`);
      }

      const data = await res.json();
      return {
        response: data.response,
        total_duration: data.total_duration,
        eval_count: data.eval_count
      };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async verifyModel(modelName) {
    const testPrompt = 'Respond with JSON: {"verified": true, "product": "Qoneqt Shots", "ready": true}';
    try {
      const result = await this.generate(modelName, testPrompt, 'You are a test validator. Output valid JSON only.', {
        format: 'json',
        temperature: 0.1,
        timeoutMs: 30000
      });
      const parsed = JSON.parse(result.response);
      return {
        success: true,
        response: parsed,
        raw: result.response
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  startDaemon() {
    return new Promise((resolve) => {
      try {
        const child = spawn('ollama', ['serve'], {
          detached: true,
          stdio: 'ignore'
        });
        child.on('error', (e) => resolve({ error: e.code === 'ENOENT' ? 'Ollama is not installed' : e.message }));
        child.unref();
        setTimeout(resolve, 2500);
      } catch (err) {
        resolve({ error: err.message });
      }
    });
  }
}

export const ollamaService = new OllamaService();
