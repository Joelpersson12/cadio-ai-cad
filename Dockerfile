# Stage 1: Build frontend static assets
FROM node:20-slim AS frontend-build
ARG GOOGLE_CLIENT_ID=""
ARG STRIPE_PUBLISHABLE_KEY=""
ENV VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV VITE_STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + serve built frontend
FROM python:3.11-slim AS runtime
WORKDIR /app

# CadQuery brings OpenCascade/OCP binary wheels for real CAD operations.
# The app still has a mesh fallback if the optional kernel import fails.

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        libx11-6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY main.py ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
