# Cold Email Engine — Setup

A Next.js 16 app + Node.js batch scripts for generating personalized cold email sequences. Targets restaurants/lead-based B2B outreach.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 3. Start the web UI
npm run dev
# → http://localhost:3001
```

## Environment Variables

Copy `.env.example` → `.env.local` (or `.env`) and fill in:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes (OpenAI) | Step 4 (breakup emails), UI fallback |
| `REOON_API_KEY` | Yes | Email verification — set key, **default mode = power** |
| `DEEPSEEK_API_KEY` | Step 1, 3 | Pattern interrupt + objection handling |
| `OPENROUTER_API_KEY` | Step 2 | Social proof, GPT-4o access |
| `INPUT_CSV` | No | Lead CSV path (default: `data/leads.csv`) |
| `REACHINBOX_OUTPUT` | No | Output CSV path (default: `cold-email-reachinbox-PRODUCTION.csv`) |
| `STATE_DIR` | No | Checkpoint directory (default: `scripts/batch2-state/`) |
| `ANTHROPIC_API_KEY` | No (optional) | Fallback LLM |
| `GEMINI_API_KEY` | No (optional) | Fallback LLM |
| `OUTPUT_DIR` | No | Output directory (default: `.`) |

## Architecture

**Two modes:**

1. **Web UI** (`localhost:3001`) — Upload CSV, configure providers, generate, and export. Round-robins between OpenAI / Groq / Gemini / Local / Anthropic.

2. **Batch scripts** (`scripts/`) — Headless pipeline for large CSV sets. Checkpoint-based (resumable). Run overnight.

**Data flow:**

```
Lead CSV → Filter (restaurant only, has email, not already sent)
         → Day 0 (pattern interrupt email)
         → Day 3 (social proof email)
         → Day 7 (objection handling email)
         → Day 14 (breakup email)
         → Spintax + Reoon verify (Power Mode)
         → CSV export (PRODUCTION / REJECTED / DROPPED)
```

## Key Files

| File | Purpose |
|---|---|
| `lib/types.ts` | TypeScript types, default config (Reoon mode = "power") |
| `lib/prompt.ts` | 8 service templates + system prompt (22K chars) |
| `lib/automap.ts` | Field mapping keywords (40+) |
| `lib/outscraper.ts` | Lead angle selection (23K chars) |
| `lib/leadrocks.ts` | Email priority logic (13K chars) |
| `app/api/generate/route.ts` | LLM round-robin router + auto-retry |
| `app/api/verify-email/route.ts` | Reoon email verification proxy |
| `scripts/batch2-run.mjs` | Main batch pipeline (5 stages, resumable) |

## Scripts Reference

See `SCRIPTS.md` for full batch pipeline documentation.
