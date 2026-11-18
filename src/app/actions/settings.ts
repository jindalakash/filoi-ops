"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { guard, str, numOf } from "@/lib/form";
import { saveSetting, getSetting, type AiSettings } from "@/lib/settings";
import { encrypt, decrypt } from "@/lib/crypto";
import { sendMail, emailShell } from "@/lib/email";
import { runReminders } from "@/lib/reminders";
import { splitEmails } from "@/lib/format";
import type { ActionState } from "@/components/client";
import { listModels, modelMatchesProvider, type ModelOption } from "@/lib/ai/models";

const s = (fd: FormData, k: string) => str(fd, k) ?? "";

export async function saveCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("admin");
  return guard(async () => {
    await saveSetting("company", {
      name: s(fd, "name"), legalName: s(fd, "legalName"), website: s(fd, "website"), email: s(fd, "email"), phone: s(fd, "phone"),
      address: s(fd, "address"), state: s(fd, "state"), stateCode: s(fd, "stateCode"), gstin: s(fd, "gstin").toUpperCase(),
      pan: s(fd, "pan").toUpperCase(), cin: s(fd, "cin"), lutNumber: s(fd, "lutNumber"), lutValidity: s(fd, "lutValidity"),
      defaultSac: s(fd, "defaultSac"), invoicePrefix: s(fd, "invoicePrefix") || "FIL", paymentTermsDays: numOf(fd, "paymentTermsDays") ?? 30,
      bankDetails: s(fd, "bankDetails"), invoiceFooter: s(fd, "invoiceFooter"),
    });
    revalidatePath("/settings");
    return { ok: "Company & invoice settings saved." };
  });
}

export async function saveFx(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("admin");
  return guard(async () => {
    await saveSetting("fx", { USD: numOf(fd, "USD") ?? 84, EUR: numOf(fd, "EUR") ?? 91, INR: 1 });
    revalidatePath("/");
    return { ok: "Exchange rates saved." };
  });
}

export async function saveSmtp(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("admin");
  return guard(async () => {
    const pw = s(fd, "password");
    await saveSetting("smtp", {
      host: s(fd, "host"), port: numOf(fd, "port") ?? 587, secure: fd.get("secure") === "on", user: s(fd, "user"),
      fromName: s(fd, "fromName"), fromEmail: s(fd, "fromEmail"), ...(pw ? { passwordEnc: encrypt(pw) } : {}),
    });
    return { ok: "Email settings saved." };
  });
}

export async function sendTestEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("admin");
  return guard(async () => {
    const to = splitEmails(s(fd, "to") || user.email);
    const r = await sendMail(to, "Filoi Ops – test email", emailShell("It works!", "<p>Your email settings are configured correctly.</p>"));
    return r.status === "SENT" ? { ok: `Test email sent to ${to.join(", ")}.` } : { error: `Not sent: ${r.error}` };
  });
}

export async function saveReminders(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("admin");
  return guard(async () => {
    await saveSetting("reminders", {
      enabled: fd.get("enabled") === "on", defaultDays: s(fd, "defaultDays") || "5,2,0", overdueDays: s(fd, "overdueDays"),
      hour: Math.min(23, Math.max(0, numOf(fd, "hour") ?? 8)), digestEmails: s(fd, "digestEmails"),
    });
    return { ok: "Reminder settings saved." };
  });
}

export async function runRemindersNow(): Promise<ActionState> {
  await requireUser("admin");
  return guard(async () => {
    const r = await runReminders();
    revalidatePath("/settings");
    return { ok: `Checked ${r.checked} items · sent ${r.sent} · not sent (no SMTP/recipients) ${r.skipped} · failed ${r.failed}` };
  });
}

export async function saveAi(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("admin");
  return guard(async () => {
    const key = s(fd, "apiKey");
    const provider = s(fd, "provider") || "anthropic";
    const model = s(fd, "model");
    if (!model) return { error: "Choose a model." };
    if (!modelMatchesProvider(provider, model)) return { error: `“${model}” is not a ${provider} model. Pick one from the list.` };
    await saveSetting("ai", {
      enabled: fd.get("enabled") === "on", provider: (s(fd, "provider") || "anthropic") as AiSettings["provider"], model: s(fd, "model") || s(fd, "customModel"),
      baseUrl: s(fd, "baseUrl"), ...(key ? { apiKeyEnc: encrypt(key) } : {}),
    });
    return { ok: `AI settings saved — ${provider} · ${model}.` };
  });
}

/** Lightweight connectivity check against the chosen provider */
export async function testAi(): Promise<ActionState> {
  await requireUser("admin");
  return guard(async () => {
    const ai = await getSetting("ai");
    const key = decrypt(ai.apiKeyEnc);
    let res: Response;
    if (ai.provider === "anthropic") {
      res = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    } else if (ai.provider === "openai") {
      res = await fetch(`${ai.baseUrl || "https://api.openai.com/v1"}/models`, { headers: { Authorization: `Bearer ${key}` } });
    } else if (ai.provider === "gemini") {
      res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": key } });
    } else {
      res = await fetch(`${ai.baseUrl || "http://localhost:11434"}/api/tags`);
    }
    return res.ok ? { ok: `Connected to ${ai.provider}.` } : { error: `${ai.provider} answered ${res.status}: ${(await res.text()).slice(0, 160)}` };
  });
}

/** Called directly from the AI settings form: models available for a provider + key (typed or saved). */
export async function loadAiModels(provider: string, typedKey: string, baseUrl: string): Promise<{ models?: ModelOption[]; error?: string }> {
  await requireUser("admin");
  try {
    const saved = await getSetting("ai");
    const key = typedKey.trim() || (saved.provider === provider ? decrypt(saved.apiKeyEnc) : "") || decrypt(saved.apiKeyEnc);
    if (provider !== "ollama" && !key) return { error: "Paste the API key first." };
    const models = await listModels(provider, key, baseUrl.trim());
    return models.length ? { models } : { error: "No models found for this key." };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { error: /401|authentication|invalid x-api-key/i.test(m) ? "The provider rejected this API key." : m.slice(0, 200) };
  }
}
