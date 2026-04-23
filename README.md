# ⚖ ClaroDoc

ClaroDoc converts complex legal and medical documents into **EasyRead format** for individuals with intellectual disabilities — giving them greater autonomy over the documents that affect their lives.

Users upload a PDF, scan pages with their camera, or paste text. The backend extracts and chunks the content, then uses GPT-4o to generate simplified summaries with short sentences and key terms highlighted. Full English and Spanish support throughout.

---

## Architecture

```
Mobile App (Expo React Native)
  └── Custom JWT Auth         — email/password, no external auth service
  └── Backend API             — Node.js/Express (Docker on EC2)
        └── PostgreSQL        — persistent document + chunk storage
        └── OpenAI GPT-4o     — OCR and EasyRead generation
        └── AWS S3            — original file storage (PDF, images, text)
```

**Input:** PDF upload, multi-page camera scan (up to 24 pages), direct text input  
**Output:** Simplified EasyRead summaries with key terms, original text preserved, text-to-speech playback

---

## Features

- **Document Import** — PDF, multi-page camera scan, or plain text
- **EasyRead Conversion** — GPT-4o simplifies into short sentences with highlighted key terms
- **Cloud Sync** — documents stored in PostgreSQL, accessible after login on any device
- **Offline Cache** — processed chunks cached locally for offline reading
- **Previous Files** — full document history per user account
- **Text-to-Speech** — read EasyRead content aloud
- **Bilingual UI** — full English and Spanish interface
- **Accessibility** — adjustable text size (small / medium / large / x-large), light/dark theme
- **Authentication** — sign up / sign in with email and password, password reset via email

---

## Repository Structure

```
DisabilityApp/
├── backend/              # Node.js/Express API (port 4000)
│   ├── server.mjs        # API routes and request handling
│   ├── db.mjs            # PostgreSQL connection and schema init
│   ├── openaiClient.mjs  # GPT-4o OCR and EasyRead generation
│   ├── textUtils.mjs     # Text chunking and normalization
│   ├── authMiddleware.mjs # JWT verification middleware
│   ├── Dockerfile        # Production container image
│   └── .env.example      # Environment variable reference
├── mobile/               # Expo React Native app
│   ├── src/
│   │   ├── screens/      # LoginScreen, ImportScreen, ReaderScreen, etc.
│   │   ├── context/      # AuthContext, DocumentContext, SettingsContext
│   │   ├── api.js        # Backend API client
│   │   └── utils/        # Translations, helpers
│   ├── app.config.js     # Expo config (reads EXPO_PUBLIC_BACKEND_URL)
│   ├── eas.json          # EAS Build profiles
│   └── .env.example      # Mobile environment variable reference
├── infra/
│   └── nginx/            # nginx config templates for EC2
├── docker-compose.yml    # Runs backend + PostgreSQL together
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 20 or 22
- Docker Desktop
- OpenAI API key — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Gmail account with 2FA enabled (for password reset emails)

### 1. Start PostgreSQL

```bash
docker run --name clarodoc-pg \
  -e POSTGRES_DB=disabilityapp \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=localpassword \
  -p 5432:5432 \
  -d postgres:15
```

After initial setup, use `docker start clarodoc-pg` / `docker stop clarodoc-pg`.

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env` (see `backend/.env.example` for all options):

```env
NODE_ENV=development
PORT=4000

OPENAI_API_KEY=sk-...

JWT_SECRET=        # openssl rand -hex 32

GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

DB_HOST=localhost
DB_PORT=5432
DB_NAME=disabilityapp
DB_USER=postgres
DB_PASSWORD=localpassword
```

**Gmail App Password:** enable 2-Step Verification at [myaccount.google.com](https://myaccount.google.com), then create an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

```bash
npm run dev
```

Tables (`users`, `documents`, `chunks`) are created automatically on first startup.

### 3. Mobile App

```bash
cd mobile
npm install
```

Create `mobile/.env`:

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:4000
```

For a **physical device** on the same Wi-Fi, use your machine's LAN IP instead of `localhost`:
```bash
ipconfig getifaddr en0
```

```bash
npm run start:clean   # always use after .env changes
```

Press `w` for web, `i` for iOS simulator, or scan the QR code with Expo Go.

### Running Both Together

| Terminal | Command |
|---|---|
| 1 — PostgreSQL | `docker start clarodoc-pg` |
| 2 — Backend | `cd backend && npm run dev` |
| 3 — Mobile | `cd mobile && npm run start:clean` |

---

## EC2 Deployment

The `aws_deploy` branch is configured for AWS EC2 with Docker Compose (backend + PostgreSQL), nginx serving the web frontend, and S3 for file storage.

See the full step-by-step guide: [docs/deploy-ec2.md](docs/deploy-ec2.md)

**Quick summary of the running stack:**
- Docker Compose runs PostgreSQL and the Node.js backend on the EC2 host
- nginx serves the Expo web build as a static SPA on port 80
- nginx also proxies `/api` traffic to the backend (port 3000) when accessed via the ALB hostname
- S3 stores uploaded files (PDFs, images, plain text); accessed via EC2 IAM instance profile — no access keys needed

---

## Database

Tables are created automatically by `initDb()` on backend startup.

| Table | Purpose |
|---|---|
| `users` | One row per registered user; bcrypt-hashed passwords; reset token fields |
| `documents` | One row per document, scoped to `user_id`; stores S3 key and bucket |
| `chunks` | One row per chunk; `easyread_json` is null until first read, then cached permanently |

```bash
# Inspect local DB
docker exec -it clarodoc-pg psql -U postgres -d disabilityapp

# Inspect EC2 DB (Docker Compose)
docker exec -it disabilityapp-db-1 psql -U postgres -d disabilityapp
```

Useful queries:
```sql
SELECT user_id, email, created_at FROM users;
SELECT doc_id, title, s3_key, created_at FROM documents ORDER BY created_at DESC;
SELECT doc_id, chunk_index, heading FROM chunks;
```

---

## API Reference

All endpoints except `/health`, `/auth/register`, and `/auth/login` require:
```
Authorization: Bearer <access_token>
```

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{"ok":true}` |
| `POST` | `/auth/register` | Create account (email + password) |
| `POST` | `/auth/login` | Sign in — returns `{ accessToken, email }` |
| `POST` | `/auth/forgot-password` | Send 6-digit reset code to email |
| `POST` | `/auth/reset-password` | Verify code and set new password |
| `GET` | `/documents` | List authenticated user's documents |
| `POST` | `/documents` | Upload document (JSON text, PDF, or images) |
| `GET` | `/documents/:docId/chunks/:i` | Fetch chunk; generates EasyRead on first access |
| `DELETE` | `/documents/:docId` | Delete document and all its chunks |

**POST /documents** accepts three input types:

```json
{ "inputType": "text", "title": "...", "language": "es", "text": "..." }
```
```json
{ "inputType": "pdf",  "title": "...", "language": "es" }
// multipart/form-data with file field
```
```json
{ "inputType": "image", "title": "...", "language": "es", "imagePages": ["base64...", ...] }
```

---

## EAS Mobile Builds

Build profiles are defined in `mobile/eas.json`. Update `EXPO_PUBLIC_BACKEND_URL` in each profile to point to your backend before building.

```bash
cd mobile

# Internal testing APK (Android)
eas build --profile preview --platform android

# Production build
eas build --profile production --platform all

# Submit to Google Play (internal track)
eas submit --profile production --platform android
```

---

## Common Issues

**Port 4000 already in use:**
```bash
kill -9 $(lsof -ti:4000)
```

**Backend not connecting to PostgreSQL:**
- Ensure the Docker container is running: `docker ps`
- Check `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `.env`

**Mobile app can't reach backend on physical device:**
- Use your machine's LAN IP (`ipconfig getifaddr en0`), not `localhost`
- Phone and Mac must be on the same Wi-Fi network
- Always run `npm run start:clean` after changing `.env`

**PDF upload fails:**
- Scanned/image-only PDFs are not supported — use camera scan mode instead
- Text-based PDFs must contain at least 200 characters of extractable text

**EasyRead generation is slow:**
- GPT-4o is called once per chunk on first read, then permanently cached
- Long documents (many chunks) take longer on first open; subsequent reads are instant
