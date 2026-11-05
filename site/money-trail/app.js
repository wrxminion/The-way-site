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
function summary(){const m=RESEARCH.meta;$('#kpis').innerHTML=`<div class="kpi"><div class="kpi-value">${m.transactions}</div><div class="kpi-label">Itemized finance records</div></div><div class="kpi"><div class="kpi-value">${m.ballot_events}</div><div class="kpi-label">Statewide ballot events</div></div><div class="kpi"><div class="kpi-value">${m.states_with_ballot_events} / 50</div><div class="kpi-label">States with recorded measures</div></div><div class="kpi"><div class="kpi-value">0 / 50</div><div class="kpi-label">States fully investigated</div></div>`;
 const opts=Object.entries(stName).sort((a,b)=>a[1].localeCompare(b[1]));$('#state').innerHTML='<option value="ALL">All states</option>'+opts.map(([code,name])=>`<option value="${code}">${escapeHtml(name)}</option>`).join('')+'<option value="US">Federal / unresolved jurisdiction</option>';
}
function getTitle(e){if(e.record_kind==='transaction')return `${e.source_name} → ${e.recipient_name}`;if(e.record_kind==='ballot')return `${measureName(e)}: ${e.short_title}`;if(e.record_kind==='reported')return `${e.source_name} → ${e.recipient_name}`;return e.event_id;}
function kindLabel(e){return e.record_kind==='transaction'?'Itemized finance record':e.record_kind==='ballot'?'Statewide ballot event':e.record_kind==='reported'?'Reported disclosure · NOT a unique transfer':'Research graph connection · mixed evidence'}
function eventMarkup(e){let active=selected&&selected.event_id===e.event_id,kind=e.record_kind;let label=kind==='ballot'?e.state+' · statewide':(stateOf(e)==='US'?'US / context unresolved':stateOf(e));
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
function details(e){if(!e)return;let kind=e.record_kind||'graph';let h=`<span class="event-kind ${kind}">${escapeHtml(kindLabel(e)||'Graph connection')}</span>`+(kind==='ballot'?outcomeBox(e.measure_id):'')+`<h2>${escapeHtml(getTitle(e))}</h2>`;
 if(kind==='transaction'){
 h+=`<div class="event-amount mt-big">${money(e.amount_usd)}</div>`;
 h+=datum('Reported transaction date',dateText(e.transaction_date))+datum('Date semantics',e.date_kind)+datum('Source',e.source_name)+datum('Recipient',e.recipient_name)+datum('Source entity ID',e.source_entity_id)+datum('Recipient entity ID',e.recipient_entity_id)+datum('Election cycle',e.cycle)+datum('Jurisdiction / attribution',e.jurisdiction)+datum('Filing classification',e.activity_type)+datum('Confidence as recorded',e.confidence)+datum('Amendment status',e.amendment_status)+datum('Filing identifier',e.filing_id);
 h+=sourceButton(e.filing_url);
 h+=`<div class="detail-caution">The archive labels this an itemized transaction. Classification may not establish federal independent expenditure status or ultimate state/ballot use. Source claims have not all been re-fetched in this build.</div>`+datum('Research note',e.notes);
 h+=`<button class="detail-action" id="to-graph">Explore this relationship in network</button>`;
 }else if(kind==='ballot'){
 h+=datum('Election date',dateText(e.election_date))+datum('State',stName[e.state]||e.state)+datum('Question number',e.measure_number)+datum('Scope',e.scope)+datum('Official source status',e.source_status)+datum('Support committee review',e.support_committee_review||'Not checked')+datum('Opposition committee review',e.opposition_committee_review||'Not checked')+datum('Donor/vendor/ad reconciliation',e.donor_vendor_ad_reconciliation||'Pending');
 h+=sourceButton(e.source_url,'Open official ballot source')+(coGuide[e.measure_id]||(measureGuide[e.measure_id]?[['The Way · '+measureName(e)+' guide',measureGuide[e.measure_id]]]:[])).map(([l,u])=>`<a class="detail-link" href="${escapeHtml(u)}">${escapeHtml(l)} →</a>`).join('')+positionPanel(e.measure_id)+datum('Research notes',e.notes);
 }else if(kind==='reported'){
 h+=`<div class="event-amount mt-big">${money(e.amount_usd)}</div>`;
 h+=`<div class="detail-caution">This is a reported disclosure observation. It is NOT confirmed as one uniquely itemized transfer and may overlap other reports.</div>`;
 h+=datum('Report date (not necessarily transfer date)',dateText(e.date))+datum('Recorded date type',e.date_kind)+datum('Source as reported',e.source_name)+datum('Recipient as reported',e.recipient_name)+datum('Reported figure',money(e.amount_usd))+datum('Confidence',e.confidence)+datum('Reconciliation flag',e.reconciliation_flag)+datum('Recipient registration',e.recipient_registry_id);
 h+=sourceButton(e.source_url,'Open reported disclosure')+datum('Notes',e.notes);
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
function prepareHub(){let h=$('#hub');h.innerHTML=hubs.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(hubLabel(x))}</option>`).join('');h.value=graphHub;h.addEventListener('change',()=>{graphHub=h.value;graphScale=1;renderGraph()});$('#include-context').addEventListener('change',e=>{settings.includeContext=e.target.checked;renderGraph()})}
const networkVerified=RESEARCH.transactions.map(t=>({id:t.transaction_id,from_name:t.source_name,to_name:t.recipient_name,from_entity_id:t.source_entity_id,to_entity_id:t.recipient_entity_id,amount_usd:t.amount_usd,date:t.transaction_date,date_kind:t.date_kind,jurisdiction:t.jurisdiction,edge_type:t.activity_type,confidence:t.confidence,source_url:t.filing_url,notes:t.notes,record_kind:'transaction',record_ref:t,tier:'itemized'}));
const networkContext=RESEARCH.graph_edges.filter(e=> !/itemized|verified_.*(contribution|payment)|state_ballot_cash_receipt|state_ballot_in_kind_receipt|state_party_receipt/i.test(e.edge_type||'')).map(e=>({...e,record_kind:'graph',tier:/reported|aggregate|major_contribution|attestation|snapshot/i.test(e.edge_type||'')?'reported':'context'}));
function nodeKey(name,id,jur){if(id)return String(id);return 'reported-name:'+String(jur||'unknown')+':'+norm(name)}
function makeNetwork(){let edges=settings.includeContext?[...networkVerified,...networkContext]:networkVerified;
 let f=norm(graphHub);
 // Include only edges directly touching the selected hub, without assuming the same legal entity across jurisdictions.
 edges=edges.filter(e=>norm(e.from_name)===f||norm(e.to_name)===f);
 if(settings.state!=='ALL')edges=edges.filter(e=>String(e.jurisdiction||'').includes(settings.state)||String(e.notes||'').includes(settings.state+' ')||stateOf(e)===settings.state);
 edges.sort((a,b)=>(a.tier==='itemized'?1:0)===(b.tier==='itemized'?1:0)?(num(b.amount_usd)-num(a.amount_usd)):((b.tier==='itemized'?1:0)-(a.tier==='itemized'?1:0)));
 let shown=edges.slice(0,85),nodes=new Map(),display=[];
 for(let e of shown){let a=nodeKey(e.from_name,e.from_entity_id,e.jurisdiction),b=nodeKey(e.to_name,e.to_entity_id,e.jurisdiction);
 for(const [id,name] of [[a,e.from_name],[b,e.to_name]])if(!nodes.has(id))nodes.set(id,{id,name:name||id,jur:e.jurisdiction||'',amount:0,count:0,central:norm(name)===f});
 nodes.get(a).count++;nodes.get(b).count++;
 nodes.get(a).amount+=num(e.amount_usd)||0;nodes.get(b).amount+=num(e.amount_usd)||0;
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
 for(let {a,b,e} of net.edges){let A=pos[a],B=pos[b];if(!A||!B)continue;let tier=e.tier;let line=svgEl('line',{x1:A.x,y1:A.y,x2:B.x,y2:B.y,stroke:tier==='itemized'?'#57c2ad':tier==='reported'?'#ad946c':'#659eb3','stroke-width':tier==='itemized'?'1.8':'1.3','stroke-dasharray':tier==='itemized'?'none':tier==='reported'?'7 5':'2 5',class:'graph-edge',opacity:'.7'},pan);svgEl('title',{},line).textContent=`${e.from_name} → ${e.to_name}\n${e.amount_usd!=null?money(e.amount_usd):'Non-financial'}\n${e.edge_type}`;line.addEventListener('click',()=>pick(e.record_ref||e));}
 for(let n of net.nodes){let P=pos[n.id],isRoot=n.id===root.id;let group=svgEl('g',{class:'graph-node'},pan);let circ=svgEl('circle',{cx:P.x,cy:P.y,r:isRoot?'24':n.central?'11':ballotById[n.name]?'13':Math.max(6,Math.min(14,7+n.count/4)),fill:(ballotById[n.name]&&outcomeColor(n.name))||(isRoot?'#6be3c9':n.central?'#c4b18a':'#4c9ba5')},group);if(ballotById[n.name]&&outcomeColor(n.name))circ.setAttribute('stroke','#ffffff'),circ.setAttribute('stroke-width','3');svgEl('title',{},group).textContent=`${n.name}\n${n.id}\n${n.count} connections`;
 if(isRoot||n.count>=2||other.indexOf(n)<17){let text=svgEl('text',{x:P.x,y:P.y+(isRoot?42:24),'text-anchor':'middle'},group);const mb=ballotById[n.name];let label=mb?mb.state+' '+measureName(mb).slice((stName[mb.state]||mb.state).length+1):n.name;label=label.length>24?label.slice(0,22)+'…':label;text.textContent=label;
 if(mb){let sub=svgEl('text',{x:P.x,y:P.y+(isRoot?60:40),'text-anchor':'middle',class:'graph-sub'},group);sub.textContent=mb.short_title.length>34?mb.short_title.slice(0,32)+'…':mb.short_title;const mo=measureOutcome[n.name];if(mo){let st=svgEl('text',{x:P.x,y:P.y+(isRoot?84:62),'text-anchor':'middle',class:'graph-status '+mo.status},group);st.textContent=mo.status==='passed'?'✓ PASSED':mo.status==='failed'?'✗ FAILED':'Not yet called';}}}
 group.addEventListener('click',()=>{const mb=ballotById[n.name];if(mb){pick({...mb});if(n.name!==graphHub){graphHub=n.name;if(!hubs.includes(graphHub)){hubs.push(graphHub);prepareHubRefresh()}$('#hub').value=graphHub;graphScale=1;renderGraph()}return;}
 if(n.name===graphHub){const ent=entityById[n.id];if(ent){pick({record_kind:'graph',from_name:ent.legal_or_reported_name,to_name:'registered entity',edge_type:ent.entity_type,source_url:ent.source_url,notes:ent.notes,jurisdiction:ent.jurisdiction,confidence:'registry identifier shown',id:ent.entity_id})}return;}
 graphHub=n.name;if(!hubs.includes(graphHub)){hubs.push(graphHub);prepareHubRefresh()}$('#hub').value=graphHub;graphScale=1;renderGraph()});}
}
function prepareHubRefresh(){$('#hub').innerHTML=hubs.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(hubLabel(x))}</option>`).join('')}
function setScale(n){graphScale=Math.min(2,Math.max(.65,graphScale*n));renderGraph()}
function renderStates(){const arr=RESEARCH.coverage.map(x=>({...x,count:(byState[x.state]||[]).length}));$('#state-grid').innerHTML=arr.map(s=>`<button class="state-card ${s.state===stateFocus?'active':''}" data-statepick="${escapeHtml(s.state)}"><div><strong>${escapeHtml(stName[s.state]||s.state)}</strong><span>Research in progress · ${escapeHtml(s.state)}</span></div><div class="state-pill ${s.count?'':'unknown'}">${s.count} events</div></button>`).join('');$$('[data-statepick]').forEach(el=>el.addEventListener('click',()=>{stateFocus=el.dataset.statepick;renderStates();renderStateFocus()}));renderStateFocus()}
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
      const go = () => { stateFocus = code; renderStates(); $('#state-focus').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
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
  const baseDetails = details;
  details = function (e) {
    baseDetails(e);
    if (!e) return;
    // the amount is the fact people came for: put it first, above the names
    const big = $('#detail-content .mt-big'), h2 = $('#detail-content h2');
    if (big && h2) h2.before(big);
    const box = document.createElement('div'); box.className = 'mt-follow-box';
    const h = document.createElement('h4'); h.textContent = 'Follow the money'; box.append(h);
    const ul = document.createElement('ul');
    const add = (label, href) => { if (!href) return; const li = document.createElement('li'); li.append(a(label, href)); ul.append(li); };
    if (e.record_kind === 'ballot') {
      add('Open the trail for ' + e.state + ' ' + e.measure_number, 'follow.html?measure=' + encodeURIComponent(e.measure_id));
      add(stName[e.state] + ' election results', '/results/?state=' + e.state.toLowerCase() + '#tabs');
      add(stName[e.state] + ' ballot guide', guide(e.state));
    } else {
      const from = e.source_entity_id || e.from_entity_id, to = e.recipient_entity_id || e.to_entity_id;
      add('Follow ' + (e.source_name || e.from_name || 'the giver'), trailHref(from));
      add('Follow ' + (e.recipient_name || e.to_name || 'the receiver'), trailHref(to));
      const st = stateOf(e); if (stName[st]) add(stName[st] + ' election results', '/results/?state=' + st.toLowerCase() + '#tabs');
    }
    if (ul.children.length) { box.append(ul); $('#detail-content').append(box); }
  };
  if (q.get('state') && stName[q.get('state').toUpperCase()]) stateFocus = q.get('state').toUpperCase();
  if (q.get('hub')) { graphHub = q.get('hub').toUpperCase(); if (!hubs.includes(graphHub)) { hubs.push(graphHub); prepareHubRefresh(); } $('#hub').value = graphHub; }
  if (q.get('q')) { settings.search = q.get('q'); $('#search').value = settings.search; }
  const vw = q.get('view');
  if (vw === 'network' || vw === 'states') setView(vw); else if (q.get('q')) renderTimeline();
})();
