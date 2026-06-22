/**
 * Cadio Landing Page — spotlight hero, rörliga 3D-modeller, cyan färgsystem.
 * Matchar builderens #141618 / #2bb8dc palette.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
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

const copy = {
  en: {
    nav: { product: "Product", workflow: "Workflow", pricing: "Pricing", login: "Sign In", start: "Start Building" },
    hero: { eyebrow: "Early Access Beta", headline1: "Design.", headline2: "Generate.", headline3: "Print.", body: "The AI CAD workspace that transforms ideas into precision geometry — ready for your 3D printer.", primary: "Start Building Free", secondary: "See Demo" },
    stats: [["Parametric AI", "From natural language to real geometry"], ["Professional Tools", "Manual CAD control at every step"], ["Print Ready", "STL · 3MF · STEP export"]],
    product: { label: "Product", title: "Engineering precision meets AI speed", body: "Describe what you want to build. Cadio's AI generates valid parametric geometry that you can refine with professional CAD tools — edges, extrusions, fillets, and transforms." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "AI Search", body: "Find printable starting points from the world's largest 3D model libraries." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Direct Edit", body: "Select edges, extrude faces, apply fillets and chamfers with precision control." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Smart Export", body: "Optimized files for FDM, SLA and industrial 3D printing workflows." },
    ],
    workflow: { label: "Workflow", title: "From idea to object in four steps", steps: [["Search", "Describe what you need or find an existing design to remix."], ["Generate", "AI creates valid parametric geometry with real-world dimensions."], ["Refine", "Professional CAD tools for precise edge and surface control."], ["Export", "Production-ready files for your exact printer and material."]] },
    pricingTitle: "Simple pricing, always",
    pricingBody: "Free during early access. Help us build the future of AI-assisted CAD.",
    auth: { loginTitle: "Welcome back", signupTitle: "Start building today", email: "Email address", password: "Password", name: "Full name", continue: "Enter Workspace", hint: "By continuing you agree to our terms and privacy policy." },
    cta: { title: "Start building today", body: "Join engineers and makers who build faster with Cadio.", button: "Open Workspace" },
  },
  sv: {
    nav: { product: "Produkt", workflow: "Arbetsflöde", pricing: "Priser", login: "Logga in", start: "Börja Bygga" },
    hero: { eyebrow: "Early Access Beta", headline1: "Designa.", headline2: "Generera.", headline3: "Printa.", body: "AI CAD-workspace som omvandlar idéer till precisionsgometri — redo för din 3D-skrivare.", primary: "Börja Gratis", secondary: "Se Demo" },
    stats: [["Parametrisk AI", "Från naturligt språk till riktig geometri"], ["Professionella Verktyg", "Manuell CAD-kontroll i varje steg"], ["Printklart", "STL · 3MF · STEP export"]],
    product: { label: "Produkt", title: "Ingenjörsprecision möter AI-hastighet", body: "Beskriv vad du vill bygga. Cadios AI genererar giltig parametrisk geometri som du kan förfina med professionella CAD-verktyg." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "AI-sökning", body: "Hitta utskrivbara startpunkter från världens största 3D-modellbibliotek." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Direkt redigering", body: "Välj kanter, extrudera ytor, applicera avrundningar med precisionskontroll." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Smart export", body: "Optimerade filer för FDM, SLA och industriell 3D-utskrift." },
    ],
    workflow: { label: "Arbetsflöde", title: "Från idé till objekt i fyra steg", steps: [["Sök", "Beskriv vad du behöver eller hitta en befintlig design."], ["Generera", "AI skapar giltig parametrisk geometri med verkliga mått."], ["Förfina", "Professionella CAD-verktyg för exakt kant- och ytkontroll."], ["Exportera", "Produktionsklara filer för din skrivare och material."]] },
    pricingTitle: "Enkel prissättning, alltid",
    pricingBody: "Gratis under early access. Hjälp oss bygga framtidens AI-assisterade CAD.",
    auth: { loginTitle: "Välkommen tillbaka", signupTitle: "Börja bygga idag", email: "E-postadress", password: "Lösenord", name: "Fullständigt namn", continue: "Gå till Workspace", hint: "Genom att fortsätta godkänner du våra villkor och integritetspolicy." },
    cta: { title: "Börja bygga idag", body: "Gå med ingenjörer och makers som bygger snabbare med Cadio.", button: "Öppna Workspace" },
  },
  es: {
    nav: { product: "Producto", workflow: "Flujo", pricing: "Precios", login: "Iniciar", start: "Empezar" },
    hero: { eyebrow: "Beta Early Access", headline1: "Diseña.", headline2: "Genera.", headline3: "Imprime.", body: "El workspace CAD con IA que transforma ideas en geometría de precisión.", primary: "Empezar gratis", secondary: "Ver demo" },
    stats: [["IA Paramétrica", "De lenguaje natural a geometría real"], ["Herramientas Pro", "Control CAD manual en cada paso"], ["Listo para imprimir", "STL · 3MF · STEP"]],
    product: { label: "Producto", title: "Precisión de ingeniería con velocidad IA", body: "Describe lo que quieres construir. La IA de Cadio genera geometría paramétrica válida." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Búsqueda IA", body: "Encuentra puntos de partida imprimibles de las mayores bibliotecas de modelos 3D." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Edición directa", body: "Selecciona aristas, extruye caras, aplica filetes con control de precisión." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Exportación inteligente", body: "Archivos optimizados para FDM, SLA e impresión 3D industrial." },
    ],
    workflow: { label: "Flujo", title: "De idea a objeto en cuatro pasos", steps: [["Busca", "Describe lo que necesitas o encuentra un diseño."], ["Genera", "La IA crea geometría paramétrica válida."], ["Refina", "Herramientas CAD profesionales para control preciso."], ["Exporta", "Archivos listos para tu impresora y material."]] },
    pricingTitle: "Precio simple, siempre",
    pricingBody: "Gratis durante early access.",
    auth: { loginTitle: "Bienvenido de nuevo", signupTitle: "Empieza a construir hoy", email: "Correo electrónico", password: "Contraseña", name: "Nombre completo", continue: "Entrar al Workspace", hint: "Al continuar aceptas nuestros términos y política de privacidad." },
    cta: { title: "Empieza a construir hoy", body: "Únete a ingenieros y makers que construyen más rápido.", button: "Abrir Workspace" },
  },
  fr: {
    nav: { product: "Produit", workflow: "Flux", pricing: "Tarifs", login: "Connexion", start: "Commencer" },
    hero: { eyebrow: "Beta Accès anticipé", headline1: "Dessinez.", headline2: "Générez.", headline3: "Imprimez.", body: "L'espace de travail CAO IA qui transforme les idées en géométrie de précision.", primary: "Commencer gratuitement", secondary: "Voir la démo" },
    stats: [["IA Paramétrique", "Du langage naturel à la vraie géométrie"], ["Outils Pro", "Contrôle CAO manuel à chaque étape"], ["Prêt à imprimer", "STL · 3MF · STEP"]],
    product: { label: "Produit", title: "Précision ingénierie, vitesse IA", body: "Décrivez ce que vous voulez construire. L'IA de Cadio génère une géométrie paramétrique valide." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Recherche IA", body: "Trouvez des points de départ imprimables dans les plus grandes bibliothèques." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Édition directe", body: "Sélectionnez les arêtes, extrudez les faces, appliquez des congés." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Export intelligent", body: "Fichiers optimisés pour FDM, SLA et impression 3D industrielle." },
    ],
    workflow: { label: "Flux", title: "De l'idée à l'objet en quatre étapes", steps: [["Cherchez", "Décrivez ce dont vous avez besoin."], ["Générez", "L'IA crée une géométrie paramétrique valide."], ["Affinez", "Outils CAO professionnels pour un contrôle précis."], ["Exportez", "Fichiers prêts pour votre imprimante et matériau."]] },
    pricingTitle: "Tarifs simples, toujours",
    pricingBody: "Gratuit pendant l'accès anticipé.",
    auth: { loginTitle: "Bon retour", signupTitle: "Commencez à construire", email: "Adresse e-mail", password: "Mot de passe", name: "Nom complet", continue: "Accéder au Workspace", hint: "En continuant, vous acceptez nos conditions et notre politique de confidentialité." },
    cta: { title: "Commencez à construire", body: "Rejoignez des ingénieurs et des makers qui construisent plus vite.", button: "Ouvrir le Workspace" },
  },
  it: {
    nav: { product: "Prodotto", workflow: "Flusso", pricing: "Prezzi", login: "Accedi", start: "Inizia" },
    hero: { eyebrow: "Beta Accesso anticipato", headline1: "Progetta.", headline2: "Genera.", headline3: "Stampa.", body: "Il workspace CAD AI che trasforma le idee in geometria di precisione.", primary: "Inizia gratis", secondary: "Guarda la demo" },
    stats: [["IA Parametrica", "Dal linguaggio naturale alla vera geometria"], ["Strumenti Pro", "Controllo CAD manuale ad ogni passo"], ["Pronto per la stampa", "STL · 3MF · STEP"]],
    product: { label: "Prodotto", title: "Precisione ingegneristica, velocità IA", body: "Descrivi cosa vuoi costruire. L'IA di Cadio genera geometria parametrica valida." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Ricerca IA", body: "Trova punti di partenza stampabili dalle più grandi librerie di modelli 3D." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Modifica diretta", body: "Seleziona bordi, estrudi facce, applica raccordi con controllo preciso." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Esportazione intelligente", body: "File ottimizzati per FDM, SLA e stampa 3D industriale." },
    ],
    workflow: { label: "Flusso", title: "Dall'idea all'oggetto in quattro passi", steps: [["Cerca", "Descrivi di cosa hai bisogno."], ["Genera", "L'IA crea geometria parametrica valida."], ["Affina", "Strumenti CAD professionali per il controllo preciso."], ["Esporta", "File pronti per la tua stampante e materiale."]] },
    pricingTitle: "Prezzi semplici, sempre",
    pricingBody: "Gratuito durante l'accesso anticipato.",
    auth: { loginTitle: "Bentornato", signupTitle: "Inizia a costruire oggi", email: "Indirizzo email", password: "Password", name: "Nome completo", continue: "Accedi al Workspace", hint: "Continuando accetti i nostri termini e la nostra politica sulla privacy." },
    cta: { title: "Inizia a costruire oggi", body: "Unisciti a ingegneri e maker che costruiscono più velocemente.", button: "Apri il Workspace" },
  },
  de: {
    nav: { product: "Produkt", workflow: "Workflow", pricing: "Preise", login: "Anmelden", start: "Starten" },
    hero: { eyebrow: "Early Access Beta", headline1: "Designen.", headline2: "Generieren.", headline3: "Drucken.", body: "Der KI-CAD-Workspace, der Ideen in Präzisionsgeometrie verwandelt.", primary: "Kostenlos starten", secondary: "Demo ansehen" },
    stats: [["Parametrische KI", "Von natürlicher Sprache zur echten Geometrie"], ["Profi-Werkzeuge", "Manuelle CAD-Kontrolle bei jedem Schritt"], ["Druckbereit", "STL · 3MF · STEP Export"]],
    product: { label: "Produkt", title: "Ingenieurspräzision trifft KI-Geschwindigkeit", body: "Beschreibe, was du bauen möchtest. Cadios KI generiert gültige parametrische Geometrie." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "KI-Suche", body: "Finde druckbare Ausgangspunkte aus den größten 3D-Modellbibliotheken." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Direktbearbeitung", body: "Kanten auswählen, Flächen extrudieren, Verrundungen mit Präzision." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Intelligenter Export", body: "Optimierte Dateien für FDM, SLA und industriellen 3D-Druck." },
    ],
    workflow: { label: "Workflow", title: "Von der Idee zum Objekt in vier Schritten", steps: [["Suchen", "Beschreibe, was du brauchst."], ["Generieren", "KI erstellt gültige parametrische Geometrie."], ["Verfeinern", "Professionelle CAD-Werkzeuge für präzise Kontrolle."], ["Exportieren", "Produktionsreife Dateien für deinen Drucker."]] },
    pricingTitle: "Einfache Preise, immer",
    pricingBody: "Kostenlos während des Early Access.",
    auth: { loginTitle: "Willkommen zurück", signupTitle: "Beginne heute zu bauen", email: "E-Mail-Adresse", password: "Passwort", name: "Vollständiger Name", continue: "Zum Workspace", hint: "Mit der Fortsetzung stimmst du unseren Bedingungen zu." },
    cta: { title: "Beginne heute zu bauen", body: "Schließe dich Ingenieuren und Makern an.", button: "Workspace öffnen" },
  },
  pt: {
    nav: { product: "Produto", workflow: "Fluxo", pricing: "Preços", login: "Entrar", start: "Começar" },
    hero: { eyebrow: "Beta Acesso antecipado", headline1: "Projete.", headline2: "Gere.", headline3: "Imprima.", body: "O workspace CAD com IA que transforma ideias em geometria de precisão.", primary: "Começar grátis", secondary: "Ver demo" },
    stats: [["IA Paramétrica", "Da linguagem natural à geometria real"], ["Ferramentas Pro", "Controle CAD manual a cada passo"], ["Pronto para impressão", "STL · 3MF · STEP"]],
    product: { label: "Produto", title: "Precisão de engenharia com velocidade de IA", body: "Descreva o que você quer construir. A IA da Cadio gera geometria paramétrica válida." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Busca IA", body: "Encontre pontos de partida imprimíveis das maiores bibliotecas de modelos 3D." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Edição direta", body: "Selecione arestas, extrude faces, aplique filetes com controle preciso." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Exportação inteligente", body: "Arquivos otimizados para FDM, SLA e impressão 3D industrial." },
    ],
    workflow: { label: "Fluxo", title: "Da ideia ao objeto em quatro etapas", steps: [["Busque", "Descreva o que você precisa."], ["Gere", "A IA cria geometria paramétrica válida."], ["Refine", "Ferramentas CAD profissionais para controle preciso."], ["Exporte", "Arquivos prontos para sua impressora e material."]] },
    pricingTitle: "Preços simples, sempre",
    pricingBody: "Grátis durante o acesso antecipado.",
    auth: { loginTitle: "Bem-vindo de volta", signupTitle: "Comece a construir hoje", email: "Endereço de e-mail", password: "Senha", name: "Nome completo", continue: "Entrar no Workspace", hint: "Ao continuar, você concorda com nossos termos e política de privacidade." },
    cta: { title: "Comece a construir hoje", body: "Junte-se a engenheiros e makers que constroem mais rápido.", button: "Abrir Workspace" },
  },
};

// ─── ACCENT COLOR ───────────────────────────────────────────────────────────
const ACCENT = "#2bb8dc";
const ACCENT_DIM = "rgba(43,184,220,";
const BG = "#080c10";

// ─── 3D MODELS ──────────────────────────────────────────────────────────────

/** Geodesic lattice sphere — classic CAD topology */
function LatticeSphere() {
  const groupRef = useRef<THREE.Group>(null);
  const solidRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);

  const geo = useMemo(() => new THREE.IcosahedronGeometry(1.35, 3), []);

  const solidMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#1a2a35",
        roughness: 0.12,
        metalness: 0.88,
        clearcoat: 0.9,
        clearcoatRoughness: 0.08,
        emissive: ACCENT,
        emissiveIntensity: 0.04,
      }),
    [],
  );

  const wireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: ACCENT,
        wireframe: true,
        opacity: 0.35,
        transparent: true,
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.14;
    groupRef.current.rotation.x = Math.sin(t * 0.08) * 0.18;
    groupRef.current.position.y = Math.sin(t * 0.5) * 0.08;
    const s = 1 + Math.sin(t * 0.45) * 0.012;
    if (wireRef.current) wireRef.current.scale.setScalar(s * 1.008);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={solidRef} geometry={geo} material={solidMat} castShadow />
      <mesh ref={wireRef} geometry={geo} material={wireMat} />
    </group>
  );
}

/** Gyroscope — nested precision rings, signature CAD piece */
function Gyroscope() {
  const outer = useRef<THREE.Group>(null);
  const mid = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);

  const ringCyan = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ACCENT,
        roughness: 0.1,
        metalness: 0.95,
        emissive: ACCENT,
        emissiveIntensity: 0.12,
      }),
    [],
  );
  const ringSteel = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#7090a0",
        roughness: 0.18,
        metalness: 0.9,
      }),
    [],
  );

  const geo1 = useMemo(() => new THREE.TorusGeometry(1.6, 0.055, 20, 90), []);
  const geo2 = useMemo(() => new THREE.TorusGeometry(1.2, 0.055, 20, 90), []);
  const geo3 = useMemo(() => new THREE.TorusGeometry(0.8, 0.055, 20, 90), []);
  const spGeo = useMemo(() => new THREE.SphereGeometry(0.2, 24, 24), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (outer.current) {
      outer.current.rotation.y = t * 0.3;
      outer.current.rotation.z = Math.sin(t * 0.12) * 0.28;
    }
    if (mid.current) {
      mid.current.rotation.x = t * 0.48;
      mid.current.rotation.y = Math.sin(t * 0.18) * 0.18;
    }
    if (inner.current) inner.current.rotation.z = -t * 0.7;

    // Float
    if (outer.current) outer.current.position.y = Math.sin(t * 0.6) * 0.1;
  });

  return (
    <group>
      <group ref={outer}>
        <mesh geometry={geo1} material={ringCyan} castShadow />
        <group ref={mid}>
          <mesh geometry={geo2} material={ringSteel} castShadow />
          <group ref={inner}>
            <mesh geometry={geo3} material={ringCyan} castShadow />
            <mesh geometry={spGeo} material={ringSteel} castShadow />
          </group>
        </group>
      </group>
    </group>
  );
}

/** Turbine impeller — swept blade geometry */
function TurbineShell() {
  const groupRef = useRef<THREE.Group>(null);

  const bladeMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#111820",
        roughness: 0.06,
        metalness: 0.97,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: ACCENT,
        emissiveIntensity: 0.03,
      }),
    [],
  );

  const bladeGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.05, 0.3, 0.25, 0.5, 0.1, 0.9);
    shape.bezierCurveTo(0.0, 1.0, -0.1, 0.9, -0.05, 0.7);
    shape.bezierCurveTo(-0.2, 0.4, -0.08, 0.15, 0, 0);
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 3,
    });
  }, []);

  const hubGeo = useMemo(() => new THREE.CylinderGeometry(0.18, 0.22, 0.12, 32), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z = clock.elapsedTime * 0.24;
    groupRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.1) * 0.22;
    groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.55) * 0.09;
  });

  const BLADES = 8;
  return (
    <group ref={groupRef} scale={1.3}>
      {Array.from({ length: BLADES }, (_, i) => (
        <mesh
          key={i}
          geometry={bladeGeo}
          material={bladeMat}
          rotation={[Math.PI / 2, 0, (Math.PI * 2 * i) / BLADES]}
          castShadow
        />
      ))}
      <mesh geometry={hubGeo} material={bladeMat} castShadow />
    </group>
  );
}

/** Phone stand — the everyday hero of 3D printing */
function PhoneStand() {
  const groupRef = useRef<THREE.Group>(null);

  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0d1a22",
        roughness: 0.15,
        metalness: 0.7,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        emissive: ACCENT,
        emissiveIntensity: 0.05,
      }),
    [],
  );

  const baseMesh = useMemo(
    () => new THREE.BoxGeometry(2.2, 0.22, 1.6, 1, 1, 1),
    [],
  );
  const backMesh = useMemo(
    () => new THREE.BoxGeometry(2.0, 2.6, 0.2, 1, 1, 1),
    [],
  );
  const lipMesh = useMemo(
    () => new THREE.BoxGeometry(2.0, 0.4, 0.3, 1, 1, 1),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.18;
    groupRef.current.position.y = Math.sin(t * 0.5) * 0.07;
  });

  return (
    <group ref={groupRef} position={[0, -0.2, 0]}>
      {/* Base plate */}
      <mesh geometry={baseMesh} material={mat} castShadow position={[0, 0, 0]} />
      {/* Angled back support */}
      <mesh
        geometry={backMesh}
        material={mat}
        castShadow
        position={[0, 1.0, -0.55]}
        rotation={[-0.35, 0, 0]}
      />
      {/* Front lip */}
      <mesh geometry={lipMesh} material={mat} castShadow position={[0, 0.3, 0.65]} />
    </group>
  );
}

/** Camera — smooth push-in + gentle look-at drift */
function CameraRig() {
  const { camera } = useThree();
  const progress = useRef(0);

  useFrame((state, delta) => {
    progress.current = Math.min(progress.current + delta * 0.22, 1);
    const ease = 1 - Math.pow(1 - progress.current, 3);
    camera.position.z = THREE.MathUtils.lerp(8.5, 5.8, ease);
    camera.position.y = THREE.MathUtils.lerp(2.2, 0.8, ease);
    // Subtle drift
    camera.position.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.15;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Floating scan-line / grid plane beneath the model */
function GroundGrid() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.07,
        wireframe: true,
      }),
    [],
  );
  const geo = useMemo(() => new THREE.PlaneGeometry(8, 8, 12, 12), []);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = -1.6 + Math.sin(clock.elapsedTime * 0.3) * 0.03;
  });

  return <mesh ref={ref} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]} />;
}

/** The full Three.js hero scene — spotlight from top, model centered */
function HeroScene({ activeModel }: { activeModel: number }) {
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        shadows
        camera={{ position: [0, 0.8, 8.5], fov: 40 }}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
        }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 12, 24]} />

        {/* Cinematic spotlight from top — the key light */}
        <spotLight
          position={[0, 7, 1]}
          angle={0.28}
          penumbra={0.85}
          intensity={12}
          color="#ffffff"
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        {/* Cyan fill from below — gives the "glow pool" feel */}
        <pointLight position={[0, -2.5, 0]} intensity={3} color={ACCENT} />
        {/* Subtle blue rim from behind */}
        <pointLight position={[-4, 2, -4]} intensity={1.5} color="#0a3a50" />
        {/* Warm rim right */}
        <pointLight position={[5, 3, 2]} intensity={0.8} color="#1a3040" />
        {/* Very dim ambient so shadows stay dramatic */}
        <ambientLight intensity={0.08} color="#0a1520" />

        <GroundGrid />
        {activeModel === 0 && <LatticeSphere />}
        {activeModel === 1 && <Gyroscope />}
        {activeModel === 2 && <TurbineShell />}
        {activeModel === 3 && <PhoneStand />}

        <CameraRig />
      </Canvas>

      {/* CSS spotlight cone — visible beam from top */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `conic-gradient(
            from 90deg at 50% -2%,
            transparent 72deg,
            ${ACCENT_DIM}0.025) 80deg,
            ${ACCENT_DIM}0.055) 87deg,
            ${ACCENT_DIM}0.08) 90deg,
            ${ACCENT_DIM}0.055) 93deg,
            ${ACCENT_DIM}0.025) 100deg,
            transparent 108deg
          )`,
        }}
      />
      {/* Soft vignette to focus eye on center */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, ${BG} 100%)`,
        }}
      />
      {/* Top fade to blend with content */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${BG} 0%, transparent 14%, transparent 75%, ${BG} 100%)`,
        }}
      />
      {/* Ground glow pool */}
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: "22%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "560px",
          height: "100px",
          background: `radial-gradient(ellipse, ${ACCENT_DIM}0.22) 0%, transparent 70%)`,
          filter: "blur(18px)",
        }}
      />
    </div>
  );
}

// ─── SCROLL REVEAL ───────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ─── AUTH DIALOG ─────────────────────────────────────────────────────────────

function AuthDialog({
  mode, text, onClose, onStartBuilding,
}: {
  mode: AuthMode;
  text: typeof copy.en;
  onClose: () => void;
  onStartBuilding: () => void;
}) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!mode) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{
            background: "#0d1318",
            border: `1px solid ${ACCENT_DIM}0.2)`,
            boxShadow: `0 0 60px ${ACCENT_DIM}0.08)`,
          }}
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              {mode === "login" ? text.auth.loginTitle : text.auth.signupTitle}
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/30 transition-colors hover:text-white hover:bg-white/8"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setErr(""); setBusy(true);
              try {
                await loginCadioAccount({
                  name: String(fd.get("name") || ""),
                  email: String(fd.get("email") || ""),
                  password: String(fd.get("password") || ""),
                });
                onStartBuilding();
              } catch (ex) {
                setErr(ex instanceof Error ? ex.message : "Could not sign in.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "signup" && (
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  {text.auth.name}
                </label>
                <input
                  name="name"
                  className="h-11 w-full rounded-xl px-4 text-sm text-white placeholder-white/20 outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            )}
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                {text.auth.email}
              </label>
              <input
                name="email"
                type="email"
                required
                className="h-11 w-full rounded-xl px-4 text-sm text-white outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                {text.auth.password}
              </label>
              <input
                name="password"
                type="password"
                minLength={4}
                required
                className="h-11 w-full rounded-xl px-4 text-sm text-white outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            {err && (
              <p className="rounded-xl px-4 py-2.5 text-xs text-red-300" style={{ background: "rgba(220,50,50,0.08)", border: "1px solid rgba(220,50,50,0.2)" }}>
                {err}
              </p>
            )}
            <button
              disabled={busy}
              className="mt-1 h-12 w-full rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ background: ACCENT, color: "#050709", boxShadow: `0 4px 24px ${ACCENT_DIM}0.4)` }}
            >
              {busy ? "…" : text.auth.continue}
            </button>
          </form>
          <p className="mt-4 text-center text-xs leading-relaxed text-white/25">{text.auth.hint}</p>
        </div>
      </div>
    </div>
  );
}

// ─── MODEL SELECTOR LABELS ───────────────────────────────────────────────────

const MODELS = [
  { label: "Lattice Shell", description: "Geodesic parametric structure" },
  { label: "Gyroscope", description: "Nested precision rings" },
  { label: "Turbine", description: "Swept blade geometry" },
  { label: "Phone Stand", description: "Everyday 3D print object" },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeModel, setActiveModel] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const text = copy[language];

  useEffect(() => {
    const id = setInterval(() => setActiveModel((m) => (m + 1) % MODELS.length), 5500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = () => setScrolled(el.scrollTop > 50);
    el.addEventListener("scroll", h, { passive: true });
    return () => el.removeEventListener("scroll", h);
  }, []);

  const s1 = useReveal();
  const s2 = useReveal();
  const s3 = useReveal();
  const s4 = useReveal();

  const reveal = (v: boolean, delay = 0) =>
    `transition-all duration-700 ease-out ${v ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`
    + (delay ? ` delay-[${delay}ms]` : "");

  return (
    <>
      <style>{`
        @keyframes fadeUp   { from { opacity:0; transform:translateY(28px) } to { opacity:1; transform:translateY(0) } }
        @keyframes marquee  { from { transform:translateX(0) } to { transform:translateX(-50%) } }
        @keyframes pulse-cx { 0%,100% { opacity:.4 } 50% { opacity:1 } }
        @keyframes float-y  { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }

        .anim-in   { animation: fadeUp .9s cubic-bezier(.16,1,.3,1) both; }
        .anim-in-1 { animation: fadeUp .9s .12s cubic-bezier(.16,1,.3,1) both; }
        .anim-in-2 { animation: fadeUp .9s .24s cubic-bezier(.16,1,.3,1) both; }
        .anim-in-3 { animation: fadeUp .9s .38s cubic-bezier(.16,1,.3,1) both; }
        .marquee-track { animation: marquee 32s linear infinite; }
        .pulse-cx  { animation: pulse-cx 2.8s ease-in-out infinite; }
        .float-y   { animation: float-y 4s ease-in-out infinite; }
        .card-hover { transition: transform .3s ease, box-shadow .3s ease, border-color .3s ease; }
        .card-hover:hover { transform: translateY(-4px); }
      `}</style>

      <div
        id="landing-scroll"
        ref={scrollRef}
        className="h-full overflow-y-auto"
        style={{ background: BG, color: "#e8edf2", fontFamily: "'Inter', system-ui, sans-serif" }}
      >

        {/* ── NAVBAR ────────────────────────────────────────────────────── */}
        <header
          className="fixed inset-x-0 top-0 z-40 transition-all duration-500"
          style={{
            background: scrolled ? "rgba(8,12,16,0.9)" : "transparent",
            backdropFilter: scrolled ? "blur(20px)" : "none",
            borderBottom: scrolled ? "1px solid rgba(43,184,220,0.1)" : "1px solid transparent",
          }}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
            <CadioLogo
              subtitle=""
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            />
            <nav
              className="hidden items-center gap-8 text-sm font-medium md:flex"
              style={{ color: "rgba(232,237,242,0.5)" }}
            >
              <a href="#product" className="transition-colors hover:text-white">{text.nav.product}</a>
              <a href="#workflow" className="transition-colors hover:text-white">{text.nav.workflow}</a>
              <a href="#pricing" className="transition-colors hover:text-white">{text.nav.pricing}</a>
            </nav>
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="h-9 rounded-lg px-2 text-xs outline-none transition-colors"
                style={{
                  background: "rgba(43,184,220,0.06)",
                  border: "1px solid rgba(43,184,220,0.15)",
                  color: "rgba(232,237,242,0.7)",
                }}
              >
                {languageOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => setAuthMode("login")}
                className="hidden h-9 rounded-lg px-4 text-sm font-medium transition-all sm:block hover:text-white"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(232,237,242,0.6)",
                }}
              >
                {text.nav.login}
              </button>
              <button
                onClick={onStartBuilding}
                className="h-9 rounded-lg px-5 text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{
                  background: ACCENT,
                  color: BG,
                  boxShadow: `0 2px 20px ${ACCENT_DIM}0.4)`,
                }}
              >
                {text.nav.start}
              </button>
            </div>
          </div>
        </header>

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="relative min-h-screen overflow-hidden">
          {/* 3D scene fills entire hero */}
          <HeroScene activeModel={activeModel} />

          {/* Hero text — centered, above the model */}
          <div className="relative z-10 flex min-h-screen flex-col items-center justify-center pt-16 pb-32">
            <div className="flex flex-col items-center text-center px-6">
              {/* Eyebrow */}
              <div
                className="anim-in mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
                style={{
                  background: `${ACCENT_DIM}0.08)`,
                  border: `1px solid ${ACCENT_DIM}0.25)`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full pulse-cx"
                  style={{ background: ACCENT }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: ACCENT }}
                >
                  {text.hero.eyebrow}
                </span>
              </div>

              {/* Headline */}
              <h1
                className="mb-6 font-black leading-[0.88] tracking-[-0.04em]"
                style={{ fontSize: "clamp(60px, 9vw, 120px)" }}
              >
                <span className="anim-in-1 block text-white">{text.hero.headline1}</span>
                <span className="anim-in-2 block" style={{ color: ACCENT }}>{text.hero.headline2}</span>
                <span className="anim-in-3 block text-white">{text.hero.headline3}</span>
              </h1>

              {/* Sub */}
              <p
                className="anim-in-3 mb-10 text-lg leading-relaxed"
                style={{ color: "rgba(232,237,242,0.5)", maxWidth: "440px" }}
              >
                {text.hero.body}
              </p>

              {/* CTAs */}
              <div className="anim-in-3 flex flex-wrap justify-center gap-4">
                <button
                  onClick={onStartBuilding}
                  className="rounded-xl px-8 text-base font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    height: "52px",
                    background: "#e8edf2",
                    color: BG,
                    boxShadow: "0 4px 40px rgba(232,237,242,0.12)",
                  }}
                >
                  {text.hero.primary}
                </button>
                <button
                  onClick={() => setAuthMode("signup")}
                  className="rounded-xl px-8 text-base font-semibold transition-all hover:text-white"
                  style={{
                    height: "52px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(232,237,242,0.65)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {text.hero.secondary}
                </button>
              </div>
            </div>
          </div>

          {/* Model selector dots — bottom center */}
          <div className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 flex items-center gap-3">
            {MODELS.map((m, i) => (
              <button
                key={i}
                onClick={() => setActiveModel(i)}
                title={m.label}
                className="transition-all duration-300 rounded-full"
                style={{
                  width: activeModel === i ? "28px" : "8px",
                  height: "8px",
                  background: activeModel === i ? ACCENT : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>

          {/* Active model label */}
          <div className="absolute bottom-10 right-8 z-10 hidden lg:flex flex-col items-end gap-1">
            <p className="text-xs font-semibold text-white">{MODELS[activeModel].label}</p>
            <p className="text-[10px]" style={{ color: "rgba(232,237,242,0.35)" }}>
              {MODELS[activeModel].description}
            </p>
          </div>

          {/* Scroll cue */}
          <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 flex-col items-center gap-2 pulse-cx hidden md:flex">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "rgba(232,237,242,0.25)" }}>
              Scroll
            </p>
            <div
              className="h-8 w-px"
              style={{ background: `linear-gradient(to bottom, ${ACCENT_DIM}0.5), transparent)` }}
            />
          </div>
        </section>

        {/* ── MARQUEE ────────────────────────────────────────────────────── */}
        <div
          className="overflow-hidden py-5"
          style={{
            borderTop: `1px solid rgba(43,184,220,0.1)`,
            borderBottom: `1px solid rgba(43,184,220,0.1)`,
            background: `${ACCENT_DIM}0.02)`,
          }}
        >
          <div className="flex marquee-track whitespace-nowrap">
            {[
              "Parametric CAD", "STL Export", "3MF Export", "STEP Export",
              "AI Generation", "FDM Ready", "SLA Ready", "Real Dimensions",
              "Natural Language", "Precision Geometry", "3D Printing", "Open Source",
            ].flatMap((item) => [item, item]).map((item, i) => (
              <span
                key={i}
                className="mx-10 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "rgba(232,237,242,0.18)" }}
              >
                {item}
                <span className="ml-10" style={{ color: `${ACCENT_DIM}0.3)` }}>·</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── STATS ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 py-24">
          <div
            ref={s1.ref}
            className={`grid grid-cols-1 gap-px sm:grid-cols-3 ${reveal(s1.visible)}`}
            style={{
              background: `${ACCENT_DIM}0.1)`,
              borderRadius: "20px",
              overflow: "hidden",
            }}
          >
            {text.stats.map(([title, body], i) => (
              <div
                key={i}
                className="p-10"
                style={{ background: "#0a0e13" }}
              >
                <p
                  className="mb-1 text-3xl font-black tracking-tight"
                  style={{ color: ACCENT }}
                >
                  {["01", "02", "03"][i]}
                </p>
                <p className="text-base font-semibold text-white mb-2">{title}</p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(232,237,242,0.42)" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRODUCT ─────────────────────────────────────────────────────── */}
        <section id="product" className="mx-auto max-w-7xl px-6 lg:px-8 py-24">
          <div ref={s2.ref} className={reveal(s2.visible)}>
            <p
              className="mb-6 text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: ACCENT }}
            >
              {text.product.label}
            </p>
            <div className="mb-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-end">
              <h2 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                {text.product.title}
              </h2>
              <p
                className="text-lg leading-relaxed"
                style={{ color: "rgba(232,237,242,0.48)" }}
              >
                {text.product.body}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {text.cards.map((card, i) => (
                <div
                  key={i}
                  className="card-hover group rounded-2xl p-8"
                  style={{
                    background: `linear-gradient(135deg, rgba(43,184,220,0.04) 0%, rgba(43,184,220,0.01) 100%)`,
                    border: `1px solid ${ACCENT_DIM}0.1)`,
                    transitionDelay: `${i * 60}ms`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = `${ACCENT_DIM}0.3)`;
                    (e.currentTarget as HTMLElement).style.boxShadow = `0 0 40px ${ACCENT_DIM}0.06)`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = `${ACCENT_DIM}0.1)`;
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <div
                    className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110"
                    style={{
                      background: `${ACCENT_DIM}0.1)`,
                      border: `1px solid ${ACCENT_DIM}0.2)`,
                    }}
                  >
                    <svg
                      className="h-5 w-5"
                      style={{ color: ACCENT }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
                    </svg>
                  </div>
                  <p className="mb-3 text-base font-bold text-white">{card.title}</p>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(232,237,242,0.42)" }}>
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WORKFLOW ─────────────────────────────────────────────────────── */}
        <section
          id="workflow"
          className="py-28"
          style={{
            background: `${ACCENT_DIM}0.02)`,
            borderTop: `1px solid ${ACCENT_DIM}0.08)`,
            borderBottom: `1px solid ${ACCENT_DIM}0.08)`,
          }}
        >
          <div ref={s3.ref} className={`mx-auto max-w-7xl px-6 lg:px-8 ${reveal(s3.visible)}`}>
            <p
              className="mb-6 text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: ACCENT }}
            >
              {text.workflow.label}
            </p>
            <h2 className="mb-20 text-4xl font-black tracking-tight text-white sm:text-5xl max-w-xl">
              {text.workflow.title}
            </h2>
            <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
              {text.workflow.steps.map(([title, body], i) => (
                <div
                  key={i}
                  className={`relative ${reveal(s3.visible, i * 90)}`}
                >
                  <div className="mb-8 flex items-center gap-4">
                    <span
                      className="text-6xl font-black"
                      style={{ color: `${ACCENT_DIM}0.18)`, lineHeight: 1 }}
                    >
                      0{i + 1}
                    </span>
                    {i < text.workflow.steps.length - 1 && (
                      <div
                        className="hidden lg:block flex-1 h-px"
                        style={{
                          background: `linear-gradient(to right, ${ACCENT_DIM}0.3), transparent)`,
                        }}
                      />
                    )}
                  </div>
                  <p className="mb-3 text-lg font-bold text-white">{title}</p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "rgba(232,237,242,0.42)" }}
                  >
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ──────────────────────────────────────────────────────── */}
        <section id="pricing" className="mx-auto max-w-7xl px-6 lg:px-8 py-28">
          <div ref={s4.ref} className={reveal(s4.visible)}>
            <p
              className="mb-6 text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: ACCENT }}
            >
              Pricing
            </p>
            <h2 className="mb-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              {text.pricingTitle}
            </h2>
            <p
              className="mb-16 text-lg max-w-lg"
              style={{ color: "rgba(232,237,242,0.42)" }}
            >
              {text.pricingBody}
            </p>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-2xl">
              {/* Free */}
              <div
                className="rounded-2xl p-8"
                style={{
                  background: `${ACCENT_DIM}0.05)`,
                  border: `1px solid ${ACCENT_DIM}0.22)`,
                  boxShadow: `0 0 60px ${ACCENT_DIM}0.06)`,
                }}
              >
                <p
                  className="mb-6 text-[11px] font-bold uppercase tracking-[0.28em]"
                  style={{ color: ACCENT }}
                >
                  Free
                </p>
                <div className="mb-1 flex items-end gap-2">
                  <span className="text-6xl font-black text-white">$0</span>
                  <span className="mb-2 text-sm" style={{ color: "rgba(232,237,242,0.38)" }}>
                    /month
                  </span>
                </div>
                <p className="mb-8 text-sm" style={{ color: "rgba(232,237,242,0.32)" }}>
                  During early access
                </p>
                <ul className="mb-8 space-y-3">
                  {[
                    "AI model generation",
                    "Export STL & 3MF",
                    "Manual CAD tools",
                    "Unlimited sessions",
                  ].map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-3 text-sm"
                      style={{ color: "rgba(232,237,242,0.68)" }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ background: ACCENT }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onStartBuilding}
                  className="w-full rounded-xl py-3.5 text-sm font-bold transition-all hover:scale-[1.01]"
                  style={{ background: ACCENT, color: BG, boxShadow: `0 4px 24px ${ACCENT_DIM}0.4)` }}
                >
                  Start Building
                </button>
              </div>

              {/* Pro */}
              <div
                className="rounded-2xl p-8"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <p
                  className="mb-6 text-[11px] font-bold uppercase tracking-[0.28em]"
                  style={{ color: "rgba(232,237,242,0.25)" }}
                >
                  Pro
                </p>
                <div className="mb-1 flex items-end gap-2">
                  <span className="text-6xl font-black" style={{ color: "rgba(232,237,242,0.18)" }}>
                    $?
                  </span>
                  <span className="mb-2 text-sm" style={{ color: "rgba(232,237,242,0.18)" }}>
                    /month
                  </span>
                </div>
                <p className="mb-8 text-sm" style={{ color: "rgba(232,237,242,0.18)" }}>
                  Coming soon
                </p>
                <ul className="mb-8 space-y-3">
                  {["Everything in Free", "Priority AI processing", "STEP export", "Team workspaces"].map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-3 text-sm"
                      style={{ color: "rgba(232,237,242,0.22)" }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ background: "rgba(255,255,255,0.12)" }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="w-full rounded-xl py-3.5 text-sm font-bold cursor-not-allowed"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(232,237,242,0.18)",
                  }}
                >
                  Coming Soon
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 lg:px-8 pb-28">
          <div
            className="relative overflow-hidden rounded-3xl px-10 py-20 text-center"
            style={{
              background: `linear-gradient(135deg, ${ACCENT_DIM}0.08) 0%, ${ACCENT_DIM}0.02) 50%, rgba(10,30,40,0.6) 100%)`,
              border: `1px solid ${ACCENT_DIM}0.18)`,
            }}
          >
            {/* Background glow */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 50% -10%, ${ACCENT_DIM}0.14), transparent 65%)`,
              }}
            />
            <p
              className="relative mb-4 text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: ACCENT }}
            >
              Get started
            </p>
            <h2 className="relative mb-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              {text.cta.title}
            </h2>
            <p
              className="relative mb-10 text-lg mx-auto max-w-md"
              style={{ color: "rgba(232,237,242,0.48)" }}
            >
              {text.cta.body}
            </p>
            <button
              onClick={onStartBuilding}
              className="relative rounded-xl px-10 text-base font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                height: "52px",
                background: ACCENT,
                color: BG,
                boxShadow: `0 4px 50px ${ACCENT_DIM}0.35)`,
              }}
            >
              {text.cta.button}
            </button>
          </div>
        </section>

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
