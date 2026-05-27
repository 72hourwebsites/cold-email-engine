# Cold Email Engine — Restructured Implementation Plan

**Goal:** Transform the cold email pipeline from 27.2% open / 0% reply / 30% bounce → <2% bounce / 3-5%+ reply rate using signal-based personalization, proper email verification, tiered LLM strategy, and automated self-improvement.

**Architecture:** The app stays a Next.js wizard + Node.js batch scripts. We keep the UI but overhaul the backend logic: Reoon verification mode, prompt templates per step, model routing, and a new metrics ingestion dashboard.

**Tech Stack:** Next.js 16, React 19, DeepSeek V3, GPT-4o (OpenRouter), gpt-4o-mini, Reoon API (Power Mode), ReachInbox CSV export.

---

# Executive Summary: What We Learned

## The 30% Bounce Problem

**Root cause:** The app uses Reoon's **Quick Mode** for email verification. Quick Mode does NOT check individual inbox status — it only checks syntax, MX records, and domain validity. Catch-all domains (which accept mail for ANY address on that domain) pass Quick Mode as "valid." Your 30% bounce rate means roughly 165 of 550 emails bounced because those addresses don't actually exist as individual inboxes.

**Fix:** Switch to Reoon **Power Mode**, which does SMTP-level checks against each inbox and returns statuses: Safe / Role / Catch-All / Invalid / Spamtrap. Reject catch-all and risky addresses entirely. Target: <2% bounce.

## The 0% Reply Problem

**Root causes (3 layers):**

1. **Formulaic boilerplate template** — Every email follows the same 4-step structure with the same CTA ("Worth 15 minutes?"), the same fake stat ("14 reservations recovered"), and banned phrases ("Imagine," "during a bustling"). Recipients see a template, not a person.

2. **Single-model generation** — gpt-4o-mini (budget tier) generates ALL steps. No model is assigned by task complexity. Creative/strategic steps get the cheapest model.

3. **No personalization beyond {first_name}** — The current app doesn't ingest restaurant-specific signals (recent reviews, menu changes, location openings, hiring). The emails don't demonstrate genuine understanding of the recipient's situation.

**The research is clear:** "The difference is not better copywriting. It is reaching the right person at the right moment with proof you understand their situation." Signal-based outreach achieves 18-25% reply rates vs. 2% for templates.

## The Restaurant Voice AI Pitch

**What actually works for selling AI phone agents to restaurants:**

- **Start with off-hours** — Pitch an "off-hours agent" (handles calls when restaurant is closed) rather than replacing full-time staff. Lower commitment, clearer ROI, no "replace my hostess" objection.
- **Pain points that resonate:** Missed calls during dinner rush = lost reservations/takeout orders. Labor shortages (85% of operators saw payroll rise). 32% of operators say staffing is their #1 challenge.
- **Best signals to trigger outreach:** New location opened / expanding hours / recent negative review mentioning phone issues / new menu launch / POS or tech stack change / hiring surge for FOH staff.

---

# Phase 0: Infrastructure & Housekeeping (Before Any Model Changes)

**Goal:** Secure credentials, fix the pipeline foundation, make the code deployable anywhere.

### Task 0.1: Move hardcoded Reoon API key to .env
- **File:** `lib/types.ts`
- Extract the key in `DEFAULT_CONFIG` → move to `.env.local`
- Create `.env.example` with placeholder
- Update `app/api/verify-email/route.ts` to read from env
- **Verify:** Search for any other hardcoded keys

### Task 0.2: Path env-var-ization
- **Files:** `scripts/batch2-run.mjs`, `scripts/overnight.mjs`, `scripts/openai-sequence.mjs`, `scripts/openai-batch.mjs`
- All scripts hardcode `C:\Users\aml25\Downloads\*.csv`
- Refactor to read input/output paths from env vars: `INPUT_CSV`, `OUTPUT_DIR`, `REACHINBOX_OUTPUT`
- Add `.env.example` documenting these
- **Verify:** Dry-run a script with new env vars, confirm paths resolve

### Task 0.3: Add .env to .gitignore
- Already partially done — confirm `.env`, `.env.local`, `.env.*` covered

### Task 0.4: Document project setup
- Create `SETUP.md`: clone, `npm install`, copy `.env.example` → `.env.local`, add keys, run dev server
- Create `SCRIPTS.md`: document each batch script, env vars, expected inputs/outputs

---

# Phase 1: Bounce Rate Fix — Reoon Power Mode (Highest Impact)

**Goal:** Drop bounce rate from 30% to <2%.

### Task 1.1: Add Power Mode support to Reoon verification
- **Files:** `app/api/verify-email/route.ts`, `lib/types.ts`
- Add `mode` parameter to verification requests: `mode=power`
- Update types to include Power Mode statuses: `Safe`, `Role`, `Catch-All`, `Invalid`, `Spamtrap`, `Unknown`
- Add config UI toggle: "Verification strictness: Standard / Strict" (Standard = accept Safe+Role; Strict = Safe only)

### Task 1.2: Implement email filtering logic
- **File:** `lib/verification.ts` (new)
- Function: `filterEmails(results)` that:
  - Returns `valid` emails (Safe + optionally Role)
  - Flags `catch-all` as risky (add warning to UI but optionally allow through with user consent)
  - Rejects `invalid`, `spamtrap`, `disposable`
- Add batch verification mode: verify all emails before generation, filter in bulk

### Task 1.3: Add catch-all warning to UI
- **File:** `components/GenerationPanel.tsx`
- Show warning banner when catch-all emails are detected
- Add checkbox: "Include catch-all addresses (higher risk, higher volume)"
- Show estimated valid count vs. raw count

### Task 1.4: Update batch scripts to use Power Mode
- **File:** `scripts/batch2-run.mjs`
- Add verification step before generation using Reoon Power Mode
- Save verification report as `{batch-name}-verification-report.json`
- Skip or flag catch-all/invalid emails during generation

**Verification Metric:** Run 50 sample emails through verification. Expect <5 flagged as "invalid" (10%). Previously with Quick Mode, 30% would have bounced — with Power Mode filtering, actual send bounce should be <2%.

---

# Phase 2: Copy Architecture Overhaul — Signal-Based Personalization (Highest Impact on Reply Rate)

**Goal:** Move from boilerplate templates to signal-driven, per-step varied sequences that sound human.

### Task 2.1: Signal ingestion module
- **File:** `lib/signals.ts` (new)
- Define signal types for restaurants:
  - `new_location`: restaurant opened new branch → pitch scaling comms
  - `negative_review_phone`: recent review mentions "couldn't get through on phone" → pitch missed call solution
  - `menu_launch`: new menu/delivery launch → pitch handling order calls
  - `hiring_foh`: hiring servers/hosts → pitch labor cost reduction
  - `new_website`: website redesign → pitch adding AI call agent
  - `expansion_hours`: extending hours → pitch off-hours coverage
- Each signal maps to a specific angle and CTA

### Task 2.2: New 4-step sequence architecture
- **File:** `lib/templates/` (new directory)
- Each step is a distinct *format*, not a "let me tell you about myself" variant:

  **Step 1 (Day 0) — Pattern Interrupt** — "I noticed [specific signal about their restaurant]" — 50-70 words. No pitch, just observation + curiosity.
  **Step 2 (Day 3) — Social Proof** — "Here's what happened when [similar restaurant] tried [one specific outcome]" — 70-90 words. Real case study energy.
  **Step 3 (Day 7) — Objection Pre-handle** — "Most owners tell us 'my staff handles calls fine' — here's what we actually saw at [peer restaurant]..." — 60-80 words. Pattern interrupt.
  **Step 4 (Day 14) — Breakup** — "I'll close your file but wanted to leave you with [one useful resource about restaurant call data]" — 50-70 words. Generous exit.

### Task 2.3: Ban list enforcement
- **File:** `lib/prompt.ts`
- Add a post-generation filter that rejects emails containing:
  - "Imagine"
  - "Worth 15 minutes" / "Worth a quick call" / "worth your time"
  - "during a bustling" / "during the hustle"
  - "14 reservations recovered" / any made-up stat
  - "Revolutionary" / "Breakthrough" / "Game-changing"
  - "I'd love to" / "I'm reaching out because"
- Regenerate if caught (with different prompt)

### Task 2.4: Per-variant prompt templates
- **File:** `lib/prompt.ts` — redesign the prompt structure
- Instead of 1 prompt that generates all 4 emails, use separate prompts per step with different system instructions:
  - Step 1 system: "You are a peer in the restaurant industry who noticed something interesting. Keep it short, conversational, no jargon."
  - Step 2 system: "You are sharing a specific case study. Be concrete — use actual numbers, avoid generic praise."
  - Step 3 system: "You are addressing a common objection head-on. Use a light, confident tone."
  - Step 4 system: "You are closing gracefully. No guilt, no pressure. Leave a useful artifact."
- Add 3-5 variant templates per step (A/B/C/D/E) for the A/B testing framework

### Task 2.5: Model tiering
- **File:** `app/api/generate/route.ts` — update the round-robin router
- Assign models by step:
  - **Step 1 (Pattern Interrupt):** DeepSeek V3 — most creative, best at natural language, longest context for signal parsing
  - **Step 2 (Social Proof):** GPT-4o via OpenRouter — best at evidence-based writing, citing specifics
  - **Step 3 (Objection Handle):** DeepSeek V3 — nuanced objection handling needs strong reasoning
  - **Step 4 (Breakup):** gpt-4o-mini — short and simple, lowest need for reasoning
- Add DeepSeek and OpenRouter provider integrations to the API router
- Add fallback: if DeepSeek unavailable → GPT-4o, if GPT-4o unavailable → gpt-4o-mini

**Verification:** Generate 10 sample 4-step sequences. Review for: banned phrases (0), signal relevance (each email references a real signal about that specific restaurant), variety (no two sequences look alike), length (50-125 words per email).

---

# Phase 3: DeepSeek + OpenRouter Integration

**Goal:** Make all 3 LLM providers work seamlessly with fallbacks and cost tracking.

### Task 3.1: Add DeepSeek provider
- **File:** `app/api/generate/route.ts`
- Add DeepSeek chat completions endpoint
- Config: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (api.deepseek.com)
- Model: `deepseek-chat` (V3) / `deepseek-reasoner` (R1)
- Map to the tiered strategy above

### Task 3.2: Add OpenRouter provider
- **File:** `app/api/generate/route.ts`
- Add OpenRouter chat completions endpoint
- Config: `OPENROUTER_API_KEY`
- Model routing: `openai/gpt-4o`, `anthropic/claude-sonnet-4`, etc.
- Add fallback chain: primary → secondary → tertiary

### Task 3.3: Cost tracking module
- **File:** `lib/cost-tracker.ts` (new)
- Track per-generation costs (token count × model rate)
- Store in `sessionStorage` or local file
- Display in dashboard: "This campaign cost $X.XX to generate"

### Task 3.4: Provider health checks
- **File:** `app/api/generate/route.ts`
- Before generation, ping each provider's health endpoint
- Skip degraded providers
- Log provider availability over time

---

# Phase 4: Self-Improvement Dashboard Loop

**Goal:** Ingest ReachInbox campaign results CSV → auto-identify winning patterns → feed back into prompt templates.

### Task 4.1: CSV metrics ingestion
- **File:** `components/DashboardPanel.tsx` (new)
- Upload ReachInbox campaign export CSV
- Parse: Sent, Opened, Replied, Bounced, Clicked, Unsubscribed
- Map each contact row to which variant/step they received
- Calculate per-variant: open rate, reply rate, bounce rate

### Task 4.2: Pattern analysis engine
- **File:** `lib/pattern-analyzer.ts` (new)
- For each variant (A/B/C/D/E), calculate:
  - Open rate (subject line effectiveness)
  - Reply rate (body effectiveness)
  - Bounce rate (list quality)
- Rank variants by composite score
- Identify which subject line patterns, opening styles, and CTAs correlate with higher replies

### Task 4.3: Auto-prompt adjustment
- **File:** `lib/prompt-optimizer.ts` (new)
- When a variant significantly underperforms (3+ weeks, <2% reply), auto-promote the next best variant
- When a variant outperforms (5%+ reply), boost its weight in random selection
- Keep a "variant scoreboard" as JSON file

### Task 4.4: Dashboard UI
- **File:** `app/page.tsx` — add a new step/panel
- Show:
  - Campaign overview: sent/opened/replied/bounced bar chart
  - Variant leaderboard: which subject lines, openings, CTAs win
  - Trend chart: reply rate over time (is it improving?)
  - Model performance: which LLM generates highest-reply emails
  - Cost per reply metric
- Recommendations panel: "Switch Step 1 to variant C — it has 8.2% reply rate vs 1.1% for variant A"

### Task 4.5: Dashboard data persistence
- Save variant scores to `dashboard-state.json` in project root
- Sync across sessions using local file reads
- No external DB needed

---

# Phase 5: A/B Testing Framework

**Goal:** Systematic, automated A/B testing for continuous improvement.

### Task 5.1: Test configuration
- **File:** `lib/ab-testing.ts` (new)
- Define testable elements per step:
  - Subject line (3-5 variants)
  - Opening line (curiosity vs problem vs compliment)
  - CTA type (direct question vs resource offer vs calendar link)
  - Length (short 40-60 words vs medium 60-90 words)
  - Tone (professional vs peer-to-peer vs playful)

### Task 5.2: Random assignment with logging
- For each contact, randomly assign variant per element
- Log assignments in CSV row export: `step1_variant`, `step2_variant`, etc.
- Include variant assignment in ReachInbox CSV custom columns

### Task 5.3: Winner promotion
- After minimum 50 sends per variant, compare results
- Auto-promote statistically significant winner (90% confidence)
- Archive losing variants with performance data
- Generate "lessons learned" report after 4 weeks

**Verification:** After 2 weeks of A/B testing, we should have clear data showing which variant wins per step. The dashboard should recommend specific changes.

---

# Phase 6: Delivery Optimization (Deliverability)

**Goal:** Ensure emails land in inbox, not spam.

### Task 6.1: Spam score checker
- **File:** `app/api/analyze-spam/route.ts` (new)
- Before sending, pass generated email through a spam score API or heuristic checker
- Flag emails scoring >70% spam probability for human review
- Common triggers: ALL CAPS subjects, excessive punctuation, too many links, ratio: text < links

### Task 6.2: Send-time optimization
- Add "send time" field to ReachInbox CSV
- Based on research: Tuesday-Thursday 9-11 AM prospect local time
- Add offset randomization (±15 minutes per email to avoid pattern detection)

### Task 6.3: Domain reputation monitoring
- Add section to dashboard for Postmaster data
- Track: spam complaint rate (target <0.1%), bounce rate (target <2%), domain health score

---

# Execution Priority

| Priority | Phase | Why This Order |
|----------|-------|----------------|
| **P0** | Phase 0 — Infrastructure | Unblocks everything, secures keys, makes code portable |
| **P0** | Phase 1 — Bounce Rate | Fastest fix, highest measurable impact (30% → <2%) |
| **P1** | Phase 2 — Copy Architecture | Biggest reply rate lever, requires Phase 0 first |
| **P1** | Phase 3 — DeepSeek + OpenRouter | Enables tiered model strategy from Phase 2 |
| **P2** | Phase 4 — Dashboard Loop | Needs Phase 2+3 data to feed into |
| **P2** | Phase 5 — A/B Testing | Needs Phase 2 templates to test against |
| **P3** | Phase 6 — Deliverability | Polish layer, lower immediate ROI |

---

# Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| DeepSeek API downtime | Blocks Step 1/3 generation | Low (DeepSeek generally stable) | Fallback to GPT-4o/OpenRouter |
| Reoon Power Mode rate limits | Slows batch verification | Medium | Queue verification, add delays |
| New templates still get 0% reply | Wasted rewrite effort | Low (signal-based approach has strong data) | A/B test 5 variants per step, pivot fast |
| gpt-4o-mini can't do Step 4 well | Low-quality breakups | Medium | Promote to DeepSeek V3 for Step 4, accept $0.01/task cost |
| Catch-all rejection reduces list size too much | 40-60% fewer leads | Medium | Add "include catch-all" toggle with clear warning about bounce risk |
| ReachInbox CSV format changes | Dashboard ingestion breaks | Low | Version the import parser, add format detection |

---

# Success Criteria

- [ ] **Bounce rate:** <2% (measured via ReachInbox campaign data)
- [ ] **Reply rate:** 3-5%+ (vs current 0%)
- [ ] **Open rate:** Maintain 25-30%+ (currently 27.2%)
- [ ] **List quality:** 90%+ of verified emails are Safe status
- [ ] **Template variety:** No two sequences use the same phrasing for same step
- [ ] **Banned phrases:** Zero occurrences across all generated emails
- [ ] **Cost:** <$0.10 per 4-email sequence (DeepSeek V3 + gpt-4o-mini combo)
- [ ] **Dashboard:** Auto-ingests ReachInbox CSV, shows variant leaderboard within 30 seconds
- [ ] **A/B test:** At least one statistically significant winner identified per step within 2 weeks
