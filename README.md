# 转单草稿纸 — DSP Tools（独立项目）

路径：`~/Projects/delivery-pivot`

Sheet：https://docs.google.com/spreadsheets/d/1Are418ZqRfd8ifZKGOUIuhIlDmAppAe-_UZg25S_OvQ

## 日常

1. 更新 **`delivery_monitoring`**
2. **DSP Tools → 生成今日妥投** → 生成/刷新当日 tab（名如 `2026-08-03`）
   - 会**追加**种子映射（含 LYL EXPRESS INC / 1577 及司机），**不会清空** `dsp_mapping` 手工行
3. 未知司机在 **R** 填 Team ID → **Update DSP Mapping**（只写入 mapping，**不改 N–R / 不清 Q–R**）
4. 需要时 → **生成群话术**（写到 T:Z，共 7 个 DSP）

往日日期 tab 会在生成「新一天」时冻结为数值，历史保留、不被改写。

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
