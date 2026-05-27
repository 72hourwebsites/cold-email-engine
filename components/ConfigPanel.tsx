"use client";

import { useState } from "react";
import { LMConfig, CLOUD_PRESETS } from "@/lib/types";

interface Props {
  config: LMConfig;
  onChange: (c: LMConfig) => void;
  onNext: () => void;
}

const label = (text: string) => (
  <div style={{ fontSize: "10px", color: "#555", letterSpacing: "1px", marginBottom: "6px" }}>{text}</div>
);

export default function ConfigPanel({ config, onChange, onNext }: Props) {
  const [testing, setTesting] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");

  const set = (k: keyof LMConfig, v: string | number) =>
    onChange({ ...config, [k]: v });

  const testConnection = async () => {
    setTesting("loading");
    setTestMsg("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Reply with exactly: CONNECTED",
          systemPrompt: "You are a connection test. Reply with CONNECTED.",
          config: { ...config, maxTokens: 20, temperature: 0 },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTesting("ok");
      setTestMsg(data.raw?.slice(0, 80) || "OK");
    } catch (e: unknown) {
      setTesting("fail");
      setTestMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const inp = {
    style: {
      width: "100%", padding: "10px 14px", fontSize: "13px",
      background: "#111", color: "#e8e8e0", border: "1px solid #2a2a2a",
      borderRadius: "2px",
    }
  };

  return (
    <div>
      <SectionTitle>01 — LM STUDIO CONFIG</SectionTitle>
      <p style={{ color: "#555", fontSize: "12px", marginBottom: "28px" }}>
        Connect your local LM Studio instance. The app calls your LLM server-side so there are no CORS issues.
      </p>

      {/* Multi-provider round-robin */}
      <div style={{ background: "#0a1a0a", border: "1px solid #1a3a1a", padding: "16px 20px", marginBottom: "20px", maxWidth: "780px" }}>
        <div style={{ color: "#44ff88", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>🔄 MULTI-PROVIDER ROUND-ROBIN</div>
        <div style={{ color: "#3a7a3a", fontSize: "11px", marginBottom: "12px" }}>Add keys for multiple providers — the app cycles through them automatically to avoid rate limits.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            {label("GROQ API KEY (gsk_...)")}
            <input {...inp} type="password" value={config.groqKey || ""} onChange={e => set("groqKey", e.target.value)} placeholder="gsk_... (free at console.groq.com)" />
          </div>
          <div>
            {label("GEMINI API KEY (AIza...)")}
            <input {...inp} type="password" value={config.geminiKey || ""} onChange={e => set("geminiKey", e.target.value)} placeholder="AIza... (free at ai.google.dev)" />
          </div>
          <div>
            {label("DEEPSEEK API KEY (sk-...)")}
            <input {...inp} type="password" value={config.deepseekKey || ""} onChange={e => set("deepseekKey", e.target.value)} placeholder="sk-... (platform.deepseek.com)" />
          </div>
          <div>
            {label("OPENROUTER API KEY")}
            <input {...inp} type="password" value={config.openrouterKey || ""} onChange={e => set("openrouterKey", e.target.value)} placeholder="sk-or-... (openrouter.ai/keys)" />
          </div>
          <div>
            {label("LOCAL LM STUDIO URL")}
            <input {...inp} value={config.localUrl || ""} onChange={e => set("localUrl", e.target.value)} placeholder="http://192.168.4.59:1234/v1" />
          </div>
          <div>
            {label("LOCAL MODEL")}
            <input {...inp} value={config.localModel || ""} onChange={e => set("localModel", e.target.value)} placeholder="google/gemma-4-e4b" />
          </div>
        </div>
        <div style={{ fontSize: "10px", color: "#3a5a3a", marginTop: "8px" }}>
          Active providers: {[config.groqKey && "Groq", config.geminiKey && "Gemini", config.deepseekKey && "DeepSeek", config.openrouterKey && "OpenRouter", config.localUrl && "Local"].filter(Boolean).join(" → ") || "None configured"}
        </div>
      </div>

      {/* Cloud provider quick-select */}
      <div style={{ marginBottom: "20px", maxWidth: "780px" }}>
        <div style={{ fontSize: "10px", color: "#444", letterSpacing: "1px", marginBottom: "8px" }}>SINGLE PROVIDER (fallback)</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {Object.entries(CLOUD_PRESETS).map(([key, p]) => (
            <button key={key} onClick={() => {
              onChange({ ...config, baseUrl: p.baseUrl, model: p.freeModel });
            }}
              style={{ background: config.baseUrl === p.baseUrl ? "#0a1a0a" : "#111", color: config.baseUrl === p.baseUrl ? "#44ff88" : "#555", border: `1px solid ${config.baseUrl === p.baseUrl ? "#1a3a1a" : "#222"}`, padding: "8px 14px", fontSize: "11px", cursor: "pointer" }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => onChange({ ...config, baseUrl: "http://192.168.4.59:1234/v1", model: "google/gemma-4-e4b" })}
            style={{ background: config.baseUrl?.includes("192.168") ? "#0a0a1a" : "#111", color: config.baseUrl?.includes("192.168") ? "#44aaff" : "#555", border: `1px solid ${config.baseUrl?.includes("192.168") ? "#1a1a3a" : "#222"}`, padding: "8px 14px", fontSize: "11px", cursor: "pointer" }}>
            🖥 Local (Gemma)
          </button>
        </div>
      </div>

      {/* Cloud API key — shown for Groq / Together / OpenRouter */}
      {!config.baseUrl?.includes("192.168") && !config.model?.startsWith("claude") && (
        <div style={{ background: "#0a1a0a", border: "1px solid #1a3a1a", padding: "14px 18px", marginBottom: "20px", maxWidth: "780px" }}>
          <div style={{ color: "#44ff88", fontSize: "12px", fontWeight: 500, marginBottom: "8px" }}>
            {Object.values(CLOUD_PRESETS).find(p => p.baseUrl === config.baseUrl)?.label || "☁️ Cloud API"} — API KEY
          </div>
          <input {...inp} type="password" value={config.cloudApiKey || ""} onChange={e => set("cloudApiKey", e.target.value)} placeholder="Your API key..." />
          <div style={{ fontSize: "11px", color: "#3a7a3a", marginTop: "6px" }}>
            {Object.values(CLOUD_PRESETS).find(p => p.baseUrl === config.baseUrl)?.note || "OpenAI-compatible API key"}
          </div>
        </div>
      )}

      {/* Claude API banner */}
      {config.model?.startsWith("claude") && (
        <div style={{ background: "#0a0a1a", border: "1px solid #44aaff44", padding: "14px 18px", marginBottom: "20px", maxWidth: "780px" }}>
          <div style={{ color: "#44aaff", fontSize: "12px", fontWeight: 500, marginBottom: "8px" }}>🧠 CLAUDE API MODE</div>
          <input {...inp} type="password" value={config.anthropicApiKey || ""} onChange={e => set("anthropicApiKey", e.target.value)} placeholder="sk-ant-api03-..." />
          <div style={{ fontSize: "11px", color: "#3a3a6a", marginTop: "6px" }}>~$0.20/500 emails (Haiku) · ~$2.40/500 emails (Sonnet)</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", maxWidth: "780px" }}>
        <div>
          {label("LM STUDIO BASE URL")}
          <input {...inp} value={config.baseUrl} onChange={e => set("baseUrl", e.target.value)} placeholder="http://192.168.86.189:1234/v1"
            style={{ ...inp.style, opacity: config.model.startsWith("claude") ? 0.4 : 1 }} />
          <div style={{ fontSize: "11px", color: "#444", marginTop: "5px" }}>
            {config.model.startsWith("claude") ? "Not used in Claude mode" : "Your LM Studio API URL (OpenAI-compatible)"}
          </div>
        </div>
        <div>
          {label("MODEL ID")}
          <input {...inp} value={config.model} onChange={e => set("model", e.target.value)} placeholder="claude-haiku-4-5 or google/gemma-4-e4b" />
          <div style={{ fontSize: "11px", color: "#444", marginTop: "5px" }}>
            Claude: <code style={{ color: "#44aaff" }}>claude-haiku-4-5</code> or <code style={{ color: "#44aaff" }}>claude-sonnet-4-5</code>
          </div>
        </div>
        <div>
          {label("TEMPERATURE")}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="range" min="0" max="1.5" step="0.05"
              value={config.temperature}
              onChange={e => set("temperature", parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: "#44ff88" }}
            />
            <span style={{ color: "#e8ff00", fontSize: "14px", minWidth: "36px" }}>{config.temperature}</span>
          </div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "5px" }}>Higher = more creative emails</div>
        </div>
        <div>
          {label("MAX TOKENS PER EMAIL")}
          <input {...inp} type="number" value={config.maxTokens} onChange={e => set("maxTokens", parseInt(e.target.value))} min={100} max={2000} />
          <div style={{ fontSize: "11px", color: "#444", marginTop: "5px" }}>600 = ~120 word email with headroom</div>
        </div>
        <div>
          {label("CONCURRENCY (PARALLEL REQUESTS)")}
          <div style={{ display: "flex", gap: "8px" }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => set("concurrency", n)}
                style={{
                  flex: 1, padding: "10px 0", fontSize: "14px",
                  background: config.concurrency === n ? "#e8ff00" : "#1a1a1a",
                  color: config.concurrency === n ? "#000" : "#555",
                  border: `1px solid ${config.concurrency === n ? "#e8ff00" : "#2a2a2a"}`,
                }}
              >{n}</button>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "5px" }}>Parallel LLM requests — start at 2-3</div>
        </div>
      </div>

      {/* Reoon Email Verification */}
      <div style={{ marginTop: "32px", background: "#0a0a1a", border: "1px solid #1a1a3a", padding: "20px", maxWidth: "780px" }}>
        <div style={{ fontSize: "12px", color: "#44aaff", fontWeight: 500, marginBottom: "4px" }}>
          📧 REOON EMAIL VERIFICATION
        </div>
        <div style={{ fontSize: "11px", color: "#3a3a6a", marginBottom: "14px" }}>
          Verifies emails from LeadRocks CSVs before sending. Free plan at reoon.com — paste your API key below.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "end" }}>
          <div suppressHydrationWarning>
            {label("REOON API KEY")}
            <input
              {...inp}
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-keeper-ignore="true"
              suppressHydrationWarning
              value={config.reoonApiKey}
              onChange={e => set("reoonApiKey", e.target.value)}
              placeholder="Your Reoon API key from reoon.com"
            />
          </div>
          <div>
            {label("MODE")}
            <div style={{ display: "flex", gap: "6px" }}>
              {(["quick", "power"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => set("reoonMode", m)}
                  style={{
                    padding: "10px 16px", fontSize: "11px",
                    background: config.reoonMode === m ? "#0a0a1a" : "#111",
                    color: config.reoonMode === m ? "#44aaff" : "#444",
                    border: `1px solid ${config.reoonMode === m ? "#1a1a3a" : "#222"}`,
                    cursor: "pointer",
                  }}
                >
                  {m === "quick" ? "⚡ Quick" : "🔬 Power"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ fontSize: "10px", color: "#2a2a4a", marginTop: "8px" }}>
          Quick = fast (5-10s/email, DNS check) · Power = accurate (15-25s/email, full SMTP)
        </div>
      </div>

      {/* Test connection */}
      <div style={{ marginTop: "32px", display: "flex", alignItems: "center", gap: "16px" }}>
        <button
          onClick={testConnection}
          disabled={testing === "loading"}
          style={{
            background: "#111", color: "#44ff88", border: "1px solid #44ff88",
            padding: "10px 20px", fontSize: "12px", letterSpacing: "0.5px",
            opacity: testing === "loading" ? 0.6 : 1,
          }}
        >
          {testing === "loading" ? "⟳ TESTING..." : "⚡ TEST CONNECTION"}
        </button>
        {testing === "ok" && <span style={{ color: "#44ff88", fontSize: "12px" }}>✓ CONNECTED — {testMsg}</span>}
        {testing === "fail" && <span style={{ color: "#ff3b3b", fontSize: "12px" }}>✗ FAILED — {testMsg}</span>}
      </div>

      <div style={{ marginTop: "40px" }}>
        <button
          onClick={onNext}
          style={{ background: "#e8ff00", color: "#000", border: "none", padding: "12px 32px", fontSize: "13px", fontWeight: 500, letterSpacing: "0.5px" }}
        >
          NEXT: UPLOAD CSV →
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="syne" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "12px", letterSpacing: "-0.5px" }}>
      {children}
    </div>
  );
}
