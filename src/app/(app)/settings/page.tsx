import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { decrypt, mask } from "@/lib/crypto";
import { PageHeader, Card, Field, Tabs, Notice } from "@/components/ui";
import { Badge } from "@/components/badges";
import { ActionForm, SubmitButton } from "@/components/client";
import { saveCompany, saveFx, saveSmtp, sendTestEmail, saveReminders, runRemindersNow, testAi, backupNow, saveBackupSettings } from "@/app/actions/settings";
import { listBackups, BACKUP_DIR } from "@/lib/backup";
import { Download } from "lucide-react";
import { AiSettingsForm } from "@/components/AiSettingsForm";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser("admin");
  const { tab = "company" } = await searchParams;
  const [company, smtp, rem, fx, ai, bk] = await Promise.all([getSetting("company"), getSetting("smtp"), getSetting("reminders"), getSetting("fx"), getSetting("ai"), getSetting("backup")]);
  const backups = tab === "backups" ? await listBackups() : [];
  const logs = tab === "reminders" ? await db.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 25 }) : [];
  const tabs = [["company", "Company & GST"], ["email", "Email"], ["reminders", "Reminders"], ["currency", "Currencies"], ["ai", "AI (beta)"], ["backups", "Backups"]].map(([key, label]) => ({ key, label, href: `?tab=${key}` }));

  return (
    <>
      <PageHeader title="Settings" subtitle="Company details printed on invoices, email delivery, reminder schedule and AI provider." />
      <Tabs tabs={tabs} active={tab} />

      {tab === "company" && (
        <Card className="max-w-5xl">
          <ActionForm action={saveCompany}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Legal name"><input name="legalName" defaultValue={company.legalName} className="input" /></Field>
              <Field label="Short name"><input name="name" defaultValue={company.name} className="input" /></Field>
              <Field label="Website"><input name="website" defaultValue={company.website} className="input" /></Field>
              <Field label="Email on invoices"><input name="email" defaultValue={company.email} className="input" /></Field>
              <Field label="Phone"><input name="phone" defaultValue={company.phone} className="input" /></Field>
              <Field label="State (registered office)"><input name="state" defaultValue={company.state} className="input" /></Field>
              <Field label="Registered address" className="sm:col-span-2 lg:col-span-3"><textarea name="address" rows={3} defaultValue={company.address} className="input" /></Field>
              <Field label="GSTIN"><input name="gstin" defaultValue={company.gstin} className="input uppercase" /></Field>
              <Field label="GST state code" hint="First 2 digits of GSTIN"><input name="stateCode" defaultValue={company.stateCode} maxLength={2} className="input" /></Field>
              <Field label="PAN"><input name="pan" defaultValue={company.pan} className="input uppercase" /></Field>
              <Field label="CIN"><input name="cin" defaultValue={company.cin} className="input" /></Field>
              <Field label="LUT ARN" hint="Printed on export invoices (WHO, UN etc.)"><input name="lutNumber" defaultValue={company.lutNumber} className="input" /></Field>
              <Field label="LUT validity" hint="e.g. FY 2026-27"><input name="lutValidity" defaultValue={company.lutValidity} className="input" /></Field>
              <Field label="Default SAC code" hint="998311 = management consulting"><input name="defaultSac" defaultValue={company.defaultSac} className="input" /></Field>
              <Field label="Invoice prefix" hint="→ FIL/26-27/001"><input name="invoicePrefix" defaultValue={company.invoicePrefix} className="input" /></Field>
              <Field label="Payment terms (days)"><input name="paymentTermsDays" type="number" defaultValue={company.paymentTermsDays} className="input" /></Field>
              <Field label="Bank details printed on invoice" className="sm:col-span-2 lg:col-span-3" hint="Include beneficiary, bank, account no., IFSC, SWIFT and any intermediary bank for USD/EUR.">
                <textarea name="bankDetails" rows={5} defaultValue={company.bankDetails} className="input font-mono text-xs" placeholder={"Beneficiary: Filoi Private Limited\nBank: …\nA/c no.: …\nIFSC: …   SWIFT: …"} />
              </Field>
              <Field label="Invoice footer" className="sm:col-span-2 lg:col-span-3"><input name="invoiceFooter" defaultValue={company.invoiceFooter} className="input" /></Field>
            </div>
            <div className="mt-6 flex justify-end border-t border-line pt-5"><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      {tab === "email" && (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-3">
          <Card title="SMTP server" className="lg:col-span-2">
            <ActionForm action={saveSmtp}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SMTP host" hint="Gmail/Workspace: smtp.gmail.com · Zoho: smtp.zoho.in · Hostinger: smtp.hostinger.com"><input name="host" defaultValue={smtp.host} className="input" /></Field>
                <Field label="Port" hint="587 (STARTTLS) or 465 (SSL)"><input name="port" type="number" defaultValue={smtp.port} className="input" /></Field>
                <Field label="Username"><input name="user" defaultValue={smtp.user} className="input" autoComplete="off" /></Field>
                <Field label="Password / app password" hint={smtp.passwordEnc ? "Saved — leave blank to keep" : "Gmail needs an App Password"}><input name="password" type="password" className="input" autoComplete="new-password" placeholder={smtp.passwordEnc ? "••••••••" : ""} /></Field>
                <Field label="From name"><input name="fromName" defaultValue={smtp.fromName} className="input" /></Field>
                <Field label="From email"><input name="fromEmail" defaultValue={smtp.fromEmail} className="input" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="secure" defaultChecked={smtp.secure} className="h-4 w-4 accent-plum" /> Use SSL (port 465)</label>
              </div>
              <div className="mt-6 flex justify-end border-t border-line pt-5"><SubmitButton>Save</SubmitButton></div>
            </ActionForm>
          </Card>
          <Card title="Send a test">
            <ActionForm action={sendTestEmail} className="space-y-3">
              <Field label="To"><input name="to" defaultValue={user.email} className="input" /></Field>
              <SubmitButton className="btn-dark w-full" pendingText="Sending…">Send test email</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      {tab === "reminders" && (
        <div className="grid max-w-6xl gap-6 lg:grid-cols-3">
          <Card title="Schedule">
            <ActionForm action={saveReminders} className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="enabled" defaultChecked={rem.enabled} className="h-4 w-4 accent-plum" /> Send automatic reminders</label>
              <Field label="Days before due date" hint="Default for new projects. Each project can override."><input name="defaultDays" defaultValue={rem.defaultDays} className="input" /></Field>
              <Field label="Days after (overdue)"><input name="overdueDays" defaultValue={rem.overdueDays} className="input" /></Field>
              <Field label="Send at hour (0–23, server time)"><input name="hour" type="number" min={0} max={23} defaultValue={rem.hour} className="input" /></Field>
              <Field label="Always copy (finance) emails" hint="Gets invoicing & payment reminders for every project."><input name="digestEmails" defaultValue={rem.digestEmails} className="input" /></Field>
              <SubmitButton className="btn-primary w-full">Save</SubmitButton>
            </ActionForm>
            <ActionForm action={runRemindersNow} className="mt-4 border-t border-line pt-4">
              <SubmitButton className="btn-ghost w-full" pendingText="Checking…">Run reminder check now</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="What gets reminded" className="lg:col-span-2">
            <ul className="mb-5 grid gap-2 text-sm sm:grid-cols-2">
              <li>📄 <b>Deliverables</b> → project alert emails, owner, PM</li>
              <li>🧾 <b>Invoices to raise</b> (billing milestones) → project alerts + finance copy</li>
              <li>💰 <b>Payments due / overdue</b> → project alerts + finance copy</li>
              <li>⏰ <b>Proposal deadlines</b> → proposal alerts + owner</li>
            </ul>
            {!smtp.host && <div className="mb-4"><Notice tone="warn">Email isn&apos;t configured yet, so reminders are logged below but not delivered. Set up the <a className="link" href="?tab=email">Email</a> tab.</Notice></div>}
            <div className="label">Recent notifications</div>
            {logs.length === 0 ? <p className="text-sm text-ink-soft">Nothing sent yet.</p> : (
              <div className="-mx-5 overflow-x-auto"><table className="table text-xs">
                <tbody>{logs.map((l) => (
                  <tr key={l.id}><td className="whitespace-nowrap">{l.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{l.subject}<div className="text-ink-soft">{l.recipients || "no recipients"}</div></td>
                    <td><Badge tone={l.status === "SENT" ? "green" : l.status === "FAILED" ? "red" : "gray"}>{l.status === "SKIPPED" ? "Not sent" : l.status}</Badge>{l.error && <div className="mt-1 text-ink-soft">{l.error}</div>}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </div>
      )}

      {tab === "currency" && (
        <Card title="Exchange rates for dashboards" className="max-w-xl">
          <p className="mb-4 text-sm text-ink-soft">Used to show combined totals in ₹. Each invoice also stores its own rate, and each payment its realised rate.</p>
          <ActionForm action={saveFx} className="grid grid-cols-2 gap-4">
            <Field label="1 USD = ₹"><input name="USD" inputMode="decimal" defaultValue={fx.USD} className="input" /></Field>
            <Field label="1 EUR = ₹"><input name="EUR" inputMode="decimal" defaultValue={fx.EUR} className="input" /></Field>
            <div className="col-span-2"><SubmitButton>Save rates</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      {tab === "backups" && (
        <div className="grid max-w-6xl gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <Card title="Status">
              {bk.lastRunAt ? (
                <div className="space-y-1 text-sm">
                  <div><Badge tone={bk.lastStatus === "OK" ? "green" : "red"}>{bk.lastStatus === "OK" ? "Last backup OK" : "Last backup failed"}</Badge></div>
                  <div className="text-ink-soft">{new Date(bk.lastRunAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                  {bk.lastStatus === "OK" && <div className="text-ink-soft">{bk.lastFile} · {Math.max(1, Math.round(bk.lastSize / 1024))} KB</div>}
                  {bk.lastError && <div className="text-red-700">{bk.lastError}</div>}
                </div>
              ) : <p className="text-sm text-ink-soft">No backup has run yet.</p>}
              <ActionForm action={backupNow} className="mt-4"><SubmitButton className="btn-primary w-full" pendingText="Backing up…">Back up now</SubmitButton></ActionForm>
            </Card>
            <Card title="Schedule">
              <ActionForm action={saveBackupSettings} className="space-y-4">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="enabled" defaultChecked={bk.enabled} className="h-4 w-4 accent-plum" /> Daily automatic backup</label>
                <Field label="Run at hour (0–23, server time)"><input name="hour" type="number" min={0} max={23} defaultValue={bk.hour} className="input" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Keep daily"><input name="keepDaily" type="number" min={1} defaultValue={bk.keepDaily} className="input" /></Field>
                  <Field label="Keep weekly"><input name="keepWeekly" type="number" min={0} defaultValue={bk.keepWeekly} className="input" /></Field>
                </div>
                <Field label="Also copy to folder (off-site)" hint="e.g. your Google Drive folder, an external disk, or a mounted cloud bucket. Leave empty to keep backups only on this server."><input name="copyDir" defaultValue={bk.copyDir} className="input" placeholder="/Users/you/Google Drive/Filoi backups" /></Field>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </Card>
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Card title={`Backups (${backups.length})`} pad={false}>
              {backups.length === 0 ? <p className="p-5 text-sm text-ink-soft">None yet. Click “Back up now”.</p> : (
                <ul className="divide-y divide-line">
                  {backups.map((b) => (
                    <li key={b.name} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{b.name}</div><div className="text-xs text-ink-soft">{b.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {Math.max(1, Math.round(b.size / 1024))} KB</div></div>
                      <a href={`/api/backups/${b.name}`} className="btn-ghost btn-sm"><Download size={14} /> Download</a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="What is backed up & how to restore">
              <div className="space-y-3 text-sm">
                <p>Each file contains the full <b>database</b> (proposals, projects, invoices, payments, users, settings) and all <b>uploaded documents</b>. Backups are stored in <code className="rounded bg-mist px-1">{BACKUP_DIR}</code>. Keep a copy somewhere else (the off-site folder above) — a backup on the same machine does not survive a disk failure.</p>
                <p className="font-semibold">To restore (on the server):</p>
                <pre className="overflow-x-auto rounded-lg bg-mist p-3 text-xs leading-relaxed">{`tar -xzf filoi-backup-YYYYMMDD-HHMMSS.tar.gz -C restore/
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL_WITHOUT_PARAMS" restore/database.dump
cp -R restore/uploads/* storage/uploads/`}</pre>
                <p className="text-ink-soft">Restore replaces the current data with the backup. Test it on a copy first if you can.</p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-3">
          <Card title="AI provider" className="lg:col-span-2">
            <div className="mb-4"><Notice>AI is optional. When enabled, it reads uploaded TORs / RFPs and contracts and pre-fills proposals, deliverables and payment schedules for you to review. Documents are sent only to the provider you choose; keys are stored encrypted in your own database. Claude and Gemini also read scanned PDFs; OpenAI and Ollama need PDFs with a text layer.</Notice></div>
            <AiSettingsForm enabled={ai.enabled} provider={ai.provider} model={ai.model} baseUrl={ai.baseUrl} keyHint={ai.apiKeyEnc ? mask(decrypt(ai.apiKeyEnc)) : ""} />
          </Card>
          <Card title="Connection test">
            <p className="mb-3 text-sm text-ink-soft">Checks the saved key against the provider (no document is sent).</p>
            <ActionForm action={testAi}><SubmitButton className="btn-dark w-full" pendingText="Testing…">Test connection</SubmitButton></ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
