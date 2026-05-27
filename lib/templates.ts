/**
 * Phase 2: Per-step, per-variant prompt templates.
 *
 * Each step has 5 variants (A/B/C/D/E) for A/B testing.
 * Templates use {{tokens}} resolved by buildPrompt() in prompt.ts,
 * plus signal tokens from lib/signals.ts:
 *   {{signal_hook}}     — the opener observation (e.g. "I noticed...")
 *   {{signal_pain}}     — the pain point angle
 *   {{signal_value}}    — the value proposition
 *   {{signal_type}}     — the signal name for the system prompt
 *
 * Each step has a DISTINCT format — no two steps look alike.
 */

// ─── STEP 1 (DAY 0): PATTERN INTERRUPT ───────────────────────────────────────
// Format: Observation → Curiosity question. No pitch. 50-70 words.
// Goal: Sound like a human who noticed something, not a salesperson.

export const STEP1_VARIANTS = {
  A: `Write a SHORT cold email opening — observation only, no pitch.

SIGNAL: {{signal_hook}}

PROSPECT: {{firstName}} at {{company}}, {{city}} {{state}}

RULES:
1. Open with the signal observation — like you actually saw this specific thing
2. Follow with ONE curiosity question about their phone situation
3. NO pitch. NO mention of AI, Voice AI, or what you sell.
4. 50-70 words max. Sounds like a text from a peer.
5. Subject: 3-5 words, punchy, no caps.

Output EXACTLY:
Subject: [subject]

[body — observation + one question, that's it]`,

  B: `Write a cold email opener — short observation with a compliment sandwich.

SIGNAL: {{signal_hook}}

PROSPECT: {{firstName}} at {{company}}, {{city}} {{state}}

RULES:
1. Lead with genuine compliment about something specific (menu, longevity, rating, design)
2. Then connect to the signal: "which makes me wonder..."
3. End with curiosity — not a CTA
4. 50-70 words. Warm, human. No "I wanted to reach out."
5. Subject: 3-5 words. Casual. Lowercase.

Output EXACTLY:
Subject: [subject]

[body]`,

  C: `Write a cold email that leads with a data observation about {{company}}.

SIGNAL: {{signal_hook}}

PROSPECT: {{firstName}} at {{company}} — {{city}}, {{state}}
Context: {{rating}} stars · {{reviews}} reviews

RULES:
1. Open with something specific about their data (years, reviews, rating, location)
2. Add: "which makes me think {{signal_pain}}"
3. End: "Curious — how are you handling calls right now?" — simple question
4. 55-75 words. No product mention.
5. Subject: short observation, not a pitch.

Output EXACTLY:
Subject: [subject]

[body]`,

  D: `Write a cold email opener from a peer perspective.

SIGNAL: {{signal_hook}}

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. Use "I was looking at {{company}} and noticed..."
2. Reference something specific (years, city, type of restaurant/business)
3. Ask one thoughtful question about operations
4. 50-60 words. No sales. No "I'd love to."
5. Subject: 4 words or fewer. Reads like a subject line text.

Output EXACTLY:
Subject: [subject]

[body]`,

  E: `Write a cold email that sounds like a referral or word-of-mouth.

SIGNAL: {{signal_hook}}

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "Someone mentioned you at {{company}} —..." — feels organic
2. Reference the signal casually
3. Ask if they've thought about {{signal_pain}}
4. 50-65 words. Human voice. No jargon.
5. Subject: ultra short, 2-4 words.

Output EXACTLY:
Subject: [subject]

[body]`,
};

// ─── STEP 2 (DAY 3): SOCIAL PROOF ─────────────────────────────────────────────
// Format: "Here's what happened when [similar business]..." — specific numbers.
// 70-90 words. Real case study energy. No "following up."

export const STEP2_VARIANTS = {
  A: `Write a Day 3 follow-up cold email with a specific case study.

PROSPECT: {{firstName}} at {{company}}, {{industry}} in {{city}}, {{state}}
SIGNAL: {{signal_type}}

STORY: A similar {{industry}} in {{state}} was losing calls during {{season}} rush. They set up an AI that handles after-hours and overflow. First month: 147 calls handled, 38 reservations booked directly. No extra staff.

RULES:
1. Lead with the STORY, not "following up." Never use those words.
2. Make it relevant: "similar size" or "same city" or "same type"
3. ONE result with a real number
4. End with a question: "Curious what that would look like for {{company}}?"
5. 70-90 words. Subject: different from Step 1.

Output EXACTLY:
Subject: [short subject — no "following up" variants]

[body — story + question, no pitch per se]`,

  B: `Write a Day 3 email using a "by the numbers" format.

PROSPECT: {{firstName}} at {{company}} in {{city}}

CONTEXT: Averaging {{reviews}} reviews at {{rating}} stars — you clearly care about experience.

NUMBERS TO USE:
- Restaurants using AI receptionists recover 25-40% of missed calls
- Average: 12-18 reservations per week from after-hours calls alone
- 85% of callers book when they reach a human (or human-like AI)

RULES:
1. Open with a number that relates to their situation
2. "Bet you didn't realize how many calls you're missing during rush"
3. CTA: "Want me to run a quick audit of your missed calls?"
4. 70-90 words. Peer energy, not sales.

Output EXACTLY:
Subject: [short subject]

[body]`,

  C: `Write a Day 3 email that references a COMPETITOR or PEER.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "I actually just set this up for a {{industry}} in {{state}}..."
2. Share ONE concrete result (real-sounding number)
3. "Made me think of {{company}} because you're dealing with the same thing"
4. No formal CTA — just a thought
5. 60-80 words. Understated. Confident without selling.

Output EXACTLY:
Subject: [short subject]

[body]`,

  D: `Write a Day 3 email that solves a specific operational pain.

PROSPECT: {{firstName}} at {{company}} in {{city}}
PAIN: {{signal_pain}}

RULES:
1. Open with the signal pain directly: "That thing about {{signal_pain}}..."
2. "One of our clients had the exact same issue. Here's what happened..."
3. Share one specific outcome (time saved, reservations recovered, or team impact)
4. Subject: reference the pain, not the solution
5. 70-85 words.

Output EXACTLY:
Subject: [subject referencing the pain]

[body]`,

  E: `Write a Day 3 email using a short, punchy format.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. Three short paragraphs max. Every word earns its place.
2. First sentence: observation + question
3. Second: one fact/stat that makes the question urgent
4. Third: offer a 60-second demo or quick audit
5. Subject: 3-5 words, lowercase, no exclamation
6. 60-80 words total.

Output EXACTLY:
Subject: [subject]

[body — max 3 short paragraphs]`,
};

// ─── STEP 3 (DAY 7): OBJECTION PRE-HANDLE ─────────────────────────────────────
// Format: Address "my staff handles calls fine" objection head-on.
// 60-80 words. Light, confident. Reframe the problem.

export const STEP3_VARIANTS = {
  A: `Write a Day 7 cold email that addresses the most common objection.

PROSPECT: {{firstName}} at {{company}} in {{city}}

OBJECTION: "My staff handles calls fine."

REFRAIME: They do — during open hours. What about the 47% of calls that come after closing? Or the 6 calls during dinner rush that go to voicemail because everyone's on the floor?

RULES:
1. Start with: "Most owners tell us their team handles calls fine — and they're right."
2. Then pivot to the off-hours gap
3. End with a simple question about their after-hours experience
4. 60-80 words. Confident, not defensive.
5. Subject: short, slightly contrarian.

Output EXACTLY:
Subject: [subject — short, conversational]

[body]`,

  B: `Write a Day 7 email using the "what if" reframe.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "What if you could fix {{signal_pain}} without your team doing anything different?"
2. One sentence on why this matters for their specific situation
3. No pitch — just plant the idea
4. End with an open question
5. 50-70 words. Light. Thought-provoking without being pushy.

Output EXACTLY:
Subject: [3-5 words]

[body]`,

  C: `Write a Day 7 email using humor/relatability.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "I'll keep this short — I know you're busy actually running the place."
2. Reference the signal: "{{signal_hook}}"
3. "Here's the thing — fixing it takes 48 hours and zero training for your team."
4. That's it. No hard sell. Leave the idea floating.
5. 40-60 words. Very short. Subject: 2-4 words.

Output EXACTLY:
Subject: [ultra short subject]

[body — 2-3 sentences max]`,

  D: `Write a Day 7 email that sounds like advice from a fellow operator.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "One thing I've noticed working with {{industry}}s..."
2. Frame as a pattern they should know about, not a sales pitch
3. "The ones who set up a simple after-hours line see..."
4. Specific, measurable outcome (no generic promises)
5. End: "Just something to keep in mind. No rush."
6. 60-80 words. Relaxed tone. No urgency created.

Output EXACTLY:
Subject: [short subject — like a note from a peer]

[body]`,

  E: `Write a Day 7 email that uses a specific analogy.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. Start with a relatable analogy about missing something obvious
2. Connect it to their phone situation
3. "{{company}} is probably losing reservations every week from missed calls during rush"
4. 50-70 words. One clear thought. Subject: the analogy in 3-4 words.

Output EXACTLY:
Subject: [the analogy]

[body]`,
};

// ─── STEP 4 (DAY 14): BREAKUP ─────────────────────────────────────────────────
// Format: Generous exit with a useful resource. 50-70 words.
// No pressure. Leave door open. Give something valuable.

export const STEP4_VARIANTS = {
  A: `Write a Day 14 break-up email — generous exit.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "I'll close your file — no pressure at all."
2. Leave them with ONE useful thing: a link to a restaurant call statistics report or relevant article
3. "If the timing ever changes, you know where to find me."
4. 40-60 words. Warm. Zero guilt.
5. Subject: 2-3 words. Gentle.

Output EXACTLY:
Subject: [2-3 word subject]

[body]`,

  B: `Write a Day 14 email — soft ask with a resource.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "Last note from me — I promise."
2. Leave them with a specific data point about phone call patterns for their type of business
3. "If you ever want to know how many calls {{company}} is missing, I can show you in 60 seconds. No strings."
4. 50-65 words. Light. Open-ended.
5. Subject: "worth knowing" or similar gentle close.

Output EXACTLY:
Subject: [2-3 word subject]

[body]`,

  C: `Write a Day 14 email — the "one thing" format.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "One last thing before I go silent..."
2. Give them ONE genuinely useful piece of information about their industry
3. Acknowledge the timing might not be right
4. "Door's open whenever."
5. 40-60 words. This email should feel like a gift, not a pitch.

Output EXACTLY:
Subject: [2-3 words]

[body]`,

  D: `Write a Day 14 email — referral ask (light).

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "Closing out — genuinely enjoyed looking into {{company}}."
2. "If {{company}} isn't the right fit, any other {{industry}} owners you know who might be dealing with phone overflow?"
3. One line about what you'd offer them (quick, 48-hour setup)
4. 40-60 words. Feels like a conversation, not a sales script.
5. Subject: 2-3 words.

Output EXACTLY:
Subject: [2-3 word subject]

[body]`,

  E: `Write a Day 14 email — the stats drop.

PROSPECT: {{firstName}} at {{company}} in {{city}}

RULES:
1. "One data point worth knowing before I go:"
2. Drop one specific, honest stat about missed calls or reservation patterns
3. "If that number surprises you, happy to show you exactly what {{company}} is missing."
4. 40-60 words. Data-forward. No fluff. No guilt.
5. Subject: the stat itself (3-5 words).

Output EXACTLY:
Subject: [the stat]

[body]`,
};

// ─── SYSTEM PROMPTS PER STEP ──────────────────────────────────────────────────

export const STEP_SYSTEM_PROMPTS: Record<string, string> = {
  step1: `You are a peer in the restaurant/hospitality industry who noticed something interesting about a specific business.
You write SHORT, conversational emails that sound like a text from someone who actually knows the industry.
NO jargon. NO buzzwords. NO sales language.
You do NOT pitch anything in Step 1 — just an observation and a curiosity question.
The recipient should think "huh, this person actually looked at my business."`,

  step2: `You are sharing a specific case study or data point that's relevant to the prospect.
Be CONCRETE with numbers — avoid generic praise.
Write like you're telling a story to a peer over coffee.
Never use "following up", "circling back", or "checking in."
Every email should feel like a new thought, not a reminder.`,

  step3: `You are addressing a common objection head-on — with confidence and lightness.
The tone is: "I know what you're probably thinking, and here's why it's worth reconsidering."
Never defensive. Never pushy. Plant a seed, don't force a sale.
Keep it to one clear idea per email.`,

  step4: `You are closing gracefully. No guilt. No pressure. No urgency.
Your job is to leave the prospect feeling good about the interaction, even though they didn't buy.
Leave something useful — a data point, a resource, or an open door.
This email should feel like a gift.`,
};

// ─── DEFAULT SUBJECT LINES PER STEP (fallback) ────────────────────────────────

export const STEP_SUBJECT_HINTS: Record<string, string[]> = {
  step1: [
    "{{company}} in {{city}}",
    "quick thought",
    "saw something about {{company}}",
    "{{city}} question",
    "just looked at {{company}}",
  ],
  step2: [
    "what a similar place did",
    "real numbers",
    "worth a look?",
    "related thought",
    "47 calls in a week",
  ],
  step3: [
    "fair point",
    "one more angle",
    "actually",
    "most owners say that",
    "quick reframe",
  ],
  step4: [
    "closing out",
    "one last thing",
    "worth knowing",
    "for the road",
    "no rush",
  ],
};
