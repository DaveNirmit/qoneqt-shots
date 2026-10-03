import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getSystemDiagnostics, findOllamaBinary, checkOllamaRunning, startOllamaBackground, OFFICIAL_OLLAMA_INSTALL_GUIDE } from './platform.js';
import { ollamaService } from '../server/services/ollamaService.js';
import { CONFIG } from '../server/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function start() {
  console.log(`\n===============================================================`);
  console.log(`  🎬 STARTING QONEQT SHOTS VIDEO STUDIO (LOCAL-FIRST)`);
  console.log(`===============================================================\n`);

  // Step 1: Preflight checks
  console.log(`[Step 1/7] Environment & Storage Preflight...`);
  const sys = getSystemDiagnostics();
  console.log(`           OS: ${sys.platform} (${sys.arch}) | Node: ${sys.nodeVersion} | Free Disk: ${sys.freeDiskGB} GB`);

  if (!sys.nodeSupported) {
    console.warn(`           ⚠️  Warning: Node.js version is ${sys.nodeVersion}. Node.js 20+ is recommended.`);
  }
  if (sys.freeDiskGB !== null && sys.freeDiskGB < 3) {
    console.error(`           ❌ Fatal: Less than 3GB free disk space. Aborting to protect system.`);
    process.exit(1);
  }

  // Step 2: Dependencies check
  console.log(`\n[Step 2/7] Checking Project Dependencies...`);
  const nmPath = path.join(rootDir, 'node_modules');
  if (!fs.existsSync(nmPath)) {
    console.log(`           node_modules missing. Running npm install...`);
    const isWin = process.platform === 'win32';
    const npmCmd = isWin ? 'npm.cmd' : 'npm';
    const installRes = spawnSync(npmCmd, ['install'], { cwd: rootDir, stdio: 'inherit', shell: isWin });
    if (installRes.status !== 0) {
      console.error(`           ❌ npm install failed. Please resolve errors.`);
      process.exit(1);
    }
  } else {
    console.log(`           Dependencies installed and verified ✅`);
  }

  // Step 3: Local AI runtime check
  console.log(`\n[Step 3/7] Checking Local AI Runtime (Ollama)...`);
  const ollamaBin = findOllamaBinary();
  if (!ollamaBin) {
    const guide = OFFICIAL_OLLAMA_INSTALL_GUIDE[sys.platform] || OFFICIAL_OLLAMA_INSTALL_GUIDE.win32;
    console.warn(`\n           ⚠️  Ollama runtime was not found in PATH or standard directories.`);
    console.warn(`           You can install it anytime from: ${guide.url}`);
    console.warn(`           Qoneqt Shots will start in Template Fallback Mode (Full studio UI remains active!).\n`);
  } else {
    console.log(`           Runtime binary located: ${ollamaBin} ✅`);
  }

  // Step 4: Ensure Ollama daemon is active
  let isRunning = false;
  if (ollamaBin) {
    console.log(`\n[Step 4/7] Ensuring Local AI daemon is active...`);
    let status = await checkOllamaRunning();
    if (!status.running) {
      console.log(`           Ollama daemon stopped. Auto-starting 'ollama serve'...`);
      startOllamaBackground(ollamaBin);
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1000));
        status = await checkOllamaRunning();
        if (status.running) break;
      }
    }
    if (status.running) {
      isRunning = true;
      console.log(`           Local AI daemon connected on 127.0.0.1:11434 ✅`);
    } else {
      console.warn(`           ⚠️  Could not start daemon automatically. Fallback templates ready.`);
    }
  }

  // Step 5: Check & download model if needed
  if (isRunning) {
    console.log(`\n[Step 5/7] Checking model '${CONFIG.DEFAULT_MODEL}'...`);
    const status = await checkOllamaRunning();
    const hasModel = status.models.some(m => m.name.startsWith(CONFIG.DEFAULT_MODEL));

    if (!hasModel) {
      const meta = CONFIG.SUPPORTED_MODELS.find(m => m.id === CONFIG.DEFAULT_MODEL);
      console.log(`           Model ${CONFIG.DEFAULT_MODEL} not cached. Downloading (~${meta?.size || '1GB'})...`);
      let lastP = -1;
      await ollamaService.pullModel(CONFIG.DEFAULT_MODEL, (chunk) => {
        if (chunk.total && chunk.completed) {
          const p = Math.floor((chunk.completed / chunk.total) * 100);
          if (p !== lastP && p % 10 === 0) {
            lastP = p;
            process.stdout.write(`\r           Download progress: ${p}% (${(chunk.completed / 1048576).toFixed(1)}MB / ${(chunk.total / 1048576).toFixed(1)}MB)`);
          }
        }
      });
      console.log(`\n           Model downloaded and ready ✅`);
    } else {
      console.log(`           Model ${CONFIG.DEFAULT_MODEL} is ready in local cache ✅`);
    }
  } else {
    console.log(`\n[Step 5/7] Model download skipped (Ollama offline). Template fallback active.`);
  }

  // Step 6: Test prompt verification
  if (isRunning) {
    console.log(`\n[Step 6/7] Verifying local model inference...`);
    const verify = await ollamaService.verifyModel(CONFIG.DEFAULT_MODEL);
    if (verify.success) {
      console.log(`           Model responds accurately to real prompts ✅`);
    } else {
      console.warn(`           ⚠️  Verification notice: ${verify.error}`);
    }
  } else {
    console.log(`\n[Step 6/7] Inference verification: Template fallback ready.`);
  }

  // Step 7: Launch Application
  console.log(`\n[Step 7/7] Launching Qoneqt Shots Studio...`);

  const isWin = process.platform === 'win32';
  const npmCmd = isWin ? 'npm.cmd' : 'npm';

  // Spawn dev servers (vite + backend)
  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWin
  });

  console.log(`\n===============================================================`);
  console.log(`  🎉 QONEQT SHOTS IS RUNNING!`);
  console.log(`  📱 Open your browser at:`);
  console.log(`     👉 http://localhost:5173  (Studio UI)`);
  console.log(`     👉 http://127.0.0.1:3001   (Backend Local API)`);
  console.log(`===============================================================\n`);

  // Open browser automatically
  setTimeout(() => {
    try {
      const openCmd = isWin ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      if (isWin) {
        spawn('cmd.exe', ['/c', 'start', 'http://localhost:5173']);
      } else {
        spawn(openCmd, ['http://localhost:5173']);
      }
    } catch (e) {}
  }, 3000);

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

start().catch(err => {
  console.error('\nStart failed:', err);
  process.exit(1);
});
