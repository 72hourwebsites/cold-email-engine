import { readFileSync, writeFileSync } from "fs";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function gen(fn,co,city){
  const prompt = `Day 3 cold email follow-up. Recipient: ${fn} at ${co} in ${city}.
Product: Voice AI for restaurant phones, 24/7, takes reservations, sounds like staff, 48hr launch.
Write EXACTLY this structure:
Line 1: Subject (35-55 chars, includes a specific number)
Line 2: blank
Line 3+: Body of 55-70 words.
- Open: "Last weekend, a 40-seat restaurant in [comparable city] recovered 14 reservations they would've lost to voicemail."
- Middle: One sentence connecting that outcome to ${co}.
- Close: end with EXACTLY this sentence as the final sentence: "Want a 5-minute walkthrough this week?"
No brackets remaining. No greeting. No sign-off.`;
  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${OPENAI_KEY}`},
    body:JSON.stringify({model:"gpt-4o-mini",max_tokens:500,temperature:0.6,messages:[
      {role:"system",content:"Output exactly: Subject: <line>\\n\\n<body ending with the required closing sentence>."},
      {role:"user",content:prompt}
    ]})
  });
  return (await res.json()).choices?.[0]?.message?.content || "";
}

const seq = JSON.parse(readFileSync(process.env.SEQ_PROGRESS || "./scripts/sequence-progress.json","utf8"));
const seqMap = new Map(seq.map((x,i)=>[x.rowIndex,i]));

const targets = [
  {rowIndex:53, fn:"Pat", co:"Best Pizza", city:"Vancouver"},
  {rowIndex:409, fn:"Gene", co:"Lonnies Best Taste Of Chicago", city:"Cincinnati"}
];

for(const t of targets){
  let saved=false;
  for(let attempt=0; attempt<5 && !saved; attempt++){
    const raw = await gen(t.fn, t.co, t.city);
    const m = raw.match(/Subject:?\s*(.+?)\n+([\s\S]+)/i);
    if(!m) continue;
    const subject = m[1].trim().replace(/^\[|\]$/g,"");
    let body = m[2].replace(/\[[^\]]+\]/g,"").replace(/\n*(best|thanks|regards)[,!].*$/is,"").trim();
    const wc = body.split(/\s+/).length;
    const cta = /walkthrough this week/i.test(body);
    const banned = /^(boost|elevate|unlock|imagine)/i.test(subject);
    if(wc>=45 && cta && /[.!?]$/.test(body) && !banned){
      console.log(`✓ row ${t.rowIndex} | subject: ${subject} | wc: ${wc}`);
      console.log(`  body: ${body.slice(0,200)}`);
      const i = seqMap.get(t.rowIndex);
      seq[i].day3 = {ok:true, subject, body};
      saved = true;
    } else {
      console.log(`  attempt ${attempt+1}: wc=${wc} cta=${cta} banned=${banned}`);
    }
  }
  if(!saved) console.log(`⚠️ row ${t.rowIndex} stuck after 5 attempts`);
}
writeFileSync(process.env.SEQ_PROGRESS || "./scripts/sequence-progress.json", JSON.stringify(seq,null,2));
console.log("Done.");
