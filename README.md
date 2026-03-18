# AlgoTest Platform

This project is a **static site** (`index.html`) plus **Netlify Functions** (`netlify/functions/*.mjs`) that serve:

- `GET /api/chain`
- `POST /api/backtest`

## Run locally

Requirements:

- Node.js 18+ (recommended)

Install:

```bash
npm install
```

Start dev server (serves the UI + functions):

```bash
npm run dev
```

Then open `http://localhost:8888`.

## Deploy on Vercel

Vercel does not run Netlify Functions, so this repo includes Vercel Serverless Functions in `api/`:

- `GET /api/chain`
- `POST /api/backtest`

The UI is served from `public/index.html`.

