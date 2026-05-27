/**
 * FINALIZE CSV — adds ReachInbox spintax to clustered subject patterns
 * + verifies each email via Reoon API
 * + outputs cleaned CSV with verification status
 *
 * node scripts/finalize-csv.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const CSV       = "C:/Users/aml25/Downloads/leadrocks_owner_restaurants_51926_2026_05_20.csv";
const D0_FILE   = "C:/Users/aml25/Downloads/cold-email-app/scripts/overnight-progress.json";
const SEQ_FILE  = "C:/Users/aml25/Downloads/cold-email-app/scripts/sequence-progress.json";
const VERIFY_CACHE = "C:/Users/aml25/Downloads/cold-email-app/scripts/reoon-cache.json";
const OUT_ALL   = "C:/Users/aml25/Downloads/cold-email-reachinbox-FINAL-ALL.csv";
const OUT_SAFE  = "C:/Users/aml25/Downloads/cold-email-reachinbox-FINAL-SAFE.csv";
const OUT_REJECT= "C:/Users/aml25/Downloads/cold-email-reachinbox-REJECTED.csv";

const REOON_KEY = "6hRql21Je1j0MoArXbChCEl9mgUZAbAW";
const REOON_MODE = "quick"; // quick = ~1s, power = ~10s. quick is fine for batch.
const VERIFY_CONCURRENCY = 1;
const VERIFY_DELAY_MS = 1300; // Reoon single-call rate limit

const sleep = ms => new Promise(r => setTimeout(r, ms));
const existsSync = (p) => { try { readFileSync(p); return true; } catch { return false; } };

// ─── SPINTAX POOLS (ReachInbox-compatible {a|b|c}) ─────────────────────────
// Applied as PREFIX wrappers — actual personalized content follows.

// Day 0 — already personalized enough; light prefix spin to fight clustering
const DAY0_PREFIX = [
  "", "", "", // most stay clean
];

// Day 3 — outcome subject usually starts with a number ("14 reservations recovered…")
// Wrap the trailing descriptor with spintax so similar number-led subjects diverge
const DAY3_OUTCOME_TAIL = "{recovered last weekend|saved in one weekend|captured in 48 hours|won back this month|that would've gone to voicemail}";

// Day 7 — question format
const DAY7_OPENERS = ["Quick question", "One thing", "Curious", "Wondering", "Ever wondered", "Fast take"];

// Day 14 — break-up
const DAY14_OPENERS = ["Closing the loop", "Stepping back", "Last note", "Wrapping up", "Final thought"];

// ─── SPIN HELPERS ──────────────────────────────────────────────────────────
function spinSubject(subject, day, firstName) {
  // Day 14: standardize "Closing the loop, FN" → "{Closing the loop|Stepping back|Last note|Wrapping up|Final thought}, FN"
  if (day === "day14") {
    const m = subject.match(/^(closing the loop|stepping back|last note|wrapping up|final thought)[,\s]*(.*)$/i);
    if (m) {
      const tail = m[2] || (firstName ? `, ${firstName}` : "");
      return `{${DAY14_OPENERS.join("|")}}${tail.startsWith(",")?tail:", "+tail}`.replace(/,\s*,/g,",").trim();
    }
  }

  // Day 7: detect "Did you know..." / "Ever..." opener and spin
  if (day === "day7") {
    if (/^(did you know|ever thought|ever wondered|quick question|one thing|curious|wondering)/i.test(subject)) {
      const rest = subject.replace(/^(did you know|ever thought|ever wondered|quick question|one thing|curious|wondering)[,?\s:]+/i, "");
      return `{${DAY7_OPENERS.join("|")}}${rest ? " — " + rest : ""}`.trim().replace(/—\s*$/,"");
    }
  }

  // Day 3: outcome-tail spinning when subject mentions "recovered" / "saved" / "lost"
  if (day === "day3") {
    if (/\b(recovered|saved|lost|missed)\b.{0,40}(last weekend|this week|in.*weekend|in 48 hours|this month)\b/i.test(subject)) {
      const head = subject.split(/\b(recovered|saved|lost|missed|won)\b/i)[0].trim();
      // remove trailing word like "reservations" if present, then attach spin tail
      const nounMatch = head.match(/^(.+?\b(?:reservations?|bookings?|calls?|guests?))\b/i);
      if (nounMatch) {
        return `${nounMatch[1]} ${DAY3_OUTCOME_TAIL}`.trim();
      }
    }
  }

  return subject;
}

// ─── REOON VERIFY ──────────────────────────────────────────────────────────
async function verifyEmail(email) {
  const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${REOON_KEY}&mode=${REOON_MODE}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { status:"api_error", code:res.status };
    const data = await res.json();
    // Reoon returns: status (safe / valid / invalid / risky / unknown / disposable / role_account / etc.)
    return {
      status: data.status || "unknown",
      is_safe: data.status === "safe" || data.status === "valid",
      is_role: !!data.is_role_account,
      is_disposable: !!data.is_disposable,
      is_catchall: !!data.is_catch_all,
      raw: data
    };
  } catch (e) {
    return { status:"error", error:(e.message||"").slice(0,80) };
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("📋 Loading data...");
  const rows = Papa.parse(readFileSync(CSV,"utf-8"), { header:true, skipEmptyLines:true }).data;
  const d0Raw = JSON.parse(readFileSync(D0_FILE,"utf-8"));
  const d0Map = new Map(d0Raw.filter(x=>x.ok).map(x=>[x.rowIndex, x]));
  const seqRaw = JSON.parse(readFileSync(SEQ_FILE,"utf-8"));
  const seqMap = new Map(seqRaw.map(x=>[x.rowIndex, x]));
  console.log(`✓ ${d0Map.size} Day 0 / ${seqMap.size} sequence rows`);

  // Build the contact list
  const contacts = [];
  for (const [rowIndex, d0] of d0Map.entries()) {
    if (!d0.email) continue;
    const row = rows[rowIndex];
    const seq = seqMap.get(rowIndex) || {};
    const fn = row["First Name"]?.trim() || "";
    contacts.push({
      rowIndex,
      email: d0.email.toLowerCase().trim(),
      first_name: fn,
      last_name: row["Last Name"]||"",
      company: row["Company"]||"",
      linkedin: row["Linked Url"]||"",
      day0: { subject: spinSubject(d0.subject, "day0", fn), body: d0.body },
      day3: seq.day3?.ok ? { subject: spinSubject(seq.day3.subject, "day3", fn), body: seq.day3.body } : null,
      day7: seq.day7?.ok ? { subject: spinSubject(seq.day7.subject, "day7", fn), body: seq.day7.body } : null,
      day14: seq.day14?.ok ? { subject: spinSubject(seq.day14.subject, "day14", fn), body: seq.day14.body } : null,
    });
  }
  console.log(`✓ ${contacts.length} contacts prepared with spintax`);

  // ─── VERIFY EMAILS ──────────────────────────────────────────────────────
  let cache = existsSync(VERIFY_CACHE) ? JSON.parse(readFileSync(VERIFY_CACHE,"utf-8")) : {};
  const toVerify = contacts.filter(c => !cache[c.email]);
  console.log(`\n🔍 Reoon verification: ${toVerify.length} new / ${contacts.length - toVerify.length} cached`);

  if (toVerify.length > 0) {
    let cursor = 0, done = 0;
    async function worker() {
      while (cursor < toVerify.length) {
        const idx = cursor++;
        const c = toVerify[idx];
        // Retry on rate limit
        let attempts = 0;
        while (attempts < 4) {
          const result = await verifyEmail(c.email);
          if (result.status === "api_error" && result.code === 429) {
            attempts++;
            await sleep(15_000 * attempts); // back off hard
            continue;
          }
          cache[c.email] = result;
          break;
        }
        if (!cache[c.email]) cache[c.email] = { status: "api_error", code: 429 };
        done++;
        if (done % 5 === 0) {
          writeFileSync(VERIFY_CACHE, JSON.stringify(cache, null, 2));
          process.stdout.write(`\r  verified ${done}/${toVerify.length}     `);
        }
        await sleep(VERIFY_DELAY_MS);
      }
    }
    await Promise.all(Array.from({length:VERIFY_CONCURRENCY}, worker));
    writeFileSync(VERIFY_CACHE, JSON.stringify(cache, null, 2));
    console.log(`\r  verified ${done}/${toVerify.length} ✓                `);
  }

  // ─── BUCKET CONTACTS ─────────────────────────────────────────────────────
  const safe = [], risky = [], rejected = [];
  const buckets = {};
  for (const c of contacts) {
    const v = cache[c.email] || { status:"unknown" };
    c.verify_status = v.status;
    c.is_role = !!v.is_role;
    c.is_disposable = !!v.is_disposable;
    c.is_catchall = !!v.is_catchall;
    buckets[v.status] = (buckets[v.status]||0)+1;

    if (v.is_disposable) rejected.push(c);
    else if (v.status === "safe" || v.status === "valid") safe.push(c);
    else if (v.status === "risky" || v.is_catchall || v.is_role || v.status === "unknown") risky.push(c);
    else rejected.push(c);
  }

  console.log(`\n📊 Verification breakdown:`);
  Object.entries(buckets).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${k}: ${v}`));
  console.log(`\n🟢 Safe (ship now):   ${safe.length}`);
  console.log(`🟡 Risky (segment):   ${risky.length}`);
  console.log(`🔴 Rejected:          ${rejected.length}`);

  // ─── EXPORT ──────────────────────────────────────────────────────────────
  function toCsv(list) {
    const headers = ["Email","First_Name","Last_Name","Company_Name","Linkedin",
                     "Verify_Status","Is_Role","Is_Catchall",
                     "Subject_Day0","Body_Day0",
                     "Subject_Day3","Body_Day3",
                     "Subject_Day7","Body_Day7",
                     "Subject_Day14","Body_Day14"];
    const lines = list.map(c => [
      c.email, c.first_name, c.last_name, c.company, c.linkedin,
      c.verify_status, c.is_role?"yes":"no", c.is_catchall?"yes":"no",
      c.day0?.subject||"", c.day0?.body||"",
      c.day3?.subject||"", c.day3?.body||"",
      c.day7?.subject||"", c.day7?.body||"",
      c.day14?.subject||"", c.day14?.body||"",
    ].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(","));
    return "﻿" + [headers.join(","), ...lines].join("\n");
  }
  writeFileSync(OUT_ALL,    toCsv([...safe, ...risky, ...rejected]), "utf8");
  writeFileSync(OUT_SAFE,   toCsv(safe), "utf8");
  writeFileSync(OUT_REJECT, toCsv(rejected), "utf8");

  console.log(`\n📤 Exports:`);
  console.log(`  ALL:      ${OUT_ALL}`);
  console.log(`  SAFE:     ${OUT_SAFE}    ← upload this to ReachInbox`);
  console.log(`  REJECTED: ${OUT_REJECT}`);
}

main().catch(e=>{ console.error("FATAL:", e.message); process.exit(1); });
