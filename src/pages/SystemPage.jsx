import React, { useState } from 'react';
import { RefreshCw, Play, Power, Cpu, Mic, Clapperboard, Monitor, Check, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Badge, Dot, PageHeader } from '../components/ui';
import { startRuntime, verifyModel } from '../utils/api';

function Section({ icon: Icon, title, status, children }) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-muted" strokeWidth={1.75} />
        <h2 className="text-[16px]">{title}</h2>
        <span className="ml-auto">{status}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-line last:border-0 text-[13px]">
    <span className="text-muted">{k}</span><span className="font-mono text-[12px] text-right break-all">{v}</span>
  </div>
);

export default function SystemPage({ doctor, shots, onRefresh, onRefreshShots }) {
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState(null);
  const [note, setNote] = useState('');

  const refresh = async () => { setBusy('refresh'); await onRefresh(); setBusy(''); };
  const start = async () => {
    setBusy('start'); setNote('');
    try {
      const r = await startRuntime();
      setNote(r?.error || r?.message || 'Start requested.');
    } catch { setNote('Could not start Ollama.'); }
    await onRefresh(); setBusy('');
  };
  const runTest = async () => {
    setBusy('test'); setTest(null);
    const t0 = performance.now();
    try { const r = await verifyModel(ai.defaultModel); setTest({ ...r, ms: Math.round(performance.now() - t0) }); }
    catch (e) { setTest({ success: false, error: e.message }); }
    setBusy('');
  };

  if (!doctor) return <div className="flex items-center gap-2 text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Running checks...</div>;

  const ai = doctor.aiRuntime || {};
  const sys = doctor.system || {};
  const ff = doctor.videoRenderer || {};
  const voices = (doctor.speech?.voices || []).filter((v) => v.id !== 'none');
  const aiTone = ai.online && ai.defaultModelInstalled ? 'ok' : 'warn';

  return (
    <div>
      <PageHeader title="System" description="Live checks of everything Qoneqt Shots needs on this computer."
        actions={<button onClick={refresh} disabled={!!busy} className="btn btn-outline"><RefreshCw className={`w-4 h-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Re-run checks</button>} />

      <div className="grid lg:grid-cols-2 gap-5">
        <Section icon={Cpu} title="Script writer (Ollama)"
          status={<Badge tone={aiTone}><Dot tone={aiTone} /> {ai.online ? (ai.defaultModelInstalled ? 'Ready' : 'Model missing') : 'Offline'}</Badge>}>
          <Row k="Runtime" v={ai.online ? `Running at ${ai.host}` : 'Not reachable'} />
          <Row k="Default model" v={`${ai.defaultModel}${ai.defaultModelInstalled ? '' : ' (not installed)'}`} />
          <Row k="Installed models" v={(ai.installedModels || []).map((m) => m.name).join(', ') || 'None'} />
          {!ai.online && <p className="mt-4 text-[13px] text-muted">Without Ollama, scripts are drafted from templates. Install it from ollama.com, then run <code className="font-mono text-ink">npm run setup</code>.</p>}
          {ai.online && !ai.defaultModelInstalled && <p className="mt-4 text-[13px] text-muted">Run <code className="font-mono text-ink">npm run setup</code> once to download the model (about 1 GB).</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {!ai.online && <button onClick={start} disabled={!!busy} className="btn btn-outline btn-sm"><Power className="w-3.5 h-3.5" /> Start Ollama</button>}
            <button onClick={runTest} disabled={!!busy || !ai.online || !ai.defaultModelInstalled} className="btn btn-primary btn-sm">
              {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Test the model
            </button>
          </div>
          {note && <p className="mt-3 text-[13px] text-muted">{note}</p>}
          {test && (
            <div className={`mt-3 rounded-lg p-3 text-[12px] font-mono ${test.success ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
              {test.success ? <><Check className="w-3.5 h-3.5 inline mr-1" />Answered in {test.ms} ms: {JSON.stringify(test.response)}</>
                : <><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />{test.error}</>}
            </div>
          )}
        </Section>

        <Section icon={Sparkles} title="Scene and image AI (Gemini)"
          status={<Badge tone={!shots ? 'neutral' : shots.valid ? 'ok' : shots.configured ? 'bad' : 'warn'}>
            <Dot tone={!shots ? 'idle' : shots.valid ? 'ok' : shots.configured ? 'bad' : 'warn'} /> {!shots ? 'Checking' : shots.valid ? 'Connected' : shots.configured ? 'Key rejected' : 'No key'}
          </Badge>}>
          <Row k="API key" v={!shots ? '...' : shots.configured ? 'Set in .env' : 'Not set'} />
          <Row k="Scene director" v={`${shots?.models?.text || ''}${shots?.listed && !shots.listed.text ? ' (not visible to this key)' : ''}`} />
          <Row k="Image model" v={`${shots?.models?.image || ''}${shots?.listed && !shots.listed.image ? ' (not visible to this key)' : ''}`} />
          <Row k="Video model (Veo)" v={shots?.videoEnabled === false ? 'Off (GEMINI_VIDEO=off)' : `${shots?.models?.video || ''}${shots?.listed && !shots.listed.video ? ' (needs billing)' : ''}`} />
          {shots?.error && <p className="mt-3 text-[12px] text-bad">{shots.error}</p>}
          {shots && !shots.configured && (
            <p className="mt-4 text-[13px] text-muted">Create a key at aistudio.google.com/apikey, put <code className="font-mono text-ink">GEMINI_API_KEY=...</code> in a <code className="font-mono text-ink">.env</code> file in the project folder, then restart the app. Without it, scenes are directed by the local model and images come from stock search.</p>
          )}
          <div className="mt-4"><button onClick={onRefreshShots} className="btn btn-outline btn-sm"><RefreshCw className="w-3.5 h-3.5" /> Check again</button></div>
        </Section>

        <Section icon={Clapperboard} title="Video renderer (FFmpeg)"
          status={<Badge tone={ff.available ? 'ok' : 'bad'}><Dot tone={ff.available ? 'ok' : 'bad'} /> {ff.available ? 'Ready' : 'Missing'}</Badge>}>
          <Row k="Version" v={String(ff.version || 'unknown').slice(0, 60)} />
          <Row k="Output" v="H.264 MP4 · 720 x 1280 · 30 fps" />
        </Section>

        <Section icon={Mic} title="Narration voices" status={<Badge>{voices.length} available</Badge>}>
          <div className="max-h-[220px] overflow-auto -mx-1 px-1">
            {voices.map((v) => <Row key={v.id} k={v.name} v={/Windows/i.test(v.provider || '') ? 'offline' : 'online'} />)}
          </div>
          <p className="mt-3 text-[12px] text-faint">Neural voices need internet (edge-tts). If they are unavailable, Windows voices are used offline.</p>
        </Section>

        <Section icon={Monitor} title="This computer">
          <Row k="Platform" v={`${sys.platform} (${sys.arch})`} />
          <Row k="Node.js" v={sys.nodeVersion} />
          <Row k="Memory" v={`${sys.freeMemoryGB} GB free of ${sys.totalMemoryGB} GB`} />
          <Row k="Free disk" v={`${sys.diskFreeGB} GB`} />
        </Section>
      </div>
    </div>
  );
}
