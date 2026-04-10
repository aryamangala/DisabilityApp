# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DisabilityApp is a fullstack mobile application that converts complex legal/medical documents into simplified "EasyRead" format for individuals with intellectual disabilities. It uses GPT-4o to simplify text into short sentences with key terms highlighted, with full Spanish/English bilingual support.

## Repository Structure

```
DisabilityApp/
├── backend/        # Node.js/Express API server
└── mobile/         # Expo React Native app
```

## Development Commands

### Backend (`backend/`)
```bash
npm start           # Start Express server on port 4000 (production mode)
npm run dev         # Start with NODE_ENV=development
```

### Mobile (`mobile/`)
```bash
npm start           # Start Expo Metro dev server
npm start:clean     # Start with cache cleared
npm start:lan       # LAN mode (for physical devices on same network)
npm start:tunnel    # Tunnel mode (for physical devices off-network)
npm run web         # Run as web app
npm run build       # Export web build to dist/
```

### EAS Builds (mobile production)
```bash
eas build --profile development
eas build --profile preview
eas build --profile production
eas submit --platform android
```

## Environment Setup

**Backend** — create `backend/.env`:
- `OPENAI_API_KEY` — required
- `OPENAI_MODEL` — defaults to `gpt-4o`
- `PORT` — defaults to 4000
- `LOG_VERBOSE` — enables verbose logging
- `CORS_ORIGIN` — comma-separated allowed origins
- `ALLOW_DIAGNOSTICS` — enables `/test-openai` diagnostic endpoint

**Mobile** — create `mobile/.env`:
- `EXPO_PUBLIC_BACKEND_URL` — production HTTPS backend URL
- `EXPO_PUBLIC_USE_LOCAL_BACKEND` — set `true` to use local backend (iOS: `127.0.0.1:4000`, Android: `10.0.2.2:4000`)
- `EAS_PROJECT_ID` — for EAS Build

For physical device testing with local backend, set `EXPO_PUBLIC_BACKEND_URL` to your machine's LAN IP (`ipconfig getifaddr en0` on Mac).

Production backend is deployed on Railway at `https://disabilityapp-production.up.railway.app`.

## Architecture

### Backend (`backend/server.mjs`)

**API Endpoints:**
- `POST /documents` — upload document (text, PDF, or base64 images for camera scans)
- `GET /documents/:docId/chunks/:i` — fetch a specific chunk with its EasyRead translation
- `GET /health` — health check

**Document Storage:** Ephemeral, in-memory only with 1-hour TTL. No user content is persisted to disk/DB.

**Text Processing Pipeline (`textUtils.mjs`):**
1. Remove headers/footers (checks first/last 20 lines)
2. Normalize line endings and page breaks
3. Smart paragraph chunking: 100–300 words per chunk, preserving semantic boundaries

**OpenAI Integration (`openaiClient.mjs`):**
- OCR for camera-captured images (base64 → text)
- EasyRead generation per chunk: short sentences, active voice, max 5 sentences, key terms extracted
- Rate limiting: 2 concurrent requests, 600ms delay between calls
- Exponential backoff retry on rate-limit errors

### Mobile (`mobile/`)

**Navigation** (`App.js`): Stack navigator with 7 screens:
- `LandingScreen` → `ImportScreen` → `ProcessingScreen` → `ReaderScreen` → `DoneScreen`
- `PreviousFilesScreen` — browse cached documents
- `SettingsScreen` — text size, language, theme

**State Management** (`src/context/`):
- `DocumentContext` — current docId, chunkCount, chunks cache, document history (all persisted to AsyncStorage)
- `SettingsContext` — textSize (small/medium/large/xlarge), language (en/es), theme (light/dark)

**API Client** (`src/api.js`): All backend calls go through here; handles URL resolution and error formatting.

**Backend URL Resolution** (`app.config.js`): Checks `EXPO_PUBLIC_USE_LOCAL_BACKEND` → env URL → `defaultPublicBackend.json` fallback.

**Key Features:**
- Multi-page camera scanning (up to 24 pages), PDF upload, direct text input
- Text-to-speech for EasyRead content
- Offline-capable via AsyncStorage chunk caching
- Full bilingual UI via `src/utils/translations.js`

## Key Patterns

- **Backend uses ES modules** (`"type": "module"` in `backend/package.json`) — use `import`/`export`, not `require`/`module.exports`
- **Mobile env vars** prefixed with `EXPO_PUBLIC_` are embedded in the app bundle and visible to users — never put secrets there
- **Chunked reading**: ReaderScreen fetches chunks on-demand (not all at once); chunks are cached in DocumentContext after first fetch
- **Language**: EasyRead output is currently forced to Spanish by the prompt in `openaiClient.mjs`; UI language is controlled separately by SettingsContext
