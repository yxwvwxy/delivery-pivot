/**
 * 转单草稿纸 — DSP Tools
 *
 * 日常：
 * 1. 更新 delivery_monitoring
 * 2. 「生成今日妥投」→ 先冻结往日日期 tab，再生成/刷新当天 sheet
 * 3. 未知司机填 R →「Update DSP Mapping」（追加 dsp_mapping，并把当日 A–L 冻成数值）
 * 4. 「生成群话术」→ T:Z（7 个 DSP）
 *
 * 历史：生成新一天时会先把往日 tab 冻成数值，不再引用 _pivot_data。
 * dsp_mapping 只追加、永不 clear——可手动改，生成今日妥投不会抹掉手工行。
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

/** 主表汇总行数 / 群话术列数 = MASTER_DSPS.length；未知行在其后一行 */
function masterDspCount_() {
  return MASTER_DSPS.length;
}
function unknownRow_() {
  // DSP 占 A3 起共 N 行 → 末行 = 2+N；未知在下一行 = 3+N
  return 3 + masterDspCount_();
}
function dspHelperLastRow_() {
  return 1 + masterDspCount_(); // _pivot_dsp 表头 + N 行
}

var MASTER_DSPS = [
  "Final Mile",
  "Gawen Group",
  "LITTLESNAILS",
  "LYL EXPRESS INC",
  "shunda express service",
  "WUKONG",
  "Yuanyuan Pan",
];

/** 种子映射：生成今日妥投时只追加缺失的 Driver，不删不改已有行 */
var SEED_MAPPINGS = [
  ["LYL EXPRESS INC", "1577", "5280544"],
  ["LYL EXPRESS INC", "1577", "5280546"],
  ["LYL EXPRESS INC", "1577", "5280770"],
  ["LYL EXPRESS INC", "1577", "5280893"],
  ["LYL EXPRESS INC", "1577", "5280903"],
  ["LYL EXPRESS INC", "1577", "5281117"],
  ["LYL EXPRESS INC", "1577", "5281909"],
  ["LYL EXPRESS INC", "1577", "5281915"],
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
/**
 * 只向 dsp_mapping 追加缺失的种子行（按 Driver ID 去重）。
 * 绝不 clear / 覆盖已有内容——手工改的 mapping 会保留。
 */
function ensureSeedMappings_(mappingSheet) {
  if (!mappingSheet) return 0;

  // 确保表头存在
  if (mappingSheet.getLastRow() < 1) {
    mappingSheet.getRange(1, 1, 1, 3).setValues([["DSP Name", "DSP Team ID", "Driver ID"]]);
  }

  var existingDrivers = new Set();
  var lastRow = mappingSheet.getLastRow();
  if (lastRow >= 2) {
    mappingSheet
      .getRange("C2:C" + lastRow)
      .getDisplayValues()
      .flat()
      .forEach(function (id) {
        var s = String(id == null ? "" : id).trim();
        if (s) existingDrivers.add(s);
      });
  }

  var rowsToAdd = [];
  SEED_MAPPINGS.forEach(function (row) {
    var driverId = String(row[2]).trim();
    if (!driverId || existingDrivers.has(driverId)) return;
    rowsToAdd.push([row[0], row[1], driverId]);
    existingDrivers.add(driverId);
  });

  if (rowsToAdd.length === 0) return 0;
  mappingSheet
    .getRange(mappingSheet.getLastRow() + 1, 1, rowsToAdd.length, 3)
    .setValues(rowsToAdd);
  return rowsToAdd.length;
}

function generateTodayDelivery() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mappingSheet = getSheetByNames_(ss, SHEETS.mapping);
  if (!getSheetByNames_(ss, SHEETS.monitoring) || !mappingSheet) {
    SpreadsheetApp.getUi().alert("缺少 delivery_monitoring 或 dsp_mapping。");
    return;
  }

  var today = todaySheetName_();
  // 先冻往日（含昨天），再改 helper / mapping，避免今日数据写进历史 tab
  freezeOtherDateSheets_(ss, today);
  var repaired = repairPoisonedUnknownRows_(ss, today);

  // 追加种子映射（含 LYL），不删除任何手工行
  ensureSeedMappings_(mappingSheet);

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

  var extra = repaired.length
    ? "\n已清除往日误写入的未知行：" + repaired.join("、")
    : "";
  SpreadsheetApp.getUi().alert(
    "已生成今日妥投：" +
      today +
      "\n\n往日日期 tab 已先冻结为数值。" +
      extra +
      "\n请在 R 列补未知映射后点 Update DSP Mapping。"
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

/**
 * 往日 tab 若在「次日 monitoring 已贴上、A–L 仍是公式」时被冻结，
 * 未知行会变成次日的未知。N–P 里空 Team 且已填 Q/R 的，清掉误写入的未知行。
 */
function repairPoisonedUnknownRows_(ss, todayName) {
  var unk = unknownRow_();
  var repaired = [];

  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (!isDateSheetName_(name) || name === todayName) return;
    if (sh.getRange("A3").getFormula()) return;

    var bUnk = String(sh.getRange("B" + unk).getDisplayValue() || "").trim();
    if (normalizeDspKey(bUnk) !== normalizeDspKey(UNKNOWN_LABEL)) return;

    var lastRow = Math.max(sh.getLastRow(), 3);
    var npq = sh.getRange("N3:R" + lastRow).getDisplayValues();
    var unmapped = 0;
    npq.forEach(function (row) {
      var team = String(row[0] == null ? "" : row[0]).trim();
      var driver = String(row[1] == null ? "" : row[1]).trim();
      var q = String(row[3] == null ? "" : row[3]).trim();
      var r = String(row[4] == null ? "" : row[4]).trim();
      if (!driver) return;
      if (!team && !q && !r) unmapped++;
    });

    if (unmapped > 0) return;

    sh.getRange("A" + unk + ":L" + unk).clearContent();
    refreshUnknownRowStyle_(sh);
    repaired.push(name);
  });

  return repaired;
}

function freezePivotSheetToValues_(pivot) {
  freezeDetailColumnsNP_(pivot);
  freezeSummaryAL_(pivot);
}

/** 将 A–L（含未知行）从公式冻成当前显示值 */
function freezeSummaryAL_(pivot) {
  var a3f = pivot.getRange("A3").getFormula();
  var unk = unknownRow_();
  var unkF = pivot.getRange("A" + unk).getFormula();
  if (!a3f && !unkF) return false;

  SpreadsheetApp.flush();
  var al = pivot.getRange("A1:L" + unk).getDisplayValues();

  pivot.getRange("A:L").clearContent();
  pivot.getRange("A1:L1").merge();
  pivot.getRange("A1:L" + unk).setValues(al);

  applyPivotFormats_(pivot);
  refreshUnknownRowStyle_(pivot);
  return true;
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

  // 写入 mapping 前先把 N–P 冻成数值，避免 QUERY 因新映射重排/改写明细
  freezeDetailColumnsNP_(pivot);

  if (rowsToAdd.length > 0) {
    mappingSheet
      .getRange(mappingSheet.getLastRow() + 1, 1, rowsToAdd.length, 3)
      .setValues(rowsToAdd);
  }

  SpreadsheetApp.flush();
  // mapping 生效后未知行会消失；立刻冻 A–L，否则次日改 monitoring 会把新的未知写进这张往日表
  freezeSummaryAL_(pivot);
  refreshUnknownRowStyle_(pivot);

  if (rowsToAdd.length === 0) {
    SpreadsheetApp.getUi().alert(
      "没有新 mapping。\n已把「" +
        pivot.getName() +
        "」的 A–L 冻成数值，次日改 monitoring 不会再改这张表的未知行。"
    );
    return;
  }

  var preview = rowsToAdd
    .map(function (r) {
      return r[2] + " → " + r[0] + " (" + r[1] + ")";
    })
    .join("\n");
  SpreadsheetApp.getUi().alert(
    rowsToAdd.length +
      " new driver mappings added:\n" +
      preview +
      "\n\n已写入 dsp_mapping，N–R 顺序未改。\nA–L 已冻成数值（未知行按当前 mapping 存档）。"
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
  var r = unknownRow_();
  var a = pivot.getRange("A" + r).getDisplayValue();
  if (a) {
    pivot.getRange("A" + r + ":L" + r).setBackground("#FFF2CC");
    pivot.getRange("F" + r + ":H" + r).setBackground("#FF0000");
  } else {
    pivot.getRange("A" + r + ":E" + r).setBackground(null);
    pivot.getRange("I" + r + ":L" + r).setBackground(null);
    pivot.getRange("F" + r + ":H" + r).setBackground(null);
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

/** 生成群话术 → 写到当前工作 pivot 的 T 起共 N 列（N = MASTER_DSPS.length） */
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

  var masterDsps = getMasterDspList(ss);
  var n = masterDsps.length;
  var endCol = SUMMARY_START_COL + n - 1; // T 起共 n 列

  sheet.getRange(1, SUMMARY_START_COL, sheet.getMaxRows(), endCol).breakApart();
  sheet.getRange(1, SUMMARY_START_COL, sheet.getMaxRows(), endCol).clearContent();

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

  var EMPTY_MESSAGE = "请提醒司机及时将退件返仓";

  masterDsps.forEach(function (dspName, index) {
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

  for (var c = SUMMARY_START_COL; c <= endCol; c++) {
    sheet.setColumnWidth(c, 150);
  }

  freezePivotSheetToValues_(sheet);

  SpreadsheetApp.getUi().alert(
    "群话术已写入「" + sheet.getName() + "」列 " +
      columnToLetter_(SUMMARY_START_COL) +
      ":" +
      columnToLetter_(endCol) +
      "（" +
      n +
      " 个 DSP）\nA–L 已冻成数值，次日不会再改这张表的未知行。"
  );
}

function columnToLetter_(col) {
  var s = "";
  var n = col;
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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

  var dsps = getMasterDspList(ss).slice(0, masterDspCount_());
  while (dsps.length < masterDspCount_()) dsps.push("");

  for (var i = 0; i < dsps.length; i++) {
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

  pivot.getRange("A3").setFormula(
    "=IFERROR(SORT('_pivot_dsp'!A2:L" + dspHelperLastRow_() + ",11,FALSE),\"\")"
  );

  var unk = unknownRow_();
  pivot.getRange("A" + unk).setFormula(
    '=IF(COUNTIFS(\'_pivot_data\'!B:B,"' +
      UNKNOWN_LABEL +
      '",\'_pivot_data\'!D:D,">0")=0,"","EWR")'
  );
  pivot.getRange("B" + unk).setFormula('=IF(A' + unk + '="","","' + UNKNOWN_LABEL + '")');
  pivot.getRange("C" + unk).setFormula(
    "=IF(B" +
      unk +
      "=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B" +
      unk +
      ")*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$D$2:$D)))"
  );
  pivot.getRange("D" + unk).setFormula(
    "=IF(B" +
      unk +
      "=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B" +
      unk +
      ")*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$E$2:$E)))"
  );
  pivot.getRange("E" + unk).setFormula(
    "=IF(B" +
      unk +
      "=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B" +
      unk +
      ")*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$G$2:$G)))"
  );
  pivot.getRange("F" + unk).setFormula(
    "=IF(B" +
      unk +
      "=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B" +
      unk +
      ")*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$H$2:$H)))"
  );
  pivot.getRange("G" + unk).setFormula(
    "=IF(B" +
      unk +
      "=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B" +
      unk +
      ")*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$I$2:$I)))"
  );
  pivot.getRange("H" + unk).setFormula("=IF(B" + unk + "=\"\",\"\",C" + unk + "+D" + unk + "+E" + unk + "+F" + unk + "+G" + unk + ")");
  pivot.getRange("I" + unk).setFormula("=IF(B" + unk + "=\"\",\"\",D" + unk + "+E" + unk + "+F" + unk + ")");
  pivot.getRange("J" + unk).setFormula("=IF(B" + unk + "=\"\",\"\",IFERROR(I" + unk + "/H" + unk + ",0))");
  pivot.getRange("K" + unk).setFormula("=IF(B" + unk + "=\"\",\"\",IFERROR(G" + unk + "/H" + unk + ",0))");
  pivot.getRange("L" + unk).setFormula(
    "=IF(B" +
      unk +
      "=\"\",\"\",SUMPRODUCT(('_pivot_data'!$B$2:$B=$B" +
      unk +
      ")*('_pivot_data'!$D$2:$D>0)*('_pivot_data'!$M$2:$M)))"
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
  var unk = unknownRow_();
  var dspLast = unk - 1; // A3:L{dspLast}

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
    Z: 150,
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
    .getRange("A3:L" + dspLast)
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("normal")
    .setFontColor("#000000")
    .setBackground("#FFFFFF")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("bottom");

  pivot.getRange("J3:K" + unk).setNumberFormat("0.00%");

  pivot
    .getRange("A" + unk + ":L" + unk)
    .setFontFamily(FONT)
    .setFontSize(SIZE)
    .setFontWeight("normal")
    .setFontColor("#000000")
    .setBackground(UNKNOWN_BG)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("bottom");

  pivot.getRange("F3:H" + unk).setBackground("#FF0000");

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
