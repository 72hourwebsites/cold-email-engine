import { CsvRow, FieldMapping, SEMANTIC_FIELDS, ServiceType, EmailMode, SequenceTemplates } from "./types";
import {
  computeOutscraperTokens, isOutscraperCsv, detectBusinessCategory,
  OUTSCRAPER_VOICE_AI_PROMPT, OUTSCRAPER_FOLLOWUP_PROMPT, OUTSCRAPER_DAY7_PROMPT, OUTSCRAPER_DAY14_PROMPT,
  PROFESSIONAL_SERVICES_VOICE_AI_PROMPT, PROFESSIONAL_SERVICES_DAY3_PROMPT, PROFESSIONAL_SERVICES_DAY7_PROMPT, PROFESSIONAL_SERVICES_DAY14_PROMPT,
} from "./outscraper";
import {
  computeLeadRocksTokens, isLeadRocksCsv, getBestEmail,
  LEADROCKS_VOICE_AI_PROMPT, LEADROCKS_DAY3_PROMPT, LEADROCKS_DAY7_PROMPT, LEADROCKS_DAY14_PROMPT, LEADROCKS_ICEBREAKER_PROMPT,
} from "./leadrocks";

function getSeason(date: Date): string {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return "Spring";
  if (m >= 6 && m <= 8) return "Summer";
  if (m >= 9 && m <= 11) return "Fall";
  return "Winter";
}

export function buildPrompt(template: string, row: CsvRow, mappings: FieldMapping[]): string {
  const now = new Date();
  const resolved: Record<string, string> = {
    season: getSeason(now),
    month: now.toLocaleString("en-US", { month: "long" }),
    year: String(now.getFullYear()),
    date: now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  };

  // Standard field mappings
  for (const m of mappings) {
    if (m.semanticKey && m.csvColumn) {
      resolved[m.semanticKey] = row[m.csvColumn] || "";
    }
  }

  // Auto-derive firstName from ownerName or fullName
  if (!resolved.firstName) {
    const source = resolved.ownerName || resolved.fullName || "";
    if (source) resolved.firstName = source.trim().split(/\s+/)[0];
  }
  if (!resolved.lastName && resolved.fullName) {
    const parts = resolved.fullName.trim().split(/\s+/);
    resolved.lastName = parts[parts.length - 1];
  }

  // Inject format-specific computed tokens
  const csvCols = Object.keys(row);
  if (isLeadRocksCsv(csvCols)) {
    const computed = computeLeadRocksTokens(row);
    for (const [k, v] of Object.entries(computed)) {
      resolved[k] = v; // LeadRocks tokens always win (they're computed from raw data)
    }
    // Override email with best verified email
    if (!resolved.email) resolved.email = getBestEmail(row);
  } else if (isOutscraperCsv(csvCols)) {
    const computed = computeOutscraperTokens(row);
    for (const [k, v] of Object.entries(computed)) {
      if (!resolved[k] || resolved[k] === "") resolved[k] = v;
    }
    // Always override these with computed versions (they're derived)
    resolved.ownerFirstName = computed.ownerFirstName;
    resolved.reservationStatus = computed.reservationStatus;
    resolved.reservationAngle = computed.reservationAngle;
    resolved.fiveStarPct = computed.fiveStarPct;
    resolved.happyHoursStatus = computed.happyHoursStatus;
    resolved.happyHoursAngle = computed.happyHoursAngle;
    resolved.keyAttributes = computed.keyAttributes;
    resolved.yearsInBusiness = computed.yearsInBusiness;
    resolved.revenueFormatted = computed.revenueFormatted;
    resolved.restaurantType = computed.restaurantType;
    resolved.teamSize = computed.teamSize;
    resolved.isWomenOwned = computed.isWomenOwned;
    resolved.hasLiveMusic = computed.hasLiveMusic;
    resolved.closesLate = computed.closesLate;
    resolved.foundedYear = computed.foundedYear;
  }

  let prompt = template;
  for (const [key, val] of Object.entries(resolved)) {
    prompt = prompt.replaceAll(`{{${key}}}`, val || "");
  }
  // Clear any remaining unresolved tokens
  prompt = prompt.replace(/\{\{[^}]+\}\}/g, "");
  return prompt;
}

export const DEFAULT_SYSTEM_PROMPT = `You are a cold email writer. Your ONLY output is the email itself.

FORMAT — output exactly this, nothing else:
Subject: [4-7 words]

[email body]

HARD RULES — every single one is mandatory:
1. Subject line: 4-8 words. Specific to the person or business. Never generic.
2. Body: exactly 75-100 words. Count every word. Stop at 100. Do not go under 75.
3. Do NOT open with: "Hi", "Hello", "Hey", "I hope", "Hope this", "Greetings", "I wanted", "I noticed", "I came across"
4. Open directly with the person's first name OR with a punchy observation about their business.
5. Plain text only. No asterisks. No bullet points. No markdown formatting.
6. STRICTLY BANNED — do not use these words: seamless, leverage, synergy, enhance, empower, streamline, robust, game-changing, cutting-edge, pain points, value proposition, holistic, innovative, scalable, delicious, amazing, incredible
7. End with exactly: "Worth 15 minutes this week?"
8. Every sentence must be specific to THIS business — zero generic filler`;

export const TEMPLATE_TOKENS = SEMANTIC_FIELDS.map(f => `{{${f.key}}}`).concat([
  "{{ownerFirstName}}", "{{reservationStatus}}", "{{reservationAngle}}",
  "{{fiveStarPct}}", "{{happyHoursStatus}}", "{{happyHoursAngle}}",
  "{{keyAttributes}}", "{{yearsInBusiness}}", "{{revenueFormatted}}",
  "{{restaurantType}}", "{{teamSize}}", "{{isWomenOwned}}", "{{hasLiveMusic}}",
  "{{season}}", "{{month}}", "{{year}}", "{{date}}",
]);

// ─── SERVICE CONFIG ───────────────────────────────────────────────────────────

export const SERVICE_LABELS: Record<ServiceType, string> = {
  apollo_voice_ai:          "🚀 Apollo/LinkedIn — Voice AI",
  leadrocks_voice_ai:       "🔗 LeadRocks — Voice AI",
  outscraper_voice_ai:      "🍽 Outscraper — Restaurants",
  outscraper_professional:  "💼 Outscraper — Professional Services",
  voice_ai:                 "🎙 Voice AI",
  digital_marketing:        "📈 Digital Marketing",
  bundle:                   "🚀 Voice AI + Marketing",
  custom:                   "✏️ Custom",
};

export const SERVICE_DESCRIPTIONS: Record<ServiceType, string> = {
  apollo_voice_ai:         "🎯 Best for Apollo.io / LinkedIn exports — uses first name, job title (Co-Owner vs Founder vs Chef/Owner angle), team size, LinkedIn URL, location. 4-step sequence.",
  leadrocks_voice_ai:      "Pre-built for LeadRocks CSVs — uses verified emails, LinkedIn, job title angle (Owner/Chef & Owner/Co-Owner), location, 4-step sequence",
  outscraper_voice_ai:     "Pre-built for restaurant Outscraper CSVs — owner names, hours, happy hours, live music, booking status",
  outscraper_professional: "Pre-built for accountant/CPA/professional services Outscraper CSVs — appointment signals, practice type, after-hours angle",
  voice_ai:                "24/7 AI phone answering — reservations, after-hours, overflow calls",
  digital_marketing:       "Local SEO, Google Ads, social media, review generation",
  bundle:                  "Voice AI + Marketing: we drive calls AND answer them",
  custom:                  "Write your own prompt from scratch",
};

// ─── STANDARD TEMPLATES ───────────────────────────────────────────────────────

const VOICE_AI_STEP1 = `Write a hyper-personalized cold email selling Voice AI phone answering to {{firstName}} at {{company}}.

WHAT WE SELL: An AI that answers their phone 24/7, in their brand's voice:
- Reservations and bookings
- After-hours calls that go to voicemail
- Call overflow during dinner rush
- FAQs: hours, menu, wait times, directions
- Live in 48 hours, no hardware, cancel anytime

PROSPECT:
Name: {{firstName}} {{lastName}}
Business: {{company}} — {{industry}} in {{city}}, {{state}}
Rating: {{rating}} stars · {{reviews}} reviews
Booking system: {{bookingSystem}}
Season: {{season}} {{year}}

HARD RULES:
1. Subject: specific to their city or season
2. First sentence: hook on THEM. NEVER start with "I"
3. Pain: missed calls = missed revenue. 1 sentence.
4. Value: 1-2 sentences. Concrete.
5. CTA: "15-minute demo this week?"
6. Body: 80-110 words MAX. Warm, human, zero corporate fluff.
7. BANNED: "Hope this finds you well", "I came across your profile", "I wanted to reach out"

Output EXACTLY:
Subject: [subject line]

[email body]`;

const VOICE_AI_STEP2 = `Write a 3-4 sentence follow-up cold email (day 3, no reply) about Voice AI phone answering.

PROSPECT: {{firstName}} at {{company}}, {{industry}} in {{city}}, {{state}}

RULES:
1. No "following up", "circling back", "checking in"
2. New angle: one concrete result ("A {{industry}} in {{state}} picked up 31 calls they'd have missed")
3. Soft CTA: "Still worth a quick look?" or "Happy to send a demo video?"
4. Casual subject, different from step 1

Output EXACTLY:
Subject: [subject]

[body]`;

const VOICE_AI_STEP3 = `Write a 2-3 sentence break-up email (day 7, final) about Voice AI phone answering.

PROSPECT: {{firstName}} at {{company}} in {{city}}

Rules: Easy out. Light tone. One door open. Ultra-short subject.

Output EXACTLY:
Subject: [subject]

[body]`;

const DIGITAL_MARKETING_STEP1 = `Write a hyper-personalized cold email selling local digital marketing services.

WHAT WE SELL: Local digital marketing — SEO, Google Ads, social media, review generation.
We get businesses showing up when people in {{city}} search for what they offer.

PROSPECT:
Name: {{firstName}}
Business: {{company}} — {{industry}} in {{city}}, {{state}}
Rating: {{rating}} stars · {{reviews}} reviews
Website: {{website}}
Season: {{season}} {{year}}

HARD RULES:
1. Subject: reference their city visibility or seasonal opportunity
2. First line: hook on THEM. NEVER "I"
3. Gap: assume they could rank better locally — more visibility = more customers
4. Value: "We get {{company}} showing up when someone in {{city}} searches..."
5. CTA: "Free audit" or "15-minute call"
6. Body: 90-120 words MAX. Zero buzzwords.

Output EXACTLY:
Subject: [subject]

[body]`;

const DIGITAL_MARKETING_STEP2 = `Write a 3-4 sentence follow-up (day 3) about local digital marketing.

PROSPECT: {{firstName}} at {{company}}, {{industry}} in {{city}}.

RULES: No "following up". Lead with a local SEO fact. Offer something free (search visibility report). Casual subject.

Output EXACTLY:
Subject: [subject]

[body]`;

const DIGITAL_MARKETING_STEP3 = `Write a 2-sentence break-up email (day 7) about digital marketing. Easy out. Light. Short subject.

PROSPECT: {{firstName}} at {{company}} in {{city}}

Output EXACTLY:
Subject: [subject]

[body]`;

const BUNDLE_STEP1 = `Write a cold email pitching Voice AI + Digital Marketing bundle to {{firstName}} at {{company}}.

PITCH: "We drive the calls AND answer them." Two services:
1. Voice AI: phone answered 24/7, reservations, after-hours, overflow. Live in 48hrs.
2. Local marketing: SEO + Google Ads + social media to get more people calling.

PROSPECT: {{company}} — {{industry}} in {{city}}, {{state}} · {{rating}}⭐ · {{reviews}} reviews

RULES: Hook on city/season. 1-sentence problem. 2-sentence value (connect both services). CTA: "20-minute call?". 100-120 words. No fluff.

Output EXACTLY:
Subject: [subject]

[body]`;

const BUNDLE_STEP2 = `Follow-up (day 3) for Voice AI + Marketing bundle to {{firstName}} at {{company}}, {{city}}.
3-4 sentences. New angle. Curiosity question. Casual subject.
Output EXACTLY:
Subject: [subject]
[body]`;

const BUNDLE_STEP3 = `Break-up email (day 7) for bundle. {{firstName}} at {{company}}, {{city}}. 2 sentences. Easy out. Short subject.
Output EXACTLY:
Subject: [subject]
[body]`;

const ICEBREAKER_VOICE_AI = `Write ONLY a 1-2 sentence personalized opening line for a cold email to {{firstName}} at {{company}}, a {{industry}} in {{city}}, {{state}}.

Context: {{rating}} stars, {{reviews}} reviews. Season: {{season}} {{year}}.

Rules: Reference their city, season, or business type. Don't mention our product. 20-35 words MAX. Sounds human.

Output ONLY the icebreaker text — no labels, no quotes.`;

const ICEBREAKER_OUTSCRAPER = `Write ONLY a 1-2 sentence personalized opening icebreaker for a cold email to {{ownerFirstName || company}}.

RESTAURANT: {{company}} — {{restaurantType}} in {{city}}, {{state}}
{{rating}}⭐ · {{reviews}} reviews · open since {{foundedYear}} · {{keyAttributes}}
Season: {{season}} {{year}}

Rules:
1. Reference something SPECIFIC — their city, restaurant type, years in business ({{yearsInBusiness}}), their attributes, or the season
2. Sound like you actually know this restaurant — not generic
3. Do NOT mention our product or services at all
4. 20-40 words MAX
5. No "I noticed your restaurant" or "I came across"

Output ONLY the icebreaker text.`;

// ─── DAY 7 + DAY 14 for standard services ────────────────────────────────────

const GENERIC_DAY7 = `Write a short cold email (Day 7, 3rd touch, no reply) for Voice AI phone answering.

PROSPECT: {{firstName}} at {{company}}, {{industry}} in {{city}}

Rules: Ask ONE specific curiosity question about their situation. Offer a 60-second demo video. 40-60 words. Subject: 3-5 words, casual.

Output EXACTLY:
Subject: [subject]

[body]`;

const GENERIC_DAY14 = `Write a break-up cold email (Day 14, final touch). Warm, gracious, zero pressure. 2-3 sentences max. Leave door open.

PROSPECT: {{firstName}} at {{company}} in {{city}}

Output EXACTLY:
Subject: [3-4 words]

[2-3 sentences]`;

// ─── APOLLO/LINKEDIN CSV TEMPLATES ───────────────────────────────────────────
// For contacts exported from Apollo.io or LinkedIn Sales Navigator
// Fields available: firstName, lastName, jobTitle, company, linkedinUrl,
//                   location, website, email, industry, teamSize

const APOLLO_VOICE_AI_DAY0 = `Write a hyper-personalized cold email selling Voice AI phone answering to {{firstName}} at {{company}}.

WHAT WE SELL: An AI that answers their phone 24/7 in their brand's voice:
- Takes reservations and handles bookings
- Answers after-hours calls instead of voicemail
- Handles call overflow during dinner rush
- Answers FAQs: hours, wait times, directions, menu
- Live in 48 hours, no hardware, cancel anytime

EVERYTHING WE KNOW ABOUT THIS PROSPECT (use it all):
- Name: {{firstName}} {{lastName}}
- Title: {{jobTitle}}
- Restaurant: {{company}} — {{industry}}
- Location: {{city}}, {{state}}
- LinkedIn: {{linkedinUrl}}
- Company size: {{teamSize}} employees
- Website: {{website}}

PERSONALIZATION RULES — THIS IS WHAT MAKES OR BREAKS THE EMAIL:
1. Use {{firstName}} by name in the opener — they gave us their name, use it
2. Their title matters: if "Co-Owner" → acknowledge the shared burden of ownership; if "Founder" → reference what they built; if "Chef/Owner" → reference the dual pressure of kitchen + front-of-house
3. Reference {{company}} and {{city}} specifically — never generic
4. Pain point: every call that goes to voicemail during a rush is money walking out the door
5. Connect the pain to their SIZE ({{teamSize}} employees = likely owner-operated = owner IS on the floor during rush = CAN'T answer the phone)
6. CTA: "Worth a 15-minute call this week?" — soft, yes/no

HARD RULES:
- Subject: max 6 words, specific to their situation
- Body: 80-100 words MAX
- NEVER start with "I" or "We"
- BANNED phrases: "hope this finds you", "I came across", "I wanted to reach out", "quick question"
- Sound like a person texting another person, not a company sending a campaign

Output EXACTLY:
Subject: [subject line]

[email body]`;

const APOLLO_VOICE_AI_DAY3 = `Write a short 3-sentence follow-up (day 3, no reply) to {{firstName}} at {{company}} in {{city}}.

Context: Day 0 email pitched Voice AI phone answering. No reply yet.

RULES:
1. New angle only — social proof: "A {{teamSize}}-person restaurant in {{state}} picked up 40 calls they would have missed last month"
2. Reference their size or type ({{industry}}) to make it feel relevant
3. No "following up", "circling back", "touching base"
4. End with a question that's easy to answer yes or no

Output EXACTLY:
Subject: [short subject]

[3 sentences]`;

const APOLLO_VOICE_AI_DAY7 = `Write a 2-sentence curiosity email (day 7, no reply) to {{firstName}} at {{company}}.

Angle: What's the cost of ONE missed reservation call per night? Math email — fast, human.
Reference their city ({{city}}) if possible.

Output EXACTLY:
Subject: [ultra short]

[2 sentences max]`;

const APOLLO_VOICE_AI_DAY14 = `Write a break-up email (day 14, final) to {{firstName}} at {{company}}.
Light. Easy out. Leave the door open. MAX 2 sentences + subject.

Output EXACTLY:
Subject: [3 words]

[2 sentences]`;

const APOLLO_ICEBREAKER = `Write ONLY a 1-2 sentence personalized opening line for {{firstName}} at {{company}}.

Use: name, title ({{jobTitle}}), company, location ({{city}}, {{state}}), size ({{teamSize}} employees).
Reference a REAL pain point for a {{teamSize}}-person {{industry}} that the owner personally feels.
Sound like a person who actually looked them up — not a template.
Output ONLY the icebreaker, no subject, no greeting.`;

// ─── TEMPLATE LOOKUP ─────────────────────────────────────────────────────────

export function getServiceTemplates(service: ServiceType, mode: EmailMode): SequenceTemplates {
  const map: Record<ServiceType, { step1: string; step2: string; step3: string; step4: string; icebreaker: string }> = {
    leadrocks_voice_ai: {
      step1: LEADROCKS_VOICE_AI_PROMPT, step2: LEADROCKS_DAY3_PROMPT,
      step3: LEADROCKS_DAY7_PROMPT,     step4: LEADROCKS_DAY14_PROMPT,
      icebreaker: LEADROCKS_ICEBREAKER_PROMPT,
    },
    outscraper_voice_ai: {
      step1: OUTSCRAPER_VOICE_AI_PROMPT, step2: OUTSCRAPER_FOLLOWUP_PROMPT,
      step3: OUTSCRAPER_DAY7_PROMPT,     step4: OUTSCRAPER_DAY14_PROMPT,
      icebreaker: ICEBREAKER_OUTSCRAPER,
    },
    outscraper_professional: {
      step1: PROFESSIONAL_SERVICES_VOICE_AI_PROMPT, step2: PROFESSIONAL_SERVICES_DAY3_PROMPT,
      step3: PROFESSIONAL_SERVICES_DAY7_PROMPT,     step4: PROFESSIONAL_SERVICES_DAY14_PROMPT,
      icebreaker: ICEBREAKER_OUTSCRAPER,
    },
    voice_ai:          { step1: VOICE_AI_STEP1,          step2: VOICE_AI_STEP2,          step3: GENERIC_DAY7, step4: GENERIC_DAY14, icebreaker: ICEBREAKER_VOICE_AI },
    digital_marketing: { step1: DIGITAL_MARKETING_STEP1, step2: DIGITAL_MARKETING_STEP2, step3: GENERIC_DAY7, step4: GENERIC_DAY14, icebreaker: ICEBREAKER_VOICE_AI },
    bundle:            { step1: BUNDLE_STEP1,             step2: BUNDLE_STEP2,            step3: GENERIC_DAY7, step4: GENERIC_DAY14, icebreaker: ICEBREAKER_VOICE_AI },
    apollo_voice_ai:   { step1: APOLLO_VOICE_AI_DAY0, step2: APOLLO_VOICE_AI_DAY3, step3: APOLLO_VOICE_AI_DAY7, step4: APOLLO_VOICE_AI_DAY14, icebreaker: APOLLO_ICEBREAKER },
    custom:            { step1: DEFAULT_EMAIL_TEMPLATE,   step2: VOICE_AI_STEP2,          step3: GENERIC_DAY7, step4: GENERIC_DAY14, icebreaker: ICEBREAKER_VOICE_AI },
  };

  const t = map[service];
  return {
    step1: mode === "icebreaker" ? t.icebreaker : t.step1,
    step2: t.step2,
    step3: t.step3,
    step4: t.step4,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    mode,
    service,
  };
}

export const DEFAULT_EMAIL_TEMPLATE = OUTSCRAPER_VOICE_AI_PROMPT;
