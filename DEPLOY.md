# Chatlly — Deployment Guide

Real-time Hebrew/English chat platform. Node.js + Socket.io backend, React (Vite) frontend.

## Architecture

| Service | Folder | Platform | Why |
|---|---|---|---|
| Frontend | `frontend/` | **Vercel** | Static Vite/React build |
| Backend | `backend/` | **Railway** | Needs WebSocket (Socket.io) — Vercel cannot host it |

> The split is required. Do **not** merge into a single Vercel deployment: Socket.io needs a
> persistent server, which Vercel's serverless functions do not provide.

---

## 1. Backend → Railway

**Root directory:** `backend`
**Build:** Nixpacks (auto)
**Start command:** `npm start`
**Health check:** `/health`

### Persistent storage — REQUIRED

Add a **Volume** in Railway and mount it at `/data`.

Without it, the container filesystem resets on every restart/redeploy and the app loses
all IP bans, user records and chat history. With it, everything survives.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | Bots do not work without it |
| `JWT_SECRET` | ✅ | Long random string. `openssl rand -hex 32` |
| `ADMIN_USERNAME` | ✅ | Default `Mikeygold` |
| `ADMIN_PASSWORD` | ✅ | Chat admin + control panel |
| `PANEL_USERNAME` | ✅ | Same as admin username |
| `PANEL_PASSWORD` | ✅ | Same as admin password |
| `FRONTEND_URL` | ✅ | Deployed Vercel URL — locks CORS. Never `*` in production |
| `DATA_DIR` | ✅ | `/data` (the mounted volume) |
| `PORT` | ❌ | Railway injects this automatically |

---

## 2. Frontend → Vercel

**Root directory:** `frontend`
**Framework:** Vite
**Build:** `npm run build`
**Output:** `dist`

`vercel.json` is included and adds SPA rewrites so `/chat`, `/panel` and `/admin`
work correctly on refresh.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `VITE_BACKEND_URL` | ✅ | The Railway backend URL, e.g. `https://xxx.up.railway.app` |

---

## 3. Order of operations

1. Deploy the **backend** to Railway first (with the volume mounted at `/data`).
2. Copy the generated Railway URL.
3. Deploy the **frontend** to Vercel with `VITE_BACKEND_URL` set to that URL.
4. Copy the generated Vercel URL.
5. Go back to Railway and set `FRONTEND_URL` to the Vercel URL, then redeploy the backend.

Step 5 matters: CORS stays closed until the backend knows the frontend's domain.

---

## 4. Notes

- **Node:** 18 or newer (declared in `backend/package.json`).
- **geoip-lite** is a backend dependency (~150 MB of offline IP data). It loads into
  memory at boot. If Railway runs out of RAM on the smallest plan, either upgrade the
  plan or remove the dependency — the geo module fails open and the app keeps working
  normally without it.
- **Geo blocking is OFF by default.** Turn it on from the control panel when you want it.
- **Text-only platform** — no file or image uploads by design.
- First run creates `chatlly-data.json` inside `DATA_DIR` automatically.

---

## 5. After deployment

- Chat: `https://<vercel-url>/`
- Control panel: `https://<vercel-url>/panel`
- Backend health: `https://<railway-url>/health`

Log in with the admin credentials you set. The same login works for both the chat
(admin powers) and the control panel.
