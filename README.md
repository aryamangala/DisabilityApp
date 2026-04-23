<div align="center">

# ⚖ ClaroDoc

**Making legal and medical documents accessible to everyone**

ClaroDoc converts complex legal and medical documents into **EasyRead format** — simplified language with short sentences and highlighted key terms — giving individuals with intellectual disabilities greater autonomy over the documents that affect their lives.

---

*Built with Node.js · Expo React Native · PostgreSQL · GPT-4o*

</div>

---

## Branches

| Branch | Description |
|---|---|
| **`main`** (this branch) | Web page application [Link] (https://clarodoc.digital/) |
| **`aws_deploy`** | AWS EC2 deployment — Docker Compose, nginx, S3, and full deployment guide |

> For AWS deployment instructions, switch to the [`aws_deploy`](../../tree/aws_deploy) branch and follow [docs/deploy-ec2.md](../../blob/aws_deploy/docs/deploy-ec2.md).

---

## What It Does

| Input | Output |
|---|---|
| PDF upload | Simplified EasyRead summaries |
| Multi-page camera scan (up to 24 pages) | Key terms with definitions |
| Direct text paste | Text-to-speech playback |

- Full **English and Spanish** UI
- Adjustable text size (small / medium / large / x-large)
- Light and dark theme
- Documents synced to the cloud — accessible after login on any device
- Offline reading via local chunk cache

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           Mobile App (Expo React Native)     │
│  Login · Import · Reader · History · Settings│
└────────────────────┬────────────────────────┘
                     │ REST API (JWT Bearer)
┌────────────────────▼────────────────────────┐
│           Backend (Node.js / Express)        │
│  Auth · Document Processing · Chunk Serving  │
└──────┬───────────────────────┬──────────────┘
       │                       │
┌──────▼──────┐      ┌─────────▼─────────┐
│ PostgreSQL  │      │   OpenAI GPT-4o    │
│  Documents  │      │  OCR + EasyRead    │
│  Chunks     │      │  Generation        │
│  Users      │      └───────────────────┘
└─────────────┘
```

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop/) (for local PostgreSQL)
- **OpenAI API key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gmail account with 2FA** — for password reset emails

---

## Local Development Setup

### Step 1 — Start PostgreSQL

```bash
docker run --name clarodoc-pg \
  -e POSTGRES_DB=disabilityapp \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=localpassword \
  -p 5432:5432 \
  -d postgres:15
```

After the first run, use `docker start clarodoc-pg` to restart it.

---

### Step 2 — Set Up the Backend

```bash
cd backend
npm install
```

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

Minimum required fields in `backend/.env`:

```env
NODE_ENV=development
PORT=4000

OPENAI_API_KEY=sk-...          # your OpenAI key
JWT_SECRET=                    # run: openssl rand -hex 32

GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=            # 16-char Gmail App Password

DB_HOST=localhost
DB_PORT=5432
DB_NAME=disabilityapp
DB_USER=postgres
DB_PASSWORD=localpassword
```

> **Gmail App Password:** go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create a password named "ClaroDoc", and paste the 16-character result (no spaces).

Start the backend:

```bash
npm run dev
```

The server starts on `http://localhost:4000`. Database tables are created automatically on first run.

---

### Step 3 — Set Up the Mobile App

```bash
cd mobile
npm install
```

Create `mobile/.env`:

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:4000
```

> **Physical device?** Replace `localhost` with your Mac's LAN IP:
> ```bash
> ipconfig getifaddr en0
> ```

Start the app:

```bash
npm run start:clean
```

Then press:
- **`w`** — open in web browser
- **`i`** — open in iOS simulator
- **`a`** — open in Android emulator
- **Scan QR code** — open in Expo Go on your phone

---

### Running Both Together

Open two terminals:

| Terminal | Command |
|---|---|
| 1 — Backend | `cd backend && npm run dev` |
| 2 — Mobile | `cd mobile && npm run start:clean` |

> Always start PostgreSQL first: `docker start clarodoc-pg`

---

## Project Structure

```
DisabilityApp/
├── backend/
│   ├── server.mjs          # API routes and request handling
│   ├── db.mjs              # PostgreSQL connection and schema
│   ├── openaiClient.mjs    # GPT-4o OCR and EasyRead generation
│   ├── textUtils.mjs       # Text chunking and normalization
│   ├── authMiddleware.mjs  # JWT verification
│   ├── Dockerfile          # Production container image
│   └── .env.example        # All environment variable options
│
├── mobile/
│   ├── src/
│   │   ├── screens/        # All app screens
│   │   ├── context/        # Auth, Document, Settings state
│   │   ├── components/     # Shared UI components
│   │   ├── api.js          # Backend API client
│   │   └── utils/          # Translations, helpers
│   ├── app.config.js       # Expo config
│   ├── eas.json            # EAS Build profiles
│   └── .env.example        # Mobile environment options
│
├── docker-compose.yml      # Backend + PostgreSQL (used in aws_deploy)
└── README.md
```

---

## API Reference

All endpoints except `/health`, `/auth/register`, and `/auth/login` require:
```
Authorization: Bearer <access_token>
```

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{"ok":true}` |
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Sign in — returns `{ accessToken, email }` |
| `POST` | `/auth/forgot-password` | Send 6-digit reset code by email |
| `POST` | `/auth/reset-password` | Verify code and set new password |
| `GET` | `/documents` | List user's documents |
| `POST` | `/documents` | Upload document (text, PDF, or images) |
| `GET` | `/documents/:docId/chunks/:i` | Fetch chunk (generates EasyRead on first access) |
| `DELETE` | `/documents/:docId` | Delete document and all chunks |

---

## Database

Tables are created automatically on first backend startup — no manual SQL needed.

```bash
# Connect to local database
docker exec -it clarodoc-pg psql -U postgres -d disabilityapp

# Useful queries
SELECT email, created_at FROM users ORDER BY created_at DESC;
SELECT doc_id, title, created_at FROM documents ORDER BY created_at DESC;
\q
```

| Table | Purpose |
|---|---|
| `users` | Registered accounts — bcrypt-hashed passwords, password reset fields |
| `documents` | One row per document, scoped to the user who uploaded it |
| `chunks` | One row per chunk — `easyread_json` cached on first read |

---

## Authentication

ClaroDoc uses **custom JWT authentication** — no external auth service required.

- Register with email and password
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens have a 7-day expiry, stored securely on-device
- **Password reset:** user requests a code by email → enters code + new password → redirected to login. Reset codes are bcrypt-hashed before storage; plaintext is never saved.

---

## Common Issues

**Port 4000 already in use:**
```bash
kill -9 $(lsof -ti:4000)
```

**PostgreSQL not running:**
```bash
docker start clarodoc-pg
```

**Mobile app can't reach backend on a physical device:**
- Use your Mac's LAN IP (`ipconfig getifaddr en0`), not `localhost`
- Phone and Mac must be on the same Wi-Fi network
- Always run `npm run start:clean` after changing `mobile/.env`

**PDF upload fails:**
- Scanned / image-only PDFs are not supported — use camera scan mode instead
- Text-based PDFs must contain at least 200 characters of extractable text

**EasyRead is slow on first open:**
- GPT-4o is called once per chunk on first read, then permanently cached
- Subsequent reads are instant

---

## Deployment

> This branch is for **local development only**.
>
> For production deployment on **AWS EC2** with Docker Compose, nginx, and S3, see the **[`aws_deploy` branch](../../tree/aws_deploy)** and its step-by-step guide at `docs/deploy-ec2.md`.
