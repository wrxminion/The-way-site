// Appends one row to site/development/data/ledger.json and ledger.js.
// Usage: node tools/ledger-append.js <pr-number> <yyyy-mm-dd> <origin> <public-text>
// The text comes only from an opt-in "ledger:" line, never from a PR title.
const fs = require('fs');
const path = require('path');
const [num, date, origin, rawText] = process.argv.slice(2);
if (!/^\d+$/.test(num || '') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !rawText) {
  console.error('usage: node tools/ledger-append.js <pr> <date> <origin> <text>');
  process.exit(2);
}
const text = rawText.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
if (!text || /do[\s-]*not[\s-]*publish/i.test(text)) { console.error('refused: empty or marked do not publish'); process.exit(3); }
const dir = path.join(__dirname, '..', 'site', 'development');
const jsonPath = path.join(dir, 'data', 'ledger.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const tag = 'PR #' + num;
if (data.rows.some((r) => (r.status_as_of_2026_10_25 || '').includes(tag + ';') || (r.origin || '').includes('(' + tag + ')'))) {
  console.log('already in ledger: ' + tag); process.exit(0);
}
const max = Math.max(...data.rows.map((r) => parseInt(String(r.id).slice(1), 10)));
const sentence = /[.!?]$/.test(text) ? text : text + '.';
data.rows.push({
  id: 'D' + String(max + 1).padStart(3, '0'),
  decision_date_or_range: date,
  title: sentence.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '').slice(0, 90),
  origin: (origin || 'Maintainer') + ' (' + tag + ')',
  decision_or_proposal: sentence,
  why: 'Added automatically when the change was merged.',
  status_as_of_2026_10_25: 'Merged in ' + tag + '; live appearance and behavior not yet verified.',
  evidence_and_limits: 'Wording supplied by the author of the change. A person has not yet checked the live page.',
});
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'data', 'ledger.js'), 'window.LEDGER_DATA=' + JSON.stringify(data) + ';\n');
const idx = path.join(dir, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/ledger\.js\?v=[\w.-]+/, 'ledger.js?v=pr' + num));
console.log('added ' + data.rows[data.rows.length - 1].id + ' for ' + tag);
