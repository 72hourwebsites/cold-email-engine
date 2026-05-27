import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PROD = "C:/Users/aml25/Downloads/cold-email-reachinbox-PRODUCTION.csv";
const D0_FILE = "C:/Users/aml25/Downloads/cold-email-app/scripts/overnight-progress.json";

async function gen() {
  const prompt = `Write a cold email for Matt, Owner at Corner Pub Of Chinatown in Canton, Massachusetts.
Product: Voice AI answering restaurant calls 24/7, takes reservations, sounds like staff, live in 48 hours.
REQUIREMENTS:
- Subject under 60 chars, includes "Matt" or "Corner Pub". DO NOT start with: Boost, Elevate, Unlock, Imagine.
- Body 65-80 words. Open with a SPECIFIC SCENE at Corner Pub during a busy moment. Missed-call cost. Voice AI in one sentence. END with exactly: "Worth 15 minutes this week?"
- No greeting. No sign-off. No brackets. Plain text. Always finish sentences.
Format: Subject: <line>\n\n<body>`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        { role: "system", content: "Output: Subject: <line>\\n\\n<body ending with required CTA>." },
        { role: "user", content: prompt }
      ]
    })
  });
  return (await res.json()).choices?.[0]?.message?.content || "";
}

let parsed;
for (let i = 0; i < 4 && !parsed; i++) {
  const raw = await gen();
  const m = raw.match(/Subject:?\s*(.+?)\n+([\s\S]+)/i);
  if (!m) continue;
  let subject = m[1].trim().replace(/^\[|\]$/g, "");
  let body = m[2].replace(/\[[^\]]+\]/g, "").replace(/\n*(best|thanks|regards)[,!].*$/is, "").trim();
  // normalize typography
  body = body.replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"').replace(/[–—―]/g, "-").trim();
  subject = subject.replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"').replace(/[–—―]/g, "-").trim();
  const wc = body.split(/\s+/).length;
  const hasCta = /worth 15 minutes this week/i.test(body);
  if (wc >= 55 && wc <= 95 && hasCta && /[.!?]$/.test(body)) {
    parsed = { subject, body, wc };
  } else {
    console.log(`  attempt ${i+1}: wc=${wc} cta=${hasCta}`);
  }
}
if (!parsed) { console.error("Failed"); process.exit(1); }
console.log(`✓ New Subject: ${parsed.subject}`);
console.log(`✓ Body wc: ${parsed.wc}`);
console.log(`Body: ${parsed.body}`);

// Update Day 0 progress
const d0 = JSON.parse(readFileSync(D0_FILE, "utf8"));
const d0Idx = d0.findIndex(x => x.rowIndex === 225);
d0[d0Idx].subject = parsed.subject;
d0[d0Idx].body = parsed.body;
writeFileSync(D0_FILE, JSON.stringify(d0, null, 2));

// Update PRODUCTION.csv in place
const rows = Papa.parse(readFileSync(PROD, "utf-8"), { header: true, skipEmptyLines: true }).data;
const target = rows.find(r => r.Email === "mchin@wellesleyma.gov");
target.Subject_Day0 = parsed.subject;
target.Body_Day0 = parsed.body;

const headers = Object.keys(rows[0]);
const lines = rows.map(r => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","));
writeFileSync(PROD, "﻿" + [headers.join(","), ...lines].join("\n"), "utf8");
console.log("\n✅ PRODUCTION.csv updated.");
