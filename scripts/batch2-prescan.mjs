/**
 * BATCH #2 PRE-SCAN — free, ~10s. No API calls.
 * Shows industry mix, Batch #1 overlap, real eligible count.
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const INPUT = process.argv[2];
const BATCH1 = process.env.REACHINBOX_OUTPUT || "./cold-email-reachinbox-PRODUCTION.csv";

if (!INPUT) { console.error("Usage: node scripts/batch2-prescan.mjs <csv>"); process.exit(1); }

function getBestEmail(row) {
  const candidates = [
    [row["Direct Email #1"], row["Direct Email #1 Status"]],
    [row["Direct Email #2"], row["Direct Email #2 Status"]],
    [row["Work Email #1"],   row["Work Email #1 Status"]],
    [row["Work Email #2"],   row["Work Email #2 Status"]],
    [row["Company Email"],   "ok"],
  ];
  const ok = candidates.find(([v,s])=>v && (s==="ok"||s?.startsWith("ok_for_all")||s?.includes("|ok")));
  return (ok||candidates.find(([v])=>v)||[])[0]||"";
}
const NON_REST = [/property\s*management/i, /bar\s*marketing/i, /cleaner\s*solutions/i, /consulting\s*company\b/i];
const isNonRest = co => NON_REST.some(re => re.test(co||""));

const rows = Papa.parse(readFileSync(INPUT, "utf-8"), { header:true, skipEmptyLines:true }).data;
console.log(`Total rows: ${rows.length}`);

// Industry mix
const indCount = {};
for (const r of rows) {
  const ind = (r["Industry"]||"").trim() || "(blank)";
  indCount[ind] = (indCount[ind]||0)+1;
}
console.log(`\nTop 10 industries:`);
Object.entries(indCount).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log(`  ${v.toString().padStart(4)} ${k}`));

// Overlap with Batch #1
let b1Emails = new Set();
try {
  const b1 = Papa.parse(readFileSync(BATCH1,"utf-8"),{header:true,skipEmptyLines:true}).data;
  b1Emails = new Set(b1.map(r=>(r.Email||"").toLowerCase().trim()).filter(Boolean));
  console.log(`\nBatch #1 PRODUCTION emails: ${b1Emails.size}`);
} catch { console.log(`\n(No Batch #1 PRODUCTION found — no exclusion possible)`); }

// Filter
let noEmail=0, nonRest=0, b1Dup=0, sameRunDup=0, eligible=0;
const seen = new Set();
const stateCount = {};
for (const r of rows) {
  const email = getBestEmail(r).toLowerCase().trim();
  const co = r["Company"]||"";
  if (!email) { noEmail++; continue; }
  if (isNonRest(co)) { nonRest++; continue; }
  if (b1Emails.has(email)) { b1Dup++; continue; }
  if (seen.has(email)) { sameRunDup++; continue; }
  seen.add(email);
  eligible++;
  const loc = (r["Location"]||"").split(",").map(s=>s.trim());
  const st = loc[1] || "(unknown)";
  stateCount[st] = (stateCount[st]||0)+1;
}

console.log(`\n📊 Pipeline projection:`);
console.log(`  No email:          ${noEmail}`);
console.log(`  Non-restaurant:    ${nonRest}`);
console.log(`  Batch #1 dup:      ${b1Dup}`);
console.log(`  Same-run dup:      ${sameRunDup}`);
console.log(`  → ELIGIBLE:        ${eligible}`);

console.log(`\nTop 10 states (eligible only):`);
Object.entries(stateCount).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log(`  ${v.toString().padStart(4)} ${k}`));

const usd = (eligible * 4 * 0.0002).toFixed(2); // rough: 4 calls/contact × ~$0.0002/call
console.log(`\n💰 Est OpenAI cost: ~$${usd} (4 emails × $0.0002 × ${eligible})`);
console.log(`⏱  Est runtime: ~${Math.round(eligible/3)} min (Reoon rate limit is the long pole)`);
