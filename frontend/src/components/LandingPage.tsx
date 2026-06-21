import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
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

// ─── Three.js components ───────────────────────────────────────────────────

function PhoneStand() {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#00F0FF", roughness: 0.3, metalness: 0.6, emissive: "#00F0FF", emissiveIntensity: 0.08 }), []);
  const grey = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1a2a3a", roughness: 0.5, metalness: 0.4 }), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.3;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.12;
  });
  return (
    <group ref={ref} position={[-2, 0, 0]} scale={0.7}>
      <mesh material={grey} castShadow><boxGeometry args={[1.6, 0.3, 1.2]} /></mesh>
      <mesh material={grey} position={[0, 1, -0.4]} castShadow><boxGeometry args={[1.4, 1.8, 0.25]} /></mesh>
      <mesh material={mat} position={[0.55, 0.15, 0.55]} castShadow><cylinderGeometry args={[0.1, 0.1, 0.05, 16]} /></mesh>
      <mesh material={mat} position={[-0.55, 0.15, 0.55]} castShadow><cylinderGeometry args={[0.1, 0.1, 0.05, 16]} /></mesh>
    </group>
  );
}

function Bracket() {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#FF007A", roughness: 0.25, metalness: 0.7, emissive: "#FF007A", emissiveIntensity: 0.06 }), []);
  const grey = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1f1a2e", roughness: 0.4, metalness: 0.5 }), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = -Math.sin(clock.elapsedTime * 0.35 + 1) * 0.35;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.5 + 2) * 0.15;
  });
  return (
    <group ref={ref} position={[2, 0, 0]} scale={0.7}>
      <mesh material={grey} castShadow><boxGeometry args={[2, 0.25, 0.25]} /></mesh>
      <mesh material={grey} position={[-0.875, 0.75, 0]} castShadow><boxGeometry args={[0.25, 1.5, 0.25]} /></mesh>
      <mesh material={grey} position={[0.875, 0.75, 0]} castShadow><boxGeometry args={[0.25, 1.5, 0.25]} /></mesh>
      <mesh material={mat} position={[-0.875, 1.55, 0]} castShadow><boxGeometry args={[0.25, 0.15, 0.5]} /></mesh>
      <mesh material={mat} position={[0.875, 1.55, 0]} castShadow><boxGeometry args={[0.25, 0.15, 0.5]} /></mesh>
    </group>
  );
}

function HexPlate() {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8A2BE2", roughness: 0.2, metalness: 0.8, emissive: "#8A2BE2", emissiveIntensity: 0.1 }), []);
  const grey = useMemo(() => new THREE.MeshStandardMaterial({ color: "#12121c", roughness: 0.6, metalness: 0.3 }), []);
  const hexGeo = useMemo(() => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = Math.cos(angle) * 0.9;
      const y = Math.sin(angle) * 0.9;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.25;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.45 + 3) * 0.1;
  });
  return (
    <group ref={ref} position={[0, 0.5, 1]} scale={0.65}>
      <mesh geometry={hexGeo} material={grey} castShadow />
      <mesh geometry={hexGeo} material={mat} position={[0, 0, 0.19]} castShadow />
    </group>
  );
}

function HeroScene() {
  return (
    <div className="absolute inset-0">
      <Canvas dpr={[1, 1.5]} shadows camera={{ position: [0, 2, 6], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#050505"]} />
        <ambientLight intensity={0.5} />
        <spotLight position={[5, 10, 5]} angle={0.2} penumbra={1} intensity={3} castShadow shadow-mapSize={[1024, 1024]} />
        <pointLight position={[-6, 4, -4]} intensity={1.5} color="#00F0FF" />
        <pointLight position={[6, 4, -4]} intensity={1} color="#FF007A" />
        <pointLight position={[0, 6, 2]} intensity={0.8} color="#8A2BE2" />
        <PhoneStand />
        <Bracket />
        <HexPlate />
        <gridHelper args={[14, 28, "#0a1a2a", "#071018"]} position={[0, -1.2, 0]} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#050505] to-transparent" />
    </div>
  );
}

// ─── Scroll reveal hook ────────────────────────────────────────────────────

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

// ─── Auth dialog ───────────────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e0e0e] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">
            {mode === "login" ? text.auth.loginTitle : text.auth.signupTitle}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form
          className="flex flex-col gap-4"
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
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
              {text.auth.name}
              <input name="name" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#00F0FF]/50 focus:ring-1 focus:ring-[#00F0FF]/30 transition-colors" />
            </label>
          )}
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
            {text.auth.email}
            <input name="email" type="email" required className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#00F0FF]/50 focus:ring-1 focus:ring-[#00F0FF]/30 transition-colors" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
            {text.auth.password}
            <input name="password" type="password" minLength={4} required className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#00F0FF]/50 focus:ring-1 focus:ring-[#00F0FF]/30 transition-colors" />
          </label>
          {authError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{authError}</p>
          )}
          <button
            disabled={authBusy}
            className="h-11 w-full rounded-lg bg-[#00F0FF] text-sm font-semibold text-[#050505] hover:bg-[#00F0FF]/90 disabled:cursor-wait disabled:opacity-60 transition-colors mt-1"
          >
            {authBusy ? "..." : text.auth.continue}
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-white/30">{text.auth.hint}</p>
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [scrolled, setScrolled] = useState(false);
  const text = copy[language];

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => setScrolled(el.scrollTop > 48);
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const product = useReveal();
  const workflow = useReveal();
  const pricing = useReveal();

  const marqueeItems = ["STL", "3MF", "STEP", "OBJ", "AMF", "AI CAD", "Parametric", "FDM", "SLA", "MSLA", "3D Print"];

  return (
    <>
      <style>{`
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .marquee-track { animation: marquee 24s linear infinite; }
      `}</style>

      <div id="landing-scroll" ref={scrollRef} className="h-full overflow-y-auto bg-[#050505] text-white"
        style={{ backgroundImage: "radial-gradient(circle at 50% 0%, rgba(0,240,255,0.04) 0%, transparent 60%)" }}>

        {/* Navbar */}
        <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${scrolled ? "border-b border-white/10 bg-[#050505]/90 backdrop-blur-xl shadow-lg" : "bg-transparent"}`}>
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
            <CadioLogo subtitle="" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
            <nav className="hidden items-center gap-8 text-sm font-medium text-white/60 md:flex">
              <a href="#product" className="hover:text-white transition-colors">{text.nav.product}</a>
              <a href="#workflow" className="hover:text-white transition-colors">{text.nav.workflow}</a>
              <a href="#pricing" className="hover:text-white transition-colors">{text.nav.pricing}</a>
            </nav>
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="h-9 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white/70 outline-none focus:ring-1 focus:ring-[#00F0FF]/50 backdrop-blur"
                aria-label="Language"
              >
                {languageOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <button
                onClick={() => setAuthMode("login")}
                className="hidden h-9 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors sm:block"
              >
                {text.nav.login}
              </button>
              <button
                onClick={onStartBuilding}
                className="h-9 rounded-lg bg-[#00F0FF] px-5 text-sm font-bold text-[#050505] hover:bg-[#00F0FF]/90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(0,240,255,0.25)]"
              >
                {text.nav.start}
              </button>
            </div>
          </div>
        </header>

        <main>
          {/* ── Hero ── */}
          <section className="relative min-h-screen overflow-hidden pt-16 flex flex-col justify-center">
            <HeroScene />
            <div className="relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-8 py-32">
              <div className="max-w-2xl">
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#00F0FF]/30 bg-[#00F0FF]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#00F0FF]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00F0FF] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00F0FF]" />
                  </span>
                  {text.hero.eyebrow}
                </div>
                <h1 className="text-6xl font-extrabold leading-[0.88] tracking-tight text-white sm:text-7xl lg:text-8xl mb-8">
                  {text.hero.title}
                </h1>
                <p className="max-w-lg text-lg leading-relaxed text-white/60 mb-10">
                  {text.hero.body}
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={onStartBuilding}
                    className="h-12 rounded-xl bg-white px-8 text-base font-bold text-[#050505] hover:bg-white/90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_32px_rgba(255,255,255,0.12)]"
                  >
                    {text.hero.primary}
                  </button>
                  <button
                    onClick={() => setAuthMode("signup")}
                    className="h-12 rounded-xl border border-white/15 bg-white/5 px-8 text-base font-semibold text-white/80 hover:bg-white/10 hover:text-white backdrop-blur transition-colors"
                  >
                    {text.hero.secondary}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Marquee band ── */}
          <div className="border-y border-white/8 bg-white/[0.03] py-4 overflow-hidden">
            <div className="flex marquee-track whitespace-nowrap">
              {[...marqueeItems, ...marqueeItems].map((item, i) => (
                <span key={i} className="mx-8 text-xs font-bold uppercase tracking-[0.24em] text-white/25">{item}</span>
              ))}
            </div>
          </div>

          {/* ── Stats ── */}
          <section className="mx-auto max-w-7xl px-6 lg:px-8 py-20">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {text.stats.map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 hover:border-[#00F0FF]/20 hover:bg-[#00F0FF]/5 transition-all group">
                  <div className="mb-3 h-1 w-8 rounded-full bg-[#00F0FF] group-hover:w-12 transition-all duration-300" />
                  <p className="text-base font-semibold text-white mb-2">{title}</p>
                  <p className="text-sm text-white/50 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Product ── */}
          <section id="product" className="mx-auto max-w-7xl px-6 lg:px-8 py-20">
            <div
              ref={product.ref}
              className={`transition-all duration-700 ${product.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#00F0FF]">Product</p>
              <h2 className="max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl mb-6">{text.product.title}</h2>
              <p className="max-w-xl text-lg text-white/50 leading-relaxed mb-14">{text.product.body}</p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {text.cards.map(([title, body], i) => (
                  <div
                    key={title}
                    style={{ transitionDelay: `${i * 100}ms` }}
                    className={`rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8 transition-all duration-700 ${product.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/20">
                      <svg className="h-5 w-5 text-[#00F0FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={i === 0 ? "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" : i === 1 ? "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" : "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"} />
                      </svg>
                    </div>
                    <p className="text-base font-semibold text-white mb-2">{title}</p>
                    <p className="text-sm text-white/50 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Workflow ── */}
          <section id="workflow" className="bg-white/[0.02] border-y border-white/8 py-24">
            <div
              ref={workflow.ref}
              className={`mx-auto max-w-7xl px-6 lg:px-8 transition-all duration-700 ${workflow.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#FF007A]">Workflow</p>
              <h2 className="max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl mb-14">{text.workflow.title}</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {text.workflow.steps.map(([num, title, body], i) => (
                  <div
                    key={num}
                    style={{ transitionDelay: `${i * 80}ms` }}
                    className={`relative rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition-all duration-700 ${workflow.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                  >
                    <span className="mb-6 block text-5xl font-black text-white/[0.07]">{num}</span>
                    <p className="text-base font-semibold text-white mb-2">{title}</p>
                    <p className="text-sm text-white/50 leading-relaxed">{body}</p>
                    {i < text.workflow.steps.length - 1 && (
                      <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-white/20 lg:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Pricing ── */}
          <section id="pricing" className="mx-auto max-w-7xl px-6 lg:px-8 py-24">
            <div
              ref={pricing.ref}
              className={`transition-all duration-700 ${pricing.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#8A2BE2]">Pricing</p>
              <h2 className="max-w-xl text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">{text.pricingTitle}</h2>
              <p className="max-w-lg text-white/50 leading-relaxed mb-14">{text.pricingBody}</p>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-2xl">
                {/* Free card */}
                <div className="rounded-2xl border border-[#00F0FF]/25 bg-[#00F0FF]/5 p-8 shadow-[0_0_40px_rgba(0,240,255,0.08)]">
                  <p className="text-sm font-bold uppercase tracking-widest text-[#00F0FF] mb-4">Free</p>
                  <p className="text-5xl font-black text-white mb-2">$0<span className="text-lg font-normal text-white/40">/mo</span></p>
                  <p className="text-sm text-white/50 mb-8">During early access</p>
                  <ul className="space-y-3 mb-8 text-sm text-white/70">
                    {["AI model generation", "Export STL & 3MF", "Manual CAD tools", "Unlimited sessions"].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#00F0FF] shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={onStartBuilding} className="w-full h-11 rounded-xl bg-[#00F0FF] text-sm font-bold text-[#050505] hover:bg-[#00F0FF]/90 transition-colors">
                    Start Building
                  </button>
                </div>
                {/* Pro card */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
                  <p className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">Pro</p>
                  <p className="text-5xl font-black text-white/20 mb-2">$?<span className="text-lg font-normal">/mo</span></p>
                  <p className="text-sm text-white/30 mb-8">Coming soon</p>
                  <ul className="space-y-3 mb-8 text-sm text-white/30">
                    {["Everything in Free", "Priority AI processing", "STEP export", "Team workspaces"].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/20 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                  <button disabled className="w-full h-11 rounded-xl border border-white/10 text-sm font-bold text-white/20 cursor-not-allowed">
                    Coming Soon
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── CTA ── */}
          <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-24">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#00F0FF]/8 via-transparent to-[#8A2BE2]/8 p-16 text-center">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,240,255,0.1),transparent_70%)]" />
              <h2 className="relative text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">{text.cta.title}</h2>
              <p className="relative text-lg text-white/50 mb-10 max-w-md mx-auto">{text.cta.body}</p>
              <button
                onClick={onStartBuilding}
                className="relative h-12 rounded-xl bg-white px-10 text-base font-bold text-[#050505] hover:bg-white/90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_40px_rgba(255,255,255,0.15)]"
              >
                {text.cta.button}
              </button>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>

      <AuthDialog
        mode={authMode}
        text={text}
        onClose={() => setAuthMode(null)}
        onStartBuilding={() => { setAuthMode(null); onStartBuilding(); }}
      />
    </>
  );
}
