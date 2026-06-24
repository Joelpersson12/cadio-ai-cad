import { useState, useRef, useCallback } from 'react'
import type { AdSelection, AdDesign } from '../../types'

interface Props {
  adSelection: AdSelection
  adDesign: AdDesign
  onBack: () => void
  onReset: () => void
}

type ReelPhase = 'idle' | 'playing' | 'done'

function useReelPlayer() {
  const [phase, setPhase] = useState<ReelPhase>('idle')
  const [tick, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const play = useCallback(() => {
    if (phase === 'playing') return
    setPhase('playing')
    setTick(t => t + 1)
    timerRef.current = setTimeout(() => setPhase('done'), 4500)
  }, [phase])

  const replay = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase('idle')
    setTimeout(() => {
      setPhase('playing')
      setTick(t => t + 1)
      timerRef.current = setTimeout(() => setPhase('done'), 4500)
    }, 50)
  }, [])

  return { phase, tick, play, replay }
}

function ReelPhone({ selection, design, phase, tick }: {
  selection: AdSelection
  design: AdDesign
  phase: ReelPhase
  tick: number
}) {
  const isPlaying = phase === 'playing' || phase === 'done'

  const bgStyle: React.CSSProperties = design.template === 'vibrant'
    ? { background: `linear-gradient(160deg, ${design.primaryColor}, ${design.accentColor}, #ff6b35)` }
    : design.template === 'clean'
    ? { background: '#f8f5ff' }
    : { background: `linear-gradient(160deg, #160026 0%, #0a000f 100%)` }

  const isDark = design.template !== 'clean'
  const textColor = isDark ? '#fff' : '#0f0a1a'
  const subColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(15,10,26,0.55)'

  return (
    <div className="relative" style={{ width: 260, height: 460 }}>
      {/* Phone shell */}
      <div className="absolute inset-0 rounded-[2.5rem] border-2 border-white/20 overflow-hidden"
        style={{ ...bgStyle, boxShadow: `0 40px 100px ${design.primaryColor}50, inset 0 1px 0 rgba(255,255,255,0.1)` }}>

        {/* Background glow for dark templates */}
        {isDark && (
          <>
            <div className="absolute top-8 right-4 w-28 h-28 rounded-full blur-2xl opacity-25 pointer-events-none"
              style={{ background: `radial-gradient(circle, ${design.primaryColor}, transparent)` }} />
            <div className="absolute bottom-24 left-2 w-20 h-20 rounded-full blur-2xl opacity-20 pointer-events-none"
              style={{ background: `radial-gradient(circle, ${design.accentColor}, transparent)` }} />
          </>
        )}

        {/* Status bar */}
        <div className="flex justify-between items-center px-5 pt-3 pb-1 text-[9px]"
          style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)' }}>
          <span>9:41</span>
          <div className="flex gap-1">
            <span>●●●</span><span>WiFi</span><span>■</span>
          </div>
        </div>

        {/* Ad content - phases */}
        <div key={tick} className="absolute inset-x-0 top-10 bottom-0 px-6 flex flex-col justify-center">

          {/* Phase 1: Hook */}
          <div className={isPlaying ? 'animate-reel-hook' : 'opacity-0'}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1"
              style={{ color: design.primaryColor }}>
              Hook
            </p>
            <p className="text-xs font-semibold italic leading-snug mb-4"
              style={{ color: textColor }}>
              "{selection.hook}"
            </p>
          </div>

          {/* Phase 2: Headline */}
          <div className={isPlaying ? 'animate-reel-headline' : 'opacity-0'}>
            <div className="h-px w-16 mb-3"
              style={{ background: `linear-gradient(90deg, ${design.primaryColor}, ${design.accentColor})` }} />
            <p className="text-base font-black leading-tight mb-2"
              style={{ color: textColor }}>
              {selection.headline}
            </p>
          </div>

          {/* Phase 3: Subheadline */}
          <div className={isPlaying ? 'animate-reel-sub' : 'opacity-0'}>
            <p className="text-[11px] leading-relaxed mb-4"
              style={{ color: subColor }}>
              {selection.subheadline}
            </p>
          </div>

          {/* Phase 4: CTA */}
          <div className={isPlaying ? 'animate-reel-cta' : 'opacity-0'}>
            <div className="inline-flex items-center px-4 py-2 rounded-full text-[11px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${design.primaryColor}, ${design.accentColor})`,
                       boxShadow: `0 8px 24px ${design.primaryColor}60` }}>
              {selection.cta} →
            </div>
          </div>

          {/* Phase 5: Hashtags */}
          <div className={`mt-4 ${isPlaying ? 'animate-reel-tags' : 'opacity-0'}`}>
            <p className="text-[9px] leading-relaxed"
              style={{ color: design.primaryColor + 'bb' }}>
              {selection.hashtags.slice(0, 4).map(t => `#${t}`).join('  ')}
            </p>
          </div>
        </div>

        {/* Progress bar at bottom */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1">
          {[0,1,2,3,4].map(i => (
            <div key={i} className={`h-1 rounded-full transition-all duration-300 ${
              phase === 'playing' ? (i === 2 ? 'w-5 opacity-100' : 'w-1.5 opacity-40') :
              phase === 'done' ? 'w-1.5 opacity-60' : 'w-1.5 opacity-20'
            }`}
              style={{ background: design.primaryColor }} />
          ))}
        </div>

        {/* Idle overlay */}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
                <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[14px] border-t-transparent border-b-transparent border-l-white ml-1" />
              </div>
              <p className="text-white/70 text-[10px]">Tap to preview reel</p>
            </div>
          </div>
        )}
      </div>

      {/* Side buttons */}
      <div className="absolute right-0 top-24 flex flex-col gap-3" style={{ transform: 'translateX(100%) translateX(8px)' }}>
        {['♡', '💬', '↗', '⋯'].map(ic => (
          <div key={ic} className="w-8 h-8 rounded-full glass flex items-center justify-center text-white/60 text-sm border border-white/10">
            {ic}
          </div>
        ))}
      </div>
    </div>
  )
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative">
      <pre className="text-[10px] text-white/40 leading-relaxed overflow-auto max-h-32 font-mono p-4 rounded-xl"
        style={{ background: 'rgba(0,0,0,0.4)' }}>
        {code}
      </pre>
      <button onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 rounded text-[9px] border border-white/15 bg-white/5 text-white/50 hover:text-white transition-all">
        {copied ? '✓ Copied!' : 'Copy'}
      </button>
    </div>
  )
}

export default function Step4ReelPreview({ adSelection, adDesign, onBack, onReset }: Props) {
  const { phase, tick, play, replay } = useReelPlayer()
  const [showCode, setShowCode] = useState(false)

  const embedCode = `<!-- AdForge AI Reel Embed -->
<style>
.af-reel { font-family: Inter, sans-serif; background: linear-gradient(160deg, #160026, #0a000f);
  width: 300px; height: 520px; border-radius: 24px; position: relative; overflow: hidden;
  display: flex; flex-direction: column; justify-content: center; padding: 32px 24px; }
.af-hook { font-size: 12px; font-style: italic; color: rgba(255,255,255,0.7); margin-bottom: 16px;
  animation: slideUp 0.7s 0.8s ease both; }
.af-headline { font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 8px;
  animation: slideUp 0.7s 1.5s ease both; }
.af-sub { font-size: 13px; color: rgba(255,255,255,0.55); animation: fadeIn 0.7s 2.2s ease both; }
.af-cta { display: inline-flex; padding: 10px 20px; border-radius: 999px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, ${adDesign.primaryColor}, ${adDesign.accentColor});
  animation: popIn 0.6s 2.8s cubic-bezier(0.34,1.56,0.64,1) both; margin-top: 16px; }
@keyframes slideUp { from { transform: translateY(30px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes popIn { from { transform: scale(0.5); opacity: 0 } to { transform: none; opacity: 1 } }
</style>
<div class="af-reel">
  <p class="af-hook">"${adSelection.hook}"</p>
  <h2 class="af-headline">${adSelection.headline}</h2>
  <p class="af-sub">${adSelection.subheadline}</p>
  <a class="af-cta" href="#">${adSelection.cta} →</a>
</div>`

  return (
    <div className="animate-slide-up">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white mb-2">Your ad reel is ready</h1>
        <p className="text-white/45 text-sm">Preview your animated ad reel, download the image, or copy the embed code.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-10 items-start">
        {/* Reel preview */}
        <div className="flex flex-col items-center gap-5">
          <ReelPhone selection={adSelection} design={adDesign} phase={phase} tick={tick} />

          <div className="flex gap-3">
            <button
              onClick={phase === 'idle' ? play : replay}
              className="btn-primary px-6 py-2.5 text-sm"
            >
              {phase === 'idle' ? '▶ Play Reel' : '↺ Replay'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            <div className="glass px-3 py-1.5 rounded-lg text-xs text-white/50 border border-white/8">
              📱 9:16 story format
            </div>
            <div className="glass px-3 py-1.5 rounded-lg text-xs text-white/50 border border-white/8">
              ⚡ CSS animated
            </div>
            <div className="glass px-3 py-1.5 rounded-lg text-xs text-white/50 border border-white/8">
              🎨 Brand colors
            </div>
          </div>
        </div>

        {/* Right: Summary + actions */}
        <div className="space-y-5">
          <div className="card border-white/8">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-4">Ad Summary</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wider mb-0.5">Hook</p>
                <p className="text-white/80 italic">"{adSelection.hook}"</p>
              </div>
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wider mb-0.5">Headline</p>
                <p className="text-white font-bold">{adSelection.headline}</p>
              </div>
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wider mb-0.5">Subheadline</p>
                <p className="text-white/70">{adSelection.subheadline}</p>
              </div>
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wider mb-0.5">CTA</p>
                <span className="px-3 py-1 rounded-full text-xs font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${adDesign.primaryColor}, ${adDesign.accentColor})` }}>
                  {adSelection.cta}
                </span>
              </div>
              <div>
                <p className="text-white/35 text-[11px] uppercase tracking-wider mb-1">Hashtags</p>
                <div className="flex flex-wrap gap-1">
                  {adSelection.hashtags.map(t => (
                    <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Export options */}
          <div className="card border-white/8 space-y-3">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Export</p>

            <button
              onClick={() => setShowCode(v => !v)}
              className="w-full btn-ghost text-sm justify-between"
            >
              <span>{'</>'} Copy Embed Code</span>
              <span className="text-white/30">{showCode ? '▲' : '▼'}</span>
            </button>

            {showCode && <CopyableCode code={embedCode} />}

            <div className="flex gap-2">
              <button
                onClick={onBack}
                className="flex-1 btn-ghost text-xs py-2"
              >
                ← Edit Design
              </button>
              <button
                onClick={onReset}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-brand-500/30 bg-brand-500/8 text-brand-300 hover:bg-brand-500/15 transition-all"
              >
                + Create New Ad
              </button>
            </div>
          </div>

          {/* Upsell */}
          <div className="card border-brand-500/20"
            style={{ background: 'linear-gradient(135deg, rgba(139,48,255,0.08), transparent)' }}>
            <p className="text-xs text-brand-400 font-bold mb-1">🚀 Upgrade to Pro</p>
            <p className="text-xs text-white/45 mb-3">Unlock all templates, export video files, and remove the AdForge watermark.</p>
            <button className="btn-primary text-xs px-4 py-2">Upgrade — $9/month</button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="btn-ghost">← Edit Design</button>
        <button onClick={onReset} className="btn-primary">
          + Create Another Ad
        </button>
      </div>
    </div>
  )
}
