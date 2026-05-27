/**
 * FINAL CLEAN — drop non-restaurant rows, kill all remaining curly chars,
 * rebuild SAFE.csv ready for ReachInbox import.
 */
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const SAFE_IN  = process.env.FINAL_SAFE_OUTPUT || "./cold-email-reachinbox-FINAL-SAFE.csv";
const SAFE_OUT = process.env.REACHINBOX_OUTPUT || "./cold-email-reachinbox-PRODUCTION.csv";
const DROPPED  = process.env.DROPPED_OUTPUT || "./cold-email-reachinbox-DROPPED.csv";

// All Unicode smart-typography → ASCII
function normalize(s){
  return (s||"")
    .replace(/[‘’‚‛′]/g, "'")     // left/right single, low-9, reversed, prime
    .replace(/[“”„‟″]/g, '"')     // left/right double, low-9, reversed
    .replace(/[–—―]/g, "-")                  // en/em/horizontal bar
    .replace(/[…]/g, "...")                            // ellipsis
    .replace(/[  ​]/g, " ")                  // non-breaking spaces
    .replace(/[´`]/g, "'")                             // acute / backtick
    .replace(/\s+/g, " ")
    .trim();
}

const NON_RESTAURANT_PATTERNS = [
  /property\s*management/i,
  /bar\s*marketing\s*basics/i,
  /cleaner\s*solutions/i,
  /consulting\s*company\b/i,
  /\bllc\s*$/i, // catch generic LLCs that aren't restaurants
];
function isNonRestaurant(co){
  return NON_RESTAURANT_PATTERNS.slice(0,4).some(re => re.test(co||""));
}

const rows = Papa.parse(readFileSync(SAFE_IN,"utf-8"),{header:true,skipEmptyLines:true}).data;
console.log(`Loaded ${rows.length} SAFE rows`);

const keep = [];
const drop = [];

for (const r of rows){
  if (isNonRestaurant(r.Company_Name)){
    drop.push(r);
    continue;
  }
  // Normalize every text field
  ["Subject_Day0","Body_Day0","Subject_Day3","Body_Day3","Subject_Day7","Body_Day7","Subject_Day14","Body_Day14"].forEach(k=>{
    r[k] = normalize(r[k]);
  });
  keep.push(r);
}

function toCsv(list){
  const headers = Object.keys(list[0] || rows[0]);
  const lines = list.map(r => headers.map(h => `"${String(r[h]||"").replace(/"/g,'""')}"`).join(","));
  return "﻿" + [headers.join(","), ...lines].join("\n");
}
writeFileSync(SAFE_OUT, toCsv(keep), "utf8");
writeFileSync(DROPPED, toCsv(drop), "utf8");

// Validation pass
let stillCurly=0, stillTrunc=0;
for (const r of keep){
  if (/[‘’“”–—]/.test(r.Body_Day0+r.Body_Day3+r.Body_Day7+r.Body_Day14)) stillCurly++;
  if (!/[.!?]$/.test((r.Body_Day0||"").trim())) stillTrunc++;
}
console.log(`\n✓ PRODUCTION CSV: ${keep.length} contacts`);
console.log(`✓ DROPPED (non-restaurant): ${drop.length}`);
console.log(`✓ Curly chars remaining: ${stillCurly}`);
console.log(`✓ Day 0 bodies missing terminal punct: ${stillTrunc}`);
console.log(`\n📤 ${SAFE_OUT}`);
console.log(`📤 ${DROPPED}`);
