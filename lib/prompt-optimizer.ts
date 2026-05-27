// ─── Phase 4: Prompt Optimizer ───────────────────────────────────────────
// Auto-adjust variant weights based on campaign performance.
// Reads/writes variant scoreboard to dashboard-state.json

import { VariantMetrics } from './pattern-analyzer';

export interface VariantScore {
  step: string;
  variant: string;
  weight: number;       // Selection weight (0.0 - 1.0), higher = more likely to be used
  replyRate: number;
  openRate: number;
  bounceRate: number;
  compositeScore: number;
  sampleSize: number;
  promoted: boolean;     // Was this auto-promoted from analysis?
  demoted: boolean;      // Was this auto-demoted due to poor performance?
  lastUpdated: number;
  history: { replyRate: number; sampleSize: number; timestamp: number }[];
}

export interface Scoreboard {
  variants: Record<string, VariantScore>; // key: "step1:A"
  lastUpdated: number;
  totalCampaigns: number;
}

// ─── DEFAULTS ────────────────────────────────────────────────────────────

const STEPS = ['step1', 'step2', 'step3', 'step4'];
const VARIANTS = ['A', 'B', 'C', 'D', 'E'];
const MIN_SAMPLE_SIZE = 10;     // Minimum sends before we trust a score
const WIN_THRESHOLD = 0.05;     // 5%+ reply rate = winner
const LOSE_THRESHOLD = 0.02;    // <2% reply rate = loser (consider demoting)
const MIN_WIN_MARGIN = 0.02;    // Winner needs 2%+ advantage over runner-up
const WEIGHT_BOOST = 0.3;       // How much to boost winner's weight
const WEIGHT_PENALTY = 0.3;     // How much to reduce loser's weight

export function createDefaultScoreboard(): Scoreboard {
  const variants: Record<string, VariantScore> = {};
  for (const step of STEPS) {
    for (const v of VARIANTS) {
      const key = `${step}:${v}`;
      variants[key] = {
        step,
        variant: v,
        weight: 0.2, // Equal weight (1/5 variants)
        replyRate: 0,
        openRate: 0,
        bounceRate: 0,
        compositeScore: 0,
        sampleSize: 0,
        promoted: false,
        demoted: false,
        lastUpdated: Date.now(),
        history: [],
      };
    }
  }
  return { variants, lastUpdated: Date.now(), totalCampaigns: 0 };
}

// ─── UPDATE SCOREBOARD ───────────────────────────────────────────────────

export function updateScoreboard(
  scoreboard: Scoreboard,
  variantMetrics: Record<string, VariantMetrics>
): Scoreboard {
  const updated = { ...scoreboard, variants: { ...scoreboard.variants }, lastUpdated: Date.now() };

  const now = Date.now();
  let hasChanges = false;

  for (const [key, metric] of Object.entries(variantMetrics)) {
    const existing = updated.variants[key];
    if (!existing) {
      // New variant — create entry
      updated.variants[key] = {
        step: metric.step,
        variant: metric.variant,
        weight: 0.2,
        replyRate: metric.replyRate,
        openRate: metric.openRate,
        bounceRate: metric.bounceRate,
        compositeScore: metric.compositeScore,
        sampleSize: metric.sampleSize,
        promoted: false,
        demoted: false,
        lastUpdated: now,
        history: [],
      };
      hasChanges = true;
      continue;
    }

    // Only update if sample size increased (new data)
    if (metric.sampleSize <= existing.sampleSize && existing.sampleSize > 0) continue;

    // Save history
    const historyEntry = {
      replyRate: metric.replyRate,
      sampleSize: metric.sampleSize,
      timestamp: now,
    };

    updated.variants[key] = {
      ...existing,
      replyRate: metric.replyRate,
      openRate: metric.openRate,
      bounceRate: metric.bounceRate,
      compositeScore: metric.compositeScore,
      sampleSize: metric.sampleSize,
      lastUpdated: now,
      history: [...existing.history.slice(-20), historyEntry], // Keep last 20 entries
    };

    hasChanges = true;
  }

  // Recompute weights for variants with sufficient data
  if (hasChanges) {
    recomputeWeights(updated);
    updated.totalCampaigns++;
  }

  return updated;
}

// ─── WEIGHT RECOMPUTATION ────────────────────────────────────────────────

function recomputeWeights(scoreboard: Scoreboard): void {
  const byStep = groupByStep(scoreboard.variants);

  for (const [step, variants] of Object.entries(byStep)) {
    // Only auto-adjust if at least 2 variants have data
    const withData = variants.filter(v => v.sampleSize >= MIN_SAMPLE_SIZE);
    if (withData.length < 2) {
      // Not enough data — keep equal weights
      for (const v of variants) {
        v.weight = 1 / variants.length;
        v.promoted = false;
        v.demoted = false;
      }
      continue;
    }

    // Sort by composite score
    const sorted = [...withData].sort((a, b) => b.compositeScore - a.compositeScore);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Build weight array: equal base, then boost/penalty
    const weights = new Map<string, number>();
    for (const v of variants) {
      weights.set(`${v.step}:${v.variant}`, 1.0);
    }

    for (const v of variants) {
      const key = `${v.step}:${v.variant}`;
      if (v.sampleSize < MIN_SAMPLE_SIZE) continue;

      // Boost if above win threshold and is the best
      if (v.replyRate >= WIN_THRESHOLD && v.compositeScore >= best.compositeScore - MIN_WIN_MARGIN) {
        weights.set(key, 1.0 + WEIGHT_BOOST);
        v.promoted = true;
        v.demoted = false;
      }
      // Penalize if below lose threshold and is the worst
      else if (v.replyRate < LOSE_THRESHOLD && v.compositeScore <= worst.compositeScore + MIN_WIN_MARGIN) {
        weights.set(key, Math.max(0.1, 1.0 - WEIGHT_PENALTY));
        v.promoted = false;
        v.demoted = true;
      } else {
        v.promoted = false;
        v.demoted = false;
      }
    }

    // Normalize weights to sum to 1
    const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    for (const v of variants) {
      const key = `${v.step}:${v.variant}`;
      v.weight = totalWeight > 0 ? (weights.get(key) || 1.0) / totalWeight : 1 / variants.length;
    }
  }
}

// ─── SELECT VARIANT BY WEIGHT ────────────────────────────────────────────

export function selectVariant(scoreboard: Scoreboard, step: string): string {
  const variants = Object.values(scoreboard.variants).filter(v => v.step === step);
  if (variants.length === 0) return 'A';

  const rand = Math.random();
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (rand <= cumulative) return v.variant;
  }
  return variants[variants.length - 1].variant;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────

function groupByStep(variants: Record<string, VariantScore>): Record<string, VariantScore[]> {
  const groups: Record<string, VariantScore[]> = {};
  for (const v of Object.values(variants)) {
    if (!groups[v.step]) groups[v.step] = [];
    groups[v.step].push(v);
  }
  return groups;
}
