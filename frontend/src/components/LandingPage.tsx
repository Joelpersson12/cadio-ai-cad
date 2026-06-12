import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import CadioLogo from "./CadioLogo";
import SiteFooter from "./SiteFooter";

type Language = "en" | "sv" | "es" | "fr" | "it" | "de" | "pt";

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "sv", label: "Svenska" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
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
    prompt: "Gridfinity storage bin, IKEA Skadis cable organizer, foldable phone stand...",
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

const localizedCopy: Record<Language, typeof enCopy> = {
  en: enCopy,
  sv: {
    nav: { product: "Produkt", workflow: "Arbetsflöde", pricing: "Beta", start: "Börja bygga" },
    hero: {
      eyebrow: "AI-CAD för verkliga 3D-utskrifter",
      title: "Hitta modellen. Ändra detaljerna. Exportera för din skrivare.",
      body: "Cadio söker i publika 3D-modellkällor, gör starka träffar redigerbara och samlar mått, varianter, material och export i ett rent flöde.",
      prompt: "Gridfinity storage box, IKEA Skadis cable organizer, foldable phone stand...",
      primary: "Börja bygga",
      secondary: "Betatillgång",
    },
    stats: [
      ["Källbaserad", "Söker efter beprövade printbara modeller innan CAD-logiken tar över"],
      ["Prompt + CAD", "Beskriv med vanlig text och finjustera sedan delar, mått, kanter och transformeringar"],
      ["Printklar", "Skrivare, material, skala, skaparinställningar och exportformat hålls ihop"],
    ],
    product: {
      title: "En CAD-byggare för alla nivåer",
      body: "Easy mode hjälper dig beskriva vad du vill skapa. Expert mode ger dig kontroll över skisser, delar, transformeringar, kanter och CAD-operationer.",
    },
    cards: [
      ["Bred modellsökning", "Skriv på engelska, svenska, spanska, franska, italienska, tyska eller portugisiska. Cadio normaliserar prompten innan sökning."],
      ["Variantkontroll", "Byt till nästa eller föregående populära träff när första resultatet är nära men inte rätt."],
      ["Manuell CAD", "Rita, markera delar, flytta, rotera, mät och förfina modellen när du vill ta över själv."],
    ],
    details: {
      label: "Praktiskt CAD-flöde",
      title: "Byggd för steget mellan idé och slicer",
      body: "De flesta printprojekt börjar som en halvtydlig idé: en hållare för en viss plats, ett fäste för ett visst verktyg eller en remix av en känd modell. Cadio håller sökning, varianter, mått, printinställningar och CAD-redigering nära varandra.",
      items: [
        ["Variantkontroll", "Byt modellförslag när första resultatet inte passar."],
        ["Verkliga mått", "Kontrollera mått och skala innan filen hamnar i skrivarprofilen."],
        ["Redigerbart flöde", "Börja med AI och finjustera sedan för hand när precision spelar roll."],
      ],
    },
    workflow: {
      title: "Från idé till STL utan att byta verktyg",
      steps: [
        ["1", "Skriv en prompt", "Exempel: mugg-hållare till skrivbord, telefonställ eller en reservdelshållare."],
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
  },
  es: {
    ...enCopy,
    nav: { product: "Producto", workflow: "Flujo", pricing: "Beta", start: "Empezar" },
    hero: {
      eyebrow: "Búsqueda CAD con IA para impresión 3D real",
      title: "Encuentra el modelo. Ajusta los detalles. Expórtalo para tu impresora.",
      body: "Cadio busca en fuentes públicas de modelos imprimibles, convierte las mejores coincidencias en un espacio editable y mantiene dimensiones, variantes, materiales y exportación en un flujo limpio.",
      prompt: "caja Gridfinity, organizador de cables IKEA Skadis, soporte de telefono plegable...",
      primary: "Empezar",
      secondary: "Acceso beta",
    },
    stats: [
      ["Basado en fuentes", "Busca modelos imprimibles probados antes de usar lógica CAD"],
      ["Prompt + CAD", "Describe con lenguaje natural y luego edita piezas, dimensiones, bordes y transformaciones"],
      ["Listo para imprimir", "Impresora, material, escala, ajustes del creador y formato de exportación juntos"],
    ],
    product: {
      title: "Un constructor CAD para todos los niveles",
      body: "El modo Easy ayuda a describir lo que quieres. El modo Expert te da control sobre bocetos, piezas, transformaciones, bordes y operaciones CAD.",
    },
    cards: [
      ["Búsqueda amplia", "Escribe en inglés, sueco, español, francés, italiano, alemán o portugués. Cadio normaliza el prompt antes de buscar."],
      ["Control de variantes", "Cambia a la coincidencia popular siguiente o anterior cuando el primer resultado está cerca, pero no es perfecto."],
      ["CAD manual", "Dibuja, selecciona piezas, mueve, rota, mide y ajusta el modelo cuando quieras control directo."],
    ],
    details: {
      label: "Flujo CAD práctico",
      title: "Creado para el paso entre búsqueda y slicer",
      body: "La mayoría de las impresiones empiezan como una idea parcial: un soporte para un lugar concreto, una pieza para una herramienta concreta o una remezcla de un modelo conocido. Cadio mantiene búsqueda, variantes, medidas, ajustes de impresión y edición CAD cerca.",
      items: [["Variantes", "Cambia de propuesta cuando el primer resultado no encaja."], ["Medidas reales", "Comprueba límites y escala antes de enviar el archivo a tu perfil de impresora."], ["Flujo editable", "Empieza con IA y ajusta a mano cuando la precisión importa."]],
    },
    workflow: {
      title: "De la idea al STL sin cambiar de herramienta",
      steps: [["1", "Escribe un prompt", "Ejemplo: soporte de taza para escritorio, soporte de teléfono o una pieza de repuesto."], ["2", "Elige una variante", "Avanza por opciones populares hasta encontrar la forma correcta."], ["3", "Ajusta", "Cambia dimensiones, material, color, colocación y detalles CAD."], ["4", "Exporta", "Descarga STL, 3MF, OBJ o AMF con ajustes de impresión recomendados."]],
    },
    pricingTitle: "Precios próximamente",
    pricingBody: "Por ahora, Cadio es gratis durante Early Access Beta. Crea, edita y descarga mientras mejoramos la plataforma.",
    beta: { title: "Early Access Beta", body: "Cadio está en desarrollo activo.", downloads: "Todas las descargas están desbloqueadas por ahora.", pricing: "Los precios llegarán más adelante.", feedback: "Agradecemos tus comentarios en" },
  },
  fr: {
    ...enCopy,
    nav: { product: "Produit", workflow: "Flux", pricing: "Bêta", start: "Commencer" },
    hero: {
      eyebrow: "Recherche CAO IA pour une vraie impression 3D",
      title: "Trouvez le modèle. Ajustez les détails. Exportez pour votre imprimante.",
      body: "Cadio recherche dans des sources publiques de modèles imprimables, transforme les meilleures correspondances en espace éditable et garde dimensions, variantes, matériaux et export dans un flux clair.",
      prompt: "boite Gridfinity, organisateur de cables IKEA Skadis, support de telephone pliable...",
      primary: "Commencer",
      secondary: "Accès bêta",
    },
    stats: [["Basé sur des sources", "Recherche des modèles imprimables éprouvés avant la logique CAO"], ["Prompt + CAO", "Décrivez en langage naturel, puis modifiez pièces, dimensions, arêtes et transformations"], ["Prêt à imprimer", "Imprimante, matériau, échelle, réglages créateur et format d'export restent ensemble"]],
    product: { title: "Un constructeur CAO pour tous les niveaux", body: "Le mode Easy aide à décrire ce que vous voulez. Le mode Expert donne le contrôle sur les esquisses, pièces, transformations, arêtes et opérations CAO." },
    cards: [["Recherche large", "Écrivez en anglais, suédois, espagnol, français, italien, allemand ou portugais. Cadio normalise le prompt avant la recherche."], ["Variantes", "Passez au résultat populaire suivant ou précédent quand le premier est proche, mais pas parfait."], ["CAO manuelle", "Dessinez, sélectionnez les pièces, déplacez, faites pivoter, mesurez et affinez le modèle."]],
    details: {
      label: "Flux CAO pratique",
      title: "Pensé pour l'étape entre recherche et slicer",
      body: "La plupart des impressions commencent par une idée incomplète : un support pour un endroit précis, une fixation pour un outil précis ou un remix d'un modèle connu. Cadio garde recherche, variantes, mesures, réglages d'impression et édition CAO au même endroit.",
      items: [["Contrôle des variantes", "Changez de proposition si le premier résultat ne convient pas."], ["Dimensions réelles", "Vérifiez limites et échelle avant le profil d'imprimante."], ["Flux éditable", "Commencez avec l'IA, puis ajustez à la main quand la précision compte."]],
    },
    workflow: { title: "De l'idée au STL sans changer d'outil", steps: [["1", "Écrivez un prompt", "Exemple : support de tasse pour bureau, support de téléphone ou pièce de remplacement."], ["2", "Choisissez une variante", "Parcourez les options populaires jusqu'à trouver la bonne forme."], ["3", "Affinez", "Ajustez dimensions, matériau, couleur, placement et détails CAO."], ["4", "Exportez", "Téléchargez STL, 3MF, OBJ ou AMF avec des réglages d'impression recommandés."]] },
    pricingTitle: "Tarifs à venir",
    pricingBody: "Pour l'instant, Cadio est gratuit pendant Early Access Beta. Créez, modifiez et téléchargez pendant que nous améliorons la plateforme.",
    beta: { title: "Early Access Beta", body: "Cadio est en développement actif.", downloads: "Tous les téléchargements sont actuellement débloqués.", pricing: "Les tarifs seront lancés plus tard.", feedback: "Vos retours sont les bienvenus à" },
  },
  it: {
    ...enCopy,
    nav: { product: "Prodotto", workflow: "Flusso", pricing: "Beta", start: "Inizia" },
    hero: { eyebrow: "Ricerca CAD con IA per vera stampa 3D", title: "Trova il modello. Modifica i dettagli. Esporta per la tua stampante.", body: "Cadio cerca fonti pubbliche di modelli stampabili, trasforma le corrispondenze migliori in uno spazio modificabile e tiene insieme dimensioni, varianti, materiali ed esportazione.", prompt: "contenitore Gridfinity, organizer cavi IKEA Skadis, supporto telefono pieghevole...", primary: "Inizia", secondary: "Accesso beta" },
    stats: [["Basato su fonti", "Cerca modelli stampabili collaudati prima della logica CAD"], ["Prompt + CAD", "Descrivi in linguaggio naturale, poi modifica parti, dimensioni, bordi e trasformazioni"], ["Pronto per stampa", "Stampante, materiale, scala, impostazioni del creatore e formato di export restano insieme"]],
    product: { title: "Un builder CAD per ogni livello", body: "Easy mode aiuta a descrivere cosa vuoi. Expert mode dà controllo su schizzi, parti, trasformazioni, bordi e operazioni CAD." },
    cards: [["Ricerca ampia", "Scrivi in inglese, svedese, spagnolo, francese, italiano, tedesco o portoghese. Cadio normalizza il prompt prima della ricerca."], ["Controllo varianti", "Passa al modello popolare successivo o precedente quando il primo risultato è vicino ma non corretto."], ["CAD manuale", "Disegna, seleziona parti, sposta, ruota, misura e rifinisci il modello quando vuoi controllo diretto."]],
    details: { label: "Flusso CAD pratico", title: "Creato per il passaggio tra ricerca e slicer", body: "Molte stampe iniziano da un'idea parziale: un supporto per un luogo preciso, una staffa per uno strumento preciso o un remix di un modello noto. Cadio tiene insieme ricerca, varianti, misure, impostazioni di stampa e modifica CAD.", items: [["Varianti", "Cambia proposta quando il primo risultato non va bene."], ["Misure reali", "Controlla ingombri e scala prima del profilo stampante."], ["Flusso modificabile", "Inizia con l'IA e regola a mano quando serve precisione."]] },
    workflow: { title: "Dall'idea allo STL senza cambiare strumento", steps: [["1", "Scrivi un prompt", "Esempio: supporto tazza da scrivania, supporto telefono o ricambio."], ["2", "Scegli una variante", "Scorri opzioni popolari finché la forma è giusta."], ["3", "Rifinisci", "Modifica dimensioni, materiale, colore, posizione e dettagli CAD."], ["4", "Esporta", "Scarica STL, 3MF, OBJ o AMF con impostazioni di stampa consigliate."]] },
    pricingTitle: "Prezzi in arrivo",
    pricingBody: "Per ora Cadio è gratuito durante Early Access Beta. Crea, modifica e scarica mentre miglioriamo la piattaforma.",
    beta: { title: "Early Access Beta", body: "Cadio è in sviluppo attivo.", downloads: "Tutti i download sono attualmente sbloccati.", pricing: "I prezzi arriveranno più avanti.", feedback: "Accogliamo feedback a" },
  },
  de: {
    ...enCopy,
    nav: { product: "Produkt", workflow: "Ablauf", pricing: "Beta", start: "Starten" },
    hero: { eyebrow: "KI-CAD-Suche für echten 3D-Druck", title: "Modell finden. Details anpassen. Für deinen Drucker exportieren.", body: "Cadio durchsucht öffentliche Quellen für druckbare Modelle, macht starke Treffer editierbar und hält Maße, Varianten, Materialien und Export in einem klaren Ablauf zusammen.", prompt: "Gridfinity box, IKEA Skadis Kabel-Organizer, klappbarer Handyhalter...", primary: "Starten", secondary: "Beta-Zugang" },
    stats: [["Quellenbasiert", "Sucht bewährte druckbare Modelle, bevor CAD-Logik übernimmt"], ["Prompt + CAD", "Beschreibe in natürlicher Sprache und bearbeite danach Teile, Maße, Kanten und Transformationen"], ["Druckbereit", "Drucker, Material, Skalierung, Creator-Einstellungen und Exportformat bleiben zusammen"]],
    product: { title: "Ein CAD-Builder für jedes Niveau", body: "Easy Mode hilft beim Beschreiben. Expert Mode gibt Kontrolle über Skizzen, Teile, Transformationen, Kanten und CAD-Operationen." },
    cards: [["Breite Modellsuche", "Schreibe auf Englisch, Schwedisch, Spanisch, Französisch, Italienisch, Deutsch oder Portugiesisch. Cadio normalisiert den Prompt vor der Suche."], ["Variantenkontrolle", "Wechsle zum nächsten oder vorherigen populären Treffer, wenn das erste Ergebnis nah dran ist."], ["Manuelles CAD", "Zeichne, wähle Teile, verschiebe, rotiere, messe und verfeinere das Modell direkt."]],
    details: { label: "Praktischer CAD-Ablauf", title: "Gebaut für den Schritt zwischen Suche und Slicer", body: "Viele Druckprojekte beginnen als halbfertige Idee: ein Halter für einen bestimmten Ort, eine Halterung für ein bestimmtes Werkzeug oder ein Remix eines bekannten Modells. Cadio hält Suche, Varianten, Maße, Druckeinstellungen und CAD-Bearbeitung nah beieinander.", items: [["Varianten", "Wechsle den Modellvorschlag, wenn der erste nicht passt."], ["Echte Maße", "Prüfe Abmessungen und Skalierung vor dem Druckerprofil."], ["Editierbarer Ablauf", "Starte mit KI und passe manuell an, wenn Präzision zählt."]] },
    workflow: { title: "Von der Idee zur STL ohne Werkzeugwechsel", steps: [["1", "Prompt schreiben", "Beispiel: Becherhalter mit Tischklemme, Handyhalter oder Ersatzteilhalter."], ["2", "Variante wählen", "Gehe durch populäre Optionen, bis die Form stimmt."], ["3", "Feinabstimmen", "Ändere Maße, Material, Farbe, Platzierung und CAD-Details."], ["4", "Exportieren", "Lade STL, 3MF, OBJ oder AMF mit empfohlenen Druckeinstellungen herunter."]] },
    pricingTitle: "Preise kommen bald",
    pricingBody: "Während Early Access Beta ist Cadio kostenlos. Erstelle, bearbeite und lade herunter, während wir die Plattform verbessern.",
    beta: { title: "Early Access Beta", body: "Cadio befindet sich in aktiver Entwicklung.", downloads: "Alle Downloads sind derzeit freigeschaltet.", pricing: "Preise starten später.", feedback: "Feedback gerne an" },
  },
  pt: {
    ...enCopy,
    nav: { product: "Produto", workflow: "Fluxo", pricing: "Beta", start: "Começar" },
    hero: { eyebrow: "Pesquisa CAD com IA para impressão 3D real", title: "Encontre o modelo. Ajuste os detalhes. Exporte para a sua impressora.", body: "Cadio pesquisa fontes públicas de modelos imprimíveis, transforma boas correspondências em um espaço editável e mantém dimensões, variantes, materiais e exportação em um fluxo limpo.", prompt: "caixa Gridfinity, organizador de cabos IKEA Skadis, suporte dobravel para telefone...", primary: "Começar", secondary: "Acesso beta" },
    stats: [["Baseado em fontes", "Procura modelos imprimíveis comprovados antes de usar lógica CAD"], ["Prompt + CAD", "Descreva em linguagem natural e depois edite peças, dimensões, bordas e transformações"], ["Pronto para imprimir", "Impressora, material, escala, configurações do criador e formato de exportação juntos"]],
    product: { title: "Um construtor CAD para todos os níveis", body: "O modo Easy ajuda a descrever o que você quer. O modo Expert dá controle sobre esboços, peças, transformações, bordas e operações CAD." },
    cards: [["Pesquisa ampla", "Escreva em inglês, sueco, espanhol, francês, italiano, alemão ou português. Cadio normaliza o prompt antes de pesquisar."], ["Controle de variantes", "Passe para o próximo ou anterior modelo popular quando o primeiro resultado estiver perto, mas não perfeito."], ["CAD manual", "Desenhe, selecione peças, mova, gire, meça e refine o modelo quando quiser controle direto."]],
    details: { label: "Fluxo CAD prático", title: "Feito para o passo entre pesquisa e slicer", body: "A maioria das impressões começa como uma ideia parcial: um suporte para um lugar específico, uma peça para uma ferramenta específica ou um remix de um modelo conhecido. Cadio mantém pesquisa, variantes, medidas, configurações de impressão e edição CAD no mesmo fluxo.", items: [["Variantes", "Troque de proposta quando o primeiro resultado não servir."], ["Medidas reais", "Confira limites e escala antes do perfil da impressora."], ["Fluxo editável", "Comece com IA e ajuste manualmente quando precisão importar."]] },
    workflow: { title: "Da ideia ao STL sem trocar de ferramenta", steps: [["1", "Escreva um prompt", "Exemplo: suporte de caneca para mesa, suporte de telefone ou peça de reposição."], ["2", "Escolha uma variante", "Passe por opções populares até encontrar a forma certa."], ["3", "Ajuste", "Altere dimensões, material, cor, posicionamento e detalhes CAD."], ["4", "Exporte", "Baixe STL, 3MF, OBJ ou AMF com configurações de impressão recomendadas."]] },
    pricingTitle: "Preços em breve",
    pricingBody: "Por enquanto, Cadio é gratuito durante o Early Access Beta. Crie, edite e baixe enquanto melhoramos a plataforma.",
    beta: { title: "Early Access Beta", body: "Cadio está em desenvolvimento ativo.", downloads: "Todos os downloads estão liberados no momento.", pricing: "Os preços serão lançados depois.", feedback: "Agradecemos feedback em" },
  },
};

function PrintedCuboid({
  size,
  position,
  material,
  lineMaterial,
  lineCount = 4,
}: {
  size: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  lineMaterial: THREE.Material;
  lineCount?: number;
}) {
  const [width, height, depth] = size;
  return (
    <group position={position}>
      <mesh material={material} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      {Array.from({ length: lineCount }).map((_, index) => {
        const y = -height / 2 + ((index + 1) * height) / (lineCount + 1);
        return (
          <mesh key={index} material={lineMaterial} position={[0, y, depth / 2 + 0.006]} receiveShadow>
            <boxGeometry args={[width * 0.92, 0.012, 0.012]} />
          </mesh>
        );
      })}
    </group>
  );
}

function SkadisSlot({
  x,
  y,
  material,
  rimMaterial,
}: {
  x: number;
  y: number;
  material: THREE.Material;
  rimMaterial: THREE.Material;
}) {
  return (
    <group position={[x, y, 0.094]}>
      <mesh material={rimMaterial} position={[0, 0, -0.002]} receiveShadow>
        <boxGeometry args={[0.13, 0.27, 0.016]} />
      </mesh>
      <mesh material={rimMaterial} position={[0, 0.135, -0.002]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.016, 24]} />
      </mesh>
      <mesh material={rimMaterial} position={[0, -0.135, -0.002]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.016, 24]} />
      </mesh>
      <mesh material={material} receiveShadow>
        <boxGeometry args={[0.082, 0.204, 0.026]} />
      </mesh>
      <mesh material={material} position={[0, 0.099, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[0.041, 0.041, 0.026, 24]} />
      </mesh>
      <mesh material={material} position={[0, -0.099, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[0.041, 0.041, 0.026, 24]} />
      </mesh>
      <mesh material={rimMaterial} position={[0.058, 0, 0.012]} receiveShadow>
        <boxGeometry args={[0.012, 0.176, 0.008]} />
      </mesh>
    </group>
  );
}

function LayerLines({
  width,
  height,
  z,
  material,
  count = 7,
}: {
  width: number;
  height: number;
  z: number;
  material: THREE.Material;
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <mesh key={index} material={material} position={[0, -height * 0.42 + (index * height * 0.78) / Math.max(1, count - 1), z]}>
          <boxGeometry args={[width, 0.01, 0.012]} />
        </mesh>
      ))}
    </>
  );
}

function SkadisBin({
  width,
  height,
  depth,
  position,
  material,
  rimMaterial,
  lineMaterial,
  compartments = 0,
}: {
  width: number;
  height: number;
  depth: number;
  position: [number, number, number];
  material: THREE.Material;
  rimMaterial: THREE.Material;
  lineMaterial: THREE.Material;
  compartments?: number;
}) {
  const wall = 0.08;
  const frontZ = depth + wall;
  return (
    <group position={position}>
      <mesh material={material} position={[0, -height / 2, depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, wall, depth]} />
      </mesh>
      <mesh material={material} position={[0, -height * 0.12, depth + wall / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, height * 0.76, wall]} />
      </mesh>
      <mesh material={material} position={[-width / 2 + wall / 2, -height * 0.1, depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[wall, height * 0.82, depth]} />
      </mesh>
      <mesh material={material} position={[width / 2 - wall / 2, -height * 0.1, depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[wall, height * 0.82, depth]} />
      </mesh>
      <mesh material={rimMaterial} position={[0, height * 0.31, frontZ]} castShadow>
        <boxGeometry args={[width * 1.02, wall, wall]} />
      </mesh>
      <mesh material={rimMaterial} position={[0, height * 0.31, depth * 0.12]} castShadow>
        <boxGeometry args={[width * 1.02, wall, wall]} />
      </mesh>
      <mesh material={rimMaterial} position={[-width / 2 + wall * 0.42, height * 0.31, depth * 0.55]} castShadow>
        <boxGeometry args={[wall, wall, depth * 0.84]} />
      </mesh>
      <mesh material={rimMaterial} position={[width / 2 - wall * 0.42, height * 0.31, depth * 0.55]} castShadow>
        <boxGeometry args={[wall, wall, depth * 0.84]} />
      </mesh>
      <LayerLines width={width * 0.86} height={height} z={frontZ + 0.012} material={lineMaterial} count={7} />
      <LayerLines width={width * 0.7} height={height * 0.76} z={0.028} material={lineMaterial} count={5} />
      {Array.from({ length: compartments }).map((_, index) => {
        const x = -width / 2 + ((index + 1) * width) / (compartments + 1);
        return (
          <mesh key={index} material={rimMaterial} position={[x, height * 0.31, depth * 0.55]} castShadow>
            <boxGeometry args={[0.055, wall, depth * 0.72]} />
          </mesh>
        );
      })}
      {[-width * 0.28, width * 0.28].map((x) => (
        <group key={x} position={[x, height * 0.51, -0.01]}>
          <mesh material={rimMaterial} castShadow receiveShadow>
            <boxGeometry args={[0.16, 0.28, 0.08]} />
          </mesh>
          <mesh material={lineMaterial} position={[0, 0.02, 0.052]}>
            <boxGeometry args={[0.09, 0.18, 0.018]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PerforatedTray({
  position,
  material,
  holeMaterial,
  rimMaterial,
}: {
  position: [number, number, number];
  material: THREE.Material;
  holeMaterial: THREE.Material;
  rimMaterial: THREE.Material;
}) {
  return (
    <group position={position}>
      <mesh material={material} castShadow receiveShadow>
        <boxGeometry args={[1.18, 0.18, 0.5]} />
      </mesh>
      <mesh material={rimMaterial} position={[0, 0.11, 0]} castShadow>
        <boxGeometry args={[1.22, 0.055, 0.56]} />
      </mesh>
      <mesh material={rimMaterial} position={[0, -0.11, 0]} castShadow>
        <boxGeometry args={[1.22, 0.055, 0.56]} />
      </mesh>
      {[-0.36, 0, 0.36].map((x) =>
        [-0.13, 0.13].map((z) => (
          <mesh key={`${x}-${z}`} material={holeMaterial} position={[x, 0.102, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.036, 22]} />
          </mesh>
        )),
      )}
    </group>
  );
}

function ToolRod({
  position,
  rotation,
  length,
  radius,
  material,
  accentMaterial,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  length: number;
  radius: number;
  material: THREE.Material;
  accentMaterial: THREE.Material;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh material={material} castShadow>
        <cylinderGeometry args={[radius, radius, length, 32]} />
      </mesh>
      <mesh material={accentMaterial} position={[0, length * 0.18, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.26, radius * 1.26, 0.06, 32]} />
      </mesh>
      <mesh material={accentMaterial} position={[0, length / 2 + 0.055, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.18, radius * 1.18, 0.11, 32]} />
      </mesh>
      <mesh material={accentMaterial} position={[0, -length / 2 - 0.04, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.32, radius * 1.32, 0.08, 32]} />
      </mesh>
    </group>
  );
}

function HeroModel() {
  const groupRef = useRef<THREE.Group>(null);
  const dragRef = useRef({ active: false, x: 0, rotation: 0, suppressContext: false });
  const [manualRotation, setManualRotation] = useState(0);
  const boardMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#08090a", roughness: 0.9, metalness: 0.04 }),
    [],
  );
  const holeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#010101", roughness: 0.92, metalness: 0.0 }),
    [],
  );
  const slotRimMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#222629", roughness: 0.76, metalness: 0.03 }),
    [],
  );
  const blackPrint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#111315", roughness: 0.8, metalness: 0.03 }),
    [],
  );
  const grayPrint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#9aa1a5", roughness: 0.68, metalness: 0.02 }),
    [],
  );
  const metalTool = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#ded9cf", roughness: 0.24, metalness: 0.82 }),
    [],
  );
  const tealPrint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1b1f22", roughness: 0.78, metalness: 0.03 }),
    [],
  );
  const amberPrint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#6d7478", roughness: 0.7, metalness: 0.03 }),
    [],
  );
  const layerLine = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#050607", roughness: 0.88, metalness: 0.0 }),
    [],
  );
  const holes = useMemo(() => {
    const items: Array<[number, number]> = [];
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 16; col += 1) {
        items.push([(col - 7.5) * 0.42, (row - 4.5) * 0.38]);
      }
    }
    return items;
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!dragRef.current.active) return;
      const nextRotation = dragRef.current.rotation + (event.clientX - dragRef.current.x) * 0.006;
      setManualRotation(nextRotation);
    };
    const handleUp = () => {
      dragRef.current.active = false;
    };
    const handleContextMenu = (event: MouseEvent) => {
      if (!dragRef.current.suppressContext) return;
      event.preventDefault();
      dragRef.current.suppressContext = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -0.12 + manualRotation + Math.sin(clock.elapsedTime * 0.18) * 0.035;
    groupRef.current.rotation.x = -0.04 + Math.sin(clock.elapsedTime * 0.15) * 0.012;
  });

  const handleModelPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.nativeEvent.button !== 2) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    dragRef.current = {
      active: true,
      x: event.nativeEvent.clientX,
      rotation: manualRotation,
      suppressContext: true,
    };
  };

  return (
    <group ref={groupRef} position={[0, -0.16, 0]} onPointerDown={handleModelPointerDown}>
      <group position={[0, 0.15, 0]} rotation={[0, 0.02, 0]}>
        <mesh material={boardMaterial} castShadow receiveShadow>
          <boxGeometry args={[7.2, 4.6, 0.16]} />
        </mesh>
        <mesh material={slotRimMaterial} position={[0, 2.34, 0.02]} castShadow>
          <boxGeometry args={[7.38, 0.1, 0.22]} />
        </mesh>
        <mesh material={slotRimMaterial} position={[0, -2.34, 0.02]} castShadow>
          <boxGeometry args={[7.38, 0.1, 0.22]} />
        </mesh>
        <mesh material={slotRimMaterial} position={[-3.64, 0, 0.02]} castShadow>
          <boxGeometry args={[0.1, 4.62, 0.22]} />
        </mesh>
        <mesh material={slotRimMaterial} position={[3.64, 0, 0.02]} castShadow>
          <boxGeometry args={[0.1, 4.62, 0.22]} />
        </mesh>
        {holes.map(([x, y]) => (
          <SkadisSlot key={`${x}-${y}`} x={x} y={y} material={holeMaterial} rimMaterial={slotRimMaterial} />
        ))}

        <group position={[-2.36, -0.68, 0.18]}>
          <SkadisBin width={1.52} height={1.2} depth={0.72} position={[0, 0, 0]} material={blackPrint} rimMaterial={grayPrint} lineMaterial={layerLine} compartments={4} />
          <ToolRod position={[-0.34, 0.76, 0.72]} rotation={[0.42, 0.08, -0.18]} length={1.22} radius={0.055} material={metalTool} accentMaterial={grayPrint} />
          <ToolRod position={[0.24, 0.69, 0.69]} rotation={[0.28, -0.04, 0.22]} length={1.02} radius={0.045} material={metalTool} accentMaterial={blackPrint} />
          <mesh material={metalTool} position={[0.02, 0.34, 0.78]} rotation={[Math.PI / 2, 0, 0.1]} castShadow>
            <torusGeometry args={[0.15, 0.022, 14, 36]} />
          </mesh>
        </group>

        <group position={[0.02, -1.06, 0.2]}>
          <SkadisBin width={1.36} height={1.36} depth={0.82} position={[0, 0, 0]} material={tealPrint} rimMaterial={grayPrint} lineMaterial={layerLine} compartments={0} />
          <ToolRod position={[0.28, 0.84, 0.84]} rotation={[0.52, 0.08, -0.34]} length={1.16} radius={0.07} material={blackPrint} accentMaterial={metalTool} />
          <mesh material={blackPrint} position={[-0.28, 0.39, 0.78]} rotation={[0.24, 0, 0.18]} castShadow>
            <boxGeometry args={[0.22, 0.86, 0.12]} />
          </mesh>
        </group>

        <group position={[2.34, -0.94, 0.18]}>
          <SkadisBin width={1.14} height={1.1} depth={0.64} position={[0, 0, 0]} material={blackPrint} rimMaterial={grayPrint} lineMaterial={layerLine} compartments={2} />
          <ToolRod position={[0.22, 0.72, 0.68]} rotation={[0.58, -0.05, -0.2]} length={1.02} radius={0.06} material={metalTool} accentMaterial={amberPrint} />
          <mesh material={grayPrint} position={[-0.22, 0.54, 0.73]} rotation={[0.62, 0.1, 0.34]} castShadow>
            <boxGeometry args={[0.16, 0.74, 0.12]} />
          </mesh>
        </group>

        <group position={[2.1, 1.02, 0.28]}>
          <PerforatedTray position={[0, 0, 0]} material={grayPrint} holeMaterial={holeMaterial} rimMaterial={blackPrint} />
          <PrintedCuboid size={[1.36, 0.1, 0.28]} position={[0, -0.23, -0.02]} material={blackPrint} lineMaterial={layerLine} lineCount={2} />
          {[-0.52, -0.17, 0.18, 0.53].map((x) => (
            <mesh key={x} material={blackPrint} position={[x, 0.36, 0.04]} castShadow>
              <boxGeometry args={[0.11, 0.48, 0.18]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

function HeroScene() {
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1.5, 2.5]}
        shadows
        camera={{ position: [0.3, 0.04, 8.0], fov: 39 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
      >
        <color attach="background" args={["#242527"]} />
        <fog attach="fog" args={["#242527", 8, 16]} />
        <ambientLight intensity={0.88} />
        <hemisphereLight intensity={0.55} color="#f4f7fb" groundColor="#050505" />
        <directionalLight
          position={[3.8, 5.8, 5.4]}
          intensity={3.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-3.0, 1.4, 3.4]} intensity={0.85} color="#d9f6ff" />
        <pointLight position={[-4, 2.6, 4]} intensity={1.55} color="#28c7df" />
        <pointLight position={[3.5, -2.4, 4]} intensity={0.8} color="#f3c34d" />
        <HeroModel />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_62%_36%,rgba(255,255,255,0.12),rgba(20,20,21,0)_42%),radial-gradient(circle_at_38%_64%,rgba(43,184,220,0.11),rgba(20,20,21,0)_36%),linear-gradient(90deg,rgba(8,8,9,0.92)_0%,rgba(12,12,13,0.72)_33%,rgba(18,18,19,0.10)_68%,rgba(18,18,19,0.40)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(0deg,#151515_0%,rgba(21,21,21,0)_100%)]" />
    </div>
  );
}

export default function LandingPage({ onStartBuilding }: { onStartBuilding: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [betaOpen, setBetaOpen] = useState(false);
  const text = localizedCopy[language];

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
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button onClick={onStartBuilding} className="rounded-xl bg-[#2bb8dc] px-5 py-3 text-sm font-bold text-[#101010] shadow-[0_0_26px_rgba(43,184,220,0.22)] hover:bg-[#69d9f5]">
                  {text.hero.primary}
                </button>
                <button
                  type="button"
                  onClick={() => setBetaOpen(true)}
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-[#e6e6e8] backdrop-blur hover:border-[#2bb8dc]/55 hover:text-white"
                >
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
