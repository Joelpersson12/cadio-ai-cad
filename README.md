---
title: Cadio AI CAD Workspace
sdk: docker
app_port: 8000
pinned: false
---

# Cadio AI CAD Workspace

Cadio is an AI-assisted CAD workspace for generating, editing, and exporting
printable 3D models.

This repository is configured for Hugging Face Spaces using Docker. The app
serves the React frontend and FastAPI backend from one container.

## Frontend builds

The React app lives in `frontend/`, but root-level npm scripts are provided so
GitHub-connected builders such as Lovable can run `npm run dev` or
`npm run build` from the repository root and still use the current frontend.
