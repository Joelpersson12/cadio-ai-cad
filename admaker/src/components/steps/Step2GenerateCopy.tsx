import { useState, useEffect } from 'react'
import type { ProductInfo, GeneratedCopy, AdSelection } from '../../types'

interface Props {
  productInfo: ProductInfo
  onBack: () => void
  onNext: (copy: GeneratedCopy, selection: AdSelection) => void
}

const LOADING_MESSAGES = [
  'Analyzing your product...',
  'Crafting compelling headlines...',
  'Writing persuasive copy...',
  'Generating hashtags...',
  'Finalizing your ad content...',
]

async function fetchAdCopy(info: ProductInfo): Promise<GeneratedCopy> {
  const res = await fetch('/api/admaker/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_name: info.name,
      description: info.description,
      target_audience: info.audience,
      tone: info.tone,
      platform: info.platform,
      goal: info.goal,
    }),
  })

  if (!res.ok) throw new Error('Failed to generate copy')
  const data = await res.json()
  return data.data as GeneratedCopy
}

function getMockCopy(info: ProductInfo): GeneratedCopy {
  const name = info.name
  return {
    headlines: [
      `${name}: The Future Is Here`,
      `Transform Your Results with ${name}`,
      `Why Thousands Choose ${name}`,
    ],
    subheadlines: [
      `Designed for people who demand more from their tools.`,
      `Join the movement redefining how the world works.`,
      `Simple to start. Powerful to scale.`,
    ],
    ctas: ['Try It Free', 'Get Started Now', 'See the Difference'],
    body_copy: `${name} gives you the power to achieve more with less effort. Built for ${info.audience}, it's the smarter way to get results. No experience needed — just results.`,
    hashtags: [
      name.toLowerCase().replace(/\s+/g, ''),
      'ai',
      'innovation',
      'growth',
      'marketing',
      'digitalmarketing',
      'startup',
      'tech',
    ],
    hook: `Wait — you haven't tried ${name} yet?`,
  }
}

function CopyOptionCard({ text, selected, onSelect }: { text: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`copy-card w-full text-left ${selected ? 'copy-card-selected' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-white/80 text-sm leading-relaxed">{text}</span>
        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          selected ? 'border-brand-400 bg-brand-400' : 'border-white/20'
        }`}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  )
}

export default function Step2GenerateCopy({ productInfo, onBack, onNext }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0])
  const [error, setError] = useState<string | null>(null)
  const [copy, setCopy] = useState<GeneratedCopy | null>(null)

  const [selHeadline, setSelHeadline] = useState(0)
  const [selSub, setSelSub] = useState(0)
  const [selCta, setSelCta] = useState(0)
  const [bodyEdit, setBodyEdit] = useState('')
  const [hashEdit, setHashEdit] = useState('')

  useEffect(() => {
    let msgIdx = 0
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[msgIdx])
    }, 1200)

    fetchAdCopy(productInfo)
      .then(result => {
        setCopy(result)
        setBodyEdit(result.body_copy)
        setHashEdit(result.hashtags.join(' '))
      })
      .catch(() => {
        // Fallback to mock if backend isn't available
        const mock = getMockCopy(productInfo)
        setCopy(mock)
        setBodyEdit(mock.body_copy)
        setHashEdit(mock.hashtags.join(' '))
      })
      .finally(() => {
        setLoading(false)
        clearInterval(interval)
      })

    return () => clearInterval(interval)
  }, [])

  function handleNext() {
    if (!copy) return
    const tags = hashEdit.split(/[\s,]+/).filter(Boolean).map(t => t.replace(/^#/, ''))
    onNext(copy, {
      headline: copy.headlines[selHeadline],
      subheadline: copy.subheadlines[selSub],
      cta: copy.ctas[selCta],
      body_copy: bodyEdit,
      hashtags: tags,
      hook: copy.hook,
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-2 border-brand-500/20 animate-spin"
            style={{ borderTopColor: '#8b30ff' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-pink-500/20 animate-spin"
              style={{ borderTopColor: '#ec4899', animationDirection: 'reverse', animationDuration: '0.8s' }} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white/80 font-semibold text-lg mb-2">Generating your ad copy...</p>
          <p className="text-white/35 text-sm animate-pulse">{loadingMsg}</p>
        </div>
        <div className="w-64 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full animate-shimmer"
            style={{ background: 'linear-gradient(90deg, transparent 0%, #8b30ff 50%, transparent 100%)', backgroundSize: '200% 100%' }} />
        </div>
      </div>
    )
  }

  if (error || !copy) {
    return (
      <div className="text-center py-24">
        <p className="text-red-400 mb-4">{error || 'Something went wrong'}</p>
        <button onClick={onBack} className="btn-ghost">Go Back</button>
      </div>
    )
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white mb-2">Your AI-generated copy</h1>
        <p className="text-white/45 text-sm">Select the best options for your ad. Edit body copy and hashtags to fit your brand.</p>
      </div>

      <div className="space-y-7">
        {/* Hook */}
        <div className="card border-brand-500/20 border"
          style={{ background: 'linear-gradient(135deg, rgba(139,48,255,0.08), transparent)' }}>
          <p className="text-brand-400 text-xs font-bold uppercase tracking-wider mb-2">🎣 Hook (for video/reel opening)</p>
          <p className="text-white font-semibold text-sm">"{copy.hook}"</p>
        </div>

        {/* Headlines */}
        <div>
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Headlines — pick one</p>
          <div className="space-y-2">
            {copy.headlines.map((h, i) => (
              <CopyOptionCard key={i} text={h} selected={selHeadline === i} onSelect={() => setSelHeadline(i)} />
            ))}
          </div>
        </div>

        {/* Subheadlines */}
        <div>
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Subheadlines — pick one</p>
          <div className="space-y-2">
            {copy.subheadlines.map((s, i) => (
              <CopyOptionCard key={i} text={s} selected={selSub === i} onSelect={() => setSelSub(i)} />
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div>
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Call to Action — pick one</p>
          <div className="flex flex-wrap gap-2">
            {copy.ctas.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelCta(i)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  selCta === i
                    ? 'border-brand-500/60 bg-brand-500/15 text-white'
                    : 'border-white/10 bg-white/4 text-white/60 hover:border-white/20'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Body copy */}
        <div>
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Body Copy (editable)</p>
          <textarea
            value={bodyEdit}
            onChange={e => setBodyEdit(e.target.value)}
            rows={4}
            className="input-field resize-none text-sm"
          />
        </div>

        {/* Hashtags */}
        <div>
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Hashtags (editable)</p>
          <input
            type="text"
            value={hashEdit}
            onChange={e => setHashEdit(e.target.value)}
            className="input-field text-sm"
            placeholder="ai tech startup marketing ..."
          />
          <p className="text-white/25 text-xs mt-1">Separate with spaces. # prefix is optional.</p>
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="btn-ghost">← Back</button>
        <button onClick={handleNext} className="btn-primary px-8 py-3.5">
          Compose Image Ad →
        </button>
      </div>
    </div>
  )
}
