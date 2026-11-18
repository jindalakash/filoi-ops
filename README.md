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

- **Phase 2 – Smart intake:** upload a TOR/RFP or contract → AI extracts dates, deliverables,
  payment schedule into a review screen (Claude / OpenAI / Gemini / local Ollama).
- **Phase 3 – Proposal engine:** template library from `templates-bank/`, CV bank,
  financial proposal builder, Word/PDF export, AI drafting.
- **Phase 4:** EMD / bank-guarantee tracker, cash-flow forecast, Tally export, 2FA, backups UI.
