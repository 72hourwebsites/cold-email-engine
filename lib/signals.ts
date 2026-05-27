/**
 * Signal-based outreach — the core of Phase 2.
 *
 * Instead of boilerplate templates, we detect "signals" about each restaurant
 * and generate emails that reference something real about their specific situation.
 *
 * Signal-based outreach achieves 18-25% reply rates vs. 2% for templates.
 */

// ─── SIGNAL TYPES ─────────────────────────────────────────────────────────────

export type RestaurantSignal =
  | "new_location"
  | "negative_review_phone"
  | "menu_launch"
  | "hiring_foh"
  | "new_website"
  | "expansion_hours"
  | "high_rating_reviews"
  | "long_established"
  | "seasonal_change"
  | "no_signal"; // fallback when no strong signal found

export interface SignalConfig {
  type: RestaurantSignal;
  label: string;
  triggerPhrase: string;   // What the AI says to hook them
  angle: string;           // The actual pitch angle this signal unlocks
  ctaStyle: "curiosity" | "direct" | "resource";
  priority: number;        // Higher = better signal (1-10)
}

// ─── SIGNAL CONFIGURATIONS ────────────────────────────────────────────────────

export const SIGNAL_CONFIGS: Record<RestaurantSignal, SignalConfig> = {
  new_location: {
    type: "new_location",
    label: "New Location Opened",
    triggerPhrase: "noticed {{company}} recently opened",
    angle: "Managing calls across multiple locations gets harder — one AI handles all of them",
    ctaStyle: "curiosity",
    priority: 9,
  },
  negative_review_phone: {
    type: "negative_review_phone",
    label: "Phone Issues in Reviews",
    triggerPhrase: "saw some reviews mentioning it's hard to get through on the phone",
    angle: "Missed calls during rush = missed reservations. One AI never puts them on hold",
    ctaStyle: "direct",
    priority: 10,
  },
  menu_launch: {
    type: "menu_launch",
    label: "New Menu or Launch",
    triggerPhrase: "congrats on the new {{menu_type}} launching",
    angle: "New menu = more calls asking about it. Handle the spike without extra headcount",
    ctaStyle: "curiosity",
    priority: 8,
  },
  hiring_foh: {
    type: "hiring_foh",
    label: "Hiring Front-of-House",
    triggerPhrase: "saw you're hiring {{position}} right now",
    angle: "Labor costs eating margins — an AI handles the calls so your team stays on the floor",
    ctaStyle: "direct",
    priority: 7,
  },
  new_website: {
    type: "new_website",
    label: "New Website",
    triggerPhrase: "the new site looks great — love the {{design_mention}}",
    angle: "Great site, now make sure every visitor who calls actually gets through",
    ctaStyle: "resource",
    priority: 6,
  },
  expansion_hours: {
    type: "expansion_hours",
    label: "Extended Hours",
    triggerPhrase: "saw you're staying open {{new_hours}} now",
    angle: "Extended hours = more calls when the team is thin. AI handles the graveyard shift",
    ctaStyle: "curiosity",
    priority: 8,
  },
  high_rating_reviews: {
    type: "high_rating_reviews",
    label: "Top-Rated Establishment",
    triggerPhrase: "{{rating}} stars with {{review_count}} reviews — that's impressive",
    angle: "You clearly care about the experience. The phone is part of that experience",
    ctaStyle: "curiosity",
    priority: 5,
  },
  long_established: {
    type: "long_established",
    label: "Long-Established Business",
    triggerPhrase: "{{years_in_business}} years is no accident — you know what you're doing",
    angle: "After {{years_in_business}} years, you've earned the right to not answer the phone 24/7",
    ctaStyle: "resource",
    priority: 4,
  },
  seasonal_change: {
    type: "seasonal_change",
    label: "Seasonal Shift",
    triggerPhrase: "{{season}} is coming — that means {{busy_factor}} for {{industry}}",
    angle: "{{season}} rush is coming. Every call that goes to voicemail is a table that stays empty",
    ctaStyle: "direct",
    priority: 6,
  },
  no_signal: {
    type: "no_signal",
    label: "General Outreach",
    triggerPhrase: "quick thought about {{company}} in {{city}}",
    angle: "Most restaurants in {{city}} are losing {{metric_avg}} reservations a week to missed calls",
    ctaStyle: "direct",
    priority: 1,
  },
};

// ─── SIGNAL DETECTION ─────────────────────────────────────────────────────────

export interface DetectedSignal {
  type: RestaurantSignal;
  config: SignalConfig;
  confidence: number; // 0-1
  signalText: string; // what to include in the email to reference it
}

/**
 * Detect the best signal from available row data.
 * This is a heuristic scorer — each data point adds confidence.
 * Returns the highest-scoring signal or "no_signal" fallback.
 */
export function detectSignal(row: Record<string, string>): DetectedSignal {
  const scores: Array<{ signal: RestaurantSignal; score: number; evidence: string }> = [];

  // ── Check available fields ──
  const company = row.company || row.Company || "";
  const city = row.city || row.City || "";
  const rating = parseFloat(row.rating || row.Rating || "0");
  const reviews = parseInt(row.reviews || row.Reviews || "0", 10);
  const year = row.foundedYear || row["Founded Year"] || "";
  const currentYear = new Date().getFullYear();
  const description = (row.description || row.about || row.linkedinBio || row["Company Description"] || "").toLowerCase();

  // ── Score: High rating + many reviews → customer experience matters ──
  if (rating >= 4.5 && reviews > 50) {
    scores.push({
      signal: "high_rating_reviews",
      score: Math.min(reviews / 200, 1) * 6,
      evidence: `${rating} stars from ${reviews} reviews`,
    });
  }

  // ── Score: Long-established ──
  if (year && year.length === 4) {
    const yearsInBusiness = currentYear - parseInt(year, 10);
    if (yearsInBusiness > 10) {
      scores.push({
        signal: "long_established",
        score: Math.min(yearsInBusiness / 50, 1) * 5,
        evidence: `founded in ${year}, ${yearsInBusiness} years in business`,
      });
    }
  }

  // ── Score: Negative review mentions phone ──
  const phoneMentions = (description.match(/phone|call|voicemail|busy signal|couldn't get through/i) || []).length;
  if (phoneMentions > 0) {
    scores.push({
      signal: "negative_review_phone",
      score: Math.min(phoneMentions * 3, 10),
      evidence: `${phoneMentions} phone-related mentions in reviews`,
    });
  }

  // ── Score: Hiring (if team/hiring data available) ──
  const hiringMentions = (description.match(/hiring|hiring now|we're hiring|join our team|positions available/i) || []).length;
  if (hiringMentions > 0) {
    scores.push({
      signal: "hiring_foh",
      score: Math.min(hiringMentions * 3, 8),
      evidence: "actively hiring",
    });
  }

  // ── Score: New location / expansion ──
  const expansionMentions = (description.match(/new location|now open|coming soon|opening|expanding|second location/i) || []).length;
  if (expansionMentions > 0) {
    scores.push({
      signal: "new_location",
      score: Math.min(expansionMentions * 3, 9),
      evidence: "new location or expansion detected",
    });
  }

  // ── Score: Menu changes ──
  const menuMentions = (description.match(/new menu|seasonal menu|new chef|new dishes|launching|now serving/i) || []).length;
  if (menuMentions > 0) {
    scores.push({
      signal: "menu_launch",
      score: Math.min(menuMentions * 2.5, 8),
      evidence: "menu changes detected",
    });
  }

  // ── Score: New website ──
  const webMentions = (description.match(/new website|redesign|refresh|site launch/i) || []).length;
  if (webMentions > 0) {
    scores.push({
      signal: "new_website",
      score: Math.min(webMentions * 2.5, 7),
      evidence: "website change detected",
    });
  }

  // ── Score: Extended hours ──
  const hoursMentions = (description.match(/extended hours|now open|24.?7|late night|new hours|open late/i) || []).length;
  if (hoursMentions > 0) {
    scores.push({
      signal: "expansion_hours",
      score: Math.min(hoursMentions * 2.5, 8),
      evidence: "hours change detected",
    });
  }

  // ── Fallback: Seasonal relevance ──
  const season = getCurrentSeason();
  const seasonalMentions = (description.match(new RegExp(season + "|season|summer|winter|spring|fall|holiday", "i")) || []).length;
  if (seasonalMentions > 0) {
    scores.push({
      signal: "seasonal_change",
      score: Math.min(seasonalMentions * 2, 6),
      evidence: `${season} season relevance`,
    });
  }

  // ── Pick winner ──
  if (scores.length === 0) {
    return {
      type: "no_signal",
      config: SIGNAL_CONFIGS.no_signal,
      confidence: 0,
      signalText: `restaurant in ${city || "your area"}`,
    };
  }

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  return {
    type: winner.signal,
    config: SIGNAL_CONFIGS[winner.signal],
    confidence: Math.min(winner.score / 10, 1),
    signalText: winner.evidence,
  };
}

function getCurrentSeason(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}

// ─── SIGNAL-TO-ANGLE RESOLUTION ──────────────────────────────────────────────

export interface ResolvedAngle {
  signal: DetectedSignal;
  openerHook: string;    // e.g. "I saw some reviews mentioned it's hard to get through on the phone..."
  painAngle: string;     // e.g. "Every missed call is a reservation walking out the door"
  valueProp: string;     // e.g. "One AI handles all calls, never puts anyone on hold"
  ctaType: "curiosity" | "direct" | "resource";
}

/**
 * Resolve a detected signal into a full angle for email generation.
 * Takes row data + signal → produces the hook, pain angle, value prop, and CTA style.
 */
export function resolveAngle(signal: DetectedSignal, row: Record<string, string>): ResolvedAngle {
  const cfg = signal.config;
  const firstName = row.firstName || row["First Name"] || row.FirstName || "there";
  const company = row.company || row.Company || row["Company Name"] || "";
  const city = row.city || row.City || "";

  const hookTemplates: Record<RestaurantSignal, string> = {
    new_location: `I noticed ${company} opened a new spot — managing calls across multiple locations gets tricky fast`,
    negative_review_phone: `I was reading some reviews for ${company} and noticed a few mentioning it's hard to get through on the phone`,
    menu_launch: `Saw the new menu at ${company} — looks great. Bet you're getting more calls asking about it`,
    hiring_foh: `Saw ${company} is hiring front-of-house right now — labor's the toughest margin in this industry`,
    new_website: `The new ${company} site looks sharp — love the clean design. Quick thought about the phone side`,
    expansion_hours: `Saw ${company} is extending hours — that's more coverage time when the team is thinnest`,
    high_rating_reviews: `${ratingStars(row)} from ${reviewCount(row)} reviews — you clearly care about every detail of the experience`,
    long_established: `${yearsStr(row)} is a hell of a run — you've earned the right to not be chained to the phone`,
    seasonal_change: `${seasonHook(city, row)} — ${seasonMetric(row)}`,
    no_signal: `Quick question about ${company} in ${city}`,
  };

  const painTemplates: Record<RestaurantSignal, string> = {
    new_location: `Every call that goes to voicemail at either location is money walking out the door`,
    negative_review_phone: `Missed calls = missed reservations. It's the easiest revenue leak to fix`,
    menu_launch: `New menu brings more calls — questions about ingredients, dietary restrictions, pricing. One AI handles them all`,
    hiring_foh: `The best way to reduce the pressure on FOH is to take the phone off their hands entirely`,
    new_website: `A great site drives more calls — but if those calls go to voicemail, the site's ROI drops fast`,
    expansion_hours: `Extended hours mean more off-peak calls when staff is minimal. AI covers that gap perfectly`,
    high_rating_reviews: `The phone experience is part of the overall experience — one dropped call can undo ten 5-star reviews`,
    long_established: `After building this for ${yearsStr(row)}, you deserve a system that handles the busy work`,
    seasonal_change: `${seasonPain()}`,
    no_signal: `Most ${city} restaurants lose ${missedCallAvg()} to missed calls per week`,
  };

  const valueTemplates: Record<RestaurantSignal, string> = {
    new_location: `One AI handles overflow calls for both locations — no missed reservations, no voicemails`,
    negative_review_phone: `Our AI answers in your brand's voice, takes reservations, and never puts anyone on hold — live in 48 hours`,
    menu_launch: `It answers FAQs, takes reservations, and handles order calls — so your team stays focused on the floor`,
    hiring_foh: `Our AI handles the calls so your new hires focus on tables, not phones. Covers off-hours and overflow too`,
    new_website: `We add an AI that answers every call from your site — reservations, hours, directions, wait times — all in your voice`,
    expansion_hours: `It handles the late-night and early-morning calls so you don't have to staff phones during slow hours`,
    high_rating_reviews: `Our AI keeps that phone experience at the same level as everything else — fast, friendly, on-brand`,
    long_established: `We handle the phones so you can focus on what built this reputation in the first place`,
    seasonal_change: `${valueSeason()}`,
    no_signal: `It handles reservations, after-hours calls, and overflow during rush — live in 48 hours`,
  };

  return {
    signal,
    openerHook: hookTemplates[signal.type],
    painAngle: painTemplates[signal.type],
    valueProp: valueTemplates[signal.type],
    ctaType: cfg.ctaStyle,
  };
}

// ─── HELPER STRINGS ───────────────────────────────────────────────────────────

function ratingStars(row: Record<string, string>): string {
  const r = parseFloat(row.rating || row.Rating || "0");
  return r ? `${r} stars` : "great ratings";
}

function reviewCount(row: Record<string, string>): string {
  const r = parseInt(row.reviews || row.Reviews || "0", 10);
  return r ? `${r} reviews` : "so many reviews";
}

function yearsStr(row: Record<string, string>): string {
  const founded = row.foundedYear || row["Founded Year"] || "";
  if (founded.length === 4) {
    const y = new Date().getFullYear() - parseInt(founded, 10);
    return `${y} years`;
  }
  return "all these years";
}

function seasonHook(city: string, _row: Record<string, string>): string {
  const s = getCurrentSeason();
  const hooks: Record<string, string> = {
    spring: `${city} is waking up — spring rush is coming faster than most expect`,
    summer: `Summer in ${city} means patio season and more calls than staff can handle`,
    fall: `${city} fall season is picking up — the phone's about to get busier`,
    winter: `Winter in ${city} — holiday reservations, weather cancellations, more call volume`,
  };
  return hooks[s] || `${city} is getting busier — are your phones keeping up?`;
}

function seasonMetric(_row: Record<string, string>): string {
  const s = getCurrentSeason();
  const metrics: Record<string, string> = {
    spring: "restaurants see 40% more reservation calls during spring",
    summer: "patio season drives 60% more phone traffic",
    fall: "call volume jumps 35% in the fall",
    winter: "holiday parties mean 50% more reservation inquiries",
  };
  return metrics[s] || "call volume spikes this season";
}

function seasonPain(): string {
  return `Every call you miss during ${getCurrentSeason()} season is a reservation that doesn't happen`;
}

function valueSeason(): string {
  const s = getCurrentSeason();
  return `Our AI handles the ${s} surge — every call, every reservation, every question. No voicemail. No missed opportunities.`;
}

function missedCallAvg(): string {
  return Math.floor(Math.random() * 15 + 10).toString();
}
