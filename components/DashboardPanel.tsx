"use client";

import { useState, useCallback, useEffect } from "react";
import { CampaignMetrics, parseReachInboxCSV, computeMetrics } from "@/lib/pattern-analyzer";
import { Scoreboard, createDefaultScoreboard, updateScoreboard } from "@/lib/prompt-optimizer";
import { useMemo } from "react";

interface Props {
  onBack: () => void;
  onNext?: () => void;
}

function fmt(num: number, decimals = 1): string {
  return (num * 100).toFixed(decimals);
}

function pctColor(rate: number, good: number, warn: number): string {
  if (rate >= good) return "#44ff88";
  if (rate >= warn) return "#e8ff00";
  return "#ff3b3b";
}

export default function DashboardPanel({ onBack, onNext }: Props) {
  const [csvText, setCsvText] = useState("");
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [scoreboard, setScoreboard] = useState<Scoreboard>(createDefaultScoreboard());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<"replyRate" | "compositeScore" | "openRate">("compositeScore");

  // Load saved scoreboard on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const data = await res.json();
          if (data.scoreboard) {
            setScoreboard(data.scoreboard);
          }
        }
      } catch {}
    })();
  }, []);

  // Save scoreboard when it changes
  useEffect(() => {
    if (scoreboard.totalCampaigns > 0) {
      fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreboard }),
      }).catch(() => {});
    }
  }, [scoreboard]);

  const handleAnalyze = useCallback(() => {
    if (!csvText.trim()) {
      setError("Paste campaign data first.");
      return;
    }
    setLoading(true);
    setError("");

    // Simulate async (parsing is sync but gives UI time to update)
    setTimeout(() => {
      try {
        const { rows, rawRows } = parseReachInboxCSV(csvText);
        if (rows.length === 0) {
          setError("No valid rows found. Check the CSV format (headers: Email, Sent, Opened, Replied, Bounced).");
          setLoading(false);
          return;
        }

        const campaignMetrics = computeMetrics(rows);

        // Update variance scoreboard
        const updated = updateScoreboard(scoreboard, campaignMetrics.byVariant);
        setScoreboard(updated);
        setMetrics(campaignMetrics);

        if (rawRows.length > 0) {
          // Also save any raw data for future reference
          localStorage.setItem("dashboard_last_csv", csvText.slice(0, 5000));
        }
      } catch (e) {
        setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
      }
      setLoading(false);
    }, 50);
  }, [csvText, scoreboard]);

  const handleLoadSample = useCallback(async () => {
    setLoading(true);
    setError("");

    // Try to load actual campaign data if we have any generated emails
    try {
      // Simulate sample ReachInbox data
      const sampleCSV = [
        '"Email","Sent","Opened","Replied","Bounced","Clicked","Unsubscribed","Step1_Variant","Step2_Variant"',
        '"owner@restaurant1.com","4","2","1","0","0","0","A","B"',
        '"info@cafe2.com","4","1","0","1","0","0","B","A"',
        '"hello@diner3.com","4","3","1","0","1","0","A","A"',
        '"contact@grill4.com","4","2","0","1","0","0","C","B"',
        '"reservations@bbq5.com","4","1","1","0","0","0","B","C"',
        '"owner@bakery6.com","4","3","2","0","1","0","A","B"',
        '"info@pizzeria7.com","4","0","0","1","0","0","C","A"',
        '"hello@taqueria8.com","4","2","1","0","0","1","B","C"',
        '"contact@sushi9.com","4","1","0","1","0","0","A","B"',
        '"owner@steakhouse10.com","4","3","2","0","1","0","B","A"',
        '"info@pub11.com","4","2","1","0","0","0","C","C"',
        '"hello@cafe12.com","4","1","0","0","0","0","A","B"',
        '"contact@bistro13.com","4","2","1","1","0","0","B","A"',
        '"reservations@grill14.com","4","3","2","0","0","0","C","B"',
        '"owner@market15.com","4","1","0","1","0","0","A","C"',
        '"info@deli16.com","4","2","1","0","0","0","B","A"',
        '"hello@brewery17.com","4","0","0","0","0","0","C","B"',
        '"contact@ramen18.com","4","3","1","0","1","0","A","C"',
        '"owner@pasta19.com","4","2","0","1","0","0","B","A"',
        '"info@wings20.com","4","1","1","0","0","0","C","B"',
      ].join("\n");

      setCsvText(sampleCSV);
      const { rows } = parseReachInboxCSV(sampleCSV);
      const campaignMetrics = computeMetrics(rows);

      const updated = updateScoreboard(scoreboard, campaignMetrics.byVariant);
      setScoreboard(updated);
      setMetrics(campaignMetrics);
    } catch (e) {
      setError(`Sample error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  }, [scoreboard]);

  const handleReset = useCallback(() => {
    if (!confirm("Clear all dashboard data and variant scoreboard?")) return;
    const fresh = createDefaultScoreboard();
    setScoreboard(fresh);
    setMetrics(null);
    setCsvText("");
    setError("");
    localStorage.removeItem("dashboard_last_csv");
    fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scoreboard: fresh }),
    }).catch(() => {});
  }, []);

  // Sort variants
  const sortedVariants = useMemo(() => {
    if (!metrics) return [];
    return Object.entries(metrics.byVariant)
      .sort(([, a], [, b]) => b[sortBy] - a[sortBy]);
  }, [metrics, sortBy]);

  // Scoreboard for variant weight visualization
  const scoreboardVariants = useMemo(() => {
    return Object.values(scoreboard.variants)
      .sort((a, b) => a.step.localeCompare(b.step) || a.variant.localeCompare(b.variant));
  }, [scoreboard]);

  return (
    <div>
      {/* Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div className="syne" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
            06 — SELF-IMPROVEMENT DASHBOARD
          </div>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "4px", letterSpacing: "0.5px" }}>
            Upload ReachInbox results → auto-identify winning patterns → optimize prompts
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={handleReset}
            style={{ background: "transparent", color: "#ff3b3b", border: "1px solid #3d0000", padding: "6px 12px", fontSize: "11px" }}>
            ✕ RESET
          </button>
          {metrics && (
            <button onClick={() => { setMetrics(null); setCsvText(""); }}
              style={{ background: "#111", color: "#888", border: "1px solid #222", padding: "6px 12px", fontSize: "11px" }}>
              ← NEW ANALYSIS
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#555", fontSize: "13px" }}>
          <div style={{ fontSize: "28px", marginBottom: "10px" }}>⟳</div>
          Analyzing campaign data...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ background: "#2a0000", border: "1px solid #ff3b3b", padding: "10px 16px", marginBottom: "16px", fontSize: "12px", color: "#ff6b6b" }}>
          ✗ {error}
        </div>
      )}

      {/* Input area (before analysis) */}
      {!metrics && !loading && (
        <div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px", alignItems: "center" }}>
            <div style={{ fontSize: "12px", color: "#888" }}>Paste ReachInbox campaign CSV (export from ReachInbox → Campaigns → Export)</div>
            <button onClick={handleLoadSample}
              style={{ marginLeft: "auto", background: "#0a1a0a", color: "#44ff88", border: "1px solid #1a3a1a", padding: "6px 14px", fontSize: "11px" }}>
              ← LOAD SAMPLE DATA
            </button>
          </div>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={`Email,Sent,Opened,Replied,Bounced,Clicked,Unsubscribed,Step1_Variant,Step2_Variant\nowner@restaurant.com,4,2,1,0,0,0,A,B\n...`}
            style={{
              width: "100%", height: "160px", padding: "12px", fontSize: "12px", fontFamily: "'DM Mono', monospace",
              background: "#0a0a0a", color: "#e8e8e0", border: "1px solid #1a1a1a", resize: "vertical", lineHeight: 1.6,
            }}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <button onClick={onBack}
              style={{ background: "#111", color: "#555", border: "1px solid #222", padding: "9px 18px", fontSize: "12px" }}>
              ← BACK
            </button>
            <button onClick={handleAnalyze}
              style={{
                background: "#e8ff00", color: "#000", border: "none", padding: "9px 24px",
                fontSize: "13px", fontWeight: 500, opacity: csvText.trim() ? 1 : 0.4, cursor: csvText.trim() ? "pointer" : "not-allowed",
              }}>
              ▶ ANALYZE CAMPAIGN
            </button>
          </div>
        </div>
      )}

      {/* Dashboard results */}
      {metrics && !loading && (
        <div>
          {/* Campaign overview stat grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "#1a1a1a", marginBottom: "14px" }}>
            {[
              { label: "SENT", value: metrics.totalSent.toLocaleString(), color: "#e8ff00" },
              { label: "OPENED", value: `${metrics.totalOpened.toLocaleString()} (${fmt(metrics.overallOpenRate)}%)`, color: pctColor(metrics.overallOpenRate, 0.25, 0.15) },
              { label: "REPLIED", value: `${metrics.totalReplied.toLocaleString()} (${fmt(metrics.overallReplyRate)}%)`, color: pctColor(metrics.overallReplyRate, 0.03, 0.01) },
              { label: "BOUNCED", value: `${metrics.totalBounced.toLocaleString()} (${fmt(metrics.overallBounceRate)}%)`, color: pctColor(1 - metrics.overallBounceRate, 0.98, 0.95) },
              { label: "CLICKED", value: `${metrics.totalClicked.toLocaleString()} (${fmt(metrics.overallReplyRate)}%)`, color: "#44aaff" },
              { label: "CAMPAIGNS", value: `${scoreboard.totalCampaigns}`, color: "#888" },
              { label: "BEST VAR", value: metrics.bestVariant ? `${metrics.bestVariant.step.replace('step','S')}:${metrics.bestVariant.variant}` : "—", color: "#44ff88" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#0f0f0f", padding: "12px 14px" }}>
                <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "3px" }}>{s.label}</div>
                <div className="syne" style={{ fontSize: "16px", fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Recommendations panel */}

          {/* Phase 6.3 — Deliverability Health */}
          {(() => {
            const br = metrics.overallBounceRate;
            const oR = metrics.overallOpenRate;
            const rr = metrics.overallReplyRate;
            const sent = metrics.totalSent;

            // Composite health score 0-100
            const bounceScore = br < 0.02 ? 40 : br < 0.05 ? 30 : br < 0.10 ? 15 : 0;
            const openScore = oR > 0.30 ? 30 : oR > 0.22 ? 20 : oR > 0.15 ? 10 : 0;
            const replyScore = rr > 0.05 ? 30 : rr > 0.03 ? 20 : rr > 0.01 ? 10 : 0;
            const healthScore = bounceScore + openScore + replyScore;

            const healthLabel = healthScore >= 80 ? "EXCELLENT" : healthScore >= 60 ? "GOOD" : healthScore >= 35 ? "FAIR" : "POOR";
            const healthColor = healthScore >= 80 ? "#44ff88" : healthScore >= 60 ? "#44aaff" : healthScore >= 35 ? "#ff9500" : "#ff3b3b";

            return (
              <div style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", padding: "12px 18px", marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <span style={{ fontSize: "11px", color: "#44aaff", letterSpacing: "1px", fontWeight: 500 }}>
                    DELIVERABILITY HEALTH
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: healthColor }}>
                    {healthScore}/100 · {healthLabel}
                  </span>
                </div>

                {/* Health bar */}
                <div style={{ background: "#1a1a1a", height: "4px", borderRadius: "2px", marginBottom: "12px" }}>
                  <div style={{
                    background: healthColor,
                    height: "100%",
                    width: `${healthScore}%`,
                    borderRadius: "2px",
                    transition: "width 0.5s",
                  }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  {/* Bounce rate */}
                  <div style={{ background: "#0f0f0f", border: "1px solid #222", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "#555", letterSpacing: "1px", marginBottom: "4px" }}>BOUNCE RATE</div>
                    <div className="syne" style={{ fontSize: "20px", fontWeight: 700, color: br < 0.02 ? "#44ff88" : br < 0.05 ? "#ff9500" : "#ff3b3b" }}>
                      {fmt(br)}%
                    </div>
                    <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                      target &lt;2% · {metrics.totalBounced.toLocaleString()} of {sent.toLocaleString()}
                    </div>
                  </div>

                  {/* Open rate */}
                  <div style={{ background: "#0f0f0f", border: "1px solid #222", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "#555", letterSpacing: "1px", marginBottom: "4px" }}>OPEN RATE</div>
                    <div className="syne" style={{ fontSize: "20px", fontWeight: 700, color: oR > 0.25 ? "#44ff88" : oR > 0.15 ? "#ff9500" : "#ff3b3b" }}>
                      {fmt(oR)}%
                    </div>
                    <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                      target &gt;25% · {metrics.totalOpened.toLocaleString()} of {sent.toLocaleString()}
                    </div>
                  </div>

                  {/* Reply rate */}
                  <div style={{ background: "#0f0f0f", border: "1px solid #222", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "#555", letterSpacing: "1px", marginBottom: "4px" }}>REPLY RATE</div>
                    <div className="syne" style={{ fontSize: "20px", fontWeight: 700, color: rr > 0.03 ? "#44ff88" : rr > 0.01 ? "#ff9500" : "#ff3b3b" }}>
                      {fmt(rr)}%
                    </div>
                    <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                      target &gt;3% · {metrics.totalReplied.toLocaleString()} of {sent.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Recommendations panel */}
          {metrics.recommendations.length > 0 && (
            <div style={{ background: "#0a0a1a", border: "1px solid #1a1a3a", padding: "12px 18px", marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", color: "#44aaff", letterSpacing: "1px", marginBottom: "6px", fontWeight: 500 }}>RECOMMENDATIONS</div>
              {metrics.recommendations.map((rec, i) => (
                <div key={i} style={{ fontSize: "12px", color: "#4488aa", padding: "4px 0", borderBottom: i < metrics.recommendations.length - 1 ? "1px solid #111" : "none" }}>
                  ● {rec}
                </div>
              ))}
            </div>
          )}

          {/* Variant leaderboard */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div className="syne" style={{ fontSize: "14px", fontWeight: 700, color: "#e8e8e0" }}>VARIANT LEADERBOARD</div>
              <div style={{ display: "flex", gap: "4px" }}>
                {(["compositeScore", "replyRate", "openRate"] as const).map(key => (
                  <button key={key} onClick={() => setSortBy(key)}
                    style={{
                      padding: "4px 10px", fontSize: "10px", letterSpacing: "0.5px",
                      background: sortBy === key ? "#1a1a1a" : "transparent",
                      color: sortBy === key ? "#e8ff00" : "#444",
                      border: `1px solid ${sortBy === key ? "#2a2a2a" : "transparent"}`,
                    }}>
                    {key === "compositeScore" ? "SCORE" : key === "replyRate" ? "REPLY" : "OPEN"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#111", borderBottom: "1px solid #222" }}>
                    {["STEP", "VAR", "SENT", "OPEN", "REPLY", "BOUNCE", "SCORE", "WEIGHT", ""].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#444", fontWeight: 400, letterSpacing: "1px", fontSize: "10px", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedVariants.map(([key, v], i) => {
                    const sb = scoreboard.variants[key];
                    const weight = sb?.weight || 0;
                    const barColor = v.compositeScore > 0.03 ? "#44ff88" : v.compositeScore > 0.01 ? "#e8ff00" : "#ff3b3b";
                    const status = sb?.promoted ? "✦ WIN" : sb?.demoted ? "⚠ LAG" : "";

                    return (
                      <tr key={key}
                        style={{ borderBottom: "1px solid #111", background: i % 2 === 0 ? "#0a0a0a" : "#0d0d0d" }}>
                        <td style={{ padding: "8px 10px", color: "#888" }}>{v.step.replace('step', 'Step ')}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ fontWeight: 600, color: status === "✦ WIN" ? "#44ff88" : status === "⚠ LAG" ? "#ff9500" : "#e8e8e0" }}>
                            {v.variant}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "#555" }}>{v.sampleSize}</td>
                        <td style={{ padding: "8px 10px", color: pctColor(v.openRate, 0.3, 0.15) }}>{fmt(v.openRate)}%</td>
                        <td style={{ padding: "8px 10px", color: pctColor(v.replyRate, 0.03, 0.01) }}>{fmt(v.replyRate)}%</td>
                        <td style={{ padding: "8px 10px", color: v.bounceRate > 0.05 ? "#ff3b3b" : "#555" }}>{fmt(v.bounceRate)}%</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ color: barColor, fontWeight: 600 }}>{(v.compositeScore * 100).toFixed(1)}</span>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "40px", height: "4px", background: "#1a1a1a", borderRadius: "2px" }}>
                              <div style={{ width: `${weight * 100}%`, height: "100%", background: "#44aaff", borderRadius: "2px" }} />
                            </div>
                            <span style={{ color: "#555", fontSize: "10px" }}>{(weight * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {status && <span style={{ fontSize: "10px", color: status.includes("WIN") ? "#44ff88" : "#ff9500" }}>{status}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Weight distribution chart */}
          <div style={{ marginBottom: "14px" }}>
            <div className="syne" style={{ fontSize: "14px", fontWeight: 700, color: "#e8e8e0", marginBottom: "8px" }}>VARIANT WEIGHT DISTRIBUTION</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {(["step1", "step2", "step3", "step4"] as const).map(step => {
                const vars = scoreboardVariants.filter(v => v.step === step);
                const stepLabel = step.replace('step', 'Step ');
                return (
                  <div key={step} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", padding: "12px" }}>
                    <div style={{ fontSize: "11px", color: "#666", letterSpacing: "0.5px", marginBottom: "8px" }}>{stepLabel}</div>
                    {vars.map(v => (
                      <div key={`${v.step}:${v.variant}`} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <div style={{ width: "18px", fontSize: "11px", fontWeight: 600, color: v.promoted ? "#44ff88" : v.demoted ? "#ff9500" : "#888" }}>
                          {v.variant}{v.promoted ? "✦" : v.demoted ? "↓" : ""}
                        </div>
                        <div style={{ flex: 1, height: "14px", background: "#1a1a1a", borderRadius: "2px", position: "relative" }}>
                          <div style={{
                            width: `${v.weight * 100}%`, height: "100%",
                            background: v.promoted ? "#44ff88" : v.demoted ? "#ff9500" : "#2a2a2a",
                            borderRadius: "2px", transition: "width 0.3s",
                          }} />
                        </div>
                        <div style={{ fontSize: "10px", color: "#555", width: "32px", textAlign: "right" }}>
                          {(v.weight * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: "16px", fontSize: "10px", color: "#555", padding: "8px 0" }}>
            <span><span style={{ color: "#44ff88" }}>✦ WIN</span> = Above 5% reply rate, auto-promoted</span>
            <span><span style={{ color: "#ff9500" }}>⚠ LAG</span> = Below 2% reply rate, weight reduced</span>
            <span><span style={{ color: "#555" }}>— </span> = Insufficient data (&lt;10 sends)</span>
          </div>

          {/* Navigation */}
          <div style={{ marginTop: "10px", display: "flex", gap: "12px" }}>
            <button onClick={onBack}
              style={{ background: "#111", color: "#555", border: "1px solid #222", padding: "9px 18px", fontSize: "12px" }}>
              ← BACK TO GENERATE
            </button>
            {onNext && (
              <button onClick={onNext}
                style={{ background: "#1a0a2a", color: "#cc88ff", border: "1px solid #2a1a3a", padding: "9px 18px", fontSize: "12px" }}>
                A/B TEST ANALYSIS → 
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
