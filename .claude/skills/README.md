# Project skills

Claude Code skills committed here so they're available in every session that
clones this repo (including cloud/web sessions).

## UX skills

The `accessibility`, `ai-*`, `cognitive-load-conversion`, `double-diamond`,
`empathy-mapping`, `feature-prioritization`, `general-design-review`,
`journey-mapping`, `persuasive-ux`, `ux-*` skills are the
**awesome-ux-skills** by Tommy Jepsen (MIT licensed):
https://github.com/tommyjepsen/awesome-ux-skills

They provide UX/usability review lenses (design review, heuristics, accessibility,
conversion, personas, journeys, AI-product patterns) used when polishing Cadio's UI.

## Anthropic official skills

From https://github.com/anthropics/skills (skills are individually licensed,
see each skill's LICENSE.txt):

- `frontend-design` — distinctive, non-generic UI/visual design guidance
- `skill-creator` — build and optimize your own Claude skills
- `mcp-builder` — build MCP servers (Python/TypeScript)

## Community skills

- `find-skills` — discover/install skills from the open ecosystem
  (https://github.com/vercel-labs/skills, `skills/find-skills`, MIT)
- `humanizer` — strip AI-writing tells from text
  (https://github.com/blader/humanizer, see bundled LICENSE)
- `hyperframes`, `hyperframes-core`, `hyperframes-cli` — write HTML, render
  video (https://github.com/heygen-com/hyperframes, MIT). Only the router +
  core + CLI skills are committed; the specialized workflow skills
  (product-launch-video, motion-graphics, etc. — some are 5–40 MB) install on
  demand with `npx skills add heygen-com/hyperframes --skill <name>`, and the
  `hyperframes` router skill tells the agent to do exactly that when needed.
- `seo` + `seo-*` (25 skills) — Claude SEO by Daniel Agrici
  (https://github.com/AgriciDaniel/claude-seo, MIT). Installed per the
  project's install.sh layout: sub-skills as siblings, shared
  `schema/ pdf/ scripts/ hooks/ requirements.txt` under `seo/`, and the 18
  `seo-*` subagents in `../agents/`. The Python helper scripts need
  `pip install -r .claude/skills/seo/requirements.txt` (the skills degrade
  gracefully without them). Optional paid extensions (DataForSEO, Banana)
  are NOT committed.

Not committed here: `ui-ux-pro-max` — it's a full plugin (CLI + data files) that
needs `npm i -g ui-ux-pro-max-cli` / the Claude Code plugin marketplace; its
markdown alone would reference tooling that isn't present.
