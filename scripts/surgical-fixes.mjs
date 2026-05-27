/**
 * SURGICAL FIXES — regenerate 7 specific email entries that failed QA:
 *   - 4 truncated bodies (max_tokens hit)
 *   - 1 truncated body + missing CTA
 *   - 1 banned-word subject
 *   - 1 body with banned "Imagine" + "guaranteed"
 */

import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const CSV = process.env.INPUT_CSV || "./data/leads.csv";
const D0_FILE = process.env.OVERNIGHT_PROGRESS || "./scripts/overnight-progress.json";
const SEQ_FILE = process.env.SEQ_PROGRESS || "./scripts/sequence-progress.json";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const FIXES = [
  { rowIndex: 338, day: "day0", reason: "banned word 'boost' in subject" },
  { rowIndex: 342, day: "day0", reason: "truncated body, missing CTA" },
  { rowIndex: 394, day: "day3", reason: "body uses 'Imagine' + 'guaranteed'" },
  { rowIndex: 53,  day: "day3", reason: "truncated body" },
  { rowIndex: 151, day: "day7", reason: "truncated body" },
  { rowIndex: 409, day: "day3", reason: "truncated body" },
  { rowIndex: 409, day: "day7", reason: "truncated body" },
];

const rows = Papa.parse(readFileSync(CSV,"utf-8"),{header:true,skipEmptyLines:true}).data;
const d0Raw = JSON.parse(readFileSync(D0_FILE,"utf-8"));
const seqRaw = JSON.parse(readFileSync(SEQ_FILE,"utf-8"));

function parseLocation(loc){const p=(loc||"").split(",").map(s=>s.trim());return{city:p[0]||"",state:p[1]||""}}
function getAngle(j){const t=(j||"").toLowerCase();if(t.includes("chef")&&t.includes("owner"))return"cooking during service while calls go unanswered";if(t.includes("co-owner"))return"two owners busy while calls ring unanswered";if(t.includes("franchise"))return"managing multiple locations while calls go unanswered";return"running the restaurant while calls go unanswered"}

function buildPromptD0(row){
  const fn=row["First Name"]?.trim()||"",co=row["Company"]?.trim()||"",job=row["Job Title"]?.trim()||"Owner";
  const {city,state}=parseLocation(row["Location"]);
  return `Write a cold email for ${fn}, ${job} at ${co} in ${city}, ${state}.
Product: Voice AI answering restaurant calls 24/7, takes reservations, sounds like staff, live in 48 hours.
Situation: ${getAngle(job)}.
REQUIREMENTS:
- Subject under 60 chars, includes "${fn}" or "${co}". DO NOT start with: Boost, Elevate, Unlock, Revolutionize, Transform, Unleash, Supercharge, Maximize, Imagine. Use a non-promotional, scene-grounded subject.
- Body 70-85 words. Open with a SPECIFIC SCENE at ${co} (not "Imagine"). Mention missed-call cost. Voice AI in one sentence. END with: "Worth 15 minutes this week?"
- No greeting. No sign-off. No brackets. No "free", "guarantee", "boost". Plain text.
Format: Subject: <line>\n\n<body>`;
}
function buildPromptD3(row,d0Subj){
  const fn=row["First Name"]?.trim()||"",co=row["Company"]?.trim()||"",job=row["Job Title"]?.trim()||"Owner";
  const {city,state}=parseLocation(row["Location"]);
  return `Day 3 of 4-step sequence to ${fn} (${job} at ${co} in ${city}). Day 0 subject was: "${d0Subj}".
Now write Day 3 — DIFFERENT angle: SPECIFIC PROOF/OUTCOME.
Product: Voice AI 24/7 restaurant phones, 48hr live.
REQUIREMENTS:
- Subject 35-55 chars. Mentions outcome/number. DO NOT start with Boost/Elevate/Unlock/Imagine.
- Body 55-75 words. Open with specific outcome from a comparable restaurant. Bridge to ${co}. END with: "Want a 5-minute walkthrough this week?"
- No greeting. No sign-off. No brackets. No "Imagine". No "free". No "guarantee".
Format: Subject: <line>\n\n<body>`;
}
function buildPromptD7(row){
  const fn=row["First Name"]?.trim()||"",co=row["Company"]?.trim()||"",job=row["Job Title"]?.trim()||"Owner";
  const {city,state}=parseLocation(row["Location"]);
  return `Day 7 of 4-step sequence to ${fn} (${job} at ${co} in ${city}). PATTERN INTERRUPT.
Product: Voice AI 24/7 restaurant phones.
REQUIREMENTS:
- Subject = a QUESTION under 40 chars (e.g. "Quick question, ${fn}?").
- Body 30-50 words. ONE data point about ${city} or restaurant calls + ONE question. END with: "Worth a 10-min look this week?"
- No greeting. No sign-off. No brackets. No "Imagine".
Format: Subject: <line>\n\n<body>`;
}

async function callOpenAI(prompt){
  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${OPENAI_KEY}`},
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[
        {role:"system",content:"Output exactly: Subject: <line>\\n\\n<body>. Plain text. No markdown, no signoff, no greeting. ALWAYS end with the required CTA. Always finish your sentences."},
        {role:"user",content:prompt}
      ],
      max_tokens:500, temperature:0.7
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
function parseEmail(raw){
  const m=raw.match(/^(?:\[?Subject(?:\s+Line)?:?\]?\s*)(.+?)(?:\n|$)/im);
  if(!m){const l=raw.split("\n").map(s=>s.trim()).filter(Boolean);return{subject:l[0]||"",body:l.slice(1).join("\n").trim()}}
  return{subject:m[1].trim().replace(/^\[|\]$/g,""),body:raw.slice(raw.indexOf(m[0])+m[0].length).replace(/^\s*\n+/,"").trim()};
}
function sanitize(s,b){
  b=b.replace(/\[[^\]]+\]/g,"").replace(/\n{3,}/g,"\n\n").trim();
  b=b.replace(/\n*(best|thanks|regards|cheers|sincerely)[,!.\s].*$/is,"").trim();
  return{subject:s.replace(/^["']|["']$/g,"").trim(),body:b};
}

const d0Map = new Map(d0Raw.map((x,i)=>[x.rowIndex,i]));
const seqMap = new Map(seqRaw.map((x,i)=>[x.rowIndex,i]));

console.log(`Fixing ${FIXES.length} entries...\n`);
for(const fix of FIXES){
  const row = rows[fix.rowIndex];
  console.log(`Row ${fix.rowIndex} ${fix.day} — ${fix.reason}`);
  let prompt;
  if(fix.day==="day0") prompt = buildPromptD0(row);
  else if(fix.day==="day3"){
    const d0Idx = d0Map.get(fix.rowIndex);
    const d0Subj = d0Idx!==undefined ? d0Raw[d0Idx].subject : "";
    prompt = buildPromptD3(row, d0Subj);
  }
  else if(fix.day==="day7") prompt = buildPromptD7(row);

  let attempts=0, parsed=null;
  while(attempts<3){
    try{
      const raw = await callOpenAI(prompt);
      let {subject,body} = parseEmail(raw);
      ({subject,body} = sanitize(subject,body));
      // verify quality
      const wc = body.split(/\s+/).length;
      const banned=/^(boost|elevate|unlock|revolutionize|transform|unleash|supercharge|maximize|imagine)/i;
      const minWc = fix.day==="day7" ? 25 : 50;
      const hasCta = /worth|minutes|reply|later|walkthrough|look/i.test(body);
      const ok = subject && body && wc>=minWc && !banned.test(subject) && hasCta && /[.!?]$/.test(body.trim());
      if(ok){
        parsed = {subject, body, wc};
        break;
      }
      attempts++;
      console.log(`  retry (wc=${wc}, ban=${banned.test(subject)}, cta=${hasCta})`);
    } catch(e){
      attempts++;
      console.log(`  err: ${e.message}`);
    }
  }
  if(!parsed){ console.log(`  ⚠️ FAILED after 3 attempts — keeping original`); continue; }
  console.log(`  ✓ new subject: ${parsed.subject}`);
  console.log(`  ✓ body wc: ${parsed.wc}`);

  // Persist
  if(fix.day==="day0"){
    const idx = d0Map.get(fix.rowIndex);
    d0Raw[idx].subject = parsed.subject;
    d0Raw[idx].body = parsed.body;
  } else {
    const idx = seqMap.get(fix.rowIndex);
    seqRaw[idx][fix.day] = { ok:true, subject:parsed.subject, body:parsed.body };
  }
}

writeFileSync(D0_FILE, JSON.stringify(d0Raw, null, 2));
writeFileSync(SEQ_FILE, JSON.stringify(seqRaw, null, 2));
console.log("\n✅ Surgical fixes saved. Re-run finalize-csv.mjs to rebuild SAFE CSV.");
