/**
 * OPENAI BATCH GENERATOR — gpt-4o-mini, concurrency=10
 * Reuses overnight-progress.json so we only generate missing rows.
 * node scripts/openai-batch.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const CSV       = process.env.INPUT_CSV || "./data/leads.csv";
const PROGRESS  = process.env.OVERNIGHT_PROGRESS || "./scripts/overnight-progress.json";
const EXPORT    = process.env.REACHINBOX_OUTPUT || "./cold-email-reachinbox-FINAL.csv";
const MODEL     = "gpt-4o-mini";
const CONCURRENCY = 10;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_KEY) { console.error("Missing OPENAI_API_KEY env var"); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── DATA HELPERS ──────────────────────────────────────────────────────────
function getBestEmail(row) {
  const candidates = [
    [row["Direct Email #1"], row["Direct Email #1 Status"]],
    [row["Direct Email #2"], row["Direct Email #2 Status"]],
    [row["Work Email #1"],   row["Work Email #1 Status"]],
    [row["Work Email #2"],   row["Work Email #2 Status"]],
    [row["Company Email"],   "ok"],
  ];
  const ok = candidates.find(([v,s]) => v && (s === "ok" || s?.startsWith("ok_for_all")));
  return (ok || candidates.find(([v]) => v) || [])[0] || "";
}
function parseLocation(loc) {
  const parts = (loc||"").split(",").map(s => s.trim());
  return { city: parts[0]||"", state: parts[1]||"" };
}
function getAngle(job) {
  const t = (job||"").toLowerCase();
  if (t.includes("chef") && t.includes("owner")) return "cooking during service while calls go unanswered";
  if (t.includes("co-owner") || t.includes("co owner")) return "two owners busy while calls ring unanswered";
  if (t.includes("franchise")) return "managing multiple locations while calls go unanswered";
  return "running the restaurant while calls go unanswered";
}
function buildPrompt(row) {
  const fn  = row["First Name"]?.trim() || "";
  const co  = row["Company"]?.trim() || "";
  const job = row["Job Title"]?.trim() || "Owner";
  const { city, state } = parseLocation(row["Location"]);
  const angle = getAngle(job);
  return `Write a cold email for ${fn}, ${job} at ${co} in ${city}, ${state}.

Product: Voice AI that answers restaurant phone calls 24/7 — takes reservations, handles questions, sounds like their staff. Live in 48 hours.

Situation hook: ${angle}

REQUIREMENTS:
- Subject: under 60 chars, includes "${fn}" or "${co}". DO NOT start with: Boost, Elevate, Unlock, Revolutionize, Transform, Unleash, Supercharge, Maximize.
- Body: 70-85 words. Open with a SPECIFIC SCENE at ${co} during a busy moment (NOT the words "Imagine" or "Picture" — describe it directly). Mention the missed-call cost. Introduce the Voice AI in one tight sentence. End with: "Worth 15 minutes this week?"
- NO greeting line ("Hi ${fn},"). NO sign-off. NO bracketed placeholders like [Your Name] or [Company]. Plain text only.

Format exactly:
Subject: <line>

<body>`;
}

function sanitize(subject, body) {
  // strip bracketed placeholders like [Your Name], [Signature], etc.
  body = body.replace(/\[[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  // strip trailing signoffs
  body = body.replace(/\n*(best|thanks|regards|cheers|sincerely)[,!.\s].*$/is, "").trim();
  return { subject: subject.replace(/^["']|["']$/g, "").trim(), body };
}
function parseEmail(raw) {
  const m = raw.match(/^(?:\[?Subject(?:\s+Line)?:?\]?\s*)(.+?)(?:\n|$)/im);
  if (!m) {
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    return { subject: lines[0]||"", body: lines.slice(1).join("\n").trim() };
  }
  const subject = m[1].trim().replace(/^\[|\]$/g, "");
  const body = raw.slice(raw.indexOf(m[0]) + m[0].length).replace(/^\s*\n+/, "").trim();
  return { subject, body };
}

// ─── OPENAI CALL ────────────────────────────────────────────────────────────
async function callOpenAI(prompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "You write personalized cold emails for restaurant owners. Output exactly: Subject: [line]\\n\\n[body]. Plain text. 65-85 word body. No markdown, no signoff." },
            { role: "user", content: prompt }
          ],
          max_tokens: 350,
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(60_000)
      });
      if (res.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(()=>"");
        throw new Error(`OpenAI ${res.status}: ${txt.slice(0,120)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (content.length > 20) return content;
      throw new Error("empty response");
    } catch (e) {
      if (attempt < retries - 1) await sleep(1500 * (attempt + 1));
      else throw e;
    }
  }
}

// ─── EXPORT ─────────────────────────────────────────────────────────────────
function exportCSV(rows, results) {
  const headers = ["Email","First_Name","Last_Name","Company_Name","Linkedin","Subject_Day0","Body_Day0"];
  const lines = results.filter(r => r.ok && r.email).map(r => {
    const row = rows[r.rowIndex] || {};
    return [
      r.email, row["First Name"]||"", row["Last Name"]||"",
      row["Company"]||"", row["Linked Url"]||"", r.subject, r.body
    ].map(v => `"${String(v||"").replace(/"/g,'""')}"`).join(",");
  });
  writeFileSync(EXPORT, "﻿" + [headers.join(","), ...lines].join("\n"), "utf8");
  console.log(`\n📤 Exported ${lines.length} contacts → ${EXPORT}`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📋 Loading CSV...`);
  const { data: rows } = Papa.parse(readFileSync(CSV, "utf-8"), { header: true, skipEmptyLines: true });
  console.log(`✓ ${rows.length} rows`);

  let results = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, "utf-8")) : [];
  results = results.filter(r => r.ok && r.subject && r.body && r.body.length > 30);
  const doneSet = new Set(results.map(r => r.rowIndex));

  const todo = rows.map((row, i) => ({ row, i })).filter(({ i }) => !doneSet.has(i));
  let ok = results.length;
  let fail = 0;
  const startCount = ok;

  console.log(`♻️  ${ok} already done, ${todo.length} remaining`);
  console.log(`🔥 OpenAI ${MODEL}, concurrency=${CONCURRENCY}\n`);

  // Connection test
  try {
    await callOpenAI("Say CONNECTED");
    console.log(`✓ OpenAI reachable\n`);
  } catch (e) {
    console.error(`✗ OpenAI test failed: ${e.message}`);
    process.exit(1);
  }

  // Worker pool
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const idx = cursor++;
      const { row, i } = todo[idx];
      const email = getBestEmail(row);
      try {
        const raw = await callOpenAI(buildPrompt(row));
        let { subject, body } = parseEmail(raw);
        ({ subject, body } = sanitize(subject, body));
        if (subject && body && body.split(/\s+/).length >= 50) {
          results.push({ rowIndex: i, ok: true, email, subject, body });
          ok++;
        } else {
          results.push({ rowIndex: i, ok: false, email, error: "parse fail" });
          fail++;
        }
      } catch (e) {
        results.push({ rowIndex: i, ok: false, email, error: (e.message||"").slice(0,80) });
        fail++;
      }
      process.stdout.write(`\r✓ ${ok}/${rows.length} done | ${fail} fail | ${todo.length - (ok - startCount + fail)} left     `);
      if ((ok + fail) % 20 === 0) writeFileSync(PROGRESS, JSON.stringify(results, null, 2));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(PROGRESS, JSON.stringify(results, null, 2));
  console.log(`\n\n✅ ${ok} good | ${fail} failed`);
  exportCSV(rows, results);
}

main().catch(e => { console.error("\nFATAL:", e.message); process.exit(1); });
