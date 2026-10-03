import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, Film, Cpu, Mic, Clapperboard, Sparkles } from 'lucide-react';
import { Badge, Dot, Empty, timeAgo } from '../components/ui';

export function ProjectThumb({ src, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[#EFEDE7] shrink-0 ${className}`}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : <Film className="w-4 h-4 text-faint absolute inset-0 m-auto" strokeWidth={1.75} />}
    </div>
  );
}

function readiness(doctor, shots) {
  const ai = doctor?.aiRuntime || {};
  const cloud = {
    icon: Sparkles, name: 'Scene and image AI (Gemini)',
    tone: !shots ? 'idle' : shots.valid ? 'ok' : shots.configured ? 'bad' : 'warn',
    value: !shots ? 'Checking...' : shots.valid ? `${shots.models?.image || 'ready'}${shots.videoEnabled ? ' · Veo video on' : ''}`
      : shots.configured ? 'Key rejected. Check GEMINI_API_KEY in .env' : 'No key. Scenes use the local AI and stock images',
  };
  const voices = doctor?.speech?.voices || [];
  const offline = voices.filter((v) => /Windows/i.test(v.provider || '')).length;
  const ff = doctor?.videoRenderer || {};
  return [
    {
      icon: Cpu, name: 'Script writer',
      tone: !doctor ? 'idle' : ai.online && ai.defaultModelInstalled ? 'ok' : 'warn',
      value: !doctor ? 'Checking...' : ai.online && ai.defaultModelInstalled ? ai.defaultModel
        : ai.online ? 'Model missing. Run npm run setup' : 'Ollama is not running. Using templates',
    },
    {
      icon: Mic, name: 'Narration',
      tone: !doctor ? 'idle' : offline > 0 ? 'ok' : 'warn',
      value: !doctor ? 'Checking...' : `Neural voices (online)${offline ? ` + ${offline} offline Windows voice${offline > 1 ? 's' : ''}` : ''}`,
    },
    {
      icon: Clapperboard, name: 'Video renderer',
      tone: !doctor ? 'idle' : ff.available ? 'ok' : 'bad',
      value: !doctor ? 'Checking...' : ff.available ? `FFmpeg ${String(ff.version || '').split(' ')[0] || 'bundled'}` : 'FFmpeg not found',
    },
    cloud,
  ];
}

export default function HomePage({ projects, doctor, shots, onCreate, onOpen, go }) {
  const [idea, setIdea] = useState('');
  const rendered = projects.filter((p) => p.exportUrl).length;
  const recent = [...projects].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0, 4);
  const rows = readiness(doctor, shots);

  return (
    <div>
      <section className="card p-8">
        <h1 className="text-[30px]">What is your next Shot about?</h1>
        <p className="text-muted mt-1.5">Describe it in a sentence. You can edit everything before rendering.</p>
        <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); onCreate({ topic: idea.trim() }); }}>
          <input className="input h-[46px] text-[15px]" value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. Three habits that make morning study sessions stick" />
          <button className="btn btn-primary btn-lg shrink-0">Write script <ArrowRight className="w-4 h-4" /></button>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Need an idea?
          <button onClick={() => go('trends')} className="chip hover:border-line-strong">Browse live trends <ArrowUpRight className="w-3 h-3" /></button>
        </div>
      </section>

      <div className="mt-8 grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[17px]">Recent projects</h2>
            {projects.length > 0 && <button onClick={() => go('library')} className="btn btn-ghost btn-sm">View all</button>}
          </div>
          {recent.length === 0 ? (
            <Empty icon={Film} title="No Shots yet" text="Your projects will appear here after you write your first script." />
          ) : (
            <div className="card divide-y divide-line">
              {recent.map((p) => (
                <button key={p.id} onClick={() => onOpen(p.id)} className="w-full flex items-center gap-4 p-3 text-left hover:bg-[#FBFAF7] first:rounded-t-[14px] last:rounded-b-[14px]">
                  <ProjectThumb src={p.thumbnail} className="w-12 h-[68px]" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.title}</div>
                    <div className="text-[12px] text-muted mt-0.5">
                      {p.scenesCount} scenes{p.totalDuration ? ` · ${p.totalDuration}s` : ''} · {timeAgo(p.updatedAt)}
                    </div>
                  </div>
                  {p.exportUrl ? <Badge tone="ok">Rendered</Badge> : <Badge>Draft</Badge>}
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px]">Studio readiness</h2>
              <button onClick={() => go('system')} className="text-[12px] text-muted hover:text-ink">Details</button>
            </div>
            <ul className="mt-4 space-y-4">
              {rows.map(({ icon: Icon, name, tone, value }) => (
                <li key={name} className="flex gap-3">
                  <Icon className="w-4 h-4 mt-0.5 text-muted shrink-0" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-medium">{name}<span className="ml-auto"><Dot tone={tone} /></span></div>
                    <div className="text-[12px] text-muted mt-0.5 break-words">{value}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {projects.length > 0 && (
            <div className="card grid grid-cols-2 divide-x divide-line">
              <div className="p-5"><div className="text-[26px] font-semibold tracking-tight">{projects.length}</div><div className="text-[12px] text-muted">Projects</div></div>
              <div className="p-5"><div className="text-[26px] font-semibold tracking-tight">{rendered}</div><div className="text-[12px] text-muted">Videos rendered</div></div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
