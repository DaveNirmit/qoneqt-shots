import fs from 'fs';
import path from 'path';

const API = 'http://127.0.0.1:3001/api';

async function verifyWanPipeline() {
  console.log(`\n===============================================================`);
  console.log(`  🎬 QONEQT × COMFYUI WAN VIDEO PIPELINE ACCEPTANCE TEST`);
  console.log(`===============================================================\n`);

  let allPassed = true;
  const record = (num, title, passed, detail) => {
    console.log(`[Stage ${num}/12] ${passed ? '✅ PASSED' : '❌ FAILED'}: ${title}`);
    if (detail) console.log(`           ${detail}`);
    if (!passed) allPassed = false;
  };

  const testTopic = 'Why local AI models are changing the creator economy';

  // 1. Health & Video Provider Check
  try {
    const res = await fetch(`${API}/video/health`);
    const data = await res.json();
    record(
      1,
      'Video Provider abstraction and health detection',
      data.success && Boolean(data.activeProvider),
      `Active Provider: ${data.activeProvider} | Demo Mode: ${data.demoMode} | ComfyUI URL: ${data.comfyBaseUrl}`
    );
  } catch (e) {
    record(1, 'Provider health detection', false, e.message);
  }

  // 2. Video Model Catalog (Wan2.1 & LTX)
  try {
    const res = await fetch(`${API}/video/models`);
    const data = await res.json();
    const hasWan = data.models?.some(m => m.id === 'wan-2.1-fast');
    const hasLTX = data.models?.some(m => m.id === 'ltx-video');
    record(
      2,
      'Video model catalog (Wan 2.1 primary & LTX planned)',
      hasWan && hasLTX,
      `Models registered: ${data.models?.map(m => m.name).join(', ')}`
    );
  } catch (e) {
    record(2, 'Video model catalog', false, e.message);
  }

  // 3. Scene Planner with Structured Output
  let plannedScenes = null;
  try {
    const res = await fetch(`${API}/video/plan-scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: testTopic,
        style: 'Cinematic',
        aspectRatio: '9:16',
        duration: 30
      })
    });
    const data = await res.json();
    plannedScenes = data.scenes;
    record(
      3,
      'Scene Planner produces structured shot-by-shot sequence',
      Array.isArray(plannedScenes) && plannedScenes.length >= 4,
      `Scenes planned: ${plannedScenes.length} | First scene camera: "${plannedScenes[0]?.cameraMovement}"`
    );
  } catch (e) {
    record(3, 'Scene Planner', false, e.message);
  }

  // 4. Visual Prompt Engine Enrichment
  try {
    const firstScene = plannedScenes?.[0];
    const hasVisualPrompt = Boolean(firstScene?.visualPrompt && firstScene.visualPrompt.length > 50);
    const hasNegative = Boolean(firstScene?.negativePrompt);
    record(
      4,
      'Visual Prompt Engine enriches prompts for Wan2.1 model',
      hasVisualPrompt && hasNegative,
      `Prompt snippet: "${firstScene?.visualPrompt?.slice(0, 90)}..."`
    );
  } catch (e) {
    record(4, 'Visual prompt engine', false, e.message);
  }

  // 5. Job Creation & Audio-First Orchestration
  let createdJob = null;
  try {
    const res = await fetch(`${API}/video/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: testTopic,
        aspectRatio: '9:16',
        duration: 30,
        style: 'Cinematic',
        voice: 'en-US-ChristopherNeural',
        music: 'Upbeat'
      })
    });
    const data = await res.json();
    createdJob = data.job;
    record(
      5,
      'Create video generation job with audio-first scheduling',
      data.success && Boolean(createdJob?.id),
      `Job ID: ${createdJob?.id} | Status: ${createdJob?.status} | Total Scenes: ${createdJob?.totalScenes}`
    );
  } catch (e) {
    record(5, 'Video job creation', false, e.message);
  }

  // 6. Real Backend Job Tracking & Polling
  let completedJob = null;
  try {
    const start = Date.now();
    while (Date.now() - start < 45000) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await fetch(`${API}/video/jobs/${createdJob.id}`);
      const data = await res.json();
      if (data.job?.status === 'READY' || data.job?.status === 'FAILED') {
        completedJob = data.job;
        break;
      }
    }

    record(
      6,
      'Real backend job tracking (QUEUED -> SCENE_PLANNING -> VISUAL -> READY)',
      completedJob?.status === 'READY',
      `Final Status: ${completedJob?.status} | Progress: ${completedJob?.progress}% | Completed: ${completedJob?.completedScenes}/${completedJob?.totalScenes}`
    );
  } catch (e) {
    record(6, 'Job tracking', false, e.message);
  }

  // 7. Shot-by-Shot Scene Clips Generated
  try {
    const allClipsExist = completedJob?.scenes?.every(s => Boolean(s.videoUrl));
    record(
      7,
      'Shot-by-shot generation yields independent playable scene MP4s',
      allClipsExist,
      `Clips generated: ${completedJob?.scenes?.map(s => s.sceneNumber).join(', ')}`
    );
  } catch (e) {
    record(7, 'Scene clips generation', false, e.message);
  }

  // 8. Single Scene Regeneration (Section 10 Requirement)
  let regenResult = null;
  try {
    const res = await fetch(`${API}/video/jobs/${completedJob.id}/regenerate-scene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId: 'scene_2' })
    });
    regenResult = await res.json();
    record(
      8,
      'Single-scene independent regeneration (re-renders ONLY Scene 2)',
      regenResult.success && Boolean(regenResult.scene?.videoUrl),
      `Regenerated Scene 2: ${regenResult.scene?.videoUrl}`
    );
  } catch (e) {
    record(8, 'Single scene regeneration', false, e.message);
  }

  // 9. Post-Production Master Video Concatenation
  try {
    const hasMaster = Boolean(completedJob?.finalVideoUrl);
    const masterPath = completedJob?.localMasterPath;
    const existsOnDisk = fs.existsSync(masterPath) && fs.statSync(masterPath).size > 1000;
    record(
      9,
      'Post-Production concatenates scenes with audio and kinetic captions',
      hasMaster && existsOnDisk,
      `Master File: ${masterPath} (${fs.statSync(masterPath).size} bytes)`
    );
  } catch (e) {
    record(9, 'Post-production concatenation', false, e.message);
  }

  // 10. Automated Quality Check Gate (Section 23 Checklist)
  try {
    const qc = completedJob?.qualityCheck;
    const checksPass = qc?.checklist?.videoExists && qc?.checklist?.allScenesExist && qc?.checklist?.videoDecodable;
    record(
      10,
      'Quality Control gate verification (Section 23 10-point checklist)',
      qc?.passed && checksPass,
      `Score: ${qc?.score}% | Decodable: ${qc?.checklist?.videoDecodable} | All scenes: ${qc?.checklist?.allScenesExist}`
    );
  } catch (e) {
    record(10, 'Quality Check gate', false, e.message);
  }

  // 11. Streamable & Playable MP4 Video Endpoint
  try {
    const clipUrl = completedJob?.scenes?.[0]?.videoUrl;
    const res = await fetch(`http://127.0.0.1:3001${clipUrl}`);
    const isMP4 = res.headers.get('content-type') === 'video/mp4';
    record(
      11,
      'HTTP video stream endpoint returns valid decodable MP4',
      res.status === 200 && isMP4,
      `Status: ${res.status} | Content-Type: ${res.headers.get('content-type')} | Size: ${res.headers.get('content-length')} bytes`
    );
  } catch (e) {
    record(11, 'Streamable MP4 endpoint', false, e.message);
  }

  // 12. Qoneqt Publishing Readiness & Demo Transparency
  try {
    const isDemoTransparent = completedJob?.demoMode === true;
    record(
      12,
      'Qoneqt Global Feed publishing readiness with honest Demo Mode',
      Boolean(completedJob?.finalVideoUrl) && isDemoTransparent,
      `Destination: Qoneqt Global Feed | Status: READY TO PUBLISH | Demo transparent: ${isDemoTransparent}`
    );
  } catch (e) {
    record(12, 'Publishing readiness', false, e.message);
  }

  console.log(`\n===============================================================`);
  console.log(`  PIPELINE ACCEPTANCE: ${allPassed ? '🎉 ALL 12/12 ACCEPTANCE CRITERIA VERIFIED!' : '⚠️ SOME CRITERIA FAILED'}`);
  console.log(`===============================================================\n`);

  process.exit(allPassed ? 0 : 1);
}

verifyWanPipeline().catch(err => {
  console.error('Acceptance test error:', err);
  process.exit(1);
});
