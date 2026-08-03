# 转单草稿纸 — DSP Tools（独立项目）

路径：`~/delivery-pivot`（已从 `unimap-auto-inbound` 拆出）

Sheet：https://docs.google.com/spreadsheets/d/19DWCgZBb-ve32P5nDQs2zgI0z3GhBoO87Tqq7-FfK74

## 日常

1. 更新 **`delivery_monitoring`**
2. **DSP Tools → 生成今日妥投** → 生成/刷新当日 tab（名如 `2026-08-03`）
3. 未知司机在 **R** 填 Team ID → **Update DSP Mapping**（只写入 mapping，**不改 N–R / 不清 Q–R**）
4. 需要时 → **生成群话术**（写到 T:Y）

往日日期 tab 会在生成「新一天」时冻结为数值，历史保留、不被改写。

## 菜单顺序

1. 生成今日妥投  
2. 修复Q列公式  
3. Update DSP Mapping  
4. 生成群话术  

## 安装

扩展程序 → Apps Script → 用本目录 `Code.gs` 全量替换 → 保存 → 刷新表格。
