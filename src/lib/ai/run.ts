import Anthropic from "@anthropic-ai/sdk";
import { getSetting, type AiSettings } from "../settings";
import { decrypt } from "../crypto";
import { modelMatchesProvider } from "./models";
import { documentText, isPdf, type SourceDoc } from "./text";
import { TENDER_SCHEMA, CONTRACT_SCHEMA, CV_SCHEMA, FINANCIAL_SCHEMA, type TenderExtraction, type ContractExtraction, type CvExtraction, type FinancialDraft } from "./schemas";

export class AiError extends Error {}

type Kind = "TENDER" | "CONTRACT" | "CV" | "FINANCIAL";
export type RunResult<T> = { data: T; provider: string; model: string; inputTokens?: number; outputTokens?: number };

const MAX_PDF_BYTES = 24 * 1024 * 1024; // Claude request limit is 32 MB (base64 adds ~33%)
const MAX_TEXT_CHARS = 600_000; // ~150k tokens; beyond this we ask the user to split rather than silently truncate

// Claude models that accept output_config.effort, and those that also support server-side refusal fallbacks ("default" routing)
const EFFORT_CLAUDE = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2", "claude-fable-5-1"];
const FALLBACK_CLAUDE = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"];

function instructions(kind: Kind) {
  const today = new Date().toISOString().slice(0, 10);
  const common = `You extract structured data for Filoi Private Limited, an Indian public-health and digital-health consulting firm that bids for UN agency, multilateral and government assignments.
Today's date is ${today}.
Rules:
- Use only what the documents say. If a text value is not stated, return an empty string ""; if a number is not stated, return null; if a list has nothing, return []. Never invent dates, amounts or names.
- Dates: ISO 8601. If a date is relative ("30 days after signature") and the anchor date is known, compute it; otherwise leave the date null and keep the wording in the timing field.
- Amounts: plain numbers without currency symbols or thousands separators.
- Evidence: give a short verbatim quote (under 30 words) for each key value you filled — title, client, deadline(s), budget/value, evaluation, and any payment terms — with the page number when you can tell it.
- If several documents are given (e.g. TOR plus annexes), combine them.
- File names are not data: never use a file name as a value (e.g. for source or reference).`;
  if (kind === "FINANCIAL")
    return `${common}
Task: prepare the financial proposal (cost breakdown) for this bid.
- Fee lines: one per proposed team member, using their daily rate converted to the proposal currency when given, and person-days consistent with the TOR, the duration and the work plan.
- Add travel, per diem / DSA and other direct costs only where the TOR implies them (missions, workshops, printing, translation), with realistic quantities.
- Follow the structure of the past financial proposals provided, if any. Where a number is your estimate, say so in "basis". Stay within any budget ceiling stated in the TOR.
- Do not add taxes; they are handled separately.`;
  if (kind === "CV")
    return `${common}
Task: read this CV / résumé and capture the expert's profile for a consulting firm's CV bank. Summarise in the third person, factual, no embellishment.`;
  if (kind === "TENDER")
    return `${common}
Task: read this tender (TOR / RFP / EOI) and capture what the bid team needs to decide and to prepare the proposal. Write scope_summary and eligibility in clear, concise English. List every document the bidder must submit in required_documents. Flag anything risky or unusual in risks.`;
  return `${common}
Task: read this contract / purchase order and capture the deliverables with their due dates, and the payment schedule. Link each payment to the deliverable it depends on using the deliverable's exact title. If payments are given only as percentages and the contract value is known, also fill the amount.`;
}

async function config(kind?: Kind): Promise<AiSettings & { apiKey: string }> {
  const stored = await getSetting("ai");
  // CVs and contracts can use the cheaper "quick reading" model; TORs and drafting use the main model
  const useLight = (kind === "CV" || kind === "CONTRACT") && !!stored.lightModel && modelMatchesProvider(stored.provider, stored.lightModel);
  const ai = useLight ? { ...stored, model: stored.lightModel } : stored;
  if (!ai.enabled) throw new AiError("AI is switched off. An admin can enable it in Settings → AI.");
  const apiKey = decrypt(ai.apiKeyEnc);
  if (ai.provider !== "ollama" && !apiKey) throw new AiError("No API key saved. An admin can add one in Settings → AI.");
  if (!ai.model) throw new AiError("No model selected in Settings → AI.");
  if (!modelMatchesProvider(ai.provider, ai.model)) throw new AiError(`The model “${ai.model}” doesn't match the ${ai.provider} provider. Pick a model in Settings → AI.`);
  return { ...ai, apiKey };
}

async function textBundle(docs: SourceDoc[]) {
  const parts: string[] = [];
  for (const d of docs) {
    const t = await documentText(d);
    if (!t.trim()) throw new AiError(`${d.fileName} has no readable text (probably a scanned PDF). Use Claude or Gemini in Settings → AI — they can read scanned pages.`);
    parts.push(`=== Document: ${d.fileName} ===\n${t}`);
  }
  const all = parts.join("\n\n");
  if (all.length > MAX_TEXT_CHARS)
    throw new AiError(`These documents are very long (${Math.round(all.length / 1000)}k characters). Upload the main TOR / contract only, without large annexes.`);
  return all;
}

/** Empty strings → null, blank list items dropped, unknown page 0 → null (schemas use "" instead of null to stay within Claude's limits). */
export function normalise(v: unknown, key = ""): unknown {
  if (typeof v === "string") { const t = v.trim(); return t === "" ? null : t; }
  if (Array.isArray(v)) return v.map((x) => normalise(x)).filter((x) => x !== null && x !== "");
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalise(x, k)]));
  if (key === "page" && v === 0) return null;
  return v;
}

function parseJson<T>(text: string): T {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return normalise(JSON.parse(clean)) as T;
  } catch {
    throw new AiError("The AI response could not be read. Please try again.");
  }
}

// ── Anthropic Claude (official SDK). PDFs go in as documents, so scanned pages are read too. ──
async function runClaude<T>(cfg: Awaited<ReturnType<typeof config>>, kind: Kind, docs: SourceDoc[], schema: object): Promise<RunResult<T>> {
  const client = new Anthropic({ apiKey: cfg.apiKey, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}) });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let pdfBytes = 0;
  for (const d of docs) {
    if (isPdf(d) && pdfBytes + d.buffer.length <= MAX_PDF_BYTES) {
      pdfBytes += d.buffer.length;
      content.push({ type: "document", title: d.fileName, source: { type: "base64", media_type: "application/pdf", data: d.buffer.toString("base64") } });
    } else {
      const t = await documentText(d);
      if (!t.trim()) throw new AiError(`${d.fileName} is too large to send as a scanned PDF and has no text layer. Upload a smaller file.`);
      content.push({ type: "document", title: d.fileName, source: { type: "text", media_type: "text/plain", data: t } });
    }
  }
  content.push({ type: "text", text: kind === "TENDER" ? "Extract the tender details." : kind === "CV" ? "Extract the CV details." : kind === "FINANCIAL" ? "Prepare the financial proposal." : "Extract the contract details." });

  const stream = client.beta.messages.stream({
    model: cfg.model,
    max_tokens: 32000,
    system: instructions(kind),
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: schema as Record<string, unknown> }, ...(EFFORT_CLAUDE.includes(cfg.model) ? { effort: "medium" as const } : {}) },
    // If Claude's safety filter declines a document, the API retries on a suitable fallback model in the same call.
    ...(FALLBACK_CLAUDE.includes(cfg.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Claude rejected the API key. Check it in Settings → AI.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude rate limit reached. Wait a minute and try again.");
    if (e instanceof Anthropic.BadRequestError) {
      const detail = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
      throw new AiError(`Claude could not process this document: ${detail.slice(0, 220)}`);
    }
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude API error ${e.status ?? ""}: ${e.message}`);
    throw e;
  }
  if (msg.stop_reason === "refusal") throw new AiError("The model declined to process this document.");
  if (msg.stop_reason === "max_tokens") throw new AiError("The document produced too much output. Upload the main document only and try again.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { data: parseJson<T>(text), provider: "anthropic", model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
}

// ── OpenAI-compatible chat completions (text only) ──
async function runOpenAI<T>(cfg: Awaited<ReturnType<typeof config>>, kind: Kind, docs: SourceDoc[], schema: object): Promise<RunResult<T>> {
  const text = await textBundle(docs);
  const res = await fetch(`${cfg.baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "system", content: instructions(kind) }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: { name: kind.toLowerCase(), strict: true, schema } },
    }),
  });
  if (!res.ok) throw new AiError(`OpenAI error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { data: parseJson<T>(j.choices?.[0]?.message?.content ?? ""), provider: "openai", model: cfg.model, inputTokens: j.usage?.prompt_tokens, outputTokens: j.usage?.completion_tokens };
}

// ── Google Gemini (reads PDFs natively) ──
async function runGemini<T>(cfg: Awaited<ReturnType<typeof config>>, kind: Kind, docs: SourceDoc[], schema: object): Promise<RunResult<T>> {
  const parts: object[] = [];
  for (const d of docs) {
    if (isPdf(d) && d.buffer.length <= 18 * 1024 * 1024) parts.push({ inline_data: { mime_type: "application/pdf", data: d.buffer.toString("base64") } });
    else parts.push({ text: `=== ${d.fileName} ===\n${await documentText(d)}` });
  }
  parts.push({ text: `Return JSON matching this JSON Schema exactly:\n${JSON.stringify(schema)}` });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({ system_instruction: { parts: [{ text: instructions(kind) }] }, contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } }),
  });
  if (!res.ok) throw new AiError(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const out = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return { data: parseJson<T>(out), provider: "gemini", model: cfg.model, inputTokens: j.usageMetadata?.promptTokenCount, outputTokens: j.usageMetadata?.candidatesTokenCount };
}

// ── Ollama (local, free; text only) ──
async function runOllama<T>(cfg: Awaited<ReturnType<typeof config>>, kind: Kind, docs: SourceDoc[], schema: object): Promise<RunResult<T>> {
  const text = await textBundle(docs);
  const res = await fetch(`${cfg.baseUrl || "http://localhost:11434"}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, stream: false, format: schema, messages: [{ role: "system", content: instructions(kind) }, { role: "user", content: text }] }),
  }).catch(() => { throw new AiError("Could not reach Ollama. Is it running?"); });
  if (!res.ok) throw new AiError(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { data: parseJson<T>(j.message?.content ?? ""), provider: "ollama", model: cfg.model, inputTokens: j.prompt_eval_count, outputTokens: j.eval_count };
}

async function run<T>(kind: Kind, docs: SourceDoc[], schema: object): Promise<RunResult<T>> {
  if (!docs.length) throw new AiError("No documents to read.");
  const cfg = await config(kind);
  switch (cfg.provider) {
    case "anthropic": return runClaude<T>(cfg, kind, docs, schema);
    case "openai": return runOpenAI<T>(cfg, kind, docs, schema);
    case "gemini": return runGemini<T>(cfg, kind, docs, schema);
    case "ollama": return runOllama<T>(cfg, kind, docs, schema);
    default: throw new AiError(`Unknown AI provider: ${cfg.provider}`);
  }
}

export const extractTender = (docs: SourceDoc[]) => run<TenderExtraction>("TENDER", docs, TENDER_SCHEMA);
export const extractContract = (docs: SourceDoc[]) => run<ContractExtraction>("CONTRACT", docs, CONTRACT_SCHEMA);
export const extractCv = (docs: SourceDoc[]) => run<CvExtraction>("CV", docs, CV_SCHEMA);
/** Cost breakdown from a text context bundle (TOR, team with rates, past financial proposals). */
export const draftFinancialLines = (context: string) =>
  run<FinancialDraft>("FINANCIAL", [{ fileName: "bid-context.txt", mimeType: "text/plain", buffer: Buffer.from(context, "utf8") }], FINANCIAL_SCHEMA);

// ── Free-text drafting (proposal sections) ──
export type DraftResult = { text: string; provider: string; model: string; cacheRead?: number; cacheWrite?: number; inputTokens?: number };

/**
 * Generate prose from a system prompt, a stable context bundle and a per-request part.
 * With Claude the stable part is prompt-cached for 1 hour, so drafting the next sections of the same proposal re-reads it at ~5% of the price.
 */
export async function draftText(system: string, stable: string, request: string): Promise<DraftResult> {
  const cfg = await config();
  const user = `${stable}\n\n=== YOUR TASK ===\n${request}`;
  if (user.length > MAX_TEXT_CHARS) throw new AiError("Too much context for one request. Remove some library documents or shorten the TOR.");
  if (cfg.provider === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.apiKey, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}) });
    try {
      const msg = await client.beta.messages
        .stream({
          model: cfg.model,
          max_tokens: 16000,
          system: [{ type: "text", text: system }],
          messages: [{
            role: "user",
            content: [
              // breakpoint after the stable context: system + this block form the cached prefix
              { type: "text", text: stable, cache_control: { type: "ephemeral", ttl: "1h" } },
              { type: "text", text: `=== YOUR TASK ===\n${request}` },
            ],
          }],
          ...(EFFORT_CLAUDE.includes(cfg.model) ? { output_config: { effort: "medium" as const } } : {}),
          ...(FALLBACK_CLAUDE.includes(cfg.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        })
        .finalMessage();
      if (msg.stop_reason === "refusal") throw new AiError("The model declined to write this section.");
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      if (msg.stop_reason === "max_tokens") throw new AiError("The draft was too long and got cut off. Ask for a shorter section.");
      return { text, provider: "anthropic", model: msg.model, cacheRead: msg.usage.cache_read_input_tokens ?? 0, cacheWrite: msg.usage.cache_creation_input_tokens ?? 0, inputTokens: msg.usage.input_tokens };
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new AiError("Claude rejected the API key. Check it in Settings → AI.");
      if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude rate limit reached. Wait a minute and try again.");
      if (e instanceof Anthropic.APIError) throw new AiError(`Claude API error ${e.status ?? ""}: ${e.message}`);
      throw e;
    }
  }
  if (cfg.provider === "openai") {
    const res = await fetch(`${cfg.baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!res.ok) throw new AiError(`OpenAI error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    return { text: (j.choices?.[0]?.message?.content ?? "").trim(), provider: "openai", model: cfg.model };
  }
  if (cfg.provider === "gemini") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }),
    });
    if (!res.ok) throw new AiError(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    return { text: (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim(), provider: "gemini", model: cfg.model };
  }
  const res = await fetch(`${cfg.baseUrl || "http://localhost:11434"}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  }).catch(() => { throw new AiError("Could not reach Ollama. Is it running?"); });
  if (!res.ok) throw new AiError(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: (j.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(), provider: "ollama", model: cfg.model };
}

export async function aiReady() {
  const ai = await getSetting("ai");
  return ai.enabled && (ai.provider === "ollama" || !!ai.apiKeyEnc) && !!ai.model;
}
