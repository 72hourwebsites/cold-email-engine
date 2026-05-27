"use client";

import { useState, useMemo } from "react";
import { CsvRow, FieldMapping, GeneratedEmail, GenerationState, EmailMode } from "@/lib/types";
import { isLeadRocksCsv, getBestEmail } from "@/lib/leadrocks";

interface Props {
  csvRows: CsvRow[];
  mappings: FieldMapping[];
  genState: GenerationState;
  mode: EmailMode;
  qualityStats: { good: number; bad: number };
  onStart: () => void;
  onResume: () => void;
  onStop: () => void;
  remainingCount: number;
  onGenerateRemaining: () => void;
  onRetryFailed: () => void;
  onRegenBad: () => void;
  onUpdateEmail: (idx: number, subject: string, body: string) => void;
  onReset: () => void;
  onBack: () => void;
}

function getCol(mappings: FieldMapping[], key: string) {
  return mappings.find(m => m.semanticKey === key)?.csvColumn || "";
}

function wordCount(text: string): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function sanitize(v: string) {
  return `"${String(v || "").replace(/"/g, '""')}"`;
}

// ─── REACHINBOX NATIVE EXPORT ─────────────────────────────────────────────────
// Matches EXACTLY the ReachInbox bulk upload template:
// Email, First_Name, Last_Name, Company_Name, Linkedin, Personalisation_Line
// + custom columns for generated email sequences
// Rules: Email first, capital letters, no commas in simple fields
function toReachInboxCSV(rows: CsvRow[], emails: GeneratedEmail[], mappings: FieldMapping[], mode: EmailMode): string {
  const isLeadRocks = rows[0] ? isLeadRocksCsv(Object.keys(rows[0])) : false;
  const emailCol   = getCol(mappings, "email");
  const firstCol   = getCol(mappings, "firstName") || getCol(mappings, "fullName");
  const lastCol    = getCol(mappings, "lastName");
  const companyCol = getCol(mappings, "company");
  const linkedinCol = getCol(mappings, "linkedinUrl");

  // ReachInbox native headers — EXACTLY matching their template
  const baseHeaders = ["Email", "First_Name", "Last_Name", "Company_Name", "Linkedin"];

  // Generated email columns as ReachInbox custom variables
  const modeHeaders: string[] = mode === "icebreaker"
    ? ["Personalisation_Line"]  // The exact field ReachInbox uses
    : mode === "sequence"
    ? ["Personalisation_Line", "Subject_Day0", "Body_Day0", "Subject_Day3", "Body_Day3", "Subject_Day7", "Body_Day7", "Subject_Day14", "Body_Day14"]
    : ["Personalisation_Line", "Subject_Day0", "Body_Day0"];

  const allHeaders = [...baseHeaders, ...modeHeaders];
  const lines = emails.map(e => {
    const row = rows[e.rowIndex] || {};
    // LeadRocks: best verified email; others: mapped column
    const emailVal = isLeadRocks ? getBestEmail(row) : (row[emailCol] || "");
    const fnVal = isLeadRocks ? (row["First Name"] || "") : getFirstName(row[firstCol] || "");
    const lnVal = isLeadRocks ? (row["Last Name"] || "") : (row[lastCol] || "");
    const coVal = isLeadRocks ? (row["Company"] || "") : (row[companyCol] || "");
    const liVal = isLeadRocks ? (row["Linked Url"] || "") : (row[linkedinCol] || "");

    // ReachInbox native base: Email first (mandatory), then standard fields
    const base = [
      sanitize(emailVal),
      sanitize(fnVal),
      sanitize(lnVal),
      sanitize(coVal),
      sanitize(liVal),
    ];

    // Generated content — Personalisation_Line is always the icebreaker or email body
    let modeVals: string[];
    const personalisationLine = e.icebreaker || (mode === "icebreaker" ? e.body : e.subject) || "";
    if (mode === "icebreaker") {
      modeVals = [sanitize(personalisationLine)];
    } else if (mode === "sequence") {
      modeVals = [
        sanitize(personalisationLine),   // Personalisation_Line
        sanitize(e.subject || ""),        // Subject_Day0
        sanitize(e.body || ""),           // Body_Day0
        sanitize(e.subject2 || ""),       // Subject_Day3
        sanitize(e.body2 || ""),          // Body_Day3
        sanitize(e.subject3 || ""),       // Subject_Day7
        sanitize(e.body3 || ""),          // Body_Day7
        sanitize(e.subject4 || ""),       // Subject_Day14
        sanitize(e.body4 || ""),          // Body_Day14
      ];
    } else {
      // Full email mode — subject becomes Personalisation_Line, body is the email
      modeVals = [
        sanitize(e.subject || ""),  // Personalisation_Line = subject
        sanitize(e.subject || ""),  // Subject_Day0 (duplicate for template flexibility)
        sanitize(e.body || ""),     // Body_Day0
      ];
    }

    return [...base, ...modeVals].join(",");
  });

  return [allHeaders.join(","), ...lines].join("\n");
}

function toFullCSV(rows: CsvRow[], emails: GeneratedEmail[], mappings: FieldMapping[], mode: EmailMode): string {
  const csvCols = rows[0] ? Object.keys(rows[0]) : [];
  const extraCols = mode === "sequence"
    ? ["generated_subject_1", "generated_body_1", "generated_subject_2", "generated_body_2", "generated_subject_3", "generated_body_3", "word_count", "status"]
    : mode === "icebreaker"
    ? ["icebreaker", "status"]
    : ["generated_subject", "generated_body", "word_count", "status"];

  const lines = emails.map(e => {
    const row = rows[e.rowIndex] || {};
    const base = csvCols.map(h => sanitize(row[h] || ""));
    let extra: string[];
    if (mode === "sequence") {
      extra = [sanitize(e.subject), sanitize(e.body), sanitize(e.subject2 || ""), sanitize(e.body2 || ""), sanitize(e.subject3 || ""), sanitize(e.body3 || ""), String(wordCount(e.body)), e.error ? "error" : "ok"];
    } else if (mode === "icebreaker") {
      extra = [sanitize(e.icebreaker || e.body), e.error ? "error" : "ok"];
    } else {
      extra = [sanitize(e.subject), sanitize(e.body), String(wordCount(e.body)), e.error ? "error" : "ok"];
    }
    return [...base, ...extra].join(",");
  });

  return [[...csvCols, ...extraCols].join(","), ...lines].join("\n");
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

// Streaming download — builds chunks to avoid one giant in-memory string
function downloadCSVStreaming(headers: string[], rows: string[], name: string) {
  const CHUNK = 500;
  const parts: string[] = ["﻿" + headers.join(",") + "\n"];
  for (let i = 0; i < rows.length; i += CHUNK) {
    parts.push(rows.slice(i, i + CHUNK).join("\n") + "\n");
  }
  const blob = new Blob(parts, { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function buildReachInboxRows(rows: CsvRow[], emails: GeneratedEmail[], mappings: FieldMapping[], mode: EmailMode) {
  const emailCol   = getCol(mappings, "email");
  const firstCol   = getCol(mappings, "firstName") || getCol(mappings, "fullName");
  const lastCol    = getCol(mappings, "lastName");
  const companyCol = getCol(mappings, "company");
  const phoneCol   = getCol(mappings, "phone");
  const websiteCol = getCol(mappings, "website");
  const cityCol    = getCol(mappings, "city");
  const stateCol   = getCol(mappings, "state");

  const baseH = ["email","first_name","last_name","company_name","phone","website","city","state"];
  const modeH = mode === "icebreaker" ? ["icebreaker"]
    : mode === "sequence" ? ["subject_step1","body_step1","subject_step2","body_step2","subject_step3","body_step3","word_count"]
    : ["subject_step1","body_step1","word_count"];
  const headers = [...baseH, ...modeH, "status"];

  const lines = emails.map(e => {
    const row = rows[e.rowIndex] || {};
    const fn = (row[firstCol] || "").trim().split(/\s+/)[0];
    const base = [row[emailCol]||"", fn, row[lastCol]||"", row[companyCol]||"", row[phoneCol]||"", row[websiteCol]||"", row[cityCol]||"", row[stateCol]||""];
    let modeVals: string[];
    if (mode === "icebreaker")   modeVals = [e.icebreaker||e.body||""];
    else if (mode === "sequence") modeVals = [e.subject||"", e.body||"", e.subject2||"", e.body2||"", e.subject3||"", e.body3||"", String(wordCount(e.body))];
    else                          modeVals = [e.subject||"", e.body||"", String(wordCount(e.body))];
    return [...base, ...modeVals, e.error ? "error" : "ok"].map(v => sanitize(String(v))).join(",");
  });

  return { headers, lines };
}

function buildFullRows(rows: CsvRow[], emails: GeneratedEmail[], mode: EmailMode) {
  const csvCols = rows[0] ? Object.keys(rows[0]) : [];
  const extraH = mode === "sequence"
    ? ["generated_subject_1","generated_body_1","generated_subject_2","generated_body_2","generated_subject_3","generated_body_3","word_count","quality","status"]
    : mode === "icebreaker" ? ["icebreaker","status"]
    : ["generated_subject","generated_body","word_count","quality","status"];

  const lines = emails.map(e => {
    const row = rows[e.rowIndex] || {};
    const base = csvCols.map(h => sanitize(row[h]||""));
    const wc = wordCount(e.body||"");
    const quality = !e.error && e.subject && e.body && wc >= 15 && wc <= 200 ? "ok" : "review";
    let extra: string[];
    if (mode === "sequence") extra = [e.subject,e.body,e.subject2||"",e.body2||"",e.subject3||"",e.body3||"",String(wc),quality,e.error?"error":"ok"].map(v=>sanitize(v));
    else if (mode === "icebreaker") extra = [sanitize(e.icebreaker||e.body||""), e.error?"error":"ok"];
    else extra = [e.subject,e.body,String(wc),quality,e.error?"error":"ok"].map(v=>sanitize(v));
    return [...base,...extra].join(",");
  });

  return { headers: [...csvCols,...extraH], lines };
}

export default function GenerationPanel({ csvRows, mappings, genState, mode, qualityStats, remainingCount, onGenerateRemaining, onStart, onResume, onStop, onRetryFailed, onRegenBad, onUpdateEmail, onReset, onBack }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "ok" | "error">("all");
  const [previewStep, setPreviewStep] = useState<1 | 2 | 3>(1);

  const { status, total, done, failed, currentBatch, emails } = genState;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const nameCol = getCol(mappings, "firstName") || getCol(mappings, "fullName");
  const emailCol = getCol(mappings, "email");
  const companyCol = getCol(mappings, "company");

  const elapsed = genState.startedAt ? Math.round((Date.now() - genState.startedAt) / 1000) : 0;
  const rate = elapsed > 1 ? done / elapsed : 0;
  const eta = rate > 0 && status === "running" ? Math.round((total - done) / rate) : 0;
  const okEmails = emails.filter(e => !e.error);
  const avgWords = okEmails.length > 0
    ? Math.round(okEmails.reduce((s, e) => s + wordCount(e.body), 0) / okEmails.length)
    : 0;

  const fmtTime = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  const filteredEmails = useMemo(() => {
    let list = emails;
    if (filterStatus === "ok") list = list.filter(e => !e.error);
    if (filterStatus === "error") list = list.filter(e => !!e.error);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => {
        const row = csvRows[e.rowIndex];
        return (
          (e.subject || "").toLowerCase().includes(q) ||
          (e.body || "").toLowerCase().includes(q) ||
          (row?.[nameCol] || "").toLowerCase().includes(q) ||
          (row?.[emailCol] || "").toLowerCase().includes(q) ||
          (row?.[companyCol] || "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [emails, filterStatus, search, csvRows, nameCol, emailCol, companyCol]);

  const openEdit = (email: GeneratedEmail) => {
    setSelectedIdx(email.rowIndex);
    setEditSubject(email.subject);
    setEditBody(email.body);
    setEditing(true);
  };

  const saveEdit = () => {
    if (selectedIdx === null) return;
    onUpdateEmail(selectedIdx, editSubject, editBody);
    setEditing(false);
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  const isSequence = mode === "sequence";

  return (
    <div>
      {/* Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <div className="syne" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>05 — GENERATE & EXPORT</div>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "4px", letterSpacing: "0.5px" }}>
            Mode: <span style={{ color: "#44aaff" }}>{mode === "sequence" ? "3-step sequence" : mode === "icebreaker" ? "icebreaker only" : "full email"}</span>
            {isSequence && <span style={{ color: "#444", marginLeft: "10px" }}>· 3 LLM calls per lead</span>}
          </div>
        </div>
        {(status === "done" || status === "paused") && emails.length > 0 && (
          <button onClick={() => { if (confirm("Clear all generated emails?")) onReset(); }}
            style={{ background: "transparent", color: "#ff3b3b", border: "1px solid #3d0000", padding: "6px 14px", fontSize: "11px" }}>
            ✕ RESET
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "#1a1a1a", marginBottom: "14px" }}>
        {[
          { label: "TOTAL",   value: total || csvRows.length,  color: "#e8ff00" },
          { label: "DONE",    value: done,                     color: "#44ff88" },
          { label: "FAILED",  value: failed,                   color: failed > 0 ? "#ff3b3b" : "#333" },
          { label: "QUALITY", value: done > 0 ? `${Math.round((qualityStats.good / Math.max(1, done)) * 100)}%` : "—",
            color: done > 0 && qualityStats.good / done >= 0.9 ? "#44ff88" : "#ff9500" },
          { label: "%",       value: `${pct}%`,                color: "#44aaff" },
          { label: "AVG WDS", value: avgWords || "—",          color: "#888" },
          { label: status === "running" ? "ETA" : "STATUS", value: status === "running" ? fmtTime(eta) : status.toUpperCase(),
            color: status === "done" ? "#44ff88" : status === "running" ? "#e8ff00" : status === "paused" ? "#ff9500" : "#555" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#0f0f0f", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "3px" }}>{s.label}</div>
            <div className="syne" style={{ fontSize: "19px", fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Auto-reconnect notice */}
      {status === "paused" && failed > 0 && done < (total || 1) && (
        <div style={{ background: "#1a0a00", border: "1px solid #3a2000", padding: "10px 16px", marginBottom: "10px", fontSize: "11px", color: "#ff9500", display: "flex", gap: "10px", alignItems: "center" }}>
          <span>⟳</span>
          <span>LM Studio connection dropped. Auto-reconnecting in the background — or click ▶ RESUME to retry now.</span>
        </div>
      )}

      {/* Progress */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ background: "#1a1a1a", height: "4px", borderRadius: "2px" }}>
          <div style={{ background: status === "done" ? "#44ff88" : status === "running" ? "#e8ff00" : status === "paused" ? "#ff9500" : "#333", height: "100%", width: `${pct}%`, transition: "width 0.3s", borderRadius: "2px" }} />
        </div>
        {status === "running" && (
          <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>
            {currentBatch.length > 0 && `⟳ Rows ${currentBatch.map(i => i + 1).join(", ")} · `}
            {elapsed > 0 && `${done} done · ${fmtTime(elapsed)} elapsed · ${rate > 0 ? rate.toFixed(1) : "—"} /sec`}
            {isSequence && ` · 4 steps per row`}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={onBack} style={{ background: "#111", color: "#555", border: "1px solid #222", padding: "9px 18px", fontSize: "12px" }}>← BACK</button>

        {status === "idle" && (
          <button onClick={onStart} style={{ background: "#e8ff00", color: "#000", border: "none", padding: "9px 24px", fontSize: "13px", fontWeight: 500 }}>
            ▶ START — {csvRows.length.toLocaleString()} LEADS
          </button>
        )}
        {(status === "done" || status === "idle") && remainingCount > 0 && remainingCount < csvRows.length && (
          <button onClick={onGenerateRemaining} style={{ background: "#e8ff00", color: "#000", border: "none", padding: "9px 24px", fontSize: "13px", fontWeight: 500 }}>
            ▶ GENERATE {remainingCount} REMAINING
          </button>
        )}
        {status === "paused" && (
          <>
            <button onClick={onResume} style={{ background: "#e8ff00", color: "#000", border: "none", padding: "9px 22px", fontSize: "13px", fontWeight: 500 }}>
              ▶ RESUME ({csvRows.length - done} left)
            </button>
            {failed > 0 && (
              <button onClick={onRetryFailed} style={{ background: "#3d0000", color: "#ff6b6b", border: "1px solid #ff3b3b", padding: "9px 18px", fontSize: "12px" }}>
                ↺ RETRY {failed} FAILED
              </button>
            )}
          </>
        )}
        {status === "running" && (
          <button onClick={onStop} style={{ background: "#ff3b3b", color: "#fff", border: "none", padding: "9px 22px", fontSize: "13px" }}>■ PAUSE</button>
        )}
        {(status === "done" || status === "paused") && failed > 0 && (
          <button onClick={onRetryFailed} style={{ background: "#3d0000", color: "#ff6b6b", border: "1px solid #ff3b3b", padding: "9px 18px", fontSize: "12px" }}>
            ↺ RETRY {failed} FAILED
          </button>
        )}
        {(status === "done" || status === "paused") && qualityStats.bad > 0 && (
          <button onClick={onRegenBad} style={{ background: "#1a1a00", color: "#e8ff00", border: "1px solid #4a4a00", padding: "9px 18px", fontSize: "12px", fontWeight: 500 }}>
            ✦ REGEN {qualityStats.bad} BAD EMAILS
          </button>
        )}

        {/* Export buttons */}
        {okEmails.length > 0 && (
          <>
            <div style={{ width: "1px", background: "#222", alignSelf: "stretch" }} />
            <button
              onClick={() => {
                const { headers, lines } = buildReachInboxRows(csvRows, okEmails, mappings, mode);
                downloadCSVStreaming(headers, lines, `reachinbox-${dateStr}.csv`);
              }}
              style={{ background: "#0a0a1a", color: "#44aaff", border: "1px solid #1a1a3a", padding: "9px 18px", fontSize: "12px", fontWeight: 500 }}
            >
              ↓ REACHINBOX ({okEmails.length})
            </button>
            <button
              onClick={() => {
                const { headers, lines } = buildFullRows(csvRows, okEmails, mode);
                downloadCSVStreaming(headers, lines, `emails-full-${dateStr}.csv`);
              }}
              style={{ background: "#0a1a0a", color: "#44ff88", border: "1px solid #1a3a1a", padding: "9px 18px", fontSize: "12px" }}
            >
              ↓ FULL CSV ({okEmails.length})
            </button>
          </>
        )}
      </div>

      {/* ReachInbox quick guide — shown after generation */}
      {okEmails.length > 0 && (
        <div style={{ background: "#0a0a1a", border: "1px solid #1a1a3a", padding: "12px 18px", marginBottom: "18px", fontSize: "11px", color: "#4488aa", lineHeight: 1.7 }}>
          <strong style={{ color: "#44aaff" }}>↑ ReachInbox Import Steps:</strong>
          {mode === "icebreaker" && <> (1) Upload the <em>ReachInbox CSV</em> into ReachInbox as a leads list. (2) In your sequence email, type <code style={{background:"#111",padding:"1px 5px"}}>{"{{icebreaker}}"}</code> where you want the personalized line. (3) Write your standard pitch below it. Done.</>}
          {mode === "full_email" && <> (1) Upload the <em>ReachInbox CSV</em> into ReachInbox. (2) In your sequence Step 1 set Subject = <code style={{background:"#111",padding:"1px 5px"}}>{"{{subject_step1}}"}</code> and Body = <code style={{background:"#111",padding:"1px 5px"}}>{"{{body_step1}}"}</code>. Each lead gets their unique LLM-written email.</>}
          {mode === "sequence" && <>
            (1) Upload the <em>ReachInbox CSV</em>. (2) Create a <strong style={{color:"#44aaff"}}>4-step sequence</strong>:
            <br/>• Step 1 (Day 0): subject=<code style={{background:"#111",padding:"1px 4px"}}>{"{{subject_day0}}"}</code> body=<code style={{background:"#111",padding:"1px 4px"}}>{"{{body_day0}}"}</code> — Initial hook
            <br/>• Step 2 (+3 days): subject=<code style={{background:"#111",padding:"1px 4px"}}>{"{{subject_day3}}"}</code> body=<code style={{background:"#111",padding:"1px 4px"}}>{"{{body_day3}}"}</code> — Social proof
            <br/>• Step 3 (+4 days): subject=<code style={{background:"#111",padding:"1px 4px"}}>{"{{subject_day7}}"}</code> body=<code style={{background:"#111",padding:"1px 4px"}}>{"{{body_day7}}"}</code> — Curiosity question
            <br/>• Step 4 (+7 days): subject=<code style={{background:"#111",padding:"1px 4px"}}>{"{{subject_day14}}"}</code> body=<code style={{background:"#111",padding:"1px 4px"}}>{"{{body_day14}}"}</code> — Break-up
            <br/>(3) Set condition: <em>if reply received → stop sequence</em>. Enable A/Z testing on subject lines.
          </>}
        </div>
      )}

      {/* Email table */}
      {emails.length > 0 && (
        <div>
          {/* Search / filter / step toggle */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, company, subject..."
              style={{ flex: 1, padding: "7px 12px", fontSize: "12px", background: "#111", color: "#e8e8e0", border: "1px solid #2a2a2a", maxWidth: "320px" }}
            />
            {isSequence && (
              <div style={{ display: "flex", gap: "0" }}>
                {([1, 2, 3] as const).map(n => (
                  <button key={n} onClick={() => setPreviewStep(n)}
                    style={{ padding: "6px 12px", fontSize: "10px", background: previewStep === n ? "#1a1a1a" : "#111", color: previewStep === n ? "#e8ff00" : "#444", border: `1px solid ${previewStep === n ? "#2a2a2a" : "#111"}`, letterSpacing: "0.5px" }}>
                    STEP {n}
                  </button>
                ))}
              </div>
            )}
            {(["all", "ok", "error"] as const).map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                style={{ padding: "6px 12px", fontSize: "10px", background: filterStatus === f ? "#1a1a1a" : "#111", color: filterStatus === f ? "#e8e8e0" : "#444", border: `1px solid ${filterStatus === f ? "#2a2a2a" : "#111"}` }}>
                {f.toUpperCase()}{f !== "all" ? ` (${emails.filter(e => f === "ok" ? !e.error : !!e.error).length})` : ""}
              </button>
            ))}
            <span style={{ fontSize: "11px", color: "#444", marginLeft: "auto" }}>{filteredEmails.length} shown</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#111", borderBottom: "1px solid #222" }}>
                  {["#", "CONTACT", mode === "icebreaker" ? "ICEBREAKER" : "SUBJECT", "BODY PREVIEW", "WDS", ""].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#444", fontWeight: 400, letterSpacing: "1px", fontSize: "10px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmails.map((email, i) => {
                  const row = csvRows[email.rowIndex] || {};
                  const name = row[nameCol] || `Row ${email.rowIndex + 1}`;
                  const addr = row[emailCol] || "";
                  const company = row[companyCol] || "";

                  const displaySubject = isSequence && previewStep === 2 ? (email.subject2 || "—")
                    : isSequence && previewStep === 3 ? (email.subject3 || "—")
                    : mode === "icebreaker" ? (email.icebreaker || email.body || "—")
                    : email.subject || "—";
                  const displayBody = isSequence && previewStep === 2 ? (email.body2 || "")
                    : isSequence && previewStep === 3 ? (email.body3 || "")
                    : email.body || "";
                  const wc = wordCount(displayBody);

                  return (
                    <tr key={email.rowIndex}
                      style={{ borderBottom: "1px solid #111", background: i % 2 === 0 ? "#0a0a0a" : "#0d0d0d", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#141414")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#0a0a0a" : "#0d0d0d")}
                    >
                      <td style={{ padding: "9px 12px", color: "#333", whiteSpace: "nowrap" }}>{email.rowIndex + 1}</td>
                      <td style={{ padding: "9px 12px", minWidth: "160px" }}>
                        <div style={{ color: "#e8e8e0", fontWeight: 500 }}>{name}</div>
                        {company && <div style={{ color: "#666", fontSize: "11px" }}>{company}</div>}
                        {addr && <div style={{ color: "#44aaff", fontSize: "11px" }}>{addr}</div>}
                      </td>
                      <td style={{ padding: "9px 12px", minWidth: "200px" }}>
                        {email.error ? (
                          <span style={{ color: "#ff3b3b", fontSize: "11px" }}>✗ {email.error.slice(0, 50)}</span>
                        ) : (() => {
                          const isBanned = /^(boost|elevate|unlock|transform|maximize|supercharge|enhance|optimize)/i.test(displaySubject);
                          const isPlaceholder = /\[owner/i.test(displaySubject) || /\[owner/i.test(displayBody);
                          const isBad = isBanned || isPlaceholder || !displaySubject;
                          return (
                            <span style={{ color: isBad ? "#ff9500" : mode === "icebreaker" ? "#44ff88" : "#e8ff00", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "240px" }}>
                              {isBad ? "⚠ " : ""}{displaySubject}
                            </span>
                          );
                        })()}
                        {email.edited && <span style={{ color: "#44aaff", fontSize: "10px" }}>EDITED</span>}
                      </td>
                      <td style={{ padding: "9px 12px", color: "#555", maxWidth: "280px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayBody.slice(0, 90) || "—"}
                        </div>
                      </td>
                      <td style={{ padding: "9px 12px", whiteSpace: "nowrap", fontSize: "11px", color: wc > 120 ? "#ff9500" : wc > 0 ? "#44ff88" : "#333" }}>
                        {wc > 0 ? wc : "—"}
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        <button onClick={() => openEdit(email)}
                          style={{ background: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a", padding: "4px 10px", fontSize: "10px" }}>
                          EDIT
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && selectedIdx !== null && (() => {
        const email = emails.find(e => e.rowIndex === selectedIdx);
        if (!email) return null;
        const row = csvRows[selectedIdx] || {};
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
            onClick={e => e.target === e.currentTarget && setEditing(false)}>
            <div style={{ background: "#0f0f0f", border: "1px solid #2a2a2a", padding: "28px", width: "700px", maxWidth: "94vw", maxHeight: "92vh", overflow: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
                <div className="syne" style={{ fontWeight: 800, fontSize: "16px", color: "#fff" }}>
                  EDIT — ROW {selectedIdx + 1}
                  {row[nameCol] && <span style={{ color: "#44ff88", fontSize: "13px", fontFamily: "DM Mono", fontWeight: 400, marginLeft: "12px" }}>{row[nameCol]}</span>}
                  {row[companyCol] && <span style={{ color: "#555", fontSize: "12px", fontFamily: "DM Mono", fontWeight: 400, marginLeft: "8px" }}> · {row[companyCol]}</span>}
                </div>
                <button onClick={() => setEditing(false)} style={{ background: "transparent", color: "#555", border: "none", fontSize: "20px" }}>✕</button>
              </div>

              {mode !== "icebreaker" && (
                <>
                  <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "5px" }}>SUBJECT — STEP 1</div>
                  <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", fontSize: "14px", background: "#111", color: "#e8ff00", border: "1px solid #2a2a2a", marginBottom: "14px" }} />
                </>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px" }}>
                  {mode === "icebreaker" ? "ICEBREAKER" : "BODY — STEP 1"}
                </div>
                <div style={{ fontSize: "11px", color: wordCount(editBody) > 120 ? "#ff9500" : "#44ff88" }}>
                  {wordCount(editBody)} words
                </div>
              </div>
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={mode === "icebreaker" ? 3 : 9}
                style={{ width: "100%", padding: "12px", fontSize: "13px", lineHeight: "1.7", background: "#111", color: "#e8e8e0", border: "1px solid #2a2a2a", resize: "vertical" }} />

              {isSequence && email.body2 && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "5px" }}>STEP 2 SUBJECT · {email.subject2}</div>
                  <div style={{ fontSize: "10px", color: "#333", background: "#080808", padding: "10px 12px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{email.body2}</div>
                </div>
              )}
              {isSequence && email.body3 && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "5px" }}>STEP 3 SUBJECT · {email.subject3}</div>
                  <div style={{ fontSize: "10px", color: "#333", background: "#080808", padding: "10px 12px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{email.body3}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button onClick={saveEdit} style={{ background: "#44ff88", color: "#000", border: "none", padding: "10px 24px", fontSize: "12px", fontWeight: 500 }}>SAVE</button>
                <button onClick={() => setEditing(false)} style={{ background: "#111", color: "#555", border: "1px solid #222", padding: "10px 20px", fontSize: "12px" }}>CANCEL</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
