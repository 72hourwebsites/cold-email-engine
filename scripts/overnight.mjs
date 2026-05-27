/**
 * OVERNIGHT GENERATOR — Gemma local primary (unlimited)
 * Calls LM Studio directly. No browser, no rate limits.
 * node scripts/overnight.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const CSV        = process.env.INPUT_CSV || "./data/leads.csv";
const PROGRESS   = process.env.OVERNIGHT_PROGRESS || "./scripts/overnight-progress.json";
const EXPORT     = process.env.REACHINBOX_OUTPUT || "./cold-email-reachinbox-FINAL.csv";
const GEMMA_URL  = "http://192.168.4.59:1234/v1/chat/completions";
const GEMMA_MODEL = "google/gemma-4-e4b";

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

  return `Write a personalized cold email for ${fn}, ${job} at ${co} in ${city}, ${state}.

We sell Voice AI that answers restaurant phone calls 24/7 — takes reservations, handles questions, sounds like their staff. Live in 48 hours.

Situation: ${angle}

Subject uses ${fn} and ${co}. Body: specific scene at ${co} in ${city} during busy service + missed call cost + our AI + "Worth 15 minutes this week?" 65-85 words plain text.

Subject: [write here]

[write body here]`;
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

// ─── GEMMA CALL (direct to LM Studio) ──────────────────────────────────────
async function callGemma(prompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(GEMMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer lm-studio" },
        body: JSON.stringify({
          model: GEMMA_MODEL,
          messages: [
            { role: "system", content: "Write a cold email. Output only: Subject: [line]\n\n[body]. Plain text. 65-85 word body. No markdown." },
            { role: "user", content: prompt }
          ],
          max_tokens: 350,
          temperature: 0.72
        }),
        signal: AbortSignal.timeout(120_000) // 2 min timeout
      });
      if (!res.ok) throw new Error(`Gemma ${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (content.length > 20) return content;
      throw new Error("empty response");
    } catch(e) {
      if (attempt < retries - 1) {
        process.stdout.write(` [retry ${attempt+1}]`);
        await sleep(5000 * (attempt + 1));
      } else throw e;
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

  // Load existing progress
  let results = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, "utf-8")) : [];
  // Only keep good emails from previous runs
  results = results.filter(r => r.ok && r.subject && r.body && r.body.length > 30);
  const doneSet = new Set(results.map(r => r.rowIndex));

  const todo = rows.map((row, i) => ({ row, i })).filter(({ i }) => !doneSet.has(i));
  let ok = results.length;
  let fail = 0;

  console.log(`♻️  ${ok} already done, ${todo.length} remaining\n`);

  // Test connection first
  try {
    await callGemma("Say CONNECTED");
    console.log(`✓ Gemma connected at ${GEMMA_URL}\n`);
  } catch (e) {
    console.error(`✗ Gemma not reachable: ${e.message}`);
    console.error(`  Make sure LM Studio is running at 192.168.4.59:1234`);
    process.exit(1);
  }

  for (const { row, i } of todo) {
    const email = getBestEmail(row);
    const prompt = buildPrompt(row);
    let raw = "";

    try {
      raw = await callGemma(prompt);
      if (raw && raw.length > 30) {
        const { subject, body } = parseEmail(raw);
        if (subject && body && body.split(/\s+/).length > 10) {
          results.push({ rowIndex: i, ok: true, email, subject, body });
          ok++;
          process.stdout.write(`\r✓ ${ok}/500 done | ${fail} fail | ${todo.length - (ok - doneSet.size + fail)} left     `);
        } else {
          results.push({ rowIndex: i, ok: false, email, error: "parse fail" });
          fail++;
        }
      } else {
        results.push({ rowIndex: i, ok: false, email, error: "empty response" });
        fail++;
      }
    } catch (e) {
      const msg = e.message || String(e);
      results.push({ rowIndex: i, ok: false, email, error: msg.slice(0, 80) });
      fail++;
      if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
        console.log(`\n⚠️  Gemma timeout — waiting 10s...`);
        await sleep(10_000);
      }
    }

    // Save every 10
    if ((ok + fail) % 10 === 0) {
      writeFileSync(PROGRESS, JSON.stringify(results, null, 2));
    }

    // Small delay between requests (no rate limit but let Gemma breathe)
    await sleep(500);
  }

  writeFileSync(PROGRESS, JSON.stringify(results, null, 2));
  console.log(`\n\n✅ ${ok} good | ${fail} failed`);
  exportCSV(rows, results);
}

main().catch(e => { console.error("\nFATAL:", e.message); process.exit(1); });
