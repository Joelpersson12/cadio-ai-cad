/**
 * Cadio Landing Page — spotlight hero, rörliga 3D-modeller, cyan färgsystem.
 * Matchar builderens #141618 / #2bb8dc palette.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loginCadioAccount, loginWithGoogle, isCadioAuthenticated, getCadioAccount } from "../utils/auth";
import { GoogleLogin } from "@react-oauth/google";
import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";
import ProfilePanel, { ProfileAvatar } from "./ProfilePanel";
import CheckoutModal from "./CheckoutModal";

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
    pricingTitle: "Simple, transparent pricing",
    pricingBody: "Start free with 3 downloads. Upgrade when you're ready to build more.",
    auth: { loginTitle: "Welcome back", signupTitle: "Create your account", email: "Email address", password: "Password", name: "Full name", continue: "Enter Workspace", hint: "Sign up for a free account" },
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
    pricingTitle: "Enkel, transparent prissättning",
    pricingBody: "Börja gratis med 3 nedladdningar. Uppgradera när du är redo att bygga mer.",
    auth: { loginTitle: "Välkommen tillbaka", signupTitle: "Skapa ditt konto", email: "E-postadress", password: "Lösenord", name: "Fullständigt namn", continue: "Gå till Workspace", hint: "Skapa ett gratis konto" },
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

// ─── CURRENCY PER LANGUAGE ──────────────────────────────────────────────────
const CURRENCY: Record<Language, { pro: string; unlimited: string; period: string; taxNote: string }> = {
  en: { pro: "$9.99", unlimited: "$24.99", period: "/mo", taxNote: "incl. tax" },
  sv: { pro: "99 kr", unlimited: "249 kr", period: "/mån", taxNote: "inkl. moms" },
  fr: { pro: "9,99 €", unlimited: "24,99 €", period: "/mois", taxNote: "TVA incluse" },
  de: { pro: "9,99 €", unlimited: "24,99 €", period: "/Monat", taxNote: "inkl. MwSt." },
  es: { pro: "9,99 €", unlimited: "24,99 €", period: "/mes", taxNote: "IVA incluido" },
  it: { pro: "9,99 €", unlimited: "24,99 €", period: "/mese", taxNote: "IVA inclusa" },
  pt: { pro: "9,99 €", unlimited: "24,99 €", period: "/mês", taxNote: "IVA incluído" },
};

// ─── ACCENT COLOR ───────────────────────────────────────────────────────────
const ACCENT = "#2bb8dc";
const ACCENT_DIM = "rgba(43,184,220,";
const BG = "#080c10";

// ─── 3D MODELS ──────────────────────────────────────────────────────────────
// Popular prints: Gyroscope (precision rings), Rocket, Twisted Vase, Flexi Coil

/** Gyroscope — nested precision rings, most popular mechanical print */
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

/** Rocket — classic maker print, clean engineering silhouette */
function Rocket() {
  const groupRef = useRef<THREE.Group>(null);

  const metalMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#c8d2dc",
    roughness: 0.18,
    metalness: 0.82,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
  }), []);

  const accentMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ACCENT,
    roughness: 0.12,
    metalness: 0.9,
    emissive: ACCENT,
    emissiveIntensity: 0.2,
  }), []);

  const noseConeGeo = useMemo(() => new THREE.ConeGeometry(0.42, 1.3, 28), []);
  const bodyGeo = useMemo(() => new THREE.CylinderGeometry(0.42, 0.42, 2.1, 28), []);
  const nozzleGeo = useMemo(() => new THREE.CylinderGeometry(0.38, 0.54, 0.52, 28), []);
  const windowRingGeo = useMemo(() => new THREE.TorusGeometry(0.16, 0.045, 10, 28), []);

  const finGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.72, -0.85);
    shape.lineTo(0, -0.85);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.22;
    groupRef.current.rotation.x = Math.sin(t * 0.28) * 0.12;
    groupRef.current.position.y = Math.sin(t * 0.5) * 0.1;
  });

  return (
    <group ref={groupRef} scale={0.92}>
      <mesh geometry={noseConeGeo} material={metalMat} position={[0, 2.05, 0]} castShadow />
      <mesh geometry={bodyGeo} material={metalMat} position={[0, 0.55, 0]} castShadow />
      <mesh geometry={nozzleGeo} material={metalMat} position={[0, -0.77, 0]} castShadow />
      <mesh position={[0, -0.77, 0]}>
        <cylinderGeometry args={[0.22, 0.32, 0.38, 20]} />
        <meshStandardMaterial color="#060a10" roughness={0.9} />
      </mesh>
      {/* Accent ring */}
      <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.43, 0.045, 10, 34]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.35} roughness={0.15} metalness={0.85} />
      </mesh>
      {/* Window */}
      <mesh geometry={windowRingGeo} material={accentMat} position={[0, 1.35, 0.40]} rotation={[Math.PI / 2, 0, 0]} castShadow />
      <mesh position={[0, 1.35, 0.43]}>
        <circleGeometry args={[0.12, 18]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.45} />
      </mesh>
      {/* 3 Fins */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          geometry={finGeo}
          material={metalMat}
          position={[
            Math.sin((i / 3) * Math.PI * 2) * 0.41,
            -0.52,
            Math.cos((i / 3) * Math.PI * 2) * 0.41,
          ]}
          rotation={[0, -(i / 3) * Math.PI * 2, 0]}
          castShadow
        />
      ))}
    </group>
  );
}

/** Twisted Vase — #1 most printed decorative item worldwide */
function TwistedVase() {
  const groupRef = useRef<THREE.Group>(null);

  const vaseMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#14202c",
    roughness: 0.06,
    metalness: 0.88,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    emissive: ACCENT,
    emissiveIntensity: 0.05,
  }), []);

  const vasePts = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const y = t * 3.4 - 0.5;
      let r: number;
      if (t < 0.08) r = 0.08 + t * 5.5;
      else if (t < 0.38) r = 0.52 + (t - 0.08) * 0.35;
      else if (t < 0.62) r = 0.62 - (t - 0.38) * 0.25;
      else if (t < 0.82) r = 0.56 + (t - 0.62) * 0.85;
      else r = 0.73 + (t - 0.82) * 1.5;
      r += Math.sin(t * Math.PI * 14) * 0.022;
      pts.push(new THREE.Vector2(Math.max(0, r), y));
    }
    return pts;
  }, []);

  const vaseGeo = useMemo(() => new THREE.LatheGeometry(vasePts, 72), [vasePts]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.24;
    groupRef.current.position.y = Math.sin(t * 0.48) * 0.09;
  });

  return (
    <group ref={groupRef} scale={0.82} position={[0, -0.45, 0]}>
      <mesh geometry={vaseGeo} material={vaseMat} castShadow />
      <mesh geometry={vaseGeo}>
        <meshBasicMaterial color={ACCENT} wireframe opacity={0.1} transparent />
      </mesh>
    </group>
  );
}

/** Flexi Coil — articulated segments, inspired by Flexi Rex / Flexi Dragon */
function FlexiCoil() {
  const groupRef = useRef<THREE.Group>(null);
  const segRefs = useRef<Array<THREE.Group | null>>([]);

  const bodyMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#0e1920",
    roughness: 0.22,
    metalness: 0.78,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
    emissive: "#091218",
    emissiveIntensity: 0.4,
  }), []);

  const jointMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ACCENT,
    roughness: 0.12,
    metalness: 0.92,
    emissive: ACCENT,
    emissiveIntensity: 0.18,
  }), []);

  const segGeo = useMemo(() => new THREE.SphereGeometry(1, 22, 16), []);
  const jointGeo = useMemo(() => new THREE.SphereGeometry(0.32, 14, 10), []);

  const SEGS = 11;
  const baseData = useMemo(() =>
    Array.from({ length: SEGS }, (_, i) => {
      const t = i / (SEGS - 1);
      const angle = t * Math.PI * 2.4 - 0.3;
      const radius = 0.48 + t * 0.32;
      return {
        x: Math.cos(angle) * radius,
        baseY: (1 - t) * 2.1 - 0.9,
        z: Math.sin(angle) * radius,
        scale: 0.44 - (i / SEGS) * 0.22,
      };
    }),
  []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.2;
    groupRef.current.position.y = Math.sin(t * 0.52) * 0.1;
    segRefs.current.forEach((seg: THREE.Group | null, i: number) => {
      if (seg) {
        const wave = Math.sin(t * 2.0 + i * 0.7) * 0.07;
        seg.position.y = baseData[i].baseY + wave;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {baseData.map((pos: { x: number; baseY: number; z: number; scale: number }, i: number) => (
        <group
          key={i}
          ref={(el: THREE.Group | null) => { segRefs.current[i] = el; }}
          position={[pos.x, pos.baseY, pos.z]}
          scale={pos.scale}
        >
          <mesh geometry={segGeo} material={bodyMat} castShadow />
          <mesh geometry={jointGeo} material={jointMat} castShadow />
        </group>
      ))}
    </group>
  );
}

/** ModelStage — wraps a model and drives spin-morph transition animation */
function ModelStage({
  children,
  isExiting,
  isEntering,
}: {
  children: ReactNode;
  isExiting?: boolean;
  isEntering?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const DURATION = 0.46;

  useEffect(() => {
    elapsed.current = 0;
  }, [isExiting, isEntering]);

  useFrame((_, delta) => {
    if (!ref.current || (!isExiting && !isEntering)) return;
    elapsed.current += delta;
    const t = Math.min(elapsed.current / DURATION, 1);

    if (isExiting) {
      ref.current.scale.setScalar(Math.max(0, 1 - t * t));
      ref.current.rotation.y += delta * (3 + t * 26);
    } else if (isEntering) {
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      ref.current.scale.setScalar(eased);
      ref.current.rotation.y += delta * (22 * (1 - t) + 0.4);
    }
  });

  return <group ref={ref}>{children}</group>;
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

function renderLandingModel(index: number) {
  if (index === 0) return <Gyroscope />;
  if (index === 1) return <Rocket />;
  if (index === 2) return <TwistedVase />;
  return <FlexiCoil />;
}

/** The full Three.js hero scene — spotlight from top, spin-morph transitions */
function HeroScene({
  displayModel,
  exitingModel,
  inTransition,
}: {
  displayModel: number;
  exitingModel: number | null;
  inTransition: boolean;
}) {
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
          toneMappingExposure: 1.3,
        }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 14, 26]} />

        {/* Key spotlight from top — hard cone, cinematic */}
        <spotLight
          position={[0, 8, 1]}
          angle={0.25}
          penumbra={0.8}
          intensity={16}
          color="#ffffff"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
        />
        {/* Cyan underlight — the glow pool */}
        <pointLight position={[0, -2.8, 0]} intensity={4} color={ACCENT} />
        {/* Rim from behind-left */}
        <pointLight position={[-5, 2, -5]} intensity={2} color="#083848" />
        {/* Subtle fill from front-right */}
        <pointLight position={[4, 4, 3]} intensity={0.6} color="#0a1e28" />
        {/* Very dim ambient — keep shadows dramatic */}
        <ambientLight intensity={0.06} color="#060e14" />

        <GroundGrid />

        {/* Exiting model — spin fast and shrink */}
        {exitingModel !== null && (
          <ModelStage key={`exit-${exitingModel}`} isExiting={true}>
            {renderLandingModel(exitingModel)}
          </ModelStage>
        )}

        {/* Current model — entering (if transition just started) or idle */}
        <ModelStage key={`show-${displayModel}`} isEntering={inTransition && exitingModel !== null}>
          {renderLandingModel(displayModel)}
        </ModelStage>

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
  mode, text, onClose, onStartBuilding, pendingPlan,
}: {
  mode: AuthMode;
  text: typeof copy.en;
  onClose: () => void;
  onStartBuilding: () => void;
  pendingPlan?: string | null;
}) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  if (!mode) return null;
  const isSignup = mode === "signup";
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
              {pendingPlan ? `Create account to upgrade` : isSignup ? text.auth.signupTitle : text.auth.loginTitle}
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
              if (isSignup && !agreedTerms) {
                setErr("You must agree to the Terms of Service to create an account.");
                return;
              }
              const fd = new FormData(e.currentTarget);
              setErr(""); setBusy(true);
              try {
                await loginCadioAccount({
                  name: String(fd.get("name") || ""),
                  email: String(fd.get("email") || ""),
                  password: String(fd.get("password") || ""),
                  agreed_terms: isSignup ? agreedTerms : undefined,
                });
                if (pendingPlan) {
                  onStartBuilding();
                } else {
                  onClose();
                }
              } catch (ex) {
                setErr(ex instanceof Error ? ex.message : "Could not sign in.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {isSignup && (
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
            {isSignup && (
              <label className="flex cursor-pointer items-start gap-3">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                  />
                  <div
                    className="h-5 w-5 rounded transition-all"
                    style={{
                      background: agreedTerms ? ACCENT : "rgba(255,255,255,0.06)",
                      border: `1.5px solid ${agreedTerms ? ACCENT : "rgba(255,255,255,0.18)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {agreedTerms && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="#050709" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs leading-5 text-white/40">
                  I agree to Cadio's{" "}
                  <a href="/terms" className="text-[#2bb8dc] hover:text-white underline transition-colors" onClick={(e) => e.stopPropagation()}>Terms of Service</a>
                  {" "}and{" "}
                  <a href="/privacy" className="text-[#2bb8dc] hover:text-white underline transition-colors" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>.
                  {" "}I confirm I am 13 years or older. If I subscribe, I understand the service starts immediately and I waive my right of withdrawal.
                </span>
              </label>
            )}
            {err && (
              <p className="rounded-xl px-4 py-2.5 text-xs text-red-300" style={{ background: "rgba(220,50,50,0.08)", border: "1px solid rgba(220,50,50,0.2)" }}>
                {err}
              </p>
            )}
            <button
              disabled={busy || (isSignup && !agreedTerms)}
              className="mt-1 h-12 w-full rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ background: ACCENT, color: "#050709", boxShadow: `0 4px 24px ${ACCENT_DIM}0.4)` }}
            >
              {busy ? "…" : pendingPlan ? "Create account & continue" : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/20">or</span>
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>
          <div className="mt-4 flex justify-center">
            <GoogleLogin
              onSuccess={async (res) => {
                if (!res.credential) return;
                setErr(""); setBusy(true);
                try {
                  await loginWithGoogle(res.credential);
                  if (pendingPlan) {
                    onStartBuilding();
                  } else {
                    onClose();
                  }
                } catch (ex) {
                  setErr(ex instanceof Error ? ex.message : "Google sign-in failed.");
                } finally {
                  setBusy(false);
                }
              }}
              onError={() => setErr("Google sign-in failed.")}
              theme="filled_black"
              size="large"
              width="340"
              text="signin_with"
              shape="rectangular"
            />
          </div>
          {!isSignup && (
            <p className="mt-4 text-center text-xs leading-relaxed text-white/25">
              No account?{" "}
              <button
                type="button"
                className="text-[#2bb8dc] hover:text-white transition-colors underline"
                onClick={() => { /* mode is controlled by parent */ }}
              >
                {text.auth.hint}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODEL SELECTOR LABELS ───────────────────────────────────────────────────

const MODELS = [
  { label: "Gyroscope", description: "Precision mechanical rings" },
  { label: "Rocket", description: "Classic maker print" },
  { label: "Twisted Vase", description: "#1 most printed decoration" },
  { label: "Flexi Coil", description: "Articulated flexi print" },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAuthed, setIsAuthed] = useState(isCadioAuthenticated);
  const [checkoutErr, setCheckoutErr] = useState("");

  useEffect(() => {
    const update = () => setIsAuthed(isCadioAuthenticated());
    window.addEventListener("cadio-auth-changed", update);
    return () => window.removeEventListener("cadio-auth-changed", update);
  }, []);
  const [displayModel, setDisplayModel] = useState(0);
  const [exitingModel, setExitingModel] = useState<number | null>(null);
  const [inTransition, setInTransition] = useState(false);
  const transitionLock = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const text = copy[language];

  const handlePlanClick = (plan: string) => {
    if (isCadioAuthenticated()) {
      setCheckoutErr("");
      setCheckoutPlan(plan);
    } else {
      setPendingPlan(plan);
      setAuthMode("signup");
    }
  };

  const switchModel = useCallback((next: number) => {
    if (transitionLock.current || next === displayModel) return;
    transitionLock.current = true;
    setExitingModel(displayModel);
    setDisplayModel(next);
    setInTransition(true);
    setTimeout(() => {
      setExitingModel(null);
      setInTransition(false);
      transitionLock.current = false;
    }, 520);
  }, [displayModel]);

  useEffect(() => {
    const id = setInterval(
      () => switchModel((displayModel + 1) % MODELS.length),
      5200,
    );
    return () => clearInterval(id);
  }, [displayModel, switchModel]);

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
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Language selector — hidden on mobile to avoid crowding */}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="h-8 sm:h-9 rounded-lg px-2 text-xs outline-none transition-colors"
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
              {isAuthed ? (
                <>
                  <ProfileAvatar size={32} onClick={() => setProfileOpen(true)} />
                  <button
                    onClick={onStartBuilding}
                    className="h-8 sm:h-9 rounded-lg px-3 sm:px-5 text-xs sm:text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97]"
                    style={{ background: ACCENT, color: BG, boxShadow: `0 2px 20px ${ACCENT_DIM}0.4)` }}
                  >
                    <span className="sm:hidden">Builder</span>
                    <span className="hidden sm:inline">Open Builder</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setAuthMode("login")}
                    className="h-8 sm:h-9 rounded-lg px-3 sm:px-4 text-xs sm:text-sm font-medium transition-all hover:text-white"
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
                    className="h-8 sm:h-9 rounded-lg px-3 sm:px-5 text-xs sm:text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97]"
                    style={{ background: ACCENT, color: BG, boxShadow: `0 2px 20px ${ACCENT_DIM}0.4)` }}
                  >
                    <span className="sm:hidden">Build</span>
                    <span className="hidden sm:inline">{text.nav.start}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="relative min-h-screen overflow-hidden">
          {/* 3D scene fills entire hero */}
          <HeroScene displayModel={displayModel} exitingModel={exitingModel} inTransition={inTransition} />

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
                onClick={() => switchModel(i)}
                title={m.label}
                className="transition-all duration-300 rounded-full"
                style={{
                  width: displayModel === i ? "28px" : "8px",
                  height: "8px",
                  background: displayModel === i ? ACCENT : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>

          {/* Active model label */}
          <div className="absolute bottom-10 right-8 z-10 hidden lg:flex flex-col items-end gap-1">
            <p className="text-xs font-semibold text-white">{MODELS[displayModel].label}</p>
            <p className="text-[10px]" style={{ color: "rgba(232,237,242,0.35)" }}>
              {MODELS[displayModel].description}
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

            {checkoutErr && (
              <div className="mb-6 rounded-xl px-4 py-3 text-sm text-red-300 text-center" style={{ background: "rgba(220,50,50,0.08)", border: "1px solid rgba(220,50,50,0.2)" }}>
                {checkoutErr}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 max-w-4xl">
              {/* Free */}
              <div
                className="rounded-2xl p-7"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.28em] text-white/40">Free</p>
                <div className="mb-1 flex items-end gap-2">
                  <span className="text-5xl font-black text-white">$0</span>
                  <span className="mb-1.5 text-sm text-white/30">{CURRENCY[language].period}</span>
                </div>
                <p className="mb-7 text-sm text-white/30">3 downloads to get started</p>
                <ul className="mb-7 space-y-2.5">
                  {["AI model generation", "All export formats", "Manual CAD tools", "3 downloads total"].map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-white/55">
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: ACCENT }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onStartBuilding()}
                  className="w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.01]"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,237,242,0.7)" }}
                >
                  Get Started
                </button>
              </div>

              {/* Pro — highlighted */}
              <div
                className="rounded-2xl p-7 relative"
                style={{
                  background: `${ACCENT_DIM}0.06)`,
                  border: `1.5px solid ${ACCENT_DIM}0.35)`,
                  boxShadow: `0 0 60px ${ACCENT_DIM}0.08)`,
                }}
              >
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: ACCENT, color: BG }}
                >
                  Popular
                </div>
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: ACCENT }}>Pro</p>
                <div className="mb-1 flex items-end gap-2">
                  <span className="text-4xl font-black text-white">{CURRENCY[language].pro}</span>
                  <span className="mb-1.5 text-sm text-white/40">{CURRENCY[language].period}</span>
                </div>
                <p className="mb-1 text-xs text-white/25">{CURRENCY[language].taxNote}</p>
                <p className="mb-6 text-sm text-white/40">20 downloads per month</p>
                <ul className="mb-7 space-y-2.5">
                  {["Everything in Free", "20 downloads / month", "Priority AI speed", "Email support"].map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(232,237,242,0.72)" }}>
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: ACCENT }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePlanClick("pro")}
                  className="w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.01]"
                  style={{ background: ACCENT, color: BG, boxShadow: `0 4px 24px ${ACCENT_DIM}0.4)` }}
                >
                  Start Pro
                </button>
              </div>

              {/* Unlimited */}
              <div
                className="rounded-2xl p-7"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.28em] text-white/40">Unlimited</p>
                <div className="mb-1 flex items-end gap-2">
                  <span className="text-4xl font-black text-white">{CURRENCY[language].unlimited}</span>
                  <span className="mb-1.5 text-sm text-white/30">{CURRENCY[language].period}</span>
                </div>
                <p className="mb-1 text-xs text-white/25">{CURRENCY[language].taxNote}</p>
                <p className="mb-6 text-sm text-white/30">Unlimited downloads</p>
                <ul className="mb-7 space-y-2.5">
                  {["Everything in Pro", "Unlimited downloads", "Early feature access", "Priority support"].map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-white/55">
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-white/30" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePlanClick("unlimited")}
                  className="w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.01]"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,237,242,0.7)" }}
                >
                  Go Unlimited
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

      <ProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onUpgrade={() => { setProfileOpen(false); setCheckoutPlan("pro"); }}
      />

      <AuthDialog
        mode={authMode}
        text={text}
        pendingPlan={pendingPlan}
        onClose={() => { setAuthMode(null); setPendingPlan(null); }}
        onStartBuilding={() => {
          setAuthMode(null);
          if (pendingPlan) {
            const plan = pendingPlan;
            setPendingPlan(null);
            setCheckoutPlan(plan);
          } else {
            onStartBuilding();
          }
        }}
      />

      {checkoutPlan && (
        <CheckoutModal
          plan={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
        />
      )}
    </>
  );
}
