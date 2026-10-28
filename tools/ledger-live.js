// Adds one row to the live-rows file kept on the ledger-data branch (not on main).
// Usage: node tools/ledger-live.js <live-rows.json> <pr-number> <yyyy-mm-dd> <origin> <public-text>
// Rows get the id "PR<number>" so two merges can never collide. The ledger page
// shows these rows on top of site/development/data/ledger.json.
const fs = require('fs');
const path = require('path');
const { buildRow, prTag, parseArgs } = require('./ledger-append.js');
const file = process.argv[2];
const { num, date, origin, text } = parseArgs(process.argv.slice(3));
const live = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { rows: [] };
live.rows = live.rows || [];
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'development', 'data', 'ledger.json'), 'utf8'));
const tag = 'PR #' + num;
if ([...base.rows, ...live.rows].some((r) => prTag(r) === tag)) { console.log('already in ledger: ' + tag); process.exit(0); }
live.rows.push(buildRow('PR' + num, num, date, origin, text));
fs.writeFileSync(file, JSON.stringify(live, null, 2) + '\n');
console.log('added PR' + num + ' to live rows');
