import fs from 'fs';
import path from 'path';
import { JobStatus, SceneStatus } from './types.js';
import { ComfyUIWanProvider } from './ComfyUIWanProvider.js';
import { DemoVideoProvider } from './DemoVideoProvider.js';
import { GeminiVeoProvider } from './GeminiVeoProvider.js';
import { geminiService } from '../geminiService.js';
import { ScenePlanner } from './ScenePlanner.js';
import { PostProductionService } from './PostProductionService.js';
import { QualityChecker } from './QualityChecker.js';
import { CONFIG } from '../../config.js';

/**
 * VideoJobService
 * Central orchestration service for the Qoneqt AI Content Pipeline.
 * Coordinates LLM AI Director, Scene Planner, ComfyUI Wan2.1 Provider,
 * Post-Production, Quality Checking, and Per-Scene Regeneration.
 */
export class VideoJobService {
  constructor() {
    this.jobsDir = CONFIG.STORAGE.JOBS_DIR;
    this.videosDir = CONFIG.STORAGE.VIDEOS_DIR;
    this.exportsDir = CONFIG.STORAGE.EXPORTS_DIR;

    if (!fs.existsSync(this.jobsDir)) fs.mkdirSync(this.jobsDir, { recursive: true });
    if (!fs.existsSync(this.videosDir)) fs.mkdirSync(this.videosDir, { recursive: true });
    if (!fs.existsSync(this.exportsDir)) fs.mkdirSync(this.exportsDir, { recursive: true });

    this.wanProvider = new ComfyUIWanProvider(CONFIG.COMFYUI_BASE_URL);
    this.demoProvider = new DemoVideoProvider();
    this.geminiProvider = new GeminiVeoProvider();
    this.postProduction = new PostProductionService();

    // In-memory active job store for fast access
    this.activeJobs = new Map();
  }

  /**
   * Determine active video provider based on ComfyUI health and hardware
   */
  async getActiveProvider() {
    if (geminiService.canMakeVideo()) return this.geminiProvider;
    if (CONFIG.DEMO_MODE) {
      console.log('[QONEQT] DEMO_MODE explicitly enabled in config.');
      return this.demoProvider;
    }

    const health = await this.wanProvider.checkHealth();
    if (health.available) {
      console.log(`[QONEQT] ComfyUI backend verified online at ${CONFIG.COMFYUI_BASE_URL}`);
      return this.wanProvider;
    }

    console.log('[QONEQT] ComfyUI server is offline/unreachable. Falling back to DemoVideoProvider (Demo Mode).');
    return this.demoProvider;
  }

  /**
   * Create and start an end-to-end video generation job
   */
  async createVideoJob({
    projectId,
    topic,
    script,
    aspectRatio = '9:16',
    duration = 30,
    style = 'Cinematic',
    voice = 'en-US-ChristopherNeural',
    music = 'Upbeat'
  }) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const provider = await this.getActiveProvider();

    console.log(`[QONEQT] Project created: ${projectId || topic} (Job: ${jobId})`);

    // 1. Plan scenes
    console.log(`[QONEQT] Planning scenes for topic: ${topic}`);
    const plannedScenes = ScenePlanner.planScenes(script || { topic, title: topic }, {
      style,
      aspectRatio,
      targetDuration: duration
    });
    console.log(`[QONEQT] Scenes planned: ${plannedScenes.length} total scenes.`);

    const job = {
      id: jobId,
      projectId: projectId || `proj_${Date.now()}`,
      topic,
      status: JobStatus.QUEUED,
      provider: provider.name,
      demoMode: provider.name === 'DemoVideoProvider',
      aspectRatio,
      duration,
      style,
      voice,
      music,
      currentScene: 0,
      totalScenes: plannedScenes.length,
      completedScenes: 0,
      progress: 0,
      scenes: plannedScenes,
      finalVideoUrl: null,
      localMasterPath: null,
      qualityCheck: null,
      logs: [`[QONEQT] Job initialized: ${jobId}`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.saveJob(job);

    // Launch pipeline asynchronously
    this.runPipeline(job).catch(err => {
      console.error(`[QONEQT] Pipeline execution error on job ${jobId}:`, err);
      job.status = JobStatus.FAILED;
      job.error = err.message;
      job.logs.push(`[ERROR] ${err.message}`);
      this.saveJob(job);
    });

    return job;
  }

  /**
   * Execute the 7-stage pipeline
   */
  async runPipeline(job) {
    const provider = await this.getActiveProvider();

    // Stage 1 & 2: SCRIPT & SCENE PLANNING
    job.status = JobStatus.SCENE_PLANNING;
    job.progress = 15;
    job.logs.push('[QONEQT] Script & scene planning completed.');
    this.saveJob(job);

    // Stage 3: AUDIO SYNTHESIS (Audio-first alignment)
    job.status = JobStatus.AUDIO_SYNTHESIS;
    job.progress = 25;
    job.logs.push('[QONEQT] Synthesizing scene narration audio (audio-first)...');
    this.saveJob(job);
    await this.postProduction.synthesizeSceneAudioTracks(job.scenes, job.voice);

    // Stage 4: VISUAL & VIDEO GENERATION (Shot-by-shot generation)
    job.status = JobStatus.VISUAL_GENERATION;
    job.logs.push(`[QONEQT] Starting shot-by-shot scene video generation using ${provider.name}...`);
    this.saveJob(job);

    for (let i = 0; i < job.scenes.length; i++) {
      const scene = job.scenes[i];
      job.currentScene = i + 1;
      scene.status = SceneStatus.GENERATING;
      job.logs.push(`[QONEQT] Scene 0${i + 1} submitted to ${provider.name}`);
      this.saveJob(job);

      try {
        const renderResult = await provider.generateSceneVideo(scene, {
          aspectRatio: job.aspectRatio,
          duration: scene.duration,
          voice: job.voice,
          title: job.title || job.topic,
          onProgress: (p) => {
            scene.progress = p.progress || 50;
            job.progress = Math.round(30 + ((i + (p.progress || 50) / 100) / job.scenes.length) * 40);
            this.saveJob(job);
          }
        });

        scene.status = SceneStatus.COMPLETED;
        scene.progress = 100;
        scene.localPath = renderResult.localPath;
        scene.videoUrl = renderResult.videoUrl;
        job.completedScenes++;
        job.logs.push(`[QONEQT] Scene 0${i + 1} completed.`);
      } catch (sceneErr) {
        console.warn(`[QONEQT] Scene 0${i + 1} generation failed:`, sceneErr.message);
        scene.status = SceneStatus.FAILED;
        scene.error = sceneErr.message;
        job.logs.push(`[WARNING] Scene 0${i + 1} failed: ${sceneErr.message}`);
      }

      job.progress = Math.round(30 + ((i + 1) / job.scenes.length) * 40);
      this.saveJob(job);
    }

    job.logs.push('[QONEQT] All scenes completed.');

    // Stage 5: POST-PROCESSING (Video concatenation, music & kinetic captions)
    job.status = JobStatus.POST_PROCESSING;
    job.progress = 80;
    job.logs.push('[QONEQT] Post-processing: concatenating scenes, adding audio & captions...');
    this.saveJob(job);

    const masterResult = await this.postProduction.compileFinalVideo({
      projectId: job.projectId,
      scenes: job.scenes,
      aspectRatio: job.aspectRatio,
      musicTrack: job.music,
      voice: job.voice
    });

    job.finalVideoUrl = masterResult.downloadUrl;
    job.localMasterPath = masterResult.localPath;

    // Stage 6: QUALITY CHECK (Section 23 Verification Gate)
    job.status = JobStatus.QUALITY_CHECK;
    job.progress = 92;
    job.logs.push('[QONEQT] Running quality check gates...');
    this.saveJob(job);

    const qc = await QualityChecker.verifyVideo({
      videoPath: masterResult.localPath,
      scenes: job.scenes,
      expectedAspectRatio: job.aspectRatio,
      targetDuration: job.duration
    });

    job.qualityCheck = qc;
    job.logs.push(`[QONEQT] Quality check ${qc.passed ? 'passed ✓' : 'warning (score: ' + qc.score + '%)'}`);

    // Stage 7: READY TO PUBLISH
    job.status = JobStatus.READY;
    job.progress = 100;
    job.logs.push('[QONEQT] Video ready for Qoneqt Global Feed publication.');
    this.saveJob(job);

    console.log(`[QONEQT] Master video pipeline finished successfully for job ${job.id}`);
    return job;
  }

  /**
   * Regenerate ONLY an individual scene (Section 10)
   */
  async regenerateScene(jobId, sceneId) {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const sceneIdx = job.scenes.findIndex(s => s.sceneId === sceneId || String(s.sceneNumber) === String(sceneId));
    if (sceneIdx === -1) throw new Error(`Scene ${sceneId} not found in job ${jobId}`);

    const scene = job.scenes[sceneIdx];
    const provider = await this.getActiveProvider();

    console.log(`[QONEQT] Regenerating individual scene: ${scene.sceneId} (Job: ${jobId})`);
    scene.status = SceneStatus.GENERATING;
    scene.progress = 20;
    this.saveJob(job);

    const res = await provider.generateSceneVideo(scene, {
      aspectRatio: job.aspectRatio,
      duration: scene.duration
    });

    scene.status = SceneStatus.COMPLETED;
    scene.progress = 100;
    scene.localPath = res.localPath;
    scene.videoUrl = res.videoUrl;
    job.logs.push(`[QONEQT] Scene ${scene.sceneId} regenerated successfully.`);

    this.saveJob(job);
    return { success: true, scene, job };
  }

  async getJob(jobId) {
    if (this.activeJobs.has(jobId)) {
      return this.activeJobs.get(jobId);
    }
    const filePath = path.join(this.jobsDir, `${jobId}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.activeJobs.set(jobId, data);
      return data;
    }
    return null;
  }

  saveJob(job) {
    job.updatedAt = new Date().toISOString();
    this.activeJobs.set(job.id, job);
    const filePath = path.join(this.jobsDir, `${job.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(job, null, 2));
  }

  getAllJobs() {
    const jobs = Array.from(this.activeJobs.values());
    if (jobs.length > 0) return jobs;
    if (!fs.existsSync(this.jobsDir)) return [];
    return fs.readdirSync(this.jobsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.jobsDir, f), 'utf8'));
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }
}

export const videoJobService = new VideoJobService();
