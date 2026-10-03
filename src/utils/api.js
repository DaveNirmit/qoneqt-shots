const BASE_URL = '';

export async function fetchDoctor() {
  const res = await fetch(`${BASE_URL}/api/doctor`);
  if (!res.ok) throw new Error(`Doctor API failed: ${res.status}`);
  return res.json();
}

export async function fetchSetupStatus() {
  const res = await fetch(`${BASE_URL}/api/setup/status`);
  if (!res.ok) throw new Error(`Setup status failed: ${res.status}`);
  return res.json();
}

export async function startRuntime() {
  const res = await fetch(`${BASE_URL}/api/setup/start-runtime`, { method: 'POST' });
  return res.json();
}

export async function verifyModel(model = 'qwen2.5:1.5b') {
  const res = await fetch(`${BASE_URL}/api/setup/verify-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  });
  return res.json();
}

export async function generateScript(params) {
  const res = await fetch(`${BASE_URL}/api/model/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error(err.error || 'Model generation failed');
  }
  return res.json();
}

export async function regenerateScene(params) {
  const res = await fetch(`${BASE_URL}/api/model/regenerate-scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error('Scene regeneration failed');
  return res.json();
}

export async function fetchTrends(forceRefresh = false) {
  const url = forceRefresh ? `${BASE_URL}/api/trends/refresh` : `${BASE_URL}/api/trends`;
  const method = forceRefresh ? 'POST' : 'GET';
  const res = await fetch(url, { method });
  if (!res.ok) throw new Error('Failed to fetch trends');
  return res.json();
}

export async function fetchProjects() {
  const res = await fetch(`${BASE_URL}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function fetchProject(id) {
  const res = await fetch(`${BASE_URL}/api/projects/${id}`);
  if (!res.ok) throw new Error('Project not found');
  return res.json();
}

export async function saveProject(project) {
  const res = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project)
  });
  if (!res.ok) throw new Error('Failed to save project');
  return res.json();
}

export async function duplicateProject(id) {
  const res = await fetch(`${BASE_URL}/api/projects/${id}/duplicate`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to duplicate project');
  return res.json();
}

export async function deleteProject(id) {
  const res = await fetch(`${BASE_URL}/api/projects/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete project');
  return res.json();
}

export async function fetchTTSVoices() {
  const res = await fetch(`${BASE_URL}/api/tts/voices`);
  if (!res.ok) return { voices: [] };
  return res.json();
}

export async function synthesizeSpeech(text, voice) {
  const res = await fetch(`${BASE_URL}/api/tts/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice })
  });
  return res.json();
}

export async function renderProjectMP4(project) {
  const res = await fetch(`${BASE_URL}/api/render/render-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Render failed' }));
    throw new Error(err.error || 'Server video rendering failed');
  }
  return res.json();
}

export async function generateSceneVisual(sceneText, topic, sceneIndex) {
  const res = await fetch(`${BASE_URL}/api/visuals/generate-scene-visual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneText, topic, sceneIndex })
  });
  return res.json();
}

export async function populateProjectVisuals(project) {
  const res = await fetch(`${BASE_URL}/api/visuals/populate-project-visuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project })
  });
  return res.json();
}

export async function processRecordingBlob(blob, projectId) {
  const res = await fetch(`${BASE_URL}/api/render/process-recording?projectId=${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'video/webm' },
    body: blob
  });
  return res.json();
}

export async function fetchVideoModels() {
  const res = await fetch(`${BASE_URL}/api/render/models`);
  if (!res.ok) return { models: [] };
  return res.json();
}

export async function generateSceneVideoClip(params) {
  const res = await fetch(`${BASE_URL}/api/render/generate-scene-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Video generation failed' }));
    throw new Error(err.error || 'Scene video generation failed');
  }
  return res.json();
}

export async function generateAllSceneVideos(projectId, project, options = {}) {
  const res = await fetch(`${BASE_URL}/api/render/generate-all-scene-videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, project, ...options })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Batch video generation failed' }));
    throw new Error(err.error || 'Batch video generation failed');
  }
  return res.json();
}

// -------------------------------------------------------------
// NEW: ComfyUI Wan2.1 Video Pipeline & Job Orchestration APIs
// -------------------------------------------------------------

export async function getVideoHealth() {
  try {
    const res = await fetch(`${BASE_URL}/api/video/health`);
    if (!res.ok) return { activeProvider: 'DemoVideoProvider', demoMode: true };
    return res.json();
  } catch (err) {
    return { activeProvider: 'DemoVideoProvider', demoMode: true, error: err.message };
  }
}

export async function getVideoCatalog() {
  const res = await fetch(`${BASE_URL}/api/video/models`);
  if (!res.ok) return { models: [] };
  return res.json();
}

export async function planVideoScenes(payload) {
  const res = await fetch(`${BASE_URL}/api/video/plan-scenes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Scene planning failed');
  return res.json();
}

export async function createVideoJob(payload) {
  const res = await fetch(`${BASE_URL}/api/video/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Video job creation failed' }));
    throw new Error(err.error || 'Video job creation failed');
  }
  return res.json();
}

export async function getVideoJob(jobId) {
  const res = await fetch(`${BASE_URL}/api/video/jobs/${jobId}`);
  if (!res.ok) throw new Error('Failed to retrieve video job');
  return res.json();
}

export async function regenerateJobScene(jobId, sceneId) {
  const res = await fetch(`${BASE_URL}/api/video/jobs/${jobId}/regenerate-scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId })
  });
  if (!res.ok) throw new Error('Failed to regenerate scene');
  return res.json();
}



// Qoneqt Shots: Gemini-backed scene direction, images and status
export async function fetchShotsStatus() {
  const res = await fetch(`${BASE_URL}/api/shots/status`);
  return res.ok ? res.json() : { configured: false };
}
export async function generateShotScenes(payload) {
  const res = await fetch(`${BASE_URL}/api/shots/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Scene generation failed');
  return res.json();
}
export async function generateShotImage(payload) {
  const res = await fetch(`${BASE_URL}/api/shots/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('Image generation failed');
  return res.json();
}
export async function fetchQoneqtTrends() {
  const res = await fetch(`${BASE_URL}/api/trends/qoneqt`);
  return res.ok ? res.json() : { configured: false, items: [] };
}
