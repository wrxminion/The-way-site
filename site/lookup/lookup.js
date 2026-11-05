(function(){'use strict';

/* The Way: nationwide district lookup.
   Address -> OpenStreetMap Nominatim (the only outside call) -> point.
   The point is matched in the browser against that state's own district files
   (../map-xx/data/), the same files the state maps use. All text from data
   files is inserted with textContent, never as HTML. */

const $=id=>document.getElementById(id);
const NOMINATIM='https://nominatim.openstreetmap.org/search';
const CHAMBERS={
  us_house:{label:'U.S. House',noun:'Congressional District',file:'us-house.geojson'},
  state_senate:{label:'State Senate',noun:'Senate District',file:'state-senate.geojson'},
  state_house:{label:'State House',noun:'House District',file:'state-house.geojson'}
};
let STATES=[],USGEO=null;
const byAbbr={};
const cache={}; // abbr -> {config,officials,candidates,geo:{...}}

function el(tag,props,kids){
  const n=document.createElement(tag);
  if(props)for(const [k,v] of Object.entries(props)){
    if(k==='text')n.textContent=v;else if(k==='cls')n.className=v;else n.setAttribute(k,v);
  }
  for(const c of [].concat(kids||[]))if(c!=null&&c!==false)n.append(c);
  return n;
}
function getJSON(p){return fetch(p,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(p+' '+r.status);return r.json();});}

/* ---------- point in polygon (GeoJSON lon/lat, holes respected) ---------- */
function inRing(x,y,r){
  let inside=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){
    const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
function inPoly(x,y,rings){
  if(!inRing(x,y,rings[0]))return false;
  for(let k=1;k<rings.length;k++)if(inRing(x,y,rings[k]))return false;
  return true;
}
function contains(f,x,y){
  const g=f.geometry;if(!g)return false;
  if(g.type==='Polygon')return inPoly(x,y,g.coordinates);
  if(g.type==='MultiPolygon')return g.coordinates.some(p=>inPoly(x,y,p));
  return false;
}
function find(fc,lat,lng){return fc?fc.features.find(f=>contains(f,lng,lat))||null:null;}
function nearestState(lat,lng){ // for points just off a coast, where the coarse outline misses
  let best=null,bd=Infinity;
  for(const f of USGEO.features){
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const p of polys)for(const pt of p[0]){
      const d=(pt[0]-lng)*(pt[0]-lng)+(pt[1]-lat)*(pt[1]-lat);
      if(d<bd){bd=d;best=f.properties.a;}
    }
  }
  return bd<1?best:null; // within about 1 degree
}
function stateAt(lat,lng){
  const f=find(USGEO,lat,lng);
  return f?f.properties.a:nearestState(lat,lng);
}

/* ---------- per-state data ---------- */
function stateInfo(abbr){return byAbbr[abbr]||null;}
function dataDir(abbr){const s=stateInfo(abbr);return s&&s.map?'../'+s.map+'data/':null;}
function loadState(abbr,withGeo){
  const dir=dataDir(abbr);
  if(!dir)return Promise.reject(new Error('no map'));
  const c=cache[abbr]||(cache[abbr]={});
  const jobs=[];
  // Colorado's older map has no config.json: fall back to its name and the sample-ballot link in ballot.json
  if(!c.base)c.base=Promise.all([(stateInfo(abbr).noConfig?Promise.resolve(null):getJSON(dir+'config.json').catch(()=>null)),getJSON(dir+'officials.json').catch(()=>null),getJSON(dir+'candidates.json').catch(()=>null),getJSON(dir+'ballot.json').catch(()=>null)])
    .then(([config,officials,candidates,ballot])=>{
      if(!config){
        const l=ballot&&ballot.links&&ballot.links.sampleBallot;
        config={abbr,name:stateInfo(abbr).name,atLarge:false,sampleBallot:l?{url:l}:null};
      }
      return {config,officials,candidates};
    });
  jobs.push(c.base);
  if(withGeo&&!c.geo)c.geo=Promise.all(Object.keys(CHAMBERS).map(k=>getJSON(dir+CHAMBERS[k].file).catch(()=>null)))
    .then(a=>({us_house:a[0],state_senate:a[1],state_house:a[2]}));
  if(withGeo)jobs.push(c.geo);
  return Promise.all(jobs).then(r=>Object.assign({},r[0],withGeo?{geo:r[1]}:{}));
}

/* ---------- rendering ---------- */
function partyText(p){return p?' ('+p+')':'';}
function holderNode(holder){
  const d=el('div',{cls:'detail'});
  if(Array.isArray(holder)&&holder.length){
    d.append('Held today by ');
    holder.forEach((h,i)=>{if(i)d.append(i===holder.length-1?' and ':', ');d.append(el('b',{text:h.name}),partyText(h.party));});
    d.append('.');
  }else if(holder&&!Array.isArray(holder)){
    d.append('Held today by ',el('b',{text:holder.name}),partyText(holder.party));
    if(holder.termEnds)d.append(', term ends '+new Date(holder.termEnds+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}));
    d.append('.');
    if(holder.url&&/^https?:\/\//.test(holder.url)){d.append(' ');d.append(el('a',{href:holder.url,target:'_blank',rel:'noopener',text:'Official page ↗'}));}
  }else{
    d.append('Our source lists no current member for this seat. It may be vacant or newly filled.');
  }
  return d;
}
function candsNode(list){
  if(!list||!list.length)return null;
  const ul=el('ul',{cls:'cands'});
  for(const c of list)ul.append(el('li',{},[c.name,el('span',{text:' · '+c.party}),c.writeIn?el('span',{cls:'wi',text:' · write-in'}):null]));
  return el('div',{},[el('div',{cls:'note',text:'On the Nov 3, 2026 ballot:'}),ul]);
}
function seatCard(S,chamber,key,extra){
  const ch=CHAMBERS[chamber],cfg=S.config||{},o=S.officials||{},cands=S.candidates&&S.candidates.races||{};
  const title=chamber==='us_house'&&cfg.atLarge?'At-large district':ch.noun+' '+key;
  const holder=(o[chamber]||{})[key];
  const body=[el('div',{cls:'kind',text:ch.label}),el('div',{cls:'value',text:title}),holderNode(holder===undefined?null:holder)];
  const cn=candsNode(cands[chamber+':'+key]);
  if(cn)body.push(cn);
  if(extra)body.push(el('div',{cls:'note',text:extra}));
  return el('div',{cls:'result'},body);
}
function senateCard(S){
  const o=S.officials||{};
  if(!o.us_senate||!o.us_senate.length)return null;
  const d=el('div',{cls:'detail'});
  d.append('Held today by ');
  o.us_senate.forEach((s,i)=>{if(i)d.append('; ');d.append(el('b',{text:s.name}),partyText(s.party));});
  d.append('. Both represent all of '+S.config.name+'.');
  return el('div',{cls:'result'},[el('div',{cls:'kind',text:'U.S. Senate'}),el('div',{cls:'value',text:'Statewide'}),d]);
}
function resetOut(){
  $('local').replaceChildren();localSeq++;
  $('selected').replaceChildren();$('status').textContent='';$('results').replaceChildren();$('gofull').replaceChildren();
}
function showOut(){$('out').hidden=false;}
function say(msg,label){showOut();resetOut();if(label)$('selected').append(el('b',{text:label}));$('status').textContent=msg;$('out').scrollIntoView({behavior:'smooth',block:'start'});}

async function lookupPoint(lat,lng,label,abbrHint,general,addr){
  showOut();resetOut();
  $('selected').append(label?el('b',{text:label}):el('span',{},['Selected point: ',el('b',{text:lat.toFixed(5)+', '+lng.toFixed(5)})]));
  $('status').textContent='Finding your state…';
  const abbr=abbrHint||stateAt(lat,lng);
  if(!abbr||!stateInfo(abbr)){
    $('status').textContent='That spot is outside the 50 states and DC, which are the places this lookup covers.';
    return;
  }
  const info=stateInfo(abbr);
  if(!info.map){
    $('status').textContent=info.name+' is inside this lookup, but its district map is not built yet.';
    $('gofull').append(el('a',{href:'../states/district-of-columbia.html',text:'See '+info.name+' voting rules →'}));
    showLocal(abbr,lat,lng,addr);
    return;
  }
  $('status').textContent='Loading '+info.name+' districts…';
  let S;
  try{S=await loadState(abbr,true);}
  catch(e){$('status').textContent='The '+info.name+' district files did not load. Please try again.';return;}
  const res=$('results');res.replaceChildren();
  const found={};let any=false;
  for(const k of Object.keys(CHAMBERS)){const f=find(S.geo[k],lat,lng);if(f){found[k]=String(f.properties.d);any=true;}}
  if(!any){
    $('status').textContent='We could not match that spot to a '+info.name+' district. It may be just outside the state line. Try the state map or a street address.';
    $('gofull').append(el('a',{href:'../'+info.map,text:'Open the '+info.name+' map →'}));
    return;
  }
  $('status').textContent=info.name+(general?'. That search found a general place, not a street address. Districts can change from one street to the next, so add your street address for an exact answer.':'. Here is what applies at this spot.');
  if(found.us_house)res.append(seatCard(S,'us_house',found.us_house,S.config.congressNote));
  if(found.state_senate)res.append(seatCard(S,'state_senate',found.state_senate));
  if(found.state_house)res.append(seatCard(S,'state_house',found.state_house));
  const sc=senateCard(S);if(sc)res.append(sc);
  const g=$('gofull');
  g.append(el('a',{href:'../'+info.map+'#at='+lat.toFixed(5)+','+lng.toFixed(5),text:'Full '+info.name+' map and ballot for this spot →'}));
  if(S.config.sampleBallot&&/^https?:\/\//.test(S.config.sampleBallot.url||''))
    g.append(el('a',{href:S.config.sampleBallot.url,target:'_blank',rel:'noopener',text:'Your official sample ballot ↗'}));
  showLocal(abbr,lat,lng,addr);
  $('out').scrollIntoView({behavior:'smooth',block:'start'});
}

/* ---------- local resources ----------
   lookup/local/xx.json is written by the local-resources job on a home computer
   (tools/local-resources/). Every link and date there passed code checks and two
   local models. lookup/data/counties/xx.json holds coarse county outlines. */
const KIND_LABEL={election_office:'Election office',clerk:'Clerk or recorder',government:'Official government site',library:'Public library',state_election_office:'State election office'};
const localCache={};
let localSeq=0;
function loadLocal(abbr){
  const a=abbr.toLowerCase();
  if(!localCache[a])localCache[a]=Promise.all([getJSON('local/'+a+'.json').catch(()=>null),getJSON('data/counties/'+a+'.json').catch(()=>null)])
    .then(([local,counties])=>({local,counties}));
  return localCache[a];
}
function fmtDate(iso){return new Date(iso+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function okUrl(u){return typeof u==='string'&&/^https?:\/\//.test(u);}
function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function countyName(p){
  if(p.k==='parish')return p.n+' Parish';
  if(p.k==='city')return /city$/i.test(p.n)?p.n:p.n+' (city)';
  if(p.k==='borough'||p.k==='district')return p.n;
  return p.n+' County';
}
function normName(s){return String(s||'').toLowerCase().replace(/\b(county|parish|borough|census area|city and borough|municipality)\b/g,'').replace(/^saint /,'st ').replace(/[^a-z0-9]+/g,' ').trim();}
function findCounty(fc,lat,lng,addr){
  if(!fc)return null;
  const want=addr&&addr.county?normName(addr.county):'';
  if(want){const f=fc.features.find(f=>normName(f.properties.n)===want&&f.properties.k!=='city');if(f)return f.properties;}
  const f=find(fc,lat,lng);
  return f?f.properties:null;
}
function linkItem(it){
  return el('li',{},[el('a',{href:it.u,target:'_blank',rel:'noopener',text:it.t+' ↗'}),
    el('span',{cls:'lr-meta',text:' · '+(KIND_LABEL[it.k]||'Official link')+' · checked '+fmtDate(it.c)})]);
}
function localCard(L,p){
  const name=countyName(p);
  const C=L.local&&L.local.counties?L.local.counties[p.f]:null;
  const body=[el('div',{cls:'kind',text:'Your local election help'}),el('div',{cls:'value',text:name})];
  const links=C?C.links.filter(i=>okUrl(i.u)):[];
  if(links.length){
    const top=links.find(i=>i.k==='election_office')||links.find(i=>i.k==='clerk');
    if(top)body.push(el('a',{cls:'lr-top',href:top.u,target:'_blank',rel:'noopener',text:top.t+' ↗'}));
    const rest=links.filter(i=>i!==top);
    if(rest.length)body.push(el('ul',{cls:'lr-list'},rest.map(linkItem)));
    if(top)body.push(el('div',{cls:'note',text:'Checked '+fmtDate(top.c)+'. Your election office has the final word on your ballot and polling place.'}));
  }else{
    body.push(el('div',{cls:'detail',text:'Official links for '+name+' are not checked yet. Our checker reads official county sites one at a time, so this list grows every week.'}));
  }
  return el('div',{cls:'result lr'},body);
}
function electionsCard(L,p){
  const C=L.local&&L.local.counties?L.local.counties[p.f]:null;
  if(!C)return null;
  const t=todayISO();
  const els=(C.elections||[]).filter(e=>e.d>=t&&okUrl(e.u));
  const body=[el('div',{cls:'kind',text:'Upcoming local elections'})];
  if(!els.length){
    body.push(el('div',{cls:'detail',text:'No upcoming election was found on '+countyName(p)+"'s official pages the last time we looked. That does not mean there is none."}));
  }else{
    const ul=el('ul',{cls:'lr-list'});
    for(const e of els)ul.append(el('li',{},[el('b',{text:fmtDate(e.d)}),' '+e.n+'. ',
      el('span',{cls:'lr-quote',text:'"'+e.q+'"'}),' ',el('a',{href:e.u,target:'_blank',rel:'noopener',text:'Source ↗'}),
      el('span',{cls:'lr-meta',text:' · checked '+fmtDate(e.c)})]));
    body.push(el('div',{cls:'value',text:fmtDate(els[0].d)}),ul,
      el('div',{cls:'note',text:'Found on official pages by an automatic check and confirmed word for word. Dates can change: confirm with your election office.'}));
  }
  return el('div',{cls:'result lr'},body);
}
function stateLinksCard(L,stateName){
  const links=L.local&&L.local.state_links?L.local.state_links.filter(i=>okUrl(i.u)):[];
  if(!links.length)return null;
  return el('div',{cls:'result lr'},[el('div',{cls:'kind',text:'State election office'}),el('div',{cls:'value',text:stateName}),el('ul',{cls:'lr-list'},links.map(linkItem))]);
}
async function showLocal(abbr,lat,lng,addr){
  const seq=localSeq,box=$('local');
  const L=await loadLocal(abbr);
  if(seq!==localSeq)return; // a newer search started
  const p=findCounty(L.counties,lat,lng,addr);
  const cards=[];
  if(p){
    cards.push(localCard(L,p));
    const ec=electionsCard(L,p);if(ec)cards.push(ec);
  }
  const sl=stateLinksCard(L,stateInfo(abbr).name);if(sl)cards.push(sl);
  if(!cards.length)return;
  box.replaceChildren(el('h3',{cls:'lr-h',text:p?'Local resources for '+countyName(p):'Local resources'}),el('div',{cls:'results'},cards),
    el('p',{cls:'note',text:p&&!(addr&&addr.county)?'County is worked out from a simple outline map, so it can be wrong right at a county line.':'Links come only from official government sites and the pages they link to.'}));
}
function districtCountiesCard(L,ch,dist,stateName){
  const keys=L.local&&L.local.districts?L.local.districts[ch+':'+dist]:null;
  if(!keys||!keys.length||!L.counties)return null;
  const props={};for(const f of L.counties.features)props[f.properties.f]=f.properties;
  const ul=el('ul',{cls:'lr-list'});
  const shown=keys.slice(0,15);
  for(const fips of shown){
    const p=props[fips];if(!p)continue;
    const C=L.local.counties[fips];
    const links=C?C.links.filter(i=>okUrl(i.u)):[];
    const top=links.find(i=>i.k==='election_office')||links.find(i=>i.k==='clerk')||links.find(i=>i.k==='government');
    const t=todayISO();
    const next=C?(C.elections||[]).find(e=>e.d>=t):null;
    ul.append(el('li',{},[el('b',{text:countyName(p)}),
      top?[' · ',el('a',{href:top.u,target:'_blank',rel:'noopener',text:(KIND_LABEL[top.k]||'Official link')+' ↗'})]:el('span',{cls:'lr-meta',text:' · not checked yet'}),
      next?el('span',{cls:'lr-meta',text:' · next election '+fmtDate(next.d)}):null].flat()));
  }
  const body=[el('div',{cls:'kind',text:'Counties in this district'}),el('div',{cls:'value',text:keys.length+(keys.length===1?' county':' counties')}),ul];
  if(keys.length>shown.length)body.push(el('div',{cls:'note',text:'And '+(keys.length-shown.length)+' more. Type an address above to see one county in full.'}));
  body.push(el('div',{cls:'note',text:'Each county runs its own elections. A district can cover only part of a county.'}));
  return el('div',{cls:'result lr'},body);
}

/* ---------- address search ---------- */
let searching=false;
$('search').addEventListener('submit',async e=>{
  e.preventDefault();
  const q=$('q').value.trim();
  if(!q||searching)return;
  searching=true;say('Looking up that address…');
  const u=new URL(NOMINATIM);
  u.search=new URLSearchParams({q,format:'jsonv2',limit:'1',countrycodes:'us',addressdetails:'1'}).toString();
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),12000);
  try{
    const r=await fetch(u,{signal:ctl.signal,headers:{'Accept':'application/json'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    if(!d.length){say('No U.S. match for that address. Try adding the city and state.');return;}
    const hit=d[0],lat=+hit.lat,lng=+hit.lon;
    const iso=hit.address&&hit.address['ISO3166-2-lvl4'];
    const abbr=iso&&/^US-[A-Z]{2}$/.test(iso)?iso.slice(3):null;
    const exact=['house','building','place','road'].includes(hit.addresstype)&&!!(hit.address&&(hit.address.house_number||hit.addresstype==='building'));
    await lookupPoint(lat,lng,hit.display_name,abbr&&stateInfo(abbr)?abbr:null,!exact,hit.address||null);
  }catch(err){
    say('Address search is unavailable right now. You can still click your state on the map below.');
  }finally{clearTimeout(t);setTimeout(()=>{searching=false;},1100);}
});

$('locate').addEventListener('click',()=>{
  if(!navigator.geolocation){say('Location is not available in this browser.');return;}
  say('Asking your browser for permission…');
  navigator.geolocation.getCurrentPosition(p=>lookupPoint(p.coords.latitude,p.coords.longitude,'Your location'),
    ()=>say('Location not shared. You can still type an address or click your state.'),{enableHighAccuracy:false,timeout:10000});
});
$('clear').addEventListener('click',()=>{$('out').hidden=true;resetOut();$('q').value='';$('soon').textContent='';});

/* ---------- click a state on the map ---------- */
$('usmap').addEventListener('click',e=>{
  const a=e.target.closest('a[data-soon]');
  if(!a)return;
  e.preventDefault();
  const m=$('soon');m.replaceChildren(a.getAttribute('data-soon')+': district map coming soon. ',el('a',{href:a.getAttribute('href'),text:'See its voting rules →'}));
});

/* ---------- by district number ---------- */
const pState=$('pState'),pChamber=$('pChamber'),pDist=$('pDist'),dres=$('dresults');
function natKey(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});}
function resetSelect(sel,label){sel.replaceChildren(el('option',{value:'',text:label}));sel.disabled=true;}
pState.addEventListener('change',()=>{
  dres.replaceChildren();resetSelect(pDist,'District');pChamber.value='';
  pChamber.disabled=!pState.value;
});
pChamber.addEventListener('change',async()=>{
  dres.replaceChildren();resetSelect(pDist,'District');
  const st=pState.value,ch=pChamber.value;
  if(!st||!CHAMBERS[ch])return;
  let S;
  try{S=await loadState(st,false);}catch(e){dres.append(el('p',{cls:'status',text:'Those district files did not load. Please try again.'}));return;}
  if(pState.value!==st||pChamber.value!==ch)return; // the person changed their pick while the files loaded
  const keys=new Set(Object.keys((S.officials||{})[ch]||{}));
  for(const k of Object.keys((S.candidates&&S.candidates.races)||{}))if(k.startsWith(ch+':'))keys.add(k.slice(ch.length+1));
  if(!keys.size){dres.append(el('p',{cls:'status',text:'No '+CHAMBERS[ch].label+' seats in our data for '+stateInfo(pState.value).name+'.'}));return;}
  for(const k of [...keys].sort(natKey))pDist.append(el('option',{value:k,text:(ch==='us_house'&&S.config.atLarge?'At-large':CHAMBERS[ch].noun+' '+k)}));
  pDist.disabled=false;
});
pDist.addEventListener('change',async()=>{
  dres.replaceChildren();
  const abbr=pState.value,ch=pChamber.value,dist=pDist.value,info=stateInfo(abbr);
  if(!dist||!CHAMBERS[ch])return;
  let S;
  try{S=await loadState(abbr,false);}catch(e){return;}
  if(pState.value!==abbr||pChamber.value!==ch||pDist.value!==dist)return;
  dres.append(seatCard(S,ch,dist,ch==='us_house'?S.config.congressNote:null));
  const sc=ch==='us_house'?senateCard(S):null;if(sc)dres.append(sc);
  const L=await loadLocal(abbr);
  if(pState.value!==abbr||pChamber.value!==ch||pDist.value!==dist)return;
  const dc=districtCountiesCard(L,ch,dist,info.name);if(dc)dres.append(dc);
  dres.append(el('p',{cls:'gofull'},[el('a',{href:'../'+info.map,text:'Open the '+info.name+' map →'})]));
});

/* ---------- start ---------- */
Promise.all([getJSON('data/states.json'),getJSON('data/us-states.geojson')]).then(([st,geo])=>{
  STATES=st;USGEO=geo;
  for(const s of STATES){byAbbr[s.abbr]=s;pState.append(el('option',{value:s.abbr,text:s.name}));}
  // DC has no chambers we map, so only offer it for address lookups
  const dc=[...pState.options].find(o=>o.value==='DC');if(dc)dc.remove();
}).catch(()=>{$('status').textContent='The state list did not load. Please reload the page.';$('out').hidden=false;});

})();
