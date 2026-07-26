# Chatlly

Real-time chat platform with rooms, private messaging, moderation and AI-driven
conversation hosts. Hebrew (RTL) and English.

## Stack

- **Frontend:** React 18 + Vite + React Router → Vercel
- **Backend:** Node.js + Express + Socket.io → Railway
- **AI:** DeepSeek (OpenAI-compatible API)
- **Storage:** JSON store on a persistent volume

## Features

- Rooms grouped into country groups (Israel / International)
- Private chat with two-sided approval, and an opt-in "open to DMs" toggle
- Moderation: kick, ban, IP ban, real-time content filter
- Age gate (18+), Terms of Service, Privacy Policy, AI disclosure
- Crisis protocol — detects distress and surfaces a helpline
- Geo access control: country blocking, EU blocking, read-only for foreign visitors
- Full i18n (Hebrew / English) with automatic detection
- Mobile-ready layout with emoji picker
- Live control panel for bots, rooms, filters and geo settings

## Deployment

See **[DEPLOY.md](./DEPLOY.md)**.

## Local development

```bash
# Backend
cd backend
npm install
cp .env.example .env      # fill in DEEPSEEK_API_KEY and the rest
npm run dev               # http://localhost:3900

# Frontend (separate terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Leave `VITE_BACKEND_URL` unset locally — the frontend defaults to `http://localhost:3900`.
