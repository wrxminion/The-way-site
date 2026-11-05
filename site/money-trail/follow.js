(() => {
 const root = document.getElementById('way-trail');
 const data = JSON.parse(document.getElementById('way-trail-records').textContent);
 const get = selector => root.querySelector(selector);
 const picker = get('#trail-subject');
 const search = get('input[type=search]');
 const first = get('#trail-first');
 const second = get('#trail-second');
 const money = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
 const normalize = value => String(value ?? '').trim().toLowerCase();
 const displayType = value => String(value ?? '').replaceAll('_',' ');
 const supplemental = [
 ['leo','Leonard A. Leo','Person', 'Marble Freedom Trust’s archived Form 990 summaries list Leo as trustee and chairman. Reported compensation was $400,000 for the return ending April 2023 and $600,000 for the return ending April 2024. These are annual disclosures, separate from the itemized ledger.', [
 ['Marble Freedom Trust · Form 990 filings and schedules','https://projects.propublica.org/nonprofits/organizations/850784793']]],
 ['marble','Marble Freedom Trust','Nonprofit · EIN 85-0784793','Form 990 summaries report expenses of $223.6 million for the year ending April 2023 and $200.7 million for the year ending April 2024. Use Schedule I for grant recipients. Annual expenses cover more than grants.', [
 ['Archived IRS returns by fiscal year','https://projects.propublica.org/nonprofits/organizations/850784793'],
 ['IRS · Tax Exempt Organization Search','https://apps.irs.gov/app/eos/']]],
 ['tarp','H.R. 1424 · Emergency Economic Stabilization Act','Federal bill · 110th Congress','The enacted bill and Treasury investment reports are separate records. The Treasury reports are the next source for program investments, repayments, and recipient-level entries.', [
 ['Congress · enacted bill text','https://www.congress.gov/110/bills/hr1424/BILLS-110hr1424enr.pdf'],
 ['Treasury · TARP investment transaction reports','https://home.treasury.gov/data/troubled-assets-relief-program/reports/tarp-investment-program-transaction-reports'],
 ['The Way · 2008 rescue case study','/cases/tarp.html']], [
 [700000000000,'Most the law allowed outstanding at one time (Sec. 115)','H.R. 1424 enacted text','https://www.congress.gov/110/bills/hr1424/BILLS-110hr1424enr.pdf','Oct 3, 2008'],
 [250000000000,'Allowed at first, before the President’s certifications (Sec. 115)','H.R. 1424 enacted text','https://www.congress.gov/110/bills/hr1424/BILLS-110hr1424enr.pdf','Oct 3, 2008']]],
 ['corecivic','CoreCivic, Inc.','Federal contractor','Start with the award record and its transaction history. Compare obligations and deobligations within the same award or fiscal period.', [
 ['USAspending · recipient profile','https://www.usaspending.gov/recipient/b7ab6cd4-f511-cfe7-c92f-b20d45921e9c-P/all'],
 ['USAspending · ICE award 70CDCR26FR0000058','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000058_7012_70CDCR26D00000029_7012/']], [
 [14085950,'Obligated · ICE award 70CDCR26FR0000058, Torrance County Detention Facility','USAspending award record','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000058_7012_70CDCR26D00000029_7012/','Nov 5, 2026'],
 [4572383.65,'Paid out so far on that award','USAspending award record','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000058_7012_70CDCR26D00000029_7012/','Nov 5, 2026'],
 [633050538.74,'All federal award transactions, latest fiscal year','USAspending recipient profile','https://www.usaspending.gov/recipient/b7ab6cd4-f511-cfe7-c92f-b20d45921e9c-P/latest','Nov 5, 2026']]],
 ['geo','The GEO Group, Inc.','Federal contractor','This award is a procurement record. Campaign disclosures require a separate filing and a documented match of the legal entity.', [
 ['USAspending · ICE award 70CDCR26FR0000042','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000042_7012_70CDCR20D00000008_7012/']], [
 [77625819.39,'Obligated · ICE award 70CDCR26FR0000042, Mesa Verde and Golden State','USAspending award record','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000042_7012_70CDCR20D00000008_7012/','Nov 5, 2026'],
 [32881742,'Paid out so far on that award','USAspending award record','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000042_7012_70CDCR20D00000008_7012/','Nov 5, 2026']]],
 ['ice','U.S. Immigration and Customs Enforcement','Federal agency','Start with the individual award records. The amounts above are the two awards in this trail, not ICE’s total spending. The archive has no agency-wide procurement ledger.', [
 ['USAspending · federal award search','https://www.usaspending.gov/search']], [
 [14085950,'Obligated to CoreCivic · award 70CDCR26FR0000058','USAspending award record','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000058_7012_70CDCR26D00000029_7012/','Nov 5, 2026'],
 [77625819.39,'Obligated to The GEO Group · award 70CDCR26FR0000042','USAspending award record','https://www.usaspending.gov/award/CONT_AWD_70CDCR26FR0000042_7012_70CDCR20D00000008_7012/','Nov 5, 2026']]],
 ];
 const subjects = new Map();
 const add = (id, entry) => subjects.set(id, entry);
 for (const [id,name,type,registry,url] of data.entities) add(id,{id,name,type,registry,links:[[registry || 'Registry record',url]],kind:'entity'});
 for (const row of data.tx) {
 for (const [id,name] of [[row[2],row[4]],[row[3],row[5]]]) {
 if (id && !subjects.has(id)) add(id,{id,name,type:'Reported entity',kind:'entity',links:[]});
 }
 }
 for (const [id,name,state,date,url] of data.ballots) add('ballot:'+id,{id,name:id+' · '+name,type:state+' ballot measure',note:'Election '+date+'. Positions and reporting are shown as context. This archive has no itemized transaction directly tagged to this measure.',kind:'ballot',links:[['Official ballot source',url]]});
 // optional 6th item: dollar amounts from the linked public record, as [amount, what it is, source, url, as of]
 for (const [id,name,type,note,links,amounts] of supplemental) add(id,{id,name,type,note,links,amounts:amounts||[],kind:'source'});
 const featured = ['fec:C00559740','ballot:CO-87','leo','marble','tarp','corecivic','geo','ice'];
 const ordered = [...featured.filter(id=>subjects.has(id)), ...[...subjects.keys()].filter(id=>!featured.includes(id)).sort((a,b)=>subjects.get(a).name.localeCompare(subjects.get(b).name))];
 const categories = ['candidate','measure','bill','group','contractor','agency','person'];
 const aliases = {
 bill:{'hr-1424':'tarp','hr1424':'tarp','110-hr1424':'tarp','110-hr-1424':'tarp','tarp':'tarp'},
 group:{'gopac':'fec:C00559740','c00559740':'fec:C00559740','marble-freedom-trust':'marble','85-0784793':'marble'},
 contractor:{'corecivic-inc':'corecivic','the-geo-group':'geo','the-geo-group-inc':'geo'},
 agency:{'immigration-and-customs-enforcement':'ice','us-immigration-and-customs-enforcement':'ice'},
 person:{'leonard-leo':'leo','leonard-a-leo':'leo'}
 };
 function category(key, subject) {
 if (subject.kind === 'ballot') return 'measure';
 if (subject.kind === 'entity') return /candidate_named/.test(subject.type)?'candidate':'group';
 return {tarp:'bill',leo:'person',marble:'group',corecivic:'contractor',geo:'contractor',ice:'agency'}[key];
 }
 function slug(value) {
 return normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 }
 function resolve(type, value) {
 const alias = aliases[type]?.[slug(value)];
 if (alias && subjects.has(alias)) return alias;
 const target = type==='measure' ? normalize(value).replace(/^([a-z]{2})-(?:amendment|proposition|measure)-/,'$1-') : normalize(value);
 const matches = [...subjects].filter(([key,s])=>category(key,s)===type &&
 [key,s.id,s.registry].some(v=>v && normalize(v)===target));
 if (matches.length===1) return matches[0][0];
 const names = [...subjects].filter(([key,s])=>category(key,s)===type && slug(s.name)===slug(value));
 return names.length===1 ? names[0][0] : null;
 }
 const params = new URLSearchParams(location.search);
 const param = categories.find(type=>params.has(type));
 const requested = param ? params.get(param) : '';
 let selected = param ? resolve(param,requested) : featured[0];
 function node(tag, text) {
 const element = document.createElement(tag);
 if (text) element.textContent = text;
 return element;
 }
 function link(label, url) {
 let valid = false;
 const local = /^\/[^/]/.test(url);
 try { valid = local || new URL(url).protocol === 'https:'; } catch {}
 const element = node(valid?'a':'span',label);
 if (valid) Object.assign(element,local?{href:url}:{href:url,target:'_blank',rel:'noopener noreferrer'});
 return element;
 }
 function populate() {
 const query = normalize(search.value);
 picker.replaceChildren();
 for (const key of ordered) {
 const s = subjects.get(key);
 if (key !== selected && !normalize([s.name,s.type,s.registry].join(' ')).includes(query)) continue;
 const option = node('option', s.name + ' · ' + (s.registry || s.type));
 option.value = key;
 picker.append(option);
 }
 picker.value = selected;
 }
 function follow(id) {
 selected = id;
 search.value = '';
 populate();
 render();
 }
 function jump(label,id) {
 if (!subjects.has(id)) return node('span',label);
 const button = node('button',label);
 button.type = 'button';
 button.addEventListener('click',()=>follow(id));
 return button;
 }
 function render() {
 const s = subjects.get(selected);
 if (!s) {
 get('#trail-title').textContent = 'Trail not in this archive';
 get('#trail-note').textContent = 'Requested '+param+': '+requested+'. Choose an available trail above.';
 get('#trail-permalink').textContent = '';
 get('#trail-links').replaceChildren();
 get('#trail-big').hidden = true;
 get('#trail-compare').hidden = get('#trail-context').hidden = true;
 return;
 }
 get('#trail-title').textContent = s.name;
 const type = category(selected,s);
 const value = type==='measure'?s.id.toLowerCase():selected==='tarp'?'110-hr1424':selected==='leo'?'leonard-leo':selected;
 get('#trail-permalink').textContent = 'Link to this trail: michiinstitute.com/money-trail/follow.html?'+type+'='+encodeURIComponent(value);
 get('#trail-note').textContent = s.type + '. ' + (s.note || 'Itemized ledger matches the archive’s entity ID. Name matches and other relationships appear separately below.');
 const links = get('#trail-links');
 links.replaceChildren();
 for (const [label,url] of s.links) {
 const li = node('li');
 li.append(link(label,url));
 links.append(li);
 }
 {
 const li = node('li');
 if (s.kind === 'ballot') li.append(link('See '+s.id.slice(0,2)+' on the Money Trail map','/money-trail/?view=states&state='+s.id.slice(0,2)));
 else if (s.kind === 'entity') li.append(link('See '+s.name+' on the money web','/money-trail/?view=network&hub='+encodeURIComponent(s.name)));
 else li.append(link('Back to the full Money Trail map','/money-trail/'));
 links.prepend(li);
 }
 if (s.kind === 'ballot') {
 const state = s.id.slice(0,2).toLowerCase();
 if (/^[a-z]{2}$/.test(state)) {
 const li = node('li');
 li.append(link(state.toUpperCase()+' election results','/results/?state='+state),
 document.createTextNode(' · '),
 link('District map','/map'+(state==='co'?'':'-'+state)+'/'));
 links.append(li);
 }
 if (s.id==='CO-87') {
 const li = node('li');
 li.append(link('The Way · Colorado Amendment 87','/guide/measures/amendment-87.html'));
 links.append(li);
 }
 }
 if (selected === 'leo' || selected === 'marble') {
 const li = node('li','Related filing trail ');
 li.append(jump(selected === 'leo'?'Marble Freedom Trust':'Leonard A. Leo',selected === 'leo'?'marble':'leo'));
 links.append(li);
 }
 if (selected==='ice' || selected==='geo' || selected==='corecivic') {
 const li = node('li','Related award trail ');
 if (selected==='ice') li.append(jump('CoreCivic','corecivic'),jump('The GEO Group','geo'));
 else li.append(jump('ICE','ice'));
 links.append(li);
 }
 const ledger = get('#trail-ledger');
 ledger.replaceChildren();
 const rows = s.kind === 'entity' ? data.tx.filter(row=>row[2]===s.id || row[3]===s.id) : [];
 get('#trail-compare').hidden = !rows.length;
 // the fact people came for: the money in and out, first and largest
 const big = get('#trail-big');
 big.replaceChildren();
 big.hidden = false;
 if (!rows.length && s.amounts && s.amounts.length) {
 const whole = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
 for (const [value,label,source,url,asOf] of s.amounts) {
 const box = node('div');
 box.append(node('b',whole.format(value)),node('span',label));
 const from = node('p');
 from.append(document.createTextNode('Source: '),link(source,url),document.createTextNode(asOf?' · as of '+asOf:''));
 box.append(from);
 big.append(box);
 }
 } else if (!rows.length) {
 const box = node('div');
 box.className = 'trail-none';
 box.append(node('b','No dollar amount loaded yet'),node('p',s.kind==='source'?'No amount checked against an original filing is loaded for this trail yet. Any figures in the note below come from archived summaries.':s.kind==='ballot'?'No itemized money record in this archive is tied to this measure yet. Related records below are context and are not added up.':'No itemized money record for this trail is in the archive yet. The public sources below have the details.'));
 big.append(box);
 }
 if (rows.length) {
 const sum = index => rows.filter(r=>r[index]===s.id).reduce((t,r)=>t+Number(r[6]),0);
 const whole = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
 for (const [label,value] of [['Received',sum(3)],['Sent',sum(2)]]) {
 const box = node('div');
 box.append(node('b',whole.format(value)),node('span',label));
 big.append(box);
 }
 big.append(node('p','Itemized records in this archive: '+rows.length+'. Years: '+[...new Set(rows.map(r=>(r[1]||'').slice(0,4)).filter(Boolean))].sort().join(', ')+'.'));
 }
 const totals = get('#trail-totals');
 totals.replaceChildren();
 for (const year of [first.value,second.value]) {
 const section = node('div');
 const period = rows.filter(r=>r[1]?.startsWith(year+'-'));
 section.append(node('strong',year));
 if (period.length) {
 const total = index => period.filter(r=>r[index]===s.id).reduce((sum,r)=>sum+Number(r[6]),0);
 section.append(node('span','Received '+money.format(total(3))),node('span','Sent '+money.format(total(2))),node('span',period.length+' records'));
 } else section.append(node('span','No matching rows'));
 totals.append(section);
 }
 for (const row of rows.filter(r=>[first.value,second.value].some(year=>r[1]?.startsWith(year+'-'))).sort((a,b)=>b[1].localeCompare(a[1]))) {
 const li = node('li');
 li.append(node('strong',row[1]+' · '+money.format(row[6])),node('div',displayType(row[8])),
 jump(row[4],row[2]),document.createTextNode(' → '),jump(row[5],row[3]),document.createTextNode(' · '),link('Filing',row[7]));
 if (row[9]) li.append(node('p',row[9]));
 ledger.append(li);
 }
 const observations = get('#trail-observations');
 observations.replaceChildren();
 const positions = data.positions.filter(row=>s.kind==='ballot'?row[0]===s.id:s.kind==='entity'&&normalize(row[1])===normalize(s.name));
 for (const [measure,name,stance,url] of positions) {
 const li = node('li',name+' · '+stance+' · ');
 li.append(jump(measure,'ballot:'+measure),document.createTextNode(' · '),link('Position source',url));
 observations.append(li);
 }
 const includedIds = new Set(rows.map(r=>r[0]));
 const edges = data.edges.filter(row=>!includedIds.has(row[8])&&(s.kind==='ballot'?row[6]===s.id:s.kind==='entity'&&[row[0],row[1]].some(name=>normalize(name)===normalize(s.name))));
 for (const [from,to,date,amount,type,url,,dateKind] of edges) {
 const li = node('li',from+' → '+to+(amount!=null?' · '+money.format(amount):''));
 li.append(node('div',[date,displayType(dateKind),displayType(type)].filter(Boolean).join(' · ')),link('Record source',url));
 observations.append(li);
 }
 const count = positions.length+edges.length;
 get('#trail-context').hidden = !count;
 get('#trail-context-summary').textContent = 'Related records and positions ('+count+', excluded from totals)';
 }
 search.addEventListener('input',populate);
 picker.addEventListener('change',()=>{if(picker.value) follow(picker.value)});
 first.addEventListener('change',render);
 second.addEventListener('change',render);
 populate();
 render();
})();
