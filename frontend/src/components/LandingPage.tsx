/**
 * Cadio Landing Page — spotlight hero, rörliga 3D-modeller, cyan färgsystem.
 * Matchar builderens #141618 / #2bb8dc palette.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loginCadioAccount, loginWithGoogle, sendPasswordReset, confirmPasswordReset, isCadioAuthenticated, getCadioAccount } from "../utils/auth";
import { GoogleLogin } from "@react-oauth/google";
import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";
import ProfilePanel, { ProfileAvatar } from "./ProfilePanel";
import CheckoutModal from "./CheckoutModal";

type Language = "en" | "sv" | "es" | "fr" | "it" | "de" | "pt";
type AuthMode = "login" | "signup" | "forgot" | null;

const languageOptions: Array<{ value: Language; label: string; native: string; flag: string }> = [
  { value: "en", label: "EN", native: "English", flag: "🇬🇧" },
  { value: "sv", label: "SV", native: "Svenska", flag: "🇸🇪" },
  { value: "es", label: "ES", native: "Español", flag: "🇪🇸" },
  { value: "fr", label: "FR", native: "Français", flag: "🇫🇷" },
  { value: "it", label: "IT", native: "Italiano", flag: "🇮🇹" },
  { value: "de", label: "DE", native: "Deutsch", flag: "🇩🇪" },
  { value: "pt", label: "PT", native: "Português", flag: "🇵🇹" },
];

const copy = {
  en: {
    nav: { product: "Product", workflow: "Workflow", pricing: "Pricing", login: "Sign In", start: "Start Building" },
    hero: { eyebrow: "Early Access Beta", headline1: "Generate.", headline2: "Design.", headline3: "Print.", body: "The AI CAD workspace that transforms ideas into precision geometry — ready for your 3D printer.", primary: "Start Building Free", secondary: "See Demo" },
    stats: [["No CAD skills needed", "Type what you want — get a real, editable part"], ["Tens of thousands of models", "Printables, Thingiverse & MakerWorld, searched together"], ["Print-ready exports", "STL · 3MF · STEP, sized for your printer"]],
    product: { label: "Product", title: "From a sentence to something you can hold", body: "Type an idea or pull in a real design from the big print libraries. Cadio hands you a dimensioned, editable part on the build plate — then lets you nudge edges, drill holes and resize it to fit, without ever opening traditional CAD." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Find, don't start over", body: "Search Printables, Thingiverse and MakerWorld in one box and drop a real model straight onto your plate — with its source and license shown." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Tweak it like clay", body: "Click an edge to round it, cut a slot, add mounting holes or scale it to fit — every change updates live in 3D." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Sized for your printer", body: "Cadio checks the model against your printer's build volume and warns you before you waste a print. Export STL, 3MF or STEP." },
    ],
    workflow: { label: "Workflow", title: "From idea to printed part in four steps", steps: [["Search", "Describe it, or grab an existing design from the print libraries."], ["Generate", "A real, dimensioned model lands on your plate in seconds."], ["Refine", "Round edges, cut holes, resize — make it truly yours."], ["Export", "Download a print-ready file matched to your printer and material."]] },
    pricingTitle: "Simple, transparent pricing",
    pricingBody: "Start free with 3 downloads. Upgrade when you're ready to build more.",
    auth: { loginTitle: "Welcome back", signupTitle: "Create your account", email: "Email address", password: "Password", name: "Full name", continue: "Enter Workspace", hint: "Sign up for a free account" },
    cta: { title: "Start building today", body: "Join engineers and makers who build faster with Cadio.", button: "Open Workspace" },
  },
  sv: {
    nav: { product: "Produkt", workflow: "Arbetsflöde", pricing: "Priser", login: "Logga in", start: "Börja Bygga" },
    hero: { eyebrow: "Early Access Beta", headline1: "Generera.", headline2: "Designa.", headline3: "Printa.", body: "AI CAD-workspace som omvandlar idéer till precisionsgometri — redo för din 3D-skrivare.", primary: "Börja Gratis", secondary: "Se Demo" },
    stats: [["Inga CAD-kunskaper krävs", "Skriv vad du vill ha — få en riktig, redigerbar del"], ["Tiotusentals modeller", "Printables, Thingiverse & MakerWorld i en sökning"], ["Printklart", "STL · 3MF · STEP, anpassat för din skrivare"]],
    product: { label: "Produkt", title: "Från en mening till något du kan hålla i", body: "Skriv en idé eller hämta in en riktig design från de stora print-biblioteken. Cadio ger dig en måttsatt, redigerbar del på byggplattan — sen kan du runda kanter, borra hål och ändra storlek så den passar, utan att öppna traditionell CAD." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Hitta — börja inte om", body: "Sök Printables, Thingiverse och MakerWorld i en ruta och släpp en riktig modell direkt på plattan — med källa och licens synlig." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Forma som lera", body: "Klicka på en kant för att runda den, skär ett spår, lägg till monteringshål eller skala den så den passar — allt uppdateras live i 3D." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Anpassat för din skrivare", body: "Cadio kollar modellen mot din skrivares byggvolym och varnar innan du slösar en utskrift. Exportera STL, 3MF eller STEP." },
    ],
    workflow: { label: "Arbetsflöde", title: "Från idé till utskriven del i fyra steg", steps: [["Sök", "Beskriv den, eller hämta en befintlig design från print-biblioteken."], ["Generera", "En riktig, måttsatt modell landar på plattan på sekunder."], ["Förfina", "Runda kanter, skär hål, ändra storlek — gör den till din."], ["Exportera", "Ladda ner en printklar fil anpassad efter skrivare och material."]] },
    pricingTitle: "Enkel, transparent prissättning",
    pricingBody: "Börja gratis med 3 nedladdningar. Uppgradera när du är redo att bygga mer.",
    auth: { loginTitle: "Välkommen tillbaka", signupTitle: "Skapa ditt konto", email: "E-postadress", password: "Lösenord", name: "Fullständigt namn", continue: "Gå till Workspace", hint: "Skapa ett gratis konto" },
    cta: { title: "Börja bygga idag", body: "Gå med ingenjörer och makers som bygger snabbare med Cadio.", button: "Öppna Workspace" },
  },
  es: {
    nav: { product: "Producto", workflow: "Flujo", pricing: "Precios", login: "Iniciar", start: "Empezar" },
    hero: { eyebrow: "Early Access Beta", headline1: "Genera.", headline2: "Diseña.", headline3: "Imprime.", body: "El workspace CAD con IA que convierte ideas en geometría de precisión — lista para tu impresora 3D.", primary: "Empezar gratis", secondary: "Ver demo" },
    stats: [["Sin conocimientos de CAD", "Escribe lo que quieres — recibe una pieza real y editable"], ["Decenas de miles de modelos", "Printables, Thingiverse y MakerWorld, en una sola búsqueda"], ["Exportación lista para imprimir", "STL · 3MF · STEP, ajustado a tu impresora"]],
    product: { label: "Producto", title: "De una frase a algo que puedes sostener", body: "Escribe una idea o trae un diseño real de las grandes bibliotecas de impresión. Cadio te da una pieza acotada y editable en la placa — y te deja mover aristas, hacer agujeros y cambiar el tamaño para que encaje, sin abrir CAD tradicional." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Encuentra, no empieces de cero", body: "Busca en Printables, Thingiverse y MakerWorld desde un solo cuadro y coloca un modelo real en tu placa — con su fuente y licencia a la vista." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Modifícalo como arcilla", body: "Haz clic en una arista para redondearla, corta una ranura, añade agujeros de montaje o ajústalo a tu medida — cada cambio se actualiza en vivo en 3D." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Ajustado a tu impresora", body: "Cadio compara el modelo con el volumen de tu impresora y te avisa antes de desperdiciar una impresión. Exporta STL, 3MF o STEP." },
    ],
    workflow: { label: "Flujo", title: "De la idea a la pieza impresa en cuatro pasos", steps: [["Busca", "Descríbelo o toma un diseño existente de las bibliotecas de impresión."], ["Genera", "Un modelo real y acotado llega a tu placa en segundos."], ["Refina", "Redondea aristas, corta agujeros, cambia el tamaño — hazlo tuyo."], ["Exporta", "Descarga un archivo listo para imprimir, ajustado a tu impresora y material."]] },
    pricingTitle: "Precios simples y transparentes",
    pricingBody: "Empieza gratis con 3 descargas. Mejora cuando quieras construir más.",
    auth: { loginTitle: "Bienvenido de nuevo", signupTitle: "Empieza a construir hoy", email: "Correo electrónico", password: "Contraseña", name: "Nombre completo", continue: "Entrar al Workspace", hint: "Al continuar aceptas nuestros términos y política de privacidad." },
    cta: { title: "Empieza a construir hoy", body: "Únete a ingenieros y makers que construyen más rápido.", button: "Abrir Workspace" },
  },
  fr: {
    nav: { product: "Produit", workflow: "Flux", pricing: "Tarifs", login: "Connexion", start: "Commencer" },
    hero: { eyebrow: "Early Access Beta", headline1: "Générez.", headline2: "Dessinez.", headline3: "Imprimez.", body: "L'espace de travail CAO IA qui transforme vos idées en géométrie de précision — prête pour votre imprimante 3D.", primary: "Commencer gratuitement", secondary: "Voir la démo" },
    stats: [["Aucune compétence CAO requise", "Décrivez ce que vous voulez — obtenez une pièce réelle et modifiable"], ["Des dizaines de milliers de modèles", "Printables, Thingiverse et MakerWorld, en une seule recherche"], ["Exports prêts à imprimer", "STL · 3MF · STEP, dimensionnés pour votre imprimante"]],
    product: { label: "Produit", title: "D'une phrase à un objet que vous pouvez tenir", body: "Décrivez une idée ou importez un vrai modèle des grandes bibliothèques d'impression. Cadio vous remet une pièce cotée et modifiable sur le plateau — puis vous laisse ajuster les arêtes, percer des trous et la redimensionner, sans jamais ouvrir un logiciel CAO classique." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Trouvez, ne repartez pas de zéro", body: "Cherchez dans Printables, Thingiverse et MakerWorld depuis un seul champ et posez un vrai modèle sur votre plateau — sa source et sa licence affichées." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Modelez-le comme de l'argile", body: "Cliquez sur une arête pour l'arrondir, taillez une fente, ajoutez des trous de fixation ou redimensionnez — chaque changement se met à jour en direct en 3D." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Dimensionné pour votre imprimante", body: "Cadio compare le modèle au volume d'impression de votre machine et vous prévient avant de gâcher une impression. Exportez en STL, 3MF ou STEP." },
    ],
    workflow: { label: "Flux", title: "De l'idée à la pièce imprimée en quatre étapes", steps: [["Cherchez", "Décrivez-le ou récupérez un modèle existant des bibliothèques d'impression."], ["Générez", "Un vrai modèle coté arrive sur votre plateau en quelques secondes."], ["Affinez", "Arrondissez les arêtes, percez des trous, redimensionnez — rendez-le unique."], ["Exportez", "Téléchargez un fichier prêt à imprimer, adapté à votre imprimante et matériau."]] },
    pricingTitle: "Une tarification simple et transparente",
    pricingBody: "Commencez gratuitement avec 3 téléchargements. Passez à l'offre supérieure quand vous voulez créer plus.",
    auth: { loginTitle: "Bon retour", signupTitle: "Commencez à construire", email: "Adresse e-mail", password: "Mot de passe", name: "Nom complet", continue: "Accéder au Workspace", hint: "En continuant, vous acceptez nos conditions et notre politique de confidentialité." },
    cta: { title: "Commencez à construire", body: "Rejoignez des ingénieurs et des makers qui construisent plus vite.", button: "Ouvrir le Workspace" },
  },
  it: {
    nav: { product: "Prodotto", workflow: "Flusso", pricing: "Prezzi", login: "Accedi", start: "Inizia" },
    hero: { eyebrow: "Early Access Beta", headline1: "Genera.", headline2: "Progetta.", headline3: "Stampa.", body: "Lo spazio di lavoro CAD con IA che trasforma le idee in geometria di precisione — pronta per la tua stampante 3D.", primary: "Inizia gratis", secondary: "Guarda la demo" },
    stats: [["Nessuna competenza CAD", "Scrivi cosa vuoi — ottieni una parte reale e modificabile"], ["Decine di migliaia di modelli", "Printables, Thingiverse e MakerWorld, in un'unica ricerca"], ["Export pronti per la stampa", "STL · 3MF · STEP, dimensionati per la tua stampante"]],
    product: { label: "Prodotto", title: "Da una frase a qualcosa che puoi tenere in mano", body: "Scrivi un'idea o importa un modello reale dalle grandi librerie di stampa. Cadio ti consegna una parte quotata e modificabile sul piatto — poi ti lascia spostare i bordi, fare fori e ridimensionarla, senza mai aprire un CAD tradizionale." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Trova, non ricominciare", body: "Cerca in Printables, Thingiverse e MakerWorld da un'unica casella e metti un modello reale sul piatto — con fonte e licenza in vista." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Modellalo come argilla", body: "Clicca un bordo per arrotondarlo, taglia una scanalatura, aggiungi fori di montaggio o ridimensiona — ogni modifica si aggiorna dal vivo in 3D." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Dimensionato per la tua stampante", body: "Cadio confronta il modello con il volume di stampa della tua macchina e ti avvisa prima di sprecare una stampa. Esporta STL, 3MF o STEP." },
    ],
    workflow: { label: "Flusso", title: "Dall'idea alla parte stampata in quattro passi", steps: [["Cerca", "Descrivilo o prendi un modello esistente dalle librerie di stampa."], ["Genera", "Un modello reale e quotato arriva sul piatto in pochi secondi."], ["Affina", "Arrotonda i bordi, taglia fori, ridimensiona — rendilo tuo."], ["Esporta", "Scarica un file pronto per la stampa, adatto alla tua stampante e materiale."]] },
    pricingTitle: "Prezzi semplici e trasparenti",
    pricingBody: "Inizia gratis con 3 download. Passa a un piano superiore quando vuoi costruire di più.",
    auth: { loginTitle: "Bentornato", signupTitle: "Inizia a costruire oggi", email: "Indirizzo email", password: "Password", name: "Nome completo", continue: "Accedi al Workspace", hint: "Continuando accetti i nostri termini e la nostra politica sulla privacy." },
    cta: { title: "Inizia a costruire oggi", body: "Unisciti a ingegneri e maker che costruiscono più velocemente.", button: "Apri il Workspace" },
  },
  de: {
    nav: { product: "Produkt", workflow: "Workflow", pricing: "Preise", login: "Anmelden", start: "Starten" },
    hero: { eyebrow: "Early Access Beta", headline1: "Generieren.", headline2: "Designen.", headline3: "Drucken.", body: "Der KI-CAD-Workspace, der Ideen in Präzisionsgeometrie verwandelt — bereit für deinen 3D-Drucker.", primary: "Kostenlos starten", secondary: "Demo ansehen" },
    stats: [["Keine CAD-Kenntnisse nötig", "Schreib, was du willst — bekomm ein echtes, bearbeitbares Teil"], ["Zehntausende Modelle", "Printables, Thingiverse & MakerWorld in einer Suche"], ["Druckfertige Exporte", "STL · 3MF · STEP, passend für deinen Drucker"]],
    product: { label: "Produkt", title: "Von einem Satz zu etwas, das du in der Hand hältst", body: "Schreib eine Idee oder hol dir ein echtes Design aus den großen Druck-Bibliotheken. Cadio gibt dir ein bemaßtes, bearbeitbares Teil auf der Druckplatte — dann kannst du Kanten anpassen, Löcher bohren und die Größe ändern, ganz ohne klassisches CAD." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Finden statt neu anfangen", body: "Durchsuche Printables, Thingiverse und MakerWorld in einem Feld und setz ein echtes Modell direkt auf die Platte — mit Quelle und Lizenz sichtbar." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Form es wie Ton", body: "Klick auf eine Kante zum Abrunden, schneide eine Nut, füge Montagelöcher hinzu oder skaliere es passend — jede Änderung aktualisiert sich live in 3D." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Passend für deinen Drucker", body: "Cadio prüft das Modell gegen das Bauvolumen deines Druckers und warnt dich, bevor du einen Druck verschwendest. Exportiere STL, 3MF oder STEP." },
    ],
    workflow: { label: "Workflow", title: "Von der Idee zum gedruckten Teil in vier Schritten", steps: [["Suchen", "Beschreib es oder hol ein bestehendes Design aus den Druck-Bibliotheken."], ["Generieren", "Ein echtes, bemaßtes Modell landet in Sekunden auf deiner Platte."], ["Verfeinern", "Kanten runden, Löcher schneiden, skalieren — mach es zu deinem."], ["Exportieren", "Lade eine druckfertige Datei, abgestimmt auf Drucker und Material."]] },
    pricingTitle: "Einfache, transparente Preise",
    pricingBody: "Starte gratis mit 3 Downloads. Upgrade, wenn du mehr bauen willst.",
    auth: { loginTitle: "Willkommen zurück", signupTitle: "Beginne heute zu bauen", email: "E-Mail-Adresse", password: "Passwort", name: "Vollständiger Name", continue: "Zum Workspace", hint: "Mit der Fortsetzung stimmst du unseren Bedingungen zu." },
    cta: { title: "Beginne heute zu bauen", body: "Schließe dich Ingenieuren und Makern an.", button: "Workspace öffnen" },
  },
  pt: {
    nav: { product: "Produto", workflow: "Fluxo", pricing: "Preços", login: "Entrar", start: "Começar" },
    hero: { eyebrow: "Early Access Beta", headline1: "Gere.", headline2: "Projete.", headline3: "Imprima.", body: "O workspace CAD com IA que transforma ideias em geometria de precisão — pronta para a sua impressora 3D.", primary: "Começar grátis", secondary: "Ver demo" },
    stats: [["Sem conhecimentos de CAD", "Escreva o que quer — receba uma peça real e editável"], ["Dezenas de milhares de modelos", "Printables, Thingiverse e MakerWorld numa só busca"], ["Exportações prontas para imprimir", "STL · 3MF · STEP, dimensionado para a sua impressora"]],
    product: { label: "Produto", title: "De uma frase a algo que você pode segurar", body: "Escreva uma ideia ou traga um design real das grandes bibliotecas de impressão. A Cadio entrega uma peça cotada e editável na placa — e deixa você mover arestas, fazer furos e redimensionar para encaixar, sem nunca abrir um CAD tradicional." },
    cards: [
      { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", title: "Encontre, não comece do zero", body: "Busque no Printables, Thingiverse e MakerWorld numa só caixa e coloque um modelo real direto na placa — com fonte e licença à vista." },
      { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", title: "Molde como argila", body: "Clique numa aresta para arredondá-la, corte um rasgo, adicione furos de montagem ou ajuste o tamanho — cada mudança atualiza ao vivo em 3D." },
      { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", title: "Dimensionado para a sua impressora", body: "A Cadio compara o modelo com o volume de impressão da sua máquina e avisa antes de você desperdiçar uma impressão. Exporte STL, 3MF ou STEP." },
    ],
    workflow: { label: "Fluxo", title: "Da ideia à peça impressa em quatro etapas", steps: [["Busque", "Descreva ou pegue um design existente das bibliotecas de impressão."], ["Gere", "Um modelo real e cotado chega à sua placa em segundos."], ["Refine", "Arredonde arestas, corte furos, redimensione — faça dele o seu."], ["Exporte", "Baixe um arquivo pronto para impressão, ajustado à sua impressora e material."]] },
    pricingTitle: "Preços simples e transparentes",
    pricingBody: "Comece grátis com 3 downloads. Faça upgrade quando quiser construir mais.",
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

// ─── LANGUAGE SWITCHER ──────────────────────────────────────────────────────
// Custom dark dropdown — the native <select> rendered its option list with the
// OS's white system styling, which looked broken on the dark theme.
function LanguageSwitcher({
  language,
  onChange,
}: {
  language: Language;
  onChange: (lang: Language) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = languageOptions.find((o) => o.value === language) ?? languageOptions[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:h-9"
        style={{
          background: open ? "rgba(43,184,220,0.12)" : "rgba(43,184,220,0.06)",
          border: "1px solid rgba(43,184,220,0.18)",
          color: "rgba(232,237,242,0.82)",
        }}
      >
        <svg className="h-3.5 w-3.5 text-cadio-accent/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5-2.5 3.5-6 3.5-9S14.5 5.5 12 3m0 18c-2.5-2.5-3.5-6-3.5-9S9.5 5.5 12 3M3.5 12h17" />
        </svg>
        <span aria-hidden className="text-[13px] leading-none">{current.flag}</span>
        <span className="leading-none">{current.label}</span>
        <svg
          className={`h-3 w-3 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl py-1 shadow-2xl"
          style={{
            background: "rgba(13,19,24,0.98)",
            border: "1px solid rgba(43,184,220,0.18)",
            backdropFilter: "blur(20px)",
          }}
        >
          {languageOptions.map((o) => {
            const active = o.value === language;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors"
                style={{
                  background: active ? "rgba(43,184,220,0.12)" : "transparent",
                  color: active ? "#8fe3f6" : "rgba(232,237,242,0.78)",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span aria-hidden className="text-base leading-none">{o.flag}</span>
                <span className="flex-1 font-medium">{o.native}</span>
                {active && (
                  <svg className="h-4 w-4 text-cadio-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

// ── Real, popular 3D-print showcase models ──────────────────────────────────
// Procedural stand-ins for genuinely useful prints, recognizable in silhouette
// and matching the dramatic studio-lit hero stage.
function printMat(color: string, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.5, metalness: 0.0, clearcoat: 0.3, clearcoatRoughness: 0.45, ...opts,
  });
}

function useSpin(speed = 0.3, baseY = 0, floatAmp = 0.08) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.rotation.y = t * speed;
    ref.current.position.y = baseY + Math.sin(t * 0.5) * floatAmp;
  });
  return ref;
}

/** Milwaukee M18 battery wall mount — red plate with a dovetail rail. */
function MilwaukeeMount() {
  const ref = useSpin(0.32, 0);
  const red = useMemo(() => printMat("#c1271d", { roughness: 0.42, clearcoat: 0.45 }), []);
  const dark = useMemo(() => printMat("#1c1e21", { clearcoat: 0.18 }), []);
  return (
    <group ref={ref} scale={1.15} rotation={[0.12, 0, 0]}>
      <mesh material={red} castShadow position={[0, 0, -0.18]}><boxGeometry args={[2.4, 2.0, 0.2]} /></mesh>
      <mesh material={red} castShadow position={[0, 0.1, 0.18]}><boxGeometry args={[0.95, 1.7, 0.5]} /></mesh>
      <mesh material={red} castShadow position={[-0.62, 0.1, 0.12]} rotation={[0, 0, 0.18]}><boxGeometry args={[0.16, 1.7, 0.42]} /></mesh>
      <mesh material={red} castShadow position={[0.62, 0.1, 0.12]} rotation={[0, 0, -0.18]}><boxGeometry args={[0.16, 1.7, 0.42]} /></mesh>
      <mesh material={dark} castShadow position={[0, 0.95, 0.2]}><boxGeometry args={[0.7, 0.18, 0.42]} /></mesh>
      <mesh material={dark} position={[0, 0.72, -0.04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.12, 0.12, 0.5, 20]} /></mesh>
      <mesh material={dark} position={[0, -0.72, -0.04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.12, 0.12, 0.5, 20]} /></mesh>
    </group>
  );
}

/** IKEA Skådis bin — a popular pegboard storage cup with hooks. */
function SkadisBin() {
  const ref = useSpin(0.34, -0.1);
  const white = useMemo(() => printMat("#e9edf2", { clearcoat: 0.22 }), []);
  const w = 1.8, h = 1.1, d = 1.05, th = 0.1;
  return (
    <group ref={ref} scale={1.05} rotation={[0.12, 0, 0]}>
      <mesh material={white} castShadow position={[0, -h / 2, 0]}><boxGeometry args={[w, th, d]} /></mesh>
      <mesh material={white} castShadow position={[0, -h / 4, d / 2]}><boxGeometry args={[w, h / 2, th]} /></mesh>
      <mesh material={white} castShadow position={[-w / 2, -h / 4, 0]}><boxGeometry args={[th, h / 2, d]} /></mesh>
      <mesh material={white} castShadow position={[w / 2, -h / 4, 0]}><boxGeometry args={[th, h / 2, d]} /></mesh>
      <mesh material={white} castShadow position={[0, h * 0.05, -d / 2]}><boxGeometry args={[w, h * 1.1, th]} /></mesh>
      <mesh material={white} castShadow position={[-0.5, h * 0.55, -d / 2 - 0.12]}><boxGeometry args={[0.2, 0.2, 0.34]} /></mesh>
      <mesh material={white} castShadow position={[0.5, h * 0.55, -d / 2 - 0.12]}><boxGeometry args={[0.2, 0.2, 0.34]} /></mesh>
    </group>
  );
}

/** Filament spool holder — a spool that spins on a wall bracket. */
function FilamentHolder() {
  const ref = useSpin(0.26, 0);
  const spoolRef = useRef<THREE.Group>(null);
  const gray = useMemo(() => printMat("#cfd4da"), []);
  const cyanMat = useMemo(() => printMat(ACCENT, { roughness: 0.35, clearcoat: 0.5, emissive: ACCENT, emissiveIntensity: 0.08 }), []);
  useFrame(({ clock }) => { if (spoolRef.current) spoolRef.current.rotation.x = clock.elapsedTime * 0.8; });
  return (
    <group ref={ref} scale={1.0} rotation={[0.1, 0, 0]}>
      <mesh material={gray} castShadow position={[-1.4, 0, 0]}><boxGeometry args={[0.3, 2.2, 1.0]} /></mesh>
      <mesh material={gray} castShadow position={[-0.9, -0.7, 0]}><boxGeometry args={[1.2, 0.3, 0.5]} /></mesh>
      <mesh material={gray} castShadow position={[0.1, -0.2, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.1, 0.1, 2.4, 20]} /></mesh>
      <group ref={spoolRef} position={[0.1, -0.2, 0]}>
        <mesh material={gray} castShadow position={[-0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[1.0, 1.0, 0.12, 40]} /></mesh>
        <mesh material={gray} castShadow position={[0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[1.0, 1.0, 0.12, 40]} /></mesh>
        <mesh material={gray} castShadow rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.42, 0.42, 0.84, 28]} /></mesh>
        <mesh material={cyanMat} castShadow rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.72, 0.2, 16, 40]} /></mesh>
      </group>
    </group>
  );
}

/** 3D-printer bed scraper — colored handle with a thin angled blade. */
function BedScraper() {
  const ref = useSpin(0.34, 0);
  const handle = useMemo(() => printMat(ACCENT, { roughness: 0.4, clearcoat: 0.5 }), []);
  const steel = useMemo(() => printMat("#c7ccd2", { metalness: 0.3, roughness: 0.3 }), []);
  return (
    <group ref={ref} scale={1.1} rotation={[0.25, 0, 0]}>
      <mesh material={handle} castShadow position={[-0.7, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.28, 0.28, 1.5, 28]} /></mesh>
      <mesh material={handle} castShadow position={[-1.45, 0, 0]}><sphereGeometry args={[0.28, 24, 24]} /></mesh>
      <mesh material={steel} castShadow position={[0.15, 0, 0]}><boxGeometry args={[0.5, 0.18, 0.5]} /></mesh>
      <mesh material={steel} castShadow position={[1.0, -0.18, 0]} rotation={[0, 0, -0.35]}><boxGeometry args={[1.3, 0.05, 0.95]} /></mesh>
    </group>
  );
}

/** Headset stand — base, post and a curved yoke that cradles the headband. */
function HeadsetStand() {
  const ref = useSpin(0.32, -0.2);
  const mat = useMemo(() => printMat("#d3d8de"), []);
  const yokeGeo = useMemo(() => new THREE.TorusGeometry(0.55, 0.16, 20, 48, Math.PI), []);
  return (
    <group ref={ref} scale={1.0}>
      <mesh material={mat} castShadow position={[0, -1.4, 0]}><cylinderGeometry args={[0.95, 1.05, 0.22, 48]} /></mesh>
      <mesh material={mat} castShadow position={[0, -0.2, 0]}><cylinderGeometry args={[0.16, 0.18, 2.4, 28]} /></mesh>
      <mesh material={mat} castShadow geometry={yokeGeo} position={[0, 1.05, 0]} />
    </group>
  );
}

/** Pegboard tool holder — a rack holding screwdrivers. */
function PegboardHolder() {
  const ref = useSpin(0.3, 0);
  const mat = useMemo(() => printMat("#cdd2d8"), []);
  const hole = useMemo(() => printMat("#15171a", { clearcoat: 0.1 }), []);
  const toolMetal = useMemo(() => printMat("#9aa3ad", { metalness: 0.4, roughness: 0.3 }), []);
  const grip = useMemo(() => printMat(ACCENT, { roughness: 0.4, clearcoat: 0.5 }), []);
  const xs = [-0.7, 0, 0.7];
  return (
    <group ref={ref} scale={1.0} rotation={[0.12, 0, 0]}>
      <mesh material={mat} castShadow position={[0, 0.2, -0.4]}><boxGeometry args={[2.4, 1.7, 0.14]} /></mesh>
      <mesh material={mat} castShadow position={[-0.5, 0.95, -0.55]}><boxGeometry args={[0.2, 0.2, 0.34]} /></mesh>
      <mesh material={mat} castShadow position={[0.5, 0.95, -0.55]}><boxGeometry args={[0.2, 0.2, 0.34]} /></mesh>
      <mesh material={mat} castShadow position={[0, -0.5, 0]}><boxGeometry args={[2.4, 0.5, 0.8]} /></mesh>
      {xs.map((x, i) => (
        <group key={i} position={[x, -0.25, 0.1]}>
          <mesh material={hole}><cylinderGeometry args={[0.16, 0.16, 0.5, 20]} /></mesh>
          <mesh material={toolMetal} castShadow position={[0, 0.55, 0]}><cylinderGeometry args={[0.07, 0.07, 1.0, 16]} /></mesh>
          <mesh material={grip} castShadow position={[0, 1.25, 0]}><cylinderGeometry args={[0.17, 0.13, 0.5, 20]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function renderLandingModel(index: number) {
  switch (index) {
    case 0: return <MilwaukeeMount />;
    case 1: return <SkadisBin />;
    case 2: return <FilamentHolder />;
    case 3: return <BedScraper />;
    case 4: return <HeadsetStand />;
    case 5: return <PegboardHolder />;
    case 6: return <Gyroscope />;
    case 7: return <Rocket />;
    case 8: return <TwistedVase />;
    default: return <FlexiCoil />;
  }
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

// Continuous scroll-driven motion: the element drifts upward as it travels
// through the viewport, so cards visibly "move" while you scroll. Different
// `strength` values on neighbouring elements create a parallax stagger.
function useScrollMotion(strength = 48) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(strength);
  useEffect(() => {
    const scroller = document.getElementById("landing-scroll");
    const el = ref.current;
    if (!scroller || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOffset(0); return; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 while still low in the viewport → 1 once it reaches the upper third.
      const center = r.top + r.height / 2;
      const p = Math.min(1, Math.max(0, (vh - center) / (vh * 0.7)));
      setOffset(strength * (1 - p));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength]);
  return { ref, style: { transform: `translate3d(0, ${offset}px, 0)`, transition: "transform 0.12s linear" } as CSSProperties };
}

// ─── AUTH DIALOG ─────────────────────────────────────────────────────────────

function AuthDialog({
  mode, text, onClose, onStartBuilding, onSwitchToSignup, onForgotPassword, onBackToLogin, pendingPlan,
}: {
  mode: AuthMode;
  text: typeof copy.en;
  onClose: () => void;
  onStartBuilding: () => void;
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
  onBackToLogin: () => void;
  pendingPlan?: string | null;
}) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  if (!mode) return null;
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  const dialogTitle = isForgot
    ? "Reset your password"
    : pendingPlan
    ? "Create account to upgrade"
    : isSignup
    ? text.auth.signupTitle
    : text.auth.loginTitle;

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
            <h2 className="text-xl font-semibold text-white">{dialogTitle}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/30 transition-colors hover:text-white hover:bg-white/8"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Forgot password view ── */}
          {isForgot ? (
            forgotSent ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-white/60 leading-relaxed">
                  If that email has an account, we've sent a reset link. Check your inbox (and spam folder).
                </p>
                <button
                  type="button"
                  className="mt-2 h-12 w-full rounded-xl text-sm font-bold transition-all"
                  style={{ background: ACCENT, color: "#050709", boxShadow: `0 4px 24px ${ACCENT_DIM}0.4)` }}
                  onClick={onBackToLogin}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  setErr(""); setBusy(true);
                  try {
                    await sendPasswordReset(String(fd.get("email") || ""));
                    setForgotSent(true);
                  } catch {
                    // Always show success to prevent email enumeration
                    setForgotSent(true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <p className="text-sm text-white/50 leading-relaxed -mt-2">
                  Enter your email and we'll send you a reset link.
                </p>
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                    {text.auth.email}
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    autoFocus
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
                  {busy ? "…" : "Send reset link"}
                </button>
                <p className="text-center text-xs text-white/25">
                  <button type="button" className="text-[#2bb8dc] hover:text-white transition-colors underline" onClick={onBackToLogin}>
                    Back to sign in
                  </button>
                </p>
              </form>
            )
          ) : (
            /* ── Login / Signup view ── */
            <>
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
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                      {text.auth.password}
                    </label>
                    {!isSignup && (
                      <button
                        type="button"
                        className="text-[11px] text-white/30 hover:text-[#2bb8dc] transition-colors"
                        onClick={onForgotPassword}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
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
                    onClick={onSwitchToSignup}
                  >
                    Sign up for free
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResetPasswordDialog({
  resetToken,
  onClose,
  onDone,
}: {
  resetToken: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)" }}
    >
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{
            background: "#0d1318",
            border: `1px solid rgba(43,184,220,0.2)`,
            boxShadow: `0 0 60px rgba(43,184,220,0.08)`,
          }}
        >
          <h2 className="mb-6 text-xl font-semibold text-white">Choose a new password</h2>
          {done ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-white/60 leading-relaxed">
                Your password has been updated and you're now signed in.
              </p>
              <button
                className="mt-2 h-12 w-full rounded-xl text-sm font-bold transition-all"
                style={{ background: "#2bb8dc", color: "#050709", boxShadow: "0 4px 24px rgba(43,184,220,0.4)" }}
                onClick={onDone}
              >
                Continue to Cadio
              </button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const pw = String(fd.get("password") || "");
                const pw2 = String(fd.get("password2") || "");
                if (pw !== pw2) { setErr("Passwords don't match"); return; }
                setErr(""); setBusy(true);
                try {
                  await confirmPasswordReset(resetToken, pw);
                  setDone(true);
                } catch (ex) {
                  setErr(ex instanceof Error ? ex.message : "Could not reset password.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  New password
                </label>
                <input
                  name="password"
                  type="password"
                  minLength={4}
                  required
                  autoFocus
                  className="h-11 w-full rounded-xl px-4 text-sm text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  Confirm new password
                </label>
                <input
                  name="password2"
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
                style={{ background: "#2bb8dc", color: "#050709", boxShadow: "0 4px 24px rgba(43,184,220,0.4)" }}
              >
                {busy ? "…" : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODEL SELECTOR LABELS ───────────────────────────────────────────────────

const MODELS = [
  { label: "Milwaukee M18 Holder", description: "Tool battery wall mount" },
  { label: "IKEA Skådis Bin", description: "Pegboard storage cup" },
  { label: "Filament Spool Holder", description: "Wall-mount spool roller" },
  { label: "Bed Scraper", description: "3D-print removal tool" },
  { label: "Headset Stand", description: "Desktop headphone stand" },
  { label: "Pegboard Tool Holder", description: "Screwdriver rack" },
  { label: "Gyroscope", description: "Precision mechanical rings" },
  { label: "Rocket", description: "Classic maker print" },
  { label: "Twisted Vase", description: "#1 most printed decoration" },
  { label: "Flexi Coil", description: "Articulated flexi print" },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function LandingPage({ onStartBuilding, onSeeDemo }: { onStartBuilding: () => void; onSeeDemo?: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAuthed, setIsAuthed] = useState(isCadioAuthenticated);
  const [checkoutErr, setCheckoutErr] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("reset_token");
    if (tok) {
      setResetToken(tok);
      // Clean the token from URL without triggering a reload
      const url = new URL(window.location.href);
      url.searchParams.delete("reset_token");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

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
  // Staggered scroll-parallax for the pricing cards so they drift as you scroll.
  const pm0 = useScrollMotion(70);
  const pm1 = useScrollMotion(34);
  const pm2 = useScrollMotion(90);

  // Cursor-reactive spotlight over the hero (desktop pointer only).
  const [spot, setSpot] = useState({ x: 50, y: 42, active: false });
  const onHeroMove = (e: React.MouseEvent<HTMLElement>) => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    setSpot({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
      active: true,
    });
  };

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
        @keyframes orb-a { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(6%, 4%) scale(1.12) } }
        @keyframes orb-b { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-5%, -6%) scale(1.08) } }
        @keyframes orb-c { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(4%, -4%) scale(1.15) } }
        @keyframes grad-x { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
        .accent-gradient {
          background: linear-gradient(100deg, #2bb8dc 0%, #6fe6ff 25%, #7a5af8 55%, #2bb8dc 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
          animation: grad-x 7s ease-in-out infinite;
        }
      `}</style>

      <div
        id="landing-scroll"
        ref={scrollRef}
        className="relative isolate h-full overflow-y-auto"
        style={{ background: BG, color: "#e8edf2", fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {/* Ambient gradient glow — sits above the base background but behind all
            content (isolate + negative z). Gives the page the deep, lit-from-
            within feel without touching the hero's own 3D stage. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div
            className="absolute -left-[10%] top-[20%] h-[55vh] w-[55vh] rounded-full opacity-50"
            style={{ background: "radial-gradient(circle, rgba(43,184,220,0.22), transparent 70%)", filter: "blur(70px)", animation: "orb-a 18s ease-in-out infinite" }}
          />
          <div
            className="absolute right-[-8%] top-[55%] h-[60vh] w-[60vh] rounded-full opacity-40"
            style={{ background: "radial-gradient(circle, rgba(122,90,248,0.18), transparent 70%)", filter: "blur(80px)", animation: "orb-b 22s ease-in-out infinite" }}
          />
          <div
            className="absolute left-[35%] bottom-[2%] h-[50vh] w-[50vh] rounded-full opacity-35"
            style={{ background: "radial-gradient(circle, rgba(43,184,220,0.16), transparent 70%)", filter: "blur(75px)", animation: "orb-c 26s ease-in-out infinite" }}
          />
        </div>

        {/* ── NAVBAR — floating glass pill ──────────────────────────────── */}
        <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 transition-all duration-500">
          <div
            className="flex h-14 w-full max-w-5xl items-center justify-between rounded-2xl px-4 pl-5 transition-all duration-500 lg:px-5"
            style={{
              background: scrolled ? "rgba(13,19,24,0.8)" : "rgba(13,19,24,0.45)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: scrolled
                ? "0 12px 40px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)"
                : "0 8px 30px -18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
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
              {/* Language selector — custom dark dropdown */}
              <LanguageSwitcher language={language} onChange={setLanguage} />
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
        <section
          className="relative min-h-screen overflow-hidden"
          onMouseMove={onHeroMove}
          onMouseLeave={() => setSpot((s) => ({ ...s, active: false }))}
        >
          {/* 3D scene — fills the hero on mobile, shifts to the right half on
              desktop so the headline sits beside it (split hero). */}
          <div className="absolute inset-0 lg:left-[30%]">
            <HeroScene displayModel={displayModel} exitingModel={exitingModel} inTransition={inTransition} />
          </div>

          {/* Cursor-reactive spotlight — a soft cyan glow that tracks the pointer */}
          <div
            className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-500"
            style={{
              opacity: spot.active ? 1 : 0,
              background: `radial-gradient(420px circle at ${spot.x}% ${spot.y}%, rgba(43,184,220,0.14), transparent 60%)`,
            }}
          />

          {/* Hero text — centered on mobile, left-aligned beside the 3D on desktop */}
          <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center px-6 pt-16 pb-32 lg:items-start">
            <div className="flex max-w-xl flex-col items-center text-center lg:max-w-2xl lg:items-start lg:text-left">
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
                style={{ fontSize: "clamp(56px, 8.2vw, 108px)" }}
              >
                <span className="anim-in-1 block text-white">{text.hero.headline1}</span>
                <span className="anim-in-2 accent-gradient block">{text.hero.headline2}</span>
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
              <div className="anim-in-3 flex flex-wrap justify-center gap-4 lg:justify-start">
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
                  onClick={() => (onSeeDemo ? onSeeDemo() : onStartBuilding())}
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
            {/* Bento grid — first card is the hero tile, the other two flank it,
                the last spans full width. Glassmorphism + accent glow on hover. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              {text.cards.map((card, i) => {
                const span = i === 0 ? "sm:col-span-4 sm:row-span-2" : i === 1 ? "sm:col-span-2" : "sm:col-span-2";
                const feature = i === 0;
                return (
                  <div
                    key={i}
                    className={`card-hover group relative overflow-hidden rounded-3xl p-7 ${span} ${feature ? "sm:p-9" : ""}`}
                    style={{
                      background: "linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      backdropFilter: "blur(14px)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                      transitionDelay: `${i * 60}ms`,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = `${ACCENT_DIM}0.4)`;
                      (e.currentTarget as HTMLElement).style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 50px ${ACCENT_DIM}0.1)`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.06)";
                    }}
                  >
                    {/* corner glow */}
                    <div
                      className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      style={{ background: `radial-gradient(circle, ${ACCENT_DIM}0.18), transparent 70%)`, filter: "blur(20px)" }}
                    />
                    <div
                      className={`mb-6 flex items-center justify-center rounded-2xl transition-all duration-300 group-hover:scale-110 ${feature ? "h-14 w-14" : "h-11 w-11"}`}
                      style={{ background: `${ACCENT_DIM}0.12)`, border: `1px solid ${ACCENT_DIM}0.25)` }}
                    >
                      <svg className={feature ? "h-7 w-7" : "h-5 w-5"} style={{ color: ACCENT }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
                      </svg>
                    </div>
                    <p className={`mb-3 font-bold text-white ${feature ? "text-2xl" : "text-base"}`}>{card.title}</p>
                    <p className={`leading-relaxed ${feature ? "text-base" : "text-sm"}`} style={{ color: "rgba(232,237,242,0.5)" }}>
                      {card.body}
                    </p>
                  </div>
                );
              })}
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
                ref={pm0.ref}
                className="rounded-2xl p-7"
                style={{
                  ...pm0.style,
                  background: `${ACCENT_DIM}0.06)`,
                  border: `1.5px solid ${ACCENT_DIM}0.35)`,
                  boxShadow: `0 0 60px ${ACCENT_DIM}0.08)`,
                }}
              >
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: ACCENT }}>Free</p>
                <div className="mb-1 flex items-end gap-2">
                  <span className="text-5xl font-black text-white">$0</span>
                  <span className="mb-1.5 text-sm text-white/30">{CURRENCY[language].period}</span>
                </div>
                <p className="mb-7 text-sm text-white/40">3 downloads to get started</p>
                <ul className="mb-7 space-y-2.5">
                  {["AI model generation", "All export formats", "Manual CAD tools", "3 downloads total"].map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(232,237,242,0.72)" }}>
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: ACCENT }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => onStartBuilding()}
                  className="w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.01]"
                  style={{ background: ACCENT, color: BG, boxShadow: `0 4px 24px ${ACCENT_DIM}0.4)` }}
                >
                  Get Started
                </button>
              </div>

              {/* Pro */}
              <div
                ref={pm1.ref}
                className="rounded-2xl p-7 relative"
                style={{
                  ...pm1.style,
                  background: `${ACCENT_DIM}0.06)`,
                  border: `1.5px solid ${ACCENT_DIM}0.35)`,
                  boxShadow: `0 0 60px ${ACCENT_DIM}0.08)`,
                }}
              >
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
                ref={pm2.ref}
                className="rounded-2xl p-7"
                style={{
                  ...pm2.style,
                  background: `${ACCENT_DIM}0.06)`,
                  border: `1.5px solid ${ACCENT_DIM}0.35)`,
                  boxShadow: `0 0 60px ${ACCENT_DIM}0.08)`,
                }}
              >
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: ACCENT }}>Unlimited</p>
                <div className="mb-1 flex items-end gap-2">
                  <span className="text-4xl font-black text-white">{CURRENCY[language].unlimited}</span>
                  <span className="mb-1.5 text-sm text-white/40">{CURRENCY[language].period}</span>
                </div>
                <p className="mb-1 text-xs text-white/25">{CURRENCY[language].taxNote}</p>
                <p className="mb-6 text-sm text-white/40">Unlimited downloads</p>
                <ul className="mb-7 space-y-2.5">
                  {["Everything in Pro", "Unlimited downloads", "Early feature access", "Priority support"].map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(232,237,242,0.72)" }}>
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: ACCENT }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePlanClick("unlimited")}
                  className="w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.01]"
                  style={{ background: ACCENT, color: BG, boxShadow: `0 4px 24px ${ACCENT_DIM}0.4)` }}
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
        onSwitchToSignup={() => setAuthMode("signup")}
        onForgotPassword={() => setAuthMode("forgot")}
        onBackToLogin={() => setAuthMode("login")}
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

      {resetToken && (
        <ResetPasswordDialog
          resetToken={resetToken}
          onClose={() => setResetToken(null)}
          onDone={() => { setResetToken(null); onStartBuilding(); }}
        />
      )}

      {checkoutPlan && (
        <CheckoutModal
          plan={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
        />
      )}
    </>
  );
}
