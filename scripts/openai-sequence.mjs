/**
 * OPENAI 4-STEP SEQUENCE GENERATOR
 * For each of the 500 leads (already have Day 0), generate Day 3, 7, 14
 * with hyper-personalized, sequence-aware prompts.
 *
 * node scripts/openai-sequence.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const CSV       = process.env.INPUT_CSV || "./data/leads.csv";
const D0_FILE   = process.env.OVERNIGHT_PROGRESS || "./scripts/overnight-progress.json";
const SEQ_FILE  = process.env.SEQ_PROGRESS || "./scripts/sequence-progress.json";
const EXPORT    = process.env.REACHINBOX_OUTPUT || "./cold-email-reachinbox-SEQUENCE.csv";
const MODEL     = "gpt-4o-mini";
const CONCURRENCY = 10;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error("Missing OPENAI_API_KEY"); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── DATA HELPERS ──────────────────────────────────────────────────────────
function parseLocation(loc) {
  const parts = (loc||"").split(",").map(s=>s.trim());
  return { city: parts[0]||"", state: parts[1]||"" };
}
function getBestEmail(row) {
  const candidates = [
    [row["Direct Email #1"], row["Direct Email #1 Status"]],
    [row["Direct Email #2"], row["Direct Email #2 Status"]],
    [row["Work Email #1"],   row["Work Email #1 Status"]],
    [row["Work Email #2"],   row["Work Email #2 Status"]],
    [row["Company Email"],   "ok"],
  ];
  const ok = candidates.find(([v,s])=>v && (s==="ok"||s?.startsWith("ok_for_all")));
  return (ok||candidates.find(([v])=>v)||[])[0]||"";
}

// ─── PROMPTS ────────────────────────────────────────────────────────────────
function promptDay3(ctx) {
  const { fn, co, city, state, job, d0Subject } = ctx;
  return `Day 3 of a 4-step cold sequence to ${fn} (${job} at ${co} in ${city}, ${state}).

Day 0 already sent. Day 0 subject was: "${d0Subject}". Day 0 described the missed-call pain at ${co}.

NOW write Day 3 — DIFFERENT angle: SPECIFIC PROOF/OUTCOME.

Product: Voice AI that answers restaurant calls 24/7, takes reservations, sounds like staff, live in 48 hours.

REQUIREMENTS:
- Subject: 35-55 chars. Mentions an outcome or number. DO NOT repeat the Day 0 subject phrasing. DO NOT start with: Boost, Elevate, Unlock, Revolutionize, Transform, Unleash, Supercharge, Maximize, Imagine.
- Body: 55-75 words. Open with a SPECIFIC outcome from another restaurant similar to ${co} (e.g. "Last weekend, a 40-seat bistro in [comparable city] recovered 14 reservations they would've lost to voicemail"). Then a 1-sentence bridge to ${co} specifically. End with: "Want a 5-minute walkthrough this week?"
- Plain text. No greeting line ("Hi ${fn}"). No sign-off. No bracketed placeholders.

Format:
Subject: <line>

<body>`;
}

function promptDay7(ctx) {
  const { fn, co, city, state, job, d0Subject } = ctx;
  return `Day 7 of a 4-step cold sequence to ${fn} (${job} at ${co} in ${city}).

Day 0 + Day 3 already sent. No reply.

NOW write Day 7 — PATTERN INTERRUPT. Short, punchy, curiosity-driven.

Product: Voice AI that answers restaurant calls 24/7, live in 48 hours.

REQUIREMENTS:
- Subject: a QUESTION, under 40 chars (e.g. "Quick question, ${fn}?" or "${co} — one thing").
- Body: 30-50 words. Cite ONE surprising data point about ${city} restaurants OR ${co}'s restaurant category, then ONE direct question. Tone = curious peer, not salesperson. DO NOT pitch the product here.
- End with one line: "Worth a 10-min look this week?"
- No greeting. No sign-off. No bracketed placeholders. No "Imagine".

Format:
Subject: <line>

<body>`;
}

function promptDay14(ctx) {
  const { fn, co, city, state, job } = ctx;
  return `Day 14 of a 4-step cold sequence to ${fn} (${job} at ${co} in ${city}). FINAL email — graceful break-up.

No replies to Days 0/3/7.

REQUIREMENTS:
- Subject: hints at closure. Examples: "Closing the loop, ${fn}" / "Last note on ${co}" / "Stepping back". Under 45 chars.
- Body: 40-55 words. Acknowledge timing might not be right. Drop ONE useful nugget (a tip, a stat about restaurant phones, or a free resource). Leave the door open with: "If calls become a priority later, just reply 'later' and I'll circle back." End there. No "Best," no signature.
- No greeting. No bracketed placeholders. No "Imagine".

Format:
Subject: <line>

<body>`;
}

function parseEmail(raw) {
  const m = raw.match(/^(?:\[?Subject(?:\s+Line)?:?\]?\s*)(.+?)(?:\n|$)/im);
  if (!m) {
    const lines = raw.split("\n").map(l=>l.trim()).filter(Boolean);
    return { subject: lines[0]||"", body: lines.slice(1).join("\n").trim() };
  }
  const subject = m[1].trim().replace(/^\[|\]$/g,"");
  const body = raw.slice(raw.indexOf(m[0])+m[0].length).replace(/^\s*\n+/,"").trim();
  return { subject, body };
}
function sanitize(subject, body) {
  body = body.replace(/\[[^\]]+\]/g,"").replace(/\n{3,}/g,"\n\n").trim();
  body = body.replace(/\n*(best|thanks|regards|cheers|sincerely)[,!.\s].*$/is,"").trim();
  return { subject: subject.replace(/^["']|["']$/g,"").trim(), body };
}

// ─── OPENAI ─────────────────────────────────────────────────────────────────
async function callOpenAI(prompt, retries=3) {
  for (let a=0; a<retries; a++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role:"system", content:"You write personalized cold emails for restaurant owners as part of a 4-step sequence. Each email in the sequence MUST use a different angle from the previous ones. Output exactly: Subject: <line>\\n\\n<body>. Plain text. No markdown, no signoff, no greeting." },
            { role:"user", content: prompt }
          ],
          max_tokens: 300, temperature: 0.75
        }),
        signal: AbortSignal.timeout(60_000)
      });
      if (res.status===429) { await sleep(2000*(a+1)); continue; }
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (content.length>20) return content;
      throw new Error("empty");
    } catch(e) { if (a<retries-1) await sleep(1500*(a+1)); else throw e; }
  }
}

async function genDay(ctx, dayLabel, promptFn) {
  try {
    const raw = await callOpenAI(promptFn(ctx));
    let { subject, body } = parseEmail(raw);
    ({ subject, body } = sanitize(subject, body));
    const wc = body.split(/\s+/).length;
    const minWc = dayLabel === "day7" ? 18 : dayLabel === "day14" ? 28 : 14;
    if (subject && body && wc >= minWc) return { ok:true, subject, body };
    return { ok:false, error:`parse fail (wc=${wc})` };
  } catch(e) { return { ok:false, error: (e.message||"").slice(0,80) }; }
}

// ─── EXPORT ─────────────────────────────────────────────────────────────────
function exportCSV(rows, d0Map, seqMap) {
  const headers = ["Email","First_Name","Last_Name","Company_Name","Linkedin",
                   "Subject_Day0","Body_Day0","Subject_Day3","Body_Day3",
                   "Subject_Day7","Body_Day7","Subject_Day14","Body_Day14"];
  const lines = [];
  let kept = 0;
  for (let i=0; i<rows.length; i++) {
    const d0 = d0Map.get(i);
    if (!d0 || !d0.email) continue;
    const seq = seqMap.get(i) || {};
    const row = rows[i];
    lines.push([
      d0.email,
      row["First Name"]||"", row["Last Name"]||"",
      row["Company"]||"", row["Linked Url"]||"",
      d0.subject, d0.body,
      seq.day3?.subject||"", seq.day3?.body||"",
      seq.day7?.subject||"", seq.day7?.body||"",
      seq.day14?.subject||"", seq.day14?.body||""
    ].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(","));
    kept++;
  }
  writeFileSync(EXPORT, "﻿"+[headers.join(","), ...lines].join("\n"), "utf8");
  console.log(`\n📤 Exported ${kept} contacts → ${EXPORT}`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📋 Loading CSV + Day 0 progress...`);
  const { data: rows } = Papa.parse(readFileSync(CSV,"utf-8"), { header:true, skipEmptyLines:true });
  const d0Raw = JSON.parse(readFileSync(D0_FILE,"utf-8"));
  const d0Map = new Map(d0Raw.filter(x=>x.ok).map(x=>[x.rowIndex, x]));
  console.log(`✓ ${rows.length} rows / ${d0Map.size} Day 0 emails ready`);

  // Load or init sequence progress
  let seqMap = new Map();
  if (existsSync(SEQ_FILE)) {
    const seq = JSON.parse(readFileSync(SEQ_FILE,"utf-8"));
    seqMap = new Map(seq.map(x=>[x.rowIndex, x]));
    console.log(`♻️  Loaded ${seqMap.size} existing sequence rows`);
  }

  // Build task list — one task per (lead, day) needing generation
  const tasks = [];
  for (const [rowIndex, d0] of d0Map.entries()) {
    const existing = seqMap.get(rowIndex) || { rowIndex };
    const row = rows[rowIndex];
    const ctx = {
      fn: row["First Name"]?.trim()||"",
      co: row["Company"]?.trim()||"",
      job: row["Job Title"]?.trim()||"Owner",
      ...parseLocation(row["Location"]),
      d0Subject: d0.subject
    };
    if (!existing.day3?.ok) tasks.push({ rowIndex, day:"day3", ctx, fn: promptDay3 });
    if (!existing.day7?.ok) tasks.push({ rowIndex, day:"day7", ctx, fn: promptDay7 });
    if (!existing.day14?.ok) tasks.push({ rowIndex, day:"day14", ctx, fn: promptDay14 });
  }
  console.log(`🔥 ${tasks.length} day-generations queued, concurrency=${CONCURRENCY}\n`);

  if (tasks.length === 0) {
    console.log("Nothing to do — sequence already complete.");
    exportCSV(rows, d0Map, seqMap);
    return;
  }

  // Worker pool
  let cursor = 0, done = 0, fail = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      const t = tasks[idx];
      const result = await genDay(t.ctx, t.day, t.fn);
      const existing = seqMap.get(t.rowIndex) || { rowIndex: t.rowIndex };
      existing[t.day] = result;
      seqMap.set(t.rowIndex, existing);
      if (result.ok) done++; else fail++;
      process.stdout.write(`\r✓ ${done} ok | ${fail} fail | ${tasks.length-done-fail} left     `);
      if ((done+fail) % 30 === 0) {
        writeFileSync(SEQ_FILE, JSON.stringify(Array.from(seqMap.values()), null, 2));
      }
    }
  }
  await Promise.all(Array.from({length:CONCURRENCY}, worker));

  writeFileSync(SEQ_FILE, JSON.stringify(Array.from(seqMap.values()), null, 2));
  console.log(`\n\n✅ ${done} day-emails generated | ${fail} failed`);
  exportCSV(rows, d0Map, seqMap);
}

main().catch(e=>{ console.error("\nFATAL:", e.message); process.exit(1); });
