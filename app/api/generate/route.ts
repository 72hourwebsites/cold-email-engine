import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { assignVariant } from "@/lib/ab-testing";

export const runtime = "nodejs";
export const maxDuration = 300;

// ─── STEP-TO-MODEL TIERING (Phase 2) ─────────────────────────────────────────
// Maps each email step to the recommended model/provider type.
// Actual providers configured in Phase 3 — here we define the routing logic.

const STEP_MODEL_MAP: Record<string, { recommended: string; fallback: string; minTokens: number; temp: number }> = {
  step1: { recommended: "deepseek", fallback: "deepseek", minTokens: 350, temp: 0.75 },
  step2: { recommended: "deepseek", fallback: "deepseek", minTokens: 400, temp: 0.7 },
  step3: { recommended: "deepseek", fallback: "deepseek", minTokens: 350, temp: 0.72 },
  step4: { recommended: "deepseek", fallback: "deepseek", minTokens: 250, temp: 0.65 },
};

// ─── BAN LIST (fast client-side check before quality gate) ────────────────────

const BANNED_PREFIXES = [
  /^(boost|elevate|unlock|transform|maximize|supercharge|enhance|optimize)/i,
];

// ─── ROUND-ROBIN COUNTER ──────────────────────────────────────────────────────
// Cycles through providers to spread load and avoid rate limits
let providerIdx = 0;

// ─── EMAIL PARSER ─────────────────────────────────────────────────────────────
function parseEmailOutput(raw: string): { subject: string; body: string } {
  const cleaned = raw.replace(/\*{1,2}(Subject(?:\s+Line)?:)\*{1,2}/gi, "$1").trim();
  const subjectMatch = cleaned.match(/^\[?Subject(?:\s+Line)?:?\]?\s*(.+?)(?:\n|$)/im);
  if (!subjectMatch) {
    const lines = cleaned.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2 && lines[0].length <= 120) {
      return { subject: lines[0], body: lines.slice(1).join("\n").trim() };
    }
    return { subject: "", body: cleaned };
  }
  const subject = subjectMatch[1].trim().replace(/^\[|\]$/g, "").replace(/\*{1,2}/g, "");
  const afterSubject = cleaned.slice(cleaned.indexOf(subjectMatch[0]) + subjectMatch[0].length);
  const body = afterSubject.replace(/^\s*\n+/, "").trim();
  return { subject, body };
}

function qualityIssue(subject: string, body: string): string | null {
  if (!subject || subject.length < 4) return "missing_subject";
  if (/^(boost|elevate|unlock|transform|maximize|supercharge|enhance|optimize)/i.test(subject.trim()))
    return `banned_start:${subject.split(" ")[0]}`;
  if (!body || body.trim().split(/\s+/).length < 10) return "body_too_short";
  return null;
}

// ─── PROVIDER DEFINITIONS ─────────────────────────────────────────────────────
interface Provider {
  name: string;
  type: "openai" | "gemini" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string;
}

function buildProviders(config: Record<string, string>): Provider[] {
  const providers: Provider[] = [];

  // Phase 3: Tiered model providers
  // DeepSeek V3 — best for creative steps (step1, step3)
  if (config.deepseekKey) {
    providers.push({ name: "DeepSeek", type: "openai", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: config.deepseekKey });
  }
  // OpenRouter — access to GPT-4o, gpt-4o-mini, and fallbacks
  if (config.openrouterKey) {
    providers.push({ name: "OpenRouter", type: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o", apiKey: config.openrouterKey });
  }

  // Groq
  if (config.groqKey) {
    providers.push({ name: "Groq", type: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", apiKey: config.groqKey });
  }

  // Gemini
  if (config.geminiKey) {
    providers.push({ name: "Gemini", type: "gemini", baseUrl: "", model: config.geminiModel || "gemini-flash-latest", apiKey: config.geminiKey });
  }

  // Local LM Studio / Gemma
  if (config.localUrl) {
    providers.push({ name: "Local", type: "openai", baseUrl: config.localUrl, model: config.localModel || "google/gemma-4-e4b", apiKey: "lm-studio" });
  }

  // Single cloud provider (legacy)
  if (providers.length === 0 && config.cloudApiKey && config.baseUrl) {
    if (config.baseUrl.includes("groq")) {
      providers.push({ name: "Groq", type: "openai", baseUrl: config.baseUrl, model: config.model, apiKey: config.cloudApiKey });
    } else if (config.baseUrl.includes("googleapis")) {
      providers.push({ name: "Gemini", type: "gemini", baseUrl: "", model: config.model || "gemini-flash-latest", apiKey: config.cloudApiKey });
    } else if (config.model?.startsWith("claude")) {
      providers.push({ name: "Claude", type: "anthropic", baseUrl: "", model: config.model, apiKey: config.anthropicApiKey });
    } else {
      providers.push({ name: "Local", type: "openai", baseUrl: config.baseUrl, model: config.model, apiKey: "lm-studio" });
    }
  }

  // Reorder providers — all steps prefer DeepSeek now
  const step = config.step || "step1";
  const preferredName: Record<string, string> = {
    step1: "DeepSeek",
    step2: "DeepSeek",
    step3: "DeepSeek",
    step4: "DeepSeek",
  };

  const preferred = preferredName[step];
  if (preferred) {
    // Move preferred provider to front, keep relative order of others
    const prefs = providers.filter(p => p.name === preferred);
    const others = providers.filter(p => p.name !== preferred);
    providers.length = 0;
    providers.push(...prefs, ...others);
  }

  return providers;
}

// ─── CALL FUNCTIONS ───────────────────────────────────────────────────────────
async function callOpenAI(prompt: string, systemPrompt: string, p: Provider, maxTokens: number, temp: number): Promise<string> {
  const client = new OpenAI({ baseURL: p.baseUrl, apiKey: p.apiKey, timeout: 60_000, maxRetries: 0 });
  const completion = await client.chat.completions.create({
    model: p.model,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
    temperature: temp, max_tokens: maxTokens,
  });
  return completion.choices[0]?.message?.content ?? "";
}

async function callGemini(prompt: string, systemPrompt: string, p: Provider, maxTokens: number, temp: number): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": p.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: temp },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callAnthropic(prompt: string, systemPrompt: string, p: Provider, maxTokens: number, temp: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": p.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: p.model, max_tokens: maxTokens, temperature: temp, system: systemPrompt, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`); }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function callProvider(prompt: string, systemPrompt: string, p: Provider, maxTokens: number, temp: number): Promise<string> {
  if (p.type === "gemini") return callGemini(prompt, systemPrompt, p, maxTokens, temp);
  if (p.type === "anthropic") return callAnthropic(prompt, systemPrompt, p, maxTokens, temp);
  return callOpenAI(prompt, systemPrompt, p, maxTokens, temp);
}

// ─── MAIN ROUTE ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { prompt, systemPrompt, config, email } = await req.json();
    const step = config.step || "step1";

    // Phase 5: A/B test variant assignment
    const variant = email ? assignVariant(email, step) : "A";

    // Step-aware model tiering
    const stepConfig = STEP_MODEL_MAP[step] || STEP_MODEL_MAP.step1;
    const maxTokens = config.maxTokens ?? stepConfig.minTokens;
    const temp = config.temperature ?? stepConfig.temp;

    const providers = buildProviders(config);
    if (providers.length === 0) {
      return NextResponse.json({ error: "No providers configured. Add API keys in Step 1." }, { status: 400 });
    }

    // Round-robin: start from next provider in sequence
    const startIdx = providerIdx % providers.length;
    providerIdx++;

    let raw = "";
    let lastError = "";

    // Try each provider, cycling from startIdx
    for (let i = 0; i < providers.length; i++) {
      const p = providers[(startIdx + i) % providers.length];
      try {
        raw = await callProvider(prompt, systemPrompt, p, maxTokens, temp);
        if (raw && raw.trim().length > 20) {
          break; // Success — stop trying
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `${p.name}: ${msg.slice(0, 100)}`;
        // 429 = rate limit, try next provider
        // Connection errors on local = try next provider
        // Other errors = also try next
        continue;
      }
    }

    if (!raw || raw.trim().length < 20) {
      return NextResponse.json({ error: lastError || "All providers failed" }, { status: 500 });
    }

    let { subject, body } = parseEmailOutput(raw);

    // Phase 2: quality gate with full ban list + length checks
    const { qualityGate } = await import("@/lib/prompt");
    let gate = qualityGate(subject, body);

    // Auto-retry on banned phrases or low-quality output (up to 2 retries)
    for (let retry = 0; retry < 2 && !gate.pass; retry++) {
      const fixPrompt = [
        prompt,
        "\n\nIMPORTANT: The previous output had issues that MUST be fixed:",
        ...gate.banned.map(p => `- BANNED PHRASE: "${p}" — DO NOT use this phrase`),
        ...gate.issues.map(i => `- ISSUE: ${i}`),
        "Rewrite the entire email now. Follow the format exactly.",
      ].join("\n");

      try {
        const p = providers[startIdx % providers.length];
        const retryRaw = await callProvider(fixPrompt, systemPrompt, p, maxTokens, Math.min(temp + 0.1, 1.0));
        const retry = parseEmailOutput(retryRaw);
        gate = qualityGate(retry.subject, retry.body);
        if (gate.pass) {
          subject = retry.subject;
          body = retry.body;
          raw = retryRaw;
        }
      } catch { /* use last good version */ }
    }

    return NextResponse.json({ subject, body, raw, step, variant, quality: gate });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
