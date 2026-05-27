/**
 * Phase 5: A/B Testing Framework
 *
 * Formalizes the 5-variant-per-step system with:
 *  - Testable element configurations (subject style, opening, CTA, length, tone)
 *  - Random assignment with CSV logging
 *  - Statistical winner promotion (90% confidence, z-test)
 *  - Lessons learned report generation
 *
 * Integrates with Phase 4 dashboard (pattern-analyzer metrics)
 * and Phase 2 template system (STEP1_VARIANTS through STEP4_VARIANTS).
 */

// ─── TESTABLE ELEMENTS ───────────────────────────────────────────────────────
// Each step tests different dimensions. Elements define what varies between
// variants A-E within a step — the LLM prompt templates in templates.ts
// already handle the actual copy, but these configs describe what aspect
// each variant is testing.

export type SubjectStyle = "curiosity" | "observation" | "pain_ref" | "data_drop" | "question";
export type OpeningStyle = "compliment" | "problem_signal" | "peer_referral" | "data_observation" | "curiosity_question";
export type CtaType = "direct_question" | "resource_offer" | "calendar_link" | "audit_offer" | "open_question";
export type LengthClass = "short" | "medium" | "long";
export type ToneStyle = "professional" | "peer_to_peer" | "playful" | "understated" | "direct";

export interface TestElementConfig {
  variant: string; // A through E
  subjectStyle: SubjectStyle;
  openingStyle: OpeningStyle;
  ctaType: CtaType;
  lengthClass: LengthClass;
  toneStyle: ToneStyle;
  description: string; // Human-readable summary of what this variant tests
}

// The variants in templates.ts are A/B/C/D/E per step. These configs map
// each letter to the element strategies it employs. Two variants CAN share
// the same element type (e.g., both use "curiosity" subject) but differ
// in others — the point is to isolate which element combinations win.

// Phase 5 testable element definitions
export type TestElement =
  | "subject_style"
  | "opening_style"
  | "cta_type"
  | "length_class"
  | "tone_style";

export const ELEMENT_LABELS: Record<TestElement, string> = {
  subject_style: "Subject Line Style",
  opening_style: "Opening Line Style",
  cta_type: "Call to Action Type",
  length_class: "Email Length",
  tone_style: "Tone of Voice",
};

// Standard element options and their letter mapping
export const ELEMENT_OPTIONS: Record<TestElement, { letter: string; label: string }[]> = {
  subject_style: [
    { letter: "A", label: "Curiosity — open-ended teaser" },
    { letter: "B", label: "Observation — specific to their business" },
    { letter: "C", label: "Pain reference — name a problem they have" },
    { letter: "D", label: "Data drop — a surprising stat" },
    { letter: "E", label: "Question — direct ask in the subject" },
  ],
  opening_style: [
    { letter: "A", label: "Compliment — praise something specific" },
    { letter: "B", label: "Problem signal — reference detected signal" },
    { letter: "C", label: "Peer referral — word of mouth framing" },
    { letter: "D", label: "Data observation — lead with numbers" },
    { letter: "E", label: "Curiosity question — ask then answer" },
  ],
  cta_type: [
    { letter: "A", label: "Direct question — 'Worth a quick look?'" },
    { letter: "B", label: "Resource offer — 'Happy to send a demo video'" },
    { letter: "C", label: "Calendar link — 'Wanna find 15 minutes?'" },
    { letter: "D", label: "Audit offer — 'Want a free missed-call audit?'" },
    { letter: "E", label: "Open question — 'What does that look like for you?'" },
  ],
  length_class: [
    { letter: "A", label: "Short (40-60 words) — tight, punchy" },
    { letter: "B", label: "Medium (60-80 words) — standard" },
    { letter: "C", label: "Medium (60-80 words) — standard" },
    { letter: "D", label: "Long (80-100 words) — more detail" },
    { letter: "E", label: "Long (80-100 words) — more detail" },
  ],
  tone_style: [
    { letter: "A", label: "Professional — polished, respectful" },
    { letter: "B", label: "Peer-to-peer — like a fellow operator" },
    { letter: "C", label: "Playful — light, occasionally funny" },
    { letter: "D", label: "Understated — quiet confidence, minimal" },
    { letter: "E", label: "Direct — straight to the point, no warm-up" },
  ],
};

/**
 * Per-step test configurations mapping the 5 variants (A-E) to tested elements.
 * These describe WHAT each variant tests, not the prompt itself (those live in templates.ts).
 */
export const STEP_ELEMENT_CONFIGS: Record<string, TestElementConfig[]> = {
  step1: [
    { variant: "A", subjectStyle: "curiosity", openingStyle: "compliment", ctaType: "open_question", lengthClass: "short", toneStyle: "peer_to_peer", description: "Curiosity opener + compliment → short & peer-like" },
    { variant: "B", subjectStyle: "observation", openingStyle: "compliment", ctaType: "open_question", lengthClass: "short", toneStyle: "peer_to_peer", description: "Observation subject + compliment → short & peer-like" },
    { variant: "C", subjectStyle: "data_drop", openingStyle: "data_observation", ctaType: "open_question", lengthClass: "medium", toneStyle: "understated", description: "Data-driven subject + data observation → standard & understated" },
    { variant: "D", subjectStyle: "pain_ref", openingStyle: "problem_signal", ctaType: "direct_question", lengthClass: "short", toneStyle: "direct", description: "Pain reference subject + problem signal → short & direct" },
    { variant: "E", subjectStyle: "curiosity", openingStyle: "peer_referral", ctaType: "open_question", lengthClass: "medium", toneStyle: "professional", description: "Curiosity subject + referral framing → standard & professional" },
  ],
  step2: [
    { variant: "A", subjectStyle: "data_drop", openingStyle: "problem_signal", ctaType: "direct_question", lengthClass: "long", toneStyle: "understated", description: "Data subject + problem signal + direct ask → long & understated" },
    { variant: "B", subjectStyle: "data_drop", openingStyle: "data_observation", ctaType: "audit_offer", lengthClass: "medium", toneStyle: "peer_to_peer", description: "Data subject + numbers + audit offer → standard & peer-like" },
    { variant: "C", subjectStyle: "observation", openingStyle: "peer_referral", ctaType: "direct_question", lengthClass: "medium", toneStyle: "understated", description: "Reference a peer + direct ask → standard & understated" },
    { variant: "D", subjectStyle: "pain_ref", openingStyle: "problem_signal", ctaType: "resource_offer", lengthClass: "medium", toneStyle: "professional", description: "Pain subject + signal + resource offer → standard & professional" },
    { variant: "E", subjectStyle: "question", openingStyle: "curiosity_question", ctaType: "audit_offer", lengthClass: "short", toneStyle: "direct", description: "Question subject + curiosity + audit offer → short & direct" },
  ],
  step3: [
    { variant: "A", subjectStyle: "pain_ref", openingStyle: "compliment", ctaType: "direct_question", lengthClass: "medium", toneStyle: "professional", description: "Objection reframe + compliment → standard & professional" },
    { variant: "B", subjectStyle: "question", openingStyle: "curiosity_question", ctaType: "open_question", lengthClass: "short", toneStyle: "understated", description: "\"What if\" question + curiosity → short & understated" },
    { variant: "C", subjectStyle: "curiosity", openingStyle: "compliment", ctaType: "resource_offer", lengthClass: "short", toneStyle: "playful", description: "Humor/relatability + compliment + resource → short & playful" },
    { variant: "D", subjectStyle: "observation", openingStyle: "peer_referral", ctaType: "open_question", lengthClass: "medium", toneStyle: "peer_to_peer", description: "Fellow operator framing + observation → standard & peer-like" },
    { variant: "E", subjectStyle: "data_drop", openingStyle: "problem_signal", ctaType: "direct_question", lengthClass: "short", toneStyle: "direct", description: "Analogy + problem signal + direct → short & direct" },
  ],
  step4: [
    { variant: "A", subjectStyle: "observation", openingStyle: "compliment", ctaType: "resource_offer", lengthClass: "short", toneStyle: "professional", description: "Generous exit + compliment + resource → short & professional" },
    { variant: "B", subjectStyle: "data_drop", openingStyle: "data_observation", ctaType: "audit_offer", lengthClass: "medium", toneStyle: "understated", description: "Data drop + numbers + audit offer → standard & understated" },
    { variant: "C", subjectStyle: "curiosity", openingStyle: "compliment", ctaType: "resource_offer", lengthClass: "short", toneStyle: "peer_to_peer", description: "\"One last thing\" + compliment + resource → short & peer-like" },
    { variant: "D", subjectStyle: "observation", openingStyle: "peer_referral", ctaType: "open_question", lengthClass: "short", toneStyle: "peer_to_peer", description: "Referral ask + peer framing + open question → short & peer-like" },
    { variant: "E", subjectStyle: "data_drop", openingStyle: "data_observation", ctaType: "audit_offer", lengthClass: "short", toneStyle: "direct", description: "Stats drop + data observation + audit offer → short & direct" },
  ],
};

// ─── RANDOM ASSIGNMENT ────────────────────────────────────────────────────────
// Generates stable per-contact variant assignments.

export interface VariantAssignment {
  email: string;
  step1Variant: string; // A-E
  step2Variant: string;
  step3Variant: string;
  step4Variant: string;
  // Human-readable breakdown
  step1Config: TestElementConfig;
  step2Config: TestElementConfig;
  step3Config: TestElementConfig;
  step4Config: TestElementConfig;
}

/**
 * Deterministic assignment based on email hash.
 * Same email always gets same variant for same step — enables stable
 * tracking across campaigns without needing a database.
 */
function hashEmail(email: string, salt: string): number {
  let hash = 0;
  const combined = email.toLowerCase().trim() + salt;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Assign a variant (A-E) for a given step to a contact.
 * Deterministic based on email + step name — same contact always
 * gets the same variant for the same step across campaign runs.
 */
export function assignVariant(email: string, step: string): string {
  const variants = ["A", "B", "C", "D", "E"];
  const idx = hashEmail(email, step) % variants.length;
  return variants[idx];
}

/**
 * Generate full assignment matrix for a batch of emails.
 * Returns both the choices and the element configs for dashboard display.
 */
export function assignAllVariants(emails: string[]): VariantAssignment[] {
  const steps = ["step1", "step2", "step3", "step4"];
  return emails.map(email => {
    const assignments: Record<string, string> = {};
    const configs: Record<string, TestElementConfig> = {};
    for (const step of steps) {
      const v = assignVariant(email, step);
      assignments[step] = v;
      const variantConfigs = STEP_ELEMENT_CONFIGS[step];
      configs[step] = variantConfigs.find(c => c.variant === v) || variantConfigs[0];
    }
    return {
      email,
      step1Variant: assignments.step1,
      step2Variant: assignments.step2,
      step3Variant: assignments.step3,
      step4Variant: assignments.step4,
      step1Config: configs.step1,
      step2Config: configs.step2,
      step3Config: configs.step3,
      step4Config: configs.step4,
    };
  });
}

/**
 * Generate CSV rows variant assignment columns.
 * Returns a header row + data rows ready for ReachInbox import.
 */
export function assignmentsToCSV(assignments: VariantAssignment[]): string {
  const headers = ["Email", "Step1_Variant", "Step2_Variant", "Step3_Variant", "Step4_Variant",
    "Step1_SubjectStyle", "Step1_OpeningStyle", "Step1_CTAType", "Step1_LengthClass", "Step1_ToneStyle",
    "Step2_SubjectStyle", "Step2_OpeningStyle", "Step2_CTAType", "Step2_LengthClass", "Step2_ToneStyle",
    "Step3_SubjectStyle", "Step3_OpeningStyle", "Step3_CTAType", "Step3_LengthClass", "Step3_ToneStyle",
    "Step4_SubjectStyle", "Step4_OpeningStyle", "Step4_CTAType", "Step4_LengthClass", "Step4_ToneStyle",
  ];
  const rows = assignments.map(a => [
    a.email,
    a.step1Variant, a.step2Variant, a.step3Variant, a.step4Variant,
    a.step1Config.subjectStyle, a.step1Config.openingStyle, a.step1Config.ctaType, a.step1Config.lengthClass, a.step1Config.toneStyle,
    a.step2Config.subjectStyle, a.step2Config.openingStyle, a.step2Config.ctaType, a.step2Config.lengthClass, a.step2Config.toneStyle,
    a.step3Config.subjectStyle, a.step3Config.openingStyle, a.step3Config.ctaType, a.step3Config.lengthClass, a.step3Config.toneStyle,
    a.step4Config.subjectStyle, a.step4Config.openingStyle, a.step4Config.ctaType, a.step4Config.lengthClass, a.step4Config.toneStyle,
  ].map(v => {
    const s = String(v);
    return s.includes(",") ? `"${s}"` : s;
  }).join(","));
  return [headers.join(","), ...rows].join("\n");
}

// ─── STATISTICAL WINNER PROMOTION ─────────────────────────────────────────────
// Uses a z-test for proportions to determine statistical significance at 90% confidence.

export interface VariantStat {
  variant: string;
  step: string;
  sampleSize: number;
  replies: number;
  replyRate: number; // 0-1
  opens: number;
  openRate: number;
  bounces: number;
  bounceRate: number;
  compositeScore: number; // From Phase 4 formula
}

export interface WinnerResult {
  step: string;
  winningVariant: string | null; // null = no clear winner
  winnerConfig: TestElementConfig | null;
  confidencePct: number; // 0-100
  runnerUpVariant: string | null;
  runnerUpRate: number;
  winnerRate: number;
  sampleSizeTotal: number;
  recommendation: string;
}

export interface LessonsLearned {
  overview: string;
  perStepResults: WinnerResult[];
  topSubjectStyles: { style: string; avgReplyRate: number; count: number }[];
  topOpeningStyles: { style: string; avgReplyRate: number; count: number }[];
  topCtaTypes: { style: string; avgReplyRate: number; count: number }[];
  topToneStyles: { style: string; avgReplyRate: number; count: number }[];
  recommendations: string[];
  generatedAt: string;
}

const Z_90 = 1.645; // z-critical for 90% confidence (one-tailed)

/**
 * Two-proportion z-test for statistical significance.
 * Returns the z-score — if > Z_90, the winner is significant at 90% confidence.
 */
function zTest(p1: number, n1: number, p2: number, n2: number): number {
  const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
  if (pPool === 0 || pPool === 1) return 0;
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

/**
 * Determine the winning variant for a single step.
 * Minimum 50 sends per variant required before comparison.
 * Returns the winner only if statistically significant at 90% confidence.
 */
export function determineWinner(variants: VariantStat[]): WinnerResult {
  const step = variants[0]?.step || "unknown";

  // Filter to variants with minimum sample size
  const eligible = variants.filter(v => v.sampleSize >= 50);
  if (eligible.length < 2) {
    return {
      step,
      winningVariant: null,
      winnerConfig: null,
      confidencePct: 0,
      runnerUpVariant: null,
      runnerUpRate: 0,
      winnerRate: 0,
      sampleSizeTotal: variants.reduce((s, v) => s + v.sampleSize, 0),
      recommendation: eligible.length === 0
        ? `Insufficient data: all variants have <50 sends.`
        : `Only one variant has ≥50 sends. Continue testing for statistical significance.`,
    };
  }

  // Sort by reply rate descending
  const sorted = [...eligible].sort((a, b) => b.replyRate - a.replyRate);
  const winner = sorted[0];
  const runnerUp = sorted[1];

  const z = zTest(winner.replyRate, winner.sampleSize, runnerUp.replyRate, runnerUp.sampleSize);
  const isSignificant = z >= Z_90;

  const configs = STEP_ELEMENT_CONFIGS[step] || [];
  const winnerConfig = configs.find(c => c.variant === winner.variant) || null;

  const sampleSizeTotal = variants.reduce((s, v) => s + v.sampleSize, 0);

  // Build recommendation
  let recommendation: string;
  if (isSignificant) {
    recommendation = `Variant ${winner.variant} wins with ${(winner.replyRate * 100).toFixed(1)}% reply rate ` +
      `vs ${runnerUp.variant}'s ${(runnerUp.replyRate * 100).toFixed(1)}% (z=${z.toFixed(2)}, 90% confidence). ` +
      `Promote to default for step ${step.replace("step", "")}. ` +
      `Element breakdown: subject=${winnerConfig?.subjectStyle}, opening=${winnerConfig?.openingStyle}, ` +
      `CTA=${winnerConfig?.ctaType}, tone=${winnerConfig?.toneStyle}.`;
  } else {
    recommendation = `No statistically significant winner yet. ` +
      `${winner.variant} leads at ${(winner.replyRate * 100).toFixed(1)}% ` +
      `vs ${runnerUp.variant} at ${(runnerUp.replyRate * 100).toFixed(1)}% ` +
      `(z=${z.toFixed(2)}, need ≥${Z_90.toFixed(3)} for 90% confidence). ` +
      `Need more data — target ≥50 sends per variant.`;
  }

  return {
    step,
    winningVariant: isSignificant ? winner.variant : null,
    winnerConfig,
    confidencePct: isSignificant ? 90 : Math.min(Math.round((z / Z_90) * 90), 89),
    runnerUpVariant: runnerUp.variant,
    runnerUpRate: runnerUp.replyRate,
    winnerRate: winner.replyRate,
    sampleSizeTotal,
    recommendation,
  };
}

/**
 * Generate a full "lessons learned" report from dashboard metrics data.
 * Takes per-variant stats across all steps and produces actionable insights.
 */
export function generateLessonsLearned(allVariants: VariantStat[]): LessonsLearned {
  const steps = ["step1", "step2", "step3", "step4"];
  const perStepResults: WinnerResult[] = [];
  const allRecommendations: string[] = [];
  let totalSends = 0;
  let totalReplies = 0;

  for (const step of steps) {
    const stepVariants = allVariants.filter(v => v.step === step);
    if (stepVariants.length === 0) continue;

    totalSends += stepVariants.reduce((s, v) => s + v.sampleSize, 0);
    totalReplies += stepVariants.reduce((s, v) => s + v.replies, 0);

    const result = determineWinner(stepVariants);
    perStepResults.push(result);
    allRecommendations.push(`Step ${step.replace("step", "")}: ${result.recommendation}`);
  }

  // Element-level analysis: group by element type and variant value
  function elementBreakdown<E extends string>(
    extractor: (c: TestElementConfig) => E
  ): { style: E; avgReplyRate: number; count: number }[] {
    const grouped = new Map<E, { totalRate: number; count: number }>();
    for (const v of allVariants) {
      const step = v.step;
      const configs = STEP_ELEMENT_CONFIGS[step];
      const config = configs.find(c => c.variant === v.variant);
      if (!config) continue;
      const key = extractor(config);
      const existing = grouped.get(key) || { totalRate: 0, count: 0 };
      existing.totalRate += v.replyRate;
      existing.count++;
      grouped.set(key, existing);
    }
    return Array.from(grouped.entries())
      .map(([style, data]) => ({
        style,
        avgReplyRate: data.totalRate / data.count,
        count: data.count,
      }))
      .sort((a, b) => b.avgReplyRate - a.avgReplyRate);
  }

  const topSubjectStyles = elementBreakdown(c => c.subjectStyle);
  const topOpeningStyles = elementBreakdown(c => c.openingStyle);
  const topCtaTypes = elementBreakdown(c => c.ctaType);
  const topToneStyles = elementBreakdown(c => c.toneStyle);

  const overallReplyRate = totalSends > 0 ? totalReplies / totalSends : 0;

  const topSubject = topSubjectStyles[0];
  const topOpening = topOpeningStyles[0];
  const topCta = topCtaTypes[0];
  const topTone = topToneStyles[0];

  if (topSubject && topSubject.avgReplyRate > overallReplyRate * 1.2) {
    allRecommendations.push(`Best subject style: "${topSubject.style}" averages ${(topSubject.avgReplyRate * 100).toFixed(1)}% reply rate — use more broadly.`);
  }
  if (topOpening && topOpening.avgReplyRate > overallReplyRate * 1.2) {
    allRecommendations.push(`Best opening style: "${topOpening.style}" — leads by ${((topOpening.avgReplyRate - overallReplyRate) * 100).toFixed(1)}pp over average.`);
  }
  if (topCta && topCta.avgReplyRate > overallReplyRate * 1.2) {
    allRecommendations.push(`Best CTA type: "${topCta.style}" — strongest conversion driver.`);
  }
  if (topTone && topTone.avgReplyRate > overallReplyRate * 1.2) {
    allRecommendations.push(`Best tone: "${topTone.style}" — outperforms other tones by ${((topTone.avgReplyRate - overallReplyRate) * 100).toFixed(1)}pp.`);
  }

  // Check for worst performers
  const worstSubject = topSubjectStyles[topSubjectStyles.length - 1];
  if (worstSubject && worstSubject.avgReplyRate < overallReplyRate * 0.7) {
    allRecommendations.push(`Worst subject style: "${worstSubject.style}" averages only ${(worstSubject.avgReplyRate * 100).toFixed(1)}% — consider dropping or redesigning.`);
  }

  return {
    overview: `After ${totalSends} total sends across ${perStepResults.length} test steps, overall reply rate: ${(overallReplyRate * 100).toFixed(1)}%.`,
    perStepResults,
    topSubjectStyles: topSubjectStyles as LessonsLearned["topSubjectStyles"],
    topOpeningStyles: topOpeningStyles as LessonsLearned["topOpeningStyles"],
    topCtaTypes: topCtaTypes as LessonsLearned["topCtaTypes"],
    topToneStyles: topToneStyles as LessonsLearned["topToneStyles"],
    recommendations: allRecommendations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Archive a defeated variant's performance data for historical reference.
 */
export interface ArchivedVariant {
  variant: string;
  step: string;
  stats: VariantStat;
  wonOver: string[]; // variants it beat
  lostTo: string[];  // variants it lost to
  archivedAt: string;
}

export function archiveVariant(stats: VariantStat, allStats: VariantStat[]): ArchivedVariant {
  const sameStep = allStats.filter(v => v.step === stats.step && v.variant !== stats.variant);
  const wonOver = sameStep.filter(v => v.replyRate < stats.replyRate).map(v => v.variant);
  const lostTo = sameStep.filter(v => v.replyRate > stats.replyRate).map(v => v.variant);

  return {
    variant: stats.variant,
    step: stats.step,
    stats,
    wonOver,
    lostTo,
    archivedAt: new Date().toISOString(),
  };
}
