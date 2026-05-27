# ReachInbox Campaign Setup — RingRoute USA × 442 Restaurant Owners

**CSV:** `C:/Users/aml25/Downloads/cold-email-reachinbox-PRODUCTION.csv`
**Contacts:** 442 (Reoon-verified valid only, restaurants only)
**Source list:** LeadRocks owner-restaurants 2026-05-20

---

## 1. Pre-import sanity check ✓

| Gate | Status |
|---|---|
| UTF-8 BOM | ✓ Present (prevents Excel encoding bugs) |
| CSV parse errors | 0 |
| Required columns | All 13 ReachInbox columns present |
| Duplicate emails | 0 |
| Invalid email syntax | 0 |
| Empty subjects | 0 across all 4 days |
| Spintax syntax errors | 0 (441 Day-14 spintax wrappers validated) |
| Body word counts | D0:55-76 / D3:41-65 / D7:24-47 / D14:31-49 |

**Heads-up:** 2 international names will render with accents (Márton, Arnór) — UTF-8 handles them; no action needed.

---

## 2. Recipient mix (important for volume strategy)

- **53% free-email recipients** (gmail/yahoo/hotmail/aol)
- 88 gmail.com, 59 yahoo.com, 50 hotmail.com top 3
- This is consumer-grade inboxes (owners use personal email) → **slower ramp than B2B campaigns**

---

## 3. ReachInbox campaign config

### A. Sender setup (do this BEFORE import)
- [ ] Use a **secondary sending domain** (e.g. `ringrouteusahq.com` or `getringroute.com`) — NEVER your primary `ringrouteusa.com`
- [ ] Domain age: at least 30 days. Brand new domains = instant spam folder.
- [ ] SPF + DKIM + DMARC all configured on the sending domain
- [ ] Set up **3-5 inbox accounts** under the sending domain (e.g. angel@, hello@, contact@, team@, michael@)
- [ ] Connect each inbox to ReachInbox with **OAuth** (not SMTP — OAuth has better deliverability scoring)
- [ ] **Inbox warmup ON for 14 days** at min 50 messages/day per inbox before launching

### B. Import the CSV
- [ ] In ReachInbox: **Contacts → Import → CSV**
- [ ] Upload `cold-email-reachinbox-PRODUCTION.csv`
- [ ] Column mapping should auto-detect (header names match ReachInbox conventions). Verify:
  - Email → Email
  - First_Name → First Name
  - Last_Name → Last Name
  - Company_Name → Company Name
  - Subject_Day0..14 → matching sequence step subjects
  - Body_Day0..14 → matching sequence step bodies
- [ ] Confirm "442 contacts imported, 0 errors"

### C. Campaign settings

**Name:** `RingRoute · Restaurants Cold #1 · 2026-05-23`

**Sequence steps:**
| Step | Day | Delay from prior | Wait if no open | Wait if opened |
|---|---|---|---|---|
| 1 | Day 0 | — (send immediately) | n/a | n/a |
| 2 | Day 3 | +3 days | continue | continue |
| 3 | Day 7 | +4 days | continue | continue |
| 4 | Day 14 | +7 days | continue | continue |

**Stop sequence triggers (configure ALL):**
- [x] Stop if reply received
- [x] Stop if email bounces
- [x] Stop if unsubscribes
- [ ] Stop on link click (LEAVE OFF — we don't have links yet)

### D. Sending schedule

**Time window:** 9:00 AM – 3:00 PM **recipient local time** (ReachInbox auto-adjusts per contact timezone)
**Days:** **Tuesday, Wednesday, Thursday only** — skip Monday (inbox overload) and Friday (weekend mindset)
**Throttle:** 2-5 minute random delay between sends per inbox
**Daily cap per inbox:** 30 (start) → 50 (week 2) → 75 (week 3+)

### E. Volume ramp (CRITICAL — don't blast all 442 on day 1)

| Phase | Days | Daily volume | Why |
|---|---|---|---|
| Ramp 1 | Days 1-3 | 30/day | Establish reputation, watch bounce rate |
| Ramp 2 | Days 4-7 | 75/day | Verify open rate >25%, reply rate >2% |
| Steady | Day 8+ | 150/day | Full speed if Ramp 2 metrics held |

At 150/day with 3 inboxes (50 each), full 442 send takes **~3 weeks** for Day 0 alone. The sequence completes Day 14 around **5 weeks total**.

### F. Spintax behavior (automatic — no config needed)
Subjects with `{a|b|c}` syntax — ReachInbox picks one variant randomly per send. Already baked in:
- Day 3: outcome-tail variants (5 options on ~99 emails)
- Day 7: opener variants (6 options on ~245 emails)
- Day 14: closer variants (5 options on 441 emails) — biggest impact, kills the "Closing the loop" template fingerprint

### G. Tracking
- [x] Open tracking ON
- [x] Reply tracking ON
- [ ] Click tracking OFF (no links in bodies; turning it on adds tracking pixels that some ESPs flag)
- [x] Auto-unsubscribe link in footer: ReachInbox handles via account-level setting

---

## 4. Day-1 metrics watchlist

Check these in the ReachInbox dashboard after first 24 hours:

| Metric | Healthy | Yellow flag | Red flag — PAUSE |
|---|---|---|---|
| Delivered | >95% | 90-95% | <90% |
| Bounce rate | <2% | 2-5% | **>5% pause** |
| Open rate | >25% | 15-25% | <15% |
| Reply rate | >2% | 1-2% | <1% (after 50+ sent) |
| Spam reports | 0 | 1-2 | **3+ pause** |

If **bounce >5%** at any point, pause immediately and re-verify the affected segment (Reoon validated, but sending domain reputation drives most bounces).

---

## 5. After the campaign

- Replies route to your sending-domain inbox(es) — set up a forward to `dominiiking@gmail.com` or check daily
- Positive replies → handoff to Cold Caller workflow (manual fire `curl -X POST https://n8n.ringrouteusa.com/webhook/dial-now`)
- Bounces → drop from list; don't retry the same address
- Unsubscribes → ReachInbox auto-blocks; export the unsub list weekly for portfolio-wide suppression

---

## 6. Files at hand

| File | Use |
|---|---|
| `cold-email-reachinbox-PRODUCTION.csv` | **Upload this** (442 valid restaurants) |
| `cold-email-reachinbox-REJECTED.csv` | 46 Reoon-rejected — do NOT send |
| `cold-email-reachinbox-DROPPED.csv` | 4 non-restaurant rows — do NOT send |
| `cold-email-reachinbox-FINAL-ALL.csv` | Raw pre-clean (debugging only) |

Generated 2026-05-23 by Cold Email App + OpenAI gpt-4o-mini + Reoon verification.
