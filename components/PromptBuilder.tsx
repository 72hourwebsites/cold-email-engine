"use client";

import { useState } from "react";
import { CsvRow, FieldMapping, LMConfig, SEMANTIC_FIELDS, ServiceType, EmailMode, SequenceTemplates } from "@/lib/types";
import { buildPrompt, TEMPLATE_TOKENS, SERVICE_LABELS, SERVICE_DESCRIPTIONS, getServiceTemplates } from "@/lib/prompt";

interface Props {
  seqTemplates: SequenceTemplates;
  onTemplatesChange: (t: SequenceTemplates) => void;
  sampleRow?: CsvRow;
  mappings: FieldMapping[];
  config: LMConfig;
  isOutscraper: boolean;
  onNext: () => void;
  onBack: () => void;
}

const SERVICES: ServiceType[] = ["apollo_voice_ai", "leadrocks_voice_ai", "outscraper_voice_ai", "outscraper_professional", "voice_ai", "digital_marketing", "bundle", "custom"];
const MODES: { key: EmailMode; label: string; desc: string }[] = [
  { key: "full_email",  label: "Full Email",      desc: "Complete email per lead — paste directly into ReachInbox or send yourself" },
  { key: "icebreaker",  label: "Icebreaker Only",  desc: "1-2 sentence personalized opener — inject as {{icebreaker}} in your ReachInbox template" },
  { key: "sequence",    label: "4-Step Sequence",  desc: "Day 0 hook → Day 3 social proof → Day 7 curiosity → Day 14 break-up. Full ReachInbox sequence with proper day delays." },
];
const TAB_OPTIONS = ["DAY 0 — HOOK", "DAY 3 — SOCIAL PROOF", "DAY 7 — CURIOSITY", "DAY 14 — BREAK-UP", "SYSTEM PROMPT"] as const;

export default function PromptBuilder({ seqTemplates, onTemplatesChange, sampleRow, mappings, config, isOutscraper, onNext, onBack }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ subject: string; body: string; raw: string } | null>(null);
  const [previewError, setPreviewError] = useState("");

  const { service, mode, step1, step2, step3, systemPrompt } = seqTemplates;

  const setService = (s: ServiceType) => {
    onTemplatesChange(getServiceTemplates(s, mode));
    setPreviewResult(null);
  };

  const setMode = (m: EmailMode) => {
    const t = getServiceTemplates(service, m);
    onTemplatesChange({ ...t, step1: service === "custom" ? step1 : t.step1 });
    setPreviewResult(null);
  };

  const updateTemplate = (field: "step1" | "step2" | "step3" | "step4" | "systemPrompt", val: string) => {
    onTemplatesChange({ ...seqTemplates, [field]: val, service: "custom" });
  };

  const currentField = (["step1", "step2", "step3", "step4", "systemPrompt"] as const)[activeTab];
  const currentTemplate = seqTemplates[currentField];
  const resolvedPrompt = sampleRow ? buildPrompt(currentTemplate, sampleRow, mappings) : currentTemplate;
  const mappedKeys = new Set(mappings.filter(m => m.semanticKey).map(m => m.semanticKey));

  const runPreview = async () => {
    if (!sampleRow) return;
    setPreviewing(true);
    setPreviewError("");
    setPreviewResult(null);
    setShowPreview(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: resolvedPrompt, systemPrompt, config }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPreviewResult(data);
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  };

  const insertToken = (token: string) => {
    onTemplatesChange({ ...seqTemplates, [currentField]: currentTemplate + `\n${token}`, service: "custom" });
  };

  return (
    <div>
      <div className="syne" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "12px", letterSpacing: "-0.5px" }}>
        04 — WRITE PROMPT
      </div>
      <p style={{ color: "#555", fontSize: "12px", marginBottom: "20px" }}>
        Pick your service, choose a mode, fine-tune. Live preview fires your LM Studio.
      </p>

      {/* Outscraper auto-detect banner */}
      {isOutscraper && (
        <div style={{ background: "#0f1a0a", border: "1px solid #2a4a1a", padding: "12px 18px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "20px" }}>🍽</span>
          <div>
            <div style={{ color: "#44ff88", fontSize: "12px", fontWeight: 500 }}>Outscraper restaurant CSV detected — using specialized template</div>
            <div style={{ color: "#44aa66", fontSize: "11px", marginTop: "2px" }}>
              Auto-computing: owner first name · reservation status · 5-star % · happy hour angle · key attributes · years in business · revenue
            </div>
          </div>
          {service !== "outscraper_voice_ai" && (
            <button onClick={() => setService("outscraper_voice_ai")}
              style={{ marginLeft: "auto", background: "#0a2a0a", color: "#44ff88", border: "1px solid #44ff88", padding: "6px 14px", fontSize: "11px" }}>
              SWITCH TO OUTSCRAPER TEMPLATE
            </button>
          )}
        </div>
      )}

      {/* SERVICE PICKER */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "8px" }}>SERVICE TYPE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: "6px" }}>
          {SERVICES.map(s => (
            <button key={s} onClick={() => setService(s)}
              style={{
                padding: "10px 12px", textAlign: "left",
                background: service === s ? (s === "outscraper_voice_ai" ? "#0a1a0a" : "#0a0a1a") : "#111",
                color: service === s ? (s === "outscraper_voice_ai" ? "#44ff88" : "#44aaff") : "#555",
                border: `1px solid ${service === s ? (s === "outscraper_voice_ai" ? "#1a3a1a" : "#1a1a3a") : "#222"}`,
              }}>
              <div style={{ fontSize: "12px", fontWeight: 500, marginBottom: "3px" }}>{SERVICE_LABELS[s]}</div>
              <div style={{ fontSize: "10px", color: service === s ? (s === "outscraper_voice_ai" ? "#3a7a3a" : "#3a3a7a") : "#2a2a2a", lineHeight: 1.3 }}>
                {SERVICE_DESCRIPTIONS[s]}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* MODE PICKER */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "8px" }}>EMAIL MODE</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              style={{ flex: 1, padding: "10px 14px", textAlign: "left", background: mode === m.key ? "#0a0a1a" : "#111", color: mode === m.key ? "#44aaff" : "#555", border: `1px solid ${mode === m.key ? "#1a1a3a" : "#222"}` }}>
              <div style={{ fontSize: "12px", fontWeight: 500, marginBottom: "3px" }}>{m.label}</div>
              <div style={{ fontSize: "10px", color: mode === m.key ? "#3a3a7a" : "#2a2a2a", lineHeight: 1.3 }}>{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ReachInbox tip */}
      <div style={{ background: "#0a0a1a", border: "1px solid #1a1a3a", padding: "10px 16px", marginBottom: "18px", fontSize: "11px", color: "#4488aa", lineHeight: 1.6 }}>
        <strong style={{ color: "#44aaff" }}>ℹ ReachInbox:</strong>
        {mode === "icebreaker" && <> Import CSV → in your sequence body, add <code style={{ background: "#111", padding: "1px 5px" }}>{"{{icebreaker}}"}</code> then write your standard pitch below it.</>}
        {mode === "full_email" && <> Import CSV → Step 1 subject = <code style={{ background: "#111", padding: "1px 5px" }}>{"{{subject_step1}}"}</code>, body = <code style={{ background: "#111", padding: "1px 5px" }}>{"{{body_step1}}"}</code>.</>}
        {mode === "sequence" && <> Import CSV → 3-step sequence. Step 1: <code style={{ background: "#111", padding: "1px 5px" }}>{"{{subject_step1}}"}</code>/<code style={{ background: "#111", padding: "1px 5px" }}>{"{{body_step1}}"}</code>. Step 2/3 same pattern. Delays: 0 / 3 / 7 days.</>}
      </div>

      {/* EDITOR + PREVIEW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div>
          <div style={{ display: "flex", gap: "0", marginBottom: "8px", flexWrap: "wrap" }}>
            {TAB_OPTIONS.map((label, i) => {
              if (mode !== "sequence" && (i === 1 || i === 2 || i === 3)) return null;
              return (
                <button key={label} onClick={() => setActiveTab(i)}
                  style={{ padding: "6px 12px", fontSize: "10px", letterSpacing: "0.5px", background: activeTab === i ? "#e8ff00" : "#111", color: activeTab === i ? "#000" : "#444", border: `1px solid ${activeTab === i ? "#e8ff00" : "#222"}` }}>
                  {label}
                </button>
              );
            })}
          </div>

          <textarea
            value={currentTemplate}
            onChange={e => updateTemplate(currentField, e.target.value)}
            rows={18}
            style={{ width: "100%", padding: "12px 14px", fontSize: "11px", lineHeight: "1.6", resize: "vertical", background: "#111", color: "#e8e8e0", border: "1px solid #2a2a2a" }}
          />

          {currentField !== "systemPrompt" && (
            <div style={{ marginTop: "6px" }}>
              <div style={{ fontSize: "10px", color: "#333", marginBottom: "4px" }}>CLICK TO INSERT TOKEN</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                {/* Outscraper computed tokens (show prominently if Outscraper) */}
                {isOutscraper && ["{{ownerFirstName}}", "{{reservationStatus}}", "{{reservationAngle}}", "{{fiveStarPct}}", "{{happyHoursStatus}}", "{{happyHoursAngle}}", "{{keyAttributes}}", "{{yearsInBusiness}}", "{{revenueFormatted}}", "{{restaurantType}}", "{{isWomenOwned}}", "{{hasLiveMusic}}"].map(t => (
                  <button key={t} onClick={() => insertToken(t)} title="Outscraper computed token" style={{ background: "#0a1a0a", color: "#44ff88", border: "1px solid #1a3a1a", padding: "2px 7px", fontSize: "10px" }}>{t}</button>
                ))}
                {SEMANTIC_FIELDS.map(f => {
                  const isMapped = mappedKeys.has(f.key);
                  return (
                    <button key={f.key} onClick={() => insertToken(`{{${f.key}}}`)} title={f.description}
                      style={{ background: isMapped ? "#0a0a1a" : "#0f0f0f", color: isMapped ? "#44aaff" : "#2a2a2a", border: `1px solid ${isMapped ? "#1a1a3a" : "#1a1a1a"}`, padding: "2px 6px", fontSize: "10px" }}>
                      {`{{${f.key}}}`}
                    </button>
                  );
                })}
                {["{{season}}", "{{month}}", "{{year}}"].map(t => (
                  <button key={t} onClick={() => insertToken(t)} style={{ background: "#0a0a1a", color: "#888", border: "1px solid #1a1a1a", padding: "2px 6px", fontSize: "10px" }}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px" }}>{showPreview ? "LIVE OUTPUT" : "RESOLVED PROMPT (row 1)"}</div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={() => setShowPreview(false)} style={{ padding: "3px 8px", fontSize: "10px", background: !showPreview ? "#1a1a1a" : "#111", color: !showPreview ? "#e8e8e0" : "#555", border: `1px solid ${!showPreview ? "#2a2a2a" : "#111"}` }}>PROMPT</button>
              <button onClick={() => setShowPreview(true)} style={{ padding: "3px 8px", fontSize: "10px", background: showPreview ? "#1a1a1a" : "#111", color: showPreview ? "#e8e8e0" : "#555", border: `1px solid ${showPreview ? "#2a2a2a" : "#111"}` }}>OUTPUT</button>
            </div>
          </div>

          {!showPreview ? (
            <pre style={{ background: "#080808", color: "#555", padding: "12px", fontSize: "11px", lineHeight: "1.6", height: "420px", overflow: "auto", border: "1px solid #1a1a1a", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {resolvedPrompt}
            </pre>
          ) : (
            <div style={{ background: "#080808", border: "1px solid #1a1a1a", padding: "14px", height: "420px", overflow: "auto" }}>
              {!previewResult && !previewing && !previewError && <div style={{ color: "#333", fontSize: "12px", textAlign: "center", paddingTop: "60px" }}>Click "Live Preview" to fire your LLM →</div>}
              {previewing && <div style={{ color: "#44ff88", fontSize: "12px", textAlign: "center", paddingTop: "60px" }}>⟳ Calling LM Studio...</div>}
              {previewError && <div style={{ color: "#ff3b3b", fontSize: "12px" }}>✗ {previewError}</div>}
              {previewResult && (
                <div>
                  {previewResult.subject && (
                    <><div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "4px" }}>SUBJECT:</div>
                    <div style={{ color: "#e8ff00", fontSize: "15px", marginBottom: "14px", fontWeight: 500 }}>{previewResult.subject}</div></>
                  )}
                  <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "4px" }}>{mode === "icebreaker" ? "ICEBREAKER:" : "BODY:"}</div>
                  <div style={{ color: "#e8e8e0", fontSize: "13px", lineHeight: "1.8", whiteSpace: "pre-wrap" }}>{previewResult.body || previewResult.raw}</div>
                </div>
              )}
            </div>
          )}

          {sampleRow && (
            <button onClick={runPreview} disabled={previewing}
              style={{ marginTop: "6px", width: "100%", background: "#0a1a0a", color: "#44ff88", border: "1px solid #1a3a1a", padding: "10px", fontSize: "12px", opacity: previewing ? 0.6 : 1 }}>
              {previewing ? "⟳ GENERATING..." : "⚡ LIVE PREVIEW — ROW 1 (Rusty Bellies →)"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
        <button onClick={onBack} style={{ background: "#111", color: "#555", border: "1px solid #222", padding: "12px 24px", fontSize: "12px" }}>← BACK</button>
        <button onClick={onNext} style={{ background: "#e8ff00", color: "#000", border: "none", padding: "12px 32px", fontSize: "13px", fontWeight: 500 }}>NEXT: GENERATE →</button>
      </div>
    </div>
  );
}
