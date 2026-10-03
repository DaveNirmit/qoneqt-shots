import os from 'os';
import fs from 'fs';
import { spawnSync, spawn } from 'child_process';

export function getSystemDiagnostics() {
  const platform = process.platform;
  const arch = process.arch;
  const nodeVersion = process.version;
  const majorNode = parseInt(process.versions.node.split('.')[0], 10);
  const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const freeMemGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);

  let freeDiskGB = null;
  try {
    const stats = fs.statfsSync(process.cwd());
    freeDiskGB = Math.round((stats.bavail * stats.bsize) / (1024 * 1024 * 1024));
  } catch (e) {}

  return {
    platform,
    arch,
    nodeVersion,
    nodeSupported: majorNode >= 20,
    totalMemGB,
    freeMemGB,
    freeDiskGB
  };
}

export function findOllamaBinary() {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where.exe' : 'which';
  const res = spawnSync(cmd, ['ollama'], { encoding: 'utf-8' });

  if (res.status === 0 && res.stdout) {
    const line = res.stdout.trim().split('\n')[0].trim();
    if (line && fs.existsSync(line)) return line;
  }

  // Common fallback paths
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const winPath = `${localAppData}\\Programs\\Ollama\\ollama.exe`;
    if (fs.existsSync(winPath)) return winPath;
  } else if (process.platform === 'darwin') {
    if (fs.existsSync('/usr/local/bin/ollama')) return '/usr/local/bin/ollama';
    if (fs.existsSync('/Applications/Ollama.app/Contents/Resources/ollama')) {
      return '/Applications/Ollama.app/Contents/Resources/ollama';
    }
  } else if (process.platform === 'linux') {
    if (fs.existsSync('/usr/local/bin/ollama')) return '/usr/local/bin/ollama';
    if (fs.existsSync('/usr/bin/ollama')) return '/usr/bin/ollama';
  }

  return null;
}

export async function checkOllamaRunning(host = 'http://127.0.0.1:11434') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { running: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { running: true, models: data.models || [] };
  } catch (err) {
    return { running: false, error: err.message };
  }
}

export function startOllamaBackground(ollamaBin = 'ollama') {
  try {
    const child = spawn(ollamaBin, ['serve'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return true;
  } catch (e) {
    return false;
  }
}

export const OFFICIAL_OLLAMA_INSTALL_GUIDE = {
  win32: {
    name: 'Windows',
    url: 'https://ollama.com/download/OllamaSetup.exe',
    instructions: 'Download and run the official signed installer from https://ollama.com/download/OllamaSetup.exe. Once installed, Ollama will be available globally.'
  },
  darwin: {
    name: 'macOS',
    url: 'https://ollama.com/download/Ollama-darwin.zip',
    instructions: 'Download the official macOS app bundle from https://ollama.com/download/Ollama-darwin.zip, unzip and move to /Applications.'
  },
  linux: {
    name: 'Linux',
    url: 'https://ollama.com/download/linux',
    instructions: 'Install via the official verified script: curl -fsSL https://ollama.com/install.sh | sh'
  }
};
