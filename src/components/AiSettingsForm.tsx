"use client";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { ActionForm, SubmitButton } from "./client";
import { saveAi, loadAiModels } from "@/app/actions/settings";
import { DEFAULT_MODEL, DEFAULT_LIGHT_MODEL, KNOWN_MODELS, modelMatchesProvider, type ModelOption } from "@/lib/ai/models";

const PROVIDERS = [
  ["anthropic", "Anthropic Claude (recommended — reads scanned PDFs)"],
  ["openai", "OpenAI"],
  ["gemini", "Google Gemini"],
  ["ollama", "Ollama (local, free)"],
] as const;

export function AiSettingsForm({ enabled, provider: p0, model: m0, lightModel: l0, keyHint, baseUrl: b0 }: { enabled: boolean; provider: string; model: string; lightModel: string; keyHint: string; baseUrl: string }) {
  const [on, setOn] = useState(enabled); // controlled, so the form reset after Save can't untick it
  const [provider, setProvider] = useState(p0);
  // a model left over from another provider (e.g. a local model after switching to Claude) is replaced by the provider default
  const [model, setModel] = useState(modelMatchesProvider(p0, m0) && m0 ? m0 : DEFAULT_MODEL[p0]);
  const [light, setLight] = useState(l0 === "" || modelMatchesProvider(p0, l0) ? l0 : DEFAULT_LIGHT_MODEL[p0]);
  const [mismatch] = useState(!!m0 && !modelMatchesProvider(p0, m0) ? m0 : "");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(b0);
  const [loaded, setLoaded] = useState<Record<string, ModelOption[]>>({});
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  const options = (() => {
    const list = loaded[provider] ?? KNOWN_MODELS[provider] ?? [];
    return list.some((o) => o.id === model) || !model ? list : [{ id: model, label: model }, ...list];
  })();

  const load = () =>
    start(async () => {
      setMsg({});
      const r = await loadAiModels(provider, key, baseUrl);
      if (r.error) return setMsg({ error: r.error });
      const models = r.models!;
      // keep the recommended model on top for Claude
      if (provider === "anthropic") models.sort((a, b) => Number(b.id === DEFAULT_MODEL.anthropic) - Number(a.id === DEFAULT_MODEL.anthropic));
      setLoaded((l) => ({ ...l, [provider]: models }));
      if (!models.some((m) => m.id === model)) setModel(models.find((m) => m.id === DEFAULT_MODEL[provider])?.id ?? models[0].id);
      setMsg({ ok: `${models.length} model(s) available with this key.` });
    });

  return (
    <ActionForm action={saveAi}>
      {mismatch && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">The saved model “{mismatch}” doesn&apos;t belong to this provider, so {DEFAULT_MODEL[provider]} is selected instead. Click Save to apply.</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
          <input type="checkbox" name="enabled" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-plum" /> Enable AI features
          <span className={on ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200" : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200"}>{on ? "On" : "Off"}</span>
          {on !== enabled && <span className="text-xs font-normal text-amber-700">— click Save to apply</span>}
        </label>
        <label className="block"><span className="label">Provider</span>
          <select name="provider" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(DEFAULT_MODEL[e.target.value]); setLight(DEFAULT_LIGHT_MODEL[e.target.value]); setMsg({}); }} className="input">
            {PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">API key</span>
          <input name="apiKey" type="password" value={key} onChange={(e) => setKey(e.target.value)} className="input" autoComplete="off" placeholder={keyHint ? "Saved — leave blank to keep" : provider === "ollama" ? "Not needed" : "Paste key"} />
          <span className="mt-1 block text-xs text-ink-soft">{keyHint ? `Saved key: ${keyHint}` : provider === "anthropic" ? "Create one at console.anthropic.com → API keys" : ""}</span>
        </label>
        <div className="sm:col-span-2">
          <span className="label">Main model — TOR / RFP reading and proposal drafting</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select name="model" value={model} onChange={(e) => setModel(e.target.value)} className="input flex-1">
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <button type="button" onClick={load} disabled={pending} className="btn-ghost whitespace-nowrap">
              <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {pending ? "Loading…" : "Load models from my account"}
            </button>
          </div>
          {msg.error && <p className="mt-1 text-xs text-red-700">{msg.error}</p>}
          {msg.ok && <p className="mt-1 text-xs text-emerald-700">{msg.ok}</p>}
          {provider === "anthropic" && <p className="mt-1 text-xs text-ink-soft">Opus 5.5 is the most reliable for long or scanned TORs and writes the best drafts (~₹20–40 per TOR, ~₹20–30 per section; repeat sections reuse a 1-hour cache and cost much less).</p>}
        </div>
        <div className="sm:col-span-2">
          <span className="label">Quick-reading model — CVs and contracts</span>
          <select name="lightModel" value={light} onChange={(e) => setLight(e.target.value)} className="input">
            <option value="">Same as main model</option>
            {(() => {
              const list = loaded[provider] ?? KNOWN_MODELS[provider] ?? [];
              return list.some((o) => o.id === light) || !light ? list : [{ id: light, label: light }, ...list];
            })().map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {provider === "anthropic" && <p className="mt-1 text-xs text-ink-soft">Sonnet 5.5 (default) costs about half of Opus and reads CVs and contracts well. Haiku 5.5 is cheapest — fine for CVs; check contract payment terms carefully.</p>}
        </div>
        {(provider === "ollama" || provider === "openai") && (
          <label className="block sm:col-span-2"><span className="label">Custom base URL</span>
            <input name="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input" placeholder={provider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"} />
          </label>
        )}
        {provider !== "ollama" && provider !== "openai" && <input type="hidden" name="baseUrl" value="" />}
      </div>
      <div className="mt-6 flex justify-end border-t border-line pt-5"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  );
}
