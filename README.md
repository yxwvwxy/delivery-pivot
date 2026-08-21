# 转单草稿纸 — DSP Tools（独立项目）

路径：`~/Projects/delivery-pivot`

Sheet：https://docs.google.com/spreadsheets/d/1Are418ZqRfd8ifZKGOUIuhIlDmAppAe-_UZg25S_OvQ

## 日常

1. **打开/刷新表格**（会自动冻结昨天的 tab；须在粘贴新 monitoring **之前**）
2. 更新 **`delivery_monitoring`**
3. **DSP Tools → 生成今日妥投** → 生成/刷新当日 tab（名如 `2026-08-03`）
   - 会**追加**种子映射（含 LYL EXPRESS INC / 1577 及司机），**不会清空** `dsp_mapping` 手工行
4. 未知司机在 **R** 填 Team ID → **Update DSP Mapping**（写入 mapping，并把当日 **A–L 冻成数值**）
5. 需要时 → **生成群话术**（写到 T:Z，共 7 个 DSP；同时再冻一次 A–L）

补完 mapping 后 A–L 必须冻成数值。否则次日一改 `delivery_monitoring`，共用的 `_pivot_data` 会把新的「未知」写进昨天的 tab。

已冻坏的往日未知行：菜单 **清除往日误写入的未知行**。

## 主 DSP（7）

`MASTER_DSPS`：Final Mile / Gawen Group / LITTLESNAILS / **LYL EXPRESS INC** / shunda express service / WUKONG / Yuanyuan Pan

每日妥投汇总 **A3:L9** 共 7 行；**未知**在第 **10** 行（`unknownRow_ = 3 + N`）。

## 菜单顺序

1. 生成今日妥投  
2. 修复Q列公式  
3. Update DSP Mapping  
4. 生成群话术  
5. 冻结当前妥投表  
6. 清除往日误写入的未知行  

## 安装

扩展程序 → Apps Script → 用本目录 `Code.gs` **全量替换** → 保存 → 刷新表格 → 再点一次「生成今日妥投」。
