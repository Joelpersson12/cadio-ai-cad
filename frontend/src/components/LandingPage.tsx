import { useState } from "react";
import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";

type Language = "en" | "sv";

const copy = {
  en: {
    nav: ["Product", "Workflow", "Beta", "Start building"],
    beta: ["Early Access Beta", "Cadio is currently in active development.", "All downloads are currently unlocked.", "Pricing launches later.", "We welcome feedback at"],
    hero: {
      badge: "Public beta · Cadio.net",
      label: "[01] AI-assisted CAD builder",
      titleA: "Build less from scratch.",
      titleB: "Print faster.",
      body: "Cadio searches real printable model sources, helps you remix what already works, generates CAD from text or images, and keeps export settings close to the build plate.",
      prompt: "Make this logo 5 mm thick · Add a keychain hole · Tool holder for Skadis",
      secondary: "See workflow",
    },
    stats: [
      ["Source-first", "Search real printable models before generating from scratch"],
      ["Text + Image", "Create from prompts, logos, icons, silhouettes, and simple shapes"],
      ["Export-ready", "Download STL, 3MF, OBJ, or AMF with print-aware settings"],
    ],
    product: {
      label: "[02] What Cadio does",
      title: "A darker, sharper workspace for turning ideas into printable parts.",
      body: "Cadio is not just a gallery and not a toy generator. It is a practical builder for finding, modifying, and exporting printable 3D models with enough CAD control to stay useful.",
    },
    features: [
      ["01", "Search real models", "Describe what you want and Cadio checks public printable model sources first, with source links kept visible.", "Printables · Thingiverse · official STL sources"],
      ["02", "Remix the result", "Move through variants, keep the closest match, then adjust scale, placement, material, printer profile, and export format.", "Variant-aware workflow"],
      ["03", "Create from text", "Use plain language for brackets, holders, organizers, stands, simple mounts, and other everyday printable parts.", "Swedish and English prompts"],
      ["04", "Image / Logo to 3D", "Attach a logo, icon, silhouette, or simple 2D shape and turn the detected outline into an extruded printable model.", "Best for clean, high-contrast images"],
    ],
    process: {
      label: "[03] The loop",
      title: "Sentence to solid, without losing control.",
      body: "Start conversational, keep the build plate visible, then switch into tighter CAD decisions when the model needs to become printable.",
    },
    steps: [
      ["01", "Describe", "Prompt, image, or both", '> "turn this logo into a\n   120 mm wide keychain\n   with a 5 mm hole"'],
      ["02", "Refine", "AI proposes, you decide", "width      120.0 mm\nthickness     5.0 mm\nselected   #2563eb"],
      ["03", "Export", "Straight to slicer", "STL  · ready\n3MF  · profile aware\nOBJ  · mesh export\nAMF  · fallback"],
    ],
    handoff: {
      label: "[04] Print handoff",
      title: "The last mile should feel boring in the best way.",
      body: "Cadio keeps the viewer, model source, selected printer, dimensions, and export choices together so you do not have to hunt through a pile of files before slicing.",
      bullets: ["Opaque CAD-style viewer", "Visible build plate and clean edges", "Image-to-3D output centered at Z 0"],
    },
    final: ["[05] Public beta", "Start building.", "Search real printable models, remix, generate from text, turn simple images into STL, and export.", "Open builder"],
  },
  sv: {
    nav: ["Produkt", "Arbetsflöde", "Beta", "Börja bygga"],
    beta: ["Early Access Beta", "Cadio är fortfarande under aktiv utveckling.", "Alla nedladdningar är upplåsta just nu.", "Priser kommer senare.", "Skicka gärna feedback till"],
    hero: {
      badge: "Publik beta · Cadio.net",
      label: "[01] AI-assisterad CAD-byggare",
      titleA: "Bygg mindre från noll.",
      titleB: "Skriv ut snabbare.",
      body: "Cadio söker i riktiga källor för printbara modeller, hjälper dig remixa sådant som redan fungerar, skapar CAD från text eller bild och håller exportinställningarna nära byggplattan.",
      prompt: "Gör loggan 5 mm tjock · Lägg till nyckelringshål · Verktygshållare för Skådis",
      secondary: "Se flödet",
    },
    stats: [
      ["Källor först", "Sök riktiga printbara modeller innan något genereras från noll"],
      ["Text + bild", "Skapa från prompts, logotyper, ikoner, silhuetter och enkla former"],
      ["Redo för export", "Ladda ner STL, 3MF, OBJ eller AMF med printmedvetna inställningar"],
    ],
    product: {
      label: "[02] Vad Cadio gör",
      title: "En mörkare, skarpare arbetsyta för idéer som ska bli printbara delar.",
      body: "Cadio är varken bara ett galleri eller en leksaksgenerator. Det är en praktisk byggare för att hitta, ändra och exportera 3D-modeller med tillräckligt mycket CAD-kontroll för att kännas användbar.",
    },
    features: [
      ["01", "Sök riktiga modeller", "Beskriv vad du vill ha och Cadio letar först i publika källor för printbara modeller, med källänkar synliga.", "Printables · Thingiverse · officiella STL-källor"],
      ["02", "Remixa resultatet", "Bläddra mellan varianter, behåll närmaste träff och justera skala, placering, material, skrivarprofil och exportformat.", "Variantmedvetet flöde"],
      ["03", "Skapa från text", "Skriv vanliga ord för fästen, hållare, organisering, stativ, enkla mounts och andra vardagsdelar som ska kunna printas.", "Svenska och engelska prompts"],
      ["04", "Bild / logga till 3D", "Bifoga en logga, ikon, silhuett eller enkel 2D-form och gör konturen till en extruderad printbar modell.", "Bäst för rena bilder med hög kontrast"],
    ],
    process: {
      label: "[03] Loopen",
      title: "Från mening till solid modell, utan att tappa kontrollen.",
      body: "Börja med naturligt språk, håll byggplattan synlig och gå sedan över till tydligare CAD-val när modellen behöver bli printbar på riktigt.",
    },
    steps: [
      ["01", "Beskriv", "Prompt, bild eller båda", '> "gör den här loggan\n   120 mm bred med\n   5 mm hål för nyckelring"'],
      ["02", "Förfina", "AI föreslår, du bestämmer", "bredd      120.0 mm\ntjocklek      5.0 mm\nmarkerad   #2563eb"],
      ["03", "Exportera", "Rakt mot slicern", "STL  · redo\n3MF  · profilmedveten\nOBJ  · meshexport\nAMF  · fallback"],
    ],
    handoff: {
      label: "[04] Print-handoff",
      title: "Sista steget ska kännas tråkigt på bästa sätt.",
      body: "Cadio håller viewer, modellkälla, vald skrivare, mått och exportval tillsammans så du slipper leta genom en hög filer innan slicing.",
      bullets: ["Ogenomskinlig CAD-viewer", "Synlig byggplatta och rena kanter", "Bild-till-3D centrerad vid Z 0"],
    },
    final: ["[05] Publik beta", "Börja bygga.", "Sök riktiga printbara modeller, remixa, generera från text, gör enkla bilder till STL och exportera.", "Öppna buildern"],
  },
} as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function MicroLabel({ children }: { children: string }) {
  return <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#28c7df]">{children}</div>;
}

function CadPreview() {
  return (
    <div className="relative min-h-[430px] overflow-hidden border border-white/10 bg-[#070707] shadow-[0_40px_120px_rgba(0,0,0,0.55)] md:min-h-[560px]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:38px_38px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(40,199,223,0.22),transparent_38%),linear-gradient(180deg,rgba(5,5,5,0)_0%,rgba(5,5,5,0.88)_100%)]" />
      <div className="absolute left-1/2 top-[46%] h-[230px] w-[330px] -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] skew-y-[-6deg] border border-[#4b5563]/60 bg-[#11161a] shadow-[0_34px_90px_rgba(0,0,0,0.65)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="absolute left-[70px] top-[86px] h-20 w-44 border border-[#4b5563] bg-[#b8bcc4] shadow-[14px_18px_0_rgba(0,0,0,0.28)]" />
        <div className="absolute left-[176px] top-[72px] h-20 w-20 border border-[#1d4ed8] bg-[#2563eb] shadow-[0_0_34px_rgba(37,99,235,0.45)]" />
        <div className="absolute left-[108px] top-[66px] h-16 w-16 border border-[#4b5563] bg-[#b8bcc4]" />
        <div className="absolute left-[250px] top-[170px] h-10 w-10 border border-[#8ff2ff] bg-[#28c7df]" />
      </div>
      <div className="absolute left-4 top-4 border border-white/10 bg-black/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 backdrop-blur md:left-6 md:top-6">Live CAD preview</div>
      <div className="absolute bottom-4 left-4 right-4 grid gap-2 text-xs md:bottom-6 md:left-6 md:right-6 md:grid-cols-3">
        {["STL", "3MF", "OBJ"].map((format) => (
          <div key={format} className="border border-white/10 bg-black/60 p-3 backdrop-blur">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#28c7df]">{format}</div>
            <div className="mt-1 text-white/70">export ready</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [showBeta, setShowBeta] = useState(false);
  const text = copy[language];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#050505]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-5 md:px-10">
          <CadioLogo subtitle="AI CAD workspace" onClick={() => scrollToSection("top")} />
          <nav className="hidden items-center gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 lg:flex">
            <button type="button" onClick={() => scrollToSection("product")} className="transition hover:text-white">{text.nav[0]}</button>
            <button type="button" onClick={() => scrollToSection("process")} className="transition hover:text-white">{text.nav[1]}</button>
            <button type="button" onClick={() => scrollToSection("beta")} className="transition hover:text-white">{text.nav[2]}</button>
          </nav>
          <div className="flex items-center gap-2">
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="hidden border border-white/10 bg-black px-3 py-2 text-xs text-white/75 outline-none transition hover:border-white/25 sm:block" aria-label="Language">
              <option value="en">English</option>
              <option value="sv">Svenska</option>
            </select>
            <button type="button" onClick={() => setShowBeta(true)} className="hidden border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70 transition hover:border-[#28c7df]/70 hover:text-white md:inline-flex">Beta</button>
            <button type="button" onClick={onStartBuilding} className="bg-[#28c7df] px-4 py-2 text-sm font-bold text-[#041114] shadow-[0_0_36px_rgba(40,199,223,0.28)] transition hover:bg-[#52dded] md:px-5">{text.nav[3]}</button>
          </div>
        </div>
      </header>

      {showBeta && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg border border-white/10 bg-[#090909] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
            <div className="mb-5 flex items-start justify-between gap-5">
              <div><MicroLabel>Beta</MicroLabel><h2 className="mt-3 text-2xl font-black">{text.beta[0]}</h2></div>
              <button type="button" onClick={() => setShowBeta(false)} className="grid h-9 w-9 place-items-center border border-white/10 text-white/60 transition hover:border-white/30 hover:text-white" aria-label="Close">x</button>
            </div>
            <p className="text-sm leading-6 text-white/70">{text.beta[1]}</p>
            <div className="mt-5 space-y-2 text-sm text-white/70">
              <p>{text.beta[2]}</p><p>{text.beta[3]}</p>
              <p>{text.beta[4]} <a href="mailto:support@cadio.net" className="text-[#28c7df] hover:text-white">support@cadio.net</a>.</p>
            </div>
          </div>
        </div>
      )}

      <main>
        <section id="top" className="relative min-h-screen overflow-hidden border-b border-white/10 pt-28 md:pt-32">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(40,199,223,0.2),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(180deg,rgba(5,5,5,0.2)_0%,#050505_86%)]" />
          <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 pb-14 md:px-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <div className="mb-8 flex flex-wrap items-center gap-3">
                <span className="border border-[#28c7df]/50 bg-[#28c7df]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8ff2ff]">{text.hero.badge}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">{text.hero.label}</span>
              </div>
              <h1 className="max-w-5xl text-[clamp(3.3rem,10vw,8.8rem)] font-black leading-[0.88] tracking-normal">
                <span className="block">{text.hero.titleA}</span>
                <span className="relative mt-2 block text-[#28c7df]">{text.hero.titleB}<span className="absolute -bottom-2 left-1 h-[3px] w-[58%] bg-[#28c7df]/80 shadow-[0_0_24px_rgba(40,199,223,0.75)]" /></span>
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-white/70 md:text-xl">{text.hero.body}</p>
              <div className="mt-8 max-w-2xl border border-white/10 bg-black/50 p-3 backdrop-blur">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">Prompt / attachment bar</div>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center border border-white/10 bg-white/[0.03] text-xl text-[#28c7df]">+</span>
                  <p className="min-w-0 flex-1 truncate text-sm text-white/75">{text.hero.prompt}</p>
                  <span className="hidden border border-[#28c7df]/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8ff2ff] sm:inline-block">Image to 3D</span>
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={onStartBuilding} className="bg-[#28c7df] px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#041114] shadow-[0_0_42px_rgba(40,199,223,0.32)] transition hover:bg-[#52dded]">{text.nav[3]}</button>
                <button type="button" onClick={() => scrollToSection("process")} className="border border-white/15 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-white/80 transition hover:border-[#28c7df]/70 hover:text-white">{text.hero.secondary}</button>
              </div>
            </div>
            <div className="lg:col-span-5"><CadPreview /></div>
          </div>
          <div className="relative mx-auto grid max-w-[1400px] border-t border-white/10 px-5 md:grid-cols-3 md:px-10">
            {text.stats.map(([title, body]) => <div key={title} className="border-white/10 py-6 md:border-r md:px-8 md:last:border-r-0"><div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#28c7df]">{title}</div><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">{body}</p></div>)}
          </div>
        </section>

        <section id="product" className="relative border-b border-white/10 py-24 md:py-32">
          <div className="mx-auto max-w-[1400px] px-5 md:px-10">
            <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-7"><MicroLabel>{text.product.label}</MicroLabel><h2 className="mt-5 text-4xl font-black leading-[0.98] md:text-6xl">{text.product.title}</h2></div>
              <p className="max-w-xl text-base leading-7 text-white/60 lg:col-span-5">{text.product.body}</p>
            </div>
            <div className="mt-14 grid border border-white/10 bg-white/[0.06] md:grid-cols-2 xl:grid-cols-4">
              {text.features.map(([number, title, body, note]) => (
                <article key={title} className="min-h-[300px] bg-[#080808] p-7 md:p-8">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">{number}</div>
                  <h3 className="mt-10 text-2xl font-black">{title}</h3>
                  <p className="mt-4 text-sm leading-6 text-white/60">{body}</p>
                  <div className="mt-8 border-t border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#28c7df]">{note}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="process" className="border-b border-white/10 py-24 md:py-32">
          <div className="mx-auto max-w-[1400px] px-5 md:px-10">
            <div className="max-w-4xl"><MicroLabel>{text.process.label}</MicroLabel><h2 className="mt-5 text-4xl font-black leading-[0.98] md:text-6xl">{text.process.title}</h2><p className="mt-6 max-w-2xl text-base leading-7 text-white/60">{text.process.body}</p></div>
            <div className="mt-14 grid border border-white/10 bg-white/[0.06] lg:grid-cols-3">
              {text.steps.map(([number, title, eyebrow, code]) => (
                <article key={title} className="bg-[#080808] p-7 md:p-9">
                  <div className="flex items-center justify-between gap-5"><span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#28c7df]">{number}</span><span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">{eyebrow}</span></div>
                  <h3 className="mt-10 text-3xl font-black">{title}</h3>
                  <pre className="mt-8 min-h-[128px] overflow-hidden border border-white/10 bg-black/70 p-5 font-mono text-xs leading-6 text-white/70">{code}</pre>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-b border-white/10 py-24 md:py-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(40,199,223,0.15),transparent_30%),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,52px_52px]" />
          <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 md:px-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <div className="border border-white/10 bg-[#080808] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.55)] md:p-6">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4"><div><div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#28c7df]">Build plate</div><div className="mt-1 text-sm text-white/50">235 x 235 mm · PLA · 0.20 mm</div></div><div className="border border-[#28c7df]/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8ff2ff]">Ready</div></div>
                <div className="relative min-h-[320px] overflow-hidden border border-white/10 bg-[#0b0d0f]">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:34px_34px]" />
                  <div className="absolute left-1/2 top-1/2 h-32 w-56 -translate-x-1/2 -translate-y-1/2 border border-[#4b5563]/60 bg-[#b8bcc4] shadow-[0_24px_70px_rgba(0,0,0,0.45)]" />
                  <div className="absolute left-[52%] top-[42%] h-16 w-16 border border-[#1d4ed8] bg-[#2563eb] shadow-[0_0_36px_rgba(37,99,235,0.42)]" />
                </div>
              </div>
            </div>
            <div className="lg:col-span-5">
              <MicroLabel>{text.handoff.label}</MicroLabel><h2 className="mt-5 text-4xl font-black leading-[0.98] md:text-6xl">{text.handoff.title}</h2><p className="mt-6 text-base leading-7 text-white/60">{text.handoff.body}</p>
              <div className="mt-8 space-y-4">{text.handoff.bullets.map((bullet) => <div key={bullet} className="flex gap-3 border-t border-white/10 pt-4 text-sm leading-6 text-white/70"><span className="mt-2 h-1.5 w-1.5 shrink-0 bg-[#28c7df]" /><span>{bullet}</span></div>)}</div>
            </div>
          </div>
        </section>

        <section id="beta" className="relative overflow-hidden py-24 md:py-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(40,199,223,0.18),transparent_34%)]" />
          <div className="relative mx-auto max-w-[1400px] px-5 text-center md:px-10">
            <MicroLabel>{text.final[0]}</MicroLabel><h2 className="mt-6 text-[clamp(4rem,14vw,12rem)] font-black leading-[0.82] tracking-normal">{text.final[1]}</h2><p className="mx-auto mt-8 max-w-2xl text-base leading-7 text-white/60">{text.final[2]}</p>
            <button type="button" onClick={onStartBuilding} className="mt-10 bg-[#28c7df] px-7 py-4 text-sm font-black uppercase tracking-[0.14em] text-[#041114] shadow-[0_0_42px_rgba(40,199,223,0.32)] transition hover:bg-[#52dded]">{text.final[3]}</button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
