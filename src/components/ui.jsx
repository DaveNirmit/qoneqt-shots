import React from 'react';

export function Logo({ size = 'md' }) {
  const box = size === 'lg' ? 'w-8 h-8 rounded-[9px]' : 'w-7 h-7 rounded-[8px]';
  const dot = size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span className={`${box} bg-ink grid place-items-center`}>
        <span className={`${dot} rounded-full bg-accent`} />
      </span>
      <span className={`${size === 'lg' ? 'text-[17px]' : 'text-[15px]'} font-semibold tracking-tight`}>
        Qoneqt <span className="font-serif italic font-normal text-[1.12em]">Shots</span>
      </span>
    </span>
  );
}

export function Dot({ tone = 'ok' }) {
  const c = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', idle: 'bg-faint' }[tone];
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}

export function Badge({ tone = 'neutral', children }) {
  const c = {
    neutral: 'bg-[#EFEDE7] text-ink-2',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    accent: 'bg-accent-soft text-accent',
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[12px] font-medium ${c}`}>{children}</span>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-[28px]">{title}</h1>
        {description && <p className="text-muted mt-1.5 max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="card border-dashed py-14 px-6 text-center">
      {Icon && <Icon className="w-5 h-5 mx-auto text-faint" strokeWidth={1.75} />}
      <div className="mt-3 font-medium">{title}</div>
      {text && <p className="text-muted text-[13px] mt-1 max-w-sm mx-auto">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A plain phone frame. Children render inside the 9:16 screen. */
export function Phone({ children, className = '' }) {
  return (
    <div className={`relative rounded-[36px] bg-ink p-[7px] shadow-[0_30px_60px_-20px_rgba(22,20,15,.35)] ${className}`}>
      <div className="relative w-full aspect-[9/19] rounded-[30px] overflow-hidden bg-[#0d0c0a]">
        {children}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[72px] h-[20px] rounded-full bg-ink" />
      </div>
    </div>
  );
}

/** Derive a single honest engine status from /api/doctor. */
export function engineState(doctor) {
  if (!doctor) return { tone: 'idle', label: 'Checking engine...', mode: 'unknown' };
  const ai = doctor.aiRuntime || {};
  if (ai.online && ai.defaultModelInstalled)
    return { tone: 'ok', label: 'AI ready', detail: ai.defaultModel, mode: 'ai' };
  if (ai.online)
    return { tone: 'warn', label: 'Model not installed', detail: 'Run npm run setup', mode: 'template' };
  return { tone: 'warn', label: 'Ollama not running', detail: 'Template mode', mode: 'template' };
}

export const timeAgo = (d) => {
  if (!d) return '';
  const m = Math.max(1, Math.round((Date.now() - new Date(d)) / 60000));
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
