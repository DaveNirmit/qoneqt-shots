import fs from 'fs';
import { getSystemDiagnostics, findOllamaBinary, checkOllamaRunning, startOllamaBackground, OFFICIAL_OLLAMA_INSTALL_GUIDE } from './platform.js';
import { ollamaService } from '../server/services/ollamaService.js';
import { CONFIG } from '../server/config.js';

async function setup() {
  console.log(`\n===============================================================`);
  console.log(`  ⚙️  QONEQT SHOTS — AUTOMATED SETUP & VERIFICATION`);
  console.log(`===============================================================\n`);

  // 1. Diagnostic preflight
  const sys = getSystemDiagnostics();
  console.log(`[1/5] Checking System Environment...`);
  console.log(`      OS: ${sys.platform} (${sys.arch}) | Node: ${sys.nodeVersion} | Free Disk: ${sys.freeDiskGB} GB`);

  if (!sys.nodeSupported) {
    console.warn(`      ⚠️  Node.js v20+ recommended. Current: ${sys.nodeVersion}`);
  }
  if (sys.freeDiskGB !== null && sys.freeDiskGB < 5) {
    console.error(`      ❌ Insufficient disk space! At least 5 GB free space is required.`);
    process.exit(1);
  }

  // 2. Local AI runtime check
  console.log(`\n[2/5] Checking Local AI Runtime (Ollama)...`);
  const ollamaBin = findOllamaBinary();
  if (!ollamaBin) {
    const guide = OFFICIAL_OLLAMA_INSTALL_GUIDE[sys.platform] || OFFICIAL_OLLAMA_INSTALL_GUIDE.win32;
    console.error(`\n❌ Ollama is not installed on this system.`);
    console.log(`\n👉 Official Installation Steps for ${guide.name}:`);
    console.log(`   Official verified URL: ${guide.url}`);
    console.log(`   ${guide.instructions}`);
    console.log(`\nAfter installation, re-run: npm run setup\n`);
    process.exit(1);
  }
  console.log(`      Found official runtime: ${ollamaBin}`);

  // 3. Ensure daemon is running
  console.log(`\n[3/5] Checking Ollama Daemon status...`);
  let status = await checkOllamaRunning();
  if (!status.running) {
    console.log(`      Daemon stopped. Launching 'ollama serve' in background...`);
    startOllamaBackground(ollamaBin);
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 1000));
      status = await checkOllamaRunning();
      if (status.running) break;
    }
  }

  if (!status.running) {
    console.error(`      ❌ Could not start Ollama daemon automatically.`);
    console.log(`      Please run 'ollama serve' in a separate terminal and re-run npm run setup.`);
    process.exit(1);
  }
  console.log(`      Ollama daemon is active on 127.0.0.1:11434.`);

  // 4. Model download & verification
  console.log(`\n[4/5] Checking Local Model: ${CONFIG.DEFAULT_MODEL}...`);
  const isInstalled = status.models.some(m => m.name.startsWith(CONFIG.DEFAULT_MODEL));

  if (!isInstalled) {
    const modelMeta = CONFIG.SUPPORTED_MODELS.find(m => m.id === CONFIG.DEFAULT_MODEL) || {
      name: CONFIG.DEFAULT_MODEL,
      size: '~986 MB',
      license: 'Apache 2.0'
    };
    console.log(`      Model not found locally.`);
    console.log(`      Downloading: ${modelMeta.name}`);
    console.log(`      Download Size: ${modelMeta.size} | License: ${modelMeta.license}`);
    console.log(`      After this one download, the model runs on your machine.`);

    let lastP = -1;
    await ollamaService.pullModel(CONFIG.DEFAULT_MODEL, (chunk) => {
      if (chunk.total && chunk.completed) {
        const p = Math.floor((chunk.completed / chunk.total) * 100);
        if (p !== lastP && p % 10 === 0) {
          lastP = p;
          const mbComp = (chunk.completed / 1048576).toFixed(1);
          const mbTot = (chunk.total / 1048576).toFixed(1);
          process.stdout.write(`\r      Downloading: [${'='.repeat(p / 5)}${' '.repeat(20 - p / 5)}] ${p}% (${mbComp}MB / ${mbTot}MB)`);
        }
      }
    });
    console.log(`\n      Download complete!`);
  } else {
    console.log(`      Model ${CONFIG.DEFAULT_MODEL} is already downloaded and cached.`);
  }

  // 5. Real inference test
  console.log(`\n[5/5] Performing live inference verification on local hardware...`);
  const testRes = await ollamaService.verifyModel(CONFIG.DEFAULT_MODEL);
  if (testRes.success) {
    console.log(`      ✅ Local inference verified successfully! Response: ${JSON.stringify(testRes.response)}`);
  } else {
    console.warn(`      ⚠️  Verification warning: ${testRes.error}. Fallback templates will remain ready.`);
  }

  console.log(`\n===============================================================`);
  console.log(`  🎉 QONEQT SHOTS SETUP COMPLETED SUCCESSFULLY!`);
  console.log(`  You can now launch the studio with: npm run start`);
  console.log(`===============================================================\n`);
}

setup().catch(err => {
  console.error('\nSetup error:', err);
  process.exit(1);
});
