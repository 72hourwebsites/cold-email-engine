import { CsvRow, FieldMapping } from "./types";

export const OUTSCRAPER_PRESET: Array<{ csvColumn: string; semanticKey: string }> = [
  { csvColumn: "name_for_emails",                        semanticKey: "company" },
  { csvColumn: "name",                                   semanticKey: "custom1" },
  { csvColumn: "phone.whitepages_phones.name",           semanticKey: "ownerName" },
  { csvColumn: "subtypes",                               semanticKey: "subtypes" },
  { csvColumn: "type",                                   semanticKey: "industry" },
  { csvColumn: "phone",                                  semanticKey: "phone" },
  { csvColumn: "website",                                semanticKey: "website" },
  { csvColumn: "city",                                   semanticKey: "city" },
  { csvColumn: "state_code",                             semanticKey: "state" },
  { csvColumn: "rating",                                 semanticKey: "rating" },
  { csvColumn: "reviews",                                semanticKey: "reviews" },
  { csvColumn: "description",                            semanticKey: "linkedinBio" },
  { csvColumn: "working_hours_csv_compatible",           semanticKey: "hours" },
  { csvColumn: "other_hours",                            semanticKey: "happyHours" },
  { csvColumn: "reservation_links",                      semanticKey: "reservationLinks" },
  { csvColumn: "about",                                  semanticKey: "attributes" },
  { csvColumn: "range",                                  semanticKey: "priceRange" },
  { csvColumn: "company_insights.founded_year",          semanticKey: "foundedYear" },
  { csvColumn: "company_insights.revenue",               semanticKey: "revenue" },
  { csvColumn: "company_insights.employees",             semanticKey: "custom3" },
  { csvColumn: "reviews_per_score_5",                    semanticKey: "reviewsTop" },
  { csvColumn: "reviews_per_score_1",                    semanticKey: "reviewsBottom" },
];

export function isOutscraperCsv(headers: string[]): boolean {
  // Works with both enriched (has company_insights) and standard Outscraper exports
  const core = ["name_for_emails", "subtypes", "reviews_per_score_5", "about", "working_hours_csv_compatible"];
  return core.filter(h => headers.includes(h)).length >= 3;
}

// Detect business category from type/subtype fields
export function detectBusinessCategory(row: CsvRow): "restaurant" | "professional_services" | "other" {
  const t = ((row["type"] || "") + " " + (row["subtypes"] || "")).toLowerCase();
  if (t.match(/restaurant|bar|cafe|diner|pizza|sushi|bistro|grill|tavern|brewery|bbq|seafood|steakhouse|thai|chinese|mexican|italian|greek|japanese|vietnamese|burger|food trailer/)) {
    return "restaurant";
  }
  if (t.match(/accountant|cpa|tax|bookkeeping|certified public|financial|attorney|lawyer|dentist|doctor|physician|clinic|orthodont|optom|chiropract|plumber|electrician|contractor|realtor|insurance|mortgage/)) {
    return "professional_services";
  }
  return "other";
}

export function applyOutscraperPreset(headers: string[]): FieldMapping[] {
  const headerSet = new Set(headers);
  const usedKeys = new Set<string>();
  const mappings: FieldMapping[] = headers.map(col => ({ csvColumn: col, semanticKey: "" }));
  for (const { csvColumn, semanticKey } of OUTSCRAPER_PRESET) {
    if (!headerSet.has(csvColumn) || usedKeys.has(semanticKey)) continue;
    const m = mappings.find(m => m.csvColumn === csvColumn);
    if (m) { m.semanticKey = semanticKey; usedKeys.add(semanticKey); }
  }
  return mappings;
}

// ─── BEST ANGLE SELECTOR ─────────────────────────────────────────────────────
function selectBestAngle(aboutStr: string, row: CsvRow): { angle: string; hook: string } {
  const hasNoBooking   = !row["reservation_links"]?.trim() && !aboutStr.includes('"Accepts reservations": true');
  const hasLiveMusic   = aboutStr.includes('"Live music": true');
  const hasHappyHours  = (row["other_hours"] || "").includes("happy_hours");
  const usuallyWait    = aboutStr.includes('"Usually a wait": true');
  const isWomenOwned   = aboutStr.includes('"Identifies as women-owned": true');
  const foundedYear    = parseInt(row["company_insights.founded_year"] || "0");
  const yearsOpen      = foundedYear > 1900 ? 2026 - foundedYear : 0;
  const hasOutdoor     = aboutStr.includes('"Outdoor seating": true');
  const noReserv       = aboutStr.includes('"Accepts reservations": false');

  if (hasNoBooking && hasLiveMusic)
    return { angle: "live music nights with no online booking", hook: "When the show starts and the place fills up, calls go straight to voicemail with no backup system." };
  if (noReserv)
    return { angle: "walk-in only, no booking system", hook: "Every call is their only chance to secure a table — miss it and that customer goes elsewhere." };
  if (hasLiveMusic && hasHappyHours)
    return { angle: "live music plus happy hour rush", hook: "Calls spike at happy hour and again before live shows — staff can't answer both." };
  if (hasLiveMusic)
    return { angle: "live music nights", hook: "People call ahead before live shows to ask about the lineup, cover, reservations — most go to voicemail." };
  if (hasHappyHours)
    return { angle: "happy hour call rush", hook: "The 3-6pm window brings the highest call volume exactly when staff is too slammed to pick up." };
  if (usuallyWait)
    return { angle: "always busy with a wait", hook: "When there is always a wait, the phone never stops — missed calls during the rush is real lost money." };
  if (hasNoBooking && yearsOpen > 10)
    return { angle: `${yearsOpen} years open with no online booking`, hook: `After ${yearsOpen} years they have built a loyal following — but with no online booking, every missed call is a lost reservation.` };
  if (yearsOpen > 20)
    return { angle: `${yearsOpen} years in business`, hook: "Two decades of reputation built — every call deserves an answer." };
  if (isWomenOwned && hasNoBooking)
    return { angle: "women-owned with no booking system", hook: "Built from scratch — every call matters, but without a booking system missed calls mean missed revenue." };
  if (hasOutdoor && hasNoBooking)
    return { angle: "outdoor dining with no booking system", hook: "Outdoor dining draws big groups who call ahead — without a booking system those calls go to voicemail." };
  return { angle: "dinner rush and after-hours overflow", hook: "Calls during dinner rush and after closing go to voicemail — each one a potential cover lost." };
}

// ─── PROFESSIONAL SERVICES BEST ANGLE ────────────────────────────────────────
function selectProfessionalAngle(aboutStr: string, row: CsvRow): { angle: string; hook: string } {
  const appointmentRequired = aboutStr.includes('"Appointment required": true') || aboutStr.includes('"Appointments recommended": true');
  const isWomenOwned = aboutStr.includes('"Identifies as women-owned": true');
  const hours = row["working_hours_csv_compatible"] || "";
  const closesAt5 = hours.match(/5PM|4PM|6PM/);
  const type = (row["type"] || "").toLowerCase();
  const isTaxPrep = type.includes("tax");
  const isSolo = !row["company_insights.employees"] || parseInt(row["company_insights.employees"] || "0") <= 5;
  const foundedYear = parseInt(row["company_insights.founded_year"] || "0");
  const yearsOpen = foundedYear > 1900 ? 2026 - foundedYear : 0;

  if (appointmentRequired && isTaxPrep)
    return { angle: "tax prep — every call is a potential client appointment", hook: "During tax season the phone never stops — and every missed call is a filing they take somewhere else." };
  if (appointmentRequired)
    return { angle: "appointment-based — missed call = missed booking", hook: "Every call is a potential new client. Miss it and they book with someone else before the day is over." };
  if (isTaxPrep)
    return { angle: "tax preparation — peak season call volume overwhelms staff", hook: "January through April, the phones are nonstop — and one missed call during filing season is a client lost for the year." };
  if (isSolo && closesAt5)
    return { angle: "solo/small firm — after-hours calls go straight to voicemail", hook: "A solo CPA closes at 5pm but clients call at 7pm when they find an error — those calls all hit voicemail." };
  if (isWomenOwned)
    return { angle: "women-owned firm — every client relationship matters", hook: "Built from the ground up — every client call that goes unanswered is a relationship that starts cold." };
  if (yearsOpen > 15)
    return { angle: `${yearsOpen} years in business — reputation worth answering every call for`, hook: `After ${yearsOpen} years building a client base, missed calls mean someone else gets the referrals.` };
  return { angle: "professional services — missed calls mean missed clients", hook: "In professional services, the first firm to answer gets the client. Missed calls go straight to a competitor." };
}

// ─── COMPUTED TOKENS ─────────────────────────────────────────────────────────
export function computeOutscraperTokens(row: CsvRow): Record<string, string> {
  const t: Record<string, string> = {};
  const aboutStr = row["about"] || "";
  const category = detectBusinessCategory(row);
  t.businessCategory = category;

  const ownerFull = (row["phone.whitepages_phones.name"] || "").trim();
  const lookupType = (row["phone.whitepages_phones.lookup_type"] || "").toLowerCase();
  const isBizName = /(llc|inc|corp|ltd|grill|restaurant|tavern|cafe|bar|group|holdings|kitchen|diner|bistro|pizza|sushi|thai|chinese|bbq|taco|burger)/i.test(ownerFull);
  t.ownerFirstName = (lookupType === "person" && !isBizName && ownerFull.length > 0) ? ownerFull.split(/\s+/)[0] : "";
  t.ownerName = ownerFull;

  const hasLink = !!(row["reservation_links"] || "").trim();
  const acceptsRes = aboutStr.includes('"Accepts reservations": true');
  t.reservationStatus = (hasLink || acceptsRes) ? "has online booking" : "NO online booking system";

  const total = parseFloat(row["reviews"] || "0");
  const five  = parseFloat(row["reviews_per_score_5"] || "0");
  t.fiveStarPct = total > 0 ? `${Math.round((five / total) * 100)}%` : "";

  t.happyHoursStatus = (row["other_hours"] || "").includes("happy_hours") ? "YES" : "none";

  const feats: string[] = [];
  if (aboutStr.includes('"Live music": true'))                feats.push("live music");
  if (aboutStr.includes('"Identifies as women-owned": true')) feats.push("women-owned");
  if (aboutStr.includes('"Outdoor seating": true'))           feats.push("outdoor seating");
  if (aboutStr.includes('"Usually a wait": true'))            feats.push("usually a wait");
  if (aboutStr.includes('"Catering": true'))                  feats.push("catering");
  if (aboutStr.includes('"Great cocktails": true'))           feats.push("cocktail bar");
  t.keyAttributes = feats.slice(0, 3).join(", ") || "dine-in";

  const fy = parseInt(row["company_insights.founded_year"] || "0");
  t.yearsInBusiness = (fy > 1900) ? `${2026 - fy} years` : "";
  t.foundedYear     = (fy > 1900) ? String(fy) : "";

  const rev = parseInt(row["company_insights.revenue"] || "0");
  t.revenueFormatted = rev >= 1_000_000 ? `~$${(rev/1_000_000).toFixed(0)}M/yr` : "";

  const sub = row["subtypes"] || row["type"] || "";
  t.restaurantType = sub.split(",")[0].trim().replace(/ restaurant$/i, "").trim() || "Restaurant";

  const { angle, hook } = category === "professional_services"
    ? selectProfessionalAngle(aboutStr, row)
    : selectBestAngle(aboutStr, row);
  t.bestAngle     = angle;
  t.bestAngleHook = hook;

  // Appointment signal for professional services
  t.appointmentRequired = (aboutStr.includes('"Appointment required": true') || aboutStr.includes('"Appointments recommended": true'))
    ? "YES — appointment required" : "walk-in / call-in";

  // Business type label (clean)
  t.businessType = (row["type"] || row["subtypes"] || "").split(",")[0].trim();

  return t;
}

// ─── PROFESSIONAL SERVICES PROMPTS ───────────────────────────────────────────
export const PROFESSIONAL_SERVICES_VOICE_AI_PROMPT = `Write a hyper-personalized cold email selling Voice AI phone answering to a professional services firm.

SUBJECT — pick ONE of these 6 styles based on which fits the firm best. Use EXACTLY ONE style, not a mix:
Style A: "[Owner], who picks up when you're with a client?" (use when you have a real owner name)
Style B: "[Company] missing client calls after hours?" (use when no owner name)
Style C: "Tax season in [City] — is [Company] catching every call?" (use for tax/accounting firms)
Style D: "[Owner], every missed call is a booking lost" (use appointment-required firms)
Style E: "[Company]'s voicemail is costing you clients" (direct, any firm)
Style F: "After 5pm calls at [Company] — who answers?" (use for firms with strict hours)

EXAMPLE EMAIL:
Business: Joyce A Horn CPA · Sherman, TX · Owner: Joyce · Angle: appointment-required solo CPA
Subject: Joyce, who picks up when you're with a client?

Joyce, when you're deep in a client meeting and the phone rings with a new inquiry, that call usually hits voicemail — and they book with someone else instead.

Our AI answers 24/7 in your firm's voice — schedules consultations, answers questions about your services and fees, and captures every lead even at 9pm. Live in 48 hours.

Worth 15 minutes this week?
---

NOW WRITE FOR:
Business: {{company}} ({{businessType}}) · {{city}}, {{state}}
Owner first name: {{ownerFirstName}}
Angle: {{bestAngle}}
Why: {{bestAngleHook}}
Rating: {{rating}}★ · {{reviews}} reviews · Hours: {{hours}}
Appointment policy: {{appointmentRequired}}
Features: {{keyAttributes}}
Description: "{{linkedinBio}}"

RULES:
1. Subject: 4-7 words. Pick the style that fits best from the 6 above. NEVER start with "Who answers". NO Boost/Elevate/Unlock/Transform/Maximize.
2. Open with {{ownerFirstName}} ONLY if it is clearly a real human first name (not LLC, Inc, or a business name).
3. First sentence: the ANGLE, specific to THIS firm and city. Never "I", "Hey there", "Hope this".
4. Pain: missed calls = missed clients. Professional services language ONLY — consultations, appointments, filings, inquiries. NEVER use: covers, seats, dinner rush, reservations, tiki bar.
5. Value: AI answers 24/7, sounds like their staff, handles scheduling and FAQ calls. 1-2 sentences.
6. LAST SENTENCE MUST BE EXACTLY: "Worth 15 minutes this week?"
7. Body: STOP at 90 words. Count carefully. If you reach 90 words, end the sentence and write the CTA.
8. BANNED words: seamless, leverage, peace of mind, manages the flow, pain points, streamline, empower, robust.

Output ONLY:
Subject: [subject]

[body]`;

export const PROFESSIONAL_SERVICES_DAY3_PROMPT = `Write a follow-up cold email (Day 3, no reply) for Voice AI phone answering for professional services.

BUSINESS: {{company}} ({{businessType}}) · {{city}}, {{state}} · Owner: {{ownerFirstName}}
ANGLE: {{bestAngle}} · {{rating}}★ · {{appointmentRequired}}

RULES: Lead with a concrete result from a similar practice. 50-70 words. No "following up/circling back". Soft CTA. Subject: 3-5 words, casual.

Output EXACTLY:
Subject: [subject]

[body]`;

export const PROFESSIONAL_SERVICES_DAY7_PROMPT = `Write a short cold email (Day 7, 3rd touch) for Voice AI phone answering.

BUSINESS: {{company}} · {{city}} · Owner: {{ownerFirstName}} · Angle: {{bestAngle}}

RULES: ONE curiosity question about their situation. Offer 60-sec demo. 40-55 words. Subject: 3-5 words.

Output EXACTLY:
Subject: [subject]

[body]`;

export const PROFESSIONAL_SERVICES_DAY14_PROMPT = `Write a break-up email (Day 14, final touch). 2-3 sentences. Gracious, zero pressure, door open.

BUSINESS: {{company}} in {{city}} · Owner: {{ownerFirstName}}

Output EXACTLY:
Subject: [3-4 words]

[2-3 sentences]`;

// ─── RESTAURANT PROMPT ────────────────────────────────────────────────────────
export const OUTSCRAPER_VOICE_AI_PROMPT = `Write a cold email for this restaurant. Output only the email, nothing else.

RESTAURANT: {{company}} ({{restaurantType}}) · {{city}}, {{state}}
OWNER: {{ownerFirstName}}
ANGLE: {{bestAngle}}
ANGLE DETAIL: {{bestAngleHook}}
STATS: {{rating}}★ · {{reviews}} reviews · {{yearsInBusiness}} · {{reservationStatus}} · happy hours: {{happyHoursStatus}} · {{keyAttributes}}
DESCRIPTION: "{{linkedinBio}}"

PRODUCT: Voice AI that answers their phone 24/7 — reservations, after-hours calls, dinner rush overflow. 48 hours to go live, no hardware.

FORMAT:
Subject: [4-7 words. Start with the RESTAURANT NAME "{{company}}" or a strong question word. NEVER repeat "after hours" if the angle is something else. NEVER start with city name. NEVER use Boost/Elevate/Enhance/Unlock/Spring/Hey. Examples of good subjects: "{{company}} missing dinner rush calls?", "Who answers {{company}} at 10pm?", "{{company}} happy hour calls going to voicemail?"]

[Body: 80-100 words. Count words. If under 80, add one more sentence with a specific detail.
- If {{ownerFirstName}} is a real first name (not a business name), open the email with it
- Sentence 1: hook directly on the ANGLE — use a specific detail from the restaurant data (type of food, years open, features, city)
- Sentence 2: missed calls during THAT specific situation cost money — be concrete
- Sentence 3: our AI answers every call 24/7, takes reservations, sounds like their staff — live in 48 hours
- Sentence 4: "Worth 15 minutes this week?"
- Plain text only. No markdown. No bullet points.]`;

export const OUTSCRAPER_FOLLOWUP_PROMPT = `Write a short follow-up cold email (day 3, no reply yet) for Voice AI phone answering.

RESTAURANT: {{company}} ({{restaurantType}}) in {{city}}, {{state}}
Owner: {{ownerFirstName}}
Rating: {{rating}} stars, {{reviews}} reviews
Booking: {{reservationStatus}}

Write the email. Format:

Subject: [3-5 casual words, NOT Boost/Elevate/Unlock]

[3-4 sentences. Lead with a real result like "A similar restaurant added 22 reservations from calls they used to miss." New angle. End with: Still worth 10 minutes?]`;

// Day 7 — curiosity question
export const OUTSCRAPER_DAY7_PROMPT = `Write a short cold email (Day 7, 3rd touch, no reply yet) for a Voice AI phone answering service.

RESTAURANT: {{company}} ({{restaurantType}}) in {{city}}, {{state}}
OWNER: {{ownerFirstName}}
ANGLE: {{bestAngle}}
STATS: {{rating}}★ · {{reviews}} reviews · {{reservationStatus}} · happy hours: {{happyHoursStatus}}

PURPOSE: Ask ONE specific curiosity question about their exact situation, then make a low-commitment offer.

RULES:
1. Open with a direct question tied to their angle: "Quick question — how many calls does {{company}} get on [specific time from angle] that hit voicemail?"
2. One sentence: our AI catches every one, 24/7, sounds like their own staff
3. CTA: "Can I send a 60-second demo?" or "Yes or no?"
4. 40-60 words total — ultra-short
5. Subject: 3-5 words, curiosity-driven, NO Boost/Elevate/Unlock, different from steps 1+2
6. Plain text only, no markdown

Output EXACTLY:
Subject: [subject]

[body]`;

// Day 14 — break-up (final touch)
export const OUTSCRAPER_DAY14_PROMPT = `Write a break-up cold email (Day 14, final touch) for a Voice AI phone answering service.

RESTAURANT: {{company}} in {{city}}, {{state}}
OWNER: {{ownerFirstName}}

PURPOSE: Gracious exit. Warm, zero pressure. Leave the door permanently open.

RULES:
1. 2-3 sentences MAXIMUM
2. Acknowledge timing might be off — genuinely no hard feelings
3. Leave door open: "whenever it makes sense, we're here"
4. One optional nod to something specific about their restaurant
5. Subject: 3-4 words, human, ultra-short
6. Tone: warm peer signing off, not desperate

Output EXACTLY:
Subject: [subject]

[body]`;

export const OUTSCRAPER_BREAKUP_PROMPT = OUTSCRAPER_DAY14_PROMPT;

export const ICEBREAKER_OUTSCRAPER = `Write one personalized opening line for a cold email. Output only the line, nothing else.

Restaurant: {{company}} ({{restaurantType}}) in {{city}}, {{state}}
Details: {{rating}} stars, {{reviews}} reviews, {{yearsInBusiness}} open, {{keyAttributes}}
Key fact: {{bestAngle}}

20-35 words. Specific to this restaurant. Sounds human. No product mention.`;
