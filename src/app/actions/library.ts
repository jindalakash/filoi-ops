"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { guard, req, str, numOf, intOf, dateOf, FormError } from "@/lib/form";
import { saveUpload, saveBuffer, mimeFor, readStored, deleteStored } from "@/lib/files";
import { documentText } from "@/lib/ai/text";
import { extractCv, AiError } from "@/lib/ai/run";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/client";
import type { LibraryKind } from "@prisma/client";

const libUser = async () => {
  const u = await requireUser();
  if (!can(u.role, "presales") && !can(u.role, "finance")) throw new FormError("You don't have access to the library.");
  return u;
};

async function safeText(fileName: string, mimeType: string, buffer: Buffer) {
  try {
    if (!/\.(pdf|docx|txt|md)$/i.test(fileName)) return null;
    const t = await documentText({ fileName, mimeType, buffer });
    return t.slice(0, 400_000) || null;
  } catch {
    return null;
  }
}
/** True when the expert's name was only derived from the CV file name (e.g. "Asha_Menon_CV.pdf"). */
const looksLikeFileName = (name: string, file: string) => {
  const k = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/\b(cv|resume|résumé)\b/g, "").replace(/[^a-z]/g, "");
  return !name.trim() || k(name) === k(file);
};
const baseName = (f: string) => f.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

// ── Documents (past proposals, company profile, templates) ──
export async function uploadLibrary(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await libUser();
    const kind = (str(fd, "kind") || "PAST_PROPOSAL") as LibraryKind;
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new FormError("Choose at least one file.");
    for (const f of files) {
      const saved = await saveUpload(f);
      const buf = await readStored(saved.storedName);
      await db.libraryItem.create({ data: { ...saved, kind, title: baseName(f.name), tags: str(fd, "tags"), textContent: await safeText(f.name, saved.mimeType, buf), source: "upload", uploadedById: user.id } });
    }
    revalidatePath("/library");
    return { ok: `${files.length} document(s) added to the library.` };
  });
}

export async function updateLibraryItem(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await libUser();
    await db.libraryItem.update({ where: { id: req(fd, "id") }, data: { title: req(fd, "title", "Title"), kind: req(fd, "kind") as LibraryKind, tags: str(fd, "tags"), description: str(fd, "description") } });
    revalidatePath("/library");
    return { ok: "Saved." };
  });
}

export async function deleteLibraryItem(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await libUser();
    const it = await db.libraryItem.delete({ where: { id: req(fd, "id") } });
    await deleteStored(it.storedName);
    revalidatePath("/library");
    return { ok: "Removed." };
  });
}

/** Import everything in ./templates-bank (technical, financial, company → library; cvs → CV bank). Skips files already imported. */
export async function importTemplatesBank(): Promise<ActionState> {
  return guard(async () => {
    const user = await libUser();
    const root = path.resolve(/*turbopackIgnore: true*/ process.env.TEMPLATES_BANK_DIR || "./templates-bank");
    const map: Record<string, LibraryKind | "CV"> = { technical: "PAST_PROPOSAL", financial: "FIN_TEMPLATE", company: "COMPANY_PROFILE", cvs: "CV" };
    let added = 0, experts = 0, skipped = 0;
    for (const [folder, kind] of Object.entries(map)) {
      const dir = path.join(root, folder);
      const names = await readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]);
      for (const name of names) {
        if (name.startsWith(".") || !/\.(pdf|docx|xlsx|txt|md|doc)$/i.test(name)) continue;
        const full = path.join(dir, name);
        if (!(await stat(/*turbopackIgnore: true*/ full)).isFile()) continue;
        const exists = kind === "CV"
          ? await db.expert.findFirst({ where: { cvFileName: name } })
          : await db.libraryItem.findFirst({ where: { fileName: name, source: "templates-bank" } });
        if (exists) { skipped++; continue; }
        const buf = await readFile(/*turbopackIgnore: true*/ full);
        const saved = await saveBuffer(name, buf, mimeFor(name));
        const text = await safeText(name, saved.mimeType, buf);
        if (kind === "CV") {
          await db.expert.create({ data: { name: baseName(name).replace(/\b(cv|resume|résumé)\b/gi, "").trim() || name, cvFileName: name, cvStoredName: saved.storedName, cvText: text } });
          experts++;
        } else {
          await db.libraryItem.create({ data: { ...saved, kind, title: baseName(name), textContent: text, source: "templates-bank", uploadedById: user.id } });
          added++;
        }
      }
    }
    revalidatePath("/library");
    if (!added && !experts) return { ok: skipped ? `Nothing new — ${skipped} file(s) were already imported.` : "The templates-bank folders are empty. Put files in technical/, financial/, cvs/ or company/ and try again." };
    return { ok: `Imported ${added} document(s) and ${experts} CV(s)${skipped ? `; ${skipped} already there` : ""}.${experts ? " Use “Read CV with AI” on each expert to fill in their profile." : ""}` };
  });
}

// ── CV bank ──
export async function saveExpert(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await libUser();
    const id = str(fd, "id");
    const data = {
      name: req(fd, "name", "Name"), title: str(fd, "title"), email: str(fd, "email"), phone: str(fd, "phone"), nationality: str(fd, "nationality"),
      yearsExperience: intOf(fd, "yearsExperience"), expertise: str(fd, "expertise"), languages: str(fd, "languages"), education: str(fd, "education"),
      summary: str(fd, "summary"), keyProjects: str(fd, "keyProjects"), dailyRate: numOf(fd, "dailyRate"), rateCurrency: str(fd, "rateCurrency") || "USD",
      isStaff: fd.get("isStaff") === "on",
    };
    const file = fd.get("cv");
    let cv = {};
    if (file instanceof File && file.size > 0) {
      const saved = await saveUpload(file);
      cv = { cvFileName: file.name, cvStoredName: saved.storedName, cvText: await safeText(file.name, saved.mimeType, await readStored(saved.storedName)) };
    }
    const e = id ? await db.expert.update({ where: { id }, data: { ...data, ...cv } }) : await db.expert.create({ data: { ...data, ...cv } });
    await logActivity(user.id, id ? "update" : "create", "expert", e.id, `${id ? "Updated" : "Added"} expert ${e.name}`);
    revalidatePath("/library");
    if (!id) redirect(`/library/experts/${e.id}`);
    revalidatePath(`/library/experts/${e.id}`);
    return { ok: "Saved." };
  });
}

/** Fill empty profile fields from the uploaded CV */
export async function readCvWithAi(_: ActionState, fd: FormData): Promise<ActionState> {
  await libUser();
  const id = req(fd, "id");
  try {
    const e = await db.expert.findUniqueOrThrow({ where: { id } });
    if (!e.cvStoredName || !e.cvFileName) return { error: "Upload the CV file first." };
    const r = await extractCv([{ fileName: e.cvFileName, mimeType: mimeFor(e.cvFileName), buffer: await readStored(e.cvStoredName) }]);
    // Local models don't always respect the schema: keep only real text, coerce lists.
    const txt = (v: unknown): string | null => {
      if (Array.isArray(v)) return txt(v.map((x) => (typeof x === "string" ? x : "")).filter(Boolean).join("\n"));
      return typeof v === "string" && (v.match(/[A-Za-z]/g)?.length ?? 0) >= 3 ? v.trim() : null;
    };
    const list = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|;/) : []).map(txt).filter((x): x is string => !!x);
    const raw = r.data;
    const c = {
      name: txt(raw.name) ?? "", title: txt(raw.title), email: txt(raw.email), phone: typeof raw.phone === "string" && /\d{5}/.test(raw.phone) ? raw.phone : null,
      nationality: txt(raw.nationality), years_experience: typeof raw.years_experience === "number" ? Math.round(raw.years_experience) : null,
      expertise: list(raw.expertise), languages: list(raw.languages), education: txt(raw.education), summary: txt(raw.summary), key_projects: list(raw.key_projects),
    };
    const keep = <T,>(cur: T | null, v: T | null | undefined) => (cur !== null && cur !== undefined && cur !== "" ? cur : v ?? null);
    await db.expert.update({
      where: { id },
      data: {
        name: looksLikeFileName(e.name, e.cvFileName) ? c.name || e.name : e.name,
        title: keep(e.title, c.title), email: keep(e.email, c.email), phone: keep(e.phone, c.phone), nationality: keep(e.nationality, c.nationality),
        yearsExperience: keep(e.yearsExperience, c.years_experience), expertise: keep(e.expertise, c.expertise.join(", ") || null),
        languages: keep(e.languages, c.languages.join(", ") || null), education: keep(e.education, c.education), summary: keep(e.summary, c.summary),
        keyProjects: keep(e.keyProjects, c.key_projects.join("\n") || null),
      },
    });
    revalidatePath(`/library/experts/${id}`);
    revalidatePath("/library");
    return { ok: `Profile filled from the CV (${r.model}). Check and adjust.` };
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    console.error("[ai] cv", e);
    return { error: "The AI service failed. Please try again." };
  }
}

export async function deleteExpert(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await libUser();
    const e = await db.expert.findUniqueOrThrow({ where: { id: req(fd, "id") }, include: { _count: { select: { proposals: true } } } });
    if (e._count.proposals) {
      await db.expert.update({ where: { id: e.id }, data: { active: false } });
      redirect("/library?tab=experts");
    }
    await db.expert.delete({ where: { id: e.id } });
    if (e.cvStoredName) await deleteStored(e.cvStoredName);
    redirect("/library?tab=experts");
  });
}

// ── Experience bank ──
export async function saveReference(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await libUser();
    const id = str(fd, "id");
    const data = {
      title: req(fd, "title", "Title"), client: req(fd, "client", "Client"), country: str(fd, "country"), startDate: dateOf(fd, "startDate"), endDate: dateOf(fd, "endDate"),
      value: numOf(fd, "value"), currency: str(fd, "currency") || "USD", description: str(fd, "description"), services: str(fd, "services"),
    };
    if (id) await db.reference.update({ where: { id }, data });
    else await db.reference.create({ data });
    revalidatePath("/library");
    return { ok: id ? "Reference updated." : "Reference added." };
  });
}

export async function deleteReference(_: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await libUser();
    await db.reference.delete({ where: { id: req(fd, "id") } });
    revalidatePath("/library");
    return { ok: "Removed." };
  });
}

/** Turn this app's projects into experience references */
export async function referencesFromProjects(): Promise<ActionState> {
  return guard(async () => {
    await libUser();
    const projects = await db.project.findMany({ where: { status: { in: ["ACTIVE", "COMPLETED"] } }, include: { client: true } });
    let n = 0;
    for (const p of projects) {
      if (await db.reference.findUnique({ where: { projectId: p.id } })) continue;
      await db.reference.create({ data: { projectId: p.id, title: p.title, client: p.client.name, country: p.client.country, startDate: p.startDate, endDate: p.endDate, value: p.contractValue, currency: p.currency, description: p.description } });
      n++;
    }
    revalidatePath("/library");
    return { ok: n ? `Added ${n} reference(s) from projects.` : "All projects are already in the experience bank." };
  });
}
