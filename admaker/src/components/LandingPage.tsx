import { useState, useEffect } from 'react'
import Header from './Header'
import Footer from './Footer'

interface LandingPageProps {
  onStart: () => void
}

const DEMO_REEL_PHRASES = [
  'Create ads that convert.',
  'Generate copy in seconds.',
  'Build reels with one click.',
  'Market any product, instantly.',
]

const FEATURES = [
  {
    icon: '✦',
    title: 'AI Copy Generator',
    desc: 'Input your product and target audience. AdForge writes headlines, body copy, CTAs, and hashtags tailored to your platform.',
    color: 'from-violet-500/20 to-purple-500/10',
    border: 'border-violet-500/20',
  },
  {
    icon: '◈',
    title: 'Image Ad Composer',
    desc: 'Choose from beautiful templates, upload your product image, and compose a pixel-perfect ad on the built-in canvas editor.',
    color: 'from-pink-500/20 to-rose-500/10',
    border: 'border-pink-500/20',
  },
  {
    icon: '▶',
    title: 'Reel & Video Ads',
    desc: 'Animate your ad into a cinematic reel with entrance animations, hook text, and CTA — ready for Instagram, TikTok and more.',
    color: 'from-orange-500/20 to-amber-500/10',
    border: 'border-orange-500/20',
  },
  {
    icon: '⬡',
    title: 'Multi-Platform',
    desc: 'Optimized formats for every major platform: 1:1 posts, 9:16 stories, 16:9 banners — switch in one click.',
    color: 'from-cyan-500/20 to-blue-500/10',
    border: 'border-cyan-500/20',
  },
  {
    icon: '◎',
    title: 'Tone & Voice Control',
    desc: 'Match your brand voice: professional, casual, urgent, or inspirational. AI adapts to your style automatically.',
    color: 'from-green-500/20 to-emerald-500/10',
    border: 'border-green-500/20',
  },
  {
    icon: '❋',
    title: 'Instant Download',
    desc: 'Export your finished ad as PNG, or copy the reel animation code to embed anywhere. No account required to try.',
    color: 'from-brand-500/20 to-violet-500/10',
    border: 'border-brand-500/20',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Tell us about your product',
    desc: 'Enter your product name, description, target audience, tone, and platform. Takes less than 60 seconds.',
  },
  {
    n: '02',
    title: 'AI generates your ad copy',
    desc: 'Our AI creates multiple headline, subheadline, and CTA options. Pick the ones that resonate most.',
  },
  {
    n: '03',
    title: 'Compose your visual ad',
    desc: 'Choose a template, upload your image, and arrange your copy on the canvas. Real-time preview included.',
  },
  {
    n: '04',
    title: 'Preview reel & download',
    desc: 'Watch your ad come to life as an animated reel. Download the image or export the reel animation.',
  },
]

const PRICING = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['5 ads per month', 'AI copy generation', 'Image ad composer', '2 templates', 'PNG export'],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    features: ['Unlimited ads', 'All 8 templates', 'Reel creator', 'Custom branding', 'All platforms', 'Priority AI'],
    cta: 'Get Pro',
    highlighted: true,
  },
  {
    name: 'Agency',
    price: '$29',
    period: '/month',
    features: ['Everything in Pro', 'Team workspace', 'Client management', 'White-label exports', 'API access', 'Priority support'],
    cta: 'Get Agency',
    highlighted: false,
  },
]

function AnimatedHeroPhone({ onStart }: { onStart: () => void }) {
  const [phraseIdx, setPhraseIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setPhraseIdx(i => (i + 1) % DEMO_REEL_PHRASES.length)
    }, 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="relative flex items-center justify-center mt-8 md:mt-0 animate-float">
      {/* Glow blob */}
      <div className="absolute w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8b30ff 0%, #ec4899 100%)' }} />

      {/* Phone frame */}
      <div className="relative w-52 h-96 rounded-[2.5rem] border-2 border-white/15 overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #160026 0%, #0a000f 100%)', boxShadow: '0 32px 80px rgba(139,48,255,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}>

        {/* Status bar */}
        <div className="flex justify-between items-center px-5 pt-3 pb-1 text-[9px] text-white/40">
          <span>9:41</span>
          <div className="flex gap-1 items-center">
            <span>●●●</span>
            <span>WiFi</span>
            <span>■</span>
          </div>
        </div>

        {/* Ad preview */}
        <div className="absolute inset-x-0 bottom-0 top-8 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #2d006b 0%, #0e0019 60%, #1a0033 100%)' }} />

          {/* Floating shapes */}
          <div className="absolute top-6 right-4 w-20 h-20 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #c39aff, transparent)' }} />
          <div className="absolute bottom-20 left-2 w-14 h-14 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #ec4899, transparent)' }} />

          {/* Ad content */}
          <div className="absolute inset-0 flex flex-col justify-center px-5">
            <p className="text-[8px] text-brand-300 font-semibold uppercase tracking-widest mb-2">Hook →</p>
            <div className="text-white text-xs font-bold leading-tight mb-3 min-h-[2.5rem] transition-all duration-500">
              {DEMO_REEL_PHRASES[phraseIdx]}
            </div>
            <p className="text-white/50 text-[8px] leading-relaxed mb-4">
              AI-generated copy that converts. Tailored to your brand voice and platform.
            </p>
            <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[8px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #8b30ff, #ec4899)', width: 'fit-content' }}>
              Try Free →
            </div>
          </div>

          {/* Bottom bar */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1">
            {DEMO_REEL_PHRASES.map((_, i) => (
              <div key={i} className="h-1 rounded-full transition-all duration-300"
                style={{ width: i === phraseIdx ? '20px' : '6px', background: i === phraseIdx ? '#8b30ff' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Floating badge */}
      <div className="absolute -top-4 -right-4 glass rounded-xl px-3 py-2 text-[10px] font-semibold border-brand-500/30 border">
        <span className="text-green-400">✓</span> AI Generated
      </div>
      <div className="absolute -bottom-2 -left-6 glass rounded-xl px-3 py-2 text-[10px] border-pink-500/30 border">
        <span className="gradient-text font-bold">3 headlines</span> ready
      </div>
    </div>
  )
}

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="min-h-screen">
      <Header onStart={onStart} />

      {/* ── HERO ─────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
            style={{ background: 'radial-gradient(circle, #8b30ff, transparent)' }} />
          <div className="absolute top-1/3 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-8"
            style={{ background: 'radial-gradient(circle, #ec4899, transparent)' }} />
          {/* Grid lines */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(139,48,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(139,48,255,0.04) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
        </div>

        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center relative">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-xs text-brand-300 font-medium mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Powered by AI · Free to try
            </div>

            <h1 className="text-5xl md:text-6xl font-black leading-[1.05] tracking-tight mb-6">
              Create Ads That{' '}
              <span className="gradient-text">Convert</span>
              <br />
              In Seconds
            </h1>

            <p className="text-white/50 text-lg leading-relaxed mb-8 max-w-md">
              AdForge AI generates compelling copy, composes stunning image ads, and builds animated reels — for any product, on any platform.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <button onClick={onStart} className="btn-primary text-sm px-7 py-3.5">
                Create Your First Ad Free →
              </button>
              <a href="#how-it-works" className="btn-ghost text-sm px-7 py-3.5">
                See How It Works
              </a>
            </div>

            <div className="flex items-center gap-6 text-xs text-white/35">
              <span>✓ No credit card required</span>
              <span>✓ 5 free ads per month</span>
              <span>✓ Export PNG</span>
            </div>
          </div>

          <AnimatedHeroPhone onStart={onStart} />
        </div>
      </section>

      {/* ── SOCIAL PROOF ────────────────────────── */}
      <section className="py-8 border-y border-white/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-white/25 text-xs uppercase tracking-widest mb-6">Trusted by creators & brands</p>
          <div className="flex flex-wrap justify-center gap-8 items-center">
            {['Shopify Stores', 'Instagram Creators', 'SaaS Companies', 'E-commerce Brands', 'Agencies'].map(b => (
              <span key={b} className="text-white/20 text-sm font-medium">{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-4xl font-black">
              From idea to ad in{' '}
              <span className="gradient-text">4 steps</span>
            </h2>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-8 left-[calc(12.5%+1rem)] right-[calc(12.5%+1rem)] h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(139,48,255,0.4), rgba(236,72,153,0.4), transparent)' }} />

            <div className="grid md:grid-cols-4 gap-6">
              {STEPS.map((s, i) => (
                <div key={i} className="relative">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl glass border border-brand-500/25 flex items-center justify-center mb-4 relative"
                      style={{ background: 'linear-gradient(135deg, rgba(139,48,255,0.12), rgba(236,72,153,0.05))' }}>
                      <span className="text-2xl font-black gradient-text">{s.n}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white mb-2">{s.title}</h3>
                    <p className="text-white/40 text-xs leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 text-center">
            <button onClick={onStart} className="btn-primary">
              Get Started Now →
            </button>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-4xl font-black">
              Everything you need to{' '}
              <span className="gradient-text">advertise</span>
            </h2>
            <p className="text-white/40 mt-4 max-w-xl mx-auto">
              One tool for AI copy, image composition, and video reels. No design skills required.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className={`glass-hover card bg-gradient-to-br ${f.color} border ${f.border} group`}>
                <div className="text-2xl mb-3 gradient-text font-bold">{f.icon}</div>
                <h3 className="font-bold text-sm text-white mb-2">{f.title}</h3>
                <p className="text-white/45 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CADIO PROMO ─────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="card border border-brand-500/20 overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, rgba(139,48,255,0.08), rgba(14,0,25,0.8))' }}>
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, #8b30ff, transparent)' }} />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-3">Also by us</p>
                <h2 className="text-3xl font-black mb-4">
                  Meet <span className="gradient-text">Cadio AI</span>
                </h2>
                <p className="text-white/50 text-sm leading-relaxed mb-6">
                  The AI-powered 3D CAD tool that lets anyone design, modify, and 3D-print physical products using plain language. No CAD experience needed.
                </p>
                <div className="flex flex-wrap gap-3 mb-6 text-xs">
                  {['Natural language CAD', 'Real-time 3D preview', 'STL / STEP export', '3D print ready'].map(f => (
                    <span key={f} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">{f}</span>
                  ))}
                </div>
                <a href="https://cadio.app" target="_blank" rel="noreferrer" className="btn-ghost text-sm">
                  Try Cadio AI →
                </a>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-48 h-48 rounded-3xl overflow-hidden glass flex items-center justify-center border-brand-500/20 border"
                  style={{ background: 'linear-gradient(135deg, rgba(139,48,255,0.15), rgba(236,72,153,0.08))' }}>
                  <div className="text-center">
                    <div className="text-5xl font-black gradient-text mb-2">3D</div>
                    <p className="text-white/40 text-xs">AI-Powered CAD</p>
                    <p className="text-white/25 text-xs mt-1">cadio.app</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────── */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl font-black">
              Simple,{' '}
              <span className="gradient-text">transparent</span> pricing
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PRICING.map((p, i) => (
              <div key={i} className={`card relative overflow-hidden transition-transform duration-200 hover:-translate-y-1 ${p.highlighted ? 'border-brand-500/40' : 'border-white/8'}`}
                style={p.highlighted ? { background: 'linear-gradient(135deg, rgba(139,48,255,0.12), rgba(14,0,25,0.9))' } : {}}>

                {p.highlighted && (
                  <div className="absolute top-0 left-0 right-0 h-px gradient-bg opacity-60" />
                )}
                {p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold text-white gradient-bg">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">{p.name}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">{p.price}</span>
                    <span className="text-white/40 text-sm">{p.period}</span>
                  </div>
                </div>

                <ul className="space-y-2 mb-6">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                      <span className="text-brand-400">✓</span> {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={onStart}
                  className={p.highlighted ? 'btn-primary w-full justify-center' : 'btn-ghost w-full justify-center'}
                >
                  {p.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="card border-brand-500/20 border relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(139,48,255,0.1), rgba(236,72,153,0.06))' }}>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-1/2 w-64 h-32 -translate-x-1/2 blur-3xl opacity-20"
                style={{ background: 'radial-gradient(ellipse, #8b30ff, transparent)' }} />
            </div>
            <div className="relative">
              <h2 className="text-4xl font-black mb-4">
                Start creating ads{' '}
                <span className="gradient-text">today</span>
              </h2>
              <p className="text-white/45 text-sm mb-8 max-w-md mx-auto">
                Join thousands of creators and brands using AdForge AI to launch campaigns faster than ever.
              </p>
              <button onClick={onStart} className="btn-primary text-base px-10 py-4">
                Create Your First Ad — It's Free →
              </button>
              <p className="text-white/25 text-xs mt-4">No credit card · 5 free ads per month · Instant access</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
