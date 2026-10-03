import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NATURAL_NEURAL_VOICES = [
  {
    id: 'en-US-ChristopherNeural',
    name: 'Christopher (Natural Male Creator)',
    lang: 'en-US',
    gender: 'Male',
    provider: 'Microsoft Neural TTS (Human-Grade)'
  },
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny (Natural Female Creator)',
    lang: 'en-US',
    gender: 'Female',
    provider: 'Microsoft Neural TTS (Human-Grade)'
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Guy (Natural Documentary Voice)',
    lang: 'en-US',
    gender: 'Male',
    provider: 'Microsoft Neural TTS (Human-Grade)'
  },
  {
    id: 'en-US-AriaNeural',
    name: 'Aria (Natural Storyteller)',
    lang: 'en-US',
    gender: 'Female',
    provider: 'Microsoft Neural TTS (Human-Grade)'
  }
];

class TTSService {
  constructor() {
    this.audioCacheDir = path.join(CONFIG.STORAGE.CACHE_DIR, 'audio');
    if (!fs.existsSync(this.audioCacheDir)) {
      fs.mkdirSync(this.audioCacheDir, { recursive: true });
    }
    this.installedVoices = [];
    this.initialized = false;
  }

  async getAvailableVoices() {
    if (this.initialized) return this.installedVoices;

    // Start with natural neural voices
    const voices = [...NATURAL_NEURAL_VOICES];

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
                name: `${v.Name} (Windows SAPI Local)`,
                lang: v.Culture || 'en-US',
                gender: v.Gender,
                provider: 'Windows System.Speech (Offline)'
              });
            }
          }
        }
      } catch (err) {
        console.warn('[TTSService] SAPI voice scan warning:', err.message);
      }
    }

    // Caption-First option
    voices.push({
      id: 'none',
      name: 'Caption-First (No Spoken Audio)',
      lang: 'any',
      gender: 'Neutral',
      provider: 'Visual & Kinetic Captions Only'
    });

    this.installedVoices = voices;
    this.initialized = true;
    return voices;
  }

  runPowerShell(script) {
    return new Promise((resolve) => {
      try {
        const ps = spawn('powershell', ['-NoProfile', '-Command', script]);
        const timer = setTimeout(() => {
          try { ps.kill('SIGKILL'); } catch (e) {}
          resolve(null);
        }, 3500);

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
        const child = spawn('python', [
          '-m', 'edge_tts',
          '--voice', voice,
          '--text', text,
          '--write-media', outputPath
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        timer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch (e) {}
          resolve(false);
        }, 3500);

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

    // 1. Try High-Quality Natural Neural TTS first
    if (isNeural) {
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
      const sanitizedText = text.replace(/[`"$]/g, '\\$&');
      const sanitizedPath = fallbackWav.replace(/\\/g, '\\\\');
      const sapiVoice = isNeural ? 'Microsoft David Desktop' : voiceName;

      const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ("${sapiVoice}") {
  try { $synth.SelectVoice("${sapiVoice}") } catch {}
}
$synth.SetOutputToWaveFile("${sanitizedPath}")
$synth.Speak("${sanitizedText}")
$synth.Dispose()
`;
      await this.runPowerShell(psScript);

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
