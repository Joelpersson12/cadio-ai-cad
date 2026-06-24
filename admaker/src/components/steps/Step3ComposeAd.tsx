import { useRef, useEffect, useCallback, useState } from 'react'
import type { AdSelection, AdDesign } from '../../types'

interface Props {
  adSelection: AdSelection
  adDesign: AdDesign
  onDesignChange: (d: AdDesign) => void
  onBack: () => void
  onNext: () => void
}

const TEMPLATES: { id: AdDesign['template']; label: string; desc: string }[] = [
  { id: 'dark_bold', label: 'Dark Bold', desc: 'Dark luxury look' },
  { id: 'vibrant', label: 'Vibrant', desc: 'Colorful gradient' },
  { id: 'clean', label: 'Clean', desc: 'Minimal white' },
  { id: 'photo', label: 'Photo', desc: 'Image overlay' },
]

const FORMATS: { id: AdDesign['format']; label: string; w: number; h: number }[] = [
  { id: 'square', label: '1:1 Post', w: 800, h: 800 },
  { id: 'story', label: '9:16 Story', w: 450, h: 800 },
  { id: 'landscape', label: '16:9 Banner', w: 800, h: 450 },
]

function wrapText(ctx: CanvasRenderingContext2D, text: string, _x: number, maxWidth: number, _lineHeight: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line + word + ' '
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line.trim())
      line = word + ' '
    } else {
      line = test
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawAd(canvas: HTMLCanvasElement, design: AdDesign, selection: AdSelection, fmt: typeof FORMATS[0], bgImg: HTMLImageElement | null) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = fmt.w
  canvas.height = fmt.h

  const { primaryColor, accentColor, template } = design
  const W = fmt.w
  const H = fmt.h
  const pad = W * 0.08

  // --- Background ---
  if (template === 'dark_bold') {
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#0a000f')
    bg.addColorStop(0.5, '#1a0033')
    bg.addColorStop(1, '#0e001a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Grid overlay
    ctx.strokeStyle = 'rgba(139,48,255,0.06)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // Accent blob
    const radial = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, W * 0.4)
    radial.addColorStop(0, primaryColor + '30')
    radial.addColorStop(1, 'transparent')
    ctx.fillStyle = radial
    ctx.fillRect(0, 0, W, H)

  } else if (template === 'vibrant') {
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, primaryColor)
    bg.addColorStop(0.5, accentColor)
    bg.addColorStop(1, '#ff6b35')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Frosted circles
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.15, W * 0.25, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(W * 0.1, H * 0.85, W * 0.2, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

  } else if (template === 'clean') {
    ctx.fillStyle = '#f8f5ff'
    ctx.fillRect(0, 0, W, H)
    // Accent bar at top
    const bar = ctx.createLinearGradient(0, 0, W, 0)
    bar.addColorStop(0, primaryColor)
    bar.addColorStop(1, accentColor)
    ctx.fillStyle = bar
    ctx.fillRect(0, 0, W, H * 0.008)
    // Subtle dot pattern
    ctx.fillStyle = primaryColor + '10'
    for (let x = pad; x < W - pad; x += 20) {
      for (let y = pad; y < H - pad; y += 20) {
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill()
      }
    }

  } else if (template === 'photo') {
    if (bgImg) {
      const scale = Math.max(W / bgImg.width, H / bgImg.height)
      const sw = bgImg.width * scale
      const sh = bgImg.height * scale
      ctx.drawImage(bgImg, (W - sw) / 2, (H - sh) / 2, sw, sh)
    } else {
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, W, H)
    }
    // Dark gradient overlay
    const overlay = ctx.createLinearGradient(0, 0, 0, H)
    overlay.addColorStop(0, 'rgba(0,0,0,0.2)')
    overlay.addColorStop(0.5, 'rgba(0,0,0,0.5)')
    overlay.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = overlay
    ctx.fillRect(0, 0, W, H)
  }

  const isDark = template !== 'clean'
  const textColor = isDark ? '#ffffff' : '#0f0a1a'
  const subColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(15,10,26,0.55)'

  let curY = pad

  // --- Headline ---
  const fontSize = Math.round(W * 0.065)
  ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`
  ctx.fillStyle = textColor
  const hlLines = wrapText(ctx, selection.headline, pad, W - pad * 2, fontSize * 1.2)
  for (const line of hlLines) {
    ctx.fillText(line, pad, curY + fontSize)
    curY += fontSize * 1.2
  }
  curY += fontSize * 0.4

  // Accent divider
  const grad = ctx.createLinearGradient(pad, 0, pad + W * 0.25, 0)
  grad.addColorStop(0, primaryColor)
  grad.addColorStop(1, accentColor)
  ctx.fillStyle = grad
  ctx.fillRect(pad, curY, W * 0.25, 3)
  curY += 20

  // --- Subheadline ---
  const subSize = Math.round(W * 0.028)
  ctx.font = `400 ${subSize}px Inter, system-ui, sans-serif`
  ctx.fillStyle = subColor
  const subLines = wrapText(ctx, selection.subheadline, pad, W - pad * 2, subSize * 1.4)
  for (const line of subLines) {
    ctx.fillText(line, pad, curY + subSize)
    curY += subSize * 1.4
  }
  curY += subSize * 1.2

  // --- Body copy ---
  const bodySize = Math.round(W * 0.022)
  ctx.font = `300 ${bodySize}px Inter, system-ui, sans-serif`
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,10,26,0.4)'
  const bodyLines = wrapText(ctx, selection.body_copy, pad, W - pad * 2, bodySize * 1.5)
  for (const line of bodyLines.slice(0, 4)) {
    ctx.fillText(line, pad, curY + bodySize)
    curY += bodySize * 1.5
  }

  // --- CTA Button (bottom area) ---
  const btnY = H - pad - Math.round(W * 0.065)
  const btnH = Math.round(W * 0.062)
  const btnW = Math.min(W * 0.42, 280)
  const btnGrad = ctx.createLinearGradient(pad, 0, pad + btnW, 0)
  btnGrad.addColorStop(0, primaryColor)
  btnGrad.addColorStop(1, accentColor)
  ctx.fillStyle = btnGrad
  drawRoundRect(ctx, pad, btnY, btnW, btnH, btnH / 2)
  ctx.fill()

  const ctaSize = Math.round(W * 0.026)
  ctx.font = `700 ${ctaSize}px Inter, system-ui, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.fillText(selection.cta, pad + btnW / 2, btnY + btnH / 2 + ctaSize * 0.35)
  ctx.textAlign = 'left'

  // --- Hashtags ---
  const tagSize = Math.round(W * 0.018)
  ctx.font = `400 ${tagSize}px Inter, system-ui, sans-serif`
  ctx.fillStyle = isDark ? primaryColor + 'cc' : primaryColor
  const tagText = selection.hashtags.slice(0, 5).map(t => `#${t}`).join('  ')
  ctx.fillText(tagText, pad + btnW + 16, btnY + btnH / 2 + tagSize * 0.35)

  // --- Watermark ---
  ctx.font = `400 ${Math.round(W * 0.015)}px Inter, system-ui, sans-serif`
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
  ctx.textAlign = 'right'
  ctx.fillText('made with AdForge AI', W - pad, H - 14)
  ctx.textAlign = 'left'
}

export default function Step3ComposeAd({ adSelection, adDesign, onDesignChange, onBack, onNext }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null)
  const currentFmt = FORMATS.find(f => f.id === adDesign.format) ?? FORMATS[0]

  const redraw = useCallback(() => {
    if (!canvasRef.current) return
    drawAd(canvasRef.current, adDesign, adSelection, currentFmt, bgImg)
  }, [adDesign, adSelection, currentFmt, bgImg])

  useEffect(() => { redraw() }, [redraw])

  function set<K extends keyof AdDesign>(key: K, value: AdDesign[K]) {
    onDesignChange({ ...adDesign, [key]: value })
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { setBgImg(img); set('template', 'photo') }
    img.src = url
  }

  function downloadPng() {
    if (!canvasRef.current) return
    const a = document.createElement('a')
    a.download = 'ad-adforge.png'
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  const canvasDisplayW = adDesign.format === 'story' ? 300 : adDesign.format === 'landscape' ? 480 : 380
  const canvasDisplayH = adDesign.format === 'story' ? 533 : adDesign.format === 'landscape' ? 270 : 380

  return (
    <div className="animate-slide-up">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-white mb-2">Compose your image ad</h1>
        <p className="text-white/45 text-sm">Customize the template, colors, and format. Your ad updates live.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Controls */}
        <div className="space-y-5">
          {/* Template picker */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Template</p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set('template', t.id)}
                  className={`copy-card text-left ${adDesign.template === t.id ? 'copy-card-selected' : ''}`}
                >
                  <p className="font-semibold text-xs text-white">{t.label}</p>
                  <p className="text-white/35 text-[11px]">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Format</p>
            <div className="flex gap-2">
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => set('format', f.id)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                    adDesign.format === f.id
                      ? 'border-brand-500/50 bg-brand-500/10 text-white'
                      : 'border-white/8 bg-white/3 text-white/40 hover:border-white/15'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Brand Colors</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="color"
                  value={adDesign.primaryColor}
                  onChange={e => set('primaryColor', e.target.value)}
                  className="w-10 h-10 rounded-lg border-2 border-white/15 cursor-pointer bg-transparent"
                />
                <div>
                  <p className="text-xs text-white font-medium">Primary</p>
                  <p className="text-xs text-white/30">{adDesign.primaryColor}</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="color"
                  value={adDesign.accentColor}
                  onChange={e => set('accentColor', e.target.value)}
                  className="w-10 h-10 rounded-lg border-2 border-white/15 cursor-pointer bg-transparent"
                />
                <div>
                  <p className="text-xs text-white font-medium">Accent</p>
                  <p className="text-xs text-white/30">{adDesign.accentColor}</p>
                </div>
              </label>
            </div>
          </div>

          {/* Image upload */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
              Background Image
              <span className="text-white/25 font-normal ml-1">(optional — activates Photo template)</span>
            </p>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="flex-1 py-3 px-4 rounded-xl border border-dashed border-white/15 text-center text-xs text-white/35 group-hover:border-brand-500/40 group-hover:text-white/60 transition-all">
                {bgImg ? '✓ Image uploaded — switch to Photo template' : 'Click to upload product image'}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          {/* Quick presets */}
          <div>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Color Presets</p>
            <div className="flex gap-2">
              {[
                ['#8b30ff', '#ec4899'],
                ['#0ea5e9', '#6366f1'],
                ['#10b981', '#06b6d4'],
                ['#f59e0b', '#ef4444'],
                ['#1a1a2e', '#e94560'],
              ].map(([p, a]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onDesignChange({ ...adDesign, primaryColor: p, accentColor: a })}
                  className="w-8 h-8 rounded-lg border-2 border-white/10 hover:border-white/30 transition-all"
                  style={{ background: `linear-gradient(135deg, ${p}, ${a})` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Canvas preview */}
        <div className="flex flex-col items-center gap-4">
          <div className="glass rounded-2xl p-3">
            <canvas
              ref={canvasRef}
              style={{ width: canvasDisplayW, height: canvasDisplayH, borderRadius: '8px', display: 'block' }}
            />
          </div>
          <button
            type="button"
            onClick={downloadPng}
            className="btn-ghost text-xs px-4 py-2 gap-1"
          >
            ↓ Download PNG
          </button>
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="btn-ghost">← Back</button>
        <button onClick={onNext} className="btn-primary px-8 py-3.5">
          Preview Reel →
        </button>
      </div>
    </div>
  )
}
