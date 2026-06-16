import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loginCadioAccount } from "../utils/auth";
import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";

type Language = "en" | "sv" | "es" | "fr" | "it" | "de" | "pt";
type AuthMode = "login" | "signup" | null;

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: "en", label: "EN" },
  { value: "sv", label: "SV" },
  { value: "es", label: "ES" },
  { value: "fr", label: "FR" },
  { value: "it", label: "IT" },
  { value: "de", label: "DE" },
  { value: "pt", label: "PT" },
];

const heroPrompt = "Precision Phone Stand with 15° Tilt";

const copy = {
  en: {
    nav: {
      product: "Product",
      workflow: "Workflow",
      pricing: "Pricing",
      login: "Sign In",
      signup: "Join Beta",
      start: "Start Building",
    },
    hero: {
      eyebrow: "Early Access Beta",
      title: "Find. Remix. Print.",
      body:
        "Search real printable models, customize them with AI, and export exactly what you need.",
      prompt: heroPrompt,
      primary: "Start Building",
      secondary: "See Examples",
    },
    stats: [
      ["Engineering Grade", "Built for precision and printable geometry"],
      ["Professional Tools", "AI speed combined with expert CAD control"],
      ["Production Ready", "Direct export to STL, 3MF, and STEP"],
    ],
    product: {
      title: "Serious CAD for AI native designers",
      body:
        "Describe what you want to build. Our AI engine generates valid parametric geometry that you can refine with manual sketches, transforms, and edge operations.",
    },
    cards: [
      ["AI Search", "Find printable starting points using natural language."],
      ["Direct Edit", "Select edges, extrude faces, and apply fillets manually."],
      ["Smart Export", "Optimized files for FDM, SLA, and industrial printing."],
    ],
    workflow: {
      title: "A faster path from idea to object",
      steps: [
        ["1", "Search", "Find an existing design or describe a new one from scratch."],
        ["2", "Remix", "Adjust dimensions and features with real-time AI assistance."],
        ["3", "Edit", "Refine the geometry using professional-grade CAD tools."],
        ["4", "Export", "Download production-ready files for your 3D printer."],
      ],
    },
    pricingTitle: "Simple pricing, eventually",
    pricingBody: "Cadio is currently free during our early access phase. We're building the future of CAD together.",
    auth: {
      loginTitle: "Welcome back",
      signupTitle: "Start building today",
      email: "Email address",
      password: "Password",
      name: "Full name",
      continue: "Enter Workspace",
      hint: "By continuing, you agree to our terms and privacy policy.",
    },
    cta: {
      title: "Ready to build?",
      body: "Join the thousands of engineers and makers building with Cadio.",
      button: "Start Building",
    },
  },
  sv: {
    nav: {
      product: "Produkt",
      workflow: "Arbetsflöde",
      pricing: "Priser",
      login: "Logga in",
      signup: "Gå med i Beta",
      start: "Börja Bygga",
    },
    hero: {
      eyebrow: "Early Access Beta",
      title: "Sök. Remix. Print.",
      body:
        "Sök efter riktiga utskrivbara modeller, anpassa dem med AI och exportera exakt det du behöver.",
      prompt: heroPrompt,
      primary: "Börja Bygga",
      secondary: "Se Exempel",
    },
    stats: [
      ["Engineering Grade", "Byggd för precision och utskrivbar geometri"],
      ["Professionella Verktyg", "AI-hastighet kombinerat med expert CAD-kontroll"],
      ["Produktionsklar", "Direkt export till STL, 3MF och STEP"],
    ],
    product: {
      title: "Seriös CAD för AI-infödda designers",
      body:
        "Beskriv vad du vill bygga. Vår AI-motor genererar giltig parametrisk geometri som du kan förfina med manuella skisser, transformeringar och kantoperationer.",
    },
    cards: [
      ["AI-Sök", "Hitta utskrivbara startpunkter med naturligt språk."],
      ["Direktredigering", "Markera kanter, extrudera ytor och applicera avrundningar manuellt."],
      ["Smart Export", "Optimerade filer för FDM, SLA och industriell utskrift."],
    ],
    workflow: {
      title: "En snabbare väg från idé till objekt",
      steps: [
        ["1", "Sök", "Hitta en befintlig design eller beskriv en ny från grunden."],
        ["2", "Remix", "Justera dimensioner och funktioner med AI-stöd i realtid."],
        ["3", "Redigera", "Förfina geometrin med CAD-verktyg av professionell klass."],
        ["4", "Exportera", "Ladda ner produktionsklara filer för din 3D-skrivare."],
      ],
    },
    pricingTitle: "Enkel prissättning, så småningom",
    pricingBody: "Cadio är för närvarande gratis under vår tidiga access-fas. Vi bygger framtidens CAD tillsammans.",
    auth: {
      loginTitle: "Välkommen tillbaka",
      signupTitle: "Börja bygga idag",
      email: "E-postadress",
      password: "Lösenord",
      name: "Fullständigt namn",
      continue: "Gå till Workspace",
      hint: "Genom att fortsätta godkänner du våra villkor och integritetspolicy.",
    },
    cta: {
      title: "Redo att bygga?",
      body: "Gå med i tusentals ingenjörer och makers som bygger med Cadio.",
      button: "Börja Bygga",
    },
  },
  es: {
    nav: {
      product: "Producto",
      workflow: "Flujo",
      pricing: "Beta",
      login: "Iniciar sesion",
      signup: "Crear cuenta",
      start: "Start building",
    },
    hero: {
      eyebrow: "CAD con IA para impresion 3D real",
      title: "Describe el modelo. Edita como en CAD. Imprime con el perfil correcto.",
      body:
        "Cadio combina busqueda con IA, modelos parametricos y un espacio CAD limpio para makers, talleres e ideas de producto.",
      prompt: heroPrompt,
      primary: "Start building",
      secondary: "Ver precios",
    },
    stats: [
      ["Source aware", "Usa senales de Printables y fuentes populares de modelos 3D"],
      ["Easy + Expert", "Ediciones rapidas con IA o control CAD manual"],
      ["Print ready", "Impresora, material, escala y formatos de exportacion en un flujo"],
    ],
    product: {
      title: "Un constructor CAD para todos los niveles",
      body:
        "Easy mode te ayuda a describir lo que quieres. Expert mode te da control sobre bocetos, piezas, transformaciones, bordes y operaciones CAD.",
    },
    cards: [
      ["AI model search", "Escribe lo que quieres construir y Cadio crea un modelo a partir de senales de disenos imprimibles populares."],
      ["Manual CAD", "Dibuja, selecciona piezas, mueve, rota y refina el modelo cuando quieras control directo."],
      ["Printer profiles", "Elige impresora, material y formato de exportacion antes de llevar el modelo al slicer."],
    ],
    workflow: {
      title: "De idea a STL sin cambiar de herramienta",
      steps: [
        ["1", "Escribe un prompt", "Ejemplo: cup holder with desk mount, phone stand o un soporte de repuesto."],
        ["2", "Elige una variante", "Cambia entre opciones populares con Next y Previous hasta que la forma sea correcta."],
        ["3", "Ajusta detalles", "Cambia dimensiones, material, color, posicion y detalles CAD."],
        ["4", "Exporta", "Descarga STL, 3MF, OBJ o AMF con ajustes de impresion recomendados."],
      ],
    },
    pricingTitle: "Pricing coming soon",
    pricingBody: "For now, Cadio is free during Early Access Beta. Build, edit, and download while we improve the platform.",
    auth: {
      loginTitle: "Iniciar sesion",
      signupTitle: "Crear cuenta",
      email: "Email",
      password: "Contrasena",
      name: "Nombre",
      continue: "Continuar al workspace",
      hint: "Los modelos guardados son privados para el email que uses aqui.",
    },
    cta: {
      title: "Listo para construir?",
      body: "Abre el workspace de Cadio y crea el primer modelo directamente.",
      button: "Start building",
    },
  },
  fr: {
    nav: {
      product: "Produit",
      workflow: "Flux",
      pricing: "Beta",
      login: "Connexion",
      signup: "Creer un compte",
      start: "Start building",
    },
    hero: {
      eyebrow: "CAO IA pour impression 3D reelle",
      title: "Decrivez le modele. Modifiez comme en CAO. Imprimez avec le bon profil.",
      body:
        "Cadio combine recherche IA, modeles parametriques et espace CAO clair pour makers, ateliers et idees produit.",
      prompt: heroPrompt,
      primary: "Start building",
      secondary: "Voir les tarifs",
    },
    stats: [
      ["Source aware", "Utilise les signaux de Printables et de sources populaires de modeles 3D"],
      ["Easy + Expert", "Editions rapides par IA ou controle CAO manuel"],
      ["Print ready", "Imprimante, materiau, echelle et formats d'export dans un seul flux"],
    ],
    product: {
      title: "Un constructeur CAO pour chaque niveau",
      body:
        "Easy mode vous aide a decrire ce que vous voulez. Expert mode donne le controle des esquisses, pieces, transformations, aretes et operations CAO.",
    },
    cards: [
      ["AI model search", "Tapez ce que vous voulez construire et Cadio cree un modele a partir de signaux de designs imprimables populaires."],
      ["Manual CAD", "Dessinez, selectionnez des pieces, deplacez, pivotez et affinez le modele avec un controle direct."],
      ["Printer profiles", "Choisissez imprimante, materiau et format d'export avant le slicer."],
    ],
    workflow: {
      title: "De l'idee au STL sans changer d'outil",
      steps: [
        ["1", "Ecrivez un prompt", "Exemple: cup holder with desk mount, phone stand ou support de remplacement."],
        ["2", "Choisissez une variante", "Passez entre options populaires avec Next et Previous jusqu'a la bonne forme."],
        ["3", "Ajustez", "Modifiez dimensions, materiau, couleur, placement et details CAO."],
        ["4", "Exportez", "Telechargez STL, 3MF, OBJ ou AMF avec les reglages d'impression recommandes."],
      ],
    },
    pricingTitle: "Pricing coming soon",
    pricingBody: "For now, Cadio is free during Early Access Beta. Build, edit, and download while we improve the platform.",
    auth: {
      loginTitle: "Connexion",
      signupTitle: "Creer un compte",
      email: "Email",
      password: "Mot de passe",
      name: "Nom",
      continue: "Continuer vers le workspace",
      hint: "Les modeles enregistres restent prives pour l'email utilise ici.",
    },
    cta: {
      title: "Pret a construire?",
      body: "Ouvrez le workspace Cadio et creez le premier modele directement.",
      button: "Start building",
    },
  },
  it: {
    nav: {
      product: "Prodotto",
      workflow: "Flusso",
      pricing: "Beta",
      login: "Accedi",
      signup: "Registrati",
      start: "Start building",
    },
    hero: {
      eyebrow: "CAD AI per vera stampa 3D",
      title: "Descrivi il modello. Modifica come in CAD. Stampa con il profilo giusto.",
      body:
        "Cadio combina ricerca AI, modelli parametrici e un workspace CAD pulito per maker, officine e idee prodotto.",
      prompt: heroPrompt,
      primary: "Start building",
      secondary: "Vedi prezzi",
    },
    stats: [
      ["Source aware", "Usa segnali da Printables e fonti popolari di modelli 3D"],
      ["Easy + Expert", "Modifiche rapide con AI o controllo CAD manuale"],
      ["Print ready", "Stampante, materiale, scala e formati export in un unico flusso"],
    ],
    product: {
      title: "Un builder CAD per ogni livello",
      body:
        "Easy mode ti aiuta a descrivere cosa vuoi. Expert mode ti da controllo su schizzi, parti, trasformazioni, bordi e operazioni CAD.",
    },
    cards: [
      ["AI model search", "Scrivi cosa vuoi costruire e Cadio crea un modello da segnali di design stampabili popolari."],
      ["Manual CAD", "Disegna, seleziona parti, sposta, ruota e rifinisci il modello quando vuoi controllo diretto."],
      ["Printer profiles", "Scegli stampante, materiale e formato export prima del slicer."],
    ],
    workflow: {
      title: "Dall'idea allo STL senza cambiare strumento",
      steps: [
        ["1", "Scrivi un prompt", "Esempio: cup holder with desk mount, phone stand o supporto di ricambio."],
        ["2", "Scegli una variante", "Passa tra opzioni popolari con Next e Previous finche la forma e corretta."],
        ["3", "Rifinisci", "Modifica dimensioni, materiale, colore, posizione e dettagli CAD."],
        ["4", "Esporta", "Scarica STL, 3MF, OBJ o AMF con impostazioni di stampa consigliate."],
      ],
    },
    pricingTitle: "Pricing coming soon",
    pricingBody: "For now, Cadio is free during Early Access Beta. Build, edit, and download while we improve the platform.",
    auth: {
      loginTitle: "Accedi",
      signupTitle: "Registrati",
      email: "Email",
      password: "Password",
      name: "Nome",
      continue: "Continua al workspace",
      hint: "I modelli salvati sono privati per l'email usata qui.",
    },
    cta: {
      title: "Pronto a costruire?",
      body: "Apri il workspace Cadio e crea subito il primo modello.",
      button: "Start building",
    },
  },
  de: {
    nav: {
      product: "Produkt",
      workflow: "Ablauf",
      pricing: "Beta",
      login: "Einloggen",
      signup: "Registrieren",
      start: "Start building",
    },
    hero: {
      eyebrow: "AI CAD fur echten 3D-Druck",
      title: "Beschreibe das Modell. Bearbeite wie im CAD. Drucke mit dem richtigen Profil.",
      body:
        "Cadio kombiniert KI-Suche, parametrische Modelle und einen klaren CAD-Workspace fur Maker, Werkstatten und Produktideen.",
      prompt: heroPrompt,
      primary: "Start building",
      secondary: "Beta access",
    },
    stats: [
      ["Source aware", "Nutzt Signale von Printables und beliebten 3D-Modellquellen"],
      ["Easy + Expert", "Schnelle KI-Edits oder manuelle CAD-Kontrolle"],
      ["Print ready", "Drucker, Material, Skalierung und Exportformate in einem Ablauf"],
    ],
    product: {
      title: "Ein CAD-Builder fur jedes Level",
      body:
        "Easy mode hilft dir, dein Ziel zu beschreiben. Expert mode gibt Kontrolle uber Skizzen, Teile, Transformationen, Kanten und CAD-Operationen.",
    },
    cards: [
      ["AI model search", "Tippe, was du bauen willst, und Cadio erstellt ein Modell aus beliebten druckbaren Designsignalen."],
      ["Manual CAD", "Zeichne, wahle Teile, verschiebe, rotiere und verfeinere das Modell mit direkter Kontrolle."],
      ["Printer profiles", "Wahle Drucker, Material und Exportformat, bevor das Modell in den Slicer geht."],
    ],
    workflow: {
      title: "Von der Idee zur STL ohne Toolwechsel",
      steps: [
        ["1", "Prompt schreiben", "Beispiel: cup holder with desk mount, phone stand oder Ersatzhalter."],
        ["2", "Variante wahlen", "Wechsle mit Next und Previous durch beliebte Optionen, bis die Form passt."],
        ["3", "Feinjustieren", "Passe Abmessungen, Material, Farbe, Position und CAD-Details an."],
        ["4", "Exportieren", "Lade STL, 3MF, OBJ oder AMF mit empfohlenen Druckeinstellungen herunter."],
      ],
    },
    pricingTitle: "Pricing coming soon",
    pricingBody: "For now, Cadio is free during Early Access Beta. Build, edit, and download while we improve the platform.",
    auth: {
      loginTitle: "Einloggen",
      signupTitle: "Registrieren",
      email: "Email",
      password: "Passwort",
      name: "Name",
      continue: "Weiter zum Workspace",
      hint: "Gespeicherte Modelle sind privat fur die hier genutzte E-Mail.",
    },
    cta: {
      title: "Bereit zu bauen?",
      body: "Offne den Cadio-Workspace und erstelle direkt dein erstes Modell.",
      button: "Start building",
    },
  },
  pt: {
    nav: {
      product: "Produto",
      workflow: "Fluxo",
      pricing: "Beta",
      login: "Entrar",
      signup: "Criar conta",
      start: "Start building",
    },
    hero: {
      eyebrow: "CAD com IA para impressao 3D real",
      title: "Descreva o modelo. Edite como CAD. Imprima com o perfil certo.",
      body:
        "Cadio combina busca com IA, modelos parametricos e um workspace CAD limpo para makers, oficinas e ideias de produto.",
      prompt: heroPrompt,
      primary: "Start building",
      secondary: "Ver precos",
    },
    stats: [
      ["Source aware", "Usa sinais do Printables e de fontes populares de modelos 3D"],
      ["Easy + Expert", "Edicoes rapidas com IA ou controle CAD manual"],
      ["Print ready", "Impressora, material, escala e formatos de exportacao em um fluxo"],
    ],
    product: {
      title: "Um builder CAD para todos os niveis",
      body:
        "Easy mode ajuda voce a descrever o que quer. Expert mode da controle sobre sketches, pecas, transformacoes, bordas e operacoes CAD.",
    },
    cards: [
      ["AI model search", "Digite o que quer construir e Cadio cria um modelo com sinais de designs imprimiveis populares."],
      ["Manual CAD", "Desenhe, selecione pecas, mova, rotacione e refine o modelo quando quiser controle direto."],
      ["Printer profiles", "Escolha impressora, material e formato de exportacao antes do slicer."],
    ],
    workflow: {
      title: "Da ideia ao STL sem trocar de ferramenta",
      steps: [
        ["1", "Escreva um prompt", "Exemplo: cup holder with desk mount, phone stand ou suporte de reposicao."],
        ["2", "Escolha uma variante", "Alterne entre opcoes populares com Next e Previous ate acertar a forma."],
        ["3", "Ajuste fino", "Mude dimensoes, material, cor, posicao e detalhes CAD."],
        ["4", "Exporte", "Baixe STL, 3MF, OBJ ou AMF com configuracoes de impressao recomendadas."],
      ],
    },
    pricingTitle: "Pricing coming soon",
    pricingBody: "For now, Cadio is free during Early Access Beta. Build, edit, and download while we improve the platform.",
    auth: {
      loginTitle: "Entrar",
      signupTitle: "Criar conta",
      email: "Email",
      password: "Senha",
      name: "Nome",
      continue: "Continuar para o workspace",
      hint: "Modelos salvos ficam privados para o email usado aqui.",
    },
    cta: {
      title: "Pronto para construir?",
      body: "Abra o workspace Cadio e crie o primeiro modelo diretamente.",
      button: "Start building",
    },
  },
};

const practicalDetails: Partial<Record<Language, {
  title: string;
  body: string;
  items: Array<[string, string]>;
}>> = {
  en: {
    title: "Made for the messy middle between idea and slicer",
    body:
      "Most print projects need more than a generated shape. Cadio keeps model variants, measurements, print settings, and manual edits close together so you can make a part feel usable before exporting it.",
    items: [
      ["Variant control", "Move between model options when the first result is not the right one."],
      ["Real dimensions", "Check bounds and scale before the file reaches your printer profile."],
      ["Editable workflow", "Start with AI, then adjust details by hand when precision matters."],
    ],
  },
  sv: {
    title: "Byggd för mellanläget mellan idé och slicer",
    body:
      "De flesta printprojekt behöver mer än en genererad form. Cadio håller modellvarianter, mått, printinställningar och manuella ändringar nära varandra så modellen känns användbar innan export.",
    items: [
      ["Variantkontroll", "Byt modellförslag när första resultatet inte passar."],
      ["Verkliga mått", "Kontrollera mått och skala innan filen hamnar i skrivarprofilen."],
      ["Redigerbart flöde", "Börja med AI och finjustera sedan för hand när precision spelar roll."],
    ],
  },
};

function HeroModel() {
  const groupRef = useRef<THREE.Group>(null);
  
  // V2 Material: Opaque, solid engineering grey
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#94a3b8",
        roughness: 0.35,
        metalness: 0.1,
      }),
    [],
  );
  
  const accentMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3b82f6",
        emissive: "#3b82f6",
        emissiveIntensity: 0.2,
        roughness: 0.2,
        metalness: 0.5,
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -0.3 + Math.sin(clock.elapsedTime * 0.15) * 0.05;
    groupRef.current.rotation.x = 0.2 + Math.sin(clock.elapsedTime * 0.1) * 0.02;
  });

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      <group position={[0, 0.8, 0]}>
        {/* Main Body */}
        <mesh material={bodyMaterial} position={[0, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[4, 0.5, 3]} />
        </mesh>
        
        {/* Support Structure */}
        <mesh material={bodyMaterial} position={[0, 1, -1.2]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 2, 0.4]} />
        </mesh>
        
        {/* Engineering Accents */}
        <mesh material={accentMaterial} position={[1.5, 0.3, 1]} castShadow receiveShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.1, 32]} />
        </mesh>
        <mesh material={accentMaterial} position={[-1.5, 0.3, 1]} castShadow receiveShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.1, 32]} />
        </mesh>
      </group>
      <gridHelper args={[10, 20, "#1f2937", "#111827"]} position={[0, -0.01, 0]} />
    </group>
  );
}
function HeroScene() {
  return (
    <div className="absolute inset-0 bg-[#0b0f14]">
      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{ position: [6, 6, 8], fov: 35 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#0b0f14"]} />
        <fog attach="fog" args={["#0b0f14", 8, 20]} />
        
        {/* Premium Lighting */}
        <ambientLight intensity={0.4} />
        <spotLight
          position={[10, 15, 10]}
          angle={0.15}
          penumbra={1}
          intensity={2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-10, 5, -10]} intensity={0.5} color="#3b82f6" />
        
        <HeroModel />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0b0f14] via-[#0b0f14]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#0b0f14] to-transparent" />
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
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

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
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setAuthError("");
            setAuthBusy(true);
            try {
              await loginCadioAccount({
                name: String(form.get("name") || ""),
                email: String(form.get("email") || ""),
                password: String(form.get("password") || ""),
              });
              onStartBuilding();
            } catch (err) {
              setAuthError(err instanceof Error ? err.message : "Could not log in.");
            } finally {
              setAuthBusy(false);
            }
          }}
        >
          {mode === "signup" && (
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#8f8f92]">
              {text.auth.name}
              <input name="name" className="mt-2 h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#2bb8dc]" />
            </label>
          )}
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#8f8f92]">
            {text.auth.email}
            <input
              name="email"
              type="email"
              required
              className="mt-2 h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#2bb8dc]"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#8f8f92]">
            {text.auth.password}
            <input
              name="password"
              type="password"
              minLength={4}
              required
              className="mt-2 h-11 w-full rounded-lg border border-[#343436] bg-[#111] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#2bb8dc]"
            />
          </label>
          {authError && (
            <p className="rounded-lg border border-[#6b2d2d] bg-[#2a1717] px-3 py-2 text-xs text-[#ffb3b3]">
              {authError}
            </p>
          )}
          <button
            disabled={authBusy}
            className="h-11 w-full rounded-lg bg-[#e8e8e8] text-sm font-semibold text-[#151515] hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >
            {authBusy ? (text === copy.sv ? "Loggar in..." : "Signing in...") : text.auth.continue}
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-[#8f8f92]">{text.auth.hint}</p>
      </div>
    </div>
  );
}

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [betaOpen, setBetaOpen] = useState(false);
  const text = copy[language];
  const details = practicalDetails[language] ?? practicalDetails.en!;

  const openPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="h-full overflow-y-auto bg-cadio-bg text-cadio-text font-sans">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-cadio-border/50 bg-cadio-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <CadioLogo
            subtitle=""
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          />
          <nav className="hidden items-center gap-8 text-sm font-medium text-cadio-muted md:flex">
            <a href="#product" className="hover:text-cadio-text transition-colors">{text.nav.product}</a>
            <a href="#workflow" className="hover:text-cadio-text transition-colors">{text.nav.workflow}</a>
            <a href="#pricing" className="hover:text-cadio-text transition-colors">{text.nav.pricing}</a>
          </nav>
          <div className="flex items-center gap-4">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              className="h-9 rounded-md border border-cadio-border bg-cadio-surface px-2 text-xs text-cadio-text outline-none focus:ring-1 focus:ring-cadio-accent"
              aria-label="Language"
            >
              {languageOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={onStartBuilding}
              className="h-9 rounded-md bg-cadio-accent px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-cadio-accent-hover hover:scale-[1.02] active:scale-[0.98]"
            >
              {text.nav.start}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative min-h-[85vh] overflow-hidden pt-16 flex flex-col justify-center">
          <HeroScene />
          <div className="relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-8 py-24">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cadio-accent/30 bg-cadio-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cadio-accent mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cadio-accent opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cadio-accent"></span>
                </span>
                {text.hero.eyebrow}
              </div>
              <h1 className="text-6xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-8xl mb-8 leading-[0.9]">
                {text.hero.title}
              </h1>
              <p className="max-w-xl text-lg sm:text-xl leading-relaxed text-cadio-muted mb-10">
                {text.hero.body}
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button
                  onClick={onStartBuilding}
                  className="w-full sm:w-auto h-12 rounded-lg bg-white px-8 text-base font-bold text-cadio-bg shadow-lg transition-all hover:bg-cadio-text hover:scale-[1.02] active:scale-[0.98]"
                >
                  {text.hero.primary}
                </button>
                <button 
                  onClick={openPricing}
                  className="w-full sm:w-auto h-12 rounded-lg border border-cadio-border bg-cadio-surface/50 px-8 text-base font-semibold text-cadio-text backdrop-blur-sm transition-all hover:bg-cadio-surface"
                >
                  {text.hero.secondary}
                </button>
              </div>
            </div>
          </div>
          
          {/* Stats Bar */}
          <div className="relative z-10 border-y border-cadio-border bg-cadio-surface/30 backdrop-blur-md">
            <div className="mx-auto max-w-7xl grid grid-cols-1 divide-y divide-cadio-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {text.stats.map(([title, body]) => (
                <div key={title} className="px-8 py-8 transition-colors hover:bg-cadio-surface/40">
                  <div className="text-sm font-bold text-white mb-2">{title}</div>
                  <div className="text-xs leading-relaxed text-cadio-muted">{body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product Grid */}
        <section id="product" className="mx-auto max-w-7xl px-6 lg:px-8 py-32">
          <div className="mb-20">
            <h2 className="text-4xl font-bold text-white mb-6">{text.product.title}</h2>
            <p className="max-w-2xl text-lg text-cadio-muted leading-relaxed">{text.product.body}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {text.cards.map(([title, body]) => (
              <article key={title} className="group rounded-2xl border border-cadio-border bg-cadio-surface p-8 transition-all hover:border-cadio-accent/50 hover:shadow-2xl hover:shadow-cadio-accent/5">
                <div className="mb-6 h-1 w-12 rounded-full bg-cadio-accent group-hover:w-20 transition-all duration-300" />
                <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
                <p className="text-sm leading-relaxed text-cadio-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Workflow Section */}
        <section id="workflow" className="bg-cadio-surface/30 border-y border-cadio-border">
          <div className="mx-auto max-w-7xl px-6 lg:px-8 py-32">
            <h2 className="text-4xl font-bold text-white mb-20 text-center">{text.workflow.title}</h2>
            <div className="grid gap-8 md:grid-cols-4">
              {text.workflow.steps.map(([number, title, body]) => (
                <div key={number} className="relative group">
                  <div className="absolute -top-6 -left-4 text-8xl font-black text-cadio-accent/5 select-none transition-colors group-hover:text-cadio-accent/10">
                    {number}
                  </div>
                  <div className="relative pt-4">
                    <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
                    <p className="text-sm leading-relaxed text-cadio-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="mx-auto max-w-7xl px-6 lg:px-8 py-32">
          <div className="rounded-3xl border border-cadio-accent/20 bg-gradient-to-br from-cadio-surface to-cadio-bg p-12 lg:p-16 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 text-cadio-accent/10 pointer-events-none">
              <svg className="w-64 h-64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="relative z-10 grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-4xl font-bold text-white mb-6">{text.pricingTitle}</h2>
                <p className="text-lg text-cadio-muted mb-10 leading-relaxed">
                  {text.pricingBody}
                </p>
                <ul className="space-y-4 mb-10">
                  {["Unlimited AI Search", "Parametric Geometry Engine", "Commercial Use Exports", "Cloud Sync (Beta)"].map(item => (
                    <li key={item} className="flex items-center gap-3 text-sm text-cadio-muted">
                      <svg className="w-5 h-5 text-cadio-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onStartBuilding}
                  className="h-12 rounded-lg bg-cadio-accent px-10 text-base font-bold text-white shadow-lg transition-all hover:bg-cadio-accent-hover"
                >
                  Join the Beta
                </button>
              </div>
              <div className="rounded-2xl bg-cadio-bg/50 border border-cadio-border p-8 backdrop-blur-sm">
                <div className="text-cadio-accent font-bold mb-4 uppercase tracking-widest text-xs">Early Access</div>
                <div className="text-5xl font-black text-white mb-4">$0 <span className="text-xl font-normal text-cadio-muted">/ mo</span></div>
                <p className="text-sm text-cadio-muted leading-relaxed">
                  Help us shape the future of 3D design. Beta users get exclusive early-bird benefits and grandfathered pricing.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-32">
          <div className="text-center">
            <h2 className="text-5xl font-extrabold text-white mb-8">{text.cta.title}</h2>
            <p className="max-w-xl mx-auto text-lg text-cadio-muted mb-12">{text.cta.body}</p>
            <button
              onClick={onStartBuilding}
              className="h-14 rounded-xl bg-white px-12 text-lg font-bold text-cadio-bg shadow-xl transition-all hover:bg-cadio-text hover:scale-105 active:scale-95"
            >
              {text.cta.button}
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
