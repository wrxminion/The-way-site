'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const escapeHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=v=>typeof v==='number'&&isFinite(v)?v:Number(v)||0;
const money=v=>v==null||v===''?'Amount unknown':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(num(v));
const shortMoney=v=>{let n=num(v);return Math.abs(n)>=1e6?'$'+(n/1e6).toLocaleString('en-US',{maximumFractionDigits:2})+'m':Math.abs(n)>=1000?'$'+(n/1e3).toLocaleString('en-US',{maximumFractionDigits:1})+'k':money(n)};
const dateText=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric'}):s||'Unknown date';
const mon=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'}):'Undated';
const timeDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?String(parseInt(s.slice(8,10),10)):'—';
const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const safeUrl=url=>/^https:\/\/[^\s<>"']+$/i.test(url||'')?url:'';
const stName={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const byState={};RESEARCH.ballots.forEach(b=>(byState[b.state]??=[]).push(b));
const positionsByMeasure={};RESEARCH.positions.forEach(p=>(positionsByMeasure[p.measure_id]??=[]).push(p));
const entityById={};RESEARCH.entities.forEach(e=>entityById[e.entity_id]=e);
// Ballot measures by ID (e.g. CO-NN), their plain names, and The Way's own guide pages where they exist.
const ballotById={};RESEARCH.ballots.forEach(b=>ballotById[b.measure_id]=b);
const measureWord={CA:'Proposition',MA:'Question',OK:'State Question',MI:'Proposal',AR:'Issue',OH:'Issue'};
function measureName(b){const n=String(b.measure_number||'');const w=b.state==='CO'?(/^\d{1,2}$/.test(n)?'Amendment':'Proposition'):(measureWord[b.state]||'Measure');return `${stName[b.state]||b.state} ${w} ${n}`}
const coGuide={'CO-NN':[['The Way · Proposition NN guide','/guide/measures/proposition-nn.html'],['The Way · SB26-135, the bill that sent NN to voters','/guide/bills/sb26-135.html']]};
['81','82','83','84','85','86','87'].forEach(n=>coGuide['CO-'+n]=[['The Way · Amendment '+n+' guide','/guide/measures/amendment-'+n+'.html']]);
['132','133','134','135','136','137'].forEach(n=>coGuide['CO-'+n]=[['The Way · Proposition '+n+' guide','/guide/measures/proposition-'+n+'.html']]);
function hubLabel(name){const b=ballotById[name];return b?measureName(b)+': '+b.short_title:name}
// Passed or Failed for each measure, from the live results files. Same rule as /results/outcome.js: only an AP call,
// an official call or state certification counts. A state page that only shows who is ahead is not a call.
const measureOutcome={},measureGuide={};
function voteSide(x){const s=String((x&&(x.id||''))+' '+(x&&(x.name||''))).toLowerCase().trim();return /^(yes|for|approve)\b/.test(s)?'yes':/^(no|against|reject)\b/.test(s)?'no':null}
function readOutcome(c,file){let total=0,yes=null,no=null;(c.choices||[]).forEach(x=>{total+=x.votes||0;const s=voteSide(x);if(s==='yes'&&!yes)yes=x;if(s==='no'&&!no)no=x});
 const cl=c.called,certified=cl&&(cl.kind==='certified'||(file&&file.certified===true&&cl.kind!=='ap'&&cl.kind!=='state_leader'));let winner=null;
 if(cl&&cl.winner&&cl.kind!=='state_leader')(c.choices||[]).forEach(x=>{if(x.id===cl.winner)winner=x});const ws=winner&&voteSide(winner);
 const pct=x=>total&&x?Math.round(1000*(x.votes||0)/total)/10:null;const o={yesPct:pct(yes),noPct:pct(no),total};
 if(ws==='yes'||ws==='no'){o.status=ws==='yes'?'passed':'failed';o.who=certified?'Certified by the state':cl.kind==='ap'?'What AP is calling (not certified)':'Called by '+(cl.by||'the official source')+' (not certified)';}
 else{o.status='open';o.who=total?'Not yet called. Neither AP nor the state has called it.':'No vote count yet.';}
 return o}
function outcomeBox(mid){const o=measureOutcome[mid];if(!o)return `<div class="mt-outcome open"><b>Result not loaded</b><span>No November 3, 2026 result for this measure is in our results files.</span></div>`;
 const word=o.status==='passed'?'✓ PASSED':o.status==='failed'?'✗ FAILED':'… NOT YET CALLED';
 const means=o.status==='passed'?'You are following the money around a measure that passed.':o.status==='failed'?'You are following the money around a measure that failed.':'';
 const votes=o.yesPct!=null&&o.noPct!=null?`<span>YES ${o.yesPct}% · NO ${o.noPct}%</span>`:'';
 return `<div class="mt-outcome ${o.status}"><b>${word}</b><span>${escapeHtml(o.who)}</span>${votes}${means?`<p>${means}</p>`:''}</div>`}
// Follow the money for a measure (Nov 2026): each committee with a recorded position, and the money recorded into it.
// Itemized filings are added up. Reported figures are listed one by one and never added, because they can overlap.
function ftmBlock(e){const ps=positionsByMeasure[e.measure_id]||[];const up=s=>String(s||'').trim().toUpperCase();
 const trail=`<svg class="mt-ftm-art" viewBox="0 0 120 16" aria-hidden="true"><path d="M4 8 C24 2 36 14 56 8 S92 2 116 8" fill="none" stroke="#a4ffe2" stroke-width="2" stroke-dasharray="4 5"/><circle cx="4" cy="8" r="3" fill="#a4ffe2"/><circle cx="56" cy="8" r="3" fill="#a4ffe2"/><circle cx="116" cy="8" r="3" fill="#a4ffe2"/></svg>`;
 let h=`<section class="mt-ftm" aria-label="Follow the money"><h3>${trail}<span>Follow the money</span></h3>`;
 if(!ps.length)return h+`<p class="mt-ftm-none">No committee for or against this measure is in our records yet, so no dollar amount is loaded.</p></section>`;
 h+=`<p class="mt-ftm-lead">Committees on record for or against this measure, and the money recorded going into each one. A committee can work on more than one measure, so this is not all spent on this one.</p><ul class="mt-ftm-list">`;
 const seen=new Set();
 for(const p of ps){const n=up(p.entity_name);if(seen.has(n))continue;seen.add(n);
  const stance=/support|yes|favor/i.test(p.stance||'')?'Supports':/oppose|no|against/i.test(p.stance||'')?'Opposes':'Position';
  const tx=RESEARCH.transactions.filter(t=>up(t.recipient_name)===n);const sum=tx.reduce((a,t)=>a+num(t.amount_usd),0);
  const rep=[...RESEARCH.reported_observations.filter(r=>up(r.recipient_name)===n&&num(r.amount_usd)>0)].sort((a,b)=>num(b.amount_usd)-num(a.amount_usd));
  let money='';
  if(tx.length)money+=`<b class="mt-ftm-amt">${money_(sum)}</b><span>received in ${tx.length} itemized filing${tx.length>1?'s':''}</span>`;
  if(rep.length){money+=`<ul class="mt-ftm-rep">`+rep.slice(0,4).map(r=>`<li><b>${money_(r.amount_usd)}</b> from ${escapeHtml(r.source_name)}${safeUrl(r.source_url)?` <a href="${escapeHtml(safeUrl(r.source_url))}" target="_blank" rel="noopener noreferrer">report ↗</a>`:''}</li>`).join('')+`</ul>`+(tx.length?`<span class="mt-ftm-note">Reported figures can repeat the filings above and are not added.</span>`:`<span class="mt-ftm-note">Reported on state disclosure reports. Listed one by one, not added, because they can overlap.</span>`);}
  if(!money)money=`<span class="mt-ftm-none">No dollar amount loaded yet.</span>`;
  h+=`<li><div class="mt-ftm-who"><a href="/money-trail/?view=network&amp;hub=${encodeURIComponent(n)}">${escapeHtml(p.entity_name)}</a><em class="${stance==='Supports'?'yes':stance==='Opposes'?'no':''}">${stance}</em></div>${money}</li>`;}
 return h+`</ul></section>`}
function money_(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(num(v))}
function outcomeColor(mid){const o=measureOutcome[mid];return o&&o.status==='passed'?'#3ddc84':o&&o.status==='failed'?'#ff6b6b':null}
fetch('measure-results.json?t='+Math.floor(Date.now()/60000),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(map=>{if(!map||!map.measures)return;
 const files={};Object.entries(map.measures).forEach(([mid,e])=>{if(e.guide)measureGuide[mid]=e.guide;if(/^[a-z0-9-]+\.json$/.test(e.file||''))(files[e.file]=files[e.file]||[]).push([mid,e.contest])});
 return Promise.all(Object.entries(files).map(([f,list])=>fetch('/results/data/'+f+'?t='+Math.floor(Date.now()/60000),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null).then(d=>{if(!d)return;
  list.forEach(([mid,id])=>{const c=(d.contests||[]).find(k=>k.id===id);if(c)measureOutcome[mid]=readOutcome(c,d)})})))}).catch(()=>null).then(()=>{if(view==='network')renderGraph();if(selected&&selected.record_kind==='ballot')details(selected)});
const events=[...RESEARCH.transactions,...RESEARCH.ballots,...RESEARCH.reported_observations];
const eventMap=Object.fromEntries(events.map(e=>[e.event_id,e]));
let lastNet=null,view='timeline',selected=null,visible=30,graphHub='GOPAC ELECTION FUND',stateFocus='CO',graphScale=1;
const settings={search:'',state:'ALL',kind:'all',direction:'desc',minimum:0,showReported:true,includeContext:true};
function stateOf(e){if(e.record_kind==='ballot')return e.state;
 let j=String(e.jurisdiction||'').toUpperCase();let a=j.match(/\b(CO|OK|CA|MA|VA|NC|MO|MI|NY|TX|FL|AZ|MN|GA|OH|WI|WA|KS|IA|NH|AK|NV|UT|OR|TN|PA|IL|NJ|SC|MD|IN|KY|LA|AL|CT|DE|HI|ID|ME|MS|MT|NE|NM|ND|RI|SD|VT|WV|WY|AR)\b/);
 return a?a[1]:'US';}
function searchText(e){return Object.values(e).filter(v=>['string','number'].includes(typeof v)).join(' ').toLowerCase()}
function filtered(){let q=settings.search.toLowerCase();return events.filter(e=>{
 if(e.record_kind==='reported'&&!settings.showReported)return false;
 if(settings.kind!=='all'&&e.record_kind!==settings.kind)return false;
 if(settings.state!=='ALL'&&stateOf(e)!==settings.state)return false;
 if(e.record_kind==='transaction'&&num(e.amount_usd)<settings.minimum)return false;
 if(q&&!searchText(e).includes(q))return false;
 return true;
 }).sort((a,b)=>settings.direction==='desc'?(b.event_date||'').localeCompare(a.event_date||'')||a.event_id.localeCompare(b.event_id):(a.event_date||'').localeCompare(b.event_date||'')||a.event_id.localeCompare(b.event_id));}
function summary(){const m=RESEARCH.meta;const fecN=(m.fec&&m.fec.records)||0;$('#kpis').innerHTML=`<div class="kpi"><div class="kpi-value">${m.transactions+fecN}</div><div class="kpi-label">Itemized finance records${fecN?' ('+fecN+' from FEC filings)':''}</div></div><div class="kpi"><div class="kpi-value">${m.ballot_events}</div><div class="kpi-label">Statewide ballot events</div></div><div class="kpi"><div class="kpi-value">${m.states_with_ballot_events} / 50</div><div class="kpi-label">States with recorded measures</div></div><div class="kpi"><div class="kpi-value">0 / 50</div><div class="kpi-label">States fully investigated</div></div>`;
 const opts=Object.entries(stName).sort((a,b)=>a[1].localeCompare(b[1]));$('#state').innerHTML='<option value="ALL">All states</option>'+opts.map(([code,name])=>`<option value="${code}">${escapeHtml(name)}</option>`).join('')+'<option value="US">Federal / unresolved jurisdiction</option>';
}
function getTitle(e){if(e.record_kind==='transaction')return `${e.source_name} → ${e.recipient_name}`;if(e.record_kind==='ballot')return `${measureName(e)}: ${e.short_title}`;if(e.record_kind==='reported')return `${e.source_name} → ${e.recipient_name}`;if(e.record_kind==='entity')return e.name||'';if(e.from_name||e.to_name)return `${e.from_name||'Unknown'} → ${e.to_name||'Unknown'}`;return e.event_id||e.id||'';}
// The name of what is selected, shown first and in bold at the top of the inspector: a line reads 'FROM to TO', a dot reads its name.
function selName(e){if(e.record_kind==='ballot')return `${measureName(e)}: ${e.short_title}`;if(e.record_kind==='entity')return e.name||'';const f=e.source_name||e.from_name,t=e.recipient_name||e.to_name;if(f||t)return `${f||'Unknown'} to ${t||'Unknown'}`;return getTitle(e);}
function kindLabel(e){if(e.record_kind==='entity'&&e.web&&e.web.law)return 'Federal law followed on this page';return e.record_kind==='entity'?'Organization in the money web':e.record_kind==='transaction'?(e.evidence_tier==='fec_filing'?'FEC filing record':'Itemized finance record'):e.record_kind==='ballot'?'Statewide ballot event':e.record_kind==='reported'?'Reported disclosure · NOT a unique transfer':'Research graph connection · mixed evidence'}
function eventMarkup(e){let active=selected&&selected.event_id===e.event_id,kind=e.record_kind;let label=kind==='ballot'?e.state+' · statewide':e.evidence_tier==='fec_filing'?'US · FEC filing':(stateOf(e)==='US'?'US / context unresolved':stateOf(e));
 const sub=kind==='transaction'?(e.activity_type||'Filed transaction'):(kind==='ballot'?`${dateText(e.election_date)} · ${e.source_status||'Official record'}`:`Report date ${dateText(e.date)} · transfer date not verified`);
 return `<div class="timeline-item ${kind}"><div class="event-date">${timeDay(e.event_date)}</div><div class="rail"></div><button class="event-card ${active?'selected':''}" data-event="${escapeHtml(e.event_id)}" aria-label="Inspect ${escapeHtml(getTitle(e))}"><div class="event-top"><span class="event-kind ${kind}">${kindLabel(e)}</span>${kind!=='ballot'?`<span class="event-amount">${shortMoney(e.amount_usd)}</span>`:''}</div><div class="event-title">${escapeHtml(getTitle(e))}</div><div class="event-sub">${escapeHtml(sub.replace(/_/g,' '))}</div><div class="event-foot"><span class="chip">${escapeHtml(label)}</span>${kind==='transaction'?'<span class="chip green">Source-linked itemized</span>':kind==='ballot'?'<span class="chip amber">Finance review incomplete</span>':'<span class="chip amber">Non-additive · observed</span>'}</div></button></div>`}
function renderTimeline(){const a=filtered(),shown=a.slice(0,visible);let month='',html='';for(let e of shown){const m=mon(e.event_date);if(m!==month){month=m;html+=`<div class="month-label">${escapeHtml(m)}</div>`}html+=eventMarkup(e)}
 if(!shown.length)html='<div class="empty">No records match these filters. Try a broader state, date, or name.</div>';
 if(a.length>visible)html+=`<button class="load-more" id="load-more">Load ${Math.min(30,a.length-visible)} more records · ${a.length-visible} remaining</button>`;
 $('#timeline-feed').innerHTML=html;$('#feed-sub').textContent=`${a.length} matching events • ${RESEARCH.meta.transactions} distinct itemized finance records in source archive`;
 const load=$('#load-more');if(load)load.addEventListener('click',()=>{visible+=30;renderTimeline()});
 $$('#timeline-feed [data-event]').forEach(el=>el.addEventListener('click',()=>pick(eventMap[el.dataset.event])));
}
function datum(key,val){if(val===undefined||val===null||val==='')return '';return `<div class="datum"><div class="key">${escapeHtml(key)}</div><div class="val">${escapeHtml(val)}</div></div>`}
// D216: evidence and record links carry the blue filing cabinet picture.
const CABINET='/money-trail/art/records-cabinet.webp';
function sourceButton(url,label='Open original filing / source'){url=safeUrl(url);return url?`<a class="detail-link mt-evidence-link" href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank"><img class="mt-evidence-art" src="${CABINET}" alt="" width="22" height="24">${escapeHtml(label)} ↗</a>`:''}
function positionPanel(mid){let ps=positionsByMeasure[mid]||[];let sides={support:[],oppose:[],other:[]};for(let p of ps){let side=/support|yes|favor/i.test(p.stance||'')?'support':/oppose|no|against/i.test(p.stance||'')?'oppose':'other';sides[side].push(p)};return `<div class="side-group"><h4>Campaign sides · documented positions</h4><p><strong>Support:</strong> ${sides.support.length?sides.support.map(p=>escapeHtml(p.entity_name)).join(', '):'Not yet verified'}</p><p><strong>Opposition:</strong> ${sides.oppose.length?sides.oppose.map(p=>escapeHtml(p.entity_name)).join(', '):'Not yet verified'}</p><p>These positions do not prove how any particular donation was allocated.</p></div>`}
function details(e){if(!e)return;let kind=e.record_kind||'graph';let h=`<h2 class="mt-selected">${escapeHtml(selName(e))}</h2><span class="event-kind ${kind}">${escapeHtml(kindLabel(e)||'Graph connection')}</span>`+(kind==='ballot'?outcomeBox(e.measure_id)+ftmBlock(e):'');
 if(kind==='transaction'){
 h+=`<div class="event-amount mt-big">${money(e.amount_usd)}</div>`;
 h+=datum('Reported transaction date',dateText(e.transaction_date))+datum('Date semantics',e.date_kind)+datum('Source',e.source_name)+datum('Recipient',e.recipient_name)+datum('Source entity ID',e.source_entity_id)+datum('Recipient entity ID',e.recipient_entity_id)+datum('Election cycle',e.cycle)+datum('Jurisdiction / attribution',e.jurisdiction)+datum('Filing classification',e.activity_type)+datum('Confidence as recorded',e.confidence)+datum('Amendment status',e.amendment_status)+datum('Filing identifier',e.filing_id);
 h+=sourceButton(e.filing_url);
 h+=(e.evidence_tier==='fec_filing'?`<div class="detail-caution">This line comes from the FEC's public data and links to the page of the filing. It shows one reported payment, not where the money was used in the end. No connection implies wrongdoing.</div>`:`<div class="detail-caution">The archive labels this an itemized transaction. Classification may not establish federal independent expenditure status or ultimate state/ballot use. Source claims have not all been re-fetched in this build.</div>`)+datum('Research note',e.notes);
 h+=`<button class="detail-action" id="to-graph">Explore this relationship in network</button>`;
 }else if(kind==='ballot'){
 h+=datum('Election date',dateText(e.election_date))+datum('State',stName[e.state]||e.state)+datum('Question number',e.measure_number)+datum('Scope',e.scope)+datum('Official source status',e.source_status)+datum('Support committee review',e.support_committee_review||'Not checked')+datum('Opposition committee review',e.opposition_committee_review||'Not checked')+datum('Donor/vendor/ad reconciliation',e.donor_vendor_ad_reconciliation||'Pending');
 h+=sourceButton(e.source_url,'Open official ballot source')+(coGuide[e.measure_id]||(measureGuide[e.measure_id]?[['The Way · '+measureName(e)+' guide',measureGuide[e.measure_id]]]:[])).map(([l,u])=>`<a class="detail-link" href="${escapeHtml(u)}">${escapeHtml(l)} →</a>`).join('')+positionPanel(e.measure_id)+datum('Research notes',e.notes);
 }else if(kind==='reported'){
 h+=`<div class="event-amount mt-big">${money(e.amount_usd)}</div>`;
 h+=`<div class="detail-caution">This is a reported disclosure observation. It is NOT confirmed as one uniquely itemized transfer and may overlap other reports.</div>`;
 h+=datum('Report date (not necessarily transfer date)',dateText(e.date))+datum('Recorded date type',e.date_kind)+datum('Source as reported',e.source_name)+datum('Recipient as reported',e.recipient_name)+datum('Reported figure',money(e.amount_usd))+datum('Confidence',e.confidence)+datum('Reconciliation flag',e.reconciliation_flag)+datum('Recipient registration',e.recipient_registry_id);
 h+=sourceButton(e.source_url,'Open reported disclosure')+datum('Notes',e.notes);
 }else if(kind==='entity'){
 h+=webTotalsBox(e.web)+datum('Name as reported',e.name)+datum('Entity type',e.entity_type)+datum('Registry ID',e.id)+datum('Jurisdiction',e.jurisdiction)+sourceButton(e.source_url,'Open registry record');
 h+=`<div class="detail-caution">This is one dot in the money web. Click a line to see one connection and its filing.</div>`+datum('Notes',e.notes);
 }else{
 h+=datum('Connection type',e.edge_type)+datum('From (as reported)',e.from_name)+datum('To (as reported)',e.to_name)+datum('Amount or aggregate figure',e.amount_usd!=null?money(e.amount_usd):'Not a money link')+datum('Date',dateText(e.date))+datum('Date semantics',e.date_kind)+datum('Jurisdiction',e.jurisdiction)+datum('Confidence',e.confidence)+sourceButton(e.source_url,'Open source evidence');
 h+=`<div class="detail-caution">Graph observations can duplicate itemized ledger records or be nonfinancial. Never sum graph edges as additional transactions.</div>`+datum('Notes',e.notes||e.note);
 }
 $('#detail-content').innerHTML=h;
 const bt=$('#to-graph');if(bt)bt.addEventListener('click',()=>{graphHub=e.source_name;setView('network');$('#hub').value=graphHub;renderGraph()});
}
function pick(e){selected=e;details(e);if(view==='timeline')renderTimeline();if(window.innerWidth<=1250)$('#detail-panel').classList.add('open')}
function setView(v){view=v;$$('[data-view]').forEach(b=>{const active=b.dataset.view===v;b.classList.toggle('active',active);b.setAttribute('aria-selected',active)});$('#timeline-view').hidden=v!=='timeline';$('#network-view').hidden=v!=='network';$('#states-view').hidden=v!=='states';$('#feed-title').textContent=v==='timeline'?'The chronological trail':v==='network'?'Money Web':'The 50-state tracker';$('#feed-tools').hidden=v!=='timeline';
 if(v==='timeline')renderTimeline();if(v==='network'){renderGraph()}if(v==='states'){renderStates()}
 if(v!=='timeline')$('#feed-sub').textContent=v==='network'?'Entity links kept separate by ID and evidence tier':'No state is marked fully researched';
}
const hubs=['GOPAC ELECTION FUND','COMMON SENSE AMERICA ELECTION FUND','COMMON SENSE AMERICA INC.','NATIONAL EDUCATION ASSOC','BRIGHTER COLORADO','FUND FOR A WORKING CONGRESS','MASSACHUSETTS TEACHERS ASSOCIATION','VIRGINIANS FOR REPRODUCTIVE FREEDOM','GUILFORD-ROCKINGHAM ALLIANCE','KEEP COLORADO AFFORDABLE','OKLAHOMA VICTORY COMMITTEE'];
// Committees whose FEC filings were pulled (fec-data.js) are hubs too.
(RESEARCH.meta.fec_committees||[]).forEach(n=>{if(!hubs.includes(n))hubs.push(n)});
function prepareHub(){let h=$('#hub');h.innerHTML=hubs.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(hubLabel(x))}</option>`).join('');h.value=graphHub;h.addEventListener('change',()=>{graphHub=h.value;graphScale=1;renderGraph()});$('#include-context').addEventListener('change',e=>{settings.includeContext=e.target.checked;renderGraph()})}
const networkVerified=RESEARCH.transactions.map(t=>({id:t.transaction_id,from_name:t.source_name,to_name:t.recipient_name,from_entity_id:t.source_entity_id,to_entity_id:t.recipient_entity_id,amount_usd:t.amount_usd,date:t.transaction_date,date_kind:t.date_kind,jurisdiction:t.jurisdiction,edge_type:t.activity_type,confidence:t.confidence,source_url:t.filing_url,notes:t.notes,record_kind:'transaction',record_ref:t,tier:t.evidence_tier==='fec_filing'?'fec':'itemized'}));
const networkContext=RESEARCH.graph_edges.filter(e=> !/itemized|verified_.*(contribution|payment)|state_ballot_cash_receipt|state_ballot_in_kind_receipt|state_party_receipt/i.test(e.edge_type||'')).map(e=>({...e,record_kind:'graph',tier:/reported|aggregate|major_contribution|attestation|snapshot/i.test(e.edge_type||'')?'reported':'context'}));
function nodeKey(name,id,jur){if(id)return String(id);return 'reported-name:'+String(jur||'unknown')+':'+norm(name)}
// D220: the Filter the evidence panel also narrows the Money web and the Organization, Person and Department trackers.
// A line passes the same tests a Timeline record does: reported toggle, record type, state, minimum itemized amount and the name/word search.
function edgeInState(e,st){return String(e.jurisdiction||'').includes(st)||String(e.notes||'').includes(st+' ')||stateOf(e)===st}
function lineOk(e,noSearch){const solidE=e.tier==='itemized'||e.tier==='fec';
 if(e.tier==='reported'&&!settings.showReported)return false;
 if(settings.kind==='transaction'&&!solidE)return false;
 if(settings.kind==='reported'&&e.tier!=='reported')return false;
 if(settings.kind==='ballot'&&!(ballotById[e.from_name]||ballotById[e.to_name]))return false;
 if(solidE&&num(e.amount_usd)<settings.minimum)return false;
 if(settings.state!=='ALL'&&!edgeInState(e,settings.state))return false;
 const q=noSearch?'':String(settings.search||'').toLowerCase().trim();if(q&&!searchText(e).includes(q))return false;
 return true}
function filtersOn(noSearch){return (!noSearch&&!!String(settings.search||'').trim())||settings.state!=='ALL'||settings.kind!=='all'||settings.minimum>0||!settings.showReported}
const flcCache={};
// How many lines each name has once the filters are applied (every web, not one center). noSearch leaves the word search out.
function filteredLineCounts(noSearch){const key=JSON.stringify([noSearch?'':settings.search,settings.state,settings.kind,settings.minimum,settings.showReported]);if(flcCache[key])return flcCache[key];const m=new Map();for(const e of [...networkVerified,...networkContext])if(lineOk(e,noSearch))for(const nm of new Set([norm(e.from_name),norm(e.to_name)]))if(nm)m.set(nm,(m.get(nm)||0)+1);return flcCache[key]=m}
// D222: money on each name's lines (and each state's lines) for the tracker cards, with the filters applied.
// Itemized and FEC filings are added up, by year too. Reported figures are kept apart: only the largest one is kept, never a sum.
const cardCache={};
function cardMoney(byState){const key=(byState?'st':'nm')+JSON.stringify([settings.state,settings.kind,settings.minimum,settings.showReported]);if(cardCache[key])return cardCache[key];
 const m=new Map(),get=k=>{let t=m.get(k);if(!t)m.set(k,t={item:0,itemN:0,repMax:0,lines:0,years:new Map()});return t};
 for(const e of [...networkVerified,...networkContext]){if(!lineOk(e,true))continue;const amt=num(e.amount_usd)||0,solid=e.tier==='itemized'||e.tier==='fec';
  const keys=byState?[stateOf(e)]:[...new Set([norm(e.from_name),norm(e.to_name)])];
  for(const k of keys){if(!k)continue;const t=get(k);t.lines++;
   if(solid){t.item+=amt;t.itemN++;const y=/^\d{4}/.test(e.date||'')?String(e.date).slice(0,4):'';if(y){const v=t.years.get(y)||[0,0];v[0]+=amt;v[1]++;t.years.set(y,v)}}
   else if(e.tier==='reported')t.repMax=Math.max(t.repMax,amt)}}
 return cardCache[key]=m}
// Dollars in words, the same way the department budget cards write them.
function bigMoney(n){const a=Math.abs(num(n)),s=num(n)<0?'-$':'$';if(a>=1e12)return s+(a/1e12).toLocaleString('en-US',{maximumFractionDigits:2})+' trillion';if(a>=1e9)return s+(a/1e9).toLocaleString('en-US',{maximumFractionDigits:1})+' billion';if(a>=1e6)return s+(a/1e6).toLocaleString('en-US',{maximumFractionDigits:1})+' million';return s+Math.round(a).toLocaleString('en-US')}
// One card in the department style: big dollar figure, name, size bar, details line, then links and Past years.
function trackerCard(o){const el=(t,c,x)=>{const d=document.createElement(t);if(c)d.className=c;if(x!=null)d.textContent=x;return d};
 const t=o.money||{item:0,itemN:0,repMax:0,years:new Map()},v=t.item>0?t.item:t.repMax,card=el('div','tracker-card bud-row'),top=el('div','bud-top');
 top.append(el('b','bud-big'+(v>0?'':' none'),v>0?bigMoney(v):'No dollar amount yet'),el('strong','bud-name',o.name));card.append(top);
 if(v>0&&o.max>0){const b=el('span','bud-bar'+(t.item>0?'':' reported')),i=el('i');i.style.width=Math.max(0.5,Math.min(100,100*v/o.max)).toFixed(1)+'%';b.append(i);card.append(b)}
 const bits=[];if(t.item>0)bits.push(bigMoney(t.item)+' in '+t.itemN+(t.itemN===1?' itemized filing':' itemized filings'));
 if(t.repMax>0)bits.push((t.item>0?'largest reported figure ':'Largest reported figure ')+bigMoney(t.repMax)+' (not added up)');
 card.append(el('small','bud-small',[...bits,...(o.details||[])].filter(Boolean).join(' · ')));
 const act=el('div','bud-act');if(o.source){const a=el('a','bud-src',o.sourceLabel||'Source record ↗');a.href=o.source;a.target='_blank';a.rel='noopener noreferrer';act.append(a)}
 const ys=[...t.years].sort((a,b)=>b[0].localeCompare(a[0]));
 if(ys.length){const det=el('details','bud-years');det.append(el('summary',null,'Past years'));const ul=el('ul');ys.forEach(([y,[amt,n]])=>ul.append(el('li',null,y+': '+bigMoney(amt)+' in '+n+(n===1?' itemized filing':' itemized filings'))));det.append(ul);act.append(det)}
 (o.buttons||[]).forEach(b=>act.append(b));card.append(act);return card}
function makeNetwork(){let edges=settings.includeContext?[...networkVerified,...networkContext]:networkVerified;
 let f=norm(graphHub);
 // Include only edges directly touching the selected hub, without assuming the same legal entity across jurisdictions.
 edges=edges.filter(e=>norm(e.from_name)===f||norm(e.to_name)===f);
 edges=edges.filter(e=>lineOk(e));
 // D226: a law's own web keeps its money lines and its chamber vote lines; how each member voted is in each member's web.
 if(lawOf(String(graphHub).toUpperCase()))edges=edges.filter(e=>e.edge_type!=='member_roll_call_vote_nonfinancial');
 const solid=e=>e.tier==='itemized'||e.tier==='fec'?1:0;edges.sort((a,b)=>solid(a)===solid(b)?(num(b.amount_usd)-num(a.amount_usd)):(solid(b)-solid(a)));
 let shown=edges.slice(0,85),nodes=new Map(),display=[];
 for(let e of shown){let a=nodeKey(e.from_name,e.from_entity_id,e.jurisdiction),b=nodeKey(e.to_name,e.to_entity_id,e.jurisdiction);
 for(const [id,name] of [[a,e.from_name],[b,e.to_name]])if(!nodes.has(id))nodes.set(id,{id,name:name||id,jur:e.jurisdiction||'',amount:0,count:0,central:norm(name)===f});
 nodes.get(a).count++;nodes.get(b).count++;
 nodes.get(a).amount+=num(e.amount_usd)||0;nodes.get(b).amount+=num(e.amount_usd)||0;if(e.tier==='itemized'||e.tier==='fec'){nodes.get(a).itemized=(nodes.get(a).itemized||0)+(num(e.amount_usd)||0);nodes.get(b).itemized=(nodes.get(b).itemized||0)+(num(e.amount_usd)||0)}
 display.push({a,b,e});}
 // D214: dollar totals for each dot and for the hub, from every eligible line (not only the 85 drawn).
 // Itemized and FEC filings are added up. Reported disclosures are kept apart and never added to them. Context links have no dollars here.
 const tot={},hub={inAmt:0,inN:0,outAmt:0,outN:0,sameAmt:0,sameN:0,rep:0,repN:0,repMax:0,ids:new Set()};
 for(let e of edges){const a=nodeKey(e.from_name,e.from_entity_id,e.jurisdiction),b=nodeKey(e.to_name,e.to_entity_id,e.jurisdiction),amt=num(e.amount_usd)||0,s=solid(e),rp=e.tier==='reported'&&amt>0;
 for(const [id,side] of [[a,'out'],[b,'in']]){const t=tot[id]||(tot[id]={item:0,itemN:0,in:0,inN:0,out:0,outN:0,rep:0,repN:0,repMax:0});if(s){t.item+=amt;t.itemN++;t[side]+=amt;t[side+'N']++}else if(rp){t.rep+=amt;t.repN++;t.repMax=Math.max(t.repMax,amt)}}
 const fh=norm(e.from_name)===f,th=norm(e.to_name)===f;if(fh)hub.ids.add(a);if(th)hub.ids.add(b);
 if(s){if(fh&&th){hub.sameAmt+=amt;hub.sameN++}else if(th){hub.inAmt+=amt;hub.inN++}else{hub.outAmt+=amt;hub.outN++}}else if(rp){hub.rep+=amt;hub.repN++;hub.repMax=Math.max(hub.repMax,amt)}}
 for(const n of nodes.values())n.tot=tot[n.id]||{item:0,itemN:0,in:0,inN:0,out:0,outN:0,rep:0,repN:0,repMax:0};
 return {edges:display,nodes:[...nodes.values()],total:edges.length,hub};}
// D214: what a dot's money total means, for the Evidence inspector. The hub (center name) gets its totals over all its lines; any other dot gets its lines with the hub.
function webTotals(n){const net=lastNet;if(!net||!n)return null;if(n.central){const h=net.hub;return {hub:true,name:hubLabel(graphHub),ids:h.ids.size,total:h.inAmt+h.outAmt+h.sameAmt,inAmt:h.inAmt,inN:h.inN,outAmt:h.outAmt,outN:h.outN,sameAmt:h.sameAmt,sameN:h.sameN,rep:h.rep,repN:h.repN,repMax:h.repMax,law:lawOf(graphHub),budget:budgetOf(graphHub)}}
 const t=n.tot||{};return {hub:false,name:hubLabel(graphHub),total:t.item||0,inAmt:t.in||0,inN:t.inN||0,outAmt:t.out||0,outN:t.outN||0,rep:t.rep||0,repN:t.repN||0,repMax:t.repMax||0}}
function filings(k){return k+' itemized filing'+(k===1?'':'s')}
// D215: a law followed on this page (laws.js) has its own official total: money promised (obligated) under it, from USAspending.
// D223: the federal budget dot (budgets-view.js) is sized by what the government spent that fiscal year (Monthly Treasury Statement).
function budgetOf(name){const B=window.TW_BUDGETS,M=B&&B.money_in;return window.TW_BUDGET_HUB&&name===window.TW_BUDGET_HUB&&M&&M.outlays_total>0?{total:M.outlays_total,fy:M.fiscal_year,through:M.through,source:M.source}:null}
function lawOf(name){const L=((window.TW_LAWS||{}).laws||[]).find(l=>String(l.name||l.bill||'').toUpperCase()===name);return L&&L.overview&&L.overview.total_obligations>0?{total:L.overview.total_obligations,asOf:String(L.retrieved||'').slice(0,10)}:null}
// Big numbers read as words on the web: $1.43 trillion, $12.3 billion, $203.1m.
function webMoney(v){const a=Math.abs(num(v));return a>=1e12?'$'+(a/1e12).toLocaleString('en-US',{maximumFractionDigits:2})+' trillion':a>=1e9?'$'+(a/1e9).toLocaleString('en-US',{maximumFractionDigits:1})+' billion':shortMoney(v)}
// On the web itself space is tight: $1.43T, $4.8B, $203.1m.
function webShort(v){const a=Math.abs(num(v));return a>=1e12?'$'+(a/1e12).toLocaleString('en-US',{maximumFractionDigits:2})+'T':a>=1e9?'$'+(a/1e9).toLocaleString('en-US',{maximumFractionDigits:1})+'B':shortMoney(v)}
function webTotalsBox(w){if(!w)return '';if(w.budget)return `<div class="mt-web-total"><div class="key">Money the federal government spent in fiscal year ${escapeHtml(String(w.budget.fy))}</div><div class="event-amount mt-big">${webMoney(w.budget.total)}</div><p>Exactly ${money_(w.budget.total)}, from the Monthly Treasury Statement through ${escapeHtml(dateText(w.budget.through))}. Each line in the web is one department's budget resources (money it had available), as reported to USAspending.gov. Available money can include money carried over from earlier years, so the lines are not added up.</p></div>`;if(w.law)return `<div class="mt-web-total"><div class="key">Money promised under this law</div><div class="event-amount mt-big">${webMoney(w.law.total)}</div><p>Exactly ${money_(w.law.total)}: the total USAspending tags to this law's spending codes, as of ${escapeHtml(dateText(w.law.asOf))}. The lines in the web show the agencies and the largest recipients. They overlap, so they are not added up. How each member of Congress voted on it is in that member's own web and in the Person tracker.</p></div>`;/* D231: no itemized filing but a reported figure: the big number is the largest reported figure, marked not added up (as on the tracker cards), never $0 */const repOnly=!(w.total>0)&&w.repMax>0;
 let h=`<div class="mt-web-total"><div class="key">${repOnly?(w.hub?'Largest reported figure on its lines':'Largest reported figure on its lines with '+escapeHtml(w.name)):(w.hub?'Money on all its lines in this web':'Money on its lines with '+escapeHtml(w.name))}</div><div class="event-amount mt-big">${repOnly?webMoney(w.repMax)+'<span class="mt-not-added">not added up</span>':w.total>0?money_(w.total):'No dollar amount yet'}</div>`;
 if(w.hub){const parts=[];if(w.inN)parts.push(`Received: <b>${money_(w.inAmt)}</b> in ${filings(w.inN)}.`);if(w.outN)parts.push(`Sent: <b>${money_(w.outAmt)}</b> in ${filings(w.outN)}.`);if(parts.length)h+=`<p>${parts.join(' ')}</p>`;else if(!w.sameN)h+=`<p>No itemized filing on its lines.</p>`;if(w.sameN)h+=`<p>Between records that share this name: <b>${money_(w.sameAmt)}</b> in ${filings(w.sameN)}.</p>`;if(w.ids>1)h+=`<p>Lines from ${w.ids} separate ID records that share this name are counted here. They may not be the same legal entity.</p>`}
 else{if(w.outN)h+=`<p>Sent to ${escapeHtml(w.name)}: <b>${money_(w.outAmt)}</b> in ${filings(w.outN)}.</p>`;if(w.inN)h+=`<p>Received from ${escapeHtml(w.name)}: <b>${money_(w.inAmt)}</b> in ${filings(w.inN)}.</p>`;if(!w.outN&&!w.inN)h+=`<p>No itemized filing on these lines.</p>`}
 if(w.repN)h+=`<p>Reported figures: ${w.repN} report${w.repN===1?'':'s'}, the largest <b>${money_(w.repMax)}</b>. They are not added to the total or to each other, because they may repeat the same money.</p>`;
 return h+`<p class="mt-web-total-note">Counts only the records in this page's data, with the filters now set. It is not the full amount this group raised or spent.</p></div>`}
const NS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs,parent){let x=document.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([k,v])=>x.setAttribute(k,v));if(parent)parent.appendChild(x);return x}
function renderGraph(){const svg=$('#network-svg');svg.replaceChildren();const net=makeNetwork();lastNet=net;const names=new Map(net.nodes.map(n=>[n.id,n]));let roots=net.nodes.filter(n=>n.central).sort((a,b)=>b.count-a.count),root=roots[0];
 const meta=`${net.total} eligible connections · ${net.edges.length} drawn (limit 85) · ${roots.length} separate ID nodes sharing hub name`;$('#graph-count').textContent=meta+' · Connections may refer to different legal entities with identical reported names.';
 if(!root||!net.edges.length){$('#network-desc').textContent='No connections match this hub and state filter. Clear the state filter or choose another hub.';svgEl('text',{x:560,y:320,'text-anchor':'middle',fill:'#a5c2c8'},svg).textContent='No documented connections in the selected filter';return;}
 $('#network-desc').textContent=`Showing ${net.edges.length} connections adjacent to ${hubLabel(graphHub)}. Point at a dot or a line to see a short card about it. Click a line to open its filing in the Evidence inspector, or a dot to explore its neighbors.`;
 const cx=560,cy=312,pos={};pos[root.id]={x:cx,y:cy};const other=net.nodes.filter(n=>n.id!==root.id).sort((a,b)=>b.count-a.count||b.amount-a.amount),total=other.length;
 other.forEach((n,i)=>{const inner=i<Math.min(16,total);const sameName=n.central;const radius=sameName?68:inner?200:290;const idx=sameName?i:(inner?i: i-16);const span=sameName?Math.max(roots.length-1,1):inner?Math.min(16,total):Math.max(total-16,1);let angle=2*Math.PI*(idx/Math.max(span,1))-.5*Math.PI;pos[n.id]={x:cx+Math.cos(angle)*radius+(i%2?2:-2),y:cy+Math.sin(angle)*radius*.86};});
 let pan=svgEl('g',{transform:`translate(${cx*(1-graphScale)} ${cy*(1-graphScale)}) scale(${graphScale})`},svg);
 for(let {a,b,e} of net.edges){let A=pos[a],B=pos[b];if(!A||!B)continue;let tier=e.tier;let line=svgEl('line',{x1:A.x,y1:A.y,x2:B.x,y2:B.y,stroke:tier==='itemized'?'#57c2ad':tier==='fec'?'#b9a7f2':tier==='reported'?'#ad946c':'#659eb3','stroke-width':tier==='itemized'||tier==='fec'?'2.6':'2','stroke-dasharray':tier==='itemized'||tier==='fec'?'none':tier==='reported'?'7 5':'2 5',class:'graph-edge',opacity:'.7'},pan);svgEl('title',{},line).textContent=`${e.from_name} → ${e.to_name}\n${e.amount_usd!=null?money(e.amount_usd):'Non-financial'}\n${e.edge_type}`;line.__rec=e.record_ref||e;line.__e=e;line.__pair=a<b?a+'|'+b:b+'|'+a;
 // D218: a wide see-through line on top makes each line easy to point at and click. The visible line stays thin.
 const hit=svgEl('line',{x1:A.x,y1:A.y,x2:B.x,y2:B.y,stroke:'transparent','stroke-width':'16',class:'graph-edge-hit'},pan);hit.__vis=line;hit.addEventListener('click',()=>pick(e.record_ref||e));}
 // D214: the dollar amount along each line. Two dots with more than one filing between them show the sum of those filings.
 {const pairs=new Map();for(let {a,b,e} of net.edges){if(!pos[a]||!pos[b])continue;const k=a<b?a+'|'+b:b+'|'+a;const p=pairs.get(k)||{a,b,item:0,itemN:0,fec:0,rep:0};/* reported figures on one pair: the largest, not a sum */const amt=num(e.amount_usd)||0;if(e.tier==='itemized'||e.tier==='fec'){p.item+=amt;p.itemN++;if(e.tier==='fec')p.fec++}else if(e.tier==='reported')p.rep=Math.max(p.rep,amt);pairs.set(k,p)}
 const lg=svgEl('g',{class:'graph-amounts'},pan);
 for(const p of pairs.values()){const amt=p.itemN?p.item:p.rep;if(!(amt>0))continue;let A=pos[p.a],B=pos[p.b];if(Math.hypot(B.x-cx,B.y-cy)<Math.hypot(A.x-cx,A.y-cy))[A,B]=[B,A];const t=.6;
 const tx=svgEl('text',{x:A.x+(B.x-A.x)*t,y:A.y+(B.y-A.y)*t+4,'text-anchor':'middle',class:'graph-amount '+(p.itemN?(p.fec===p.itemN?'fec':'itemized'):'reported')},lg);tx.textContent=webShort(amt);tx.__amt=amt;tx.__A=A;tx.__B=B;tx.__ends=[p.a,p.b]}}
 for(let n of net.nodes){let P=pos[n.id],isRoot=n.id===root.id;let group=svgEl('g',{class:'graph-node'},pan);group.__n=n;group.__root=isRoot;let circ=svgEl('circle',{cx:P.x,cy:P.y,r:isRoot?'24':n.central?'11':ballotById[n.name]?'13':Math.max(6,Math.min(14,7+n.count/4)),fill:(ballotById[n.name]&&outcomeColor(n.name))||(isRoot?'#6be3c9':n.central?'#c4b18a':'#4c9ba5')},group);if(ballotById[n.name]&&outcomeColor(n.name))circ.setAttribute('stroke','#ffffff'),circ.setAttribute('stroke-width','3');svgEl('title',{},group).textContent=`${n.name}\n${n.id}\n${n.count} connections`;
 if(isRoot||n.count>=2||other.indexOf(n)<17){let text=svgEl('text',{x:P.x,y:P.y+(isRoot?42:24),'text-anchor':'middle'},group);const mb=ballotById[n.name];let label=mb?mb.state+' '+measureName(mb).slice((stName[mb.state]||mb.state).length+1):n.name;label=label.length>24?label.slice(0,22)+'…':label;text.textContent=label;
 if(mb){let sub=svgEl('text',{x:P.x,y:P.y+(isRoot?60:40),'text-anchor':'middle',class:'graph-sub'},group);sub.textContent=mb.short_title.length>34?mb.short_title.slice(0,32)+'…':mb.short_title;const mo=measureOutcome[n.name];if(mo){let st=svgEl('text',{x:P.x,y:P.y+(isRoot?84:62),'text-anchor':'middle',class:'graph-status '+mo.status},group);st.textContent=mo.status==='passed'?'✓ PASSED':mo.status==='failed'?'✗ FAILED':'Not yet called';}}}
 {const t=n.tot||{},mb=ballotById[n.name],mo=mb&&measureOutcome[n.name];const labeled=isRoot||n.count>=2||other.indexOf(n)<17;const dy=!labeled?(isRoot?42:24):mb?(mo?(isRoot?106:82):(isRoot?80:58)):(isRoot?62:40);
 const law=lawOf(String(n.name).toUpperCase()),bud=n.central&&budgetOf(n.name);/* D226: a law dot always shows the money promised under it */const amt=law?law.total:bud?bud.total:t.item>0?t.item:t.repMax;if(amt>0){let m=svgEl('text',{x:P.x,y:P.y+dy,'text-anchor':'middle',class:'graph-money'+(law||bud||t.item>0?'':' reported')+(isRoot?' root':'')},group);m.textContent=law?webMoney(amt)+' promised':bud?webMoney(amt)+' spent':webShort(amt);m.__amt=amt}}
 group.addEventListener('click',()=>{const mb=ballotById[n.name];if(mb){pick({...mb});if(n.name!==graphHub){graphHub=n.name;if(!hubs.includes(graphHub)){hubs.push(graphHub);prepareHubRefresh()}$('#hub').value=graphHub;graphScale=1;renderGraph()}return;}
 if(n.name===graphHub){const ent=entityById[n.id];if(ent){pick({record_kind:'entity',name:ent.legal_or_reported_name,entity_type:tidy(ent.entity_type),source_url:ent.source_url,notes:ent.notes,jurisdiction:ent.jurisdiction,id:ent.entity_id,web:webTotals(n)})}else pick({record_kind:'entity',name:n.name,jurisdiction:n.jur,id:/reported[-_]name/.test(n.id)?'':n.id,web:webTotals(n)});return;}
 graphHub=n.name;if(!hubs.includes(graphHub)){hubs.push(graphHub);prepareHubRefresh()}$('#hub').value=graphHub;graphScale=1;renderGraph()});}
 const crowded=thinWebLabels(pan);if(crowded)$('#graph-count').textContent+=` · ${crowded} dollar ${crowded===1?'number was':'numbers were'} left off where they would cover other words. Point at a line or dot to see its number.`;
}
// D231: on a busy web the dollar numbers piled on top of each other and on the names. Names and dots stay.
// D232: every dot keeps its number where it can: a dot's number tries below, above, right and left of the dot before it
// is left off. A line's number is not repeated when the dot at its end already shows the same number. A line keeps its
// number even when crowded if the dot at its end could not show one, so no amount drops out of the web.
// Sizes are estimates in web units, so this works before the web is on screen.
function thinWebLabels(pan){const boxes=[],em=t=>parseFloat(getComputedStyle(t).fontSize)||12;
 const box=(t,x,y)=>{const f=em(t),w=String(t.textContent).length*f*.58+4;return {x0:x-w/2,x1:x+w/2,y0:y-f*.8,y1:y+f*.25}};
 const hits=b=>boxes.some(o=>b.x0<o.x1&&b.x1>o.x0&&b.y0<o.y1&&b.y1>o.y0);
 const at=(t,k)=>parseFloat(t.getAttribute(k))||0;let gone=0;const shown=new Map(),dropped=new Set();
 pan.querySelectorAll('.graph-node circle').forEach(c=>{const x=at(c,'cx'),y=at(c,'cy'),r=at(c,'r')+1;boxes.push({x0:x-r,x1:x+r,y0:y-r,y1:y+r})});
 pan.querySelectorAll('.graph-node text:not(.graph-money), .graph-money.root').forEach(t=>boxes.push(box(t,at(t,'x'),at(t,'y'))));
 const nodeMoney=[...pan.querySelectorAll('.graph-money:not(.root)')].sort((a,b)=>(b.__amt||0)-(a.__amt||0));
 for(const t of nodeMoney){const g=t.parentNode,n=g&&g.__n,c=g&&g.querySelector('circle');let ok=null;
  const spots=[[at(t,'x'),at(t,'y'),'middle']];
  if(c){const cx=at(c,'cx'),cy=at(c,'cy'),r=at(c,'r'),f=em(t),w=String(t.textContent).length*f*.58+4;spots.push([cx,cy-r-5,'middle'],[cx+r+5+w/2,cy+f*.35,'middle'],[cx-r-5-w/2,cy+f*.35,'middle'])}
  for(const [x,y] of spots){const b=box(t,x,y);if(!hits(b)){ok={x,y,b};break}}
  if(ok){t.setAttribute('x',ok.x);t.setAttribute('y',ok.y);boxes.push(ok.b);if(n)shown.set(n.id,{text:t.textContent,count:n.count})}else{t.remove();if(n)dropped.add(n.id)}}
 const lineMoney=[...pan.querySelectorAll('.graph-amount')].sort((a,b)=>(b.__amt||0)-(a.__amt||0));
 for(const t of lineMoney){const A=t.__A,B=t.__B,ends=t.__ends||[];
  if(ends.some(id=>{const s=shown.get(id);return s&&s.count===1&&s.text===t.textContent})){t.remove();continue}
  let ok=null;
  if(A&&B)for(const f of [.6,.5,.7,.42,.78]){const x=A.x+(B.x-A.x)*f,y=A.y+(B.y-A.y)*f+4,b=box(t,x,y);if(!hits(b)){ok={x,y,b};break}}
  else{const b=box(t,at(t,'x'),at(t,'y'));if(!hits(b))ok={x:at(t,'x'),y:at(t,'y'),b}}
  if(ok){t.setAttribute('x',ok.x);t.setAttribute('y',ok.y);boxes.push(ok.b)}
  else if(ends.some(id=>dropped.has(id))){boxes.push(box(t,at(t,'x'),at(t,'y')))}
  else{t.remove();gone++}}
 return gone}
function prepareHubRefresh(){$('#hub').innerHTML=hubs.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(hubLabel(x))}</option>`).join('')}
function setScale(n){graphScale=Math.min(2,Math.max(.65,graphScale*n));renderGraph()}
function renderStates(){const sel=$('#state-pick');if(!sel)return renderStateFocus();const arr=RESEARCH.coverage.map(x=>({...x,count:(byState[x.state]||[]).length})).sort((a,b)=>(stName[a.state]||a.state).localeCompare(stName[b.state]||b.state));sel.innerHTML=arr.map(s=>`<option value="${escapeHtml(s.state)}"${s.state===stateFocus?' selected':''}>${escapeHtml(stName[s.state]||s.state)} (${s.count})</option>`).join('');if(!sel.dataset.wired){sel.dataset.wired='1';sel.addEventListener('change',()=>{stateFocus=sel.value;renderStates();inspectState(stateFocus)})}renderStateFocus()}
// The evidence inspector for one state: its review status, its ballot events and its source.
const tidy=t=>{t=String(t||'').replace(/_/g,' ').trim();return t?t[0].toUpperCase()+t.slice(1):''};
function inspectState(code){const s=RESEARCH.coverage.find(x=>x.state===code);if(!s)return;selected=null;const bb=(byState[code]||[]).slice().sort((a,b)=>a.election_date.localeCompare(b.election_date)||a.measure_id.localeCompare(b.measure_id));
 let h=`<h2 class="mt-selected">${escapeHtml(stName[code]||code)}</h2><span class="event-kind ballot">State</span><div class="event-amount mt-big">${bb.length} ballot ${bb.length===1?'event':'events'}</div>`;
 h+=datum('Ballot review',tidy(s.ballot_review_status)||'No comprehensive inventory verified')+datum('Finance review',tidy(s.finance_review_status)||'Not reviewed')+datum('Local measures review',tidy(s.local_measures_review_status)||'Not reviewed')+datum('State complete','NO');
 h+=bb.map(b=>`<button class="mt-state-measure" data-inspectmeasure="${escapeHtml(b.measure_id)}">${escapeHtml(b.measure_number)} · ${escapeHtml(b.short_title)}</button>`).join('')||'<div class="mini-warning">No statewide measures identified in the current archive. This does not establish that none existed.</div>';
 h+=sourceButton(s.source_url,'Open state inventory reference')+`<div class="detail-caution">${escapeHtml(s.notes||'Review pending.')}</div>`;
 $('#detail-content').innerHTML=h;
 $$('[data-inspectmeasure]').forEach(el=>el.addEventListener('click',()=>pick(RESEARCH.ballots.find(b=>b.measure_id===el.dataset.inspectmeasure))));
 if(window.innerWidth<=1250)$('#detail-panel').classList.add('open')}
function renderStateFocus(){let s=RESEARCH.coverage.find(x=>x.state===stateFocus),bb=(byState[stateFocus]||[]).slice().sort((a,b)=>a.election_date.localeCompare(b.election_date)||a.measure_id.localeCompare(b.measure_id));let h=`<h3>${escapeHtml(stName[stateFocus]||stateFocus)} · ${bb.length} statewide ballot events</h3><p>${escapeHtml(s.ballot_review_status||'No comprehensive inventory verified')} · Finance: ${escapeHtml(s.finance_review_status||'not reviewed')} · <strong>State complete: NO</strong></p>`;
 h+=bb.map(b=>`<div class="measure-card"><div><strong>${escapeHtml(b.measure_number)} · ${escapeHtml(b.short_title)}</strong><small>${dateText(b.election_date)} · ${escapeHtml(b.source_status||'source-linked')}</small></div><button data-measurepick="${escapeHtml(b.measure_id)}">Inspect</button></div>`).join('')||'<div class="mini-warning">No statewide measures identified in the current archive. This does not establish that none existed or that research is complete.</div>';
 h+=`<div class="detail-caution">${escapeHtml(s.notes||'Review pending.')}</div>${sourceButton(s.source_url,'Open state inventory reference')}`;
 h+='<button class="detail-action" id="filter-to-state">View this state on timeline</button>';$('#state-focus').innerHTML=h;
 $$('[data-measurepick]').forEach(el=>el.addEventListener('click',()=>pick(RESEARCH.ballots.find(b=>b.measure_id===el.dataset.measurepick))));$('#filter-to-state').addEventListener('click',()=>{$('#state').value=stateFocus;settings.state=stateFocus;visible=30;setView('timeline')});}
// Event wiring
summary();prepareHub();renderTimeline();
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
const fields={search:'search',state:'state',kind:'kind',direction:'direction',minimum:'minimum'};
Object.entries(fields).forEach(([setting,id])=>{let e=$('#'+id);e.addEventListener(setting==='search'?'input':'change',()=>{settings[setting]=setting==='minimum'?Number(e.value):e.value;visible=30;if(view==='timeline')renderTimeline();if(view==='network')renderGraph();if(view==='states')renderStates()})});
$('#show-reported').addEventListener('change',e=>{settings.showReported=e.target.checked;visible=30;renderTimeline();if(view==='network')renderGraph()});
$('#clear-filters').addEventListener('click',()=>{Object.assign(settings,{search:'',state:'ALL',kind:'all',direction:'desc',minimum:0,showReported:true,includeContext:true});Object.keys(fields).forEach(k=>$('#'+fields[k]).value=k==='minimum'?'0':k==='direction'?'desc':k==='kind'?'all':k==='state'?'ALL':'');$('#show-reported').checked=true;$('#include-context').checked=true;visible=30;if(view==='timeline')renderTimeline();if(view==='network')renderGraph()});
$('#today-top').addEventListener('click',()=>{settings.direction='desc';$('#direction').value='desc';visible=30;renderTimeline();$('.center-panel').scrollIntoView({block:'start',behavior:'smooth'})});
$('#zoom-in').addEventListener('click',()=>setScale(1.2));$('#zoom-out').addEventListener('click',()=>setScale(1/1.2));$('#zoom-reset').addEventListener('click',()=>{graphScale=1;renderGraph()});
$('#network-svg').addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();setScale(e.deltaY>0?.9:1.1)}},{passive:false});
$('#detail-close').addEventListener('click',()=>$('#detail-panel').classList.remove('open'));
$('#filter-toggle').addEventListener('click',()=>{let p=$('#filter-panel');p.classList.toggle('expanded');$('#filter-toggle').setAttribute('aria-expanded',p.classList.contains('expanded')?'true':'false')});
$('#filter-toggle').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#filter-toggle').click()}});

// ---- D198 (Nov 2026): Organization, Person and Department trackers. They list only names already in this data.
// Each row says how many lines it has in the Money web and opens it there. Text goes in with textContent.
(function () {
  const lines = new Map();
  [...networkVerified, ...networkContext].forEach(x => { for (const nm of new Set([norm(x.from_name), norm(x.to_name)])) if (nm) lines.set(nm, (lines.get(nm) || 0) + 1); });
  const ORG_WORD = /\b(INC|LLC|PAC|FUND|COMMITTEE|COMM|ASSOC|ASSOCIATION|UNION|COUNCIL|PARTY|CAUCUS|CHURCH|PROJECT|FOUNDATION|TRUST|CAMPAIGN|NETWORK|ACTION|LEAGUE|COALITION|CORP|CORPORATION|SOCIETY|CENTER|ALLIANCE|COLORADO|AMERICA|LOCAL)\b/i;
  // Filings write a person's name as "LAST, FIRST". Two short parts with no organization word count as a person.
  const looksPerson = n => { const p = String(n).split(','); return p.length === 2 && !ORG_WORD.test(n) && p.every(x => { const w = x.trim().split(/\s+/); return w[0] && w.length <= 3; }); };
  const kindOf = e => {
    const t = e.entity_type || '';
    if (/ballot measure/i.test(t)) return null;
    if (/municipal_public_body|election authority|federal agency|federal court/i.test(t)) return 'departments';
    if (/candidate_named|member_of_congress|supreme_court_justice|president_of_the_united_states/i.test(t) || looksPerson(e.legal_or_reported_name)) return 'people';
    return 'orgs';
  };
  const lists = { orgs: [], people: [], departments: [] };
  const seen = new Set();
  RESEARCH.entities.forEach(e => {
    const k = kindOf(e), key = norm(e.legal_or_reported_name) + '|' + (e.jurisdiction || '');
    if (!k || seen.has(key)) return; seen.add(key);
    lists[k].push({ name: e.legal_or_reported_name, type: tidy(e.entity_type), jur: e.jurisdiction || '', count: lines.get(norm(e.legal_or_reported_name)) || 0,
      entity: { record_kind: 'entity', name: e.legal_or_reported_name, entity_type: e.entity_type, id: e.registry_identifier || e.entity_id, jurisdiction: e.jurisdiction, source_url: e.source_url, notes: e.notes } });
  });
  // Trails on the Follow one trail page that are not in the entity list above
  lists.people.push({ name: 'Leonard A. Leo', type: 'Person', jur: 'US', count: 0, trail: 'follow.html?person=leonard-leo' });
  lists.departments.push({ name: 'U.S. Immigration and Customs Enforcement', type: 'Federal agency', jur: 'US', count: 0, trail: 'follow.html?agency=ice' });
  // D223: the department budget cards above already list every federal department and agency, with web and Inspect buttons.
  // This list keeps only the government offices that are not in that budget list (state and city offices, and ICE's trail).
  { const inBudget = new Set((((window.TW_BUDGETS || {}).departments || {}).rows || []).map(r => norm(r.name)));
    lists.departments = lists.departments.filter(r => !inBudget.has(norm(r.name))); }
  Object.values(lists).forEach(a => a.sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)));
  const TEXT = {
    orgs: { title: 'The organization tracker', sub: n => n + ' organizations named in this data', lead: 'Every committee, company, union, church and other group named in this archive. Names are as reported; two rows with the same name are not proven to be the same legal group. Groups with more lines in the Money web are listed first.' },
    people: { title: 'The person tracker', sub: n => n + ' people named in this data', lead: 'People named in this archive: candidates named in spending summaries, and donors that filings list by a person’s name (last, first). Names are as reported and the person’s identity is not verified. Being listed does not imply wrongdoing.' },
    departments: { title: 'The department tracker', sub: n => (((window.TW_BUDGETS || {}).departments || {}).rows || []).length + ' federal departments and agencies, plus ' + n + ' other government offices in this data', lead: 'Other government offices our money records name: state and city offices, and agency trails. Every federal department and agency is in the budget cards above.' }
  };
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const query = { orgs: '', people: '', departments: '' };
  // D221: the blue web on "See in the Money web", the blue filing cabinet on "Inspect" and on trail links.
  const WEB_ART = '/money-trail/art/money-web-link-blue.webp';
  const btnArt = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  // D222: each tracker looks like the department budget cards: a "Find a ..." box, then one card per name with a big dollar
  // figure, the name, a size bar, a details line, the source link and Past years. The 12 largest show first.
  const FIND = { orgs: ['Find an organization', 'Type part of an organization name…'], people: ['Find a person', 'Type part of a person’s name…'], departments: ['Find another government office', 'Type part of a name…'] };
  const showAll = { orgs: false, people: false, departments: false };
  function render(k) {
    const box = $('#' + k + '-view'); if (!box) return;
    let area = box.querySelector('.tracker-area');
    if (!area) {
      area = el('div', 'tracker-area'); box.append(area);
      area.append(el('p', 'state-lead', TEXT[k].lead));
      const lab = el('label', 'tracker-search'); const sp = el('span', null, FIND[k][0]); const inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = FIND[k][1];
      inp.addEventListener('input', () => { query[k] = inp.value; draw(k); }); lab.append(sp, inp);
      const more = el('button', 'bud-more tracker-more'); more.type = 'button'; more.addEventListener('click', () => { showAll[k] = !showAll[k]; draw(k); });
      area.append(lab, el('div', 'tracker-list bud-list'), more);
    }
    draw(k);
  }
  const sizeOfRow = r => { const t = r.money; return t ? (t.item > 0 ? t.item : t.repMax) : 0; };
  function draw(k) {
    const list = $('#' + k + '-view .tracker-list'); list.replaceChildren();
    const q = norm(query[k]); let rows = lists[k].filter(r => !q || norm(r.name).includes(q));
    // D220: the Filter the evidence panel narrows this list too. Its name search matches the name itself; the other filters
    // keep a row only when it has a line that passes them, and the line count then counts only those lines.
    const fq = norm(settings.search || ''), lineOn = filtersOn(true), on = lineOn || !!fq;
    if (fq) rows = rows.filter(r => norm(r.name).includes(fq));
    const cm = cardMoney(false);
    rows = rows.map(r => ({ ...r, money: cm.get(norm(r.name)) }));
    if (lineOn) { const fl = filteredLineCounts(true); rows = rows.map(r => ({ ...r, count: fl.get(norm(r.name)) || 0 })).filter(r => r.count > 0); }
    // Largest first: itemized filings, else the largest reported figure, then the most lines.
    rows.sort((x, y) => sizeOfRow(y) - sizeOfRow(x) || y.count - x.count || x.name.localeCompare(y.name));
    const max = rows.reduce((m, r) => Math.max(m, sizeOfRow(r)), 0);
    const cut = showAll[k] || q || on ? rows.length : 12;
    rows.slice(0, cut).forEach(r => {
      const btns = [];
      if (r.count) { const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(btnArt(WEB_ART)); b.addEventListener('click', () => openWeb(r.name)); btns.push(b); }
      if (r.trail) { const a = el('a', 'tracker-web', 'Follow this trail →'); a.prepend(btnArt(CABINET)); a.href = r.trail; btns.push(a); }
      if (r.entity) { const b = el('button', 'tracker-inspect', 'Inspect'); b.type = 'button'; b.prepend(btnArt(CABINET)); b.addEventListener('click', () => pick(r.entity)); btns.push(b); }
      const lineWords = r.count ? r.count + (r.count === 1 ? ' line' : ' lines') + ' in the web' : 'No lines in the web yet';
      list.append(trackerCard({ name: r.name, money: r.money, max, details: [lineWords, r.type, r.jur], source: r.entity && /^https?:/.test(r.entity.source_url || '') ? r.entity.source_url : '', buttons: btns }));
    });
    if (!rows.length) list.append(el('div', 'empty', on ? 'No names match these filters. Reset filters to see them all.' : 'No names match. Try fewer letters.'));
    const more = $('#' + k + '-view .tracker-more');
    if (more) { more.hidden = !!q || on || rows.length <= 12; more.textContent = showAll[k] ? 'Show the 12 largest' : 'Show all ' + rows.length; }
    $('#feed-sub').textContent = on ? rows.length + ' of ' + TEXT[k].sub(lists[k].length) + ' match the filters' : TEXT[k].sub(lists[k].length);
  }
  // D220: redraw the open tracker when a filter changes (the filter's own listener has already updated settings).
  const redraw = () => { if (lists[view] && $('#' + view + '-view .tracker-list')) draw(view); };
  ['#state', '#kind', '#direction', '#minimum', '#show-reported'].forEach(id => { const c = $(id); if (c) c.addEventListener('change', redraw); });
  { const c = $('#search'); if (c) c.addEventListener('input', redraw); }
  { const c = $('#clear-filters'); if (c) c.addEventListener('click', redraw); }
  const baseSetView = setView;
  setView = function (v) {
    baseSetView(v);
    for (const k of Object.keys(lists)) { const box = $('#' + k + '-view'); if (box) box.hidden = v !== k; }
    if (lists[v]) { $('#feed-title').textContent = TEXT[v].title; render(v); }
  };
})();

// ---- D222 (Nov 2026): the State tracker gets the department card style too: a "Find a state" box and one card per state
// with the itemized money on its lines in the web, a size bar, its ballot measures and review status, the source and Past years.
// "Inspect" opens the state below the cards and in the Evidence inspector, as the old "Choose a state" list did.
(function () {
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const art = src => { const im = document.createElement('img'); im.src = src; im.alt = ''; im.width = 22; im.height = 24; im.className = 'tracker-btn-art'; im.decoding = 'async'; return im; };
  let q = '', all = false, box = null;
  function busiest(st) {
    const count = new Map();
    [...networkVerified, ...networkContext].forEach(x => { if (stateOf(x) !== st || !lineOk(x, true)) return; for (const nm of [x.from_name, x.to_name]) if (nm) count.set(nm, (count.get(nm) || 0) + 1); });
    return ([...count].sort((x, y) => y[1] - x[1])[0] || [])[0];
  }
  function openState(st) {
    const top = busiest(st); if (!top) return;
    graphHub = top; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network');
    $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function build() {
    const map = $('#state-map'); if (!map || box) return;
    box = el('div', 'state-cards');
    const lab = el('label', 'tracker-search'); const inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type part of a state name…';
    inp.addEventListener('input', () => { q = inp.value.trim().toLowerCase(); draw(); });
    lab.append(el('span', null, 'Find a state'), inp);
    const more = el('button', 'bud-more state-more'); more.type = 'button'; more.addEventListener('click', () => { all = !all; draw(); });
    box.append(lab, el('div', 'bud-list state-card-list'), more);
    map.after(box);
  }
  function draw() {
    build(); if (!box) return;
    const list = box.querySelector('.state-card-list'); list.replaceChildren();
    const cm = cardMoney(true), size = t => t ? (t.item > 0 ? t.item : t.repMax) : 0;
    let rows = RESEARCH.coverage.filter(s => stName[s.state]).map(s => ({ s, name: stName[s.state], money: cm.get(s.state), n: (byState[s.state] || []).length }));
    if (settings.state !== 'ALL') rows = rows.filter(r => r.s.state === settings.state);
    if (q) rows = rows.filter(r => (r.name + ' ' + r.s.state).toLowerCase().includes(q));
    rows.sort((x, y) => size(y.money) - size(x.money) || y.n - x.n || x.name.localeCompare(y.name));
    const max = rows.reduce((m, r) => Math.max(m, size(r.money)), 0);
    rows.slice(0, all || q ? rows.length : 12).forEach(r => {
      const st = r.s.state, lines = (r.money || {}).lines || 0, btns = [];
      if (lines) { const b = el('button', 'tracker-web', 'See in the Money web'); b.type = 'button'; b.prepend(art('/money-trail/art/money-web-link-blue.webp')); b.addEventListener('click', () => openState(st)); btns.push(b); }
      const i = el('button', 'tracker-inspect', 'Inspect'); i.type = 'button'; i.prepend(art(CABINET));
      i.addEventListener('click', () => { stateFocus = st; renderStates(); inspectState(st); $('#state-focus').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      btns.push(i);
      const card = trackerCard({ name: r.name + ' (' + st + ')', money: r.money, max, source: /^https?:/.test(r.s.source_url || '') ? r.s.source_url : '', sourceLabel: 'State ballot measure list ↗', buttons: btns,
        details: [r.n + (r.n === 1 ? ' statewide ballot measure' : ' statewide ballot measures') + ' in this archive', lines ? lines + (lines === 1 ? ' line' : ' lines') + ' in the web' : 'No lines in the web yet', 'Finance review: ' + (tidy(r.s.finance_review_status) || 'Not reviewed').toLowerCase()] });
      if (st === stateFocus) card.classList.add('on');
      list.append(card);
    });
    if (!rows.length) list.append(el('div', 'empty', 'No state matches. Try fewer letters.'));
    const more = box.querySelector('.state-more');
    more.hidden = !!q || rows.length <= 12; more.textContent = all ? 'Show the 12 largest' : 'Show all ' + rows.length + ' states';
  }
  const baseStates = renderStates;
  renderStates = function () { baseStates(); draw(); };
})();

// ---- The Way additions (Nov 2026): a US map in the state tracker, "Follow the money" links to one-trail pages,
// links to results and ballot guides, and links into this page (?view=, ?hub=, ?state=, ?q=). Text goes in with textContent.
(function () {
  const q = new URLSearchParams(location.search);
  if (['candidate', 'measure', 'bill', 'group', 'contractor', 'agency', 'person'].some(k => q.has(k))) { location.replace('follow.html' + location.search); return; }
  const P = window.TW_MAP_PATHS || {};
  const guide = c => c === 'CO' ? '/guide/' : '/guide-' + c.toLowerCase() + '/';
  const shade = n => n >= 6 ? '#6be3c9' : n >= 3 ? '#3ca7a0' : n >= 1 ? '#2a6f73' : '#173a45';
  function a(label, href) { const l = document.createElement('a'); l.textContent = label; l.href = href; return l; }
  function trailHref(id) {
    const ent = entityById[id];
    if (!ent || !id) return '';
    return 'follow.html?' + (/candidate_named/.test(ent.entity_type || '') ? 'candidate' : 'group') + '=' + encodeURIComponent(id);
  }
  function drawMap() {
    const box = $('#state-map');
    if (!box || !Object.keys(P).length) return;
    box.replaceChildren();
    const svg = svgEl('svg', { viewBox: '0 0 975 610', role: 'group', 'aria-label': 'Map of the 50 states. Brighter states have more ballot records in this archive. Choose a state to see them.' }, box);
    Object.keys(P).forEach(k => {
      const code = k.toUpperCase(); if (!stName[code]) return;
      const n = (byState[code] || []).length, on = code === stateFocus;
      const p = svgEl('path', { d: P[k].d, fill: shade(n), stroke: on ? '#f0ce77' : '#06141e', 'stroke-width': on ? '3' : '0.8', tabindex: '0', role: 'button', class: 'mt-state', 'aria-label': stName[code] + ', ' + n + ' ballot records' }, svg);
      svgEl('title', {}, p).textContent = stName[code] + ': ' + n + ' ballot records';
      const go = () => { stateFocus = code; renderStates(); inspectState(code); $('#state-focus').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
      p.addEventListener('click', go);
      p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    const lg = document.createElement('p'); lg.className = 'mt-legend';
    [['#173a45', 'None yet'], ['#2a6f73', '1 to 2'], ['#3ca7a0', '3 to 5'], ['#6be3c9', '6 or more']].forEach(([c, t]) => {
      const i = document.createElement('i'); i.className = 'mt-key'; i.dataset.c = c; const sp = document.createElement('span'); sp.append(i, document.createTextNode(t)); lg.append(sp);
    });
    box.append(lg);
    lg.querySelectorAll('.mt-key').forEach(i => { i.style.background = i.dataset.c; });
  }
  const baseStates = renderStates;
  renderStates = function () { baseStates(); drawMap(); };
  const baseFocus = renderStateFocus;
  renderStateFocus = function () {
    baseFocus();
    const c = stateFocus, p = document.createElement('p'); p.className = 'mt-links';
    p.append(a(stName[c] + ' election results', '/results/?state=' + c.toLowerCase() + '#tabs'), document.createTextNode(' · '),
      a(stName[c] + ' ballot guide', guide(c)), document.createTextNode(' · '), a('District map', '/map' + (c === 'CO' ? '' : '-' + c.toLowerCase()) + '/'));
    $('#state-focus').prepend(p);
  };
  // Money web links: a measure with lines in the web opens centered on it; a measure with no lines yet opens its state's busiest dot.
  const webNames = new Set();
  [...networkVerified, ...networkContext].forEach(x => { webNames.add(norm(x.from_name)); webNames.add(norm(x.to_name)); });
  function webHref(mid, st, name) {
    if (webNames.has(norm(mid))) return { href: '?view=network&hub=' + encodeURIComponent(mid), label: 'See ' + name + ' on the money web' };
    return { href: '?view=network&state=' + st, label: 'See ' + (stName[st] || st) + '’s money web (no lines for ' + name + ' yet)' };
  }
  const baseDetails = details;
  details = function (e) {
    baseDetails(e);
    if (!e) return;
    const box = document.createElement('div'); box.className = 'mt-follow-box';
    const h = document.createElement('h4'); h.textContent = 'Follow the money'; box.append(h);
    const ul = document.createElement('ul');
    const add = (label, href, art) => { if (!href) return; const li = document.createElement('li'); const l = a(label, href); if (art) { const im = document.createElement('img'); im.src = art; im.alt = ''; im.className = 'mt-link-art'; im.width = 40; im.height = 44; l.prepend(im); li.className = 'mt-link-with-art'; } li.append(l); ul.append(li); };
    if (e.record_kind === 'ballot') {
      add('Open the trail for ' + e.state + ' ' + e.measure_number, 'follow.html?measure=' + encodeURIComponent(e.measure_id), CABINET);
      const w = webHref(e.measure_id, e.state, e.state + ' ' + e.measure_number);
      add(w.label, w.href, 'art/money-web-link-blue.webp');
      add('Money web full screen', w.href + '&full=1');
      add(stName[e.state] + ' election results', '/results/?state=' + e.state.toLowerCase() + '#tabs');
      add(stName[e.state] + ' ballot guide', guide(e.state));
    } else if (e.record_kind === 'entity') {
      add('Open the trail for ' + e.name, trailHref(e.id), CABINET);
      add('Money web full screen', '?view=network&hub=' + encodeURIComponent(e.name) + '&full=1');
    } else {
      const from = e.source_entity_id || e.from_entity_id, to = e.recipient_entity_id || e.to_entity_id;
      add('Follow ' + (e.source_name || e.from_name || 'the giver'), trailHref(from), CABINET);
      add('Follow ' + (e.recipient_name || e.to_name || 'the receiver'), trailHref(to), CABINET);
      const st = stateOf(e); if (stName[st]) add(stName[st] + ' election results', '/results/?state=' + st.toLowerCase() + '#tabs');
    }
    const ftm = e.record_kind === 'ballot' && $('#detail-content .mt-ftm');
    if (ul.children.length) { if (ftm) { ul.className = 'mt-ftm-links'; ftm.append(ul); } else { box.append(ul); $('#detail-content').append(box); } }
  };
  if (q.get('state') && stName[q.get('state').toUpperCase()]) stateFocus = q.get('state').toUpperCase();
  if (q.get('view') === 'network' && !q.get('hub') && stName[(q.get('state') || '').toUpperCase()]) {
    // the busiest dot in that state's part of the web becomes the center
    const st = q.get('state').toUpperCase(), count = new Map();
    [...networkVerified, ...networkContext].forEach(x => { if (stateOf(x) !== st) return; for (const nm of [x.from_name, x.to_name]) if (nm) count.set(nm, (count.get(nm) || 0) + 1); });
    const top = [...count].sort((x, y) => y[1] - x[1])[0];
    if (top) { graphHub = top[0]; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; }
  }
  // D229: a name in the link keeps its own spelling when the web has it (justices and members are not all capitals).
  if (q.get('hub')) { const want = norm(q.get('hub')); graphHub = [...networkVerified, ...networkContext].reduce((f, x) => f || [x.from_name, x.to_name].find(nm => nm && norm(nm) === want), '') || q.get('hub').toUpperCase(); if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; }
  if (q.get('q')) { settings.search = q.get('q'); $('#search').value = settings.search; }
  const vw = q.get('view');
  // The page opens on the Money web. ?view=timeline (or a search, ?q=), states, orgs, people or departments opens that tab.
  if (['timeline', 'states', 'orgs', 'people', 'departments'].includes(vw)) setView(vw); else if (q.get('q') && vw !== 'network') setView('timeline'); else setView('network');
})();

// ---- Full screen web (Nov 2026): the Money network web fills the page by itself (not browser full screen).
// Hovering a dot or line shows a small card (D218: in every view). In full screen on a phone the first tap shows the card and a second tap follows it.
(function () {
  const wrap = $('#graph-wrap'), svg = $('#network-svg'), btn = $('#web-full'), card = $('#web-card'), title = $('#web-full-title');
  if (!wrap || !svg || !btn || !card) return;
  let full = false, lastPointer = 'mouse', armed = null;
  const isFull = () => full;
  function hideCard() { card.hidden = true; card.replaceChildren(); armed = null; svg.querySelectorAll('.mt-hovered').forEach(x => x.classList.remove('mt-hovered')); }
  function line(cls, text) { const d = document.createElement('div'); d.className = cls; d.textContent = text; card.append(d); return d; }
  // D218: a line gets the same card: giver to receiver, amount, kind of record, date, and how many filings join the two dots.
  function fillLineCard(g, touch) {
    const e = g.__e; if (!e) return false;
    card.replaceChildren();
    line('web-card-name', (e.from_name || 'Unknown') + ' to ' + (e.to_name || 'Unknown'));
    const solid = e.tier === 'itemized' || e.tier === 'fec', amt = e.amount_usd;
    line('web-card-status', e.tier === 'fec' ? 'FEC filing' : e.tier === 'itemized' ? 'Itemized filing' : e.tier === 'reported' ? 'Reported figure, not one single payment' : 'Context link, not a payment');
    if (amt != null && amt !== '') line('web-card-row', money_(amt));
    if (e.date) line('web-card-row', (solid ? 'Date: ' : 'Report date: ') + dateText(e.date));
    if (solid && lastNet) {
      const same = lastNet.edges.filter(x => (x.a < x.b ? x.a + '|' + x.b : x.b + '|' + x.a) === g.__pair && (x.e.tier === 'itemized' || x.e.tier === 'fec'));
      if (same.length > 1) line('web-card-row', same.length + ' filings between these two dots: ' + money_(same.reduce((t, x) => t + (num(x.e.amount_usd) || 0), 0)) + ' in all');
    }
    if (e.jurisdiction) line('web-card-faint', e.jurisdiction);
    line('web-card-hint', (touch ? 'Tap the line again' : 'Click') + ': ' + (solid ? 'opens this filing' : 'opens this record') + ' in the Evidence inspector.');
    card.hidden = false;
    return true;
  }
  function fillCard(g, touch) {
    if (g.__e) return fillLineCard(g, touch);
    const n = g.__n; if (!n) return false;
    card.replaceChildren();
    const mb = ballotById[n.name];
    line('web-card-name', mb ? measureName(mb) : n.name);
    if (mb) {
      line('web-card-sub', mb.short_title);
      const mo = measureOutcome[n.name];
      if (mo) line('web-card-status ' + mo.status, mo.status === 'passed' ? '✓ Passed' : mo.status === 'failed' ? '✗ Failed' : 'Not yet called');
    }
    line('web-card-row', n.count + (n.count === 1 ? ' connection' : ' connections') + ' in this web');
    if (n.itemized > 0) line('web-card-row', money_(n.itemized) + ' in itemized filings on these lines');
    if (n.jur) line('web-card-faint', n.jur);
    if (!/reported[-_]name/.test(n.id)) line('web-card-faint', 'ID ' + n.id);
    let hint = g.__root ? 'This is the center of the web.' : mb ? 'opens this measure and its money' : 'puts this dot in the center';
    if (!g.__root) hint = (touch ? 'Tap the dot again: ' : 'Click: ') + hint + '.';
    line('web-card-hint', hint);
    card.hidden = false;
    return true;
  }
  function place(x, y) {
    if (window.innerWidth <= 760) { card.style.left = ''; card.style.top = ''; return; }
    const w = card.offsetWidth, h = card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let L = x + 16, T = y + 16;
    if (L + w > vw - 10) L = x - w - 16;
    if (T + h > vh - 10) T = y - h - 16;
    card.style.left = Math.max(10, L) + 'px'; card.style.top = Math.max(10, T) + 'px';
  }
  function stripTitles() {
    // The browser's own tooltip would sit on top of the card, so it moves to aria-label.
    svg.querySelectorAll('.graph-node, .graph-edge').forEach(g => { const t = g.querySelector(':scope > title'); if (t) { g.setAttribute('aria-label', t.textContent.replace(/\n/g, ', ')); t.remove(); } });
  }
  function setFull(on) {
    full = on;
    document.body.classList.toggle('mt-webfull', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Close full screen ✕' : 'Full screen';
    hideCard();
    renderGraph();
    if (on) { wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; wrap.scrollTop = (wrap.scrollHeight - wrap.clientHeight) / 2; btn.focus(); }
    else { $('#detail-panel').classList.remove('open'); btn.focus(); }
  }
  const baseRender = renderGraph;
  renderGraph = function () {
    baseRender();
    hideCard();
    stripTitles();
    if (!full) return;
    if (title) title.textContent = hubLabel(graphHub);
  };
  const basePick = pick;
  pick = function (e) { basePick(e); if (full) $('#detail-panel').classList.add('open'); };
  btn.addEventListener('click', () => setFull(!full));
  if (new URLSearchParams(location.search).get('full') === '1' && !$('#network-view').hidden) setFull(true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !full) return;
    if ($('#detail-panel').classList.contains('open')) { $('#detail-panel').classList.remove('open'); return; }
    setFull(false);
  });
  svg.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; }, true);
  // D218: the dot, or the visible line under its wide see-through hit line.
  const hoverEl = t => t && t.closest ? (t.closest('.graph-node') || (t.closest('.graph-edge-hit') || {}).__vis || null) : null;
  // D218: with a mouse, the card shows on hover in the normal view too, not only in full screen.
  svg.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const g = hoverEl(e.target);
    if (g && fillCard(g, false)) { svg.querySelectorAll('.mt-hovered').forEach(x => x.classList.remove('mt-hovered')); g.classList.add('mt-hovered'); place(e.clientX, e.clientY); }
  });
  svg.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' && !card.hidden) place(e.clientX, e.clientY); });
  svg.addEventListener('pointerout', e => {
    if (e.pointerType === 'touch') return;
    const g = hoverEl(e.target);
    if (g && !(e.relatedTarget && g.contains(e.relatedTarget))) hideCard();
  });
  // Touch: the first tap on a dot or line only shows its card. Tapping the same one again does what a click does.
  svg.addEventListener('click', e => {
    if (!isFull()) return;
    const g = hoverEl(e.target);
    if (lastPointer !== 'touch') { hideCard(); return; }
    if (!g) { hideCard(); return; }
    if (armed === g && !g.__root) { hideCard(); return; }
    e.stopPropagation();
    if (fillCard(g, true)) { armed = g; const r = g.getBoundingClientRect(); place(r.right, r.bottom); }
  }, true);
})();

// ---- D199 (Nov 2026): "Filter the evidence" and the Evidence inspector can be hidden so the web gets the width.
// The inspector comes back by itself when something is picked. The choice is remembered on this device only.
(function () {
  const wb = $('#workbench'), bf = $('#toggle-filter'), bi = $('#toggle-inspector'), content = $('#detail-content');
  if (!wb || !bf || !bi) return;
  const KEY = 'tw-mt-hidden-panels';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ f: wb.classList.contains('no-filter'), i: wb.classList.contains('no-inspector') })); } catch (e) {} };
  function set(cls, btn, hide, word) {
    wb.classList.toggle(cls, hide);
    btn.textContent = (hide ? 'Show ' : 'Hide ') + word;
    btn.setAttribute('aria-pressed', hide ? 'true' : 'false');
    if (view === 'network') renderGraph();
  }
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (s.f) set('no-filter', bf, true, 'filters'); if (s.i) set('no-inspector', bi, true, 'inspector'); } catch (e) {}
  bf.addEventListener('click', () => { set('no-filter', bf, !wb.classList.contains('no-filter'), 'filters'); save(); });
  bi.addEventListener('click', () => { set('no-inspector', bi, !wb.classList.contains('no-inspector'), 'inspector'); save(); });
  // Anything new in the inspector (a dot, a line, a row, a state) brings it back.
  if (content) new MutationObserver(() => { if (wb.classList.contains('no-inspector')) { set('no-inspector', bi, false, 'inspector'); save(); } }).observe(content, { childList: true });
})();

// ---- D200 (Nov 2026): FEC filing records from fec-data.js. The footer says how many and when they were pulled.
(function () {
  const f = RESEARCH.meta.fec, el = document.getElementById('fec-note');
  if (!f || !el) return;
  el.textContent = f.records + ' more records come straight from FEC filings of ' + f.committees + ' committees (' + (RESEARCH.meta.fec_committees || []).join(', ') + '), pulled from the FEC public data on ' + dateText(f.updated) + '. Each one links to its filing. Individuals are not included.';
})();

// D218 (Nov 2026): hovering no longer changes the Evidence inspector (D212, D217 removed). The hover card below does that job; the inspector changes only on a click.

// ---- D215 (Nov 2026): the Money Web list can be sorted (largest first, A to Z, Z to A, most connections),
// a search box finds any name in the web, and the web opens on the largest one in the list.
// "Largest" = money promised under a law (laws.js), else the itemized filings on its lines, else its largest reported figure.
// Reported figures are never added up.
(function () {
  const sel = $('#hub'), sortSel = $('#hub-sort'), box = $('#web-search'), list = $('#web-search-results');
  if (!sel) return;
  const info = new Map();
  const get = nm => { const k = norm(nm); let t = info.get(k); if (!t) info.set(k, t = { name: nm, item: 0, links: 0, repMax: 0, types: new Set(), flags: new Set() }); return t; };
  [...networkVerified, ...networkContext].forEach(e => {
    const amt = num(e.amount_usd) || 0, solid = e.tier === 'itemized' || e.tier === 'fec';
    for (const [nm, id, side] of [[e.from_name, e.from_entity_id, 'from'], [e.to_name, e.to_entity_id, 'to']]) {
      if (!nm) continue; const t = get(nm); t.links++; if (solid) t.item += amt; else if (e.tier === 'reported') t.repMax = Math.max(t.repMax, amt);
      const ent = id && entityById[id]; if (ent && ent.entity_type) t.types.add(String(ent.entity_type));
      // D219: lines built from the laws (budgets-view.js) say which end is an agency and which is a recipient.
      if (side === 'to' && /^(LAW-.*-AG-|BUDGET-FY)/.test(e.id || '')) t.flags.add('agency');
      if (side === 'to' && /^LAW-.*-RC-/.test(e.id || '')) t.flags.add('recipient');
      if (side === 'from' && e.edge_type === 'vote_nonfinancial_context') t.flags.add('congress');
      if (side === 'from' && /^LAW-.*-(MV|MS|SP|CS)-/.test(e.id || '')) t.flags.add('member'); // D226
      // D229: justices, the Court and the presidents who nominated them. The Senate end of a confirmation stays with Congress.
      if (/^SCOTUS-/.test(e.id || '')) t.flags.add(e.edge_type === 'confirmation_vote_nonfinancial' && side === 'from' ? 'congress' : 'court');
    }
  });
  (RESEARCH.entities || []).forEach(x => { if (x.entity_type === 'federal agency') { const t = info.get(norm(x.legal_or_reported_name)); if (t) t.flags.add('agency'); } });

  // ---- D219 (Nov 2026): a "Kind" list next to the center list. Picking a kind lists every name of that kind in the web.
  // Kinds come from the entity types already in the data (and from the law lines). A name with no entity record is sorted
  // by plain words in its name, and anything still unclear goes to "Other names", never guessed into a kind.
  const KINDS = [
    ['budget', 'The federal budget'],
    ['law', 'Federal laws'],
    ['agency', 'Federal departments and agencies'],
    ['recipient', 'Recipients of federal law money'],
    ['congress', 'Congress (votes on the laws)'],
    ['member', 'Members of Congress (votes and sponsors)'],
    ['court', 'Supreme Court (justices and who chose them)'],
    ['measure', 'Ballot measures'],
    ['party', 'Party committees'],
    ['candidate', 'Candidates and candidate committees'],
    ['pac', 'PACs and Super PACs'],
    ['ballotcmte', 'Ballot measure committees'],
    ['union', 'Unions and teacher groups'],
    ['person', 'People named in filings'],
    ['payee', 'Payees and vendors'],
    ['donor', 'Donors not yet matched to a legal ID'],
    ['gov', 'State and local government offices'],
    ['other', 'Other names']
  ];
  const typeKind = ty => /party/i.test(ty) ? 'party' : /candidate/i.test(ty) ? 'candidate' : /ballot measure$/i.test(ty) ? 'measure'
    : /ballot (support |opposition )?committee|issue committee|referendum committee|ballot_group|campaign committee/i.test(ty) ? 'ballotcmte'
    : /labor|education association|NEA/i.test(ty) ? 'union' : /\bPAC\b|political action|political committee|Committee \(FEC\)|hybrid|super pac/i.test(ty) ? 'pac'
    : /payee|vendor/i.test(ty) ? 'payee' : /municipal|public body|election authority/i.test(ty) ? 'gov'
    : /donor|contributor|electioneering/i.test(ty) ? 'donor' : '';
  const nameKind = nm => /^(YES|NO)\b|\b(YES|NO) ON\b|\bVOTE (YES|NO)\b/i.test(nm) ? 'ballotcmte' : /\bPARTY\b|\bDCCC\b|\bDSCC\b|\bNRCC\b|\bNRSC\b|DEMOCRATIC NATIONAL|REPUBLICAN NATIONAL/i.test(nm) ? 'party'
    : /\bSEIU\b|\bAFL-CIO\b|\bUNION\b|TEACHERS ASSOC|EDUCATION ASSOC|\bAFSCME\b|\bTEAMSTERS\b/i.test(nm) ? 'union' : /\bPAC\b|SUPER PAC|ACTION FUND|VICTORY FUND|MAJORITY FUND/i.test(nm) ? 'pac' : '';
  // Same person rule as the Person tracker (D198): "LAST, FIRST" with no organization word, or a candidate named in a summary.
  const ORG_WORD2 = /\b(INC|LLC|PAC|FUND|COMMITTEE|COMM|ASSOC|ASSOCIATION|UNION|COUNCIL|PARTY|CAUCUS|CHURCH|PROJECT|FOUNDATION|TRUST|CAMPAIGN|NETWORK|ACTION|LEAGUE|COALITION|CORP|CORPORATION|SOCIETY|CENTER|ALLIANCE|COLORADO|AMERICA|LOCAL)\b/i;
  const looksPerson2 = n => { const p = String(n).split(','); return p.length === 2 && !ORG_WORD2.test(n) && p.every(x => { const w = x.trim().split(/\s+/); return w[0] && w.length <= 3; }); };
  const kindOf = nm => {
    const up = String(nm).toUpperCase();
    if (budgetOf(nm)) return 'budget';
    if (lawOf(up)) return 'law';
    if (ballotById[nm]) return 'measure';
    const t = info.get(norm(nm)); if (!t) return 'other';
    for (const f of ['agency', 'congress', 'member', 'court', 'recipient']) if (t.flags.has(f)) return f;
    const order = KINDS.map(k => k[0]); let best = '';
    for (const ty of t.types) { const k = typeKind(ty); if (k && (!best || order.indexOf(k) < order.indexOf(best))) best = k; }
    if ([...t.types].some(ty => /candidate_named/i.test(ty)) || looksPerson2(nm)) return 'person';
    // "Donor" and "payee" only say how a name showed up on a filing, so plain words in the name (YES ON, SEIU, PAC) win over them.
    if (!best || best === 'donor' || best === 'payee') return nameKind(up) || best || 'other';
    return best;
  };
  let kind = 'all';
  const kindNames = k => { const out = []; for (const t of info.values()) if (kindOf(t.name) === k) out.push(t.name); if (k === 'law') ((window.TW_LAWS || {}).laws || []).forEach(l => { const nm = String(l.name || l.bill || '').toUpperCase(); if (lawOf(nm) && !out.some(x => x.toUpperCase() === nm)) out.push(nm); }); return out; };
  const kindSel = $('#hub-kind');
  if (kindSel) {
    const counts = {}; for (const t of info.values()) { const k = kindOf(t.name); counts[k] = (counts[k] || 0) + 1; }
    counts.law = kindNames('law').length;
    kindSel.replaceChildren(...[['all', 'Main list']].concat(KINDS.filter(([k]) => counts[k]).map(([k, l]) => [k, l + ' (' + counts[k] + ')'])).map(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; }));
  }
  const sizeOf = nm => { const law = lawOf(String(nm).toUpperCase()); if (law) return { v: law.total, how: 'promised' }; const bud = budgetOf(nm); if (bud) return { v: bud.total, how: 'spent' }; const t = info.get(norm(nm)) || {}; if (t.item > 0) return { v: t.item, how: 'in filings' }; if (t.repMax > 0) return { v: t.repMax, how: 'reported' }; return { v: 0, how: '' }; };
  const linksOf = nm => (info.get(norm(nm)) || {}).links || 0;
  const sizeText = nm => { const z = sizeOf(nm); return z.v > 0 ? webMoney(z.v) + ' ' + z.how : 'no dollar lines'; };
  let order = 'size';
  const sorted = () => {
    const a = kind === 'all' ? hubs.slice() : kindNames(kind);
    if (order === 'az') a.sort((x, y) => hubLabel(x).localeCompare(hubLabel(y)));
    else if (order === 'za') a.sort((x, y) => hubLabel(y).localeCompare(hubLabel(x)));
    else if (order === 'links') a.sort((x, y) => linksOf(y) - linksOf(x) || hubLabel(x).localeCompare(hubLabel(y)));
    else a.sort((x, y) => sizeOf(y).v - sizeOf(x).v || hubLabel(x).localeCompare(hubLabel(y)));
    return a;
  };
  // The list is rebuilt the same way everywhere, and keeps showing the dot in the center.
  prepareHubRefresh = function () {
    // D220: with filters on, the list keeps only names that still have a line that passes them.
    let list = sorted();
    if (filtersOn()) { const fl = filteredLineCounts(); list = list.filter(x => (fl.get(norm(x)) || 0) > 0); }
    const opt = x => { const o = document.createElement('option'); o.value = x; o.textContent = hubLabel(x) + ' · ' + (order === 'links' ? linksOf(x) + ' connections' : sizeText(x)); return o; };
    if (kind === 'all' && !hubs.includes(graphHub)) { hubs.push(graphHub); return prepareHubRefresh(); }
    // A center from another kind (a dot clicked in the web) stays on top of the list so it is still shown.
    if (!list.includes(graphHub)) list.unshift(graphHub);
    sel.replaceChildren(...list.map(opt));
    sel.value = graphHub;
  };
  function go(name) {
    graphHub = name; if (!hubs.includes(name)) hubs.push(name);
    prepareHubRefresh(); graphScale = 1;
    if ($('#network-view').hidden) setView('network'); else renderGraph();
  }
  if (sortSel) sortSel.addEventListener('change', () => { order = sortSel.value; prepareHubRefresh(); });
  // D220: the center list follows the Filter the evidence panel.
  ['#state', '#kind', '#minimum', '#show-reported'].forEach(id => { const c = $(id); if (c) c.addEventListener('change', () => prepareHubRefresh()); });
  { const c = $('#search'); if (c) c.addEventListener('input', () => prepareHubRefresh()); }
  { const c = $('#clear-filters'); if (c) c.addEventListener('click', () => prepareHubRefresh()); }
  // D219: picking a kind fills the center list with that kind and puts the first one (by the chosen sort) in the center.
  if (kindSel) kindSel.addEventListener('change', () => { kind = kindSel.value; const first = sorted()[0]; if (first && kind !== 'all') go(first); else prepareHubRefresh(); });

  // Search: any name with a line in the web. Words can be in any order. Best matches first, then the largest.
  if (box && list) {
    const names = [...info.values()].map(t => t.name);
    let hits = [], active = -1;
    const close = () => { list.hidden = true; list.replaceChildren(); hits = []; active = -1; box.setAttribute('aria-expanded', 'false'); };
    const show = () => {
      const q = box.value.trim().toUpperCase(), words = q.split(/\s+/).filter(Boolean);
      if (q.length < 2) return close();
      hits = names.map(nm => ({ nm, lab: hubLabel(nm).toUpperCase() }))
        .filter(x => words.every(w => x.lab.includes(w) || x.nm.toUpperCase().includes(w)))
        .sort((a, b) => (b.lab.startsWith(q) - a.lab.startsWith(q)) || (sizeOf(b.nm).v - sizeOf(a.nm).v) || a.lab.localeCompare(b.lab))
        .slice(0, 8).map(x => x.nm);
      list.replaceChildren();
      if (!hits.length) { const d = document.createElement('div'); d.className = 'mt-web-none'; d.textContent = 'No name in the web matches.'; list.append(d); }
      hits.forEach((nm, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mt-web-hit'; b.id = 'web-hit-' + i; b.setAttribute('role', 'option');
        const n1 = document.createElement('span'); n1.className = 'mt-web-hit-name'; n1.textContent = hubLabel(nm);
        const n2 = document.createElement('span'); n2.className = 'mt-web-hit-size'; n2.textContent = sizeText(nm) + ' · ' + linksOf(nm) + (linksOf(nm) === 1 ? ' connection' : ' connections');
        b.append(n1, n2);
        b.addEventListener('click', () => { go(nm); box.value = ''; close(); });
        list.append(b);
      });
      active = -1; list.hidden = false; box.setAttribute('aria-expanded', 'true');
    };
    const mark = () => list.querySelectorAll('.mt-web-hit').forEach((b, i) => { b.classList.toggle('active', i === active); if (i === active) box.setAttribute('aria-activedescendant', b.id); });
    box.addEventListener('input', show);
    box.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); active = (active + 1) % hits.length; mark(); }
      else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); active = (active - 1 + hits.length) % hits.length; mark(); }
      else if (e.key === 'Enter' && hits.length) { e.preventDefault(); go(hits[Math.max(active, 0)]); box.value = ''; close(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest || !e.target.closest('.mt-web-search')) close(); });
  }

  // Open on the largest name in the list, unless the address asks for a hub (?hub=) or a state's web (?view=network&state=).
  const q = new URLSearchParams(location.search);
  const start = () => {
    if (!q.get('hub') && !(q.get('view') === 'network' && q.get('state'))) {
      // The laws followed on this page join the list later (budgets-view.js), so they are counted here too.
      ((window.TW_LAWS || {}).laws || []).forEach(l => { const nm = String(l.name || l.bill || '').toUpperCase(); if (nm && lawOf(nm) && !hubs.includes(nm)) hubs.push(nm); });
      const top = hubs.slice().sort((x, y) => sizeOf(y).v - sizeOf(x).v)[0];
      if (top && top !== graphHub) { graphHub = top; graphScale = 1; prepareHubRefresh(); if (!$('#network-view').hidden) renderGraph(); return; }
    }
    prepareHubRefresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// ---- D224 (Nov 2026): the browser Back button steps back through the Money web instead of leaving the page.
// Each new center, full screen on or off, and each tab change adds a step to the browser history (with a matching address,
// so a step can be shared or reloaded). Back restores the step before it. Steps the page takes by itself while it loads
// replace the first step instead of adding new ones.
(function () {
  if (!window.history || !history.pushState) return;
  const fullBtn = $('#web-full');
  const isFull = () => document.body.classList.contains('mt-webfull');
  const now = () => ({ mt: 1, view, hub: view === 'network' ? graphHub : '', full: view === 'network' && isFull() });
  const same = (a, b) => a && b && a.view === b.view && a.hub === b.hub && a.full === b.full;
  function urlOf(s) {
    const u = new URLSearchParams(location.search);
    ['view', 'hub', 'full'].forEach(k => u.delete(k));
    u.set('view', s.view);
    if (s.hub) u.set('hub', s.hub);
    if (s.full) u.set('full', '1');
    return location.pathname + '?' + u.toString() + location.hash;
  }
  let user = false, restoring = false;
  const arm = () => { user = true; };
  document.addEventListener('pointerdown', arm, true);
  document.addEventListener('keydown', arm, true);
  document.addEventListener('change', arm, true);
  document.addEventListener('click', arm, true);
  function record() {
    if (restoring) return;
    const s = now(), cur = history.state;
    if (same(s, cur)) return;
    if (user && cur && cur.mt) history.pushState(s, '', urlOf(s)); else history.replaceState(s, '', urlOf(s));
  }
  const baseRender = renderGraph;
  renderGraph = function () { baseRender.apply(this, arguments); record(); };
  const baseView = setView;
  setView = function (v) { baseView(v); record(); };
  if (fullBtn) fullBtn.addEventListener('click', () => setTimeout(record, 0));
  window.addEventListener('popstate', e => {
    const s = e.state; if (!s || !s.mt) return;
    restoring = true;
    try {
      if (s.view === 'network' && s.hub && s.hub !== graphHub) {
        graphHub = s.hub; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); }
        $('#hub').value = graphHub; graphScale = 1;
      }
      if (view !== s.view) setView(s.view); else if (s.view === 'network') renderGraph();
      if (fullBtn && s.view === 'network' && isFull() !== !!s.full) fullBtn.click();
      if (s.view !== 'network' && isFull() && fullBtn) fullBtn.click();
    } finally { restoring = false; }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(record, 0)); else setTimeout(record, 0);
})();

// D231: "Hide numbers" next to zoom and full screen takes the dollar numbers off the lines and the dots, so only the
// names are left. The center dot keeps its total. The choice is remembered on this device. Hover cards still show the numbers.
(function () {
  const btn = $('#web-nums'), wrap = $('#graph-wrap');
  if (!btn || !wrap) return;
  const KEY = 'mt-web-numbers';
  function set(hide, save) {
    wrap.classList.toggle('mt-nonums', hide);
    btn.textContent = hide ? 'Show numbers' : 'Hide numbers';
    btn.setAttribute('aria-pressed', hide ? 'true' : 'false');
    if (save) { try { localStorage.setItem(KEY, hide ? 'off' : 'on'); } catch (e) { /* private window: not remembered */ } }
  }
  let start = false;
  try { start = localStorage.getItem(KEY) === 'off'; } catch (e) { start = false; }
  set(start, false);
  btn.addEventListener('click', () => set(!wrap.classList.contains('mt-nonums'), true));
})();
