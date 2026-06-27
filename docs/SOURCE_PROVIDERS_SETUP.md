# Aktivera Thingiverse & MakerWorld i Cadio

**Status (Steg 2 klart):** Import-pipelinen är nu generaliserad. Cadio söker
*och importerar* från Printables, Thingiverse och MakerWorld via en gemensam
fil-upplösare som hanterar STL, OBJ och `.zip`-arkiv (Thingiverse levererar
ofta zippade filer) samt `.3mf`. Varje importerad modell visar källa, skapare
och licens via "i"-knappen, och Cadio vägrar AI-redigera modeller vars licens
förbjuder derivat.

- **Printables** — full sök + flerdelad import + signerade nedladdningar.
- **Thingiverse** — kräver `THINGIVERSE_TOKEN`. Zippade filer packas upp
  automatiskt; största mesh används.
- **MakerWorld** — sök utan token; fil-nedladdning är "best effort" (filer ofta
  bakom inloggning, faller då tillbaka till andra källor).

Verifiera alltid via diagnostiken efter att en token lagts in:
`https://persson12-cadio-ai-cad.hf.space/api/debug/pipeline?q=phone+stand`

---

## ✅ Att göra — Thingiverse

Thingiverse har ett riktigt, gratis app-token-system. Hög chans att lyckas.

- [ ] 1. Gå till https://www.thingiverse.com/apps/create
- [ ] 2. Välj **"Desktop App"**, namn t.ex. "Cadio", spara
- [ ] 3. Kopiera **"App Token"** (lång teckensträng) från appens sida
- [ ] 4. HF Space → **Settings → Variables and secrets → New secret**
       - Namn: `THINGIVERSE_TOKEN`
       - Värde: tokenet
- [ ] 5. Spara (Spacet startar om automatiskt, ~2–3 min)
- [ ] 6. Öppna diagnostiken och kontrollera `thingiverse`-fältet:
       - `token_present: true`
       - `search_count` > 0
       - `files` innehåller STL-filer med `has_url: true`
- [ ] 7. Skicka `thingiverse`-fältet till Claude → **Steg 2: koppla in i import-pipelinen**

---

## ✅ Att göra — MakerWorld

MakerWorld (Bambu) har **inget publikt app-token-system** och ligger bakom
Cloudflare. Lägre chans, men vi testar. Två vägar:

### Väg A — prova utan token först (enklast)
- [ ] 1. Öppna diagnostiken och titta på `makerworld.endpoint_probes`
       - Om någon endpoint visar `status: 200` + JSON med modeller → det räcker,
         skicka `makerworld`-fältet till Claude för Steg 2.
       - Om alla visar `403` / `blocked_markers` (Cloudflare) → gå till Väg B.

### Väg B — token från inloggad session (om Väg A blockeras)
- [ ] 1. Logga in på https://makerworld.com i webbläsaren
- [ ] 2. Öppna DevTools (F12) → fliken **Network**
- [ ] 3. Ladda om sidan, klicka på ett `api/v1/...`-anrop
- [ ] 4. Under **Request Headers**, kopiera värdet på `Authorization`
       (börjar oftast med `Bearer ...`)
- [ ] 5. HF Space → **Settings → Variables and secrets → New secret**
       - Namn: `MAKERWORLD_TOKEN`
       - Värde: hela `Authorization`-värdet (med eller utan "Bearer")
- [ ] 6. Spara, vänta på omstart, kör diagnostiken igen
- [ ] 7. Skicka `makerworld`-fältet till Claude → Steg 2

> OBS: en session-token (Väg B) kan gå ut efter ett tag. Om MakerWorld slutar
> fungera senare kan token behöva förnyas. Thingiverse-tokenet (app-token) går
> inte ut på samma sätt.

---

## Vad Claude gör i "Steg 2"

När diagnostiken visar att en källa returnerar riktiga modeller **och** filer:
1. Generaliserar fil-upplösningen så pipelinen inte är låst till Printables.
2. Kopplar in källan i `_try_replace_with_imported_source_model` m.fl.
3. Verifierar via diagnostiken att en riktig modell importeras (inte en låda).
