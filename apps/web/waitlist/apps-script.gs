/**
 * Worn waitlist: the website's early-access form posts here, and each sign-up becomes a row in the
 * "Waitlist" tab of the Sheet this script is bound to. Set-up steps are in README.md next to this file.
 */
const SHEET_NAME = 'Waitlist';
const LISTS = ['play', 'closet'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** No real address needs these, and they are what a formula is made of (=IMPORTDATA("…")&"@a.bc"). */
const FORMULA_START = /^[=+\-@\t\r]/;
const FORMULA_CHARS = /["'()&;<>`\\]/;

function doPost(e) {
  const p = (e && e.parameter) || {};
  // The form's hidden "website" field is only ever filled in by bots: answer as if it worked.
  if (p.website) return json({ ok: true });

  const email = String(p.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254 || FORMULA_START.test(email) || FORMULA_CHARS.test(email)) {
    return json({ ok: false, error: 'invalid email' });
  }
  const list = LISTS.indexOf(p.list) >= 0 ? p.list : 'play';

  // One writer at a time, so two quick submits can't both pass the duplicate check.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = waitlistSheet();
    const last = sheet.getLastRow();
    const existing = last > 1 ? sheet.getRange(2, 2, last - 1, 2).getValues() : [];
    if (existing.some((row) => row[0] === cell(email) && row[1] === list)) return json({ ok: true, duplicate: true });
    // Every visitor-supplied value goes through cell(), the email too.
    sheet.appendRow([new Date(), cell(email), list, cell(p.page), cell(p.referrer)]);
    return json({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

/** Opening the web app URL in a browser shows this, which is a quick way to check the deployment. */
function doGet() {
  return json({ ok: true, service: 'worn-waitlist' });
}

function waitlistSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(['Signed up', 'Email', 'List', 'Page', 'Referrer']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Free text from the visitor, kept short and never read by Sheets as a formula. */
function cell(value) {
  const text = String(value || '').slice(0, 300);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
