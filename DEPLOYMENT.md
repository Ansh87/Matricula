# Deploying Matricula

## Architecture note (read first)

This app is **same-origin by design**:

- The client calls **relative** `/api/...` paths - there is no `VITE_API_BASE_URL`.
- In development, `client/vite.config.js` proxies `/api` → `http://localhost:4000`.
- In production, the Express server serves the built client (`client/dist`) from the
  same origin, so `/api/...` resolves to itself.

Do not add an API base URL unless you split the client and server onto different
domains - doing so would add CORS complexity for no benefit.

---

## 1. Firebase setup (required - do this first)

### Enable sign-in providers
Firebase Console → **Authentication** → **Sign-in method** → enable:
- **Email/Password**
- **Google**

### Authorized domains (REQUIRED - sign-in fails without this)
Firebase Console → **Authentication** → **Settings** → **Authorized domains** → add:

```
localhost
matricula-production.up.railway.app
```

(Use whatever your actual Railway domain is - renaming the app in code does not change your live Railway service URL. If your existing deployment is still at `collegegene-navigator.up.railway.app`, keep that domain authorized in Firebase; only rename the Railway service yourself if you want the URL to change too.)

`localhost` is usually present by default. The Railway domain **must be added
manually** - otherwise Google sign-in fails with an "unauthorized domain" error.

### Service account (server secret)
Firebase Console → **Project settings** → **Service accounts** →
**Generate new private key**. This downloads a JSON file.

**This file is a real secret.** Never commit it, never paste it in the client,
never screenshot it. Its contents go into `FIREBASE_SERVICE_ACCOUNT_JSON`.

---

## 2. Local development

### `client/.env`
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...
```

### `server/.env`
```env
PORT=4000
NODE_ENV=development
COLLEGE_SCORECARD_API_KEY=your_key
GEMINI_API_KEY=optional_key_for_ai_autofill
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

`FIREBASE_SERVICE_ACCOUNT_JSON` must be the **entire JSON file on one line**.

### Run
```bash
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

Vite reads env vars only at startup - **restart after editing `.env`**.

### Optional: run without Firebase
```env
AUTH_DEV_BYPASS=true
NODE_ENV=development
```
This bypasses auth locally with a fixed dev user. It is **hard-disabled when
`NODE_ENV=production`** and off unless explicitly set.

---

## 3. Railway deployment

### Variables (Railway → your service → Variables)

**Build-time (client)** - Vite bakes these into the bundle at build:
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...
```

**Runtime (server)**:
```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
COLLEGE_SCORECARD_API_KEY=your_key
GEMINI_API_KEY=optional
NODE_ENV=production
```

**Persistence (see below)**:
```env
DB_PATH=/data/matricula.db
UPLOAD_DIR=/data/uploads
```
(Redeploying an existing project? Keep `DB_PATH` exactly as it's already set --
e.g. `/data/collegegene-navigator.db` -- renaming it points the app at a new,
empty database.)

Railway sets `PORT` automatically - do not override it.

### Persistent volume (REQUIRED for user data)

Railway's filesystem is **ephemeral** - it is wiped on every redeploy and restart.
Without a volume, all profiles, saved lists, applications, and uploaded documents
are lost each deploy.

Railway → service → **Settings** → **Volumes** → **Add Volume** →
mount path: `/data`

Then set `DB_PATH=/data/matricula.db` and `UPLOAD_DIR=/data/uploads` so the
database and uploads live on the volume. If this is an existing deployment that
already has `DB_PATH` set to something else (e.g. `/data/collegegene-navigator.db`),
leave it alone -- that's where your real saved data already lives.

### Build/start
`railway.json` sets these explicitly:
- Build: `npm run build` (installs server + client deps, builds the client)
- Start: `npm start` (runs the Express server, which serves `client/dist`)

### Public URL
Railway → Settings → **Networking** → **Generate Domain**.
Then add that domain to Firebase authorized domains (step 1).

---

## Troubleshooting

**"Upload failed: Request failed (503)" / auth errors on protected features**
The server has no Firebase Admin credentials. Set `FIREBASE_SERVICE_ACCOUNT_JSON`
and restart. 503 = server not configured; 401 = missing/invalid token.

**"AI profile build is not enabled because GEMINI_API_KEY is missing"**
Informational only - uploads still work; only AI auto-fill is off. Add
`GEMINI_API_KEY` to enable it.

**Login screen says "Authentication isn't configured yet"**
The `VITE_FIREBASE_*` vars didn't load. Check the file is exactly `client/.env`,
and **restart** the dev server (Vite reads env only at startup).

**Google sign-in fails with "unauthorized domain"**
Add your domain to Firebase → Authentication → Settings → Authorized domains.

**Data disappears after a Railway deploy**
The persistent volume isn't mounted, or `DB_PATH`/`UPLOAD_DIR` don't point at it.
