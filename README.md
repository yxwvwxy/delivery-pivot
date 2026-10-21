# 转单草稿纸 — DSP Tools（独立项目）

路径：`~/Projects/delivery-pivot`

Sheet：https://docs.google.com/spreadsheets/d/1Are418ZqRfd8ifZKGOUIuhIlDmAppAe-_UZg25S_OvQ

## 展示界面（Power BI 目标形态 · 模拟）

仓库内有一份 **Daily Performance Report** 的 Cursor Canvas 原型（脱敏数据），用来说明未来 **UniUni API → Power BI → Teams** 的 nightly 流程与看板长什么样，**不是**当前 Google Sheet 里跑的生产逻辑。

| 文件 | 说明 |
|------|------|
| [`canvases/ewr-performance-dashboard.canvas.tsx`](canvases/ewr-performance-dashboard.canvas.tsx) | 源码（随 git 版本管理） |
| Cursor 侧栏打开 | 在本仓库用 Cursor 打开上述 `.canvas.tsx`，在聊天旁打开 Canvas 预览 |

**每晚三步（Canvas 顶部会自动轮播高亮）：**

1. **10pm fetch data via UniUni API**
2. **Build Power BI daily performance report**
3. **Send messages to Microsoft Teams group chats**

**报告内容（模拟）：**

- 汇总：**Delivery / Return / Inactive rate**
- **Delivery Performance**（示例日期 10/14/2026）：按 DSP 展示总量、已妥投、妥投率、待配送、退货；妥投率 ≥99% 绿、97–99% 黄、&lt;97% 红
- **Inactivity Report**（10/9–10/14）：≥5 天无更新标红，3–5 天标黄  
  - **Driver**：按 DSP 归因  
  - **Warehouse**：按仓（如 WH1），不按 DSP  
  - **Transit**：全网 transit，不归 DSP  

指标口径（与 `Code.gs` 当前 Sheet 逻辑一致的方向）：总数含 200/202/211/213/231/232/203；妥投率 = (总数−202)/总数；退货率 = (211+231+232)/总数。

---

## 日常（当前生产：Google Sheet + Apps Script）

1. 更新 **`delivery_monitoring`**
2. **DSP Tools → 生成今日妥投** → 先冻结往日 tab，再生成/刷新当日 tab（名如 `2026-08-03`）
   - 会**追加**种子映射（含 LYL EXPRESS INC / 1577 及司机），**不会清空** `dsp_mapping` 手工行
   - 往日若被误写入「未知」且司机已在 Q/R 补过映射，会一并清掉
3. 未知司机在 **R** 填 Team ID → **Update DSP Mapping**（写入 mapping，并把当日 **A–L 冻成数值**）
4. 需要时 → **生成群话术**（写到 T:Z，共 7 个 DSP）

## 主 DSP（7）

`MASTER_DSPS`：Final Mile / Gawen Group / LITTLESNAILS / **LYL EXPRESS INC** / shunda express service / WUKONG / Yuanyuan Pan

每日妥投汇总 **A3:L9** 共 7 行；**未知**在第 **10** 行（`unknownRow_ = 3 + N`）。

## 菜单顺序

1. 生成今日妥投  
2. 修复Q列公式  
3. Update DSP Mapping  
4. 生成群话术  

## 安装

扩展程序 → Apps Script → 用本目录 `Code.gs` **全量替换** → 保存 → 刷新表格 → 再点一次「生成今日妥投」。
