import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { decrypt } from "@/lib/crypto";
import { scopeFor } from "@/lib/assistant";
import { ROLE_LABEL } from "@/lib/permissions";

export const maxDuration = 300;

type Msg = { role: "user" | "assistant"; text: string };

const SYSTEM = `You are the built-in assistant of Filoi Ops, the proposal, project and billing app of Filoi Private Limited (Indian public-health / DHIS2 consultancy bidding for UN agencies and governments).
You help the user on the screen they are looking at. You can answer questions and, when tools are offered, make the changes they ask for.
Rules:
- Use the page context and documents given; never invent facts, dates or amounts.
- When the user asks for a change, make it with the tools in one go (complete data, not partial), then reply with a short summary of exactly what changed.
- If a request is ambiguous or would delete data the user didn't clearly ask to delete, ask one short question instead of guessing.
- If no tool can do what they ask on this page, say so plainly and tell them where in the app it can be done.
- Keep replies short and plain; use bullet points for lists of changes.`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { url, messages } = (await req.json()) as { url: string; messages: Msg[] };
  const ai = await getSetting("ai");
  if (!ai.enabled) return NextResponse.json({ error: "AI is switched off — an admin can enable it in Settings → AI." });
  if (ai.provider !== "anthropic") return NextResponse.json({ error: "Ask AI needs Claude (Anthropic) selected in Settings → AI." });

  const scope = await scopeFor(url, user);
  const client = new Anthropic({ apiKey: decrypt(ai.apiKeyEnc), ...(ai.baseUrl ? { baseURL: ai.baseUrl } : {}) });
  const tools = scope.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const history: Anthropic.Beta.BetaMessageParam[] = messages.slice(-12).map((m) => ({ role: m.role, content: m.text }));
  if (!history.length || history[0].role !== "user") return NextResponse.json({ error: "Empty question." });
  // page context first (cached), then the chat
  history[0] = { role: "user", content: [
    { type: "text", text: `=== PAGE: ${scope.label} — user ${user.name} (${ROLE_LABEL[user.role]}) ===\n${scope.context}\n\n${tools.length ? `Tools available here: ${tools.map((t) => t.name).join(", ")}.` : "No change tools on this page."}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: messages.slice(-12)[0].text },
  ] };

  const changes: string[] = [];
  try {
    for (let step = 0; step < 6; step++) {
      const res = await client.beta.messages.stream({
        model: ai.model, max_tokens: 32000, system: SYSTEM, messages: history,
        ...(tools.length ? { tools } : {}),
        output_config: { effort: "medium" },
      }).finalMessage();
      if (res.stop_reason === "refusal") return NextResponse.json({ reply: "Sorry — I can't help with that request.", changed: changes.length > 0, changes });
      const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!uses.length || res.stop_reason !== "tool_use") {
        const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
        return NextResponse.json({ reply: text || (changes.length ? "Done." : "…"), changed: changes.length > 0, changes });
      }
      history.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of uses) {
        const tool = scope.tools.find((t) => t.name === use.name);
        try {
          const out = tool ? await tool.run(use.input as Record<string, unknown>) : `Unknown tool ${use.name}`;
          if (tool) changes.push(out);
          results.push({ type: "tool_result", tool_use_id: use.id, content: out });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, is_error: true });
        }
      }
      history.push({ role: "user", content: results });
    }
    return NextResponse.json({ reply: "I made the changes listed below.", changed: changes.length > 0, changes });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Claude error ${e.status ?? ""}: ${((e.error as { error?: { message?: string } })?.error?.message ?? e.message).slice(0, 200)}`, changed: changes.length > 0 });
    console.error("[assistant]", e);
    return NextResponse.json({ error: "The assistant failed. Please try again.", changed: changes.length > 0 });
  }
}
