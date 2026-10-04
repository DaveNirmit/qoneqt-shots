import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Heart, MessageCircle, Send, Check, Download } from 'lucide-react';
import { Logo, Phone } from '../components/ui';

const HERO_SHOTS = [
  { img: '/shots/creator_phone.jpg', text: 'Your phone is a studio' },
  { img: '/shots/ai_robotics.jpg', text: 'AI writes the script for you' },
  { img: '/shots/creator_condenser.jpg', text: 'Narrated, captioned, ready to post' },
];

const FEED = [
  { img: '/shots/ai_datacenter.jpg', text: 'Where your data really goes', tag: 'Tech' },
  { img: '/shots/creator_condenser.jpg', text: '3 mic mistakes new creators make', tag: 'Creators' },
  { img: '/shots/ai_robotics.jpg', text: 'Robots that learn by watching', tag: 'Science' },
  { img: '/shots/creator_phone.jpg', text: 'Film better with the phone you own', tag: 'How-to' },
];

const STACK = [
  ['Brief', 'Qwen 2.5 (1.5B) through Ollama, on your own computer. About a 1 GB download, runs on an ordinary laptop CPU.'],
  ['Scenes', 'Google Gemini (free tier) writes each scene. Without a key, the local model does it.'],
  ['Visuals', 'Pollinations (free) paints each scene image from its description. Wikimedia Commons photos as a fallback.'],
  ['Voice', 'Natural Microsoft voices through edge-tts (needs internet), with the built-in Windows voices offline.'],
  ['Render', 'FFmpeg, bundled with the app, on your computer. H.264 MP4 at 720 x 1280 for a 9:16 feed.'],
];

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.12 }
    );
    ref.current?.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

function Caption({ children, size = 'md' }) {
  return (
    <span className={`inline bg-white text-ink font-semibold leading-[1.45] px-1.5 py-0.5 rounded-[4px] [box-decoration-break:clone] ${size === 'sm' ? 'text-[11px]' : 'text-[15px]'}`}>
      {children}
    </span>
  );
}

function SectionHead({ index, title, text }) {
  return (
    <div className="reveal max-w-2xl">
      <div className="eyebrow">{index}</div>
      <h2 className="mt-3 text-[40px] md:text-[48px]">{title}</h2>
      {text && <p className="mt-4 text-[17px] text-muted leading-relaxed">{text}</p>}
    </div>
  );
}

export default function LandingPage({ onStart, onOpenStudio }) {
  const ref = useReveal();
  const [idea, setIdea] = useState('');
  const submit = (e) => {
    e.preventDefault();
    onStart(idea.trim());
  };
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div ref={ref} className="bg-paper">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur border-b border-line">
        <div className="max-w-[1180px] mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size="lg" />
          <nav className="hidden md:flex items-center gap-1 text-[14px]">
            {[['feed', 'Qoneqt'], ['how', 'How it works'], ['studio', 'Studio'], ['stack', 'Under the hood']].map(([id, l]) => (
              <button key={id} onClick={() => scrollTo(id)} className="btn btn-ghost btn-sm">{l}</button>
            ))}
          </nav>
          <button onClick={onOpenStudio} className="btn btn-primary btn-sm">Get Started</button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-[1180px] mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-[1.15fr_.85fr] gap-16 items-center">
        <div className="fade-up">
          <span className="chip">
            <span className="w-1.5 h-1.5 rounded-full bg-accent rec" /> Built for the Qoneqt feed
          </span>
          <h1 className="mt-6 text-[52px] md:text-[72px] leading-[1.0] tracking-[-0.035em]">
            One sentence in.<br />
            A <span className="font-serif italic font-normal">Shot</span> out.
          </h1>
          <p className="mt-6 text-[18px] text-muted leading-relaxed max-w-[540px]">
            Qoneqt Shots turns an idea into a ready-to-post vertical video. A language model on your own laptop writes
            the script, a voice narrates it, and the studio renders a 9:16 MP4 for Qoneqt.
          </p>
          <form onSubmit={submit} className="mt-9 flex gap-2 max-w-[560px]">
            <input
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              className="input h-[46px] text-[15px]"
              placeholder="Why your phone battery dies faster in winter"
            />
            <button type="submit" className="btn btn-accent btn-lg shrink-0">
              Make a Shot <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          <p className="mt-3 text-[13px] text-faint">Free to run. Your idea is shaped by an AI on your own laptop.</p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <Phone className="w-[290px]">
            {HERO_SHOTS.map((s) => (
              <div key={s.img} className="shot">
                <img src={s.img} alt="" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
                <div className="absolute inset-x-5 top-[58%] text-center"><Caption>{s.text}</Caption></div>
              </div>
            ))}
            <div className="absolute top-9 inset-x-0 text-center text-[9px] tracking-[.25em] text-white/70 font-medium">QONEQT SHOTS</div>
            <div className="absolute right-3 bottom-24 flex flex-col gap-4 text-white">
              <Heart className="w-5 h-5" /><MessageCircle className="w-5 h-5" /><Send className="w-5 h-5" />
            </div>
            <div className="absolute left-4 bottom-6 right-14 text-white">
              <div className="text-[12px] font-semibold">@you</div>
              <div className="text-[11px] text-white/80 mt-0.5">Made with Qoneqt Shots</div>
            </div>
          </Phone>
        </div>
      </section>

      {/* 01 Qoneqt feed */}
      <section id="feed" className="border-t border-line py-24">
        <div className="max-w-[1180px] mx-auto px-6">
          <SectionHead
            index="01 / Qoneqt"
            title={<>The feed is vertical. <span className="font-serif italic font-normal text-muted">So are Shots.</span></>}
            text="On Qoneqt, people discover new voices through short vertical videos. Showing up there regularly means scripting, recording a voice-over, editing and exporting, again and again. Qoneqt Shots does that busywork so you can focus on the idea."
          />
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-5">
            {FEED.map((f, i) => (
              <div key={f.text} className="reveal" style={{ transitionDelay: `${i * 90}ms`, marginTop: i % 2 ? 40 : 0 }}>
                <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-ink">
                  <img src={f.img} alt="" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55" />
                  <span className="absolute top-3 left-3 text-[11px] font-medium text-white bg-black/35 backdrop-blur px-2 py-0.5 rounded-md">{f.tag}</span>
                  <div className="absolute inset-x-3 bottom-4"><Caption size="sm">{f.text}</Caption></div>
                </div>
              </div>
            ))}
          </div>
          <p className="reveal mt-6 text-[13px] text-faint">Illustrations of the Shot format.</p>
        </div>
      </section>

      {/* 02 How it works */}
      <section id="how" className="border-t border-line py-24 bg-card">
        <div className="max-w-[1180px] mx-auto px-6">
          <SectionHead index="02 / How it works" title="Three steps. A few minutes." />
          <div className="mt-14 grid md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="reveal">
              <div className="rounded-2xl border border-line bg-paper p-5 h-[220px] flex flex-col justify-center">
                <div className="label">What is your Shot about?</div>
                <div className="input text-[13px] h-[64px] leading-snug">Why your phone battery dies faster in winter<span className="inline-block w-px h-4 bg-ink align-middle ml-0.5 rec" /></div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="seg"><button aria-pressed="false">15s</button><button aria-pressed="true">30s</button><button aria-pressed="false">60s</button></div>
                  <span className="btn btn-primary btn-sm ml-auto">Write script</span>
                </div>
              </div>
              <h3 className="mt-6 text-[20px]">1. Describe it</h3>
              <p className="mt-2 text-muted">Type a topic, or start from a live trend. Pick a length and a voice.</p>
            </div>
            {/* Step 2 */}
            <div className="reveal" style={{ transitionDelay: '100ms' }}>
              <div className="rounded-2xl border border-line bg-paper p-5 h-[220px] flex flex-col justify-center gap-2">
                {[['Cold slows the chemistry', '6s'], ['Your battery is not broken', '5s'], ['Keep it in an inner pocket', '6s']].map(([t, d], i) => (
                  <div key={t} className="flex items-center gap-3 bg-card border border-line rounded-lg px-3 py-2.5">
                    <span className="font-mono text-[11px] text-faint">0{i + 1}</span>
                    <span className="text-[13px] font-medium truncate">{t}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted">{d}</span>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 text-[20px]">2. Review the script</h3>
              <p className="mt-2 text-muted">The AI writes a hook and scenes. Change any line, swap the order, set timing.</p>
            </div>
            {/* Step 3 */}
            <div className="reveal" style={{ transitionDelay: '200ms' }}>
              <div className="rounded-2xl border border-line bg-paper p-5 h-[220px] flex flex-col justify-center gap-3">
                <div className="bg-card border border-line rounded-lg p-3">
                  <div className="flex justify-between text-[12px]"><span className="font-medium">Rendering scene 3 of 4</span><span className="font-mono text-muted">72%</span></div>
                  <div className="mt-2 h-1.5 rounded-full bg-[#EFEDE7] overflow-hidden"><div className="h-full w-[72%] bg-ink rounded-full" /></div>
                </div>
                <div className="bg-card border border-line rounded-lg p-3 flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-ok-soft grid place-items-center"><Check className="w-4 h-4 text-ok" /></span>
                  <div className="text-[12px]"><div className="font-medium">winter_battery.mp4</div><div className="text-muted font-mono text-[11px]">720 x 1280 · 28s</div></div>
                  <Download className="w-4 h-4 ml-auto text-muted" />
                </div>
              </div>
              <h3 className="mt-6 text-[20px]">3. Render and post</h3>
              <p className="mt-2 text-muted">Get a captioned, narrated MP4 plus a ready caption and hashtags for Qoneqt.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 03 Studio */}
      <section id="studio" className="border-t border-line py-24">
        <div className="max-w-[1180px] mx-auto px-6">
          <SectionHead index="03 / The studio" title="One calm screen for the whole job."
            text="No timeline to learn and no layers to manage. Scenes on the left, the video on the right." />
          <div className="reveal mt-14 card overflow-hidden shadow-[0_30px_80px_-40px_rgba(22,20,15,.35)]">
            <div className="h-10 border-b border-line flex items-center gap-1.5 px-4 bg-paper">
              <span className="w-2.5 h-2.5 rounded-full bg-line-strong" /><span className="w-2.5 h-2.5 rounded-full bg-line-strong" /><span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
              <span className="ml-4 text-[12px] text-faint font-mono">localhost:5173/#/create</span>
            </div>
            <div className="grid grid-cols-[180px_1fr_260px] min-h-[420px]">
              <div className="border-r border-line p-4 bg-paper hidden md:block">
                <Logo />
                <div className="mt-6 space-y-1 text-[13px]">
                  {['Home', 'Create', 'Library', 'Trends'].map((n) => (
                    <div key={n} className={`px-2.5 h-8 flex items-center rounded-md ${n === 'Create' ? 'bg-card border border-line font-medium' : 'text-muted'}`}>{n}</div>
                  ))}
                </div>
              </div>
              <div className="p-6 col-span-3 md:col-span-1">
                <div className="flex items-center gap-2 text-[12px]"><span className="text-muted">Idea</span><span className="text-faint">/</span><span className="font-medium">Script</span><span className="text-faint">/</span><span className="text-muted">Video</span></div>
                <div className="mt-3 text-[20px] font-semibold">Why your battery hates winter</div>
                <div className="mt-5 space-y-2.5">
                  {[['creator_phone', 'Cold slows the chemistry', 'Lithium ions move slower when it is cold, so your phone reads less charge.'],
                    ['ai_robotics', 'Your battery is not broken', 'Warm it back up and most of that charge comes back.'],
                    ['creator_condenser', 'Keep it in an inner pocket', 'Body heat is the cheapest battery upgrade you will ever get.']].map(([img, t, n]) => (
                    <div key={t} className="flex gap-3 border border-line rounded-xl p-3 bg-card">
                      <img src={`/shots/${img}.jpg`} alt="" className="w-11 h-[60px] rounded-md object-cover shrink-0" />
                      <div className="min-w-0"><div className="text-[13px] font-semibold">{t}</div><div className="text-[12px] text-muted mt-0.5 line-clamp-2">{n}</div></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-l border-line bg-paper p-6 hidden md:flex items-center justify-center">
                <Phone className="w-[170px]">
                  <img src="/shots/creator_phone.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-x-3 top-[58%] text-center"><Caption size="sm">Cold slows the chemistry</Caption></div>
                </Phone>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 04 Stack */}
      <section id="stack" className="border-t border-line py-24 bg-card">
        <div className="max-w-[1180px] mx-auto px-6">
          <SectionHead index="04 / Under the hood" title="Free to run, honest about it."
            text="The thinking happens on your computer. Every service it uses is free. Here is exactly what runs on your computer and what goes online." />
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-5 border-t border-line">
            {STACK.map(([k, v], i) => (
              <div key={k} className={`reveal pt-6 pb-2 pr-6 ${i ? 'lg:border-l lg:pl-6' : ''} border-line`} style={{ transitionDelay: `${i * 80}ms` }}>
                <div className="eyebrow">{k}</div>
                <p className="mt-3 text-[15px] leading-relaxed">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="reveal max-w-[1180px] mx-auto rounded-3xl bg-ink text-white px-10 py-16 md:px-16 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <h2 className="text-[36px] md:text-[44px] max-w-xl">Your next Qoneqt post is <span className="font-serif italic font-normal">one sentence</span> away.</h2>
          <button onClick={onOpenStudio} className="btn btn-accent btn-lg">Get Started <ArrowRight className="w-4 h-4" /></button>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-[1180px] mx-auto px-6 h-16 flex items-center justify-between text-[13px] text-muted">
          <Logo />
          <span>Built for the Qoneqt hackathon</span>
        </div>
      </footer>
    </div>
  );
}
