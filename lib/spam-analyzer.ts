/**
 * Phase 6.1 — Spam Score Checker
 *
 * Heuristic-based spam probability analysis for cold emails.
 * No external API required — checks common spam triggers client-side and server-side.
 *
 * Scores range 0-100. Flag threshold: >70 = high spam risk.
 */

const SPAM_TRIGGERS = [
  /\bfree\b/i, /\bguarantee\b/i, /\bact now\b/i, /\blimited time\b/i,
  /\bclick here\b/i, /\bbuy now\b/i, /\bdiscount\b/i, /\boffer expires\b/i,
  /\bexclusive\b/i, /\burngent\b/i, /\bdon't miss\b/i, /\border now\b/i,
  /\bclearance\b/i, /\bact fast\b/i, /\bstrictly limited\b/i,
  /\bwhile supplies last\b/i, /\bsubscribe\b/i, /\bunlimited\b/i,
  /\bcon@ct\b/i, /\bfin@nce\b/i, /\blo@n\b/i, /\bdebt\b/i,
  /\bcongratulation\b/i, /\byou'?ve won\b/i, /\bwinner\b/i,
  /\bno strings attached\b/i, /\brisk[\s-]?free\b/i,
  /\bincredible\b/i, /\bamazing\b/i, /\bdramatically\b/i,
];

const URGENCY_PHRASES = [
  /\bact (now|fast|immediately|quickly)\b/i,
  /\blimited (time|supply|offer|spots?)\b/i,
  /\bdon'?t (miss|wait|delay|lose)\b/i,
  /\bexpires?\b/i, /\bhurry\b/i, /\blast chance\b/i,
  /\bonly \d+ (left|remaining|spots?)\b/i,
  /\bwhile (supplies|stock) last\b/i,
  /\btime is running\b/i,
];

export interface SpamAnalysis {
  score: number;       // 0-100
  flags: SpamFlag[];
  threshold: number;   // default 70
  verdict: "safe" | "risky" | "high_risk";
}

export interface SpamFlag {
  name: string;
  severity: "low" | "medium" | "high";
  points: number;
  detail: string;
}

/**
 * Analyze a single email's subject + body for spam indicators.
 */
export function analyzeSpamScore(subject: string, body: string): SpamAnalysis {
  const flags: SpamFlag[] = [];
  let score = 0;

  // ── Subject checks ───────────────────────────────────────────────────

  // ALL CAPS subject
  if (subject && subject === subject.toUpperCase() && subject.length > 8) {
    flags.push({
      name: "ALL_CAPS_SUBJECT",
      severity: "high",
      points: 15,
      detail: `Subject "${subject.slice(0, 40)}..." is entirely uppercase`,
    });
    score += 15;
  }

  // Excessive punctuation in subject
  const punctCount = (subject.match(/[!?]{2,}/g) || []).length;
  if (punctCount > 0) {
    const pts = Math.min(punctCount * 5, 15);
    flags.push({
      name: "EXCESSIVE_PUNCTUATION",
      severity: "medium",
      points: pts,
      detail: `Subject has ${punctCount} instances of repeated punctuation`,
    });
    score += pts;
  }

  // Money symbols in subject
  if (/[$€£¥]/.test(subject)) {
    flags.push({
      name: "MONEY_SYMBOLS",
      severity: "medium",
      points: 10,
      detail: "Subject contains currency symbols",
    });
    score += 10;
  }

  // ── Body checks ──────────────────────────────────────────────────────

  // Spam trigger words
  const triggerMatches = new Set<string>();
  for (const re of SPAM_TRIGGERS) {
    const m = body.match(re);
    if (m) triggerMatches.add(m[0].toLowerCase());
  }
  if (triggerMatches.size > 0) {
    const pts = Math.min(triggerMatches.size * 5, 25);
    flags.push({
      name: "SPAM_TRIGGER_WORDS",
      severity: "high",
      points: pts,
      detail: `Found ${triggerMatches.size} spam triggers: ${[...triggerMatches].slice(0, 5).join(", ")}`,
    });
    score += pts;
  }

  // Urgency language
  const urgencyMatches = new Set<string>();
  for (const re of URGENCY_PHRASES) {
    const m = body.match(re);
    if (m) urgencyMatches.add(m[0].toLowerCase());
  }
  if (urgencyMatches.size > 0) {
    const pts = Math.min(urgencyMatches.size * 5, 15);
    flags.push({
      name: "URGENCY_LANGUAGE",
      severity: "medium",
      points: pts,
      detail: `Found ${urgencyMatches.size} urgency phrases`,
    });
    score += pts;
  }

  // Link count
  const linkCount = (body.match(/https?:\/\/[^\s]+/g) || []).length;
  if (linkCount > 3) {
    const pts = Math.min(linkCount * 4, 15);
    flags.push({
      name: "TOO_MANY_LINKS",
      severity: "high",
      points: pts,
      detail: `${linkCount} links found in email body`,
    });
    score += pts;
  } else if (linkCount > 1) {
    flags.push({
      name: "MULTIPLE_LINKS",
      severity: "low",
      points: 3,
      detail: `${linkCount} links in body`,
    });
    score += 3;
  }

  // Link-to-text ratio
  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 0 && linkCount > 0) {
    const ratio = linkCount / wordCount;
    if (ratio > 0.05) {
      const pts = Math.min(Math.round(ratio * 100), 10);
      flags.push({
        name: "HIGH_LINK_RATIO",
        severity: "medium",
        points: pts,
        detail: `${(ratio * 100).toFixed(1)}% of words are links`,
      });
      score += pts;
    }
  }

  // Missing personalization
  if (!body.includes("{") && !body.includes("{{")) {
    const hasNameHint = /\b(first_name|name|{{name}})\b/i.test(body);
    if (!hasNameHint) {
      flags.push({
        name: "NO_PERSONALIZATION",
        severity: "medium",
        points: 8,
        detail: "Body does not contain any personalization placeholder",
      });
      score += 8;
    }
  }

  // Excessive exclamation marks in body
  const exclaimCount = (body.match(/!/g) || []).length;
  if (exclaimCount > 3) {
    const pts = Math.min(exclaimCount * 2, 10);
    flags.push({
      name: "EXCESSIVE_EXCLAMATION",
      severity: "low",
      points: pts,
      detail: `${exclaimCount} exclamation marks in body`,
    });
    score += pts;
  }

  // Image-only concern (no text content)
  if (wordCount < 10 && linkCount === 0) {
    flags.push({
      name: "TOO_SHORT",
      severity: "low",
      points: 5,
      detail: "Email body is very short (<10 words)",
    });
    score += 5;
  }

  // ── Normalize ────────────────────────────────────────────────────────
  score = Math.min(score, 100);

  const verdict =
    score >= 70 ? "high_risk" :
    score >= 40 ? "risky" :
    "safe";

  return { score, flags, threshold: 70, verdict };
}

/**
 * Batch analyze multiple emails.
 */
export function analyzeBatch(
  emails: { subject: string; body: string; rowIndex?: number }[]
): (SpamAnalysis & { rowIndex?: number })[] {
  return emails.map(e => ({
    ...analyzeSpamScore(e.subject, e.body),
    rowIndex: e.rowIndex,
  }));
}
