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
npm test -- --no-watch   # app unit tests (Vitest), 233 tests
npm run server:test      # sync-server tests, 87 tests
npm run server:check     # strict type-check of the sync server
npm run build            # production build into dist/expense-tracker
```

> `.npmrc` sets `legacy-peer-deps=true`. Without it, npm 11's resolver crashed
> (`Cannot read properties of null (reading 'edgesOut')`) on this dependency set.

## Features

| Area | What you get |
| --- | --- |
| Add / edit | Modal form (bottom sheet on phones) with native date picker, amount, ten categories, description |
| Validation | Amount > 0 and ≤ $1,000,000 with max 2 decimals; date required, valid, not in the future; description required, ≤ 80 chars. Errors appear on blur/submit and focus jumps to the first bad field |
| List | Search (description, category, amount), category filter, date range (presets + custom), sort, "show more" paging, filtered total |
| Delete | Immediate, with an **Undo** toast |
| Dashboard | Total spending, this month (vs the same days last month), top category, daily average; last-30-days line, monthly columns, category breakdown; recent expenses |
| Charts | Hover/tap/keyboard tooltips, and a **Table** view on each chart so every value is readable without color or hover |
| Export | CSV of whatever the list currently shows (respects filters and sort); UTF-8 BOM for Excel; formula-injection safe |
| Bank sync | Import bank CSVs, or connect your bank through SimpleFIN and have transactions pulled in automatically. Everything lands in a **review inbox** first: check the suggested category, skip transfers, then approve. See *Bank sync* below |
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
8. **Export** – *Export CSV*; open the file (dates, description, category, amount).
9. **Dashboard** – hover the charts (or Tab to them and use ←/→ on the 30-day chart); toggle **Table** on a chart; hover a category row.
10. **Persistence** – reload the page; everything is still there. Toggle **Dark mode**; it persists too.
11. **Responsive** – narrow the window below 1024px for the bottom nav and floating add button.
12. **Error handling** – in DevTools run `localStorage.setItem('spendwise.expenses.v1', '{broken')`, reload; a warning banner appears instead of a crash.

## Bank sync

Two ways to bring in transactions, both feeding one **review inbox** (nothing becomes an expense until you approve it):

- **Import a CSV** from your bank (drag and drop). Works with no setup and no server; files are read in your browser.
- **Automatic sync** through [SimpleFIN Bridge](https://bridge.simplefin.org) ($15/year, read-only, US banks). A small server on your computer fetches new transactions daily.

### Set up automatic sync (once)

1. Start the sync server in a terminal, in this folder: `npm run server`. It prints an **API token**.
2. Open **Bank sync** in the app, paste the API token, and press **Pair**.
3. At bridge.simplefin.org, link your bank and create a **setup token**. Paste it into the app and press **Connect**.
4. Review what arrived, fix categories if needed, and **Approve**.

Leave the server running and it syncs once a day (and catches up when you start it). Start it whenever you want a fresh sync. To try the whole flow without a bank, run `node server/test/fake-simplefin.ts` in another terminal and use the setup token it prints (it works once).

### What is stored where, and why a server

| | Where | Notes |
| --- | --- | --- |
| SimpleFIN access key | `server/data/state.json` (git-ignored, owner-only permissions) | **Never sent to the browser.** It can't safely live in browser code, which is why a small local server exists |
| Synced transactions | The server keeps recent ones; the app copies them into this browser | Your expenses stay in this browser's storage |
| Bank login | With SimpleFIN only | Spendwise never sees it |
| API token | Printed by the server; kept in this browser once you paste it | Stops other web pages from talking to your server |

The server listens on `127.0.0.1` only, checks the API token, only answers the app's own address (CORS allow-list), rejects requests with a foreign `Host` header, and never logs or returns the access key. It makes at most **4 requests to SimpleFIN in any 24 hours** (SimpleFIN asks for 24 or fewer), and a mistyped setup token costs nothing. Settings are environment variables: `SPENDWISE_PORT` (3111), `SPENDWISE_ALLOWED_ORIGINS` (`http://localhost:4200`), `SPENDWISE_DATA_DIR`, `SPENDWISE_MAX_REQUESTS_PER_DAY`, `SPENDWISE_INITIAL_DAYS` (90), `SPENDWISE_AUTO_SYNC=off`.

### How the review inbox decides
- **Categories** come from built-in keywords, then from your own corrections: change one Amazon row and every Amazon row (and future ones) follows.
- **Skipped automatically:** money coming in, transfers and card payments, and *possible duplicates* of something you typed by hand or that arrived by both CSV and sync (held for you, with "Import anyway").
- **Never twice:** approved and cleared items are remembered, so re-importing a statement or re-syncing adds nothing.
- Some banks list purchases as positive numbers; each account has a **Purchases are positive** switch, and CSV imports guess it for you.

Limits: US banks only (SimpleFIN); syncing needs your computer and the server to be on; pending transactions are left out until they post; how far back the first sync reaches depends on SimpleFIN and your bank (the app asks for 90 days).

## Categories

Groceries, Dining, Transportation, Travel, Entertainment, Subscriptions, Shopping, Home Improvement, Bills, Other.

- **Renamed:** *Food* became *Groceries*. Expenses, review-inbox items and learned bank rules saved under *Food* are migrated automatically the first time the app loads, so nothing is lost. If some of your old Food entries were restaurants, move them to *Dining* from the Expenses page.
- **Chart colors:** the palette only has six colors that stay distinguishable for everyone (including color-blind viewers), so related categories share a color family: Groceries and Dining, Transportation and Travel, Entertainment and Subscriptions, Shopping and Home Improvement. Names are always shown beside the color (legends, tooltips, labels), and the list order keeps each family together.
- **Bank sync keywords** know the new categories (for example Starbucks is Dining, Netflix is a Subscription, Delta and Marriott are Travel, Home Depot is Home Improvement), and still learn from your own corrections.

## Project layout

```
src/app/
  core/        models, ExpenseStore (signals + localStorage), theme, toasts, dialog controller
  utils/       pure, unit-tested logic: analytics, filters, CSV, dates, formatting, chart scales, sample data
  shared/      icons, badges, chart card/tooltip/measure, toast container, add/edit dialog + validators
  features/
    dashboard/ stat cards, trend / monthly / category charts (hand-built SVG, no chart library)
    expenses/  filters + list
    bank/      CSV import, review inbox, category learning, and the client for the sync server
server/        local sync server (Node, no runtime dependencies): SimpleFIN client, sync + rate limits, HTTP API, tests
```

## Design notes

- **Chart colors** are the first six slots of a categorical palette that passes color-blind-separation checks in both themes. Each category keeps a fixed color (never assigned by rank). The stacked bar keeps the fixed category order for that reason; the legend beside it is ranked by spend.
- **Money** is summed in integer cents so `0.1 + 0.2` style drift never reaches the UI.
- **Dates** are local calendar days (`YYYY-MM-DD`), avoiding the off-by-one-day bug of `toISOString()` in timezones behind UTC.

## Limitations

- Currency is fixed to USD (`en-US`); there is no currency setting.
- `localStorage` is per-browser and typically ~5 MB; expenses are not synced between devices.
- Angular 21 was used because the latest CLI (22) needs a newer Node than 22.18.
