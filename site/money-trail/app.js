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
let view='timeline',selected=null,visible=30,graphHub='GOPAC ELECTION FUND',stateFocus='CO',graphScale=1;
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
function kindLabel(e){return e.record_kind==='entity'?'Organization in the money web':e.record_kind==='transaction'?(e.evidence_tier==='fec_filing'?'FEC filing record':'Itemized finance record'):e.record_kind==='ballot'?'Statewide ballot event':e.record_kind==='reported'?'Reported disclosure · NOT a unique transfer':'Research graph connection · mixed evidence'}
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
function sourceButton(url,label='Open original filing / source'){url=safeUrl(url);return url?`<a class="detail-link" href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)} ↗</a>`:''}
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
 h+=datum('Name as reported',e.name)+datum('Entity type',e.entity_type)+datum('Registry ID',e.id)+datum('Jurisdiction',e.jurisdiction)+sourceButton(e.source_url,'Open registry record');
 h+=`<div class="detail-caution">This is one dot in the money web. Click a line to see one connection and its filing.</div>`+datum('Notes',e.notes);
 }else{
 h+=datum('Connection type',e.edge_type)+datum('From (as reported)',e.from_name)+datum('To (as reported)',e.to_name)+datum('Amount or aggregate figure',e.amount_usd!=null?money(e.amount_usd):'Not a money link')+datum('Date',dateText(e.date))+datum('Date semantics',e.date_kind)+datum('Jurisdiction',e.jurisdiction)+datum('Confidence',e.confidence)+sourceButton(e.source_url,'Open source evidence');
 h+=`<div class="detail-caution">Graph observations can duplicate itemized ledger records or be nonfinancial. Never sum graph edges as additional transactions.</div>`+datum('Notes',e.notes||e.note);
 }
 $('#detail-content').innerHTML=h;
 const bt=$('#to-graph');if(bt)bt.addEventListener('click',()=>{graphHub=e.source_name;setView('network');$('#hub').value=graphHub;renderGraph()});
}
function pick(e){selected=e;details(e);if(view==='timeline')renderTimeline();if(window.innerWidth<=1250)$('#detail-panel').classList.add('open')}
function setView(v){view=v;$$('[data-view]').forEach(b=>{const active=b.dataset.view===v;b.classList.toggle('active',active);b.setAttribute('aria-selected',active)});$('#timeline-view').hidden=v!=='timeline';$('#network-view').hidden=v!=='network';$('#states-view').hidden=v!=='states';$('#feed-title').textContent=v==='timeline'?'The chronological trail':v==='network'?'Connected money & institutions':'The 50-state tracker';$('#feed-tools').hidden=v!=='timeline';
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
function makeNetwork(){let edges=settings.includeContext?[...networkVerified,...networkContext]:networkVerified;
 let f=norm(graphHub);
 // Include only edges directly touching the selected hub, without assuming the same legal entity across jurisdictions.
 edges=edges.filter(e=>norm(e.from_name)===f||norm(e.to_name)===f);
 if(settings.state!=='ALL')edges=edges.filter(e=>String(e.jurisdiction||'').includes(settings.state)||String(e.notes||'').includes(settings.state+' ')||stateOf(e)===settings.state);
 const solid=e=>e.tier==='itemized'||e.tier==='fec'?1:0;edges.sort((a,b)=>solid(a)===solid(b)?(num(b.amount_usd)-num(a.amount_usd)):(solid(b)-solid(a)));
 let shown=edges.slice(0,85),nodes=new Map(),display=[];
 for(let e of shown){let a=nodeKey(e.from_name,e.from_entity_id,e.jurisdiction),b=nodeKey(e.to_name,e.to_entity_id,e.jurisdiction);
 for(const [id,name] of [[a,e.from_name],[b,e.to_name]])if(!nodes.has(id))nodes.set(id,{id,name:name||id,jur:e.jurisdiction||'',amount:0,count:0,central:norm(name)===f});
 nodes.get(a).count++;nodes.get(b).count++;
 nodes.get(a).amount+=num(e.amount_usd)||0;nodes.get(b).amount+=num(e.amount_usd)||0;if(e.tier==='itemized'||e.tier==='fec'){nodes.get(a).itemized=(nodes.get(a).itemized||0)+(num(e.amount_usd)||0);nodes.get(b).itemized=(nodes.get(b).itemized||0)+(num(e.amount_usd)||0)}
 display.push({a,b,e});}
 return {edges:display,nodes:[...nodes.values()],total:edges.length};}
const NS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs,parent){let x=document.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([k,v])=>x.setAttribute(k,v));if(parent)parent.appendChild(x);return x}
function renderGraph(){const svg=$('#network-svg');svg.replaceChildren();const net=makeNetwork();const names=new Map(net.nodes.map(n=>[n.id,n]));let roots=net.nodes.filter(n=>n.central).sort((a,b)=>b.count-a.count),root=roots[0];
 const meta=`${net.total} eligible connections · ${net.edges.length} drawn (limit 85) · ${roots.length} separate ID nodes sharing hub name`;$('#graph-count').textContent=meta+' · Connections may refer to different legal entities with identical reported names.';
 if(!root||!net.edges.length){$('#network-desc').textContent='No connections match this hub and state filter. Clear the state filter or choose another hub.';svgEl('text',{x:560,y:320,'text-anchor':'middle',fill:'#a5c2c8'},svg).textContent='No documented connections in the selected filter';return;}
 $('#network-desc').textContent=`Showing ${net.edges.length} connections adjacent to ${hubLabel(graphHub)}. Click a line to inspect its filing or a node to explore its neighbors.`;
 const cx=560,cy=312,pos={};pos[root.id]={x:cx,y:cy};const other=net.nodes.filter(n=>n.id!==root.id).sort((a,b)=>b.count-a.count||b.amount-a.amount),total=other.length;
 other.forEach((n,i)=>{const inner=i<Math.min(16,total);const sameName=n.central;const radius=sameName?68:inner?200:290;const idx=sameName?i:(inner?i: i-16);const span=sameName?Math.max(roots.length-1,1):inner?Math.min(16,total):Math.max(total-16,1);let angle=2*Math.PI*(idx/Math.max(span,1))-.5*Math.PI;pos[n.id]={x:cx+Math.cos(angle)*radius+(i%2?2:-2),y:cy+Math.sin(angle)*radius*.86};});
 let pan=svgEl('g',{transform:`translate(${cx*(1-graphScale)} ${cy*(1-graphScale)}) scale(${graphScale})`},svg);
 for(let {a,b,e} of net.edges){let A=pos[a],B=pos[b];if(!A||!B)continue;let tier=e.tier;let line=svgEl('line',{x1:A.x,y1:A.y,x2:B.x,y2:B.y,stroke:tier==='itemized'?'#57c2ad':tier==='fec'?'#b9a7f2':tier==='reported'?'#ad946c':'#659eb3','stroke-width':tier==='itemized'||tier==='fec'?'1.8':'1.3','stroke-dasharray':tier==='itemized'||tier==='fec'?'none':tier==='reported'?'7 5':'2 5',class:'graph-edge',opacity:'.7'},pan);svgEl('title',{},line).textContent=`${e.from_name} → ${e.to_name}\n${e.amount_usd!=null?money(e.amount_usd):'Non-financial'}\n${e.edge_type}`;line.addEventListener('click',()=>pick(e.record_ref||e));}
 for(let n of net.nodes){let P=pos[n.id],isRoot=n.id===root.id;let group=svgEl('g',{class:'graph-node'},pan);group.__n=n;group.__root=isRoot;let circ=svgEl('circle',{cx:P.x,cy:P.y,r:isRoot?'24':n.central?'11':ballotById[n.name]?'13':Math.max(6,Math.min(14,7+n.count/4)),fill:(ballotById[n.name]&&outcomeColor(n.name))||(isRoot?'#6be3c9':n.central?'#c4b18a':'#4c9ba5')},group);if(ballotById[n.name]&&outcomeColor(n.name))circ.setAttribute('stroke','#ffffff'),circ.setAttribute('stroke-width','3');svgEl('title',{},group).textContent=`${n.name}\n${n.id}\n${n.count} connections`;
 if(isRoot||n.count>=2||other.indexOf(n)<17){let text=svgEl('text',{x:P.x,y:P.y+(isRoot?42:24),'text-anchor':'middle'},group);const mb=ballotById[n.name];let label=mb?mb.state+' '+measureName(mb).slice((stName[mb.state]||mb.state).length+1):n.name;label=label.length>24?label.slice(0,22)+'…':label;text.textContent=label;
 if(mb){let sub=svgEl('text',{x:P.x,y:P.y+(isRoot?60:40),'text-anchor':'middle',class:'graph-sub'},group);sub.textContent=mb.short_title.length>34?mb.short_title.slice(0,32)+'…':mb.short_title;const mo=measureOutcome[n.name];if(mo){let st=svgEl('text',{x:P.x,y:P.y+(isRoot?84:62),'text-anchor':'middle',class:'graph-status '+mo.status},group);st.textContent=mo.status==='passed'?'✓ PASSED':mo.status==='failed'?'✗ FAILED':'Not yet called';}}}
 group.addEventListener('click',()=>{const mb=ballotById[n.name];if(mb){pick({...mb});if(n.name!==graphHub){graphHub=n.name;if(!hubs.includes(graphHub)){hubs.push(graphHub);prepareHubRefresh()}$('#hub').value=graphHub;graphScale=1;renderGraph()}return;}
 if(n.name===graphHub){const ent=entityById[n.id];if(ent){pick({record_kind:'entity',name:ent.legal_or_reported_name,entity_type:tidy(ent.entity_type),source_url:ent.source_url,notes:ent.notes,jurisdiction:ent.jurisdiction,id:ent.entity_id})}return;}
 graphHub=n.name;if(!hubs.includes(graphHub)){hubs.push(graphHub);prepareHubRefresh()}$('#hub').value=graphHub;graphScale=1;renderGraph()});}
}
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
$('#show-reported').addEventListener('change',e=>{settings.showReported=e.target.checked;visible=30;renderTimeline()});
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
    if (/municipal_public_body|election authority|federal agency/i.test(t)) return 'departments';
    if (/candidate_named/i.test(t) || looksPerson(e.legal_or_reported_name)) return 'people';
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
  Object.values(lists).forEach(a => a.sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)));
  const TEXT = {
    orgs: { title: 'The organization tracker', sub: n => n + ' organizations named in this data', lead: 'Every committee, company, union, church and other group named in this archive. Names are as reported; two rows with the same name are not proven to be the same legal group. Groups with more lines in the Money web are listed first.' },
    people: { title: 'The person tracker', sub: n => n + ' people named in this data', lead: 'People named in this archive: candidates named in spending summaries, and donors that filings list by a person’s name (last, first). Names are as reported and the person’s identity is not verified. Being listed does not imply wrongdoing.' },
    departments: { title: 'The department tracker', sub: n => n + ' government departments and agencies in this data', lead: 'Government departments, agencies and public bodies named in this archive. Department budgets are not in this data yet, so this list is short. It shows only the agencies our records already name.' }
  };
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const query = { orgs: '', people: '', departments: '' };
  function openWeb(name) { graphHub = name; if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; graphScale = 1; setView('network'); $('.center-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function render(k) {
    const box = $('#' + k + '-view'); if (!box) return;
    let area = box.querySelector('.tracker-area');
    if (!area) {
      area = el('div', 'tracker-area'); box.append(area);
      area.append(el('p', 'state-lead', TEXT[k].lead));
      const lab = el('label', 'tracker-search'); const sp = el('span', null, 'Find a name'); const inp = el('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.placeholder = 'Type part of a name…';
      inp.addEventListener('input', () => { query[k] = inp.value; draw(k); }); lab.append(sp, inp); area.append(lab, el('div', 'tracker-list'));
    }
    draw(k);
  }
  function draw(k) {
    const list = $('#' + k + '-view .tracker-list'); list.replaceChildren();
    const q = norm(query[k]); const rows = lists[k].filter(r => !q || norm(r.name).includes(q));
    rows.forEach(r => {
      const card = el('div', 'tracker-row');
      const info = el('div', 'tracker-info'); info.append(el('strong', null, r.name), el('small', null, [r.type, r.jur].filter(Boolean).join(' · ')));
      const cnt = el('div', 'tracker-count' + (r.count ? '' : ' none'), r.count ? r.count + (r.count === 1 ? ' line' : ' lines') + ' in the web' : 'No lines in the web yet');
      const act = el('div', 'tracker-actions');
      if (r.count) { const b = el('button', 'tracker-web', 'See in the Money web'); b.addEventListener('click', () => openWeb(r.name)); act.append(b); }
      if (r.trail) { const a = el('a', 'tracker-web', 'Follow this trail →'); a.href = r.trail; act.append(a); }
      if (r.entity) { const b = el('button', 'tracker-inspect', 'Inspect'); b.addEventListener('click', () => pick(r.entity)); act.append(b); }
      card.append(info, cnt, act); list.append(card);
    });
    if (!rows.length) list.append(el('div', 'empty', 'No names match. Try fewer letters.'));
    $('#feed-sub').textContent = TEXT[k].sub(lists[k].length);
  }
  const baseSetView = setView;
  setView = function (v) {
    baseSetView(v);
    for (const k of Object.keys(lists)) { const box = $('#' + k + '-view'); if (box) box.hidden = v !== k; }
    if (lists[v]) { $('#feed-title').textContent = TEXT[v].title; render(v); }
  };
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
      add('Open the trail for ' + e.state + ' ' + e.measure_number, 'follow.html?measure=' + encodeURIComponent(e.measure_id));
      const w = webHref(e.measure_id, e.state, e.state + ' ' + e.measure_number);
      add(w.label, w.href, 'art/money-web-link.webp');
      add('Money web full screen', w.href + '&full=1');
      add(stName[e.state] + ' election results', '/results/?state=' + e.state.toLowerCase() + '#tabs');
      add(stName[e.state] + ' ballot guide', guide(e.state));
    } else if (e.record_kind === 'entity') {
      add('Open the trail for ' + e.name, trailHref(e.id));
      add('Money web full screen', '?view=network&hub=' + encodeURIComponent(e.name) + '&full=1');
    } else {
      const from = e.source_entity_id || e.from_entity_id, to = e.recipient_entity_id || e.to_entity_id;
      add('Follow ' + (e.source_name || e.from_name || 'the giver'), trailHref(from));
      add('Follow ' + (e.recipient_name || e.to_name || 'the receiver'), trailHref(to));
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
  if (q.get('hub')) { graphHub = q.get('hub').toUpperCase(); if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; }
  if (q.get('q')) { settings.search = q.get('q'); $('#search').value = settings.search; }
  const vw = q.get('view');
  // The page opens on the Money web. ?view=timeline (or a search, ?q=), states, orgs, people or departments opens that tab.
  if (['timeline', 'states', 'orgs', 'people', 'departments'].includes(vw)) setView(vw); else if (q.get('q') && vw !== 'network') setView('timeline'); else setView('network');
})();

// ---- Full screen web (Nov 2026): the Money network web fills the page by itself (not browser full screen).
// In this view, hovering a dot shows a small card. On a phone the first tap shows the card and a second tap follows the dot.
(function () {
  const wrap = $('#graph-wrap'), svg = $('#network-svg'), btn = $('#web-full'), card = $('#web-card'), title = $('#web-full-title');
  if (!wrap || !svg || !btn || !card) return;
  let full = false, lastPointer = 'mouse', armed = null;
  const isFull = () => full;
  function hideCard() { card.hidden = true; card.replaceChildren(); armed = null; }
  function line(cls, text) { const d = document.createElement('div'); d.className = cls; d.textContent = text; card.append(d); return d; }
  function fillCard(g, touch) {
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
    // The browser's own tooltip would sit on top of the card, so it moves to aria-label while the web is full screen.
    svg.querySelectorAll('.graph-node').forEach(g => { const t = g.querySelector(':scope > title'); if (t) { g.setAttribute('aria-label', t.textContent.replace(/\n/g, ', ')); t.remove(); } });
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
    if (!full) return;
    stripTitles();
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
  svg.addEventListener('pointerover', e => {
    if (!isFull() || e.pointerType === 'touch') return;
    const g = e.target.closest && e.target.closest('.graph-node');
    if (g && fillCard(g, false)) place(e.clientX, e.clientY);
  });
  svg.addEventListener('pointermove', e => { if (isFull() && e.pointerType !== 'touch' && !card.hidden) place(e.clientX, e.clientY); });
  svg.addEventListener('pointerout', e => {
    if (!isFull() || e.pointerType === 'touch') return;
    const g = e.target.closest && e.target.closest('.graph-node');
    if (g && !(e.relatedTarget && g.contains(e.relatedTarget))) hideCard();
  });
  // Touch: the first tap on a dot only shows its card. Tapping the same dot again does what a click does.
  svg.addEventListener('click', e => {
    if (!isFull()) return;
    const g = e.target.closest && e.target.closest('.graph-node');
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
