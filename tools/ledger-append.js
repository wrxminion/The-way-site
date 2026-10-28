// Ledger row tools.
// CLI (adds a numbered D-row to site/development/data/ledger.json and ledger.js):
//   node tools/ledger-append.js <pr-number> <yyyy-mm-dd> <origin> <public-text>
//   node tools/ledger-append.js --json '{"pr":1,"date":"2026-10-28","origin":"Maintainer","text":"..."}'
// Module: buildRow() makes a row object; the live workflow (tools/ledger-live.js) uses it.
// The text comes only from an opt-in "ledger:" line, never from a PR title.
const fs = require('fs');
const path = require('path');

function cleanText(rawText) {
  return String(rawText || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function prTag(r) {
  const m = String((r && r.origin) || '').match(/PR #\d+/);
  return m ? m[0] : null;
}

function buildRow(id, num, date, origin, text) {
  const sentence = /[.!?]$/.test(text) ? text : text + '.';
  const tag = 'PR #' + num;
  return {
    id,
    decision_date_or_range: date,
    title: sentence.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '').slice(0, 90),
    origin: (origin || 'Maintainer') + ' (' + tag + ')',
    decision_or_proposal: sentence,
    why: 'Added automatically when the change was merged.',
    status_as_of_2026_10_25: 'Merged in ' + tag + '; live appearance and behavior not yet verified.',
    evidence_and_limits: 'Wording supplied by the author of the change. A person has not yet checked the live page.',
  };
}

function parseArgs(argv) {
  let [num, date, origin, rawText] = argv;
  if (num === '--json') {
    const j = JSON.parse(date || '{}');
    [num, date, origin, rawText] = [String(j.pr), j.date, j.origin, j.text];
  }
  if (!/^\d+$/.test(num || '') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !rawText) {
    console.error('usage: node tools/ledger-append.js <pr> <date> <origin> <text>');
    process.exit(2);
  }
  const text = cleanText(rawText);
  if (!text || /do[\s-]*not[\s-]*publish/i.test(text)) { console.error('refused: empty or marked do not publish'); process.exit(3); }
  return { num, date, origin, text };
}

module.exports = { buildRow, cleanText, prTag, parseArgs };

if (require.main === module) {
  const { num, date, origin, text } = parseArgs(process.argv.slice(2));
  const dir = path.join(__dirname, '..', 'site', 'development');
  const jsonPath = path.join(dir, 'data', 'ledger.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const tag = 'PR #' + num;
  if (data.rows.some((r) => (r.status_as_of_2026_10_25 || '').includes(tag + ';') || prTag(r) === tag)) {
    console.log('already in ledger: ' + tag); process.exit(0);
  }
  const max = Math.max(...data.rows.map((r) => parseInt(String(r.id).slice(1), 10) || 0));
  data.rows.push(buildRow('D' + String(max + 1).padStart(3, '0'), num, date, origin, text));
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'data', 'ledger.js'), 'window.LEDGER_DATA=' + JSON.stringify(data) + ';\n');
  const idx = path.join(dir, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/ledger\.js\?v=[\w.-]+/, 'ledger.js?v=pr' + num));
  console.log('added ' + data.rows[data.rows.length - 1].id + ' for ' + tag);
}
