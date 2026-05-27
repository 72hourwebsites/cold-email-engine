"use client";

import { useState } from "react";

const sections = [
  {
    id: "bestpractices",
    label: "📊 2026 BEST PRACTICES",
    color: "#e8ff00",
    items: [
      { stat: "75–100 words", desc: "Optimal body length. Under 50 = too thin. Over 125 = ignore zone. 80 words beats 120 by 15%." },
      { stat: "21–40 chars", desc: "Subject line sweet spot. 49.1% avg open rate. Fits mobile fully. 4–7 words." },
      { stat: "Plain text only", desc: "HTML bounce rate is 652% higher. Plain text gets 25% more replies. No images, no links except CTA." },
      { stat: "Tuesday 9–11am", desc: "Best send day + time. 30% higher engagement. Second best: Thursday 1–3pm." },
      { stat: "Day 0 / 3–5 / 7–9", desc: "3-touch sequence cadence with highest reply rate. Don't wait longer than 9 days for last touch." },
      { stat: "52% more replies", desc: "Context-based personalization (specific facts) vs. just name/company merge tags." },
      { stat: "2.76x more replies", desc: "Hyper-targeted list (tight ICP) vs. broad blast. Less = more." },
      { stat: "3–8.5% reply rate", desc: "B2B average. Good = 5%+. Excellent = 10%+. Track replies, not opens (MPP inflates opens)." },
    ],
  },
  {
    id: "personalization",
    label: "🎯 HYPER-PERSONALIZATION",
    color: "#44ff88",
    items: [
      { stat: "One specific hook", desc: "Pick ONE signal and lead with it hard. Live music → calls spike Friday nights. Happy hour → staff slammed 3-6pm. Don't mention everything." },
      { stat: "Show your research", desc: "'You've been in Tarpon Springs since 2003' > 'I noticed your restaurant'. Specific dates, ratings, features = proof you actually looked." },
      { stat: "City + season + niche", desc: "The trifecta. 'A seafood spot in FL in Spring' feels personal. Generic 'restaurant owner' doesn't." },
      { stat: "Owner first name", desc: "Using real first name from Whitepages lookup (not business name) increases reply rate 18-22%." },
      { stat: "Avoid AI patterns", desc: "Vary sentence length. Mix short punches with longer ones. Avoid perfect parallel structure. 51% of spam is AI-written now — filters detect the rhythm." },
      { stat: "No 'I noticed'", desc: "Top banned openers: 'I noticed', 'I came across', 'I saw that', 'I wanted to reach out'. Sound like a stalker, not a peer." },
      { stat: "Pain → solution", desc: "State their specific pain (missed calls during dinner rush), then the solution in 1 line. Not: features → benefits." },
    ],
  },
  {
    id: "reachinbox",
    label: "✉ REACHINBOX.AI GUIDE",
    color: "#44aaff",
    items: [
      { stat: "Variable syntax", desc: "{{firstName}} {{lastName}} {{companyName}} {{email}} — camelCase. Custom cols: capital first letter, underscore-separated, under 20 chars, max 20 custom vars." },
      { stat: "Sending limit", desc: "30–50 emails/day per inbox during warm-up. Max 100/day per address at scale. Rotate across up to 100 accounts per campaign." },
      { stat: "Warm-up minimum", desc: "2–4 weeks before launching any campaign. Start 10–20 emails/day, increase by 2/day. Never skip warm-up." },
      { stat: "Sequence setup", desc: "Add Step → set delay → add variants per step. Use conditions (if reply contains X → trigger subsequence). A/Z test automatically." },
      { stat: "Provider matching", desc: "ReachInbox sends Google→Google, Microsoft→Microsoft. Improves inbox placement significantly." },
      { stat: "Spam checker", desc: "Use built-in spam checker before launching. Replaces trigger words, scores email. Target score 90+." },
      { stat: "Unsubscribe", desc: "Add one-click unsubscribe link in footer. Set keyword triggers (e.g. 'NO', 'unsubscribe') to auto-blocklist." },
      { stat: "Import columns", desc: "CSV columns auto-map. Use: firstName, lastName, companyName, email, phone, website, city, state + any custom columns." },
    ],
  },
  {
    id: "deliverability",
    label: "🛡 DELIVERABILITY 2025",
    color: "#ff9500",
    items: [
      { stat: "SPF + DKIM + DMARC", desc: "All three required by Gmail & Outlook as of 2025. Outlook rejects 550 5.7.15 for 5k+/day senders without auth. Non-negotiable." },
      { stat: "Spam rate < 0.1%", desc: "Keep spam complaints under 0.1%. Gmail threshold is 0.3% but aim for 0.1%. One bad day can flag your domain permanently." },
      { stat: "Bounce rate < 2%", desc: "Verify email list before import. Use MailVerify or NeverBounce. Unverified lists kill domains fast." },
      { stat: "New domain ramp", desc: "Week 1: 10–20/day. Week 2-4: +20/week. After 6 weeks: 100–200/day. Never jump straight to volume." },
      { stat: "3 domains / 5 inboxes", desc: "Safe scaling formula: 5 inboxes across 3 domains = 300–500 emails/day. Don't put all eggs in one domain." },
      { stat: "Gmail 2025 change", desc: "Inbox placement dropped from 50% → 28% for high-volume senders Q1 2025. Plain text + auth + clean lists = survival." },
      { stat: "No HTML in cold email", desc: "HTML code triggers spam filters. Plain text reads as genuine person-to-person. 86.7% lower bounce rate." },
    ],
  },
  {
    id: "sequence",
    label: "🔄 SEQUENCE TEMPLATES",
    color: "#44ff88",
    items: [
      { stat: "Step 1 (Day 0)", desc: "Hook on ONE specific thing about them. Pain in 1 sentence. Value in 1-2 sentences. CTA: 'Worth 15 minutes?' — 75-100 words." },
      { stat: "Step 2 (Day 3-5)", desc: "New angle. Open with a result: 'A [type] in [state] added 22 reservations from calls they used to miss.' 3-4 sentences. Never say 'following up'." },
      { stat: "Step 3 (Day 7-9)", desc: "Break-up email. 2-3 sentences. Give easy out. One door open. Subject: 3-5 words. 'Last one from me — if timing's off, no hard feelings.'"},
      { stat: "Conditional step", desc: "If they reply with 'interested' → trigger demo sequence. If 'not now' → 90-day nurture. Set this up in ReachInbox subsequences." },
      { stat: "A/Z variants", desc: "Create 2-3 subject line variants per step. Let ReachInbox auto-optimize. Test: question vs. statement vs. their name in subject." },
    ],
  },
];

export default function IntelligencePanel() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "8px" }}>
        COLD EMAIL INTELLIGENCE — CLICK TO EXPAND
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {sections.map(s => (
          <div key={s.id}>
            <button
              onClick={() => setOpen(open === s.id ? null : s.id)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 16px",
                background: open === s.id ? "#111" : "#0d0d0d",
                border: `1px solid ${open === s.id ? s.color + "44" : "#1a1a1a"}`,
                color: open === s.id ? s.color : "#555",
                fontSize: "11px", letterSpacing: "0.5px", fontFamily: "DM Mono",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                cursor: "pointer", transition: "all 0.1s",
              }}
            >
              <span>{s.label}</span>
              <span style={{ fontSize: "10px", color: "#333" }}>{open === s.id ? "▲" : "▼"}</span>
            </button>
            {open === s.id && (
              <div style={{ background: "#080808", border: `1px solid #1a1a1a`, borderTop: "none", padding: "12px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {s.items.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <div style={{ color: s.color, fontSize: "11px", fontWeight: 500, whiteSpace: "nowrap", minWidth: "110px", marginTop: "1px" }}>
                        {item.stat}
                      </div>
                      <div style={{ color: "#555", fontSize: "11px", lineHeight: 1.5 }}>
                        {item.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
