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
- `JWT_SECRET` — required; generate with `openssl rand -hex 32`
- `GMAIL_USER`, `GMAIL_APP_PASSWORD` — Gmail address + App Password for password reset emails (requires Gmail 2-Step Verification; create App Password at myaccount.google.com/apppasswords)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — PostgreSQL connection (local Docker or RDS)

**Mobile** — create `mobile/.env`:
- `EXPO_PUBLIC_BACKEND_URL` — set explicitly to backend URL (local: `http://localhost:4000`, production: App Runner HTTPS URL)
- `EAS_PROJECT_ID` — for EAS Build

For physical device testing with local backend, set `EXPO_PUBLIC_BACKEND_URL` to your machine's LAN IP (`ipconfig getifaddr en0` on Mac). Always run `npm run start:clean` after any `.env` change.

Local PostgreSQL via Docker:
```bash
docker start clarodoc-pg   # start existing container
docker run --name clarodoc-pg -e POSTGRES_DB=disabilityapp -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=localpassword -p 5432:5432 -d postgres:15   # first-time setup
```

Production target: AWS App Runner (backend) + Amazon RDS PostgreSQL (database). See README for full deployment steps.

## Architecture

### Backend (`backend/server.mjs`)

**API Endpoints** (auth endpoints are public; all others require `Authorization: Bearer <access_token>`):
- `GET /health` — health check (no auth)
- `POST /auth/register` — create account; hashes password with bcrypt, stores in `users` table
- `POST /auth/login` — verify password, return signed JWT (`{ accessToken, email }`)
- `POST /auth/forgot-password` — generate 6-digit reset code, bcrypt-hash and store with 15-min expiry, send via Gmail SMTP
- `POST /auth/reset-password` — verify code with bcrypt.compare, check expiry, update password_hash, clear reset fields
- `GET /documents` — list authenticated user's documents
- `POST /documents` — upload document (JSON text, PDF, or images)
- `GET /documents/:docId/chunks/:i` — fetch chunk; generates EasyRead on first access, then caches to DB
- `DELETE /documents/:docId` — delete document and all its chunks

**Authentication:** `authMiddleware.mjs` uses `jsonwebtoken.verify()` with `JWT_SECRET` env var; attaches `req.userId = payload.sub` (UUID from `users` table) to all protected requests. Passwords hashed with bcrypt (saltRounds: 12).

**Document Storage:** Persistent PostgreSQL via `db.mjs` (pg Pool). Tables are created automatically by `initDb()` on startup. SSL is enabled automatically when `NODE_ENV=production`.

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

**Navigation** (`App.js`): Dual-stack navigator — `AuthNavigator` (Login, SignUp, ForgotPassword) shown when unauthenticated; `AppNavigator` shown when authenticated:
- `LandingScreen` → `ImportScreen` → `ProcessingScreen` → `ReaderScreen` → `DoneScreen`
- `PreviousFilesScreen` — browse documents (fetched from backend, falls back to AsyncStorage cache)
- `SettingsScreen` — text size, language, theme, account (email + sign out)

**Authentication** (`src/context/AuthContext.js`): Custom JWT sign-in/sign-up/sign-out/password-reset via `fetch()` to the `/auth/*` backend routes. Tokens stored under key `app_access_token` in `expo-secure-store` on native, `AsyncStorage` on web. Access token sent as `Authorization: Bearer` header on all API calls. Session restored on app launch by reading stored token and checking JWT `exp` claim locally. Password reset uses `requestPasswordReset(email)` + `resetPassword(email, code, newPassword)` — both exposed from the context.

**State Management** (`src/context/`):
- `DocumentContext` — current docId, chunkCount, chunks cache, document history; `refreshDocIndex` calls API first then falls back to AsyncStorage; `deleteLocalDocument` calls DELETE API before clearing local cache
- `SettingsContext` — textSize (small/medium/large/xlarge), language (en/es), theme (light/dark)

**API Client** (`src/api.js`): All backend calls go through here; handles URL resolution, auth headers (Platform-aware: SecureStore on native, AsyncStorage on web), and error formatting.

**Backend URL Resolution** (`app.config.js`): Checks `EXPO_PUBLIC_BACKEND_URL` env var → `defaultPublicBackend.json` fallback. Always use explicit `EXPO_PUBLIC_BACKEND_URL`; `EXPO_PUBLIC_USE_LOCAL_BACKEND` is unreliable.

**Key Features:**
- Multi-page camera scanning (up to 24 pages), PDF upload, direct text input
- Text-to-speech for EasyRead content
- Offline-capable via AsyncStorage chunk caching
- Full bilingual UI via `src/utils/translations.js`

## Key Patterns

- **Backend uses ES modules** (`"type": "module"` in `backend/package.json`) — use `import`/`export`, not `require`/`module.exports`; undeclared variable assignments throw `ReferenceError` in strict mode
- **Mobile env vars** prefixed with `EXPO_PUBLIC_` are embedded in the app bundle at Metro bundle time — never put secrets there; always run `npm run start:clean` after `.env` changes
- **Platform-aware storage**: `expo-secure-store` does not support web — always guard with `Platform.OS !== "web"` and fall back to `AsyncStorage`
- **Chunked reading**: ReaderScreen fetches chunks on-demand (not all at once); chunks are cached in DocumentContext after first fetch; EasyRead is generated once and permanently stored in `chunks.easyread_json`
- **Language**: EasyRead output is currently forced to Spanish by the prompt in `openaiClient.mjs`; UI language is controlled separately by SettingsContext
- **Database**: `users` table stores accounts; `documents` table scoped to `user_id` (UUID from `users`); `chunks` table has `ON DELETE CASCADE` — deleting a document removes all its chunks automatically
- **JWT tokens**: 7-day expiry, HS256, signed with `JWT_SECRET`; no refresh token — user re-logs in when expired; expiry checked client-side by decoding the JWT payload (no library needed)
