/**
 * BATCH #2 — Single-command orchestrator for the next LeadRocks pull.
 *
 * USAGE:
 *   $env:OPENAI_API_KEY = "<your key>"  # if not already set
 *   node scripts/batch2-run.mjs <path-to-new-leadrocks.csv>
 *
 * Runs end-to-end:
 *   Stage 1: Load + filter (LeadRocks format, has email, restaurant only, not in Batch #1)
 *   Stage 2: Day 0 generation (OpenAI gpt-4o-mini, concurrency=10)
 *   Stage 3: Day 3 / 7 / 14 generation (sequence-aware prompts)
 *   Stage 4: Spintax + Reoon verification (concurrency=1, 1.3s delay)
 *   Stage 5: Unicode normalize + non-restaurant filter + CSV export
 *
 * Resumable: each stage checkpoints to JSON in scripts/batch2-state/.
 * Re-running picks up where it left off.
 *
 * OUTPUT:
 *   Set env vars: REACHINBOX_OUTPUT, REJECTED_OUTPUT, DROPPED_OUTPUT
 *   (defaults: ./cold-email-reachinbox-batch2-PRODUCTION.csv, etc.)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

// ─── CONFIG ────────────────────────────────────────────────────────────────
const INPUT_CSV = process.argv[2];
if (!INPUT_CSV) {
  console.error("Usage: node scripts/batch2-run.mjs <path-to-leadrocks.csv>");
  process.exit(1);
}
if (!existsSync(INPUT_CSV)) {
  console.error(`Input CSV not found: ${INPUT_CSV}`);
  process.exit(1);
}

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY && (process.env.LLM_PROVIDER || "openai") === "openai") {
  console.error("Missing OPENAI_API_KEY env var");
  process.exit(1);
}
const REOON_KEY = process.env.REOON_API_KEY;
if (!REOON_KEY) {
  console.error("Missing REOON_API_KEY env var — set it in .env");
  process.exit(1);
}

// Already-shipped emails (don't double-message anyone from Batch #1)
const BATCH1_PROD = process.env.PREVIOUS_BATCH;

const STATE_DIR = process.env.STATE_DIR || "./scripts/batch2-state";
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

const ELIGIBLE_FILE = `${STATE_DIR}/01-eligible.json`;
const DAY0_FILE     = `${STATE_DIR}/02-day0.json`;
const SEQ_FILE      = `${STATE_DIR}/03-sequence.json`;
const VERIFY_CACHE  = `${STATE_DIR}/04-reoon-cache.json`;

const OUT_PROD   = process.env.REACHINBOX_OUTPUT || "./cold-email-reachinbox-batch2-PRODUCTION.csv";
const OUT_REJECT = process.env.REJECTED_OUTPUT || "./cold-email-reachinbox-batch2-REJECTED.csv";
const OUT_DROP   = process.env.DROPPED_OUTPUT || "./cold-email-reachinbox-batch2-DROPPED.csv";

const MODEL        = "gpt-4o-mini";
const GEN_CONCURRENCY = 10;
const VERIFY_CONCURRENCY = 1;
const VERIFY_DELAY_MS = 1300;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── HELPERS ───────────────────────────────────────────────────────────────
function getBestEmail(row) {
  const candidates = [
    [row["Direct Email #1"], row["Direct Email #1 Status"]],
    [row["Direct Email #2"], row["Direct Email #2 Status"]],
    [row["Direct Email #3"], row["Direct Email #3 Status"]],
    [row["Work Email #1"],   row["Work Email #1 Status"]],
    [row["Work Email #2"],   row["Work Email #2 Status"]],
    [row["Work Email #3"],   row["Work Email #3 Status"]],
    [row["Work Email #4"],   row["Work Email #4 Status"]],
    [row["Company Email"],   "ok"],
  ];
  const ok = candidates.find(([v, s]) => v && (s === "ok" || s?.startsWith("ok_for_all") || s?.includes("|ok")));
  return (ok || candidates.find(([v]) => v) || [])[0] || "";
}
function parseLocation(loc) {
  const p = (loc || "").split(",").map(s => s.trim());
  return { city: p[0] || "", state: p[1] || "" };
}
function getAngle(job) {
  const t = (job || "").toLowerCase();
  if (t.includes("chef") && t.includes("owner")) return "cooking during service while calls go unanswered";
  if (t.includes("co-owner") || t.includes("co owner")) return "two owners busy while calls ring unanswered";
  if (t.includes("franchise")) return "managing multiple locations while calls go unanswered";
  return "running the restaurant while calls go unanswered";
}
function normalizeText(s) {
  return (s || "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/[ ​]/g, " ")
    .replace(/[´`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
const NON_RESTAURANT = [
  /property\s*management/i,
  /bar\s*marketing\s*basics/i,
  /cleaner\s*solutions/i,
  /consulting\s*company\b/i,
];
function isNonRestaurant(co) {
  return NON_RESTAURANT.some(re => re.test(co || ""));
}

// ─── OPENAI WRAPPER ────────────────────────────────────────────────────────
async function callOpenAI(prompt, max_tokens = 500) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens,
          temperature: 0.7,
          messages: [
            { role: "system", content: "Output exactly: Subject: <line>\\n\\n<body>. Plain text. No markdown, no signoff, no greeting. ALWAYS finish your sentences. End with the required CTA." },
            { role: "user", content: prompt }
          ]
        })
      });
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) { await sleep(1000); continue; }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (e) {
      await sleep(1000 * (attempt + 1));
    }
  }
  return "";
}
function parseEmail(raw) {
  const m = raw.match(/^(?:\[?Subject(?:\s+Line)?:?\]?\s*)(.+?)(?:\n|$)/im);
  if (!m) {
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    return { subject: lines[0] || "", body: lines.slice(1).join("\n").trim() };
  }
  return {
    subject: m[1].trim().replace(/^\[|\]$/g, ""),
    body: raw.slice(raw.indexOf(m[0]) + m[0].length).replace(/^\s*\n+/, "").trim()
  };
}
function sanitize(subject, body) {
  body = body.replace(/\[[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  body = body.replace(/\n*(best|thanks|regards|cheers|sincerely)[,!.\s].*$/is, "").trim();
  subject = subject.replace(/^["']|["']$/g, "").trim();
  return { subject: normalizeText(subject), body: normalizeText(body) };
}

// ─── PROMPTS ───────────────────────────────────────────────────────────────
function promptDay0(row) {
  const fn = row["First Name"]?.trim() || "";
  const co = row["Company"]?.trim() || "";
  const job = row["Job Title"]?.trim() || "Owner";
  const { city, state } = parseLocation(row["Location"]);
  const angle = getAngle(job);
  return `Write a cold email for ${fn}, ${job} at ${co} in ${city}, ${state}.

Product: Voice AI that answers restaurant phone calls 24/7 — takes reservations, handles questions, sounds like their staff. Live in 48 hours.

Situation hook: ${angle}

REQUIREMENTS:
- Subject: under 60 chars, includes "${fn}" or "${co}". DO NOT start with: Boost, Elevate, Unlock, Revolutionize, Transform, Unleash, Supercharge, Maximize, Imagine.
- Body: 70-85 words. Open with a SPECIFIC SCENE at ${co} during a busy moment (NOT the words "Imagine" or "Picture"). Mention the missed-call cost. Introduce the Voice AI in one tight sentence. END with: "Worth 15 minutes this week?"
- NO greeting. NO sign-off. NO bracketed placeholders. Plain text only.

Format:
Subject: <line>

<body>`;
}
function promptDay3(row, d0Subject) {
  const fn = row["First Name"]?.trim() || "";
  const co = row["Company"]?.trim() || "";
  const job = row["Job Title"]?.trim() || "Owner";
  const { city, state } = parseLocation(row["Location"]);
  return `Day 3 of a 4-step cold sequence to ${fn} (${job} at ${co} in ${city}, ${state}).
Day 0 subject was: "${d0Subject}".

NOW write Day 3 — DIFFERENT angle: SPECIFIC PROOF/OUTCOME.

Product: Voice AI 24/7 restaurant phones, takes reservations, sounds like staff, 48hr launch.

REQUIREMENTS:
- Subject: 35-55 chars. Mentions outcome/number. DO NOT start with Boost/Elevate/Unlock/Imagine.
- Body: 55-75 words. Open with a specific outcome from a comparable restaurant. Bridge to ${co}. END with: "Want a 5-minute walkthrough this week?"
- No greeting. No sign-off. No brackets. No "Imagine". No "free". No "guarantee".

Format:
Subject: <line>

<body>`;
}
function promptDay7(row) {
  const fn = row["First Name"]?.trim() || "";
  const co = row["Company"]?.trim() || "";
  const { city } = parseLocation(row["Location"]);
  return `Day 7 of a 4-step cold sequence to ${fn} (Owner at ${co} in ${city}). PATTERN INTERRUPT.

Product: Voice AI 24/7 restaurant phones.

REQUIREMENTS:
- Subject: a QUESTION under 40 chars (e.g. "Quick question, ${fn}?").
- Body: 30-50 words. ONE data point about ${city} or restaurant calls + ONE question. END with: "Worth a 10-min look this week?"
- No greeting. No sign-off. No brackets. No "Imagine".

Format:
Subject: <line>

<body>`;
}
function promptDay14(row) {
  const fn = row["First Name"]?.trim() || "";
  const co = row["Company"]?.trim() || "";
  const { city } = parseLocation(row["Location"]);
  return `Day 14 of a 4-step cold sequence to ${fn} at ${co} in ${city}. FINAL email — graceful break-up.

REQUIREMENTS:
- Subject: hints at closure. Examples: "Closing the loop, ${fn}" / "Last note on ${co}" / "Stepping back". Under 45 chars.
- Body: 40-55 words. Acknowledge timing might not be right. Drop one useful nugget (tip or stat). End with: "If calls become a priority later, just reply 'later' and I'll circle back."
- No greeting. No brackets. No "Imagine".

Format:
Subject: <line>

<body>`;
}

// ─── QA GATES ──────────────────────────────────────────────────────────────
const BANNED_OPEN = /^(boost|elevate|unlock|revolutionize|transform|unleash|supercharge|maximize|imagine)/i;
function qaDay0(p) {
  const wc = p.body.split(/\s+/).length;
  return wc >= 55 && wc <= 95
    && /worth 15 minutes this week/i.test(p.body)
    && !BANNED_OPEN.test(p.subject)
    && /[.!?]$/.test(p.body)
    && !/\bfree\b|\bguarantee\b/i.test(p.body);
}
function qaDay3(p) {
  const wc = p.body.split(/\s+/).length;
  return wc >= 45 && wc <= 90
    && /walkthrough this week/i.test(p.body)
    && !BANNED_OPEN.test(p.subject)
    && /[.!?]$/.test(p.body);
}
function qaDay7(p) {
  const wc = p.body.split(/\s+/).length;
  return wc >= 20 && wc <= 65
    && /(worth a 10-min look|10.min look)/i.test(p.body)
    && !BANNED_OPEN.test(p.subject)
    && /[.!?]$/.test(p.body);
}
function qaDay14(p) {
  const wc = p.body.split(/\s+/).length;
  return wc >= 25 && wc <= 70
    && /(reply 'later'|reply "later"|reply later)/i.test(p.body)
    && /[.!?]$/.test(p.body);
}

// ─── STAGE 1: LOAD + FILTER ────────────────────────────────────────────────
async function stage1Load() {
  if (existsSync(ELIGIBLE_FILE)) {
    const cached = JSON.parse(readFileSync(ELIGIBLE_FILE, "utf-8"));
    console.log(`[Stage 1] ✓ Resumed: ${cached.length} eligible rows`);
    return cached;
  }
  console.log(`[Stage 1] Loading ${INPUT_CSV}`);
  const raw = readFileSync(INPUT_CSV, "utf-8");
  const rows = Papa.parse(raw, { header: true, skipEmptyLines: true }).data;
  console.log(`  total rows: ${rows.length}`);

  // Build exclusion set from Batch #1 PRODUCTION
  let excludeEmails = new Set();
  if (existsSync(BATCH1_PROD)) {
    const b1 = Papa.parse(readFileSync(BATCH1_PROD, "utf-8"), { header: true, skipEmptyLines: true }).data;
    excludeEmails = new Set(b1.map(r => (r.Email || "").toLowerCase().trim()).filter(Boolean));
    console.log(`  Batch #1 emails to exclude: ${excludeEmails.size}`);
  }

  const seen = new Set();
  const eligible = [];
  let dropped = { noEmail: 0, nonRestaurant: 0, wrongIndustry: 0, batch1Dup: 0, sameRunDup: 0 };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = getBestEmail(r).toLowerCase().trim();
    const co = r["Company"]?.trim() || "";
    const industry = (r["Industry"] || "").trim().toLowerCase();
    if (!email) { dropped.noEmail++; continue; }
    if (industry !== "restaurants") { dropped.wrongIndustry++; continue; }
    if (isNonRestaurant(co)) { dropped.nonRestaurant++; continue; }
    if (excludeEmails.has(email)) { dropped.batch1Dup++; continue; }
    if (seen.has(email)) { dropped.sameRunDup++; continue; }
    seen.add(email);
    eligible.push({
      rowIndex: i,
      email,
      firstName: r["First Name"]?.trim() || "",
      lastName: r["Last Name"]?.trim() || "",
      company: co,
      jobTitle: r["Job Title"]?.trim() || "Owner",
      location: r["Location"] || "",
      linkedinUrl: r["Linked Url"] || "",
      _row: r, // keep full row for prompt building
    });
  }
  console.log(`  ✓ eligible: ${eligible.length}`);
  console.log(`  dropped — noEmail:${dropped.noEmail} wrongIndustry:${dropped.wrongIndustry} nonRest:${dropped.nonRestaurant} batch1Dup:${dropped.batch1Dup} sameRunDup:${dropped.sameRunDup}`);
  writeFileSync(ELIGIBLE_FILE, JSON.stringify(eligible, null, 2));
  return eligible;
}

// ─── STAGE 2: DAY 0 ────────────────────────────────────────────────────────
async function stage2Day0(eligible) {
  let progress = existsSync(DAY0_FILE) ? JSON.parse(readFileSync(DAY0_FILE, "utf-8")) : [];
  const doneSet = new Set(progress.filter(p => p.ok).map(p => p.email));
  const todo = eligible.filter(e => !doneSet.has(e.email));
  console.log(`\n[Stage 2] Day 0: ${doneSet.size} done / ${todo.length} todo`);
  if (todo.length === 0) return progress;

  let cursor = 0, completed = 0;
  async function worker() {
    while (cursor < todo.length) {
      const item = todo[cursor++];
      let ok = false, lastSubject = "", lastBody = "";
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const raw = await callOpenAI(promptDay0(item._row), 500);
        if (!raw) continue;
        const parsed = sanitize(...Object.values(parseEmail(raw)));
        lastSubject = parsed.subject; lastBody = parsed.body;
        if (qaDay0(parsed)) {
          progress.push({ email: item.email, rowIndex: item.rowIndex, ok: true, subject: parsed.subject, body: parsed.body });
          ok = true;
        }
      }
      if (!ok) progress.push({ email: item.email, rowIndex: item.rowIndex, ok: false, subject: lastSubject, body: lastBody });
      completed++;
      if (completed % 20 === 0) {
        writeFileSync(DAY0_FILE, JSON.stringify(progress, null, 2));
        process.stdout.write(`\r  Day 0 ${completed}/${todo.length}    `);
      }
    }
  }
  await Promise.all(Array.from({ length: GEN_CONCURRENCY }, worker));
  writeFileSync(DAY0_FILE, JSON.stringify(progress, null, 2));
  const okCount = progress.filter(p => p.ok).length;
  console.log(`\r  Day 0 ✓ ${okCount}/${eligible.length} passed QA    `);
  return progress;
}

// ─── STAGE 3: DAY 3 / 7 / 14 ───────────────────────────────────────────────
async function stage3Sequence(eligible, day0Progress) {
  const d0Map = new Map(day0Progress.filter(p => p.ok).map(p => [p.email, p]));
  const eligibleWithD0 = eligible.filter(e => d0Map.has(e.email));

  let progress = existsSync(SEQ_FILE) ? JSON.parse(readFileSync(SEQ_FILE, "utf-8")) : [];
  const progressMap = new Map(progress.map(p => [p.email, p]));

  console.log(`\n[Stage 3] Sequence: ${eligibleWithD0.length} contacts × 3 days`);

  const tasks = [];
  for (const item of eligibleWithD0) {
    const existing = progressMap.get(item.email) || { email: item.email, rowIndex: item.rowIndex };
    if (!existing.day3?.ok) tasks.push({ item, day: "day3", existing });
    if (!existing.day7?.ok) tasks.push({ item, day: "day7", existing });
    if (!existing.day14?.ok) tasks.push({ item, day: "day14", existing });
    progressMap.set(item.email, existing);
  }
  console.log(`  todo: ${tasks.length} tasks across ${eligibleWithD0.length} contacts`);
  if (tasks.length === 0) {
    return Array.from(progressMap.values());
  }

  let cursor = 0, completed = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const t = tasks[cursor++];
      const d0 = d0Map.get(t.item.email);
      let prompt, qa, max_tokens = 500;
      if (t.day === "day3") { prompt = promptDay3(t.item._row, d0.subject); qa = qaDay3; }
      else if (t.day === "day7") { prompt = promptDay7(t.item._row); qa = qaDay7; max_tokens = 350; }
      else { prompt = promptDay14(t.item._row); qa = qaDay14; max_tokens = 350; }

      let ok = false, lastP = null;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const raw = await callOpenAI(prompt, max_tokens);
        if (!raw) continue;
        const parsed = sanitize(...Object.values(parseEmail(raw)));
        lastP = parsed;
        if (qa(parsed)) ok = true;
      }
      t.existing[t.day] = { ok, subject: lastP?.subject || "", body: lastP?.body || "" };
      completed++;
      if (completed % 30 === 0) {
        const snapshot = Array.from(progressMap.values());
        writeFileSync(SEQ_FILE, JSON.stringify(snapshot, null, 2));
        process.stdout.write(`\r  Seq ${completed}/${tasks.length}    `);
      }
    }
  }
  await Promise.all(Array.from({ length: GEN_CONCURRENCY }, worker));
  const snapshot = Array.from(progressMap.values());
  writeFileSync(SEQ_FILE, JSON.stringify(snapshot, null, 2));
  const okD3 = snapshot.filter(p => p.day3?.ok).length;
  const okD7 = snapshot.filter(p => p.day7?.ok).length;
  const okD14 = snapshot.filter(p => p.day14?.ok).length;
  console.log(`\r  Sequence ✓ D3:${okD3} D7:${okD7} D14:${okD14} of ${eligibleWithD0.length}    `);
  return snapshot;
}

// ─── SPINTAX ───────────────────────────────────────────────────────────────
const DAY7_OPENERS = ["Quick question", "One thing", "Curious", "Wondering", "Ever wondered", "Fast take"];
const DAY14_OPENERS = ["Closing the loop", "Stepping back", "Last note", "Wrapping up", "Final thought"];
const DAY3_TAIL = "{recovered last weekend|saved in one weekend|captured in 48 hours|won back this month|that would've gone to voicemail}";

function spinSubject(subject, day, firstName) {
  if (day === "day14") {
    const m = subject.match(/^(closing the loop|stepping back|last note|wrapping up|final thought)[,\s]*(.*)$/i);
    if (m) {
      const tail = m[2] || (firstName ? `, ${firstName}` : "");
      return `{${DAY14_OPENERS.join("|")}}${tail.startsWith(",") ? tail : ", " + tail}`.replace(/,\s*,/g, ",").trim();
    }
  }
  if (day === "day7") {
    if (/^(did you know|ever thought|ever wondered|quick question|one thing|curious|wondering)/i.test(subject)) {
      const rest = subject.replace(/^(did you know|ever thought|ever wondered|quick question|one thing|curious|wondering)[,?\s:]+/i, "");
      return `{${DAY7_OPENERS.join("|")}}${rest ? " — " + rest : ""}`.trim().replace(/—\s*$/, "");
    }
  }
  if (day === "day3") {
    if (/\b(recovered|saved|lost|missed)\b.{0,40}(last weekend|this week|in.*weekend|in 48 hours|this month)\b/i.test(subject)) {
      const head = subject.split(/\b(recovered|saved|lost|missed|won)\b/i)[0].trim();
      const nounMatch = head.match(/^(.+?\b(?:reservations?|bookings?|calls?|guests?))\b/i);
      if (nounMatch) return `${nounMatch[1]} ${DAY3_TAIL}`.trim();
    }
  }
  return subject;
}

// ─── STAGE 4: REOON VERIFY ─────────────────────────────────────────────────
async function verifyReoon(email) {
  const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${REOON_KEY}&mode=quick`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { status: "api_error", code: res.status };
    const data = await res.json();
    return {
      status: data.status || "unknown",
      is_safe: data.status === "safe" || data.status === "valid",
      is_role: !!data.is_role_account,
      is_disposable: !!data.is_disposable,
      is_catchall: !!data.is_catch_all,
    };
  } catch (e) {
    return { status: "error", error: (e.message || "").slice(0, 80) };
  }
}

async function stage4Verify(contacts) {
  const cache = existsSync(VERIFY_CACHE) ? JSON.parse(readFileSync(VERIFY_CACHE, "utf-8")) : {};
  const todo = contacts.filter(c => !cache[c.email]);
  console.log(`\n[Stage 4] Reoon verify: ${todo.length} new / ${contacts.length - todo.length} cached`);
  if (todo.length === 0) return cache;

  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < todo.length) {
      const c = todo[cursor++];
      let attempts = 0;
      while (attempts < 4) {
        const result = await verifyReoon(c.email);
        if (result.status === "api_error" && result.code === 429) {
          attempts++;
          await sleep(15_000 * attempts);
          continue;
        }
        cache[c.email] = result;
        break;
      }
      if (!cache[c.email]) cache[c.email] = { status: "api_error", code: 429 };
      done++;
      if (done % 5 === 0) {
        writeFileSync(VERIFY_CACHE, JSON.stringify(cache, null, 2));
        process.stdout.write(`\r  Reoon ${done}/${todo.length}    `);
      }
      await sleep(VERIFY_DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: VERIFY_CONCURRENCY }, worker));
  writeFileSync(VERIFY_CACHE, JSON.stringify(cache, null, 2));
  console.log(`\r  Reoon ✓ ${done}/${todo.length}    `);
  return cache;
}

// ─── STAGE 5: EXPORT ───────────────────────────────────────────────────────
function toCsv(list) {
  const headers = ["Email", "First_Name", "Last_Name", "Company_Name", "Linkedin",
    "Verify_Status", "Is_Role", "Is_Catchall",
    "Subject_Day0", "Body_Day0",
    "Subject_Day3", "Body_Day3",
    "Subject_Day7", "Body_Day7",
    "Subject_Day14", "Body_Day14"];
  const lines = list.map(c => [
    c.email, c.firstName, c.lastName, c.company, c.linkedinUrl,
    c.verify_status, c.is_role ? "yes" : "no", c.is_catchall ? "yes" : "no",
    c.day0?.subject || "", c.day0?.body || "",
    c.day3?.subject || "", c.day3?.body || "",
    c.day7?.subject || "", c.day7?.body || "",
    c.day14?.subject || "", c.day14?.body || "",
  ].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
  return "﻿" + [headers.join(","), ...lines].join("\n");
}

async function stage5Export(eligible, day0Progress, seqProgress, verifyCache) {
  const d0Map = new Map(day0Progress.filter(p => p.ok).map(p => [p.email, p]));
  const seqMap = new Map(seqProgress.map(p => [p.email, p]));
  const dropped = [];
  const safe = [], rejected = [];

  for (const e of eligible) {
    const d0 = d0Map.get(e.email);
    if (!d0) { dropped.push({ ...e, _reason: "no_day0" }); continue; }
    const seq = seqMap.get(e.email) || {};
    if (isNonRestaurant(e.company)) { dropped.push({ ...e, _reason: "non_restaurant" }); continue; }

    const c = {
      email: e.email,
      firstName: e.firstName,
      lastName: e.lastName,
      company: e.company,
      linkedinUrl: e.linkedinUrl,
      day0: { subject: spinSubject(normalizeText(d0.subject), "day0", e.firstName), body: normalizeText(d0.body) },
      day3: seq.day3?.ok ? { subject: spinSubject(normalizeText(seq.day3.subject), "day3", e.firstName), body: normalizeText(seq.day3.body) } : null,
      day7: seq.day7?.ok ? { subject: spinSubject(normalizeText(seq.day7.subject), "day7", e.firstName), body: normalizeText(seq.day7.body) } : null,
      day14: seq.day14?.ok ? { subject: spinSubject(normalizeText(seq.day14.subject), "day14", e.firstName), body: normalizeText(seq.day14.body) } : null,
    };

    const v = verifyCache[e.email] || { status: "unknown" };
    c.verify_status = v.status;
    c.is_role = !!v.is_role;
    c.is_disposable = !!v.is_disposable;
    c.is_catchall = !!v.is_catchall;

    if (v.is_disposable) rejected.push(c);
    else if (v.status === "safe" || v.status === "valid") safe.push(c);
    else rejected.push(c);
  }

  writeFileSync(OUT_PROD, toCsv(safe), "utf8");
  writeFileSync(OUT_REJECT, toCsv(rejected), "utf8");
  if (dropped.length > 0) writeFileSync(OUT_DROP, toCsv(dropped.map(d => ({ ...d, day0: null, day3: null, day7: null, day14: null, verify_status: d._reason }))), "utf8");

  console.log(`\n📊 Final breakdown:`);
  console.log(`  🟢 PRODUCTION (ship now):  ${safe.length}`);
  console.log(`  🔴 REJECTED:               ${rejected.length}`);
  console.log(`  ⚪ DROPPED:                ${dropped.length}`);
  console.log(`\n📤 Files:`);
  console.log(`  ${OUT_PROD}`);
  console.log(`  ${OUT_REJECT}`);
  if (dropped.length > 0) console.log(`  ${OUT_DROP}`);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`🚀 Batch #2 pipeline — input: ${INPUT_CSV}`);
  const eligible = await stage1Load();
  if (eligible.length === 0) { console.error("No eligible rows. Exit."); return; }
  const day0 = await stage2Day0(eligible);
  const seq = await stage3Sequence(eligible, day0);

  // Build contacts list for verification (only those with a successful Day 0)
  const verifyTargets = eligible.filter(e => day0.find(d => d.email === e.email && d.ok));
  const cache = await stage4Verify(verifyTargets);

  await stage5Export(eligible, day0, seq, cache);
  console.log(`\n⏱  Total runtime: ${Math.round((Date.now() - t0) / 60000)} min`);
  console.log(`✅ Done. Import ${OUT_PROD} into ReachInbox.`);
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
