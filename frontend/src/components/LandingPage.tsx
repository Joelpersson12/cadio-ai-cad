import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import makitaBatteryStlUrl from "../assets/makita-battery.stl?url";
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

const heroPrompt = "Makita Battery Holder";

const copy = {
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
        "Cadio helps you find printable model ideas, turn prompts into editable CAD geometry, and prepare exports with printer-aware settings.",
      prompt: heroPrompt,
      primary: "Start building",
      secondary: "See pricing",
    },
    stats: [
      ["Source aware", "Looks for proven printable patterns before it builds"],
      ["Easy + Expert", "AI-guided edits for quick work, manual CAD tools when you need control"],
      ["Print ready", "Printer, material, scaling, and export formats in one flow"],
    ],
    product: {
      title: "A CAD builder for every level",
      body:
        "Easy mode helps you describe what you want. Expert mode gives you control over sketches, parts, transforms, edges, and CAD operations.",
    },
    cards: [
      ["AI model search", "Type what you want to build. Cadio searches for source signals and creates a printable starting point."],
      ["Manual CAD", "Draw, select parts, move, rotate, measure, and refine the model when you want direct control."],
      ["Printer profiles", "Choose printer, material, scaling, and export format before the model reaches your slicer."],
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
          "Upgrade checkout coming soon",
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
          "Upgrade checkout coming soon",
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
      hint: "Saved models and download usage are private to the email account you use here.",
    },
    cta: {
      title: "Ready to build?",
      body: "Open the Cadio workspace and create the first model directly.",
      button: "Start building",
    },
  },
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
        "Cadio hjalper dig hitta printbara modellideer, skapa redigerbar CAD-geometri fran prompts och exportera med skrivarens installningar i tanken.",
      prompt: heroPrompt,
      primary: "Start building",
      secondary: "Se priser",
    },
    stats: [
      ["Source aware", "Letar efter beprovade printbara monster innan modellen byggs"],
      ["Easy + Expert", "AI-styrda snabbandringar eller manuella CAD-verktyg nar du vill styra sjalv"],
      ["Print ready", "Skrivare, material, scale och exportformat i samma flode"],
    ],
    product: {
      title: "En CAD-byggare for alla nivaer",
      body:
        "Easy mode hjalper dig beskriva vad du vill skapa. Expert mode ger dig kontroll over skisser, delar, transform, kanter och CAD-operationer.",
    },
    cards: [
      ["AI model search", "Skriv vad du vill bygga. Cadio soker efter kall-signaler och skapar en printbar startpunkt."],
      ["Manual CAD", "Rita, markera delar, flytta, rotera, mata och forfina modellen nar du vill ta over sjalv."],
      ["Printer profiles", "Valj skrivare, material, scale och exportformat innan modellen hamnar i slicern."],
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
      hint: "Sparade modeller och nedladdningar ar privata for e-postkontot du anvander har.",
    },
    cta: {
      title: "Redo att bygga?",
      body: "Oppna Cadio-workspacet och skapa forsta modellen direkt.",
      button: "Start building",
    },
  },
  es: {
    nav: {
      product: "Producto",
      workflow: "Flujo",
      pricing: "Precios",
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
    pricingTitle: "Precios",
    pricingBody: "Todos los planes tienen la misma experiencia CAD. La diferencia es la cantidad mensual de generaciones descargables.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        note: "1 generacion descargable",
        features: [
          "1 generacion que se puede descargar",
          "Inicio de sesion requerido antes de descargar",
          "Mismo Easy y Expert CAD",
          "Misma calidad de modelo que los planes de pago",
        ],
      },
      {
        name: "Maker",
        price: "$10/mo",
        note: "10 generaciones al mes",
        features: [
          "10 generaciones descargables/mes",
          "Mismas herramientas CAD que todos los planes",
          "Todas las impresoras, materiales y formatos de exportacion",
          "Login requerido para descargar",
        ],
        featured: true,
      },
      {
        name: "Pro",
        price: "$49/mo",
        note: "Generaciones ilimitadas",
        features: [
          "Generaciones descargables ilimitadas",
          "Misma experiencia CAD que todos los planes",
          "Todas las impresoras, materiales y formatos de exportacion",
          "Login requerido para descargar",
        ],
      },
    ],
    auth: {
      loginTitle: "Iniciar sesion",
      signupTitle: "Crear cuenta",
      email: "Email",
      password: "Contrasena",
      name: "Nombre",
      continue: "Continuar al workspace",
      hint: "Los modelos guardados y las descargas son privados para el email que uses aqui.",
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
      pricing: "Tarifs",
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
    pricingTitle: "Tarifs",
    pricingBody: "Tous les forfaits ont la meme experience CAO. Seul le nombre de generations telechargeables par mois change.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        note: "1 generation telechargeable",
        features: [
          "1 generation telechargeable",
          "Connexion requise avant telechargement",
          "Memes modes Easy et Expert CAD",
          "Meme qualite de modele que les forfaits payants",
        ],
      },
      {
        name: "Maker",
        price: "$10/mo",
        note: "10 generations par mois",
        features: [
          "10 generations telechargeables/mois",
          "Memes outils CAO que tous les forfaits",
          "Toutes imprimantes, materiaux et formats d'export",
          "Connexion requise pour telecharger",
        ],
        featured: true,
      },
      {
        name: "Pro",
        price: "$49/mo",
        note: "Generations illimitees",
        features: [
          "Generations telechargeables illimitees",
          "Meme experience CAO que tous les forfaits",
          "Toutes imprimantes, materiaux et formats d'export",
          "Connexion requise pour telecharger",
        ],
      },
    ],
    auth: {
      loginTitle: "Connexion",
      signupTitle: "Creer un compte",
      email: "Email",
      password: "Mot de passe",
      name: "Nom",
      continue: "Continuer vers le workspace",
      hint: "Les modeles enregistres et les telechargements restent prives pour l'email utilise ici.",
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
      pricing: "Prezzi",
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
    pricingTitle: "Prezzi",
    pricingBody: "Tutti i piani hanno la stessa esperienza CAD. Cambia solo il numero mensile di generazioni scaricabili.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        note: "1 generazione scaricabile",
        features: [
          "1 generazione scaricabile",
          "Login richiesto prima del download",
          "Stessi Easy e Expert CAD",
          "Stessa qualita dei modelli dei piani a pagamento",
        ],
      },
      {
        name: "Maker",
        price: "$10/mo",
        note: "10 generazioni al mese",
        features: [
          "10 generazioni scaricabili/mese",
          "Stessi strumenti CAD di ogni piano",
          "Tutte le stampanti, materiali e formati export",
          "Login richiesto per il download",
        ],
        featured: true,
      },
      {
        name: "Pro",
        price: "$49/mo",
        note: "Generazioni illimitate",
        features: [
          "Generazioni scaricabili illimitate",
          "Stessa esperienza CAD di ogni piano",
          "Tutte le stampanti, materiali e formati export",
          "Login richiesto per il download",
        ],
      },
    ],
    auth: {
      loginTitle: "Accedi",
      signupTitle: "Registrati",
      email: "Email",
      password: "Password",
      name: "Nome",
      continue: "Continua al workspace",
      hint: "I modelli salvati e i download sono privati per l'email usata qui.",
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
      pricing: "Preise",
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
      secondary: "Preise ansehen",
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
    pricingTitle: "Preise",
    pricingBody: "Alle Pakete haben dieselbe CAD-Erfahrung. Nur die Anzahl monatlich herunterladbarer Generierungen ist anders.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        note: "1 herunterladbare Generierung",
        features: [
          "1 Generierung zum Herunterladen",
          "Login vor Download erforderlich",
          "Dasselbe Easy und Expert CAD",
          "Dieselbe Modellqualitat wie bezahlte Pakete",
        ],
      },
      {
        name: "Maker",
        price: "$10/mo",
        note: "10 Generierungen pro Monat",
        features: [
          "10 herunterladbare Generierungen/Monat",
          "Dieselben CAD-Tools wie jedes Paket",
          "Alle Drucker, Materialien und Exportformate",
          "Login fur Downloads erforderlich",
        ],
        featured: true,
      },
      {
        name: "Pro",
        price: "$49/mo",
        note: "Unbegrenzte Generierungen",
        features: [
          "Unbegrenzte herunterladbare Generierungen",
          "Dieselbe CAD-Erfahrung wie jedes Paket",
          "Alle Drucker, Materialien und Exportformate",
          "Login fur Downloads erforderlich",
        ],
      },
    ],
    auth: {
      loginTitle: "Einloggen",
      signupTitle: "Registrieren",
      email: "Email",
      password: "Passwort",
      name: "Name",
      continue: "Weiter zum Workspace",
      hint: "Gespeicherte Modelle und Downloads sind privat fur die hier genutzte E-Mail.",
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
      pricing: "Precos",
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
    pricingTitle: "Precos",
    pricingBody: "Todos os planos tem a mesma experiencia CAD. A diferenca e o numero mensal de geracoes baixaveis.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        note: "1 geracao baixavel",
        features: [
          "1 geracao que pode ser baixada",
          "Login obrigatorio antes do download",
          "Mesmo Easy e Expert CAD",
          "Mesma qualidade de modelo dos planos pagos",
        ],
      },
      {
        name: "Maker",
        price: "$10/mo",
        note: "10 geracoes por mes",
        features: [
          "10 geracoes baixaveis/mes",
          "Mesmas ferramentas CAD de todos os planos",
          "Todas as impressoras, materiais e formatos de exportacao",
          "Login obrigatorio para downloads",
        ],
        featured: true,
      },
      {
        name: "Pro",
        price: "$49/mo",
        note: "Geracoes ilimitadas",
        features: [
          "Geracoes baixaveis ilimitadas",
          "Mesma experiencia CAD de todos os planos",
          "Todas as impressoras, materiais e formatos de exportacao",
          "Login obrigatorio para downloads",
        ],
      },
    ],
    auth: {
      loginTitle: "Entrar",
      signupTitle: "Criar conta",
      email: "Email",
      password: "Senha",
      name: "Nome",
      continue: "Continuar para o workspace",
      hint: "Modelos salvos e downloads ficam privados para o email usado aqui.",
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
    title: "Byggd for mellanlaget mellan ide och slicer",
    body:
      "De flesta printprojekt behover mer an en genererad form. Cadio haller modellvarianter, matt, printinstallningar och manuella andringar nara varandra sa modellen kanns anvandbar innan export.",
    items: [
      ["Variantkontroll", "Byt modellforslag nar forsta resultatet inte passar."],
      ["Verkliga matt", "Kontrollera bounds och scale innan filen hamnar i skrivarprofilen."],
      ["Redigerbart flode", "Borja med AI och finjustera sedan for hand nar precision spelar roll."],
    ],
  },
};

function HeroModel() {
  const groupRef = useRef<THREE.Group>(null);
  const rawGeometry = useLoader(STLLoader, makitaBatteryStlUrl);
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#111315",
        roughness: 0.44,
        metalness: 0.2,
      }),
    [],
  );
  const edgeMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#596168",
        transparent: true,
        opacity: 0.34,
      }),
    [],
  );
  const accentMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#26bddc",
        emissive: "#0f5f70",
        emissiveIntensity: 0.1,
        roughness: 0.34,
        metalness: 0.12,
      }),
    [],
  );
  const { edgeGeometry, geometry, scale } = useMemo(() => {
    const normalized = rawGeometry.clone();
    normalized.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    normalized.computeVertexNormals();
    normalized.computeBoundingBox();

    const box = normalized.boundingBox ?? new THREE.Box3().setFromBufferAttribute(normalized.attributes.position as THREE.BufferAttribute);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    normalized.translate(-center.x, -box.min.y, -center.z);
    normalized.computeBoundingBox();

    const longestSide = Math.max(size.x, size.y, size.z, 1);
    return {
      edgeGeometry: new THREE.EdgesGeometry(normalized, 22),
      geometry: normalized,
      scale: 4.25 / longestSide,
    };
  }, [rawGeometry]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -0.5 + Math.sin(clock.elapsedTime * 0.24) * 0.065;
    groupRef.current.rotation.x = 0.36 + Math.sin(clock.elapsedTime * 0.18) * 0.024;
  });

  return (
    <group ref={groupRef} position={[0.15, -0.35, 0]}>
      <group scale={scale} position={[0, 0.02, 0]}>
        <mesh geometry={geometry} material={bodyMaterial} castShadow receiveShadow />
        <lineSegments geometry={edgeGeometry} material={edgeMaterial} />
      </group>
      <mesh material={accentMaterial} position={[0, 0.04, -1.65]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.045, 0.045, 3.7, 48]} />
      </mesh>
      <gridHelper args={[8, 18, "#45484b", "#323436"]} position={[0, -0.02, 0]} />
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
            {authBusy ? "Signing in..." : text.auth.continue}
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
    <div className="h-full overflow-y-auto bg-[#151515] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#151515]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <CadioLogo
            subtitle=""
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          />
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
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setBetaOpen(true)}
              className="hidden rounded-lg border border-[#2bb8dc]/45 bg-[#102b33] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#b7f3ff] shadow-[0_0_18px_rgba(43,184,220,0.14)] hover:border-[#69d9f5] hover:text-white sm:block"
            >
              EARLY ACCESS BETA
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
      <button
        type="button"
        onClick={() => setBetaOpen(true)}
        className="fixed right-4 top-20 z-30 rounded-lg border border-[#2bb8dc]/45 bg-[#102b33]/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#b7f3ff] shadow-xl backdrop-blur sm:hidden"
      >
        EARLY ACCESS BETA
      </button>

      {betaOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#343436] bg-[#1f1f20] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">🚀 Early Access Beta</h2>
                <p className="mt-3 text-sm leading-6 text-[#c9c9cc]">
                  Cadio is currently in active development.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBetaOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2b2b2d] text-sm text-[#bdbdbd] hover:text-white"
                aria-label="Close beta information"
              >
                x
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#d9d9db]">
              <p>
                All users can generate and download 1 model for free while we improve the platform.
              </p>
              <p>
                Paid plans and additional features are coming soon.
              </p>
              <p>
                We welcome feedback at{" "}
                <a className="font-semibold text-[#69d9f5] hover:text-white" href="mailto:support@cadio.net">
                  support@cadio.net
                </a>
                .
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

        <section className="border-y border-white/10 bg-[#181818]">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2bb8dc]">
                Practical CAD flow
              </p>
              <h2 className="mt-4 max-w-xl text-3xl font-semibold text-white">
                {details.title}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#b8b8bb]">
                {details.body}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {details.items.map(([title, body]) => (
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
                  onClick={onStartBuilding}
                  className={`mt-7 h-11 w-full rounded-lg text-sm font-semibold ${
                    tier.featured ? "bg-[#2bb8dc] text-[#101010] hover:bg-[#69d9f5]" : "bg-[#2b2b2d] text-white hover:bg-[#353537]"
                  }`}
                >
                  {text.nav.start}
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

      <SiteFooter />

    </div>
  );
}
