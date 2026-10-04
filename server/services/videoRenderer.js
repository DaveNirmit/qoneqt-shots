import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';
import { ttsService } from './ttsService.js';
import { visualService } from './visualService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VideoRenderer {
  constructor() {
    this.exportsDir = CONFIG.STORAGE.EXPORTS_DIR;
    this.cacheDir = CONFIG.STORAGE.CACHE_DIR;
    this.ffmpegPath = ffmpegInstaller.path;

    if (!fs.existsSync(this.exportsDir)) {
      fs.mkdirSync(this.exportsDir, { recursive: true });
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getFFmpegInfo() {
    return {
      available: Boolean(this.ffmpegPath && fs.existsSync(this.ffmpegPath)),
      path: this.ffmpegPath,
      version: ffmpegInstaller.version || 'bundled-static'
    };
  }

  runFFmpeg(args) {
    return new Promise((resolve, reject) => {
      console.log(`[FFmpeg] Spawning: ${this.ffmpegPath} ${args.slice(0, 8).join(' ')}...`);
      const child = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve({ success: true });
        else reject(new Error(`FFmpeg exited code ${code}: ${stderr.slice(-600)}`));
      });
      child.on('error', (err) => reject(err));
    });
  }

  // Render a single scene: Image + Ken Burns zoompan + Spoken Audio + On-screen Text
  // Length of a media file in seconds, read from FFmpeg's "Duration:" line (0 if unknown).
  probeDuration(file) {
    return new Promise((resolve) => {
      const child = spawn(this.ffmpegPath, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', () => {
        const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0);
      });
      child.on('error', () => resolve(0));
    });
  }

  async renderSceneClip(scene, sceneIdx, projectTitle, voice = 'en-US-ChristopherNeural') {
    const planned = Math.max(3, Math.min(20, Number(scene.duration) || 5));
    let sceneDuration = planned;
    let frames = Math.round(sceneDuration * 30); // 30 fps
    const timestamp = Date.now();
    const clipOut = path.join(this.cacheDir, `scene_clip_${sceneIdx}_${timestamp}.mp4`);

    // 1. Get or generate visual image
    let imgPath = scene.imageLocalPath;
    if (!imgPath || !fs.existsSync(imgPath)) {
      const visual = await visualService.getSceneVisual(
        scene.onScreenText || scene.visualDescription,
        projectTitle,
        sceneIdx
      );
      imgPath = visual.localPath;
    }

    // 2. Synthesize audio
    let audioPath = null;
    if (scene.narration && voice !== 'none') {
      const audioResult = await ttsService.generateSpeechWav(scene.narration, voice);
      if (audioResult?.filePath && fs.existsSync(audioResult.filePath)) {
        audioPath = audioResult.filePath;
      }
    }

    // The scene lasts as long as its narration needs (plus a short breath), never cutting the voice off.
    let spoken = 0;
    if (audioPath) {
      spoken = await this.probeDuration(audioPath);
      if (spoken > 0) sceneDuration = Math.min(25, Math.max(planned, Math.round((spoken + 0.6) * 10) / 10));
    }
    frames = Math.round(sceneDuration * 30);

    const fontArg = fs.existsSync("C:/Windows/Fonts/segoeuib.ttf")
      ? ":fontfile='C\\:/Windows/Fonts/segoeuib.ttf'"
      : fs.existsSync("C:/Windows/Fonts/arialbd.ttf")
      ? ":fontfile='C\\:/Windows/Fonts/arialbd.ttf'"
      : "";

    // drawtext has no word-wrap, so every line is its own centred drawtext read from a temp file
    // (expansion=none keeps %, :, ' and \ literal).
    const clean = (t) => String(t || '').replace(/\\n|[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const wrap = (text, max) => {
      const out = [];
      let cur = '';
      for (const w of text.split(' ')) {
        if (!cur) cur = w;
        else if (`${cur} ${w}`.length <= max) cur += ` ${w}`;
        else { out.push(cur); cur = w; }
      }
      if (cur) out.push(cur);
      return out;
    };
    const captionFiles = [];
    const drawLine = (text, { size, y, alpha = 0.5, enable = '' }) => {
      const file = path.join(this.cacheDir, `cap_${timestamp}_${sceneIdx}_${captionFiles.length}.txt`);
      fs.writeFileSync(file, text, 'utf8');
      captionFiles.push(file);
      const ref = file.replace(/\\/g, '/').replace(/:/g, '\\:');
      return `drawtext=textfile='${ref}':expansion=none${fontArg}:fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=${y}:borderw=3:bordercolor=black:shadowcolor=black@0.8:shadowx=2:shadowy=2:box=1:boxcolor=black@${alpha}:boxborderw=12${enable ? `:enable='${enable}'` : ''}`;
    };
    const captionFilters = [];

    // Headline: the scene's short title, at the top for the whole scene.
    const headline = clean(scene.onScreenText || scene.text);
    wrap(headline, 26).slice(0, 2).forEach((line, li) => captionFilters.push(drawLine(line, { size: 30, y: 150 + li * 46, alpha: 0.55 })));

    // Subtitles: the narration in short chunks, timed to the spoken audio so the screen shows what the voice says.
    const narration = clean(scene.narration);
    if (narration) {
      const chunks = [];
      let cur = [];
      for (const word of narration.split(' ')) {
        cur.push(word);
        const text = cur.join(' ');
        if ((/[.!?]["')]?$/.test(word) && cur.length >= 2) || (/[,;:]$/.test(word) && cur.length >= 3) || cur.length >= 6 || text.length >= 34) {
          chunks.push(text);
          cur = [];
        }
      }
      if (cur.length) chunks.push(cur.join(' '));
      // Weight = words plus a little for the pause after punctuation.
      const weights = chunks.map((c) => c.split(' ').length + (/[.!?]["')]?$/.test(c) ? 0.6 : /[,;:]$/.test(c) ? 0.3 : 0));
      const total = weights.reduce((a, b) => a + b, 0);
      const speakSecs = spoken > 0 ? spoken : Math.min(sceneDuration, Math.max(1, narration.split(' ').length / 2.5));
      let t = 0.05;
      chunks.forEach((chunk, ci) => {
        const dur = (weights[ci] / total) * Math.max(0.5, speakSecs - 0.1);
        const from = t;
        const to = ci === chunks.length - 1 ? sceneDuration : t + dur;
        t += dur;
        const lines = wrap(chunk, 24).slice(0, 2);
        const top = Math.round(1280 * 0.72 - ((lines.length - 1) * 58) / 2);
        lines.forEach((line, li) => captionFilters.push(drawLine(line, { size: 40, y: top + li * 58, alpha: 0.45, enable: `between(t,${from.toFixed(2)},${to.toFixed(2)})` })));
      });
    }

    // Small credit for photos that require attribution.
    if (scene.imageCredit) captionFilters.push(drawLine(clean(scene.imageCredit).slice(0, 70), { size: 14, y: 1280 - 44, alpha: 0.35 }));

    // Ken Burns zoompan filter
    const zoomExpr = sceneIdx % 2 === 0
      ? "min(zoom+0.0015,1.25)" // Zoom in
      : "max(1.25-0.0015*on,1.0)"; // Zoom out
    const panX = sceneIdx % 2 === 0 ? "iw/2-(iw/zoom/2)" : "iw/4";
    const panY = "ih/2-(ih/zoom/2)";

    const hasRealVideo = Boolean(
      scene.videoLocalPath &&
      fs.existsSync(scene.videoLocalPath) &&
      fs.statSync(scene.videoLocalPath).size > 10000
    );

    const brand = `drawtext=text='QONEQT SHOTS'${fontArg}:fontcolor=white@0.75:fontsize=15:x=(w-text_w)/2:y=65:shadowcolor=black@0.6:shadowx=1:shadowy=1`;
    const vf = (hasRealVideo
      ? ['scale=720:1280:force_original_aspect_ratio=increase', 'crop=720:1280']
      : ['scale=720:1280:force_original_aspect_ratio=increase', 'crop=720:1280', `zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${frames}:s=720x1280:fps=30`]
    ).concat(brand, captionFilters).join(',');

    const args = ['-y'];

    if (hasRealVideo) {
      args.push('-stream_loop', '-1', '-i', scene.videoLocalPath);
    } else if (imgPath && fs.existsSync(imgPath)) {
      args.push('-loop', '1', '-i', imgPath);
    } else {
      // Color fallback if no image
      args.push('-f', 'lavfi', '-i', `color=c=0x0f172a:s=720x1280:d=${sceneDuration}`);
    }

    const hasAudio = Boolean(audioPath && fs.existsSync(audioPath));
    if (hasAudio) {
      args.push('-i', audioPath);
    } else {
      // Silent audio generator so concat never fails
      args.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`);
    }

    args.push(
      // Always use input 0's picture and input 1's audio (ignores audio baked into AI video clips)
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-t', `${sceneDuration}`,
      '-vf', vf,
      // Pad narration with silence to the scene length; every clip gets identical audio settings for joining.
      ...(hasAudio ? ['-af', 'apad'] : []),
      '-ar', '44100',
      '-ac', '2',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      clipOut
    );

    try {
      await this.runFFmpeg(args);
    } finally {
      for (const f of captionFiles) { try { fs.unlinkSync(f); } catch (e) {} }
    }
    return clipOut;
  }

  // Concatenate multiple scene clips into the final master video
  async renderProjectToMP4(project, onProgress = null) {
    if (!project || !Array.isArray(project.scenes) || project.scenes.length === 0) {
      throw new Error('Project must contain at least one scene');
    }

    const timestamp = Date.now();
    const finalFilename = `qoneqt_forge_${project.id || 'reel'}_${timestamp}.mp4`;
    const finalOutputPath = path.join(this.exportsDir, finalFilename);
    const sceneClips = [];

    console.log(`[VideoRenderer] Starting full project video render for "${project.title}"...`);
    const totalScenes = project.scenes.length;

    try {
      // 1. Render each scene clip
      for (let i = 0; i < totalScenes; i++) {
        if (onProgress) {
          onProgress({ stage: 'scenes', current: i + 1, total: totalScenes, percent: Math.round(((i + 0.5) / totalScenes) * 80) });
        }
        console.log(`[VideoRenderer] Rendering Scene ${i + 1}/${totalScenes}...`);
        const clipPath = await this.renderSceneClip(
          project.scenes[i],
          i,
          project.title,
          project.voice || 'en-US-ChristopherNeural'
        );
        sceneClips.push(clipPath);
      }

      if (onProgress) {
        onProgress({ stage: 'joining', current: totalScenes, total: totalScenes, percent: 85 });
      }

      // 2. Concat all scene clips using concat demuxer file
      const concatListPath = path.join(this.cacheDir, `concat_${timestamp}.txt`);
      const fileLines = sceneClips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(concatListPath, fileLines);

      console.log('[VideoRenderer] Concatenating scene clips into final MP4...');
      const concatArgs = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        finalOutputPath
      ];

      await this.runFFmpeg(concatArgs);

      // Clean up temp scene clips
      for (const clip of sceneClips) {
        try { if (fs.existsSync(clip)) fs.unlinkSync(clip); } catch (e) {}
      }
      try { if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath); } catch (e) {}

      const size = fs.existsSync(finalOutputPath) ? fs.statSync(finalOutputPath).size : 0;
      console.log(`[VideoRenderer] Video render complete! Output size: ${size} bytes`);

      if (onProgress) {
        onProgress({ stage: 'complete', percent: 100 });
      }

      return {
        success: true,
        filename: finalFilename,
        downloadUrl: `/api/render/download/${finalFilename}`,
        fileSize: size,
        resolution: '720x1280 (9:16 Portrait)',
        duration: project.totalDuration || 30
      };
    } catch (err) {
      console.error('[VideoRenderer] Render failed:', err);
      // Clean up on failure
      for (const clip of sceneClips) {
        try { if (fs.existsSync(clip)) fs.unlinkSync(clip); } catch (e) {}
      }
      throw err;
    }
  }

  // Fallback transcode method
  transcodeToMP4(inputPath, outputPath) {
    return this.runFFmpeg([
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath
    ]);
  }
}

export const videoRenderer = new VideoRenderer();
