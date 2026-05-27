# Deploy — Cold Email Engine

## Option 1: Cloudflare Pages (Recommended)

Auto-deploy from GitHub — every push to `main` deploys instantly.

### Setup

1. Push this repo to GitHub:
   ```bash
   git remote add origin https://github.com/<your-org>/cold-email-engine.git
   git push -u origin main
   ```

2. Go to [Cloudflare Dashboard → Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)

3. Click **Create → Pages → Connect to Git**

4. Select your repository, branch `main`

5. **Build settings:**
   - Framework preset: **Next.js** (auto-detects OpenNext)
   - Build command: `npx opennextjs-cloudflare build`
   - Build output: `.open-next`
   - Root directory: (leave blank)

6. **Environment variables (required):**
   Add from `.env.example` — at minimum:
   - `OPENROUTER_API_KEY` — your OpenRouter key
   - `OPENAI_API_KEY` — your OpenAI key (if using)
   - `DEEPSEEK_API_KEY` — your DeepSeek key (if using)
   - `NEXT_PUBLIC_DEFAULT_PROVIDER` — e.g. `openrouter`
   - `REOON_API_KEY` — for email verification
   - `NEXTJS_ENV` = `production`

   > Use **Encrypted** env vars for API keys. Preview/Production can differ.

7. Click **Save and Deploy** (~2 min first build)

### After deploy

- Your app is live at `https://cold-email-app.<your-subdomain>.pages.dev`
- Custom domain: add a CNAME in Cloudflare DNS → `cold-email-app.pages.dev`
- Each PR gets a preview URL automatically

---

## Option 2: Wrangler CLI (manual deploy)

Requires authenticated Wrangler:

```bash
# Authenticate (opens browser)
npx wrangler login

# Deploy
npm run deploy
```

### Setting env vars

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put REOON_API_KEY
npx wrangler secret put NEXT_PUBLIC_DEFAULT_PROVIDER
```

Each prompts for the value.

---

## Option 3: Local dev (no deploy)

```bash
npm run dev        # http://localhost:3001
```

---

## Important: Batch scripts stay local

The web UI (wizard + dashboard) runs on Cloudflare. The batch scripts in `scripts/` (which process 500+ leads) still run from your WSL terminal — they're long-running Node.js processes that don't fit serverless.

---

## App structure after deploy

| Route | Purpose |
|-------|---------|
| `/` | Wizard UI (7 steps) |
| `/api/generate` | Email generation (POST) |
| `/api/dashboard` | Dashboard state (GET/POST) |
| `/api/analyze-spam` | Spam checking (POST) |
| `/api/assign-variants` | A/B test assignments (POST) |
| `/api/lessons` | Lessons learned (GET) |
| `/api/verify-email` | Reoon verification (POST) |
| `/api/load-csv` | CSV parsing (POST) |
| `/api/health` | Health check (GET) |

## Worker size

Current build: ~2.3 MB gzipped — fits well within Cloudflare's free 3 MB limit.
