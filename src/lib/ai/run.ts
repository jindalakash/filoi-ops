import Anthropic from "@anthropic-ai/sdk";
import { getSetting, type AiSettings } from "../settings";
import { decrypt } from "../crypto";
import { documentText, isPdf, type SourceDoc } from "./text";
import { TENDER_SCHEMA, CONTRACT_SCHEMA, type TenderExtraction, type ContractExtraction } from "./schemas";

export class AiError extends Error {}

type Kind = "TENDER" | "CONTRACT";
export type RunResult<T> = { data: T; provider: string; model: string; inputTokens?: number; outputTokens?: number };

const MAX_PDF_BYTES = 24 * 1024 * 1024; // Claude request limit is 32 MB (base64 adds ~33%)
const MAX_TEXT_CHARS = 600_000; // ~150k tokens; beyond this we ask the user to split rather than silently truncate

// Claude models that accept output_config.effort and server-side refusal fallbacks ("default" routing)
const MODERN_CLAUDE = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"];

function instructions(kind: Kind) {
  const today = new Date().toISOString().slice(0, 10);
  const common = `You extract structured data for Filoi Private Limited, an Indian public-health and digital-health consulting firm that bids for UN agency, multilateral and government assignments.
Today's date is ${today}.
Rules:
- Use only what the documents say. If a value is not stated, return null (or an empty list). Never invent dates, amounts or names.
- Dates: ISO 8601. If a date is relative ("30 days after signature") and the anchor date is known, compute it; otherwise leave the date null and keep the wording in the timing field.
- Amounts: plain numbers without currency symbols or thousands separators.
- Evidence: give a short verbatim quote (under 30 words) for each key value you filled — title, client, deadline(s), budget/value, evaluation, and any payment terms — with the page number when you can tell it.
- If several documents are given (e.g. TOR plus annexes), combine them.
- File names are not data: never use a file name as a value (e.g. for source or reference).`;
  if (kind === "TENDER")
    return `${common}
Task: read this tender (TOR / RFP / EOI) and capture what the bid team needs to decide and to prepare the proposal. Write scope_summary and eligibility in clear, concise English. List every document the bidder must submit in required_documents. Flag anything risky or unusual in risks.`;
  return `${common}
Task: read this contract / purchase order and capture the deliverables with their due dates, and the payment schedule. Link each payment to the deliverable it depends on using the deliverable's exact title. If payments are given only as percentages and the contract value is known, also fill the amount.`;
}

async function config(): Promise<AiSettings & { apiKey: string }> {
  const ai = await getSetting("ai");
  if (!ai.enabled) throw new AiError("AI is switched off. An admin can enable it in Settings → AI.");
  const apiKey = decrypt(ai.apiKeyEnc);
  if (ai.provider !== "ollama" && !apiKey) throw new AiError("No API key saved. An admin can add one in Settings → AI.");
  if (!ai.model) throw new AiError("No model selected in Settings → AI.");
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

function parseJson<T>(text: string): T {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(clean) as T;
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
  content.push({ type: "text", text: kind === "TENDER" ? "Extract the tender details." : "Extract the contract details." });

  const modern = MODERN_CLAUDE.includes(cfg.model);
  const stream = client.beta.messages.stream({
    model: cfg.model,
    max_tokens: 32000,
    system: instructions(kind),
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: schema as Record<string, unknown> }, ...(modern ? { effort: "medium" as const } : {}) },
    // If Claude's safety filter declines a document, the API retries on a suitable fallback model in the same call.
    ...(modern ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Claude rejected the API key. Check it in Settings → AI.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude rate limit reached. Wait a minute and try again.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Claude could not process this request: ${e.message}`);
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
  const cfg = await config();
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

export async function aiReady() {
  const ai = await getSetting("ai");
  return ai.enabled && (ai.provider === "ollama" || !!ai.apiKeyEnc) && !!ai.model;
}
