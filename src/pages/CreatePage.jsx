import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowLeft, Trash2, RefreshCw, ImageIcon, Sparkles, Check, Download, Copy,
  Loader2, AlertTriangle, ExternalLink, Clapperboard, Save, X, Wand2,
} from 'lucide-react';
import { Badge, Phone } from '../components/ui';
import { toast, confirm } from '../components/notify';
import {
  generateScript, saveProject, fetchProject, createVideoJob, getVideoJob,
  generateShotScenes, generateShotImage,
} from '../utils/api';

const DURATIONS = [15, 30, 45, 60];
const TOPIC_MAX = 1000;
// Rotating placeholder ideas. Each is concrete, visual and fits a 15 to 60 second vertical video.
const SUGGESTIONS = [
  'Why your phone battery dies faster in winter, and the one fix that works',
  'Three study habits that survive exam week, explained in 30 seconds',
  'What actually happens to your data when you use a free app',
  'The 5-minute morning routine of a solo creator, start to finish',
  'One-pan dinner for students: 30 seconds, no skills needed',
  'How a local AI model can run on a normal laptop with no internet',
  'Hostel hacks every first-year wishes they knew on day one',
];

const TONES = ['Informative', 'Energetic', 'Storytelling'];
const SCENE_SECONDS = [3, 4, 5, 6, 7, 8, 10];
const STAGES = [
  ['SCENE_PLANNING', 'Planning scenes'],
  ['AUDIO_SYNTHESIS', 'Recording narration'],
  ['VISUAL_GENERATION', 'Generating scene video'],
  ['POST_PROCESSING', 'Assembling the video'],
  ['QUALITY_CHECK', 'Checking the file'],
];
const stageIndex = (s) => (s === 'READY' ? STAGES.length : Math.max(0, STAGES.findIndex(([k]) => k === s)));
const totalSeconds = (scenes = []) => scenes.reduce((n, s) => n + (Number(s.duration) || 0), 0);

function RollingHint({ active }) {
  const [state, setState] = useState({ i: 0, prev: null });
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setState((x) => ({ i: (x.i + 1) % SUGGESTIONS.length, prev: x.i })), 4000);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-3 top-[9px] h-[46px] overflow-hidden text-[15px] leading-relaxed text-faint" aria-hidden>
      {state.prev !== null && <div key={`p${state.prev}`} className="roll-out absolute inset-x-0">{SUGGESTIONS[state.prev]}</div>}
      <div key={`c${state.i}`} className="roll-in absolute inset-x-0">{SUGGESTIONS[state.i]}</div>
    </div>
  );
}

const SceneCard = React.memo(function SceneCard({ s, i, imgBusy, disabled, canRemove, onChange, onNewImage, onRemove }) {
  return (
    <div className="card overflow-hidden pop-in" style={{ animationDelay: `${i * 90}ms` }}>
      <div className="relative aspect-[9/11] bg-[#EFEDE7]">
        {s.imageUrl
          ? <img key={s.imageUrl} src={s.imageUrl} alt="" className="w-full h-full object-cover img-in" />
          : <div className="absolute inset-0 skeleton grid place-items-center"><ImageIcon className="w-5 h-5 text-faint" /></div>}
        {imgBusy && <div className="absolute inset-0 bg-white/60 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div>}
        <span className="absolute top-2.5 left-2.5 font-mono text-[11px] text-white bg-black/45 backdrop-blur px-1.5 py-0.5 rounded">SCENE {String(i + 1).padStart(2, '0')}</span>
        {s.onScreenText && <div className="absolute inset-x-4 bottom-4 text-center"><span className="inline bg-white text-ink text-[13px] font-semibold px-1.5 py-0.5 rounded [box-decoration-break:clone]">{s.onScreenText}</span></div>}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="label">On-screen text</label>
          <input className="input font-medium" value={s.onScreenText || ''} onChange={(e) => onChange(i, { onScreenText: e.target.value })} />
        </div>
        <div>
          <label className="label">Narration</label>
          <textarea rows={3} className="input resize-none text-[13px]" value={s.narration || ''} onChange={(e) => onChange(i, { narration: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <select className="input !w-auto !py-1 text-[12px]" value={s.duration} onChange={(e) => onChange(i, { duration: Number(e.target.value) })} aria-label="Scene length">
            {SCENE_SECONDS.map((n) => <option key={n} value={n}>{n}s</option>)}
          </select>
          <button onClick={() => onNewImage(i, s)} disabled={disabled} className="btn btn-ghost btn-sm"><ImageIcon className="w-3.5 h-3.5" /> New image</button>
          <button onClick={() => onRemove(i)} disabled={!canRemove} className="btn btn-ghost btn-sm ml-auto hover:!text-bad"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  );
});

function Steps({ step, setStep, canScript, canVideo }) {
  const items = [['idea', 'Idea', true], ['script', 'Script', canScript], ['video', 'Video', canVideo]];
  return (
    <div className="flex items-center gap-1 text-[13px]">
      {items.map(([id, label, enabled], i) => (
        <React.Fragment key={id}>
          {i > 0 && <span className="w-6 h-px bg-line-strong mx-1" />}
          <button disabled={!enabled} onClick={() => setStep(id)}
            className={`flex items-center gap-2 h-8 px-2.5 rounded-lg border ${step === id ? 'bg-card border-line font-medium' : 'border-transparent text-muted hover:text-ink'} disabled:opacity-40`}>
            <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-mono ${step === id ? 'bg-ink text-white' : 'bg-[#EFEDE7] text-muted'}`}>{i + 1}</span>
            {label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function CreatePage({ draft, engine, voices, shots, onSaved, onNew, go }) {
  const [step, setStep] = useState(draft.projectId ? 'loading' : 'idea');
  const [topic, setTopic] = useState(draft.topic || '');
  const [duration, setDuration] = useState(30);
  const [tone, setTone] = useState('Informative');
  const [voice, setVoice] = useState('en-US-ChristopherNeural');
  const [trend] = useState(draft.trend || null);
  const [project, setProject] = useState(null);
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!draft.projectId) return;
    fetchProject(draft.projectId)
      .then(({ project: p }) => {
        setProject(p);
        setTopic(p.topic || p.title || '');
        if (p.voice) setVoice(p.voice);
        if (p.scenes?.length) setCount(Math.max(2, Math.min(5, p.scenes.length)));
        setStep(p.exportUrl ? 'video' : 'script');
      })
      .catch(() => { setError('That project could not be opened.'); setStep('idea'); });
  }, [draft.projectId]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const voiceName = (voices.find((v) => v.id === voice) || {}).name || '';
  const update = (patch) => setProject((p) => ({ ...p, ...patch }));
  const updateScene = useCallback((i, patch) => setProject((p) => ({ ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) })), []);
  const removeScene = useCallback((i) => setProject((p) => ({ ...p, scenes: p.scenes.filter((_, j) => j !== i) })), []);
  const titleRef = useRef('');
  titleRef.current = project?.title || topic;
  const scenesRef = useRef([]);
  scenesRef.current = project?.scenes || [];

  const persist = async (p) => {
    const res = await saveProject({ ...p, topic, voice, tone, totalDuration: totalSeconds(p.scenes) });
    onSaved();
    return res.project;
  };

  // Step 1 -> 2: the local model turns the raw description into a brief.
  const writeScript = async () => {
    if (!topic.trim()) return setError('Describe your Shot first.');
    setError(''); setBusy('script');
    try {
      const res = await generateScript({
        topic: topic.trim(), duration, tone, visualStyle: 'kinetic_bold',
        sourceContext: trend ? { name: trend.sourceName, title: trend.title, url: trend.sourceUrl, snippet: trend.summary } : null,
      });
      const saved = await persist({ ...res.script, id: undefined, exportUrl: null, status: 'draft', shotsGenerated: false });
      setProject(saved);
      setJob(null);
      setStep('script');
    } catch (e) {
      setError(e.message || 'The script could not be written.');
    } finally { setBusy(''); }
  };

  // Step 2: Gemini (or the local model) directs N scenes, then an image is made for each.
  const generateScenes = async () => {
    setError(''); setBusy('scenes'); setProgress('Directing scenes...');
    try {
      const res = await generateShotScenes({ brief: project, count, tone, voiceName, length: duration, seed: Date.now(), avoid: project.shotsGenerated ? (project.scenes || []).map((x) => x.onScreenText).filter(Boolean) : [] });
      let scenes = res.scenes.map((s) => ({ ...s, imageUrl: null, imageLocalPath: null }));
      setProject((p) => ({ ...p, scenes, shotsGenerated: true, shotsProvider: res.provider }));
      for (let i = 0; i < scenes.length; i++) {
        setProgress(`Creating image ${i + 1} of ${scenes.length}`);
        try {
          const img = await generateShotImage({ prompt: scenes[i].visualDescription, text: scenes[i].onScreenText, narration: scenes[i].narration, topic: project.title, index: i, exclude: scenes.flatMap((x) => [x.imageLocalPath, x.imageUrl]).filter(Boolean) });
          scenes = scenes.map((s, j) => (j === i ? { ...s, imageUrl: img.url, imageLocalPath: img.localPath, imageProvider: img.provider } : s));
          setProject((p) => ({ ...p, scenes }));
        } catch { /* leave the slot empty; the renderer falls back to a stock frame */ }
      }
      const saved = await persist({ ...project, scenes, shotsGenerated: true, shotsProvider: res.provider, exportUrl: null, status: 'draft' });
      setProject(saved);
      setJob(null);
    } catch (e) {
      setError(e.message || 'Scenes could not be generated.');
    } finally { setBusy(''); setProgress(''); }
  };

  const newImage = useCallback(async (i, s) => {
    setBusy(`img-${i}`);
    try {
      const img = await generateShotImage({ prompt: s.visualDescription, text: s.onScreenText, narration: s.narration, topic: titleRef.current, index: i, exclude: scenesRef.current.flatMap((x) => [x.imageLocalPath, x.imageUrl]).filter(Boolean) });
      updateScene(i, { imageUrl: img.url, imageLocalPath: img.localPath, imageProvider: img.provider });
    } catch { setError('A new image could not be made.'); }
    finally { setBusy(''); }
  }, [updateScene]);

  // Step 2 -> 3
  const render = async () => {
    const empty = project.scenes.findIndex((s) => !(s.onScreenText || '').trim() && !(s.narration || '').trim());
    if (empty >= 0) return setError(`Scene ${empty + 1} is empty. Add text or remove it.`);
    setError(''); setBusy('render');
    try {
      const saved = await persist({ ...project, exportUrl: null, status: 'rendering' });
      setProject(saved);
      const { job: j } = await createVideoJob({ projectId: saved.id, topic: saved.title, script: saved, duration: totalSeconds(saved.scenes), voice });
      setJob(j);
      setStep('video');
      let failures = 0;
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const { job: cur } = await getVideoJob(j.id);
          failures = 0;
          setJob(cur);
          if (cur.status === 'READY' || cur.status === 'FAILED') {
            clearInterval(pollRef.current);
            setBusy('');
            if (cur.status === 'READY' && cur.finalVideoUrl) setProject(await persist({ ...saved, exportUrl: cur.finalVideoUrl, status: 'rendered' }));
          }
        } catch {
          if (++failures >= 5) { clearInterval(pollRef.current); setBusy(''); setError('Lost contact with the renderer. Is the server still running?'); }
        }
      }, 2000);
    } catch (e) {
      setBusy(''); setError(e.message || 'Rendering could not start.');
    }
  };

  const saveVideo = async () => {
    await persist({ ...project, status: 'rendered' });
    toast('Video saved to your Library');
    onNew();
  };
  const discardVideo = async () => {
    const ok = await confirm({ title: 'Discard this video?', text: 'The rendered video is removed. Your script stays in the Library.', confirmLabel: 'Discard', danger: true });
    if (!ok) return;
    await persist({ ...project, exportUrl: null, status: 'draft' });
    toast('Video discarded. Script kept in Library', 'info');
    onNew();
  };
  const copyPost = async () => {
    const tags = (project.hashtags || []).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    await navigator.clipboard.writeText([project.caption, tags].filter(Boolean).join('\n\n'));
    setCopied(true); setTimeout(() => setCopied(false), 1800);
    toast('Caption and hashtags copied');
  };

  const videoUrl = project?.exportUrl || (job?.status === 'READY' ? job.finalVideoUrl : null);
  const generated = Boolean(project?.shotsGenerated);
  const cloud = Boolean(shots?.valid);

  return (
    <div>
      {/* Always-visible step bar */}
      <div className="sticky top-0 z-20 -mx-10 px-10 py-3 mb-6 bg-paper/90 backdrop-blur border-b border-line flex flex-wrap items-center justify-between gap-3">
        <Steps step={step} setStep={setStep} canScript={Boolean(project)} canVideo={Boolean(job || project?.exportUrl)} />
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-bad/20 bg-bad-soft text-bad px-4 py-3 text-[13px]">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="underline">Dismiss</button>
        </div>
      )}

      {step === 'loading' && <div className="flex items-center gap-2 text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Opening project...</div>}

      {/* 1. IDEA */}
      {step === 'idea' && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">
          <div className="card p-7">
            <h1 className="text-[26px]">Describe your Shot</h1>
            <p className="text-muted mt-1">Write it however you like. The AI turns it into a clear brief before anything is generated.</p>
            {trend && (
              <div className="mt-5 rounded-xl border border-line bg-paper p-3 text-[13px] flex gap-3">
                <span className="eyebrow mt-0.5">Trend</span>
                <div className="min-w-0"><div className="font-medium">{trend.title}</div><div className="text-muted text-[12px]">{trend.sourceName}. The source is credited in the caption.</div></div>
              </div>
            )}
            <label className="label mt-6" htmlFor="topic">Topic description</label>
            <div className="relative">
              <textarea id="topic" rows={4} maxLength={TOPIC_MAX} className="input resize-none text-[15px] leading-relaxed pb-8 relative bg-transparent"
                value={topic} onChange={(e) => setTopic(e.target.value.slice(0, TOPIC_MAX))} />
              <RollingHint active={!topic} />
              <span className={`absolute bottom-2.5 right-3 font-mono text-[11px] ${topic.length >= TOPIC_MAX ? 'text-bad' : 'text-faint'}`}>
                {topic.length}/{TOPIC_MAX}
              </span>
            </div>
            <div className="mt-6 grid sm:grid-cols-2 gap-6">
              <div><span className="label">Length</span><div className="seg">{DURATIONS.map((d) => <button key={d} aria-pressed={duration === d} onClick={() => setDuration(d)}>{d}s</button>)}</div></div>
              <div><span className="label">Tone</span><div className="seg">{TONES.map((t) => <button key={t} aria-pressed={tone === t} onClick={() => setTone(t)}>{t}</button>)}</div></div>
            </div>
            <div className="mt-6">
              <label className="label" htmlFor="voice">Narration voice</label>
              <select id="voice" className="input" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {(voices.length ? voices : [{ id: 'en-US-ChristopherNeural', name: 'Christopher' }]).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="mt-8 flex items-center justify-end gap-3">
              {busy === 'script' && <span className="text-[13px] text-muted">Writing on your machine...</span>}
              <button onClick={writeScript} disabled={busy === 'script'} className="btn btn-primary btn-lg">
                {busy === 'script' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write script
              </button>
            </div>
          </div>
          <aside className="card p-5 text-[13px]">
            <div className="eyebrow">How a Shot is made</div>
            <ol className="mt-4 space-y-4">
              {[['Brief', engine.mode === 'ai' ? `${engine.detail} on this computer turns your words into a hook, key points and a caption.` : 'The local AI is offline, so a template brief is used. Start Ollama in System for real AI.'],
                ['Scenes', cloud ? 'Gemini directs each scene and creates its image.' : 'Add a Gemini key in System to direct scenes and create images with AI.'],
                ['Video', cloud && shots?.videoEnabled ? 'Veo animates each scene; narration and captions are added locally.' : 'Scenes get motion, narration and captions locally with FFmpeg.']].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-[#EFEDE7] grid place-items-center font-mono text-[11px] shrink-0">{i + 1}</span>
                  <div><div className="font-medium">{t}</div><div className="text-muted mt-0.5">{d}</div></div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}

      {/* 2. SCRIPT */}
      {step === 'script' && project && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {project.aiGenerated ? <Badge tone="ok"><Sparkles className="w-3 h-3" /> Brief by local AI</Badge> : <Badge tone="warn">Template brief (local AI offline)</Badge>}
              {generated && <Badge tone={project.shotsProvider === 'gemini' ? 'accent' : 'neutral'}>Scenes by {project.shotsProvider === 'gemini' ? 'Gemini' : project.shotsProvider === 'local' ? 'local AI' : 'template'}</Badge>}
            </div>
            <input className="w-full bg-transparent text-[26px] font-semibold tracking-tight outline-none border-b border-transparent focus:border-line-strong pb-1"
              value={project.title || ''} onChange={(e) => update({ title: e.target.value })} aria-label="Title" />
            {project.hook && <p className="mt-2 text-muted">{project.hook}</p>}

            <div className="card p-5 mt-6 flex flex-wrap items-center gap-6">
              <div className="flex-1 min-w-[220px]">
                <div className="flex justify-between text-[13px]"><span className="font-medium">Scenes</span><span className="font-mono text-muted">{count}</span></div>
                <input type="range" min={2} max={5} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full mt-2" aria-label="Number of scenes" />
                <div className="flex justify-between text-[11px] text-faint font-mono"><span>2</span><span>5</span></div>
              </div>
              <div className="flex items-center gap-3">
                {progress && <span className="text-[13px] text-muted flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress}</span>}
                <button onClick={generateScenes} disabled={!!busy} className={`btn btn-lg ${generated ? 'btn-outline' : 'btn-accent'}`}>
                  {generated ? <RefreshCw className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />} {generated ? 'Regenerate' : 'Generate scenes'}
                </button>
              </div>
            </div>

            {generated && (
              <div className="mt-5 grid sm:grid-cols-2 gap-4">
                {project.scenes.map((s, i) => (
                  <SceneCard key={i} s={s} i={i} imgBusy={busy === `img-${i}`} disabled={!!busy} canRemove={project.scenes.length > 2}
                    onChange={updateScene} onNewImage={newImage} onRemove={removeScene} />
                ))}
              </div>
            )}
            {!generated && (
              <div className="mt-5 card border-dashed p-8 text-center text-[13px] text-muted">
                Choose how many scenes you want, then generate. Each scene gets an image, on-screen text and narration you can edit.
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-20 space-y-4">
            <div className="card p-5">
              <div className="eyebrow">Post text</div>
              <label className="label mt-4">Caption</label>
              <textarea rows={4} className="input resize-none text-[13px]" value={project.caption || ''} onChange={(e) => update({ caption: e.target.value })} />
              <label className="label mt-3">Hashtags</label>
              <input className="input text-[13px]" value={(project.hashtags || []).join(' ')} onChange={(e) => update({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })} />
              {project.sourceAttribution?.url && (
                <a href={project.sourceAttribution.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"><ExternalLink className="w-3 h-3" /> Source: {project.sourceAttribution.name}</a>
              )}
            </div>
            <button onClick={render} disabled={!generated || !!busy} className="btn btn-accent btn-lg w-full"><Clapperboard className="w-4 h-4" /> Render video</button>
            <p className="text-[12px] text-faint text-center">{generated ? `${project.scenes.length} scenes · about ${totalSeconds(project.scenes)}s` : 'Generate scenes first'}</p>
          </aside>
        </div>
      )}

      {/* 3. VIDEO */}
      {step === 'video' && project && (
        <div className="grid lg:grid-cols-[340px_1fr] gap-10 items-start">
          <Phone className="w-[300px] mx-auto lg:mx-0" aspect="aspect-[9/16]">
            {videoUrl
              ? <video key={videoUrl} src={videoUrl} controls playsInline className="absolute inset-0 w-full h-full object-contain bg-black" />
              : <div className="absolute inset-0 grid place-items-center text-white/70 text-[13px]">{job?.status === 'FAILED' ? 'Render failed' : <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Rendering</span>}</div>}
          </Phone>
          <div>
            <h1 className="text-[26px]">{project.title}</h1>
            <p className="text-muted mt-1">{project.scenes.length} scenes · {totalSeconds(project.scenes)}s · 720 x 1280</p>

            {job && job.status !== 'READY' && (
              <div className="card p-5 mt-6">
                <div className="flex justify-between text-[13px] font-medium">
                  <span>{job.status === 'FAILED' ? 'Render failed' : STAGES[stageIndex(job.status)]?.[1] || 'Starting'}{job.status === 'VISUAL_GENERATION' && job.currentScene ? ` · scene ${job.currentScene} of ${job.scenes?.length}` : ''}</span>
                  <span className="font-mono text-muted">{job.progress || 0}%</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-[#EFEDE7] overflow-hidden"><div className={`h-full rounded-full transition-all duration-700 ${job.status === 'FAILED' ? 'bg-bad' : 'bg-ink'}`} style={{ width: `${job.progress || 0}%` }} /></div>
                <ul className="mt-5 space-y-2.5 text-[13px]">
                  {STAGES.map(([k, label], i) => {
                    const cur = stageIndex(job.status);
                    const st = job.status === 'FAILED' ? (i < cur ? 'done' : i === cur ? 'fail' : 'todo') : i < cur ? 'done' : i === cur ? 'now' : 'todo';
                    return (
                      <li key={k} className={`flex items-center gap-2.5 ${st === 'todo' ? 'text-faint' : ''}`}>
                        {st === 'done' && <Check className="w-4 h-4 text-ok" />}{st === 'now' && <Loader2 className="w-4 h-4 animate-spin" />}{st === 'fail' && <AlertTriangle className="w-4 h-4 text-bad" />}
                        {st === 'todo' && <span className="w-4 h-4 grid place-items-center"><span className="w-1.5 h-1.5 rounded-full bg-line-strong" /></span>}
                        {label}
                      </li>
                    );
                  })}
                </ul>
                {job.status === 'VISUAL_GENERATION' && cloud && shots?.videoEnabled && <p className="mt-4 text-[12px] text-faint">Veo takes one to three minutes per scene.</p>}
                {job.status === 'FAILED' && <div className="mt-4 text-[13px] text-bad">{job.error || job.logs?.[job.logs.length - 1]}<button onClick={() => setStep('script')} className="btn btn-outline btn-sm ml-3">Back to script</button></div>}
              </div>
            )}

            {videoUrl && (
              <div className="mt-6 space-y-5">
                <div className="card p-5">
                  <div className="eyebrow">Ready to post on Qoneqt</div>
                  <p className="mt-3 text-[14px] whitespace-pre-line">{project.caption}</p>
                  <p className="mt-2 text-[13px] text-muted">{(project.hashtags || []).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={videoUrl} download className="btn btn-outline btn-sm"><Download className="w-3.5 h-3.5" /> Download MP4</a>
                    <button onClick={copyPost} className="btn btn-outline btn-sm">{copied ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy caption'}</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setStep('script')} className="btn btn-outline"><ArrowLeft className="w-4 h-4" /> Edit script</button>
                  <button onClick={saveVideo} className="btn btn-primary"><Save className="w-4 h-4" /> Save video</button>
                  <button onClick={discardVideo} className="btn btn-ghost hover:!text-bad"><X className="w-4 h-4" /> Discard video</button>
                  <button onClick={() => go('home')} className="btn btn-ghost ml-auto">Back <ArrowRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
