# Filoi Ops

Proposal → Project → Cash, for **Filoi Private Limited**.

Tracks tenders/RFPs, won contracts, deliverables, billing milestones, GST/LUT invoices,
payments (with TDS) and sends email reminders before anything is due.

## Phase 1 — what's in this version

| Area | Features |
|---|---|
| **Proposals** | Tender details, deadlines, evaluation (QCBS weights), EMD, scope, eligibility, submission checklist, TOR/RFP/proposal file uploads, status pipeline Draft → Review → Submitted → Evaluation → Won/Lost, one-click *Create project* when won |
| **Projects** | Contract/PO details, deliverables (type, owner, due date, status, acceptance), contract & file storage, activity log |
| **Finance** | Billing milestones (amount or % of contract, linked to deliverables), invoices (export under LUT / IGST / CGST+SGST), USD · EUR · INR with exchange rates, printable invoice (Save as PDF), payments with TDS & bank charges, receivables ageing |
| **Reminders** | Daily email for deliverables, invoices to raise, payments due/overdue and proposal deadlines — days configurable per project (default 5, 2, 0 days before + 1, 7, 14 days overdue). Multiple alert emails per project / proposal / deliverable |
| **Dashboards** | Role-aware: proposal counts & win rate for everyone; contract value, awaiting award, yet-to-invoice, received, outstanding, 6-month invoicing forecast & collections for Admin/Accounts |
| **Users** | Unlimited users, roles Admin / Project Manager / Accounts Manager, reset password, deactivate |
| **Settings** | Company & GST (GSTIN, LUT ARN, SAC, bank details, invoice prefix), SMTP email, reminder schedule, exchange rates, AI provider + key (encrypted; used from Phase 2) |

## Phase 2 — AI intake (in this version)

| Area | Features |
|---|---|
| **TOR / RFP intake** | New proposal starts with an upload. AI reads the tender (PDF incl. scanned, Word, text) and pre-fills title, client (matched or created), reference, deadlines, budget, duration, EMD, evaluation weights, scope, eligibility, documents to submit, expected deliverables, key experts and watch-outs — with verbatim evidence quotes. Nothing is saved until you confirm. Also available on existing proposals ("Read the tender with AI", fills empty fields only) |
| **Contract / PO intake** | On a project's *Contract & files* tab: AI reads the contract and proposes contract no./dates/value, deliverables with due dates and the payment schedule linked to deliverables. Tick what to create on the review screen |
| **Providers** | Settings → AI: Anthropic Claude (default `claude-opus-5-5`, reads scanned PDFs, refusal fallback enabled), OpenAI, Google Gemini, or a free local model via Ollama (text PDFs only) |
| **INR everywhere** | Every amount in USD/EUR is shown in ₹ (Settings → Currencies rates) with the original amount in brackets, e.g. ₹80.6L ($96K). Printed invoices stay in the invoice currency |

## Proposal team workflow

| Step | What happens |
|---|---|
| **Assign** | On a proposal, *Team & tasks → Assign a part*: title, assignee (any user, incl. Accounts for the financial part), reviewer, due date, instructions. Or *Create tasks from the submission checklist* (one per required document, due 2 days before submission). The assignee gets an email |
| **Work** | The assignee sees it in **My tasks** (sidebar count + dashboard “Waiting for you”), uploads drafts on the task, and clicks **Mark done & send for review**, choosing the reviewer |
| **Review** | The reviewer **approves** or **sends back** with a comment (emailed to the assignee). Discussion thread on every task |
| **Ready** | When every part is approved the proposal turns **Ready to submit** and the owner is emailed. Tasks also get due-date reminders (2 days before, on the day, overdue) |

### Roles

| | Admin | Project Manager | Accounts Manager |
|---|---|---|---|
| Proposals | edit | edit | view |
| Projects & deliverables | edit | edit | view |
| Money figures, invoices, payments | ✅ | — | ✅ |
| Users & settings | ✅ | — | — |

## Run on your Mac

Needs Node 20+ and PostgreSQL (already installed).

```bash
npm install
cp .env.example .env          # first time only — fill in values
npm run db:migrate            # create tables
npm run db:seed               # first admin + Filoi company details
npm run dev                   # http://localhost:3000
```

After pulling changes that add a database migration, run `npm run db:migrate` and restart `npm run dev`.

`npm run db:demo` adds sample WHO/UNICEF/Gavi data to explore.
`npm run db:reset` wipes everything (demo included) and re-creates the admin — do this before going live.

## Deploy on Hostinger (VPS)

1. Create a KVM VPS (Ubuntu 24.04, 2 GB+ RAM) and install Docker.
2. Copy this folder to the server (git or `scp`).
3. `cp .env.example .env` and set `POSTGRES_PASSWORD`, `SESSION_SECRET`, `ENCRYPTION_KEY`,
   `ADMIN_PASSWORD`, `APP_URL=https://ops.filoi.in`, `COOKIE_SECURE=1`.
4. `docker compose up -d --build`
5. `docker compose exec app node node_modules/tsx/dist/cli.mjs prisma/seed.ts`
6. Point a subdomain (e.g. `ops.filoi.in`) to the VPS and put Caddy in front for HTTPS:
   `ops.filoi.in { reverse_proxy 127.0.0.1:3000 }`

Back up the `pgdata` and `uploads` Docker volumes (e.g. nightly `pg_dump` + rsync).

## Roadmap

- **Phase 3 – Proposal engine:** template library from `templates-bank/`, CV bank,
  financial proposal builder, Word/PDF export, AI drafting.
- **Phase 4:** EMD / bank-guarantee tracker, cash-flow forecast, Tally export, 2FA, backups UI.
