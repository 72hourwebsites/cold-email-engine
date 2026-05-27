# Scripts Reference

## Main Pipeline: `scripts/batch2-run.mjs`

The primary batch orchestrator. Processes a LeadRocks CSV through 5 stages with JSON checkpoints for resume.

```bash
# Set env vars first (or use .env)
export OPENAI_API_KEY=sk-...
export REOON_API_KEY=your-reoon-key

# Run it
node scripts/batch2-run.mjs /path/to/leadrocks-export.csv
```

**Stages:**
1. **Load + filter** — Parse LeadRocks CSV, keep restaurant with emails, exclude already-shipped
2. **Day 0 generation** — Pattern interrupt emails (gpt-4o-mini, concurrency=10)
3. **Day 3 / 7 / 14** — Sequence-aware follow-ups
4. **Spintax + Reoon verify** — Add variation, verify (concurrency=1, 1.3s delay)
5. **Normalize + export** — CSV output to PRODUCTION / REJECTED / DROPPED

**Checkpoints** (in `scripts/batch2-state/`):
- `01-eligible.json` — Filtered leads
- `02-day0.json` — Day 0 generated emails + QA results
- `03-sequence.json` — Full sequence emails
- `04-reoon-cache.json` — Verification results

Re-run to resume from last checkpoint. Delete a checkpoint file to redo that stage.

**Output env vars:**
- `REACHINBOX_OUTPUT` — Production CSV (default: `cold-email-reachinbox-batch2-PRODUCTION.csv`)
- `REJECTED_OUTPUT` — Rejected CSV (default: `cold-email-reachinbox-batch2-REJECTED.csv`)
- `DROPPED_OUTPUT` — Dropped CSV (default: `cold-email-reachinbox-batch2-DROPPED.csv`)

---

## Legacy Scripts

These are preserved for reference / individual step runs.

### `scripts/overnight.mjs`
One-shot Day 0 generation. Reads a CSV, generates Day 0 emails, saves to checkpoint JSON. Output: `cold-email-reachinbox-FINAL.csv`.

### `scripts/openai-sequence.mjs`
Full 4-email sequence generator. Reads Day 0 checkpoint, generates Day 3/7/14 follow-ups. Output: `cold-email-reachinbox-SEQUENCE.csv`.

### `scripts/openai-batch.mjs`
Bulk generation (no sequences). All leads get a single email. Faster but lower reply potential.

### `scripts/finalize-csv.mjs`
Post-processing: reads Day 0 + sequence checkpoints, runs Reoon verification (Power Mode), produces ALL / SAFE / REJECTED CSVs.

### `scripts/final-clean.mjs`
Light touch-up on an already-verified SAFE CSV. Unicode normalization, consistency checks.

### `scripts/batch2-prescan.mjs`
Pre-flight check: reads a new LeadRocks CSV, cross-references against already-shipped Batch #1 emails, reports eligible count. Run before the main pipeline.

### `scripts/batch-generate.mjs`
Simplest generator: reads CSV, generates emails via OpenAI, writes JSON + CSV. No checkpointing.

### Fix scripts
- `scripts/fix-last.mjs` — Emergency fix for the last row in a production CSV
- `scripts/fix-stuck.mjs` — Un-stick a frozen sequence-progress.json
- `scripts/surgical-fixes.mjs` — Targeted fixes on specific entries

### Demo
- `scripts/generate-restaurant-demo.mjs` — Generate a small demo set (handful of emails)

---

## Environment Variables (all scripts)

| Var | Default | Used By |
|---|---|---|
| `OPENAI_API_KEY` | — (required) | All generation scripts |
| `REOON_API_KEY` | — (required) | Verification scripts |
| `INPUT_CSV` | `./data/leads.csv` | openai-sequence, overnight, openai-batch, etc. |
| `REACHINBOX_OUTPUT` | `./cold-email-reachinbox-PRODUCTION.csv` | All export scripts |
| `STATE_DIR` | `./scripts/batch2-state` | batch2-run, finalize-csv |
| `PREVIOUS_BATCH` | — | batch2-run (dedup check) |
| `OVERNIGHT_PROGRESS` | `./scripts/overnight-progress.json` | overnight, sequence scripts |
| `SEQ_PROGRESS` | `./scripts/sequence-progress.json` | sequence scripts |
| `REOON_CACHE` | `./scripts/reoon-cache.json` | finalize-csv |
| `GENERATED_JSON` | `./scripts/generated-emails.json` | batch-generate |
| `FINAL_ALL_OUTPUT` | `./cold-email-reachinbox-FINAL-ALL.csv` | finalize-csv |
| `FINAL_SAFE_OUTPUT` | `./cold-email-reachinbox-FINAL-SAFE.csv` | finalize-csv |
| `REJECTED_OUTPUT` | `./cold-email-reachinbox-REJECTED.csv` | finalize-csv, batch2-run |
| `DROPPED_OUTPUT` | `./cold-email-reachinbox-DROPPED.csv` | finalize-csv, batch2-run |
