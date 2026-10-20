/**
 * 総勘定元帳 × りそな銀行 入出金明細PDF 照合スクリプト
 *
 * 実行順:
 *   1) step1_buildAccountMap()  … 「口座対応表」シートを作成（元帳の補助科目 ↔ PDFフォルダ）。内容を確認・修正する
 *   2) step2_ocrPdfs()          … 対象PDFをOCRして「OCR結果」シートに保存（時間切れ時は再実行で続きから）
 *   3) step3_dryRun()           … 書き込まず「照合ログ」シートに結果と件数を出力
 *   4) step4_execute()          … 元帳のAA/AB列に書き込み、色を付ける
 *
 * 事前設定: エディタ左の「サービス」→「Drive API」を追加（識別子 Drive、v2/v3どちらでも可）
 */

const CFG = {
  LEDGER_SS_ID: '1Pia4XW0nYFE-VCr6Rl7U-1axcLJFCHc_48HiG3z4_I0',
  LEDGER_SHEET: '★総勘定元帳',
  FOLDER_LIST_SS_ID: '1MzNXuJ5Xjnp1M4oGGtY0NtArDgfdKJgSQnQQngTstF0',
  FOLDER_LIST_SHEET: 'フォルダ一覧',
  BANK_NAME: 'りそな銀行',
  FIRST_DATA_ROW: 3,
  PERIOD_FROM: '2025-10-01',
  PERIOD_TO: '2025-12-31',
  // 列番号（1始まり）: B=2 取引日, C=3 勘定科目, D=4 補助科目, P=16 借方, Q=17 貸方, AA=27, AB=28
  COL: { DATE: 2, ACCOUNT: 3, SUB: 4, DEBIT: 16, CREDIT: 17, URL: 27, PAGE: 28 },
  ORANGE: '#ff9900',
  BLUE: '#9fc5e8',
  SHEET_MAP: '口座対応表',
  SHEET_OCR: 'OCR結果',
  SHEET_LOG: '照合ログ',
  CELL_LIMIT: 45000,      // 1セルの文字数上限(50000)に余裕を持たせる
  TIME_LIMIT_MS: 5 * 60 * 1000,
  NEAR_LINES: 2,          // 日付行から金額を探す行数（同じ行を含めて 1+NEAR_LINES 行）
  REIWA_YEARS: [6, 7, 8, 9]
};

/* ============================ 純粋関数（解析・照合） ============================ */

function toHalfWidth_(s) {
  return String(s).replace(/[０-９．，／－]/g, function (c) {
    return ({ '．': '.', '，': ',', '／': '/', '－': '-' })[c] || String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
}

function pad2_(n) { return ('0' + n).slice(-2); }

/** 行内の日付を ISO(yyyy-mm-dd) で返す。西暦 yyyy/mm/dd と 和暦 yymmdd（令和）に対応 */
function findDates_(line) {
  const out = [];
  const re1 = /(20\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/g;
  const re2 = /(?<![\d,.])(0[6-9])[-.\/ ]?(0[1-9]|1[0-2])[-.\/ ]?(0[1-9]|[12]\d|3[01])(?![\d,])/g;
  let m;
  while ((m = re1.exec(line))) out.push({ iso: m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]), index: m.index, end: re1.lastIndex });
  while ((m = re2.exec(line))) {
    const y = parseInt(m[1], 10);
    if (CFG.REIWA_YEARS.indexOf(y) < 0) continue;
    out.push({ iso: (2018 + y) + '-' + m[2] + '-' + m[3], index: m.index, end: re2.lastIndex });
  }
  out.sort(function (a, b) { return a.index - b.index; });
  return out;
}

/** 行から金額候補(数値)を抽出。日付部分は除外し、0始まりの番号は金額とみなさない */
function findAmounts_(line, dates) {
  let s = line;
  (dates || []).slice().sort(function (a, b) { return b.index - a.index; }).forEach(function (d) {
    s = s.slice(0, d.index) + ' '.repeat(d.end - d.index) + s.slice(d.end);
  });
  s = s.replace(/(\d{1,3})[.,](\d{3})(?!\d)/g, '$1$2');
  const out = [];
  const re = /(?<!\d)(\d{1,9})(?!\d)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1].length > 1 && m[1].charAt(0) === '0') continue;
    const n = parseInt(m[1], 10);
    if (n > 0) out.push(n);
  }
  return out;
}

/** 取引通番らしき番号（00001 / 002 など 0始まり2桁以上）を探す */
function findSeqNo_(text) {
  const m = /(?<![\d,.])(0{1,4}\d{1,4})(?![\d,.])/.exec(text.replace(/(\d{1,3})[.,](\d{3})(?!\d)/g, '$1$2'));
  return m && m[1].length >= 2 ? m[1] : '';
}

/** 1ページ分のOCRテキストを解析 */
function parsePage_(text) {
  const lines = toHalfWidth_(text).split(/\r?\n/).map(function (l) { return l.replace(/[*＊]/g, ' ').trim(); });
  const dateLines = [];
  lines.forEach(function (l, i) {
    const d = findDates_(l);
    if (d.length) dateLines.push({ i: i, iso: d[0].iso, dates: d });
  });
  const entries = [];
  const pageDates = {};
  const pageAmts = {};
  lines.forEach(function (l, i) {
    const d = findDates_(l);
    findAmounts_(l, d).forEach(function (a) { pageAmts[a] = true; });
  });
  dateLines.forEach(function (dl, k) {
    const next = k + 1 < dateLines.length ? dateLines[k + 1].i : lines.length;
    const end = Math.min(dl.i + CFG.NEAR_LINES, next - 1);
    const win = lines.slice(dl.i, end + 1);
    const amts = {};
    win.forEach(function (l, j) {
      findAmounts_(l, j === 0 ? dl.dates : findDates_(l)).forEach(function (a) { amts[a] = true; });
    });
    entries.push({ row: k + 1, iso: dl.iso, amts: amts, seq: findSeqNo_(win.join(' ')) });
    if (!pageDates[dl.iso]) pageDates[dl.iso] = k + 1;
  });
  return { entries: entries, pageDates: pageDates, pageAmts: pageAmts };
}

/** 台帳1行に対するPDF内の候補を返す。strong=日付と金額が近接 / weak=同一ページに両方ある */
function findCandidates_(pages, iso, amount) {
  const strong = [];
  const weak = [];
  pages.forEach(function (p) {
    let hit = false;
    p.parsed.entries.forEach(function (e) {
      if (e.iso === iso && e.amts[amount]) {
        strong.push({ fileId: p.fileId, fileName: p.fileName, page: p.page, row: e.row, seq: e.seq });
        hit = true;
      }
    });
    if (!hit && p.parsed.pageDates[iso] && p.parsed.pageAmts[amount]) {
      weak.push({ fileId: p.fileId, fileName: p.fileName, page: p.page, row: p.parsed.pageDates[iso], seq: '' });
    }
  });
  return { strong: strong, weak: weak };
}

function fmtCand_(c) {
  return 'page' + c.page + ' row' + c.row + (c.seq ? ' ' + c.seq : '');
}
function urlOf_(c) { return 'https://drive.google.com/file/d/' + c.fileId + '/view'; }

/* ============================ ユーティリティ ============================ */

function ledgerSheet_() {
  return SpreadsheetApp.openById(CFG.LEDGER_SS_ID).getSheetByName(CFG.LEDGER_SHEET);
}
function getOrCreate_(name) {
  const ss = SpreadsheetApp.openById(CFG.LEDGER_SS_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function parseLedgerDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  const m = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(String(v));
  return m ? m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]) : '';
}
function parseAmount_(v) {
  if (typeof v === 'number') return Math.round(v);
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}
function folderIdFromUrl_(u) {
  const m = /folders\/([\w-]+)/.exec(String(u));
  return m ? m[1] : '';
}
function inPeriod_(iso) { return iso >= CFG.PERIOD_FROM && iso <= CFG.PERIOD_TO; }

/* ============================ STEP1: 口座対応表 ============================ */

function step1_buildAccountMap() {
  const list = SpreadsheetApp.openById(CFG.FOLDER_LIST_SS_ID).getSheetByName(CFG.FOLDER_LIST_SHEET).getDataRange().getValues();
  const folders = [];
  list.slice(1).forEach(function (r) {
    if (r[0] === CFG.BANK_NAME && r[2] && !r[3]) folders.push({ name: String(r[1]), id: folderIdFromUrl_(r[2]) });
  });

  const sh = ledgerSheet_();
  const rows = sh.getRange(CFG.FIRST_DATA_ROW, 1, sh.getLastRow() - CFG.FIRST_DATA_ROW + 1, CFG.COL.PAGE).getValues();
  const subs = {};
  rows.forEach(function (r) {
    const iso = parseLedgerDate_(r[CFG.COL.DATE - 1]);
    const acct = String(r[CFG.COL.ACCOUNT - 1]);
    const sub = String(r[CFG.COL.SUB - 1]);
    if (!inPeriod_(iso) || acct.indexOf('預金') < 0 || !sub) return;
    const key = acct + '／' + sub;
    subs[key] = (subs[key] || 0) + 1;
  });

  const out = [['勘定科目／補助科目', '件数', '推定フォルダ名', 'フォルダID（空欄=対象外・要確認）']];
  Object.keys(subs).sort().forEach(function (k) {
    const g = guessFolder_(k, folders);
    out.push([k, subs[k], g ? g.name : '', g ? g.id : '']);
  });
  const ws = getOrCreate_(CFG.SHEET_MAP);
  ws.clear();
  ws.getRange(1, 1, out.length, 4).setValues(out);
  ws.setFrozenRows(1);
  SpreadsheetApp.getUi && toast_('口座対応表を作成しました。りそな以外の行はD列を空欄にし、推定が違う行は修正してください。');
}

/** 補助科目内の「先頭の番号(例:157)」または「口座番号の先頭6桁(例:005805)」でフォルダ名と突き合わせる */
function guessFolder_(key, folders) {
  if (key.indexOf('りそな') < 0) return null;
  const lead = /^[^／]*／\s*(\d{2,3})(?!\d)/.exec(key);
  const longRuns = (key.match(/\d{5,}/g) || []);
  let found = null;
  folders.forEach(function (f) {
    const runs = f.name.match(/\d+/g) || [];
    const byAcct = longRuns.some(function (lr) { return runs.some(function (r) { return r.length >= 6 && r.indexOf(lr) === 0; }); });
    const byLead = lead && runs.indexOf(lead[1]) >= 0;
    if (!found && (byAcct || byLead)) found = f;
  });
  return found;
}

/* ============================ STEP2: OCR ============================ */

function listPdfsRecursive_(folderId, acc) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByType(MimeType.PDF);
  while (files.hasNext()) {
    const f = files.next();
    acc.push({ id: f.getId(), name: f.getName(), updated: f.getLastUpdated().getTime() });
  }
  const subs = folder.getFolders();
  while (subs.hasNext()) listPdfsRecursive_(subs.next().getId(), acc);
  return acc;
}

/** ファイル名に yyyymmdd_yyyymmdd があり、対象期間と重ならない場合は除外 */
function overlapsPeriod_(name) {
  const m = /(\d{8})\D{1,3}(\d{8})/.exec(name);
  if (!m) return true;
  const f = m[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  const t = m[2].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  return !(t < CFG.PERIOD_FROM || f > CFG.PERIOD_TO);
}

function ocrToPages_(file) {
  const blob = file.getBlob();
  let docId;
  if (typeof Drive.Files.create === 'function') {
    docId = Drive.Files.create({ name: 'tmp_ocr_' + file.getName(), mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'ja' }).id;
  } else {
    docId = Drive.Files.insert({ title: 'tmp_ocr_' + file.getName(), mimeType: 'application/vnd.google-apps.document' }, blob, { ocr: true, ocrLanguage: 'ja', convert: true }).id;
  }
  try {
    const body = DocumentApp.openById(docId).getBody();
    const pages = [''];
    for (let i = 0; i < body.getNumChildren(); i++) {
      const el = body.getChild(i);
      const t = el.getType();
      if (t === DocumentApp.ElementType.PARAGRAPH || t === DocumentApp.ElementType.LIST_ITEM) {
        const p = el.asParagraph ? el.asParagraph() : el.asListItem();
        let hasBreak = false;
        for (let j = 0; j < p.getNumChildren(); j++) {
          if (p.getChild(j).getType() === DocumentApp.ElementType.PAGE_BREAK) hasBreak = true;
        }
        pages[pages.length - 1] += p.getText() + '\n';
        if (hasBreak) pages.push('');
      } else if (t === DocumentApp.ElementType.TABLE) {
        const tb = el.asTable();
        for (let r = 0; r < tb.getNumRows(); r++) {
          const cells = [];
          for (let c = 0; c < tb.getRow(r).getNumCells(); c++) cells.push(tb.getRow(r).getCell(c).getText());
          pages[pages.length - 1] += cells.join('  ') + '\n';
        }
      }
    }
    return pages.filter(function (p) { return p.trim().length > 0; });
  } finally {
    DriveApp.getFileById(docId).setTrashed(true);
  }
}

function step2_ocrPdfs() {
  const start = Date.now();
  const map = readAccountMap_();
  const ws = getOrCreate_(CFG.SHEET_OCR);
  if (ws.getLastRow() === 0) ws.appendRow(['fileId', 'fileName', 'folderId', 'page', 'updated', 'text']);
  const done = {};
  ws.getDataRange().getValues().slice(1).forEach(function (r) { done[r[0] + '|' + r[4]] = true; });

  const folderIds = {};
  map.forEach(function (m) { folderIds[m.folderId] = true; });
  const queue = [];
  Object.keys(folderIds).forEach(function (fid) {
    listPdfsRecursive_(fid, []).forEach(function (f) {
      if (overlapsPeriod_(f.name) && !done[f.id + '|' + f.updated]) { f.folderId = fid; queue.push(f); }
    });
  });
  let n = 0;
  for (let i = 0; i < queue.length; i++) {
    if (Date.now() - start > CFG.TIME_LIMIT_MS) break;
    const f = queue[i];
    const pages = ocrToPages_(DriveApp.getFileById(f.id));
    const rows = [];
    pages.forEach(function (txt, pi) { rows.push([f.id, f.name, f.folderId, pi + 1, f.updated, txt.slice(0, CFG.CELL_LIMIT)]); });
    if (rows.length) ws.getRange(ws.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    n++;
  }
  toast_('OCR完了 ' + n + ' / ' + queue.length + ' ファイル' + (n < queue.length ? '（時間切れ。もう一度実行してください）' : '（全て完了）'));
}

function readAccountMap_() {
  const ws = getOrCreate_(CFG.SHEET_MAP);
  return ws.getDataRange().getValues().slice(1)
    .filter(function (r) { return r[3]; })
    .map(function (r) { return { key: String(r[0]), folderId: String(r[3]).trim() }; });
}

/* ============================ STEP3/4: 照合 ============================ */

function step3_dryRun() { runMatch_(true); }
function step4_execute() { runMatch_(false); }

function loadPagesByFolder_() {
  const rows = getOrCreate_(CFG.SHEET_OCR).getDataRange().getValues().slice(1);
  const byFolder = {};
  const seenHash = {};
  const dupFiles = {};
  rows.forEach(function (r) {
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, r[2] + '|' + r[3] + '|' + r[5]));
    // 期間が重なる別ファイルに同一内容のページがある場合は先着のみ採用
    const dupKey = r[2] + '|' + String(r[5]).replace(/\s+/g, '');
    if (seenHash[dupKey] && seenHash[dupKey] !== r[0]) { dupFiles[r[1]] = true; return; }
    seenHash[dupKey] = r[0];
    (byFolder[r[2]] = byFolder[r[2]] || []).push({ fileId: r[0], fileName: r[1], page: r[3], parsed: parsePage_(String(r[5])) });
  });
  return { byFolder: byFolder, dupFiles: Object.keys(dupFiles) };
}

function runMatch_(dryRun) {
  const map = readAccountMap_();
  const folderOf = {};
  map.forEach(function (m) { folderOf[m.key] = m.folderId; });
  const loaded = loadPagesByFolder_();

  const sh = ledgerSheet_();
  const n = sh.getLastRow() - CFG.FIRST_DATA_ROW + 1;
  const data = sh.getRange(CFG.FIRST_DATA_ROW, 1, n, CFG.COL.PAGE).getValues();

  // 同一口座・同日・同額の元帳行数（元帳側の重複検出用）
  const ledgerCount = {};
  const targets = [];
  data.forEach(function (r, idx) {
    const iso = parseLedgerDate_(r[CFG.COL.DATE - 1]);
    const key = r[CFG.COL.ACCOUNT - 1] + '／' + r[CFG.COL.SUB - 1];
    if (!inPeriod_(iso) || !folderOf[key]) return;
    const debit = parseAmount_(r[CFG.COL.DEBIT - 1]);
    const credit = parseAmount_(r[CFG.COL.CREDIT - 1]);
    const amount = credit > 0 ? credit : debit;
    targets.push({ row: CFG.FIRST_DATA_ROW + idx, iso: iso, amount: amount, folder: folderOf[key], filled: String(r[CFG.COL.URL - 1]).trim() !== '', kind: credit > 0 ? '出金' : '入金' });
    const ck = folderOf[key] + '|' + iso + '|' + amount;
    ledgerCount[ck] = (ledgerCount[ck] || 0) + 1;
  });

  const stat = { single: 0, ambiguous: 0, blue: 0, skipped: 0, none: 0, noAmount: 0 };
  const log = [['元帳行', '取引日', '区分', '金額', '結果', 'AA(URL)', 'AB(ページ・番号)']];
  const writes = [];

  targets.forEach(function (t) {
    if (t.filled) { stat.skipped++; return; }
    if (!t.amount) { stat.noAmount++; return; }
    const c = findCandidates_(loaded.byFolder[t.folder] || [], t.iso, t.amount);
    let kind, cands;
    const sameLedger = ledgerCount[t.folder + '|' + t.iso + '|' + t.amount];
    if (c.strong.length === 1 && sameLedger <= 1) { kind = 'single'; cands = c.strong; }
    else if (c.strong.length >= 1) { kind = 'ambiguous'; cands = c.strong; }
    else if (c.weak.length >= 1) { kind = 'blue'; cands = c.weak; }
    else { stat.none++; log.push([t.row, t.iso, t.kind, t.amount, '一致なし', '', '']); return; }
    stat[kind]++;
    const url = cands.map(urlOf_).join('\n');
    const pg = cands.map(fmtCand_).join('\n');
    log.push([t.row, t.iso, t.kind, t.amount, { single: '単独一致', ambiguous: 'あいまい(オレンジ)', blue: '要確認(青)' }[kind], url, pg]);
    writes.push({ row: t.row, url: url, pg: pg, color: kind === 'ambiguous' ? CFG.ORANGE : kind === 'blue' ? CFG.BLUE : null });
  });

  const summary = [
    ['単独一致', stat.single], ['あいまい一致(オレンジ)', stat.ambiguous], ['要確認(青)', stat.blue],
    ['スキップ(AA記入済)', stat.skipped], ['一致なし', stat.none], ['金額0で対象外', stat.noAmount],
    ['重複で除外したPDF', loaded.dupFiles.join(', ')], ['モード', dryRun ? 'ドライラン（書き込みなし）' : '本番（書き込み済み）']
  ];
  const lg = getOrCreate_(CFG.SHEET_LOG);
  lg.clear();
  lg.getRange(1, 1, summary.length, 2).setValues(summary);
  lg.getRange(summary.length + 2, 1, log.length, 7).setValues(log);

  if (!dryRun) {
    writes.forEach(function (w) {
      const rg = sh.getRange(w.row, CFG.COL.URL, 1, 2);
      rg.setValues([[w.url, w.pg]]);
      if (w.color) rg.setBackground(w.color);
    });
  }
  toast_(summary.slice(0, 6).map(function (s) { return s[0] + ': ' + s[1]; }).join(' / '));
}

function toast_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.openById(CFG.LEDGER_SS_ID).toast(msg, 'りそな照合', 30); } catch (e) { /* noop */ }
}

if (typeof module !== 'undefined') {
  module.exports = { parsePage_: parsePage_, findDates_: findDates_, findAmounts_: findAmounts_, findCandidates_: findCandidates_, fmtCand_: fmtCand_, guessFolder_: guessFolder_, overlapsPeriod_: overlapsPeriod_ };
}
