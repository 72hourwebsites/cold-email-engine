# Batch #2 Playbook — RingRoute USA × Next LeadRocks Pull

**One command, end-to-end.** Drop a fresh LeadRocks CSV, fire the orchestrator, walk away. Output is a ReachInbox-ready PRODUCTION CSV.

---

## Pre-flight (one time)

### 1. Confirm env keys are set

The orchestrator needs `OPENAI_API_KEY`. The Reoon key is already hardcoded as fallback.

**PowerShell — load from your Cold Caller .env:**
```powershell
$env:OPENAI_API_KEY = (Get-Content "C:/Claude/Cold Caller/.env" | Select-String "^OPENAI_API_KEY" | ForEach-Object { ($_ -split "=",2)[1] })
```

Verify it's set:
```powershell
$env:OPENAI_API_KEY.Substring(0,10)
# Should print "sk-proj-uC" or similar
```

### 2. Confirm Batch #1 PRODUCTION still exists

The orchestrator reads `C:/Users/aml25/Downloads/cold-email-reachinbox-PRODUCTION.csv` to skip anyone already in Batch #1 (no double-emailing). If you've moved or renamed it, edit the `BATCH1_PROD` const at top of `scripts/batch2-run.mjs`.

---

## Step 1: Pull the new LeadRocks CSV

In LeadRocks.io:
1. Refine your restaurant-owner search **differently** from Batch #1. Suggested deltas:
   - Different state cluster (you hit MA/NY/CA last time — try TX/FL/IL/CO/NC)
   - Or different team-size range (Batch #1 was mixed — try just 11-50 for "growing teams")
   - Or different cuisine tag (pizza only, sushi only, etc.)
2. Export to CSV. LeadRocks default columns are fine — the script auto-maps `First Name`, `Last Name`, `Company`, `Job Title`, `Location`, `Linked Url`, and all the `Direct/Work Email #N` columns.
3. Save to: `C:/Users/aml25/Downloads/leadrocks_batch2_<date>.csv` (any path works — you pass it in).

**Target volume:** 500-1000 leads. The pipeline cost-scales linearly.

---

## Step 2: Fire the orchestrator

```powershell
cd C:/Users/aml25/Downloads/cold-email-app
node scripts/batch2-run.mjs "C:/Users/aml25/Downloads/leadrocks_batch2_2026_05_30.csv"
```

That's it. Walk away. ~3-4 hours unattended for 500 leads. The script:

1. **Loads + filters** — drops no-email rows, non-restaurants, anyone already in Batch #1
2. **Generates Day 0** — OpenAI gpt-4o-mini, concurrency=10, QA gated (word count, CTA, no banned openers)
3. **Generates Day 3/7/14** — sequence-aware prompts that reference each contact's Day 0 subject
4. **Spintax wraps** — Day 14 closers, Day 7 openers, Day 3 outcome tails
5. **Reoon verifies** — every email, concurrency=1 with 1.3s delay (respects their single-call rate limit)
6. **Exports** — splits into PRODUCTION / REJECTED / DROPPED CSVs

### What you'll see in the terminal

```
🚀 Batch #2 pipeline — input: ...leadrocks_batch2.csv
[Stage 1] Loading ...
  total rows: 800
  Batch #1 emails to exclude: 442
  ✓ eligible: 712
  dropped — noEmail:42 nonRest:8 batch1Dup:35 sameRunDup:3

[Stage 2] Day 0: 0 done / 712 todo
  Day 0 ✓ 708/712 passed QA

[Stage 3] Sequence: 708 contacts × 3 days
  Sequence ✓ D3:703 D7:706 D14:707 of 708

[Stage 4] Reoon verify: 708 new / 0 cached
  Reoon ✓ 708/708

📊 Final breakdown:
  🟢 PRODUCTION (ship now):  654
  🔴 REJECTED:               54
  ⚪ DROPPED:                4

📤 Files:
  C:/Users/aml25/Downloads/cold-email-reachinbox-batch2-PRODUCTION.csv
  ...
⏱  Total runtime: 187 min
✅ Done. Import ...batch2-PRODUCTION.csv into ReachInbox.
```

---

## Resumability

If the script crashes / your laptop sleeps / power blip — **just run the same command again**. Each stage checkpoints to JSON in `scripts/batch2-state/` and skips work already done:

- `01-eligible.json` — filtered contacts
- `02-day0.json` — Day 0 progress
- `03-sequence.json` — Day 3/7/14 progress
- `04-reoon-cache.json` — verification cache

To start completely fresh: delete the `batch2-state/` folder.

---

## Cost estimate (per 500 leads)

| Item | Cost |
|---|---|
| OpenAI (Day 0 + 3 + 7 + 14 × 500 = 2,000 calls × gpt-4o-mini) | ~$0.80 |
| Reoon (500 verifications) | depends on your plan — single-call endpoint |
| Your time | ~0 — fully unattended |
| **Total** | **~$1 + your existing Reoon credits** |

---

## After it finishes — ReachInbox import

1. In ReachInbox: **Contacts → Import → CSV**
2. Upload `cold-email-reachinbox-batch2-PRODUCTION.csv`
3. Column mapping auto-detects (same 16 columns as Batch #1)
4. **IMPORTANT:** Create a NEW campaign — don't add to the Batch #1 campaign. Reason: keeps metrics clean per batch so you can tell if Batch #2 leads perform better/worse than Batch #1.
5. Same sequence config as `REACHINBOX_SETUP.md`:
   - Day 0 → Day 3 (+3d) → Day 7 (+4d) → Day 14 (+7d)
   - Tue/Wed/Thu, 9a-3p recipient local time
   - 30/day → 75/day → 150/day ramp
   - Stop on reply / bounce / unsub

Your warmed mailboxes are already eligible to send Batch #2 the moment the import finishes.

---

## Troubleshooting

**"Missing OPENAI_API_KEY"** — run the PowerShell snippet at the top of this doc.

**"Input CSV not found"** — check the path; use forward slashes or double-quoted Windows paths.

**Reoon returning lots of `api_error`** — the script auto-retries with 15s backoff up to 4×. If still failing, your Reoon quota may be exhausted — check your dashboard. Hardcoded key in the script: `6hRql21Je1j0MoArXbChCEl9mgUZAbAW`. To use a different key, set `$env:REOON_API_KEY` before running.

**Day 0 QA fail rate >10%** — likely a weird CSV (non-restaurant rows, non-US locations, missing First Name). Open `02-day0.json` and inspect the `ok:false` entries; usually the row data is the issue, not the prompt.

**Want to test on a small slice first?** Use a 10-row CSV. Pipeline runs in ~5 min and costs ~$0.02.

---

Built 2026-05-23. Mirrors Batch #1 logic but consolidated into one orchestrator.
