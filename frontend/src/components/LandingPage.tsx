import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { markCadioAuthenticated } from "../utils/auth";

type Language = "sv" | "en";
type AuthMode = "login" | "signup" | null;

const copy = {
  sv: {
    nav: {
      product: "Produkt",
      workflow: "Arbetsflode",
      pricing: "Priser",
      login: "Logga in",
      signup: "Skapa konto",
      start: "Start building",
    },
    hero: {
      eyebrow: "AI CAD for verkliga 3D-utskrifter",
      title: "Beskriv modellen. Justera som i CAD. Skriv ut med ratt profil.",
      body:
        "Cadio kombinerar AI-sokning, parametriska modeller och en ren CAD-arbetsyta for makers, verkstader och produktideer.",
      prompt: "Dewalt battery holder with wall mount",
      primary: "Start building",
      secondary: "Se priser",
    },
    stats: [
      ["Source aware", "Hamtar inspiration fran Printables och populara 3D-kallor"],
      ["Easy + Expert", "Snabba AI-andringar eller manuell CAD-kontroll"],
      ["Print ready", "Printer, material, scale och exportformat i samma flode"],
    ],
    product: {
      title: "En CAD-byggare for alla nivaer",
      body:
        "Easy mode hjalper dig beskriva vad du vill skapa. Expert mode ger dig kontroll over skisser, delar, transform, kanter och CAD-operationer.",
    },
    cards: [
      ["AI model search", "Skriv vad du vill bygga och Cadio skapar en modell med signaler fran populara utskriftsmodeller."],
      ["Manual CAD", "Rita, markera delar, flytta, rotera och forfina modellen nar du vill ta over sjalv."],
      ["Printer profiles", "Valj skrivare, material och exportformat sa modellen ar anpassad innan slicern."],
    ],
    workflow: {
      title: "Fran ide till STL utan att byta verktyg",
      steps: [
        ["1", "Skriv en prompt", "Exempel: cup holder with desk mount, phone stand eller en reservdelshallare."],
        ["2", "Valj variant", "Byt mellan populara modellforslag med Next och Previous tills formen sitter."],
        ["3", "Finjustera", "Andra dimensioner, material, farg, placering och CAD-detaljer."],
        ["4", "Exportera", "Ladda ner STL, 3MF, OBJ eller AMF med rekommenderade printinstallningar."],
      ],
    },
    pricingTitle: "Priser",
    pricingBody: "Alla paket har samma CAD-upplevelse. Skillnaden ar antal nedladdningsbara genereringar per manad.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        note: "1 nedladdningsbar generering",
        features: [
          "1 generering som kan laddas ner",
          "Login kravs innan nedladdning",
          "Samma Easy och Expert CAD",
          "Samma modellkvalitet som betalda paket",
        ],
      },
      {
        name: "Maker",
        price: "$10/mo",
        note: "10 genereringar per manad",
        features: [
          "10 nedladdningsbara genereringar/manad",
          "Samma CAD-verktyg som alla paket",
          "Alla skrivare, material och exportformat",
          "Login kravs for nedladdning",
        ],
        featured: true,
      },
      {
        name: "Pro",
        price: "$49/mo",
        note: "Obegransade genereringar",
        features: [
          "Obegransade nedladdningsbara genereringar",
          "Samma CAD-upplevelse som alla paket",
          "Alla skrivare, material och exportformat",
          "Login kravs for nedladdning",
        ],
      },
    ],
    auth: {
      loginTitle: "Logga in",
      signupTitle: "Skapa konto",
      email: "E-post",
      password: "Losenord",
      name: "Namn",
      continue: "Fortsatt till workspace",
      hint: "Autentisering ar forberedd i frontend och kan kopplas till riktig auth senare.",
    },
    cta: {
      title: "Redo att bygga?",
      body: "Oppna Cadio-workspacet och skapa forsta modellen direkt.",
      button: "Start building",
    },
  },
  en: {
    nav: {
      product: "Product",
      workflow: "Workflow",
      pricing: "Pricing",
      login: "Log in",
      signup: "Sign up",
      start: "Start building",
    },
    hero: {
      eyebrow: "AI CAD for real 3D printing",
      title: "Describe the model. Edit like CAD. Print with the right profile.",
      body:
        "Cadio combines AI search, parametric models, and a clean CAD workspace for makers, workshops, and product ideas.",
      prompt: "Dewalt battery holder with wall mount",
      primary: "Start building",
      secondary: "See pricing",
    },
    stats: [
      ["Source aware", "Uses signals from Printables and popular 3D model sources"],
      ["Easy + Expert", "Fast AI edits or manual CAD control"],
      ["Print ready", "Printer, material, scale, and export formats in one flow"],
    ],
    product: {
      title: "A CAD builder for every level",
      body:
        "Easy mode helps you describe what you want. Expert mode gives you control over sketches, parts, transforms, edges, and CAD operations.",
    },
    cards: [
      ["AI model search", "Type what you want to build and Cadio creates a model from popular printable design signals."],
      ["Manual CAD", "Draw, select parts, move, rotate, and refine the model when you want direct control."],
      ["Printer profiles", "Choose printer, material, and export format before the model reaches your slicer."],
    ],
    workflow: {
      title: "From idea to STL without switching tools",
      steps: [
        ["1", "Write a prompt", "Example: cup holder with desk mount, phone stand, or a replacement bracket."],
        ["2", "Pick a variant", "Move through popular model options with Next and Previous until the shape is right."],
        ["3", "Fine tune", "Adjust dimensions, material, color, placement, and CAD details."],
        ["4", "Export", "Download STL, 3MF, OBJ, or AMF with recommended print settings."],
      ],
    },
    pricingTitle: "Pricing",
    pricingBody: "Every plan has the same CAD experience. The only difference is monthly downloadable generations.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        note: "1 downloadable generation",
        features: [
          "1 generation that can be downloaded",
          "Login required before download",
          "Same Easy and Expert CAD",
          "Same model quality as paid plans",
        ],
      },
      {
        name: "Maker",
        price: "$10/mo",
        note: "10 generations per month",
        features: [
          "10 downloadable generations/month",
          "Same CAD tools as every plan",
          "All printers, materials, and export formats",
          "Login required for downloads",
        ],
        featured: true,
      },
      {
        name: "Pro",
        price: "$49/mo",
        note: "Unlimited generations",
        features: [
          "Unlimited downloadable generations",
          "Same CAD experience as every plan",
          "All printers, materials, and export formats",
          "Login required for downloads",
        ],
      },
    ],
    auth: {
      loginTitle: "Log in",
      signupTitle: "Sign up",
      email: "Email",
      password: "Password",
      name: "Name",
      continue: "Continue to workspace",
      hint: "Authentication is prepared in the frontend and can be connected to real auth later.",
    },
    cta: {
      title: "Ready to build?",
      body: "Open the Cadio workspace and create the first model directly.",
      button: "Start building",
    },
  },
};

function HeroModel() {
  const groupRef = useRef<THREE.Group>(null);
  const railMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f6d627",
        roughness: 0.5,
        metalness: 0.05,
      }),
    [],
  );
  const darkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#101112",
        roughness: 0.72,
        metalness: 0.08,
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -0.38 + Math.sin(clock.elapsedTime * 0.28) * 0.08;
    groupRef.current.rotation.x = 0.62 + Math.sin(clock.elapsedTime * 0.2) * 0.04;
  });

  return (
    <group ref={groupRef} position={[0, -0.2, 0]}>
      <mesh material={railMaterial} position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.6, 0.28, 2.2]} />
      </mesh>
      <mesh material={railMaterial} position={[0, 0.22, -0.82]} castShadow receiveShadow>
        <boxGeometry args={[5.9, 0.22, 0.32]} />
      </mesh>
      <mesh material={railMaterial} position={[0, 0.22, 0.82]} castShadow receiveShadow>
        <boxGeometry args={[5.9, 0.22, 0.32]} />
      </mesh>
      {[-1.9, 0, 1.9].map((x) => (
        <group key={x} position={[x, 0.42, 0]}>
          <mesh material={railMaterial} position={[0, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.25, 0.42, 1.35]} />
          </mesh>
          <mesh material={railMaterial} position={[0, 0.45, -0.46]} castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.46, 0.22]} />
          </mesh>
          <mesh material={railMaterial} position={[0, 0.45, 0.46]} castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.46, 0.22]} />
          </mesh>
          <mesh material={darkMaterial} position={[-0.34, 0.66, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.035, 36]} />
          </mesh>
          <mesh material={darkMaterial} position={[0.34, 0.66, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.035, 36]} />
          </mesh>
        </group>
      ))}
      <gridHelper args={[8, 18, "#45484b", "#323436"]} position={[0, -0.23, 0]} />
    </group>
  );
}

function HeroScene() {
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [4.8, 5.2, 6.4], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#343435"]} />
        <fog attach="fog" args={["#343435", 7, 15]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 8, 4]} intensity={2.2} castShadow />
        <pointLight position={[-4, 3, -4]} intensity={0.8} color="#2bb8dc" />
        <HeroModel />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(12,12,13,0.92)_0%,rgba(18,18,19,0.78)_38%,rgba(18,18,19,0.18)_72%,rgba(18,18,19,0.46)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(0deg,#151515_0%,rgba(21,21,21,0)_100%)]" />
    </div>
  );
}

function AuthDialog({
  mode,
  text,
  onClose,
  onStartBuilding,
}: {
  mode: AuthMode;
  text: typeof copy.sv;
  onClose: () => void;
  onStartBuilding: () => void;
}) {
  if (!mode) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#343436] bg-[#1f1f20] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">
            {mode === "login" ? text.auth.loginTitle : text.auth.signupTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg bg-[#2b2b2d] text-sm text-[#bdbdbd] hover:text-white"
            aria-label="Close"
          >
            x
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            markCadioAuthenticated();
            onStartBuilding();
          }}
        >
          {mode === "signup" && (
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#8f8f92]">
              {text.auth.name}
              <input className="mt-2 h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#2bb8dc]" />
            </label>
          )}
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#8f8f92]">
            {text.auth.email}
            <input
              type="email"
              className="mt-2 h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#2bb8dc]"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#8f8f92]">
            {text.auth.password}
            <input
              type="password"
              className="mt-2 h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#2bb8dc]"
            />
          </label>
          <button className="h-11 w-full rounded-lg bg-[#e8e8e8] text-sm font-semibold text-[#151515] hover:bg-white">
            {text.auth.continue}
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-[#8f8f92]">{text.auth.hint}</p>
      </div>
    </div>
  );
}

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("sv");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const text = copy[language];

  const openPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="h-full overflow-y-auto bg-[#151515] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#151515]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={onStartBuilding} className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#28c7df] text-base font-black text-[#101010]">C</span>
            <span className="text-sm font-black uppercase tracking-[0.24em]">Cadio</span>
          </button>
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
              <option value="sv">SV</option>
              <option value="en">EN</option>
            </select>
            <button
              onClick={() => setAuthMode("login")}
              className="hidden h-9 rounded-lg px-3 text-sm font-semibold text-[#d5d5d6] hover:bg-white/10 hover:text-white sm:block"
            >
              {text.nav.login}
            </button>
            <button
              onClick={() => setAuthMode("signup")}
              className="hidden h-9 rounded-lg border border-white/15 px-3 text-sm font-semibold text-white hover:border-[#2bb8dc] sm:block"
            >
              {text.nav.signup}
            </button>
            <button
              onClick={onStartBuilding}
              className="h-9 rounded-lg bg-[#e8e8e8] px-4 text-sm font-semibold text-[#151515] hover:bg-white"
            >
              {text.nav.start}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative min-h-[760px] overflow-hidden pt-16">
          <HeroScene />
          <div className="relative z-10 mx-auto flex min-h-[700px] max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#2bb8dc]">{text.hero.eyebrow}</p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
                {text.hero.title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#c9c9cc] sm:text-lg">{text.hero.body}</p>
              <div className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-white/15 bg-[#202020]/86 p-2 shadow-2xl backdrop-blur">
                <div className="min-w-0 flex-1 px-3 text-sm text-[#c8c8cb]">{text.hero.prompt}</div>
                <button
                  onClick={onStartBuilding}
                  className="shrink-0 rounded-xl bg-[#2bb8dc] px-4 py-3 text-sm font-bold text-[#101010] hover:bg-[#69d9f5]"
                >
                  {text.hero.primary}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={openPricing} className="rounded-lg px-4 py-3 text-sm font-semibold text-[#d8d8d9] hover:bg-white/10">
                  {text.hero.secondary}
                </button>
              </div>
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
          <div className="grid gap-4 lg:grid-cols-3">
            {text.tiers.map((tier) => (
              <article
                key={tier.name}
                className={`rounded-2xl border p-6 ${
                  tier.featured ? "border-[#2bb8dc] bg-[#193039]" : "border-white/10 bg-[#202020]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                    <p className="mt-1 text-xs text-[#a8a8ab]">{tier.note}</p>
                  </div>
                  {tier.featured && <span className="rounded-full bg-[#2bb8dc] px-3 py-1 text-[11px] font-bold text-[#101010]">Popular</span>}
                </div>
                <div className="mt-6 text-3xl font-semibold text-white">{tier.price}</div>
                <ul className="mt-6 space-y-3 text-sm text-[#d7d7d8]">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="text-[#2bb8dc]">+</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={tier.featured ? () => setAuthMode("signup") : onStartBuilding}
                  className={`mt-7 h-11 w-full rounded-lg text-sm font-semibold ${
                    tier.featured ? "bg-[#2bb8dc] text-[#101010] hover:bg-[#69d9f5]" : "bg-[#2b2b2d] text-white hover:bg-[#353537]"
                  }`}
                >
                  {tier.featured ? text.nav.signup : text.nav.start}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-white/10 bg-[#e8e8e8] p-8 text-[#151515] sm:p-10">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="text-3xl font-semibold">{text.cta.title}</h2>
                <p className="mt-2 text-sm text-[#555]">{text.cta.body}</p>
              </div>
              <button onClick={onStartBuilding} className="w-fit rounded-lg bg-[#151515] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2b2b2d]">
                {text.cta.button}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-4 py-8 text-center text-xs text-[#8f8f92]">
        Cadio AI CAD Workspace
      </footer>

      <AuthDialog
        mode={authMode}
        text={text}
        onClose={() => setAuthMode(null)}
        onStartBuilding={onStartBuilding}
      />
    </div>
  );
}
