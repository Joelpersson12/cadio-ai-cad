import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";

type Language = "en" | "sv" | "es" | "fr" | "it" | "de" | "pt";

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: "en", label: "EN" },
  { value: "sv", label: "SV" },
  { value: "es", label: "ES" },
  { value: "fr", label: "FR" },
  { value: "it", label: "IT" },
  { value: "de", label: "DE" },
  { value: "pt", label: "PT" },
];

const enCopy = {
  nav: {
    product: "Product",
    workflow: "Workflow",
    pricing: "Beta",
    start: "Start building",
  },
  hero: {
    eyebrow: "AI CAD search for real 3D printing",
    title: "Find the model. Remix the details. Export it for your printer.",
    body: "Cadio searches public printable model sources, turns strong matches into an editable workspace, and keeps dimensions, variants, materials, and export settings in one clean flow.",
    prompt: "tool holder for pegboard, bike mounted snus can holder, foldable phone stand...",
    primary: "Start building",
    secondary: "Beta access",
  },
  stats: [
    ["Source-first", "Searches for proven printable models before falling back to CAD logic"],
    ["Prompt + CAD", "Use plain language first, then edit parts, dimensions, edges, and transforms"],
    ["Print aware", "Printer, material, scaling, creator settings, and export format stay together"],
  ],
  product: {
    title: "A CAD builder for every level",
    body: "Easy mode helps you describe what you want. Expert mode gives you control over sketches, parts, transforms, edges, and CAD operations.",
  },
  cards: [
    ["Broad model search", "Write in English, Swedish, Spanish, French, Italian, German, or Portuguese. Cadio normalizes the prompt before searching."],
    ["Variant control", "Move to the next or previous popular match when the first result is close but not right."],
    ["Manual CAD", "Draw, select parts, move, rotate, measure, and refine the model when you want direct control."],
  ],
  details: {
    label: "Practical CAD flow",
    title: "Built for the moment between search and slicer",
    body: "Most prints start as a half-clear idea: a holder for a specific place, a bracket for a specific tool, or a remix of a known model. Cadio keeps search, variants, measurements, print settings, and CAD edits close together.",
    items: [
      ["Variant control", "Move between model options when the first result is not the right one."],
      ["Real dimensions", "Check bounds and scale before the file reaches your printer profile."],
      ["Editable workflow", "Start with AI, then adjust details by hand when precision matters."],
    ],
  },
  workflow: {
    title: "From idea to STL without switching tools",
    steps: [
      ["1", "Write a prompt", "Example: cup holder with desk mount, phone stand, or a replacement bracket."],
      ["2", "Pick a variant", "Move through popular model options until the shape is right."],
      ["3", "Fine tune", "Adjust dimensions, material, color, placement, and CAD details."],
      ["4", "Export", "Download STL, 3MF, OBJ, or AMF with recommended print settings."],
    ],
  },
  pricingTitle: "Pricing coming soon",
  pricingBody: "For now, Cadio is free during Early Access Beta. Build, edit, and download while we improve the platform.",
  beta: {
    title: "Early Access Beta",
    body: "Cadio is currently in active development.",
    downloads: "All downloads currently unlocked.",
    pricing: "Pricing launches later.",
    feedback: "We welcome feedback at",
  },
};

const svCopy: typeof enCopy = {
  nav: {
    product: "Produkt",
    workflow: "Arbetsflöde",
    pricing: "Beta",
    start: "Börja bygga",
  },
  hero: {
    eyebrow: "AI-CAD för verkliga 3D-utskrifter",
    title: "Beskriv modellen. Justera som i CAD. Skriv ut med rätt profil.",
    body: "Cadio hjälper dig hitta printbara modellidéer, skapa redigerbar CAD-geometri från prompts och exportera med skrivarens inställningar i åtanke.",
    prompt: "Gridfinity Storage Box",
    primary: "Börja bygga",
    secondary: "Betaåtkomst",
  },
  stats: [
    ["Källmedveten", "Letar efter beprövade printbara mönster innan modellen byggs"],
    ["Easy + Expert", "AI-styrda snabbändringar eller manuella CAD-verktyg när du vill styra själv"],
    ["Printklar", "Skrivare, material, skala och exportformat i samma flöde"],
  ],
  product: {
    title: "En CAD-byggare för alla nivåer",
    body: "Easy mode hjälper dig beskriva vad du vill skapa. Expert mode ger dig kontroll över skisser, delar, transformeringar, kanter och CAD-operationer.",
  },
  cards: [
    ["AI-modellsökning", "Skriv vad du vill bygga. Cadio söker efter källsignaler och skapar en printbar startpunkt."],
    ["Manuell CAD", "Rita, markera delar, flytta, rotera, mät och förfina modellen när du vill ta över själv."],
    ["Skrivarprofiler", "Välj skrivare, material, skala och exportformat innan modellen hamnar i slicern."],
  ],
  details: {
    label: "Praktiskt CAD-flöde",
    title: "Byggd för mellanläget mellan idé och slicer",
    body: "De flesta printprojekt behöver mer än en genererad form. Cadio håller modellvarianter, mått, printinställningar och manuella ändringar nära varandra så modellen känns användbar innan export.",
    items: [
      ["Variantkontroll", "Byt modellförslag när första resultatet inte passar."],
      ["Verkliga mått", "Kontrollera mått och skala innan filen hamnar i skrivarprofilen."],
      ["Redigerbart flöde", "Börja med AI och finjustera sedan för hand när precision spelar roll."],
    ],
  },
  workflow: {
    title: "Från idé till STL utan att byta verktyg",
    steps: [
      ["1", "Skriv en prompt", "Exempel: cup holder with desk mount, phone stand eller en reservdelshållare."],
      ["2", "Välj variant", "Byt mellan populära modellförslag tills formen sitter."],
      ["3", "Finjustera", "Ändra dimensioner, material, färg, placering och CAD-detaljer."],
      ["4", "Exportera", "Ladda ner STL, 3MF, OBJ eller AMF med rekommenderade printinställningar."],
    ],
  },
  pricingTitle: "Priser kommer snart",
  pricingBody: "Just nu är Cadio gratis under Early Access Beta. Bygg, redigera och ladda ner medan vi förbättrar plattformen.",
  beta: {
    title: "Early Access Beta",
    body: "Cadio är under aktiv utveckling.",
    downloads: "Alla nedladdningar är upplåsta just nu.",
    pricing: "Priser lanseras senare.",
    feedback: "Vi tar gärna emot feedback på",
  },
};

const copy: Record<Language, typeof enCopy> = {
  en: enCopy,
  sv: svCopy,
  es: enCopy,
  fr: enCopy,
  it: enCopy,
  de: enCopy,
  pt: enCopy,
};

function HeroModel() {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#d7d9dc", roughness: 0.46, metalness: 0.06 }),
    [],
  );
  const wallMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f3f4f6", roughness: 0.5, metalness: 0.04 }),
    [],
  );
  const accentMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#28c7df",
        emissive: "#0c5664",
        emissiveIntensity: 0.14,
        roughness: 0.34,
        metalness: 0.12,
      }),
    [],
  );
  const dividerPositions = [-0.68, 0.68];
  const magnetPositions = [-1.35, 1.35];

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -0.5 + Math.sin(clock.elapsedTime * 0.24) * 0.065;
    groupRef.current.rotation.x = 0.36 + Math.sin(clock.elapsedTime * 0.18) * 0.024;
  });

  return (
    <group ref={groupRef} position={[0.15, -0.35, 0]}>
      <group position={[0, 0.72, 0]} rotation={[0, 0.08, 0]}>
        <mesh material={bodyMaterial} position={[0, -0.44, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 0.28, 3.2]} />
        </mesh>
        <mesh material={wallMaterial} position={[0, 0.1, -1.48]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 1.18, 0.24]} />
        </mesh>
        <mesh material={wallMaterial} position={[0, 0.1, 1.48]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 1.18, 0.24]} />
        </mesh>
        <mesh material={wallMaterial} position={[-1.78, 0.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 1.18, 3.2]} />
        </mesh>
        <mesh material={wallMaterial} position={[1.78, 0.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 1.18, 3.2]} />
        </mesh>
        {dividerPositions.map((x) => (
          <mesh key={`x-${x}`} material={wallMaterial} position={[x, 0.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.14, 1.02, 2.72]} />
          </mesh>
        ))}
        {dividerPositions.map((z) => (
          <mesh key={`z-${z}`} material={wallMaterial} position={[0, 0.1, z]} castShadow receiveShadow>
            <boxGeometry args={[3.34, 1.02, 0.14]} />
          </mesh>
        ))}
        {magnetPositions.flatMap((x) =>
          magnetPositions.map((z) => (
            <mesh key={`${x}-${z}`} material={accentMaterial} position={[x, -0.26, z]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 40]} />
            </mesh>
          )),
        )}
        <mesh material={accentMaterial} position={[0, 0.74, -1.62]} castShadow receiveShadow>
          <boxGeometry args={[3.3, 0.12, 0.1]} />
        </mesh>
      </group>
      <gridHelper args={[8, 18, "#7d8388", "#4d5257"]} position={[0, -0.02, 0]} />
    </group>
  );
}

function HeroScene() {
  return (
    <div className="absolute inset-0">
      <Canvas dpr={[1, 1.75]} shadows camera={{ position: [4.8, 5.2, 6.4], fov: 38 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#2b2d30"]} />
        <fog attach="fog" args={["#2b2d30", 7, 15]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 8, 4]} intensity={2.2} castShadow />
        <pointLight position={[-4, 3, -4]} intensity={0.8} color="#2bb8dc" />
        <HeroModel />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(12,12,13,0.92)_0%,rgba(18,18,19,0.72)_38%,rgba(18,18,19,0.10)_72%,rgba(18,18,19,0.34)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(0deg,#151515_0%,rgba(21,21,21,0)_100%)]" />
    </div>
  );
}

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [betaOpen, setBetaOpen] = useState(false);
  const text = copy[language];

  const openPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="h-full overflow-y-auto bg-[#151515] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#151515]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <CadioLogo subtitle="" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
          <nav className="hidden items-center gap-7 text-sm text-[#c2c2c4] md:flex">
            <a href="#product" className="hover:text-white">{text.nav.product}</a>
            <a href="#workflow" className="hover:text-white">{text.nav.workflow}</a>
            <a href="#pricing" className="hover:text-white">{text.nav.pricing}</a>
          </nav>
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              className="h-9 rounded-lg border border-white/10 bg-[#222] px-2 text-xs text-white outline-none"
              aria-label="Language"
            >
              {languageOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setBetaOpen(true)}
              className="hidden rounded-lg border border-[#2bb8dc]/45 bg-[#102b33] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#b7f3ff] shadow-[0_0_18px_rgba(43,184,220,0.14)] hover:border-[#69d9f5] hover:text-white sm:block"
            >
              Early Access Beta
            </button>
            <button onClick={onStartBuilding} className="h-9 rounded-lg bg-[#e8e8e8] px-4 text-sm font-semibold text-[#151515] hover:bg-white">
              {text.nav.start}
            </button>
          </div>
        </div>
      </header>

      {betaOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#343436] bg-[#1f1f20] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{text.beta.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#c9c9cc]">{text.beta.body}</p>
              </div>
              <button type="button" onClick={() => setBetaOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2b2b2d] text-sm text-[#bdbdbd] hover:text-white" aria-label="Close beta information">
                x
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#d9d9db]">
              <p>{text.beta.downloads}</p>
              <p>{text.beta.pricing}</p>
              <p>
                {text.beta.feedback}{" "}
                <a className="font-semibold text-[#69d9f5] hover:text-white" href="mailto:support@cadio.net">support@cadio.net</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      <main>
        <section className="relative min-h-[760px] overflow-hidden pt-16">
          <HeroScene />
          <div className="relative z-10 mx-auto flex min-h-[700px] max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#2bb8dc]">{text.hero.eyebrow}</p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">{text.hero.title}</h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#c9c9cc] sm:text-lg">{text.hero.body}</p>
              <div className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-white/15 bg-[#202020]/86 p-2 shadow-2xl backdrop-blur">
                <div className="min-w-0 flex-1 px-3 text-sm text-[#c8c8cb]">{text.hero.prompt}</div>
                <button onClick={onStartBuilding} className="shrink-0 rounded-xl bg-[#2bb8dc] px-4 py-3 text-sm font-bold text-[#101010] hover:bg-[#69d9f5]">
                  {text.hero.primary}
                </button>
              </div>
              <button onClick={openPricing} className="mt-4 rounded-lg px-4 py-3 text-sm font-semibold text-[#d8d8d9] hover:bg-white/10">
                {text.hero.secondary}
              </button>
            </div>
          </div>
          <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 gap-px border-y border-white/10 bg-white/10 sm:grid-cols-3">
            {text.stats.map(([title, body]) => (
              <div key={title} className="bg-[#151515]/94 px-6 py-5">
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="mt-1 text-xs leading-5 text-[#a8a8ab]">{body}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="product" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">{text.product.title}</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#b8b8bb]">{text.product.body}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {text.cards.map(([title, body]) => (
                <article key={title} className="rounded-xl border border-white/10 bg-[#202020] p-5">
                  <div className="mb-4 h-1.5 w-10 rounded-full bg-[#2bb8dc]" />
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-xs leading-6 text-[#a9a9ac]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#181818]">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2bb8dc]">{text.details.label}</p>
              <h2 className="mt-4 max-w-xl text-3xl font-semibold text-white">{text.details.title}</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#b8b8bb]">{text.details.body}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {text.details.items.map(([title, body]) => (
                <article key={title} className="rounded-xl border border-white/10 bg-[#222] p-5">
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-xs leading-6 text-[#a9a9ac]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="border-y border-white/10 bg-[#1b1b1c]">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <h2 className="max-w-2xl text-3xl font-semibold text-white sm:text-4xl">{text.workflow.title}</h2>
            <div className="mt-10 grid gap-3 md:grid-cols-4">
              {text.workflow.steps.map(([number, title, body]) => (
                <article key={number} className="rounded-xl border border-white/10 bg-[#242425] p-5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#2bb8dc] text-sm font-black text-[#101010]">{number}</span>
                  <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-xs leading-6 text-[#a9a9ac]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">{text.pricingTitle}</h2>
              <p className="mt-3 text-sm text-[#b8b8bb]">{text.pricingBody}</p>
            </div>
            <button onClick={onStartBuilding} className="w-fit rounded-lg bg-[#e8e8e8] px-4 py-3 text-sm font-semibold text-[#151515] hover:bg-white">
              {text.nav.start}
            </button>
          </div>
          <div className="rounded-2xl border border-[#2bb8dc]/35 bg-[#102b33] p-6 shadow-[0_0_38px_rgba(43,184,220,0.10)] sm:p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b7f3ff]">Early Access Beta</div>
                <h3 className="mt-3 text-2xl font-semibold text-white">{text.beta.downloads}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#b8d7dc]">{text.beta.pricing}</p>
              </div>
              <button onClick={onStartBuilding} className="h-11 w-fit rounded-lg bg-[#e8e8e8] px-5 text-sm font-semibold text-[#151515] hover:bg-white">
                {text.nav.start}
              </button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
