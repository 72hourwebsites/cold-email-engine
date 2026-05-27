// ─── Phase 4: Pattern Analyzer ─────────────────────────────────────────────
// Ingest ReachInbox campaign CSV → compute per-variant metrics
// ReachInbox exports have columns: Email, Sent, Opened, Replied, Bounced, etc.
// We map each row to which variant they received via custom columns.

export interface CampaignRow {
  email: string;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  clicked: number;
  unsubscribed: number;
  // ReachInbox custom columns carry the variant assignments
  step1Variant?: string; // A, B, C, D, E
  step2Variant?: string;
  step3Variant?: string;
  step4Variant?: string;
  // The actual email content used (for grouping)
  body?: string;
}

export interface VariantMetrics {
  step: string;
  variant: string;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  clicked: number;
  openRate: number;      // opened / sent
  replyRate: number;     // replied / sent
  bounceRate: number;    // bounced / sent
  clickRate: number;     // clicked / sent
  compositeScore: number; // weighted: reply*0.5 + open*0.2 - bounce*0.2 + click*0.1
  sampleSize: number;     // how many sends this variant has
}

export interface CampaignMetrics {
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  totalClicked: number;
  overallOpenRate: number;
  overallReplyRate: number;
  overallBounceRate: number;
  byVariant: Record<string, VariantMetrics>;
  bestVariant: { step: string; variant: string; score: number } | null;
  worstVariant: { step: string; variant: string; score: number } | null;
  recommendations: string[];
  timestamp: number;
}

// ─── REACHINBOX CSV COLUMN NAMES ──────────────────────────────────────────
// ReachInbox exports typically use these column names (case-insensitive):
// Email, Sent, Opened, Replied, Bounced, Clicked, Unsubscribed
// Custom variant columns: we look for Step1_Variant, Step2_Variant, etc.

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function detectCol(headers: string[], ...patterns: string[]): string | null {
  const normalized = headers.map(h => ({ orig: h, norm: normalizeHeader(h) }));
  for (const p of patterns) {
    const match = normalized.find(n => n.norm.includes(normalizeHeader(p)));
    if (match) return match.orig;
  }
  return null;
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? 0 : n;
}

function parsePct(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.trim().replace('%', '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n / 100;
}

// ─── CSV PARSING ──────────────────────────────────────────────────────────

export function parseReachInboxCSV(csvText: string): {
  headers: string[];
  rows: CampaignRow[];
  rawRows: Record<string, string>[];
} {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) {
    return { headers: [], rows: [], rawRows: [] };
  }

  // Parse with simple CSV handling (no external lib needed for basic ReachInbox export)
  const rawHeaders = parseCSVLine(lines[0]);
  const parsedRows: Record<string, string>[] = [];
  const campaignRows: CampaignRow[] = [];

  // Detect columns
  const sentCol = detectCol(rawHeaders, 'sent');
  const openedCol = detectCol(rawHeaders, 'opened');
  const repliedCol = detectCol(rawHeaders, 'replied');
  const bouncedCol = detectCol(rawHeaders, 'bounced');
  const clickedCol = detectCol(rawHeaders, 'clicked');
  const unsubCol = detectCol(rawHeaders, 'unsubscribed');
  const emailCol = detectCol(rawHeaders, 'email');
  const step1Col = detectCol(rawHeaders, 'step1_variant', 'step1variant');
  const step2Col = detectCol(rawHeaders, 'step2_variant', 'step2variant');
  const step3Col = detectCol(rawHeaders, 'step3_variant', 'step3variant');
  const step4Col = detectCol(rawHeaders, 'step4_variant', 'step4variant');

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { row[h] = vals[idx] || ''; });

    const sent = parseNum(row[sentCol || '']);
    // Skip rows with 0 sends
    if (sent === 0) continue;

    const opened = parseNum(row[openedCol || '']) || parsePct(row[openedCol || '']) * sent;
    const replied = parseNum(row[repliedCol || '']) || parsePct(row[repliedCol || '']) * sent;
    const bounced = parseNum(row[bouncedCol || '']) || parsePct(row[bouncedCol || '']) * sent;
    const clicked = parseNum(row[clickedCol || '']) || parsePct(row[clickedCol || '']) * sent;
    const unsubscribed = parseNum(row[unsubCol || '']) || parsePct(row[unsubCol || '']) * sent;

    parsedRows.push(row);

    const cr: CampaignRow = {
      email: row[emailCol || ''] || '',
      sent: Math.round(sent),
      opened: Math.round(opened),
      replied: Math.round(replied),
      bounced: Math.round(bounced),
      clicked: Math.round(clicked),
      unsubscribed: Math.round(unsubscribed),
      step1Variant: step1Col ? row[step1Col] : undefined,
      step2Variant: step2Col ? row[step2Col] : undefined,
      step3Variant: step3Col ? row[step3Col] : undefined,
      step4Variant: step4Col ? row[step4Col] : undefined,
    };
    campaignRows.push(cr);
  }

  return { headers: rawHeaders, rows: campaignRows, rawRows: parsedRows };
}

// ─── COMPUTE METRICS ─────────────────────────────────────────────────────

export function computeMetrics(rows: CampaignRow[]): CampaignMetrics {
  let totalSent = 0, totalOpened = 0, totalReplied = 0, totalBounced = 0, totalClicked = 0;

  // Per-variant aggregators
  const variantBuckets: Record<string, { sent: number; opened: number; replied: number; bounced: number; clicked: number }> = {};

  for (const row of rows) {
    totalSent += row.sent;
    totalOpened += row.opened;
    totalReplied += row.replied;
    totalBounced += row.bounced;
    totalClicked += row.clicked;

    // Aggregate by each step's variant
    const stepVariants: [string, string | undefined][] = [
      ['step1', row.step1Variant],
      ['step2', row.step2Variant],
      ['step3', row.step3Variant],
      ['step4', row.step4Variant],
    ];

    for (const [step, variant] of stepVariants) {
      if (!variant || variant.trim() === '') continue;
      const key = `${step}:${variant.trim().toUpperCase()}`;
      if (!variantBuckets[key]) {
        variantBuckets[key] = { sent: 0, opened: 0, replied: 0, bounced: 0, clicked: 0 };
      }
      variantBuckets[key].sent += row.sent;
      variantBuckets[key].opened += row.opened;
      variantBuckets[key].replied += row.replied;
      variantBuckets[key].bounced += row.bounced;
      variantBuckets[key].clicked += row.clicked;
    }
  }

  const byVariant: Record<string, VariantMetrics> = {};
  let bestVariant: { step: string; variant: string; score: number } | null = null;
  let worstVariant: { step: string; variant: string; score: number } | null = null;

  for (const [key, bucket] of Object.entries(variantBuckets)) {
    const [step, variant] = key.split(':');
    const sent = bucket.sent;
    if (sent === 0) continue;

    const metrics: VariantMetrics = {
      step,
      variant,
      sent,
      opened: bucket.opened,
      replied: bucket.replied,
      bounced: bucket.bounced,
      clicked: bucket.clicked,
      openRate: sent > 0 ? bucket.opened / sent : 0,
      replyRate: sent > 0 ? bucket.replied / sent : 0,
      bounceRate: sent > 0 ? bucket.bounced / sent : 0,
      clickRate: sent > 0 ? bucket.clicked / sent : 0,
      compositeScore: 0,
      sampleSize: sent,
    };

    // Weighted composite: reply matters most (50%), open 20%, -bounce 20%, click 10%
    metrics.compositeScore =
      metrics.replyRate * 0.5 +
      metrics.openRate * 0.2 -
      metrics.bounceRate * 0.2 +
      metrics.clickRate * 0.1;

    byVariant[key] = metrics;

    // Track best/worst by composite score (minimum 10 sends for significance)
    if (sent >= 10) {
      if (!bestVariant || metrics.compositeScore > bestVariant.score) {
        bestVariant = { step, variant, score: metrics.compositeScore };
      }
      if (!worstVariant || metrics.compositeScore < worstVariant.score) {
        worstVariant = { step, variant, score: metrics.compositeScore };
      }
    }
  }

  const overallOpenRate = totalSent > 0 ? totalOpened / totalSent : 0;
  const overallReplyRate = totalSent > 0 ? totalReplied / totalSent : 0;
  const overallBounceRate = totalSent > 0 ? totalBounced / totalSent : 0;

  // Generate recommendations
  const recommendations: string[] = [];

  if (totalReplied === 0 && totalSent > 0) {
    recommendations.push('No replies yet — consider refreshing signal detection or testing different opening hooks.');
  }

  if (overallBounceRate > 0.05) {
    recommendations.push(`High bounce rate (${(overallBounceRate * 100).toFixed(1)}%) — check list quality and use Reoon Power Mode.`);
  }

  if (overallOpenRate < 0.20 && totalSent > 50) {
    recommendations.push(`Low open rate (${(overallOpenRate * 100).toFixed(1)}%) — test different subject lines (shorter, curiosity-driven).`);
  }

  // Per-step recommendations
  const byStep = groupBy(byVariant, (v) => v.split(':')[0]);
  for (const [step, variants] of Object.entries(byStep)) {
    if (variants.length < 2) continue;

    const metricsList = variants.map(v => byVariant[v]);
    const best = metricsList.reduce((a, b) => a.compositeScore > b.compositeScore ? a : b);
    const worst = metricsList.reduce((a, b) => a.compositeScore < b.compositeScore ? a : b);

    if (best && worst && best.variant !== worst.variant && best.sampleSize >= 10 && worst.sampleSize >= 10) {
      const stepLabel = step.replace('step', 'Step ');
      recommendations.push(
        `${stepLabel}: Variant ${best.variant} leads with ${(best.replyRate * 100).toFixed(1)}% reply vs ${(worst.replyRate * 100).toFixed(1)}% for ${worst.variant}. Consider promoting ${best.variant}.`
      );
    }
  }

  return {
    totalSent,
    totalOpened,
    totalReplied,
    totalBounced,
    totalClicked,
    overallOpenRate,
    overallReplyRate,
    overallBounceRate,
    byVariant,
    bestVariant: bestVariant ? { ...bestVariant, score: Math.round(bestVariant.score * 1000) / 1000 } : null,
    worstVariant: worstVariant ? { ...worstVariant, score: Math.round(worstVariant.score * 1000) / 1000 } : null,
    recommendations,
    timestamp: Date.now(),
  };
}

function groupBy<T>(obj: Record<string, T>, keyFn: (k: string) => string): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const k of Object.keys(obj)) {
    const g = keyFn(k);
    if (!groups[g]) groups[g] = [];
    groups[g].push(k);
  }
  return groups;
}

// ─── SIMPLE CSV LINE PARSER ──────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
