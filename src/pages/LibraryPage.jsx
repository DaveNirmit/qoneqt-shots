import React, { useMemo, useState } from 'react';
import { Search, Copy, Trash2, FolderOpen, Download, Plus, Film, Play } from 'lucide-react';
import { Badge, Empty, PageHeader, timeAgo } from '../components/ui';
import { duplicateProject, deleteProject } from '../utils/api';
import { toast, confirm } from '../components/notify';

const FILTERS = [['all', 'All'], ['rendered', 'Rendered'], ['draft', 'Drafts']];
const SORTS = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['rendered', 'Rendered first'], ['az', 'A to Z']];
const byDate = (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);

export default function LibraryPage({ projects, onOpen, onCreate, onChanged }) {
  const [q, setQ] = useState('');
  // Default to rendered Shots; fall back to all when nothing has been rendered yet.
  const [filter, setFilter] = useState(() => (projects.some((p) => p.exportUrl) ? 'rendered' : 'all'));
  const [sort, setSort] = useState('newest');
  const [pending, setPending] = useState('');

  const list = useMemo(() => {
    const out = projects.filter((p) => {
      if (filter === 'rendered' && !p.exportUrl) return false;
      if (filter === 'draft' && p.exportUrl) return false;
      return !q || `${p.title} ${p.concept}`.toLowerCase().includes(q.toLowerCase());
    });
    if (sort === 'newest') out.sort(byDate);
    if (sort === 'oldest') out.sort((a, b) => -byDate(a, b));
    if (sort === 'rendered') out.sort((a, b) => Number(Boolean(b.exportUrl)) - Number(Boolean(a.exportUrl)) || byDate(a, b));
    if (sort === 'az') out.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return out;
  }, [projects, q, filter, sort]);

  const act = async (fn, id, message) => {
    setPending(id);
    try { await fn(id); await onChanged(); if (message) toast(message); }
    catch { toast('That did not work. Is the server running?', 'bad'); }
    finally { setPending(''); }
  };
  const remove = async (p) => {
    const ok = await confirm({ title: `Delete "${p.title}"?`, text: 'This removes the script and its video. It cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (ok) act(deleteProject, p.id, 'Project deleted', 'info');
  };

  return (
    <div>
      <PageHeader title="Library" description="Every Shot you have written, rendered or not."
        actions={<button onClick={() => onCreate()} className="btn btn-primary"><Plus className="w-4 h-4" /> New Shot</button>} />

      {projects.length === 0 ? (
        <Empty icon={FolderOpen} title="Your library is empty" text="Write your first script and it is saved here automatically."
          action={<button onClick={() => onCreate()} className="btn btn-primary btn-sm">Create a Shot</button>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="input pl-9" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="seg">{FILTERS.map(([id, l]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>)}</div>
            <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              {SORTS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
            <span className="ml-auto text-[13px] text-muted">{list.length} of {projects.length}</span>
          </div>

          {list.length === 0 ? (
            <Empty icon={Search} title="No matches" text="Try a different search or filter." />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {list.map((p, i) => (
                <div key={p.id} className={`card lift overflow-hidden flex flex-col pop-in ${pending === p.id ? 'opacity-50' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                  <button onClick={() => onOpen(p.id)} className="text-left flex-1">
                    <div className="relative aspect-[4/5] bg-[#EFEDE7]">
                      {p.thumbnail
                        ? <img src={p.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <Film className="w-5 h-5 text-faint absolute inset-0 m-auto" strokeWidth={1.75} />}
                      {p.exportUrl && <span className="absolute bottom-2.5 left-2.5 w-7 h-7 rounded-full bg-white/90 grid place-items-center"><Play className="w-3.5 h-3.5 ml-0.5" /></span>}
                      <span className="absolute top-2.5 right-2.5">{p.exportUrl ? <Badge tone="ok">Rendered</Badge> : <Badge>Draft</Badge>}</span>
                    </div>
                    <div className="p-4">
                      <div className="font-medium leading-snug line-clamp-2">{p.title}</div>
                      {p.concept && <div className="text-[12px] text-muted mt-1 line-clamp-2">{p.concept}</div>}
                      <div className="text-[12px] text-faint mt-2">{p.scenesCount} scenes{p.totalDuration ? ` · ${p.totalDuration}s` : ''} · {timeAgo(p.updatedAt)}</div>
                    </div>
                  </button>
                  <div className="border-t border-line flex">
                    {p.exportUrl && <a href={p.exportUrl} download className="btn btn-ghost btn-sm flex-1 rounded-none"><Download className="w-3.5 h-3.5" /> MP4</a>}
                    <button onClick={() => act(duplicateProject, p.id, 'Project duplicated')} className="btn btn-ghost btn-sm flex-1 rounded-none"><Copy className="w-3.5 h-3.5" /> Copy</button>
                    <button onClick={() => remove(p)} className="btn btn-ghost btn-sm flex-1 rounded-none hover:!text-bad"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
