/**
 * 转单草稿纸 — DSP Tools
 *
 * 日常：
 * 1. 更新 delivery_monitoring
 * 2. 菜单「生成今日妥投」→ 生成/刷新以当天日期命名的 sheet（如 2026-08-03）
 * 3. 未知司机填 R →「Update DSP Mapping」（只追加 dsp_mapping，不改 N–R / 不清 Q–R）
 * 4. 「生成群话术」→ T:Y
 *
 * 历史：往日日期 sheet 会在生成「新一天」时冻结为数值，不再随 monitoring 变化。
 *
 * 菜单顺序：
 * 1 生成今日妥投
 * 2 修复Q列公式
 * 3 Update DSP Mapping
 * 4 生成群话术
 */

var SHEETS = {
  mapping: ["dsp_mapping", "DSP_Mapping"],
  monitoring: ["delivery_monitoring", "Delivery_Monitoring"],
  legacyPivot: "pivot_table",
  helper: "_pivot_data",
  dspHelper: "_pivot_dsp",
};

var UNKNOWN_LABEL = "未知";
var PIVOT_DETAIL_START_COL = 14; // N
var PIVOT_DETAIL_NUM_COLS = 5; // N–R
var SUMMARY_START_COL = 20; // T
var Q_FORMULA_LAST_ROW = 300;

var MASTER_DSPS = [
  "Final Mile",
  "Gawen Group",
  "LITTLESNAILS",
  "shunda express service",
  "WUKONG",
  "Yuanyuan Pan",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("DSP Tools")
    .addItem("生成今日妥投", "generateTodayDelivery")
    .addItem("修复Q列公式", "restoreQMappingFormulas")
    .addItem("Update DSP Mapping", "updateDSPMapping")
    .addItem("生成群话术", "generateDSPSummary")
    .addToUi();
}

function getSheetByNames_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

function spreadsheetTz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "America/New_York";
}

/** 今日 sheet 名：2026-08-03 */
function todaySheetName_() {
  return Utilities.formatDate(new Date(), spreadsheetTz_(), "yyyy-MM-dd");
}

function isDateSheetName_(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(name || ""));
}

function isWorkingPivotName_(name) {
  return isDateSheetName_(name) || name === SHEETS.legacyPivot;
}

/** 优先今日日期 sheet，否则旧 pivot_table / 当前活动的日期表 */
function getWorkingPivot_(ss) {
  var today = todaySheetName_();
  var sh = ss.getSheetByName(today);
  if (sh) return sh;

  var active = ss.getActiveSheet();
  if (active && isWorkingPivotName_(active.getName())) return active;

  return ss.getSheetByName(SHEETS.legacyPivot);
}

function normalizeDspKey(name) {
  return String(name || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function canonicalDspName(name) {
  return String(name || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getMasterDspList(ss) {
  var mappingSheet = getSheetByNames_(ss, SHEETS.mapping);
  var masterMap = new Map();

  if (mappingSheet && mappingSheet.getLastRow() >= 2) {
    var lastRow = mappingSheet.getLastRow();
    mappingSheet
      .getRange("A2:A" + lastRow)
      .getValues()
      .flat()
      .forEach(function (name) {
        var canonical = canonicalDspName(name);
        var key = normalizeDspKey(canonical);
        if (key && !masterMap.has(key)) masterMap.set(key, canonical);
      });
  }

  var ordered = [];
  MASTER_DSPS.forEach(function (name) {
    var key = normalizeDspKey(name);
    if (masterMap.has(key)) {
      ordered.push(masterMap.get(key));
      masterMap.delete(key);
    } else {
      ordered.push(name);
    }
  });
  Array.from(masterMap.values())
    .sort(function (a, b) {
      return a.localeCompare(b);
    })
    .forEach(function (n) {
      ordered.push(n);
    });
  return ordered;
}

function looksLikeId_(value) {
  var s = String(value == null ? "" : value).trim();
  if (!s) return false;
  if (/[^0-9.]/.test(s)) return false;
  return true;
}

/**
 * 更新完 delivery_monitoring 后点这个：
 * - 刷新隐藏辅助表
 * - 冻结其他日期 sheet（保留历史）
 * - 生成/重建今日「yyyy-MM-dd」sheet
 */
function generateTodayDelivery() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!getSheetByNames_(ss, SHEETS.monitoring) || !getSheetByNames_(ss, SHEETS.mapping)) {
    SpreadsheetApp.getUi().alert("缺少 delivery_monitoring 或 dsp_mapping。");
    return;
  }

  var today = todaySheetName_();
  freezeOtherDateSheets_(ss, today);

  setupHelperSheet_(ss);
  setupDspHelperSheet_(ss);

  var pivot = ss.getSheetByName(today);
  if (!pivot) {
    var legacy = ss.getSheetByName(SHEETS.legacyPivot);
    if (legacy) {
      legacy.setName(today);
      pivot = legacy;
    } else {
      pivot = ss.insertSheet(today);
    }
  }

  setupPivotSheet_(ss, pivot, today);
  ss.setActiveSheet(pivot);

  SpreadsheetApp.getUi().alert(
    "已生成今日妥投：" +
      today +
      "\n\n往日日期 tab 已保留（冻结为数值）。\n请在 R 列补未知映射后点 Update DSP Mapping。"
  );
}

/** 把非今日的 yyyy-MM-dd sheet 从公式冻成数值，避免次日刷新 monitoring 改写历史 */
function freezeOtherDateSheets_(ss, todayName) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = sh.getName();
    if (!isDateSheetName_(name) || name === todayName) continue;
    freezePivotSheetToValues_(sh);
  }
}

function freezePivotSheetToValues_(pivot) {
  // 若 A3 已无公式，视为已冻结
  var a3f = pivot.getRange("A3").getFormula();
  if (!a3f) return;

  var al = pivot.getRange("A1:L9").getDisplayValues();
  var lastRow = Math.max(pivot.getLastRow(), 2);
  var np = pivot.getRange("N2:P" + lastRow).getDisplayValues();
  // 去掉尾部空行
  while (
    np.length > 1 &&
    !String(np[np.length - 1][0] || "").trim() &&
    !String(np[np.length - 1][1] || "").trim()
  ) {
    np.pop();
  }

  pivot.getRange("A:L").clearContent();
  pivot.getRange("N:P").clearContent();

  pivot.getRange("A1:L1").merge();
  pivot.getRange("A1:L9").setValues(al);
  if (np.length) {
    pivot.getRange("N2:P" + (np.length + 1)).setValues(np);
  }

  applyPivotFormats_(pivot);
  refreshUnknownRowStyle_(pivot);
}

function restoreQMappingFormulas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pivot = getWorkingPivot_(ss);
  if (!pivot) {
    SpreadsheetApp.getUi().alert("请先点「生成今日妥投」。");
    return;
  }
  ensureQMappingFormulas_(pivot);
  SpreadsheetApp.getUi().alert(
    "已在「" +
      pivot.getName() +
      "」重装 Q3:Q" +
      Q_FORMULA_LAST_ROW +
      " 公式。\nR 列未改动。"
  );
}

function buildTeamIdToDspMap_(mappingSheet) {
  var map = {};
  var lastRow = mappingSheet.getLastRow();
  if (lastRow < 2) return map;
  var rows = mappingSheet.getRange("A2:B" + lastRow).getDisplayValues();
  rows.forEach(function (row) {
    var name = canonicalDspName(row[0]);
    var teamId = String(row[1] == null ? "" : row[1]).trim();
    if (!name || !looksLikeId_(teamId)) return;
    if (!map[teamId]) map[teamId] = name;
  });
  return map;
}

/**
 * R 列填 Team ID → 只追加 dsp_mapping。
 * 不改 N–R 内容/顺序，不重装 Q，不清空 R（避免 QUERY 重排打乱手动输入行）。
 */
function updateDSPMapping() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pivot = getWorkingPivot_(ss);
  var mappingSheet = getSheetByNames_(ss, SHEETS.mapping);

  if (!pivot || !mappingSheet) {
    SpreadsheetApp.getUi().alert("缺少今日妥投表或 dsp_mapping。请先「生成今日妥投」。");
    return;
  }

  var lastRow = pivot.getLastRow();
  if (lastRow < 3) {
    SpreadsheetApp.getUi().alert("No data found.");
    return;
  }

  // 先读当前 N–R 画面上的 O/Q/R（此时顺序仍是用户看到的）
  var data = pivot.getRange("O3:R" + lastRow).getDisplayValues();
  var teamIdToDsp = buildTeamIdToDspMap_(mappingSheet);

  var mappingLastRow = mappingSheet.getLastRow();
  var existingDrivers = new Set();
  if (mappingLastRow > 1) {
    mappingSheet
      .getRange("C2:C" + mappingLastRow)
      .getDisplayValues()
      .flat()
      .forEach(function (id) {
        existingDrivers.add(String(id).trim());
      });
  }

  var rowsToAdd = [];
  data.forEach(function (row) {
    var driverId = String(row[0] == null ? "" : row[0]).trim();
    var qName = canonicalDspName(row[2]);
    var teamId = String(row[3] == null ? "" : row[3]).trim();

    if (!looksLikeId_(driverId) || !looksLikeId_(teamId)) return;
    if (existingDrivers.has(driverId)) return;

    var dspName = teamIdToDsp[teamId] || qName;
    if (!dspName) return;

    rowsToAdd.push([dspName, teamId, driverId]);
    existingDrivers.add(driverId);
  });

  if (rowsToAdd.length === 0) {
    SpreadsheetApp.getUi().alert(
      "No new driver mappings found.\n（需在 R 列填数字 Team ID，且该 Team ID 已在 dsp_mapping 中存在）"
    );
    return;
  }

  // 写入 mapping 前先把 N–P 冻成数值，避免 QUERY 因新映射重排/改写明细
  freezeDetailColumnsNP_(pivot);

  mappingSheet
    .getRange(mappingSheet.getLastRow() + 1, 1, rowsToAdd.length, 3)
    .setValues(rowsToAdd);

  SpreadsheetApp.flush();
  refreshUnknownRowStyle_(pivot);

  var preview = rowsToAdd
    .map(function (r) {
      return r[2] + " → " + r[0] + " (" + r[1] + ")";
    })
    .join("\n");
  SpreadsheetApp.getUi().alert(
    rowsToAdd.length +
      " new driver mappings added:\n" +
      preview +
      "\n\n仅更新了 dsp_mapping；N–R 内容与顺序、Q/R 显示均未改动。\nA–L 会随映射刷新。"
  );
}

/** 将 N–P 明细从 QUERY 冻成当前显示值；不碰 Q–R */
function freezeDetailColumnsNP_(pivot) {
  var n2f = pivot.getRange("N2").getFormula();
  if (!n2f) return; // 已是数值，无需再冻

  var lastRow = Math.max(pivot.getLastRow(), 2);
  var np = pivot.getRange("N2:P" + lastRow).getDisplayValues();
  while (
    np.length > 1 &&
    !String(np[np.length - 1][0] || "").trim() &&
    !String(np[np.length - 1][1] || "").trim()
  ) {
    np.pop();
  }

  pivot.getRange("N2:P" + lastRow).clearContent();
  if (np.length) {
    pivot.getRange("N2:P" + (np.length + 1)).setValues(np);
  }
}

function refreshUnknownRowStyle_(pivot) {
  var a9 = pivot.getRange("A9").getDisplayValue();
  if (a9) {
    pivot.getRange("A9:L9").setBackground("#FFF2CC");
    pivot.getRange("F9:H9").setBackground("#FF0000");
  } else {
    pivot.getRange("A9:E9").setBackground(null);
    pivot.getRange("I9:L9").setBackground(null);
    pivot.getRange("F9:H9").setBackground(null);
  }
}

function buildSummaryText(drivers) {
  var maxCnt = Math.max.apply(
    null,
    drivers.map(function (x) {
      return Number(x.cnt) || 0;
    })
  );

  var summary = "";
  if (maxCnt <= 10) {
    summary = "请提醒司机点掉状态";
  } else if (maxCnt < 25) {
    summary = "请提醒司机送完点掉状态";
  } else {
    summary = "请提醒司机点掉状态并及时配送剩余包裹";
  }

  var detailText = drivers
    .sort(function (a, b) {
      return b.cnt - a.cnt;
    })
    .map(function (x) {
      return x.driver + " (" + x.cnt + ")";
    })
    .join("\n");

  return [summary, detailText].filter(Boolean).join("\n").trim();
}

/** 生成群话术 → 写到当前工作 pivot 的 T:Y */
function generateDSPSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getWorkingPivot_(ss);

  if (!sheet) {
    SpreadsheetApp.getUi().alert("请先点「生成今日妥投」。");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 3) {
    SpreadsheetApp.getUi().alert("No data found.");
    return;
  }

  sheet.getRange("T:Y").breakApart();
  sheet.getRange("T:Y").clearContent();
  sheet.getRange("X1").clearContent();

  var data = sheet.getRange("N2:R" + lastRow).getDisplayValues();
  var dspMap = {};

  data.forEach(function (row) {
    if (String(row[0]) === "Team_name" || String(row[1]) === "Driver") return;

    var teamName = row[0];
    var driverId = row[1];
    var cnt202 = Number(row[2]) || 0;
    var mappingName = row[3];
    var rawDsp = teamName || mappingName;

    if (!rawDsp || !driverId) return;
    if (normalizeDspKey(rawDsp) === normalizeDspKey(UNKNOWN_LABEL)) return;

    var key = normalizeDspKey(rawDsp);
    if (!dspMap[key]) {
      dspMap[key] = { displayName: canonicalDspName(rawDsp), drivers: [] };
    }
    dspMap[key].drivers.push({ driver: driverId, cnt: cnt202 });
  });

  var masterDsps = getMasterDspList(ss);
  var EMPTY_MESSAGE = "请提醒司机及时将退件返仓";

  masterDsps.forEach(function (dspName, index) {
    if (index > 5) return;

    var col = SUMMARY_START_COL + index;
    var key = normalizeDspKey(dspName);
    var entry = dspMap[key];

    sheet.getRange(2, col).setValue(dspName).setFontWeight("normal");

    var finalText = EMPTY_MESSAGE;
    if (entry && entry.drivers.length > 0) {
      finalText = buildSummaryText(entry.drivers);
    }

    sheet
      .getRange(3, col)
      .setValue(finalText)
      .setWrap(true)
      .setVerticalAlignment("top");
  });

  // T–Y 列宽 150
  for (var c = SUMMARY_START_COL; c < SUMMARY_START_COL + 6; c++) {
    sheet.setColumnWidth(c, 150);
  }

  SpreadsheetApp.getUi().alert(
    "群话术已写入「" + sheet.getName() + "」T:Y（" + Math.min(masterDsps.length, 6) + " 个 DSP）"
  );
}

function setupHelperSheet_(ss) {
  var sh = ss.getSheetByName(SHEETS.helper);
  if (!sh) sh = ss.insertSheet(SHEETS.helper);
  sh.clear();
  sh.getRange("A1:P1").setValues([
    [
      "Driver",
      "DSP",
      "200",
      "202",
      "211",
      "213",
      "231",
      "232",
      "203",
      "total",
      "returns",
      "rate",
      "below95",
      "team_display",
      "group",
      "team_rate",
    ],
  ]);
  sh.getRange("A1:P1").setFontWeight("bold");

  sh.getRange("A2").setFormula(
    '=ARRAYFORMULA(IF(delivery_monitoring!A2:A="",,delivery_monitoring!A2:A))'
  );
  sh.getRange("B2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VLOOKUP(A2:A&"",{dsp_mapping!C2:C&"",dsp_mapping!A2:A},2,FALSE),"' +
      UNKNOWN_LABEL +
      '")))'
  );
  sh.getRange("C2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VALUE(delivery_monitoring!B2:B),0)))'
  );
  sh.getRange("D2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VALUE(delivery_monitoring!C2:C),0)))'
  );
  sh.getRange("E2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VALUE(delivery_monitoring!D2:D),0)))'
  );
  sh.getRange("F2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VALUE(delivery_monitoring!E2:E),0)))'
  );
  sh.getRange("G2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VALUE(delivery_monitoring!F2:F),0)))'
  );
  sh.getRange("H2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VALUE(delivery_monitoring!G2:G),0)))'
  );
  sh.getRange("I2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(VALUE(delivery_monitoring!H2:H),0)))'
  );
  sh.getRange("J2").setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",,D2:D+E2:E+G2:G+H2:H+I2:I))"
  );
  sh.getRange("K2").setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",,E2:E+G2:G+H2:H))"
  );
  sh.getRange("L2").setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",,IFERROR(I2:I/J2:J,0)))"
  );
  sh.getRange("M2").setFormula(
    "=ARRAYFORMULA(IF(A2:A=\"\",,IF(J2:J<=0,0,IF(L2:L<0.95,1,0))))"
  );
  sh.getRange("N2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IF(B2:B="' + UNKNOWN_LABEL + '","",B2:B)))'
  );
  sh.getRange("O2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IF(B2:B="' + UNKNOWN_LABEL + '",2,1)))'
  );
  sh.getRange("P2").setFormula(
    '=ARRAYFORMULA(IF(A2:A="",,IF(B2:B="' +
      UNKNOWN_LABEL +
      '",-1,IFERROR(VLOOKUP(B2:B,\'_pivot_dsp\'!B:K,10,FALSE),0))))'
  );
  sh.hideSheet();
}

function setupDspHelperSheet_(ss) {
  var sh = ss.getSheetByName(SHEETS.dspHelper);
  if (!sh) sh = ss.insertSheet(SHEETS.dspHelper);
  sh.clear();
  sh.getRange("A1:L1")
    .setValues([
      [
        "Warehouse",
        "DSP",
        "202",
        "211",
        "231",
        "232",
        "203",
        "包裹总数",
        "退包数",
        "退包率",
        "妥投率",
        "当日未达到95%司机数",
      ],
    ])
    .setFontWeight("bold");

  var dsps = getMasterDspList(ss).slice(0, 6);
  while (dsps.length < 6) dsps.push("");

  for (var i = 0; i < 6; i++) {
    var row = 2 + i;
    var b = "$B" + row;
    sh.getRange(row, 1).setValue("EWR");
    sh.getRange(row, 2).setValue(dsps[i]);
    sh.getRange(row, 3).setFormula("=SUMIF('_pivot_data'!$B:$B," + b + ",'_pivot_data'!$D:$D)");
    sh.getRange(row, 4).setFormula("=SUMIF('_pivot_data'!$B:$B," + b + ",'_pivot_data'!$E:$E)");
    sh.getRange(row, 5).setFormula("=SUMIF('_pivot_data'!$B:$B," + b + ",'_pivot_data'!$G:$G)");
    sh.getRange(row, 6).setFormula("=SUMIF('_pivot_data'!$B:$B," + b + ",'_pivot_data'!$H:$H)");
    sh.getRange(row, 7).setFormula("=SUMIF('_pivot_data'!$B:$B," + b + ",'_pivot_data'!$I:$I)");
    sh.getRange(row, 8).setFormula("=C" + row + "+D" + row + "+E" + row + "+F" + row + "+G" + row);
    sh.getRange(row, 9).setFormula("=D" + row + "+E" + row + "+F" + row);
    sh.getRange(row, 10).setFormula("=IFERROR(I" + row + "/H" + row + ",0)");
    sh.getRange(row, 11).setFormula("=IFERROR(G" + row + "/H" + row + ",0)");
    sh.getRange(row, 12).setFormula("=SUMIF('_pivot_data'!$B:$B," + b + ",'_pivot_data'!$M:$M)");
  }
  sh.hideSheet();
}

/** 重建单个日期 pivot sheet 的公式模板 */
function setupPivotSheet_(ss, pivot, dateName) {
  pivot.getRange("A:L").clearContent();
  pivot.getRange("X1").clearContent();

  var ymd = String(dateName || todaySheetName_()).split("-");
  var y = Number(ymd[0]);
  var m = Number(ymd[1]);
  var d = Number(ymd[2]);

  pivot.getRange("A1:L1").merge();
  pivot
    .getRange("A1")
    .setFormula(
      '="EWR "&TEXT(DATE(' + y + "," + m + "," + d + '),"mm/dd/yyyy")&" 22:00 最终妥投率"'
    );

  pivot.getRange("A2:L2").setValues([
    [
      "Warehouse",
      "DSP",
      "202",
      "211",
      "231",
      "232",
      "203",
      "包裹总数",
      "退包数",
      "退包率",
      "妥投率",
      "当日未达到95%司机数",
    ],
  ]);

  pivot.getRange("A3").setFormula("=IFERROR(SORT('_pivot_dsp'!A2:L7,11,FALSE),\"\")");

  pivot.getRange("A9").setFormula(
    '=IF(COUNTIFS(\'_pivot_data\'!B:B,"' +
      UNKNOWN_LABEL +
      '",\'_pivot_data\'!D:D,">0")=0,"","EWR")'
  );
  pivot.getRange("B9").setFormula('=IF(A9="","","' + UNKNOWN_LABEL + '")');
  pivot.getRange("C9").setFormula(
    "=IF(B9=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B9)*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$D$2:$D)))"
  );
  pivot.getRange("D9").setFormula(
    "=IF(B9=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B9)*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$E$2:$E)))"
  );
  pivot.getRange("E9").setFormula(
    "=IF(B9=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B9)*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$G$2:$G)))"
  );
  pivot.getRange("F9").setFormula(
    "=IF(B9=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B9)*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$H$2:$H)))"
  );
  pivot.getRange("G9").setFormula(
    "=IF(B9=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B9)*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$I$2:$I)))"
  );
  pivot.getRange("H9").setFormula("=IF(B9=\"\",\"\",C9+D9+E9+F9+G9)");
  pivot.getRange("I9").setFormula("=IF(B9=\"\",\"\",D9+E9+F9)");
  pivot.getRange("J9").setFormula("=IF(B9=\"\",\"\",IFERROR(I9/H9,0))");
  pivot.getRange("K9").setFormula("=IF(B9=\"\",\"\",IFERROR(G9/H9,0))");
  pivot.getRange("L9").setFormula(
    "=IF(B9=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B9)*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$M$2:$M)))"
  );

  pivot.getRange("N2").setFormula(
    "=IFERROR(QUERY('_pivot_data'!A:P,\"select N, A, D where A is not null and D > 0 order by O, D desc, A label N 'Team_name', A 'Driver', D '202_cnt'\",1),\"\")"
  );

  pivot.getRange("Q2").setValue("team name mapping");
  pivot.getRange("R2").setValue("team id input");
  // 新一天清空旧的 R 输入
  pivot.getRange("R3:R" + Q_FORMULA_LAST_ROW).clearContent();
  ensureQMappingFormulas_(pivot);

  applyPivotFormats_(pivot);
  refreshUnknownRowStyle_(pivot);

  // 生成后自动隐藏 F–H（232 / 203 / 包裹总数；数据仍在，只是不显示）
  hideRedMetricColumns_(pivot);
}

/** 隐藏 F–H 整列（红底三列），不删内容 */
function hideRedMetricColumns_(pivot) {
  pivot.hideColumns(6, 3); // F=6，共 3 列：F G H
}

function ensureQMappingFormulas_(pivot) {
  if (!String(pivot.getRange("Q2").getDisplayValue() || "").trim()) {
    pivot.getRange("Q2").setValue("team name mapping");
  }
  if (!String(pivot.getRange("R2").getDisplayValue() || "").trim()) {
    pivot.getRange("R2").setValue("team id input");
  }
  var formula =
    '=IF(N3<>"","",' +
    "IF(R3<>\"\"," +
    "IFERROR(INDEX(FILTER(dsp_mapping!A:A,dsp_mapping!B:B=R3),1),\"\")," +
    "IFERROR(INDEX(FILTER(dsp_mapping!A:A,dsp_mapping!C:C=O3),1),\"\")" +
    "))";
  pivot.getRange("Q3").setFormula(formula);
  pivot
    .getRange("Q3")
    .copyTo(
      pivot.getRange("Q3:Q" + Q_FORMULA_LAST_ROW),
      SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
      false
    );
}

function applyPivotFormats_(pivot) {
  var HEADER_BG = "#4F81BD";
  var HEADER_FG = "#FFFFFF";
  var UNKNOWN_BG = "#FFF2CC";
  var FONT = "Arial";
  var SIZE = 10;

  var widths = {
    A: 100,
    B: 150,
    C: 100,
    D: 100,
    E: 100,
    F: 100,
    G: 100,
    H: 100,
    I: 100,
    J: 100,
    K: 100,
    L: 140,
    M: 100,
    N: 150,
    O: 100,
    P: 100,
    Q: 150,
    R: 100,
    S: 100,
    T: 150,
    U: 150,
    V: 150,
    W: 150,
    X: 150,
    Y: 150,
  };
  Object.keys(widths).forEach(function (col) {
    pivot.setColumnWidth(pivot.getRange(col + "1").getColumn(), widths[col]);
  });

  pivot
    .getRange("A1")
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("bold")
    .setFontColor(HEADER_FG)
    .setBackground(HEADER_BG)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("bottom");

  pivot
    .getRange("A2:L2")
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("bold")
    .setFontColor(HEADER_FG)
    .setBackground(HEADER_BG)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("bottom");

  pivot
    .getRange("A3:L8")
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("normal")
    .setFontColor("#000000")
    .setBackground("#FFFFFF")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("bottom");

  pivot.getRange("J3:K9").setNumberFormat("0.00%");

  pivot
    .getRange("A9:L9")
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("normal")
    .setFontColor("#000000")
    .setBackground(UNKNOWN_BG)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("bottom");

  pivot.getRange("F3:H9").setBackground("#FF0000");

  pivot
    .getRange("N2:R2")
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("bold")
    .setFontColor(HEADER_FG)
    .setBackground(HEADER_BG)
    .setHorizontalAlignment("left")
    .setVerticalAlignment("bottom");

  pivot
    .getRange("N3:R" + Q_FORMULA_LAST_ROW)
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("normal")
    .setFontColor("#000000")
    .setHorizontalAlignment("left")
    .setVerticalAlignment("bottom");

  pivot.setFrozenRows(2);
}
