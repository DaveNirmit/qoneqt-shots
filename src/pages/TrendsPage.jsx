import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ExternalLink, ArrowRight, TrendingUp, AlertTriangle, Hash } from 'lucide-react';
import { Badge, Dot, Empty, PageHeader, timeAgo } from '../components/ui';
import { fetchTrends, fetchQoneqtTrends } from '../utils/api';

const CATEGORY_TONES = ['bg-ink text-white', 'bg-accent text-white', 'bg-[#1F4E79] text-white', 'bg-[#4F6F52] text-white', 'bg-[#7A3E65] text-white', 'bg-[#B76E00] text-white'];
const toneFor = (s = '') => CATEGORY_TONES[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % CATEGORY_TONES.length];

function Featured({ items, onUse }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [items.length]);
  if (!items.length) return null;
  return (
    <div className="relative rounded-3xl overflow-hidden bg-ink text-white min-h-[320px]">
      {items.map((t, k) => (
        <div key={t.id} className={`absolute inset-0 p-8 md:p-10 flex flex-col transition-opacity duration-700 ${k === i ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex items-center gap-2 text-[12px] text-white/70">
            <span className="font-medium text-white">{t.sourceName}</span>
            {t.category && <span className="px-2 py-0.5 rounded-md bg-white/10">{t.category}</span>}
            {t.retrievalTime && <span>· {timeAgo(t.retrievalTime)}</span>}
          </div>
          <h2 className="mt-5 text-[30px] md:text-[40px] leading-[1.08] max-w-3xl font-serif font-normal">{t.title}</h2>
          {t.videoAngle && <p className="mt-4 text-white/70 max-w-2xl text-[15px]">Shot angle: {t.videoAngle}</p>}
          <div className="mt-auto pt-6 flex flex-wrap items-center gap-3">
            <button onClick={() => onUse(t)} className="btn btn-accent">Make a Shot <ArrowRight className="w-4 h-4" /></button>
            {t.sourceUrl && <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost !text-white/80 hover:!text-white hover:!bg-white/10"><ExternalLink className="w-4 h-4" /> Read source</a>}
          </div>
        </div>
      ))}
      <div className="absolute bottom-0 inset-x-0 flex gap-1.5 px-8 md:px-10 pb-5">
        {items.map((t, k) => (
          <button key={t.id} onClick={() => setI(k)} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden" aria-label={`Story ${k + 1}`}>
            {k === i && <span key={i} className="block h-full bg-white bar-run" />}
            {k < i && <span className="block h-full bg-white/60" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TrendsPage({ onUse }) {
  const [data, setData] = useState(null);
  const [qoneqt, setQoneqt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('all');

  const load = async (force = false) => {
    setLoading(true); setError('');
    try { setData(await fetchTrends(force)); }
    catch { setError('Live news could not be loaded. Check your internet connection.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); fetchQoneqtTrends().then(setQoneqt).catch(() => setQoneqt({ configured: false, items: [] })); }, []);

  const items = (data?.items || []).filter((t) => t.isLive !== false);
  const sources = useMemo(() => [...new Map(items.map((t) => [t.sourceId, t.sourceName])).entries()], [items]);
  const shown = source === 'all' ? items : items.filter((t) => t.sourceId === source);
  const featured = shown.slice(0, 5);
  const rest = shown.slice(5);
  const health = Object.entries(data?.sources || {});

  return (
    <div>
      <PageHeader title="Trends" description="What people are talking about right now, from live news sources and on Qoneqt. Pick one and the studio drafts a Shot about it."
        actions={<button onClick={() => load(true)} disabled={loading} className="btn btn-outline"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>} />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {health.map(([id, s]) => {
          const ok = ['active', 'live', 'ok'].includes(s.status);
          return (
            <span key={id} className="chip" title={s.note || s.error || ''}>
              <Dot tone={ok ? 'ok' : s.status === 'requires_credentials' ? 'idle' : 'warn'} /> {s.name || id}
              <span className="text-faint">{s.status === 'requires_credentials' ? 'needs credentials' : ok ? 'live' : s.status}</span>
            </span>
          );
        })}
        {sources.length > 1 && (
          <div className="seg ml-auto">
            <button aria-pressed={source === 'all'} onClick={() => setSource('all')}>All</button>
            {sources.map(([id, name]) => <button key={id} aria-pressed={source === id} onClick={() => setSource(id)}>{name}</button>)}
          </div>
        )}
      </div>

      {error && <div className="mb-5 flex items-center gap-2 text-[13px] text-bad"><AlertTriangle className="w-4 h-4" /> {error}</div>}

      {loading && !data ? (
        <div className="space-y-4"><div className="skeleton h-[320px] rounded-3xl" /><div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[150px] rounded-[14px]" />)}</div></div>
      ) : shown.length === 0 ? (
        <Empty icon={TrendingUp} title="No live stories right now" text="Try refreshing in a minute." />
      ) : (
        <>
          <Featured items={featured} onUse={onUse} />
          {rest.length > 0 && (
            <div className="mt-5 grid md:grid-cols-2 gap-4">
              {rest.map((t, i) => (
                <div key={t.id} className="card lift p-5 flex flex-col pop-in" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <span className="font-medium text-ink-2">{t.sourceName}</span>
                    {t.category && <Badge>{t.category}</Badge>}
                    {t.retrievalTime && <span className="text-faint ml-auto">{timeAgo(t.retrievalTime)}</span>}
                  </div>
                  <h3 className="mt-3 text-[18px] leading-snug font-medium">{t.title}</h3>
                  {t.videoAngle && <p className="mt-2 text-[13px] text-muted line-clamp-2">Angle: {t.videoAngle}</p>}
                  <div className="mt-auto pt-4 flex items-center gap-2">
                    <button onClick={() => onUse(t)} className="btn btn-outline btn-sm">Make a Shot <ArrowRight className="w-3.5 h-3.5" /></button>
                    {t.sourceUrl && <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><ExternalLink className="w-3.5 h-3.5" /> Source</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Trending on Qoneqt */}
      <section className="mt-14">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <div className="eyebrow">On Qoneqt</div>
            <h2 className="text-[24px] mt-1">Trending on Qoneqt</h2>
          </div>
          {qoneqt?.configured && <span className="text-[12px] text-faint">{qoneqt.source}{qoneqt.updatedAt ? ` · updated ${timeAgo(qoneqt.updatedAt)}` : ''}</span>}
        </div>
        {!qoneqt ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[180px] rounded-[14px]" />)}</div>
        ) : qoneqt.items.length === 0 ? (
          <Empty icon={Hash} title="No Qoneqt trends connected" text="Add entries to server/data/qoneqt-trends.json, or connect Qoneqt's trends feed when it is available." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {qoneqt.items.map((t, i) => (
              <button key={t.id} onClick={() => onUse({ id: t.id, title: t.title, sourceName: 'Qoneqt', summary: t.why, category: t.category })}
                className={`lift rounded-2xl p-5 text-left flex flex-col min-h-[190px] pop-in ${toneFor(t.category)}`} style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-center justify-between text-[12px] opacity-80"><span>{t.category}</span><span className="font-mono">{String(i + 1).padStart(2, '0')}</span></div>
                <div className="mt-4 font-serif text-[26px] leading-tight">{t.hashtag}</div>
                <div className="mt-1.5 text-[14px] font-medium leading-snug">{t.title}</div>
                {t.why && <div className="mt-auto pt-4 text-[12px] opacity-80 leading-snug">{t.why}</div>}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
