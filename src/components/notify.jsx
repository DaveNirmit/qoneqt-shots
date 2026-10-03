import React, { useEffect, useState } from 'react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

// Tiny app-wide notification store: toast(message, tone) and confirm({...}) -> Promise<boolean>.
const listeners = new Set();
let seq = 0;
const emit = (event) => listeners.forEach((fn) => fn(event));

export function toast(message, tone = 'ok') {
  emit({ type: 'toast', id: ++seq, message, tone });
}

export function confirm({ title, text, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => emit({ type: 'confirm', id: ++seq, title, text, confirmLabel, cancelLabel, danger, resolve }));
}

const ICONS = { ok: Check, warn: AlertTriangle, bad: AlertTriangle, info: Info };
const TONES = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-muted' };

export function Notifications() {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const onEvent = (e) => {
      if (e.type === 'toast') {
        setToasts((t) => [...t, e]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== e.id)), 3600);
      } else if (e.type === 'confirm') {
        setDialog(e);
      }
    };
    listeners.add(onEvent);
    return () => listeners.delete(onEvent);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (ev) => { if (ev.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = (answer) => { dialog?.resolve(answer); setDialog(null); };

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className="pointer-events-auto fade-up flex items-center gap-2.5 bg-ink text-white text-[13px] pl-3.5 pr-2 py-2.5 rounded-xl shadow-[0_12px_30px_-10px_rgba(22,20,15,.5)]">
              <Icon className={`w-4 h-4 ${TONES[t.tone] || ''}`} />
              <span>{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="ml-1 p-1 rounded-md hover:bg-white/10" aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[110] grid place-items-center p-6" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => close(false)} />
          <div className="relative card w-full max-w-sm p-6 fade-up shadow-[0_30px_80px_-30px_rgba(22,20,15,.45)]">
            <h2 id="dlg-title" className="text-[18px]">{dialog.title}</h2>
            {dialog.text && <p className="text-muted mt-2 text-[14px]">{dialog.text}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => close(false)} className="btn btn-outline">{dialog.cancelLabel}</button>
              <button onClick={() => close(true)} autoFocus className={`btn ${dialog.danger ? 'bg-bad text-white hover:bg-[#A82A17]' : 'btn-primary'}`}>{dialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
