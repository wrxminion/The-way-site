(function(){'use strict';

/* The Way: Colorado district explorer.
   Everything runs in the browser from static files in data/. A clicked point is
   matched against the district polygons locally; nothing is sent to a server.
   All text from data files is inserted with textContent, never as HTML. */

const CO_BOUNDS=[[36.99,-109.06],[41.01,-102.04]];
const LAYERS={
  us_house:{file:'data/us-house.geojson',label:'U.S. House',noun:'Congressional District'},
  state_senate:{file:'data/state-senate.geojson',label:'State Senate',noun:'State Senate District'},
  state_house:{file:'data/state-house.geojson',label:'State House',noun:'State House District'},
  boulder:{label:'Boulder city',noun:'City of Boulder'}
};
const $=id=>document.getElementById(id);
const selected=$('selected'),status=$('status'),results=$('results'),ballotBox=$('ballot');

function el(tag,props,kids){
  const n=document.createElement(tag);
  if(props)for(const [k,v] of Object.entries(props)){
    if(k==='text')n.textContent=v;else if(k==='cls')n.className=v;else n.setAttribute(k,v);
  }
  for(const c of [].concat(kids||[]))if(c!=null&&c!==false)n.append(c);
  return n;
}
function link(href,text){return el('a',{href,target:'_blank',rel:'noopener',text});}

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

/* ---------- map ---------- */
const map=L.map('map',{zoomSnap:.25,minZoom:6,maxBounds:[[35.5,-111.5],[42.5,-99.5]],maxBoundsViscosity:.8,attributionControl:true});
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('Boundaries: U.S. Census Bureau');
map.fitBounds(CO_BOUNDS,{padding:[10,10]});

let streets=null,tileLoads=0,tileFails=0;
$('streets').addEventListener('click',e=>{
  const on=e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed',String(on));
  e.currentTarget.textContent=on?'Hide streets':'Show streets';
  if(on){
    tileLoads=0;tileFails=0;
    streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',className:'streets'});
    streets.on('tileload',()=>{tileLoads++;$('tilenotice').classList.remove('show');});
    streets.on('tileerror',()=>{if(++tileFails>=3&&!tileLoads)$('tilenotice').classList.add('show');});
    streets.addTo(map);streets.bringToBack();
    setFill(.10);
  }else{
    if(streets)map.removeLayer(streets);streets=null;$('tilenotice').classList.remove('show');setFill(.22);
  }
});

const data={};
let countiesLayer=null,districtLayer=null,activeKey='us_house',marker=null,highlight=null,lastPoint=null;
let fillOpacity=.22;
// Neutral palette only: no red or blue, so no district reads as belonging to a party.
const SHADES=['#3fb8af','#5fd0c4','#2e8f9e','#7fdccf','#4aa3a8','#69c2b8','#348b8f','#8fe3d6'];
function baseStyle(f){
  const n=+f.properties.d||0;
  return {color:'#d7fbff',weight:1.1,opacity:.75,fillColor:SHADES[n%SHADES.length],fillOpacity};
}
function setFill(v){fillOpacity=v;if(districtLayer)districtLayer.setStyle(baseStyle);}

function districtName(key,f){
  if(key==='boulder')return 'City of Boulder';
  return LAYERS[key].noun+' '+f.properties.d;
}

function drawLayer(key){
  activeKey=key;
  document.querySelectorAll('.layer').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layer===key)));
  $('maplabel').textContent=LAYERS[key].label+(key==='boulder'?' limits':' districts')+' · click to inspect';
  if(districtLayer)map.removeLayer(districtLayer);
  const fc=key==='boulder'?data.boulder:data[key];
  if(!fc)return;
  districtLayer=L.geoJSON(fc,{
    style:baseStyle,
    onEachFeature:(f,layer)=>{
      layer.bindTooltip(districtName(key,f),{sticky:true,direction:'top',offset:[0,-6]});
      layer.on('mouseover',()=>layer.setStyle({weight:2.4,fillOpacity:fillOpacity+.12}));
      layer.on('mouseout',()=>districtLayer.resetStyle(layer));
    }
  }).addTo(map);
  if(countiesLayer)countiesLayer.bringToFront();
  if(key==='boulder')map.fitBounds(districtLayer.getBounds(),{padding:[30,30]});
  if(lastPoint)drawHighlight(lastPoint.lat,lastPoint.lng);
}
document.querySelectorAll('.layer').forEach(b=>b.addEventListener('click',()=>drawLayer(b.dataset.layer)));

function drawHighlight(lat,lng){
  if(highlight){map.removeLayer(highlight);highlight=null;}
  const fc=activeKey==='boulder'?data.boulder:data[activeKey];
  const f=find(fc,lat,lng);
  if(f)highlight=L.geoJSON(f,{interactive:false,style:{color:'#ffffff',weight:3,fillColor:'#a6f0e7',fillOpacity:.32}}).addTo(map);
  if(marker)marker.bringToFront();
}

/* ---------- lookup and sidebar ---------- */
function partyText(p){return p?' ('+p+')':'';}
function officeCard(kind,value,holder,extra){
  const detail=el('div',{cls:'detail'});
  if(holder){
    detail.append('Held today by ',el('b',{text:holder.name}),partyText(holder.party));
    if(holder.termEnds)detail.append(', term ends '+new Date(holder.termEnds+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}));
    detail.append('.');
    if(holder.url){detail.append(' ');detail.append(link(holder.url,'Official page ↗'));}
  }else if(holder===null){
    detail.append('Our source lists no current member for this seat. It may be vacant or newly filled.');
  }
  if(extra)detail.append(el('div',{cls:'note',text:extra}));
  return el('div',{cls:'result'},[el('div',{cls:'kind',text:kind}),el('div',{cls:'value',text:value}),detail]);
}

function lookup(lat,lng,label,addr){
  lastPoint={lat,lng};
  if(marker)map.removeLayer(marker);
  marker=L.circleMarker([lat,lng],{radius:8,weight:2,color:'#fff',fillColor:'#67eadc',fillOpacity:1}).addTo(map);
  selected.replaceChildren(label?el('b',{text:label}):el('span',{},['Selected point: ',el('b',{text:lat.toFixed(5)+', '+lng.toFixed(5)})]));
  results.replaceChildren();ballotBox.replaceChildren();
  const cd=find(data.us_house,lat,lng),sd=find(data.state_senate,lat,lng),hd=find(data.state_house,lat,lng);
  const county=find(data.counties,lat,lng),place=find(data.places,lat,lng);
  drawHighlight(lat,lng);
  if(!cd&&!sd&&!hd){
    status.textContent='That point is outside Colorado. This map covers Colorado.';
    results.append(otherState(addr&&addr.state));
    return;
  }
  status.textContent='Here is what applies at this spot.';
  const o=data.officials||{};
  const cdn=cd&&String(cd.properties.d),sdn=sd&&String(sd.properties.d),hdn=hd&&String(hd.properties.d);
  if(cd)results.append(officeCard('U.S. House','Congressional District '+cdn,(o.us_house||{})[cdn]||null));
  if(sd)results.append(officeCard('State Senate','Senate District '+sdn,(o.state_senate||{})[sdn]||null));
  if(hd)results.append(officeCard('State House','House District '+hdn,(o.state_house||{})[hdn]||null));
  // town: city-limit shapes where we have them, otherwise the town named in the searched address
  const town=place?place.properties.n:(addr&&(addr.city||addr.town||addr.village))||null;
  const inBoulder=town==='Boulder';
  results.append(el('div',{cls:'result'},[
    el('div',{cls:'kind',text:'County and city'}),
    el('div',{cls:'value',text:(county?county.properties.n+' County':'County not found')}),
    el('div',{cls:'detail',text:place?'Inside '+place.properties.n+' city limits.':(town?'Address is in '+town+'.':'Not inside a town we can identify from this spot. Search your street address to see your town\'s questions.')})
  ]));
  if(o.us_senate&&o.us_senate.length){
    const d=el('div',{cls:'detail'});
    o.us_senate.forEach((s,i)=>{if(i)d.append('; ');d.append(el('b',{text:s.name}),partyText(s.party));});
    d.append('. Both represent all of Colorado.');
    results.append(el('div',{cls:'result'},[el('div',{cls:'kind',text:'U.S. Senate'}),el('div',{cls:'value',text:'Statewide'}),d]));
  }
  renderBallot({cdn,sdn,hdn,county:county&&county.properties.n,place:town,inBoulder});
}


/* Outside Colorado: name the state and link its guide when we have one. */
function otherState(name){
  const d=el('div',{cls:'result'});
  const st=name&&data.guide&&(data.guide.states||[]).find(x=>x.name===name);
  d.append(el('div',{cls:'kind',text:'Other states'}));
  if(name)d.append(el('div',{cls:'value',text:'This address is in '+name+'.'}));
  if(st)d.append(el('div',{cls:'detail'},[el('a',{href:'../'+st.map,text:name+' district map →'}),' · ',el('a',{href:'../'+st.guide,text:name+' voter guide →'})]));
  else if(name)d.append(el('div',{cls:'detail',text:'Our '+name+' guide is coming soon.'}));
  else d.append(el('div',{cls:'detail',text:'Pick your state from the list at the top of the page.'}));
  return d;
}
/* links into the voter guide (guide.json is written by guide-build/build.py) */
function gLink(rel,text){const g=data.guide;return g&&rel?el('a',{href:g.base+rel,text}):document.createTextNode(text);}
function candList(race,key){
  const ul=el('ul'),g=data.guide;
  for(const c of race){
    const rel=g&&key?g.candidates[key+'|'+c.name]:null;
    ul.append(el('li',{},[gLink(rel,c.name),el('span',{text:' · '+c.party}),c.writeIn?el('span',{cls:'wi',text:' · write-in'}):null]));
  }
  return ul;
}
function raceBlock(title,list,emptyText,key){
  const g=data.guide,rel=g&&key?g.races[key]:null;
  return el('div',{cls:'race'},[el('b',{},[gLink(rel,title)]),list&&list.length?candList(list,key):el('div',{cls:'note',text:emptyText||'No candidates listed.'})]);
}
function govTickets(r){
  const gov=r.governor||[],lt=r.lt_governor||[];
  return gov.map(g=>{
    const mate=lt.find(x=>x.party===g.party);
    return {name:g.name,mate:mate&&mate.name,party:g.party,writeIn:g.writeIn};
  });
}
function measure(m,tag){
  const body=el('div',{cls:'body'},[el('p',{text:m.what})]);
  const rel=data.guide&&(data.guide.measures[m.code]||(tag&&tag!=='Rail district'&&data.guide.boulderLocal[m.code]));
  if(rel)body.append(el('p',{},[gLink(rel,'Full page: official analysis, arguments for and against, and who is paying →')]));
  if(m.yes)body.append(el('p',{},[el('b',{text:'Yes: '}),m.yes,' ',el('b',{text:'No: '}),m.no]));
  if(m.note)body.append(el('p',{cls:'note',text:m.note}));
  const meta=['Needs '+(m.needs==='55%'?'55% of the vote':'a majority')];
  if(m.page)meta.push('Blue Book page '+m.page);
  body.append(el('p',{cls:'note',text:meta.join(' · ')}));
  return el('details',{cls:'measure'},[el('summary',{},[el('b',{text:m.code}),' '+m.title,tag?el('span',{cls:'tag',text:tag}):null]),body]);
}


/* "Your local measures": every county, city, school and district question we have for the county at this point.
   County-wide and same-city questions are listed first; the rest depend on the exact address (school, fire, water districts). */
function localBlock(at){
  const wrap=el('div',{cls:'local'});
  wrap.append(el('h3',{text:'Your local measures'}));
  const G=data.guide,list=at.county&&G&&G.localList&&G.localList[at.county];
  if(!at.county){wrap.append(el('div',{cls:'note',text:'County not found for this spot.'}));return wrap;}
  if(!list||!list.length){
    wrap.append(el('div',{cls:'note',text:'We have not added local measures for '+at.county+' County yet. Your county clerk\'s sample ballot lists them.'}));
    return wrap;
  }
  const norm=s=>String(s||'').toLowerCase().replace(/^(city and county of|city of|town of)\s+/,'').trim();
  const cty=at.county.toLowerCase(),plc=norm(at.place);
  const sure=[],maybe=[];
  // the same question can come from two sources under a short and a long code ("311" and "Initiated Ordinance 311")
  const uniq=list.filter(m=>!list.some(o=>o!==m&&o.juris===m.juris&&o.code.length>m.code.length&&o.code.endsWith(' '+m.code)));
  for(const m of uniq){
    const j=m.juris.toLowerCase(),nj=norm(m.juris);
    if(j===cty+' county'||j==='city and county of '+cty||(plc&&nj===plc))sure.push(m);else maybe.push(m);
  }
  const item=m=>el('li',{},[gLink(m.page,m.title&&m.title.indexOf(m.code)>=0?m.title:m.code+(m.title?': '+m.title:'')),m.title&&m.title.indexOf(m.juris)>=0?null:el('span',{cls:'what',text:' · '+m.juris})]);
  if(sure.length){
    wrap.append(el('div',{cls:'note',text:'On every ballot in '+(plc?at.place+' and ':'')+at.county+' County:'}));
    wrap.append(el('ul',{cls:'locallist'},sure.map(item)));
  }
  if(maybe.length){
    wrap.append(el('div',{cls:'note',text:(sure.length?'Also in ':'In ')+at.county+' County. These depend on your exact address (your town, school, fire or water district), so check your sample ballot:'}));
    wrap.append(el('ul',{cls:'locallist'},maybe.map(item)));
  }
  if(!at.place&&!/^(Denver|Broomfield)$/.test(at.county))wrap.append(el('div',{cls:'note',text:'We could not tell which town this spot is in, so town questions are listed under "depend on your exact address".'}));
  wrap.append(el('div',{cls:'note'},[gLink(G.local[at.county]&&G.local[at.county].page,'All '+list.length+' local measures in '+at.county+' County →')]));
  return wrap;
}
function renderBallot(at){
  const b=data.ballot,c=data.candidates;
  if(!b){return;}
  const r=(c&&c.races)||{};
  const box=[el('h3',{text:'On your ballot'}),el('div',{cls:'note',text:b.election+'. '+b.status})];
  box.push(el('div',{cls:'note'},['Races, from the ',link('https://www.coloradosos.gov/pubs/elections/vote/generalCandidates.html','official candidate list ↗'),':']));
  if(data.guide)box.push(el('div',{cls:'note'},['Click any name or measure for its page in the ',gLink(data.guide.home,'voter guide'),'.']));
  box.push(raceBlock('U.S. Senate',r.us_senate,null,'us_senate'));
  const gov=el('div',{cls:'race'},[el('b',{},[gLink(data.guide&&data.guide.races.governor,'Governor and Lieutenant Governor')])]),gl=el('ul');
  for(const t of govTickets(r)){
    const G=data.guide;
    gl.append(el('li',{},[gLink(G&&G.candidates['governor|'+t.name],t.name),t.mate?' and ':'',t.mate?gLink(G&&G.candidates['lt_governor|'+t.mate],t.mate):null,el('span',{text:' · '+t.party}),t.writeIn?el('span',{cls:'wi',text:' · write-in'}):null]));
  }
  gov.append(gl);box.push(gov);
  box.push(raceBlock('Attorney General',r.attorney_general,null,'attorney_general'));
  box.push(raceBlock('Secretary of State',r.secretary_of_state,null,'secretary_of_state'));
  box.push(raceBlock('State Treasurer',r.treasurer,null,'treasurer'));
  if(at.cdn){
    box.push(raceBlock('U.S. House, District '+at.cdn,r['us_house:'+at.cdn],null,'us_house:'+at.cdn));
    if(r['board_of_ed:'+at.cdn])box.push(raceBlock('State Board of Education, District '+at.cdn,r['board_of_ed:'+at.cdn],null,'board_of_ed:'+at.cdn));
    if(r['cu_regent:'+at.cdn])box.push(raceBlock('CU Board of Regents, District '+at.cdn,r['cu_regent:'+at.cdn],null,'cu_regent:'+at.cdn));
  }
  if(at.sdn)box.push(r['state_senate:'+at.sdn]?raceBlock('State Senate, District '+at.sdn,r['state_senate:'+at.sdn],null,'state_senate:'+at.sdn):el('div',{cls:'race'},[el('b',{text:'State Senate, District '+at.sdn}),el('div',{cls:'note',text:'Not up this year. Senators serve four-year terms, and about half the seats are elected each cycle.'})]));
  if(at.hdn)box.push(raceBlock('State House, District '+at.hdn,r['state_house:'+at.hdn],null,'state_house:'+at.hdn));
  box.push(el('div',{cls:'note',text:'Judges up for retention, RTD directors, district attorneys and county offices may also be on your ballot. They are not mapped here yet.'}));

  box.push(el('h3',{text:'Measures'}));
  box.push(el('div',{cls:'note'},['Every Colorado voter decides these 14. Details in the ',link(b.bluebook,'Blue Book ↗'),'.']));
  for(const m of b.statewide)box.push(measure(m));
  const rail=b.railDistrict;
  if(at.place&&rail.confirmedPlaces.includes(at.place))box.push(measure(rail,'Rail district'));
  else box.push(el('div',{cls:'note',text:rail.code+' ('+rail.title+') is only for voters inside the Front Range Passenger Rail District. Check your sample ballot to see if you are one of them.'}));
  box.push(localBlock(at));
  box.push(el('div',{cls:'note'},['See your exact ballot: ',link(b.links.sampleBallot,'GoVoteColorado.gov ↗')]));
  ballotBox.replaceChildren(...box);
}

map.on('click',e=>{
  lookup(e.latlng.lat,e.latlng.lng);
  if(window.matchMedia('(max-width:860px)').matches)$('selected').scrollIntoView({behavior:'smooth',block:'start'});
});

$('clear').addEventListener('click',()=>{
  lastPoint=null;
  if(marker){map.removeLayer(marker);marker=null;}
  if(highlight){map.removeLayer(highlight);highlight=null;}
  selected.textContent='No location selected yet.';
  status.textContent='Click anywhere in Colorado to get started.';
  results.replaceChildren();ballotBox.replaceChildren();
  map.fitBounds(CO_BOUNDS,{padding:[10,10]});
});

$('locate').addEventListener('click',()=>{
  if(!navigator.geolocation){status.textContent='Location is not available in this browser.';return;}
  status.textContent='Asking your browser for permission…';
  navigator.geolocation.getCurrentPosition(p=>{
    map.setView([p.coords.latitude,p.coords.longitude],12);
    lookup(p.coords.latitude,p.coords.longitude,'Your location');
  },()=>{status.textContent='Location not shared. You can still click the map or search an address.';},{enableHighAccuracy:false,timeout:10000});
});

/* Address search: OpenStreetMap Nominatim, one request per submit, Colorado only. */
let searching=false;
$('search').addEventListener('submit',async e=>{
  e.preventDefault();
  const q=$('q').value.trim();
  if(!q||searching)return;
  searching=true;status.textContent='Looking up that address…';
  const tries=[q];
  const noUnit=q.replace(/\s*(#|\b(apt|apartment|unit|ste|suite|lot|spc|space|bldg|building|rm|room)\.?)\s*[\w-]+/ig,'').replace(/\s+,/g,',').trim();
  if(noUnit!==q)tries.push(noUnit);
  const noZip=noUnit.replace(/[,\s]*\b\d{5}(-\d{4})?\b\s*$/,'').trim();
  if(noZip!==noUnit)tries.push(noZip);
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),20000);
  try{
    let d=[];
    for(let i=0;i<tries.length&&!d.length;i++){
      if(i)await new Promise(r=>setTimeout(r,1100));   // Nominatim asks for at most one request per second
      const u=new URL('https://nominatim.openstreetmap.org/search');
      // any U.S. address; the Colorado box only ranks Colorado matches first
      u.search=new URLSearchParams({q:tries[i],format:'jsonv2',limit:'1',countrycodes:'us',addressdetails:'1',viewbox:'-109.06,41.01,-102.04,36.99'}).toString();
      const r=await fetch(u,{signal:ctl.signal,headers:{'Accept':'application/json'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      d=await r.json();
    }
    if(!d.length){status.textContent='No U.S. match for that address. Try the street, city and state (no apartment number), or click your spot on the map.';return;}
    const lat=+d[0].lat,lng=+d[0].lon,addr=d[0].address||{};
    map.setView([lat,lng],15);
    lookup(lat,lng,d[0].display_name,addr);
    if(window.matchMedia('(max-width:860px)').matches)$('selected').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    status.textContent='Address search is unavailable right now. You can still click the map.';
  }finally{clearTimeout(t);setTimeout(()=>{searching=false;},1100);}
});

/* ---------- load data ---------- */
async function getJSON(p){const r=await fetch(p,{cache:'no-cache'});if(!r.ok)throw new Error(p+' '+r.status);return r.json();}
Promise.all([
  getJSON(LAYERS.us_house.file),getJSON(LAYERS.state_senate.file),getJSON(LAYERS.state_house.file),
  getJSON('data/counties.geojson'),getJSON('data/places.geojson'),
  getJSON('data/officials.json').catch(()=>null),getJSON('data/candidates.json').catch(()=>null),getJSON('data/ballot.json').catch(()=>null),getJSON('data/guide.json').catch(()=>null)
]).then(([h,s,l,co,pl,off,cand,bal,gd])=>{
  Object.assign(data,{us_house:h,state_senate:s,state_house:l,counties:co,places:pl,officials:off,candidates:cand,ballot:bal,guide:gd});
  data.boulder={type:'FeatureCollection',features:pl.features.filter(f=>f.properties.n==='Boulder')};
  countiesLayer=L.geoJSON(co,{interactive:false,style:{color:'#cfefff',weight:.6,opacity:.35,fill:false,dashArray:'2 4'}}).addTo(map);
  drawLayer('us_house');
  status.textContent='Click anywhere in Colorado to get started.';
}).catch(()=>{status.textContent='The district files did not load. Please reload the page.';});

})();
