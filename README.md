# Daily Performance Report

Interactive preview lives in the repo:

- [`canvases/ewr-performance-dashboard.canvas.tsx`](canvases/ewr-performance-dashboard.canvas.tsx) — open in Cursor and use the Canvas panel to view the dashboard.

## Nightly workflow

The header cycles through three steps automatically:

1. **10pm fetch data via UniUni API**
2. **Build Power BI daily performance report**
3. **Send messages to Microsoft Teams group chats**

## Report layout

**Summary KPIs:** delivery rate, return rate, inactive rate.

**Delivery performance** (example date 10/14/2026): per-DSP totals, delivered count, delivery rate, to be delivered, returns. Row emphasis: ≥99% green, 97–98.9% yellow, &lt;97% red.

**Inactivity report** (example range 10/9/2026–10/14/2026): ≥5 days without update (red), 3–5 days (yellow).

| Section | Scope |
|---------|--------|
| Driver inactivity | By DSP |
| Warehouse inactivity | By site (e.g. WH1), not by DSP |
| Transit inactivity | Network-wide, not by DSP |

**Metrics:** total parcels = 200 + 202 + 211 + 213 + 231 + 232 + 203; delivery rate = (total − 202) / total; return rate = (211 + 231 + 232) / total.

## Apps Script (`Code.gs`)

1. Refresh **`delivery_monitoring`**.
2. **Generate today’s delivery tab** — freeze past date tabs, then create or refresh the tab named for the report date (e.g. `2026-08-03`). Appends seed mappings (including LYL EXPRESS INC / 1577 and drivers) without clearing manual rows in `dsp_mapping`. Cleans incorrect unknown rows on frozen past tabs when drivers were mapped in Q/R.
3. For unknown drivers, set Team ID in column **R**, then **Update DSP Mapping** (updates mapping and freezes **A–L** to values for that day).
4. Optionally **Generate group messages** (columns T:Z, seven DSPs).

**Master DSPs (`MASTER_DSPS`):** Final Mile, Gawen Group, LITTLESNAILS, LYL EXPRESS INC, shunda express service, WUKONG, Yuanyuan Pan.

Daily summary occupies **A3:L9** (seven DSP rows); the unknown row is row **10** (`unknownRow_ = 3 + N`).

**Menu order:** generate today’s delivery tab → repair column Q formulas → Update DSP Mapping → generate group messages.

**Install:** Extensions → Apps Script → replace the project script with this repo’s `Code.gs` → save → refresh the spreadsheet → run generate today’s delivery tab once.
