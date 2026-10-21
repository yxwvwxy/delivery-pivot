# Daily Performance Report

### Nightly workflow

| Step 1 | → | Step 2 | → | Step 3 |
|--------|---|--------|---|--------|
| 10pm fetch data via UniUni API | | Build Power BI daily performance report | | Send messages to Microsoft Teams group chats |

### Summary

| Delivery rate | Return rate | Inactive rate |
|:-------------:|:-----------:|:-------------:|
| **98.3%** | **0.7%** | **0.4%** |

---

## 10/14/2026 Delivery Performance

Delivery rate row emphasis: ≥99% strong · 97–98.9% watch · below 97% critical

| DSP | Total | Delivered | Delivery rate | To be delivered | Returned | Return rate |
|-----|------:|----------:|--------------:|----------------:|---------:|------------:|
| DSP2 | 5,120 | 5,089 | 99.4% | 0 | 20 | 0.4% |
| DSP1 | 4,850 | 4,811 | 99.2% | 12 | 24 | 0.5% |
| DSP3 | 4,380 | 4,275 | 97.6% | 58 | 32 | 0.7% |
| DSP4 | 3,920 | 3,783 | 96.5% | 92 | 30 | 0.8% |

---

## Inactivity Report

10/9/2026–10/14/2026 · **≥5 days** without update · **3–5 days** without update

### Driver inactivity by DSP

Driver-owned parcels · attributed to DSP

| DSP | ≥5 days | 3–5 days |
|-----|--------:|---------:|
| DSP1 | 18 | 26 |
| DSP2 | 11 | 19 |
| DSP3 | 22 | 31 |
| DSP4 | 28 | 36 |

### Warehouse inactivity

Warehouse / hub scope · not split by DSP

| Site | ≥5 days | 3–5 days |
|------|--------:|---------:|
| WH1 | 14 | 21 |

### Transit inactivity

In transit between nodes · not attributed to any DSP

| Scope | ≥5 days | 3–5 days |
|-------|--------:|---------:|
| Transit (network) | 9 | 14 |

---

**Metrics:** total parcels = 200 + 202 + 211 + 213 + 231 + 232 + 203 · delivery rate = (total − 202) / total · return rate = (211 + 231 + 232) / total

---

## Apps Script (Code.gs)

1. Refresh delivery_monitoring.
2. Generate today’s delivery tab — freeze past date tabs, then create or refresh the tab named for the report date (e.g. 2026-08-03). Appends seed mappings (including LYL EXPRESS INC / 1577 and drivers) without clearing manual rows in dsp_mapping. Cleans incorrect unknown rows on frozen past tabs when drivers were mapped in Q/R.
3. For unknown drivers, set Team ID in column R, then Update DSP Mapping (updates mapping and freezes A–L to values for that day).
4. Optionally generate group messages (columns T:Z, seven DSPs).

Master DSPs (MASTER_DSPS): Final Mile, Gawen Group, LITTLESNAILS, LYL EXPRESS INC, shunda express service, WUKONG, Yuanyuan Pan.

Daily summary occupies A3:L9 (seven DSP rows); the unknown row is row 10 (unknownRow_ = 3 + N).

Menu order: generate today’s delivery tab → repair column Q formulas → Update DSP Mapping → generate group messages.

Install: Extensions → Apps Script → replace the project script with this repo’s Code.gs → save → refresh the spreadsheet → run generate today’s delivery tab once.
