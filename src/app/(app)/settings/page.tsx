import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { decrypt, mask } from "@/lib/crypto";
import { PageHeader, Card, Field, Tabs, Notice } from "@/components/ui";
import { Badge } from "@/components/badges";
import { ActionForm, SubmitButton } from "@/components/client";
import { saveCompany, saveFx, saveSmtp, sendTestEmail, saveReminders, runRemindersNow, saveAi, testAi } from "@/app/actions/settings";

export const metadata = { title: "Settings" };

const MODELS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5", "gpt-5-mini"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
  ollama: ["llama3.1", "qwen2.5"],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser("admin");
  const { tab = "company" } = await searchParams;
  const [company, smtp, rem, fx, ai] = await Promise.all([getSetting("company"), getSetting("smtp"), getSetting("reminders"), getSetting("fx"), getSetting("ai")]);
  const logs = tab === "reminders" ? await db.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 25 }) : [];
  const tabs = [["company", "Company & GST"], ["email", "Email"], ["reminders", "Reminders"], ["currency", "Currencies"], ["ai", "AI (beta)"]].map(([key, label]) => ({ key, label, href: `?tab=${key}` }));

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

      {tab === "ai" && (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-3">
          <Card title="AI provider" className="lg:col-span-2">
            <div className="mb-4"><Notice>AI is optional. In Phase 2 it will read uploaded TORs and contracts and pre-fill proposals, deliverables and payment schedules for you to review. Keys are stored encrypted in your own database.</Notice></div>
            <ActionForm action={saveAi}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={ai.enabled} className="h-4 w-4 accent-plum" /> Enable AI features</label>
                <Field label="Provider">
                  <select name="provider" defaultValue={ai.provider} className="input">
                    <option value="anthropic">Anthropic Claude (recommended for PDFs)</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="ollama">Ollama (local, free)</option>
                  </select>
                </Field>
                <Field label="Model"><input name="model" defaultValue={ai.model} className="input" list="models" />
                  <datalist id="models">{Object.values(MODELS).flat().map((m) => <option key={m} value={m} />)}</datalist>
                </Field>
                <Field label="API key" hint={ai.apiKeyEnc ? `Saved: ${mask(decrypt(ai.apiKeyEnc))} — leave blank to keep` : "Not needed for Ollama"}><input name="apiKey" type="password" className="input" autoComplete="off" /></Field>
                <Field label="Custom base URL" hint="Only for Ollama / Azure / proxies"><input name="baseUrl" defaultValue={ai.baseUrl} className="input" placeholder="http://localhost:11434" /></Field>
              </div>
              <div className="mt-6 flex justify-end border-t border-line pt-5"><SubmitButton>Save</SubmitButton></div>
            </ActionForm>
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
