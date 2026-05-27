/**
 * Batch email generator — runs server-side, no browser needed.
 * Reads the LeadRocks CSV, calls /api/generate for each row, saves to JSON + CSV.
 *
 * Usage: node scripts/batch-generate.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Papa = require("papaparse");

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CSV_PATH = "C:/Users/aml25/Downloads/leadrocks_owner_restaurants_51926_2026_05_20.csv";
const OUTPUT_JSON = "C:/Users/aml25/Downloads/cold-email-app/scripts/generated-emails.json";
const OUTPUT_CSV  = "C:/Users/aml25/Downloads/cold-email-reachinbox-final.csv";
const API_URL = "http://localhost:3001/api/generate";
const CONCURRENCY = 3;  // Claude Haiku handles 3 parallel fine

const CONFIG = {
  model: "claude-haiku-4-5",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  temperature: 0.72,
  maxTokens: 400,
};

const SYSTEM_PROMPT = `You are a cold email writer. Output ONLY the email.

FORMAT:
Subject: [4-8 words, specific to this person/business]

[email body]

RULES:
1. Body: exactly 75-100 words. Count. Plain text only.
2. Open with first name directly — no Hi/Hello/Hey/Hope/I wanted/I noticed
3. VARY the opener — do NOT always use "you built this business". Use one of:
   - Reference their city: "[City]'s restaurant scene is competitive..."
   - Reference their role: "Running [Company] as [Chef/Co-Owner] means..."
   - Reference timing: "On a Friday night at [Company]..."
   - Reference specific angle from the prompt
4. End with exactly: Worth 15 minutes this week?
5. BANNED: seamless, leverage, empower, pain points, synergy, game-changing`;

// ── EMAIL STATUS ──────────────────────────────────────────────────────────────
function getBestEmail(row) {
  const candidates = [
    { val: row["Direct Email #1"], status: row["Direct Email #1 Status"] },
    { val: row["Direct Email #2"], status: row["Direct Email #2 Status"] },
    { val: row["Work Email #1"],   status: row["Work Email #1 Status"] },
    { val: row["Work Email #2"],   status: row["Work Email #2 Status"] },
    { val: row["Company Email"],   status: "ok" },
  ];
  const ok = candidates.find(c => c.val && (c.status === "ok" || c.status?.startsWith("ok_for_all")));
  return ok?.val || candidates.find(c => c.val)?.val || "";
}

// ── JOB TITLE ANGLE ───────────────────────────────────────────────────────────
function getAngle(jobTitle) {
  const t = (jobTitle || "").toLowerCase();
  if (t.includes("chef") && t.includes("owner"))
    return { cat: "chef-owner", hook: "cooking during service while calls go unanswered" };
  if (t.includes("co-owner") || t.includes("co owner"))
    return { cat: "co-owner", hook: "two owners means twice the responsibility — missed calls still fall through" };
  if (t.includes("franchise"))
    return { cat: "franchise", hook: "multiple locations means missed calls multiply" };
  return { cat: "owner", hook: "running the whole operation means the phone is always last priority" };
}

// ── LOCATION PARSE ────────────────────────────────────────────────────────────
function parseLocation(loc) {
  const parts = (loc || "").split(",").map(s => s.trim());
  return { city: parts[0] || "", state: parts[1] || "" };
}

// ── BUILD PROMPT ──────────────────────────────────────────────────────────────
function buildPrompt(row) {
  const firstName = row["First Name"]?.trim() || "";
  const company = row["Company"]?.trim() || "";
  const jobTitle = row["Job Title"]?.trim() || "Owner";
  const { city, state } = parseLocation(row["Location"]);
  const { cat, hook } = getAngle(jobTitle);
  const website = row["Company Website"]?.trim() || "";

  // Vary the opener style based on row index to avoid repetition
  const openerStyles = [
    `When ${firstName} is ${hook} at ${company}`,
    `${city}'s restaurant scene doesn't wait — and neither do customers calling ${company}`,
    `Running ${company} as ${jobTitle} means ${hook}`,
    `On a busy night at ${company} in ${city}`,
    `Every call that hits voicemail at ${company}`,
  ];
  const openerHint = openerStyles[Math.floor(Math.random() * openerStyles.length)];

  return `Write a cold email selling Voice AI phone answering.

Contact: ${firstName}, ${jobTitle} @ ${company}, ${city}, ${state}
Angle: ${cat} — ${hook}
Opener hint (use this style, don't copy exactly): "${openerHint}"
${website ? `Website: ${website}` : ""}

Subject must reference: ${firstName}'s name OR ${company} name specifically — not generic
Body opener must be DIFFERENT from "you built this business from the ground up"

Output ONLY:
Subject: [subject]

[body 75-100 words ending with: Worth 15 minutes this week?]`;
}

// ── GENERATE ONE EMAIL ────────────────────────────────────────────────────────
async function generateEmail(row, retries = 3) {
  const prompt = buildPrompt(row);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, systemPrompt: SYSTEM_PROMPT, config: CONFIG }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.subject || data.body?.split(/\s+/).length < 15) {
        throw new Error("empty or too short");
      }
      return { subject: data.subject, body: data.body, ok: true };
    } catch (err) {
      if (attempt === retries - 1) return { subject: "", body: "", ok: false, error: err.message };
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!CONFIG.anthropicApiKey) {
    console.error("❌ Set ANTHROPIC_API_KEY environment variable first");
    process.exit(1);
  }

  // Load CSV
  const csvText = readFileSync(CSV_PATH, "utf-8");
  const { data: rows } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  console.log(`📋 Loaded ${rows.length} rows from LeadRocks CSV`);

  // Load existing results if resuming
  let results = [];
  if (existsSync(OUTPUT_JSON)) {
    results = JSON.parse(readFileSync(OUTPUT_JSON, "utf-8"));
    console.log(`♻️  Resuming — ${results.filter(r => r.ok).length} already done`);
  }

  const doneSet = new Set(results.filter(r => r.ok).map(r => r.rowIndex));
  const todo = rows
    .map((row, i) => ({ row, i }))
    .filter(({ i }) => !doneSet.has(i));

  console.log(`📧 Generating ${todo.length} emails with Claude Haiku (concurrency ${CONCURRENCY})...`);

  let done = results.filter(r => r.ok).length;
  let failed = results.filter(r => !r.ok).length;
  const total = rows.length;

  // Process in parallel batches
  const queue = [...todo];

  async function worker() {
    while (queue.length > 0) {
      const { row, i } = queue.shift();
      const result = await generateEmail(row);
      const entry = { rowIndex: i, ...result, email: getBestEmail(row), firstName: row["First Name"], company: row["Company"] };
      results.push(entry);

      if (result.ok) {
        done++;
        process.stdout.write(`\r✓ ${done}/${total} done | ${failed} failed | ${queue.length} left    `);
      } else {
        failed++;
        process.stdout.write(`\r✓ ${done}/${total} done | ${failed} failed | ${queue.length} left    `);
      }

      // Save progress every 10
      if ((done + failed) % 10 === 0) {
        writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, worker);
  await Promise.all(workers);

  // Final save
  writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
  console.log(`\n\n✅ Complete: ${done} good | ${failed} failed`);

  // Export ReachInbox CSV
  const headers = ["Email","First_Name","Last_Name","Company_Name","Linkedin","Subject_Day0","Body_Day0"];
  const csvRows = results
    .filter(r => r.ok && r.email)
    .map(r => {
      const row = rows[r.rowIndex];
      const vals = [
        r.email,
        row["First Name"] || "",
        row["Last Name"] || "",
        row["Company"] || "",
        row["Linked Url"] || "",
        r.subject,
        r.body,
      ].map(v => `"${String(v || "").replace(/"/g, '""')}"`);
      return vals.join(",");
    });

  const csvOut = [headers.join(","), ...csvRows].join("\n");
  writeFileSync(OUTPUT_CSV, "﻿" + csvOut, "utf-8");
  console.log(`📤 ReachInbox CSV saved: ${OUTPUT_CSV}`);
  console.log(`📊 ${csvRows.length} contacts with verified emails ready to import`);
}

main().catch(console.error);
