import React, { useCallback, useEffect, useState } from 'react';
import { Home, Clapperboard, FolderOpen, TrendingUp, Activity, Plus } from 'lucide-react';
import { Logo, Dot, engineState } from './components/ui';
import { Notifications } from './components/notify';
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import CreatePage from './pages/CreatePage';
import LibraryPage from './pages/LibraryPage';
import TrendsPage from './pages/TrendsPage';
import SystemPage from './pages/SystemPage';
import { fetchDoctor, fetchProjects, fetchTTSVoices, fetchShotsStatus } from './utils/api';

const NAV = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'create', label: 'Create', icon: Clapperboard },
  { id: 'library', label: 'Library', icon: FolderOpen },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
];
const ROUTES = ['home', 'create', 'library', 'trends', 'system'];

const readRoute = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] || '';

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [doctor, setDoctor] = useState(null);
  const [projects, setProjects] = useState([]);
  const [voices, setVoices] = useState([]);
  const [shots, setShots] = useState(null);
  // What the Create page opens with: { topic, trend, projectId }
  const [draft, setDraft] = useState({ key: 0 });

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((r) => {
    window.location.hash = `/${r}`;
    window.scrollTo(0, 0);
  }, []);

  const refreshProjects = useCallback(
    () => fetchProjects().then((d) => setProjects(d.projects || [])).catch(() => {}),
    []
  );
  const refreshDoctor = useCallback(
    () => fetchDoctor().then(setDoctor).catch(() => setDoctor({ aiRuntime: { online: false } })),
    []
  );

  useEffect(() => {
    refreshDoctor();
    refreshProjects();
    fetchTTSVoices().then((d) => setVoices(d.voices || [])).catch(() => {});
    fetchShotsStatus().then(setShots).catch(() => setShots({ configured: false }));
  }, [refreshDoctor, refreshProjects]);

  const startCreate = (opts = {}) => {
    setDraft({ key: Date.now(), topic: '', ...opts });
    go('create');
  };

  if (!route) {
    return <LandingPage onStart={(topic) => startCreate({ topic })} onOpenStudio={() => go('home')} />;
  }

  const engine = engineState(doctor);

  return (
    <div className="min-h-screen flex">
      <Notifications />
      <aside className="w-[232px] shrink-0 h-screen sticky top-0 border-r border-line bg-paper flex flex-col px-3 py-4">
        <button onClick={() => go('')} className="px-2 py-1.5 text-left" title="Back to the Qoneqt Shots site">
          <Logo />
        </button>

        <button onClick={() => startCreate()} className="btn btn-primary mt-6 mb-4 w-full">
          <Plus className="w-4 h-4" strokeWidth={2} /> New Shot
        </button>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = route === id;
            return (
              <button
                key={id}
                onClick={() => go(id)}
                className={`flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[14px] text-left border transition-colors ${
                  active
                    ? 'bg-card border-line text-ink font-medium shadow-[0_1px_2px_rgba(22,20,15,.04)]'
                    : 'border-transparent text-muted hover:text-ink hover:bg-[#EFEDE7]'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} /> {label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => go('system')}
          className={`mt-auto w-full text-left rounded-xl border p-3 transition-colors ${
            route === 'system' ? 'bg-card border-line' : 'border-transparent hover:bg-[#EFEDE7]'
          }`}
        >
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Activity className="w-4 h-4 text-muted" strokeWidth={1.75} /> System
            <span className="ml-auto"><Dot tone={engine.tone} /></span>
          </div>
          <div className="mt-1.5 text-[12px] text-muted leading-snug">
            {engine.label}
            {engine.detail && <span className="block font-mono text-[11px] text-faint mt-0.5">{engine.detail}</span>}
          </div>
        </button>
      </aside>

      <main className="flex-1 min-w-0">
        <div key={route} className="fade-up max-w-[1120px] mx-auto px-10 py-10">
          {route === 'home' && (
            <HomePage projects={projects} engine={engine} doctor={doctor} shots={shots} onCreate={startCreate}
              onOpen={(id) => startCreate({ projectId: id })} go={go} />
          )}
          {route === 'create' && (
            <CreatePage key={draft.key} draft={draft} engine={engine} voices={voices} shots={shots} onSaved={refreshProjects} onNew={() => startCreate()} go={go} />
          )}
          {route === 'library' && (
            <LibraryPage projects={projects} onOpen={(id) => startCreate({ projectId: id })}
              onCreate={startCreate} onChanged={refreshProjects} />
          )}
          {route === 'trends' && <TrendsPage onUse={(trend) => startCreate({ topic: trend.title, trend })} />}
          {route === 'system' && <SystemPage doctor={doctor} shots={shots} onRefresh={refreshDoctor} onRefreshShots={() => fetchShotsStatus().then(setShots)} />}
          {!ROUTES.includes(route) && (
            <div className="text-muted">
              Page not found. <button className="underline" onClick={() => go('home')}>Go home</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
