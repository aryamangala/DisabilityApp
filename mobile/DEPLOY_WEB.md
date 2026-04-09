# Deploy ClaroDoc web (test now)

The API URL is **baked in at build time** via `EXPO_PUBLIC_BACKEND_URL`. Set it in `.env` locally, or in your host’s environment variables for production builds.

## 1. Test locally (this machine)

```bash
cd mobile
npm install
npm run build
npm run web:preview
```

Open **http://localhost:4173** (or `http://<your-LAN-IP>:4173` from your phone on the same Wi‑Fi).

## 2. Deploy to Vercel (HTTPS, good for phone testing)

1. Push this repo to GitHub (or use Vercel CLI).
2. **New Project** → import the repo.
3. **Root Directory:** `mobile`
4. **Framework Preset:** Other  
5. **Build Command:** `npm run build` (runs `expo export -p web`)
6. **Output Directory:** `dist`
7. **Environment variables:** add `EXPO_PUBLIC_BACKEND_URL` = your public HTTPS API (e.g. `https://….up.railway.app`)
8. Deploy → open the `https://….vercel.app` URL on your phone.

`vercel.json` only adds SPA routing (refresh/deep links work).

## 3. Deploy to Netlify

1. **New site from Git** (or drag-and-drop the `dist` folder after `npm run build`).
2. **Base directory:** `mobile` (if monorepo).
3. **Build command:** `npm run build`
4. **Publish directory:** `dist`
5. **Environment variables:** same `EXPO_PUBLIC_BACKEND_URL` as above.

`netlify.toml` is included; `public/_redirects` is copied into `dist` for SPA fallback.

## 4. Rebuild after changing the API URL

Change the env var on the host, then **Redeploy**. The bundle does not read `EXPO_PUBLIC_*` at runtime.
