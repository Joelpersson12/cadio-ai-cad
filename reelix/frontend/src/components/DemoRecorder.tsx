import { useState, useEffect, useRef } from 'react'
import Header from './Header'

interface Props {
  onBack: () => void
}

type Phase = 'form' | 'planning' | 'recording' | 'encoding' | 'done' | 'error'

const PHASE_LABELS: Record<string, string> = {
  queued: 'Starting up…',
  planning: 'AI is planning the recording script…',
  recording: 'Recording the browser session…',
  encoding: 'Encoding video + adding captions…',
  done: 'Done!',
}

const EXAMPLE_SCRIPTS = [
  {
    url: 'https://cadio.net',
    description: 'Show the homepage, then click to create a new model, type "a simple L-bracket", wait for it to generate, rotate the 3D model, then download the file.',
    voiceover: "Did you know you can generate editable CAD models with AI? Just go to Cadio.net, describe what you need, and it creates a real 3D model in seconds. You can edit it and download it right away — completely free to try.",
  },
]

export default function DemoRecorder({ onBack }: Props) {
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [voiceover, setVoiceover] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [jobId, setJobId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phaseLabel, setPhaseLabel] = useState('')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  function loadExample() {
    const ex = EXAMPLE_SCRIPTS[0]
    setUrl(ex.url)
    setDescription(ex.description)
    setVoiceover(ex.voiceover)
  }

  async function submit() {
    if (!url.trim() || !description.trim() || !voiceover.trim()) return
    setPhase('planning')
    setError(null)
    setVideoUrl(null)

    try {
      const res = await fetch('/api/record-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, description, voiceover }),
      })
      const data = await res.json()
      if (!res.ok || data.status === 'error') throw new Error(data.message || `Error ${res.status}`)
      setJobId(data.job_id)
      schedulePoll(data.job_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPhase('error')
    }
  }

  function schedulePoll(id: string, delay = 4000) {
    pollRef.current = setTimeout(() => poll(id), delay)
  }

  async function poll(id: string) {
    try {
      const res = await fetch(`/api/demo-status?job_id=${id}`)
      const data = await res.json()
      const s = data.status as string
      setPhaseLabel(PHASE_LABELS[s] ?? s)

      if (s === 'done') {
        setVideoUrl(`/api/demo-video/${id}`)
        setPhase('done')
      } else if (s === 'error') {
        setError(data.error || 'Recording failed')
        setPhase('error')
      } else {
        const p: Phase = s === 'recording' ? 'recording' : s === 'encoding' ? 'encoding' : 'planning'
        setPhase(p)
        schedulePoll(id, 4000)
      }
    } catch {
      schedulePoll(id, 6000)
    }
  }

  const isProcessing = phase === 'planning' || phase === 'recording' || phase === 'encoding'

  return (
    <div className="min-h-screen flex flex-col">
      <Header onStart={onBack} minimal onBack={onBack} />

      <div className="flex-1 pt-24 pb-12 px-6">
        <div className="max-w-2xl mx-auto">

          <div className="mb-8">
            <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">Demo Video Creator</span>
            <h1 className="text-3xl font-black text-white mt-2 mb-2">Record Any Website</h1>
            <p className="text-white/45 text-sm">
              AI plans the browser actions, records the session, adds your voiceover and captions — fully automatic.
            </p>
          </div>

          {phase === 'form' && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button onClick={loadExample} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  ✦ Load Cadio example
                </button>
              </div>

              <div className="card">
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                  Website URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://cadio.net"
                  className="input-field"
                />
              </div>

              <div className="card">
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                  What should the video show?
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Show the homepage, then click 'Get started', type a prompt like 'a simple bracket', wait for the model to generate, rotate it, and download the file."
                  className="input-field resize-none"
                />
                <p className="text-white/25 text-xs mt-2">
                  Describe the steps in plain language — AI converts this to browser actions.
                </p>
              </div>

              <div className="card">
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                  Voiceover script
                </label>
                <textarea
                  value={voiceover}
                  onChange={e => setVoiceover(e.target.value)}
                  rows={4}
                  placeholder="Did you know you can generate editable CAD models with AI? Just go to Cadio.net, describe what you need, and it creates a 3D model in seconds..."
                  className="input-field resize-none"
                />
                <p className="text-white/25 text-xs mt-2">
                  This will be read aloud by an AI voice and synced as captions at the bottom.
                </p>
              </div>

              <div className="bg-white/3 border border-white/8 rounded-xl p-4 text-xs text-white/40 space-y-1">
                <p className="font-semibold text-white/55">What you'll get:</p>
                <p>✓ Full browser screen recording at 1280×720</p>
                <p>✓ AI voice reading your script (Microsoft Neural TTS — free)</p>
                <p>✓ Captions synced at the bottom</p>
                <p>✓ MP4 ready to post on TikTok, Reels, YouTube Shorts</p>
                <p>✓ Works on any public website</p>
              </div>

              <button
                onClick={submit}
                disabled={!url || !description || !voiceover}
                className="btn-primary w-full justify-center py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ▶ Start Recording
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="card text-center py-16">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-brand-500/15" />
                <div className="absolute inset-0 rounded-full border-2 border-t-brand-400 animate-spin" />
                <div className="absolute inset-2 rounded-full border border-brand-400/20 animate-pulse" />
              </div>
              <p className="text-white font-semibold text-lg mb-2">{phaseLabel || PHASE_LABELS[phase] || 'Processing…'}</p>
              <p className="text-white/35 text-sm">
                {phase === 'recording' && 'Playwright is navigating and capturing frames…'}
                {phase === 'encoding' && 'ffmpeg is combining video, voice and captions…'}
                {phase === 'planning' && 'GPT-4o is generating the action script…'}
              </p>
              <p className="text-white/20 text-xs mt-4">This takes 2–3 minutes. Don't close the tab.</p>
            </div>
          )}

          {phase === 'done' && videoUrl && (
            <div className="space-y-5">
              <div className="card p-0 overflow-hidden">
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full bg-black"
                />
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <a href={videoUrl} download="reelix-demo.mp4" className="btn-primary px-6 py-2.5 text-sm">
                  ↓ Download MP4
                </a>
                <button onClick={() => { setPhase('form'); setJobId(null); setVideoUrl(null) }} className="btn-ghost px-5 py-2.5 text-sm">
                  ↺ Record Another
                </button>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="card text-center py-12">
              <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                <span className="text-red-400 text-lg font-bold">!</span>
              </div>
              <p className="text-red-400 font-semibold mb-2">{error}</p>
              <p className="text-white/35 text-sm mb-6">Check that the URL is public and your OPENAI_API_KEY is set.</p>
              <button onClick={() => setPhase('form')} className="btn-primary px-6 py-2.5 text-sm">Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
