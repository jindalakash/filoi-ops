import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readdir, stat, unlink, writeFile, copyFile, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getSetting, saveSetting } from "./settings";
import { UPLOAD_DIR } from "./files";

const run = promisify(execFile);
export const BACKUP_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR || "./backups");
const NAME = /^filoi-backup-(\d{8})-(\d{6})\.tar\.gz$/;

/** pg_dump must be at least the server's major version; prefer an explicit path, then common install locations. */
function pgBin(name: "pg_dump" | "pg_restore") {
  const explicit = process.env[name === "pg_dump" ? "PG_DUMP_PATH" : "PG_RESTORE_PATH"];
  if (explicit) return explicit;
  for (const dir of ["/usr/lib/postgresql/17/bin", "/Library/PostgreSQL/17/bin", "/opt/homebrew/opt/postgresql@17/bin", "/usr/local/bin", "/usr/bin"]) {
    const p = path.join(/*turbopackIgnore: true*/ dir, name);
    if (existsSync(/*turbopackIgnore: true*/ p)) return p;
  }
  return name; // rely on PATH
}

/** Connection settings for pg_dump from DATABASE_URL (password via env, not argv). */
function pgEnv() {
  const u = new URL(process.env.DATABASE_URL || "");
  return {
    args: ["-h", u.hostname, "-p", u.port || "5432", "-U", decodeURIComponent(u.username), "-d", u.pathname.replace(/^\//, "")],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) },
  };
}

const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export type BackupFile = { name: string; size: number; createdAt: Date };

export async function listBackups(): Promise<BackupFile[]> {
  const names = await readdir(/*turbopackIgnore: true*/ BACKUP_DIR).catch(() => [] as string[]);
  const out: BackupFile[] = [];
  for (const name of names) {
    const m = name.match(NAME);
    if (!m) continue;
    const st = await stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ BACKUP_DIR, name));
    const [d, t] = [m[1], m[2]];
    out.push({ name, size: st.size, createdAt: new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)) });
  }
  return out.sort((a, b) => +b.createdAt - +a.createdAt);
}

export const backupPath = (name: string) => (NAME.test(name) ? path.join(/*turbopackIgnore: true*/ BACKUP_DIR, name) : null);

/** Keep the newest `daily` backups, plus the newest backup of each of the last `weekly` weeks. */
async function prune(keepDaily: number, keepWeekly: number) {
  const all = await listBackups();
  const keep = new Set(all.slice(0, keepDaily).map((b) => b.name));
  const weeks = new Set<string>();
  for (const b of all) {
    const monday = new Date(b.createdAt);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const wk = monday.toISOString().slice(0, 10);
    if (!weeks.has(wk) && weeks.size < keepWeekly) { weeks.add(wk); keep.add(b.name); }
  }
  for (const b of all) if (!keep.has(b.name)) await unlink(/*turbopackIgnore: true*/ path.join(BACKUP_DIR, b.name)).catch(() => {});
}

let running = false;

/** Database (pg_dump custom format) + uploaded files → one .tar.gz in BACKUP_DIR. */
export async function runBackup(trigger: "scheduled" | "manual" = "manual") {
  if (running) throw new Error("A backup is already running.");
  running = true;
  const cfg = await getSetting("backup");
  const name = `filoi-backup-${stamp()}.tar.gz`;
  const work = path.join(BACKUP_DIR, `.work-${Date.now()}`);
  try {
    await mkdir(/*turbopackIgnore: true*/ work, { recursive: true });
    const { args, env } = pgEnv();
    await run(pgBin("pg_dump"), [...args, "--format=custom", "--no-owner", "--no-privileges", "-f", path.join(work, "database.dump")], { env, maxBuffer: 1 << 26 });
    await writeFile(/*turbopackIgnore: true*/ path.join(work, "manifest.json"), JSON.stringify({ app: "filoi-ops", createdAt: new Date().toISOString(), trigger, database: "database.dump (pg_dump custom format)", files: "uploads/" }, null, 2));
    const tarArgs = ["-czf", path.join(BACKUP_DIR, name), "-C", work, "database.dump", "manifest.json"];
    if (existsSync(/*turbopackIgnore: true*/ UPLOAD_DIR)) tarArgs.push("-C", path.dirname(UPLOAD_DIR), path.basename(UPLOAD_DIR));
    await run("tar", tarArgs, { maxBuffer: 1 << 26 });
    const size = (await stat(/*turbopackIgnore: true*/ path.join(BACKUP_DIR, name))).size;
    if (cfg.copyDir) {
      await mkdir(/*turbopackIgnore: true*/ cfg.copyDir, { recursive: true });
      await copyFile(/*turbopackIgnore: true*/ path.join(BACKUP_DIR, name), path.join(cfg.copyDir, name));
    }
    await prune(Math.max(1, cfg.keepDaily), Math.max(0, cfg.keepWeekly));
    await saveSetting("backup", { lastRunAt: new Date().toISOString(), lastStatus: "OK", lastError: "", lastFile: name, lastSize: size });
    console.log(`[backup] ${name} (${Math.round(size / 1024)} KB)`);
    return { name, size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await saveSetting("backup", { lastRunAt: new Date().toISOString(), lastStatus: "FAILED", lastError: msg.slice(0, 500) });
    console.error("[backup] failed", msg);
    throw new Error(msg.includes("ENOENT") && msg.includes("pg_dump") ? "pg_dump was not found. Install the PostgreSQL client tools or set PG_DUMP_PATH." : msg.slice(0, 300));
  } finally {
    running = false;
    await rm(/*turbopackIgnore: true*/ work, { recursive: true, force: true }).catch(() => {});
  }
}
