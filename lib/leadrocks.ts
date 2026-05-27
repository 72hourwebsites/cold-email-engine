import { CsvRow, FieldMapping } from "./types";

// ─── DETECTION ────────────────────────────────────────────────────────────────
export function isLeadRocksCsv(headers: string[]): boolean {
  const signature = ["Linked Url", "Work Email #1 Status", "Direct Email #1 Status", "Full Name", "Job Title"];
  return signature.filter(h => headers.includes(h)).length >= 4;
}

// ─── FIELD MAPPING PRESET ────────────────────────────────────────────────────
export const LEADROCKS_PRESET: Array<{ csvColumn: string; semanticKey: string }> = [
  { csvColumn: "First Name",           semanticKey: "firstName" },
  { csvColumn: "Last Name",            semanticKey: "lastName" },
  { csvColumn: "Full Name",            semanticKey: "fullName" },
  { csvColumn: "Job Title",            semanticKey: "jobTitle" },
  { csvColumn: "Company",              semanticKey: "company" },
  { csvColumn: "Company Website",      semanticKey: "website" },
  { csvColumn: "Linked Url",           semanticKey: "linkedinUrl" },
  { csvColumn: "Industry",             semanticKey: "industry" },
  { csvColumn: "Location",             semanticKey: "localHook" }, // parsed city/state
  { csvColumn: "Team Size",            semanticKey: "custom1" },
  { csvColumn: "Revenue Range",        semanticKey: "revenue" },
  { csvColumn: "Phone #1",             semanticKey: "phone" },
];

export function applyLeadRocksPreset(headers: string[]): FieldMapping[] {
  const headerSet = new Set(headers);
  const usedKeys = new Set<string>();
  const mappings: FieldMapping[] = headers.map(col => ({ csvColumn: col, semanticKey: "" }));
  for (const { csvColumn, semanticKey } of LEADROCKS_PRESET) {
    if (!headerSet.has(csvColumn) || usedKeys.has(semanticKey)) continue;
    const m = mappings.find(m => m.csvColumn === csvColumn);
    if (m) { m.semanticKey = semanticKey; usedKeys.add(semanticKey); }
  }
  return mappings;
}

// ─── EMAIL STATUS CHECK ───────────────────────────────────────────────────────
// LeadRocks uses multiple status formats: "ok", "ok_for_all|ok_for_all", etc.
export function isEmailVerified(status: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "ok" || s.startsWith("ok_for_all") || s.includes("|ok");
}

// ─── EMAIL PRIORITY ───────────────────────────────────────────────────────────
// Priority: verified direct > verified work > unverified direct > unverified work > company email
export function getBestEmail(row: CsvRow): string {
  const candidates = [
    { val: row["Direct Email #1"], status: row["Direct Email #1 Status"] },
    { val: row["Direct Email #2"], status: row["Direct Email #2 Status"] },
    { val: row["Direct Email #3"], status: row["Direct Email #3 Status"] },
    { val: row["Work Email #1"],   status: row["Work Email #1 Status"] },
    { val: row["Work Email #2"],   status: row["Work Email #2 Status"] },
    { val: row["Work Email #3"],   status: row["Work Email #3 Status"] },
    { val: row["Work Email #4"],   status: row["Work Email #4 Status"] },
    { val: row["Company Email"],   status: "ok" },
  ];
  // First pass: verified only
  const verified = candidates.find(c => c.val && isEmailVerified(c.status));
  if (verified?.val) return verified.val;
  // Second pass: any email (unverified)
  return candidates.find(c => c.val)?.val || "";
}

export function getEmailStatus(row: CsvRow): "verified" | "unverified" | "none" {
  const best = getBestEmail(row);
  if (!best) return "none";
  const candidates = [
    row["Direct Email #1 Status"], row["Direct Email #2 Status"],
    row["Work Email #1 Status"], row["Work Email #2 Status"],
  ];
  return candidates.some(s => isEmailVerified(s || "")) ? "verified" : "unverified";
}

// ─── LOCATION PARSER ─────────────────────────────────────────────────────────
function parseLocation(location: string): { city: string; state: string; country: string } {
  if (!location) return { city: "", state: "", country: "" };
  const parts = location.split(",").map(p => p.trim());
  return {
    city:    parts[0] || "",
    state:   parts[1] || "",
    country: parts[parts.length - 1] || "",
  };
}

// ─── JOB TITLE ANGLE ─────────────────────────────────────────────────────────
function getJobTitleAngle(jobTitle: string): { category: string; hook: string } {
  const t = (jobTitle || "").toLowerCase();
  if (t.includes("chef") && (t.includes("owner") || t.includes("founder")))
    return { category: "chef-owner", hook: "Running a kitchen AND a business means the phone is always the last thing you can answer during service." };
  if (t.includes("co-owner") || t.includes("co owner"))
    return { category: "co-owner", hook: "Two owners means twice the responsibility — missed calls still fall through the cracks when you're both slammed." };
  if (t.includes("franchise"))
    return { category: "franchise-owner", hook: "Multiple locations means multiple phone lines to manage — missed calls multiply fast across each one." };
  if (t.includes("operator") || (t.includes("owner") && t.includes("operator")))
    return { category: "operator", hook: "Managing every aspect of the operation means the phone rings while you're dealing with something else entirely." };
  if (t.includes("founder"))
    return { category: "founder", hook: "You built this from scratch — every missed call is a potential customer you worked hard to attract, going somewhere else." };
  // Default: Owner
  return { category: "owner", hook: "You built this business — every missed call is a customer who chose you but couldn't get through." };
}

// ─── COMPUTED TOKENS ─────────────────────────────────────────────────────────
export function computeLeadRocksTokens(row: CsvRow): Record<string, string> {
  const t: Record<string, string> = {};

  // Best verified email
  t.email = getBestEmail(row);
  t.emailSource = row["Direct Email #1 Status"] === "ok" ? "direct" :
                  row["Work Email #1 Status"] === "ok" ? "work" : "company";

  // Location parsing
  const loc = parseLocation(row["Location"] || "");
  t.city    = loc.city;
  t.state   = loc.state;
  t.country = loc.country;

  // Job title analysis
  const { category, hook } = getJobTitleAngle(row["Job Title"] || "Owner");
  t.jobTitleCategory = category;
  t.jobTitleHook     = hook;

  // LinkedIn first name (use actual First Name)
  t.firstName = (row["First Name"] || "").trim();
  t.lastName  = (row["Last Name"] || "").trim();

  // Team size context
  const teamSize = (row["Team Size"] || "").toLowerCase();
  t.teamSizeLabel = teamSize === "1" ? "solo operator" :
                    teamSize === "2-10" ? "small team" :
                    teamSize === "11-50" ? "growing team" : "established team";

  // LinkedIn URL (shortened for prompt)
  t.linkedinUrl = row["Linked Url"] || "";
  t.hasLinkedin = t.linkedinUrl ? "YES" : "NO";

  // Restaurant type from company name hints
  const company = (row["Company"] || "").toLowerCase();
  const industry = (row["Industry"] || "").toLowerCase();
  t.businessType = industry.includes("restaurant") ? "restaurant" :
                   industry.includes("food") ? "food & beverage" :
                   industry.includes("hospitality") ? "hospitality" : "restaurant";

  // US state code from state name
  const stateMap: Record<string, string> = {
    "California":"CA","Texas":"TX","New York":"NY","Florida":"FL","Washington":"WA",
    "Colorado":"CO","Illinois":"IL","Georgia":"GA","Arizona":"AZ","Oregon":"OR",
    "North Carolina":"NC","Tennessee":"TN","Ohio":"OH","Michigan":"MI","Nevada":"NV",
    "Massachusetts":"MA","Pennsylvania":"PA","Virginia":"VA","Maryland":"MD",
    "Minnesota":"MN","Wisconsin":"WI","Louisiana":"LA","Missouri":"MO",
    "Kansas":"KS","Oklahoma":"OK","Utah":"UT","New Mexico":"NM","Idaho":"ID",
    "Montana":"MT","Wyoming":"WY","South Carolina":"SC","Alabama":"AL",
    "Mississippi":"MS","Arkansas":"AR","Iowa":"IA","Nebraska":"NE","Kentucky":"KY",
    "Indiana":"IN","Connecticut":"CT","New Jersey":"NJ","Rhode Island":"RI",
  };
  t.stateCode = stateMap[loc.state] || loc.state.slice(0, 2).toUpperCase();

  return t;
}

// ─── LEADROCKS VOICE AI PROMPT (fill-in template — optimized for Qwen) ─────────
export const LEADROCKS_VOICE_AI_PROMPT = `Write a personalized cold email for {{firstName}}, {{jobTitle}} at {{company}} in {{city}}, {{state}}.

We sell Voice AI that answers restaurant phone calls 24/7 — takes reservations, handles questions, sounds like their own staff. Live in 48 hours.

Their situation: {{jobTitleHook}}

Write a complete cold email. Subject line references {{firstName}} and {{company}}. Body opens with {{firstName}} and a specific scene at {{company}} in {{city}} during busy service when calls go unanswered. Then one sentence on what that costs. Then two sentences on our AI. Final line: Worth 15 minutes this week?

Keep body 65-85 words. Plain text only. No bullet points.

Subject: [write subject here]

[write body here]`;

export const LEADROCKS_DAY3_PROMPT = `Write a short follow-up cold email (Day 3, no reply) for Voice AI phone answering.

Contact: {{firstName}} {{lastName}}, {{jobTitle}} @ {{company}}, {{city}}, {{state}}
Angle: {{jobTitleHook}}

PURPOSE: New angle — lead with a real result from a similar restaurant owner.

RULES:
1. Lead with a result: "A [similar role] in [state] captured 18 new reservations last month from calls that used to go to voicemail."
2. Connect to their specific situation ({{jobTitleCategory}} running {{company}})
3. CTA: "Still worth 10 minutes?" or "Want me to send a 60-second demo?"
4. 50-70 words total. No "following up", "circling back", "checking in".
5. Subject: 3-5 words, casual, completely different from step 1

Output EXACTLY:
Subject: [subject]

[body]`;

export const LEADROCKS_DAY7_PROMPT = `Write a short cold email (Day 7, 3rd touch) for Voice AI phone answering.

Contact: {{firstName}} @ {{company}}, {{city}}
Angle: {{jobTitleHook}}

PURPOSE: One specific curiosity question, then a free offer.

RULES:
1. "Quick question, {{firstName}} — how many calls does {{company}} miss on a typical [busy night/Friday/Saturday]?"
2. One sentence on what we do
3. CTA: "Can I send a 60-second demo?" or "Yes or no?"
4. 40-55 words. Subject: 3-4 words.

Output EXACTLY:
Subject: [subject]

[body]`;

export const LEADROCKS_DAY14_PROMPT = `Write a break-up cold email (Day 14, final touch). Warm, gracious, zero pressure. 2-3 sentences, door open.

Contact: {{firstName}} @ {{company}} in {{city}}

Output EXACTLY:
Subject: [3-4 words]

[2-3 sentences]`;

export const LEADROCKS_ICEBREAKER_PROMPT = `Write ONE personalized opening line (20-35 words) for a cold email. Output only the line.

Contact: {{firstName}}, {{jobTitle}} @ {{company}}, {{city}}, {{state}}
Job context: {{jobTitleHook}}

Sounds like you researched them on LinkedIn. References their role or city. No product mention.`;
