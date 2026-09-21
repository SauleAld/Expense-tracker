# Spendwise — Expense Tracker

A personal expense tracker built with **Angular 21** (standalone components, signals, new control flow), **TypeScript** (strict), and **Tailwind CSS 4**. All data lives in your browser's `localStorage`; there is no backend.

## Run it

Requires Node 20.19+ / 22.12+ (developed on Node 22.18).

```bash
npm install
npm start          # http://localhost:4200
```

Other commands:

```bash
npm test -- --no-watch   # unit tests (Vitest), 148 tests
npm run build            # production build into dist/expense-tracker
```

> `.npmrc` sets `legacy-peer-deps=true`. Without it, npm 11's resolver crashed
> (`Cannot read properties of null (reading 'edgesOut')`) on this dependency set.

## Features

| Area | What you get |
| --- | --- |
| Add / edit | Modal form (bottom sheet on phones) with native date picker, amount, six categories, description |
| Validation | Amount > 0 and ≤ $1,000,000 with max 2 decimals; date required, valid, not in the future; description required, ≤ 80 chars. Errors appear on blur/submit and focus jumps to the first bad field |
| List | Search (description, category, amount), category filter, date range (presets + custom), sort, "show more" paging, filtered total |
| Delete | Immediate, with an **Undo** toast |
| Dashboard | Total spending, this month (vs the same days last month), top category, daily average; last-30-days line, monthly columns, category breakdown; recent expenses |
| Charts | Hover/tap/keyboard tooltips, and a **Table** view on each chart so every value is readable without color or hover |
| Export | **Export hub** (`/export`): templates (Tax Report, Monthly Summary, Category Analysis, Full Ledger) sent to Download, Email, Google Sheets, Google Drive, Dropbox, OneDrive or a share link; automations; history; integrations; sharing with QR codes. See below. The Expenses page also keeps a one-click CSV of the current list (UTF-8 BOM for Excel; formula-injection safe) |
| Polish | Light/dark theme (remembered), responsive sidebar → bottom nav, empty states, "Load sample data" |
| Resilience | Corrupt or partly invalid saved data is skipped with a warning (original kept under `spendwise.expenses.v1.corrupt-backup`); blocked/full storage shows an error banner; multi-tab sync via the `storage` event |

## Try every feature (about 5 minutes)

1. **Empty state** – open the app; the dashboard offers *Add your first expense* and *Load sample data*.
2. **Sample data** – click *Load sample data*. About 5 months of spending appear across every chart.
3. **Add** – *Add expense* → submit empty (see errors) → try `1.234`, `-5`, and a future date (each rejected) → enter `42.50`, pick *Shopping*, describe it → *Add expense*. A toast confirms and it appears at the top of **Expenses**.
4. **Edit** – on Expenses click the pencil, change the amount, *Save changes*.
5. **Delete + undo** – click the trash icon, then *Undo* in the toast.
6. **Filter** – pick a category; type in search (e.g. `uber`, `bills`, `12.50`); click *Last 30 days*; set From after To to see the warning; *Clear filters*.
7. **Sort** – *Sort by → Highest amount*.
8. **Export** – open **Export hub** (sidebar or *Export & share* on the dashboard). Pick a template, a destination and settings, watch the live preview, then run it. Progress shows in a tray that keeps going if you switch pages. See *Export hub* below for the full tour.
9. **Dashboard** – hover the charts (or Tab to them and use ←/→ on the 30-day chart); toggle **Table** on a chart; hover a category row.
10. **Persistence** – reload the page; everything is still there. Toggle **Dark mode**; it persists too.
11. **Responsive** – narrow the window below 1024px for the bottom nav and floating add button.
12. **Error handling** – in DevTools run `localStorage.setItem('spendwise.expenses.v1', '{broken')`, reload; a warning banner appears instead of a crash.

## Export hub (cloud export, demo)

A cloud-service style export system at `/export`, with five tabs.

**What is real and what is simulated.** Reports, file downloads (CSV, JSON, PDF), share links and QR codes are real. Email and the Google Sheets / Google Drive / Dropbox / OneDrive connections are **simulated**: nothing is sent, no account is contacted, and the sign-in screen asks for no credentials. Everything is labelled *Demo* in the UI.

| Tab | What it does |
| --- | --- |
| **New export** | 1) pick a template (each has a live preview of your real data), 2) pick a destination, 3) settings for that destination. Jobs run in the background with staged progress; a tray shows them from any page |
| **Automations** | Recurring exports (daily / weekly / monthly at a time you choose) to email or a connected app. They run while Spendwise is open; anything that came due while it was closed runs once when you return ("Scheduled · ran on open") |
| **History** | Every export with time, template, destination, size and result; filter by status or destination; *Run again*; clear |
| **Integrations** | Connect/disconnect apps, per-app status (connected, syncing, needs attention), last sync, simulated storage usage, *Sync now*. A *Demo: expire sign-in* link lets you see the reconnect flow |
| **Sharing** | Create a link + scannable QR code to a read-only snapshot; expiry (1 hour to never); optional CSV download for viewers; turn a link off any time |

Share links open `/shared/<token>` without the app chrome. The snapshot is stored in this browser (there is no server), so **links open on the device that created them**. The hub header shows a live sync indicator, and the sidebar dot shows when something is running or needs attention.

### Try it (about 5 minutes)

1. Load sample data on the dashboard, then open **Export hub**.
2. *New export*: try each template; choose **Download** and export as CSV, JSON and PDF.
3. Choose **Email**, add a recipient, send (simulated). Choose **Dropbox**, click **Connect**, allow (demo), then upload.
4. Choose **Share link**, run it, then open **Sharing**: scan the QR code with your phone camera (same-device demo), or use **Copy** / **Open**. Try *Turn off link*.
5. **Automations** → *New automation* (for example, Monthly Summary by email, weekly). Use *Run now*.
6. **Integrations** → *Demo: expire sign-in* on a connected app, then *Reconnect*. Notice the hub indicator and the failed run in **History**.

## Project layout

```
src/app/
  core/        models, ExpenseStore (signals + localStorage), theme, toasts, dialog controller
  utils/       pure, unit-tested logic: analytics, filters, CSV, dates, formatting, chart scales, sample data
  shared/      icons, badges, chart card/tooltip/measure, toast container, add/edit dialog + validators
  features/
    dashboard/ stat cards, trend / monthly / category charts (hand-built SVG, no chart library)
    expenses/  filters + list
    cloud/     export hub: model (templates, destinations), reports (builders + CSV/JSON/PDF renderers),
               services (store, background jobs, scheduler, sharing), ui, pages
```

## Design notes

- **Chart colors** are the first six slots of a categorical palette that passes color-blind-separation checks in both themes. Each category keeps a fixed color (never assigned by rank). The stacked bar keeps the fixed category order for that reason; the legend beside it is ranked by spend.
- **Money** is summed in integer cents so `0.1 + 0.2` style drift never reaches the UI.
- **Dates** are local calendar days (`YYYY-MM-DD`), avoiding the off-by-one-day bug of `toISOString()` in timezones behind UTC.

## Limitations

- Currency is fixed to USD (`en-US`); there is no currency setting.
- `localStorage` is per-browser and typically ~5 MB; there is no sync or import.
- Share links, integrations and the scheduler are local simulations (no server): links only open in the browser that created them, and automations only run while the app is open.
- PDFs use built-in fonts, so characters outside Western European text print as `?`.
- Angular 21 was used because the latest CLI (22) needs a newer Node than 22.18.
