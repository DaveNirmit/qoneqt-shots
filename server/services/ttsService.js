import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Natural voices come from Microsoft's online speech service through the edge-tts Python package.
const EDGE_PROVIDER = 'Microsoft natural voice via edge-tts (needs internet)';
const NATURAL_NEURAL_VOICES = [
  { id: 'en-US-ChristopherNeural', name: 'Christopher (natural, male)', lang: 'en-US', gender: 'Male', provider: EDGE_PROVIDER },
  { id: 'en-US-JennyNeural', name: 'Jenny (natural, female)', lang: 'en-US', gender: 'Female', provider: EDGE_PROVIDER },
  { id: 'en-US-GuyNeural', name: 'Guy (natural, male, documentary)', lang: 'en-US', gender: 'Male', provider: EDGE_PROVIDER },
  { id: 'en-US-AriaNeural', name: 'Aria (natural, female, storyteller)', lang: 'en-US', gender: 'Female', provider: EDGE_PROVIDER },
];

class TTSService {
  constructor() {
    this.audioCacheDir = path.join(CONFIG.STORAGE.CACHE_DIR, 'audio');
    if (!fs.existsSync(this.audioCacheDir)) {
      fs.mkdirSync(this.audioCacheDir, { recursive: true });
    }
    this.voicesPromise = null;
    this.pythonCmd = null; // the Python command that has edge-tts, or null when it is not installed
  }

  // Natural voices are only offered when the edge-tts package is really installed on this computer.
  async detectEdgeTTS() {
    const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
    for (const cmd of candidates) {
      const ok = await new Promise((resolve) => {
        try {
          const child = spawn(cmd, ['-m', 'edge_tts', '--version'], { stdio: 'ignore' });
          const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} resolve(false); }, 8000);
          child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
          child.on('error', () => { clearTimeout(timer); resolve(false); });
        } catch (e) { resolve(false); }
      });
      if (ok) return cmd;
    }
    return null;
  }

  getAvailableVoices() {
    if (!this.voicesPromise) this.voicesPromise = this.scanVoices();
    return this.voicesPromise;
  }

  async scanVoices() {
    this.pythonCmd = await this.detectEdgeTTS();
    const voices = this.pythonCmd ? [...NATURAL_NEURAL_VOICES] : [];
    if (!this.pythonCmd) console.log('[TTSService] edge-tts not installed: offering offline voices only (python -m pip install edge-tts for natural voices)');

    // Query native Windows SAPI voices as local fallback
    if (process.platform === 'win32') {
      try {
        const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object {
  [PSCustomObject]@{
    Name = $_.VoiceInfo.Name
    Culture = $_.VoiceInfo.Culture.Name
    Gender = $_.VoiceInfo.Gender.ToString()
  }
} | ConvertTo-Json
$synth.Dispose()
`;
        const res = await this.runPowerShell(psScript);
        if (res) {
          const parsed = JSON.parse(res);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          for (const v of list) {
            if (v && v.Name && !voices.some(existing => existing.id === v.Name)) {
              voices.push({
                id: v.Name,
                name: `${String(v.Name).replace(/^Microsoft\s+/, '').replace(/\s+Desktop$/, '')} (Windows, offline)`,
                lang: v.Culture || 'en-US',
                gender: v.Gender,
                provider: 'Windows built-in voice (offline)'
              });
            }
          }
        }
      } catch (err) {
        console.warn('[TTSService] SAPI voice scan warning:', err.message);
      }
    }

    voices.push({
      id: 'none',
      name: 'No narration (captions only)',
      lang: 'any',
      gender: 'Neutral',
      provider: 'Captions only'
    });
    return voices;
  }

  // Values reach the script through environment variables, never by pasting them into the code,
  // so narration text cannot be interpreted as PowerShell.
  runPowerShell(script, timeoutMs = 3500, env = {}) {
    return new Promise((resolve) => {
      try {
        const ps = spawn('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, ...env } });
        const timer = setTimeout(() => {
          try { ps.kill('SIGKILL'); } catch (e) {}
          resolve(null);
        }, timeoutMs);

        let stdout = '';
        ps.stdout?.on('data', d => { stdout += d.toString(); });
        ps.on('close', code => {
          clearTimeout(timer);
          resolve(code === 0 ? stdout.trim() : null);
        });
        ps.on('error', () => {
          clearTimeout(timer);
          resolve(null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  runEdgeTTS(voice, text, outputPath) {
    return new Promise((resolve) => {
      let timer = null;
      try {
        const child = spawn(this.pythonCmd || 'python', [
          '-m', 'edge_tts',
          '--voice', voice,
          '--text', text,
          '--write-media', outputPath
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        // Python start-up plus the network round trip can take several seconds per line.
        timer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch (e) {}
          try { fs.unlinkSync(outputPath); } catch (e) {}
          resolve(false);
        }, 25000);

        let stderr = '';
        child.stderr?.on('data', d => { stderr += d.toString(); });

        child.on('close', code => {
          if (timer) clearTimeout(timer);
          if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 500) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
        child.on('error', () => {
          if (timer) clearTimeout(timer);
          resolve(false);
        });
      } catch (e) {
        if (timer) clearTimeout(timer);
        resolve(false);
      }
    });
  }

  async generateSpeechWav(text, voiceName = 'en-US-ChristopherNeural', outputFilename = null) {
    if (!text || !text.trim() || voiceName === 'none') {
      return null;
    }

    const isNeural = voiceName.startsWith('en-') || voiceName.includes('Neural');
    const ext = isNeural ? 'mp3' : 'wav';
    const filename = outputFilename || `tts_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const outputPath = path.join(this.audioCacheDir, filename);

    // 1. Natural voice first, when edge-tts is installed
    await this.getAvailableVoices();
    if (isNeural && this.pythonCmd) {
      try {
        console.log(`[TTSService] Generating natural neural voice (${voiceName})...`);
        const ok = await this.runEdgeTTS(voiceName, text, outputPath);
        if (ok) {
          return {
            filename,
            filePath: outputPath,
            url: `/api/tts/audio/${filename}`,
            size: fs.statSync(outputPath).size,
            engine: 'neural'
          };
        }
      } catch (err) {
        console.warn('[TTSService] Neural TTS failed, trying SAPI fallback:', err.message);
      }
    }

    // 2. Fallback to Windows SAPI System.Speech
    if (process.platform === 'win32') {
      const fallbackWav = outputPath.replace(/\.mp3$/, '.wav');
      const sapiVoice = isNeural ? 'Microsoft David Desktop' : voiceName;

      const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($env:QS_VOICE) {
  try { $synth.SelectVoice($env:QS_VOICE) } catch {}
}
$synth.SetOutputToWaveFile($env:QS_OUT)
$synth.Speak($env:QS_TEXT)
$synth.Dispose()
`;
      await this.runPowerShell(psScript, 30000, { QS_TEXT: text, QS_VOICE: sapiVoice, QS_OUT: fallbackWav });

      if (fs.existsSync(fallbackWav) && fs.statSync(fallbackWav).size > 1000) {
        const wavFilename = path.basename(fallbackWav);
        return {
          filename: wavFilename,
          filePath: fallbackWav,
          url: `/api/tts/audio/${wavFilename}`,
          size: fs.statSync(fallbackWav).size,
          engine: 'sapi'
        };
      }
    }

    return null;
  }
}

export const ttsService = new TTSService();
