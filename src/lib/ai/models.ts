import Anthropic from "@anthropic-ai/sdk";

export type ModelOption = { id: string; label: string };

/** Recommended default per provider (used when switching provider). */
export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
  gemini: "gemini-2.5-pro",
  ollama: "gpt-oss:20b",
};

/** Built-in choices shown before (or without) loading the live list. */
export const KNOWN_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5 — best quality (recommended)" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — faster, cheaper" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — cheapest" },
  ],
  openai: [{ id: "gpt-5", label: "GPT-5" }, { id: "gpt-5-mini", label: "GPT-5 mini" }],
  gemini: [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }, { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
  ollama: [],
};

/** Does this model name belong to this provider? (Catches e.g. a local model left selected after switching to Claude.) */
export function modelMatchesProvider(provider: string, model: string) {
  if (provider === "anthropic") return model.startsWith("claude-");
  if (provider === "gemini") return model.startsWith("gemini");
  if (provider === "openai") return !model.startsWith("claude-") && !model.startsWith("gemini");
  return true;
}

/** Ask the provider which models this key can use. */
export async function listModels(provider: string, apiKey: string, baseUrl: string): Promise<ModelOption[]> {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
    const out: ModelOption[] = [];
    for await (const m of client.models.list()) out.push({ id: m.id, label: m.display_name ? `${m.display_name} (${m.id})` : m.id });
    return out;
  }
  if (provider === "openai") {
    const res = await fetch(`${baseUrl || "https://api.openai.com/v1"}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`OpenAI answered ${res.status}`);
    const j = await res.json();
    return (j.data ?? []).map((m: { id: string }) => m.id).filter((id: string) => /^(gpt|o\d)/.test(id)).sort().map((id: string) => ({ id, label: id }));
  }
  if (provider === "gemini") {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": apiKey } });
    if (!res.ok) throw new Error(`Gemini answered ${res.status}`);
    const j = await res.json();
    return (j.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string; displayName?: string }) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName ? `${m.displayName} (${m.name.replace(/^models\//, "")})` : m.name }));
  }
  const res = await fetch(`${baseUrl || "http://localhost:11434"}/api/tags`).catch(() => null);
  if (!res?.ok) throw new Error("Could not reach Ollama. Is it running?");
  const j = await res.json();
  return (j.models ?? []).map((m: { name: string; size?: number }) => ({ id: m.name, label: m.size ? `${m.name} (${(m.size / 1e9).toFixed(1)} GB)` : m.name }));
}
