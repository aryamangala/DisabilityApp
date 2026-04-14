# ClaroDoc

An app that converts complex legal and medical documents into EasyRead format for individuals with intellectual disabilities, giving them greater autonomy over important documents.

## Architecture

```
Mobile App (Expo React Native)
  └── Custom JWT Auth      — email/password authentication (self-contained, no external auth service)
  └── Backend API          — Node.js/Express
        └── PostgreSQL     — persistent document + chunk storage (RDS in production, Docker locally)
        └── OpenAI GPT-4o  — OCR and EasyRead generation
```

**Input formats:** PDF upload, multi-page camera scan (up to 24 pages), direct text input  
**Output:** Simplified EasyRead summaries (Spanish) with key terms, original text preserved, text-to-speech

---

## Local Development Setup

### Prerequisites

- Node.js 20 or 22
- Docker Desktop (for local PostgreSQL)
- OpenAI API key — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### 1. Start PostgreSQL with Docker

```bash
docker run --name clarodoc-pg \
  -e POSTGRES_DB=disabilityapp \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=localpassword \
  -p 5432:5432 \
  -d postgres:15
```

To stop/start after initial setup:
```bash
docker stop clarodoc-pg
docker start clarodoc-pg
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env`:
```env
NODE_ENV=development
PORT=4000
OPENAI_API_KEY=your-openai-key

JWT_SECRET=your-secret-here

DB_HOST=localhost
DB_PORT=5432
DB_NAME=disabilityapp
DB_USER=postgres
DB_PASSWORD=localpassword
```

Generate a secure `JWT_SECRET`:
```bash
openssl rand -hex 32
```

Start the backend:
```bash
npm run dev
```

The server connects to PostgreSQL on startup and creates the `users`, `documents`, and `chunks` tables automatically.

### 3. Mobile App Setup

```bash
cd mobile
npm install
```

Create `mobile/.env`:
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:4000
```

For a **physical device** on the same Wi-Fi, replace `localhost` with your Mac's LAN IP:
```bash
ipconfig getifaddr en0
# e.g. EXPO_PUBLIC_BACKEND_URL=http://192.168.1.42:4000
```

Start the mobile app:
```bash
npm run start:clean   # clears Metro cache, required after .env changes
```

Then press `w` for web browser, `i` for iOS simulator, or scan the QR code with Expo Go.

---

## Running

| Terminal | Command |
|---|---|
| 1 — Backend | `cd backend && npm run dev` |
| 2 — Mobile | `cd mobile && npm run start:clean` |

After restarting your machine:
```bash
docker start clarodoc-pg   # restart PostgreSQL first
```

---

## Database

Documents and chunks are stored in PostgreSQL. To inspect:

```bash
# Connect to local DB
docker exec -it clarodoc-pg psql -U postgres -d disabilityapp

# Useful queries
SELECT user_id, email, created_at FROM users;
SELECT doc_id, title, created_at FROM documents;
SELECT doc_id, chunk_index, heading FROM chunks;
\q
```

**`users` table** — one row per registered user; passwords stored as bcrypt hashes  
**`documents` table** — one row per uploaded document, scoped to `user_id`  
**`chunks` table** — one row per chunk; `easyread_json` is null until first read, then permanently stored

---

## API Endpoints

All endpoints except `/health`, `/auth/register`, and `/auth/login` require `Authorization: Bearer <access_token>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (no auth) |
| `POST` | `/auth/register` | Create account (email + password) |
| `POST` | `/auth/login` | Sign in — returns `{ accessToken, email }` |
| `GET` | `/documents` | List authenticated user's documents |
| `POST` | `/documents` | Upload document (JSON text, PDF, or images) |
| `GET` | `/documents/:docId/chunks/:i` | Fetch chunk; generates EasyRead on first access |
| `DELETE` | `/documents/:docId` | Delete document and all its chunks |

---

## Authentication

The app uses **custom JWT authentication** — no external auth service required. Users register with email and password; passwords are hashed with bcrypt and stored in the `users` PostgreSQL table. On sign-in, a signed JWT (7-day expiry) is returned and stored securely on-device (SecureStore on native, AsyncStorage on web).

Auth screens: Login → Sign Up → App  
Password reset: not yet implemented

---

## Features

- **Authentication** — Sign up and sign in with email/password (custom JWT, self-contained)
- **Document Import** — PDF upload, multi-page camera scan, direct text input
- **EasyRead Conversion** — GPT-4o simplifies text into short sentences with key terms
- **Cloud Sync** — Documents stored in PostgreSQL, accessible across devices after login
- **Offline Cache** — Processed chunks cached locally for offline reading
- **Previous Files** — Full document history per user account
- **Text-to-Speech** — Read EasyRead content aloud
- **Bilingual UI** — Full English and Spanish interface
- **Accessibility** — Adjustable text size (small / medium / large / x-large), light/dark theme

---

## Production Deployment (AWS)

| Service | Purpose |
|---|---|
| AWS App Runner | Backend hosting (auto-scaling, 1 vCPU / 2 GB RAM) |
| Amazon RDS PostgreSQL | Persistent database (`db.t3.micro`) |
| AWS Secrets Manager | OpenAI key, JWT secret, and DB credentials |
| EAS Build | Mobile app builds for iOS and Android |

### Step 1: Create RDS PostgreSQL

1. AWS Console → **RDS** → **Create database**
2. Engine: **PostgreSQL 15**, Template: **Free tier**
3. DB name: `disabilityapp`, username: `postgres`, choose a strong password
4. Connectivity: enable **Public access** initially (lock down with VPC security groups later)
5. Note down the **endpoint URL** after creation

### Step 2: Push Backend to ECR

```bash
# Authenticate Docker with ECR (replace region and account ID)
aws ecr get-login-password --region us-east-2 | \
  docker login --username AWS --password-stdin \
  YOUR_ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com

# Create repository
aws ecr create-repository --repository-name clarodoc-backend --region us-east-2

# Build and push (from the backend/ directory)
cd backend
docker build --platform linux/amd64 -t clarodoc-backend .
docker tag clarodoc-backend:latest \
  YOUR_ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/clarodoc-backend:latest
docker push \
  YOUR_ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/clarodoc-backend:latest
```

### Step 3: Create App Runner Service

1. AWS Console → **App Runner** → **Create service**
2. Source: **Container registry → Amazon ECR** → select `clarodoc-backend`
3. Deployment trigger: **Automatic**
4. Port: **4000**, CPU: **1 vCPU**, Memory: **2 GB**
5. Add environment variables:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | your OpenAI key |
| `JWT_SECRET` | output of `openssl rand -hex 32` |
| `DB_HOST` | your RDS endpoint |
| `DB_PORT` | `5432` |
| `DB_NAME` | `disabilityapp` |
| `DB_USER` | `postgres` |
| `DB_PASSWORD` | your RDS password |

6. Note down the App Runner URL (e.g. `https://xxxx.us-east-2.awsapprunner.com`)

> Database tables are created automatically on first backend startup — no manual SQL needed.

### Step 4: Update Mobile Config

In `mobile/eas.json`, replace the placeholder URL in all three build profiles:

```json
"EXPO_PUBLIC_BACKEND_URL": "https://xxxx.us-east-2.awsapprunner.com"
```

### Step 5: Build and Submit Mobile App

```bash
cd mobile

# Internal testing build (Android APK + iOS)
eas build --profile preview --platform all

# Production build for App Store / Play Store
eas build --profile production --platform all

# Submit to stores
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

---

## Common Issues

**Port 4000 already in use:**
```bash
kill -9 $(lsof -ti:4000)
```

**Documents not saving to database:**
- Ensure `EXPO_PUBLIC_BACKEND_URL` is explicitly set in `mobile/.env`
- Restart Expo with `npm run start:clean` after any `.env` change

**PDF upload fails:**
- Scanned/image-based PDFs are not supported — use camera scan mode instead
- Text-based PDFs must contain at least 200 characters of extractable text

**Cannot connect to backend on physical device:**
- Use your Mac's LAN IP (`ipconfig getifaddr en0`), not `localhost`
- Mac and phone must be on the same Wi-Fi network
