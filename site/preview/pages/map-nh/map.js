(function(){'use strict';

/* The Way: state district explorer (one copy per state, settings in data/config.json).
   Everything runs in the browser from static files in data/. A clicked point is
   matched against the district polygons locally; nothing is sent to a server.
   All text from data files is inserted with textContent, never as HTML. */

const $=id=>document.getElementById(id);
const selected=$('selected'),status=$('status'),results=$('results'),ballotBox=$('ballot');
let C=null; // config
const LAYERS={
  us_house:{file:'data/us-house.geojson',label:'U.S. House',noun:'Congressional District',short:'Congressional District'},
  state_senate:{file:'data/state-senate.geojson',label:'State Senate',noun:'State Senate District',short:'Senate District'},
  state_house:{file:'data/state-house.geojson',label:'State House',noun:'State House District',short:'House District'}
};

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
let map=null,streets=null,tileLoads=0,tileFails=0;
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
function cityLayerKey(k){return k.startsWith('city:');}
function districtName(key,f){
  if(cityLayerKey(key))return 'City of '+f.properties.n;
  return LAYERS[key].noun+' '+f.properties.d;
}
function layerData(key){
  if(cityLayerKey(key)){const n=key.slice(5);return {type:'FeatureCollection',features:(data.places?data.places.features:[]).filter(f=>f.properties.n===n)};}
  return data[key];
}
function drawLayer(key){
  activeKey=key;
  document.querySelectorAll('.layer').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layer===key)));
  $('maplabel').textContent=(cityLayerKey(key)?key.slice(5)+' city limits':LAYERS[key].label+' districts')+' · click to inspect';
  if(districtLayer)map.removeLayer(districtLayer);
  const fc=layerData(key);
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
  if(cityLayerKey(key)&&fc.features.length)map.fitBounds(districtLayer.getBounds(),{padding:[30,30]});
  if(lastPoint)drawHighlight(lastPoint.lat,lastPoint.lng);
}

function drawHighlight(lat,lng){
  if(highlight){map.removeLayer(highlight);highlight=null;}
  const f=find(layerData(activeKey),lat,lng);
  if(f)highlight=L.geoJSON(f,{interactive:false,style:{color:'#ffffff',weight:3,fillColor:'#a6f0e7',fillOpacity:.32}}).addTo(map);
  if(marker)marker.bringToFront();
}

/* ---------- lookup and sidebar ---------- */
function partyText(p){return p?' ('+p+')':'';}
function officeCard(kind,value,holder,extra){
  const detail=el('div',{cls:'detail'});
  if(Array.isArray(holder)&&holder.length){ // multi-member districts (for example Arizona House: two per district)
    detail.append('Held today by ');
    holder.forEach((h,i)=>{if(i)detail.append(i===holder.length-1?' and ':', ');detail.append(el('b',{text:h.name}),partyText(h.party));});
    detail.append('.');
  }else if(Array.isArray(holder)){
    detail.append('Our source lists no current member for this seat. It may be vacant or newly filled.');
  }else if(holder){
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

function lookup(lat,lng,label){
  lastPoint={lat,lng};
  if(marker)map.removeLayer(marker);
  marker=L.circleMarker([lat,lng],{radius:8,weight:2,color:'#fff',fillColor:'#67eadc',fillOpacity:1}).addTo(map);
  selected.replaceChildren(label?el('b',{text:label}):el('span',{},['Selected point: ',el('b',{text:lat.toFixed(5)+', '+lng.toFixed(5)})]));
  results.replaceChildren();ballotBox.replaceChildren();
  const cd=find(data.us_house,lat,lng),sd=find(data.state_senate,lat,lng),hd=find(data.state_house,lat,lng);
  const county=find(data.counties,lat,lng),place=find(data.places,lat,lng);
  drawHighlight(lat,lng);
  if(!cd&&!sd&&!hd){
    status.textContent='That point is outside '+C.name+'. This map covers '+C.name+' only.';
    return;
  }
  status.textContent='Here is what applies at this spot.';
  const o=data.officials||{};
  const cdn=cd&&String(cd.properties.d),sdn=sd&&String(sd.properties.d),hdn=hd&&String(hd.properties.d);
  if(cd)results.append(officeCard('U.S. House',(C.atLarge?'At-large district':'Congressional District '+cdn),(o.us_house||{})[cdn]||null,C.congressNote));
  if(sd)results.append(officeCard('State Senate','Senate District '+sdn,(o.state_senate||{})[sdn]||null));
  if(hd)results.append(officeCard('State House','House District '+hdn,(o.state_house||{})[hdn]||null));
  results.append(el('div',{cls:'result'},[
    el('div',{cls:'kind',text:'County and city'}),
    el('div',{cls:'value',text:(county?county.properties.n+' County':'County not found')}),
    el('div',{cls:'detail',text:place?'Inside '+place.properties.n+' city limits.':'Not inside the city limits of a city we map.'})
  ]));
  if(o.us_senate&&o.us_senate.length){
    const d=el('div',{cls:'detail'});
    d.append('Held today by ');
    o.us_senate.forEach((s,i)=>{if(i)d.append('; ');d.append(el('b',{text:s.name}),partyText(s.party));});
    d.append('. Both represent all of '+C.name+'.');
    if(C.senateNote)d.append(' '+C.senateNote);
    results.append(el('div',{cls:'result'},[el('div',{cls:'kind',text:'U.S. Senate'}),el('div',{cls:'value',text:'Statewide'}),d]));
  }
  renderBallot({cdn,sdn,hdn,county:county&&county.properties.n,place:place&&place.properties.n});
}

/* links into the voter guide (guide.json is written by the guide generator) */
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
function measure(m,tag){
  const body=el('div',{cls:'body'},[el('p',{text:m.what})]);
  const rel=data.guide&&data.guide.measures[m.code];
  if(rel)body.append(el('p',{},[gLink(rel,'Full page: official ballot title, full text, and what each vote means →')]));
  if(m.yes)body.append(el('p',{},[el('b',{text:'Yes: '}),m.yes,' ',el('b',{text:'No: '}),m.no]));
  if(m.note)body.append(el('p',{cls:'note',text:m.note}));
  if(m.needs)body.append(el('p',{cls:'note',text:'Needs '+m.needs}));
  return el('details',{cls:'measure'},[el('summary',{},[el('b',{text:m.code}),' '+m.title,tag?el('span',{cls:'tag',text:tag}):null]),body]);
}

function renderBallot(at){
  const b=data.ballot,c=data.candidates;
  if(!b){return;}
  const r=(c&&c.races)||{},names=(c&&c.raceNames)||{};
  const box=[el('h3',{text:'On your ballot'}),el('div',{cls:'note',text:b.election+'. '+b.status})];
  box.push(el('div',{cls:'note'},['Races, from the ',link(C.officialList.url,C.officialList.label+' ↗'),':']));
  if(data.guide)box.push(el('div',{cls:'note'},['Click any name or measure for its page in the ',gLink(data.guide.home,'voter guide'),'.']));
  for(const k of (c&&c.statewideOrder)||[])if(r[k])box.push(raceBlock(names[k]||k,r[k],null,k));
  if(at.cdn){const k='us_house:'+at.cdn;box.push(raceBlock(names[k]||('U.S. House, District '+at.cdn),r[k],'No candidates listed.',k));}
  if(at.sdn){const k='state_senate:'+at.sdn;box.push((r[k]&&r[k].length)?raceBlock(names[k]||('State Senate, District '+at.sdn),r[k],null,k):el('div',{cls:'race'},[el('b',{text:'State Senate, District '+at.sdn}),el('div',{cls:'note',text:C.senateNotUp})]));}
  if(at.hdn){const k='state_house:'+at.hdn;box.push((r[k]&&r[k].length)?raceBlock(names[k]||('State House, District '+at.hdn),r[k],null,k):el('div',{cls:'race'},[el('b',{text:'State House, District '+at.hdn}),el('div',{cls:'note',text:C.houseNotOnBallot||'Not on the general election ballot this year.'})]));}
  if(C.otherRacesNote)box.push(el('div',{cls:'note',text:C.otherRacesNote}));

  box.push(el('h3',{text:'Measures'}));
  if(b.statewideNote)box.push(el('div',{cls:'note'},[b.statewideNote+' ',b.links&&b.links.measures?link(b.links.measures,'Official source ↗'):null]));
  for(const m of b.statewide)box.push(measure(m));
  if(at.county){
    const loc=data.guide&&data.guide.local[at.county];
    if(loc&&loc.count)box.push(el('div',{cls:'note'},['All local measures we have for ',gLink(loc.page,at.county+' County ('+loc.count+') →'),' Which ones you see depends on exactly where you live.']));
    else box.push(el('div',{cls:'note',text:'Local measures for '+at.county+' County are not in this guide yet.'}));
  }
  box.push(el('div',{cls:'note'},['See your exact ballot: ',link(C.sampleBallot.url,C.sampleBallot.label+' ↗')]));
  ballotBox.replaceChildren(...box);
}

function wire(){
  document.querySelectorAll('.layer').forEach(b=>b.addEventListener('click',()=>drawLayer(b.dataset.layer)));
  map.on('click',e=>{
    lookup(e.latlng.lat,e.latlng.lng);
    if(window.matchMedia('(max-width:860px)').matches)$('selected').scrollIntoView({behavior:'smooth',block:'start'});
  });
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
  $('clear').addEventListener('click',()=>{
    lastPoint=null;
    if(marker){map.removeLayer(marker);marker=null;}
    if(highlight){map.removeLayer(highlight);highlight=null;}
    selected.textContent='No location selected yet.';
    status.textContent='Click anywhere in '+C.name+' to get started.';
    results.replaceChildren();ballotBox.replaceChildren();
    map.fitBounds(C.bounds,{padding:[10,10]});
  });
  $('locate').addEventListener('click',()=>{
    if(!navigator.geolocation){status.textContent='Location is not available in this browser.';return;}
    status.textContent='Asking your browser for permission…';
    navigator.geolocation.getCurrentPosition(p=>{
      map.setView([p.coords.latitude,p.coords.longitude],12);
      lookup(p.coords.latitude,p.coords.longitude,'Your location');
    },()=>{status.textContent='Location not shared. You can still click the map or search an address.';},{enableHighAccuracy:false,timeout:10000});
  });
  /* Address search: OpenStreetMap Nominatim, one request per submit, this state only. */
  let searching=false;
  $('search').addEventListener('submit',async e=>{
    e.preventDefault();
    const q=$('q').value.trim();
    if(!q||searching)return;
    searching=true;status.textContent='Looking up that address…';
    const u=new URL('https://nominatim.openstreetmap.org/search');
    const bb=C.bounds,re=new RegExp(C.name+'|\\b'+C.abbr+'\\b','i');
    u.search=new URLSearchParams({q:re.test(q)?q:q+', '+C.name,format:'jsonv2',limit:'1',countrycodes:'us',viewbox:[bb[0][1],bb[1][0],bb[1][1],bb[0][0]].join(','),bounded:'1'}).toString();
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),12000);
    try{
      const r=await fetch(u,{signal:ctl.signal,headers:{'Accept':'application/json'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      if(!d.length){status.textContent='No '+C.name+' match for that address. Try adding the city, or click the map.';return;}
      const lat=+d[0].lat,lng=+d[0].lon;
      map.setView([lat,lng],13);
      lookup(lat,lng,d[0].display_name);
    }catch(err){
      status.textContent='Address search is unavailable right now. You can still click the map.';
    }finally{clearTimeout(t);setTimeout(()=>{searching=false;},1100);}
  });
}

/* ---------- load data ---------- */
async function getJSON(p){const r=await fetch(p,{cache:'no-cache'});if(!r.ok)throw new Error(p+' '+r.status);return r.json();}
getJSON('data/config.json').then(cfg=>{
  C=cfg;
  const b=C.bounds,pad=1.5;
  map=L.map('map',{zoomSnap:.25,minZoom:5,maxBounds:[[b[0][0]-pad,b[0][1]-pad*1.5],[b[1][0]+pad,b[1][1]+pad*1.5]],maxBoundsViscosity:.8,attributionControl:true});
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Boundaries: U.S. Census Bureau');
  map.fitBounds(C.bounds,{padding:[10,10]});
  wire();
  return Promise.all([
    getJSON(LAYERS.us_house.file),getJSON(LAYERS.state_senate.file),getJSON(LAYERS.state_house.file),
    getJSON('data/counties.geojson'),getJSON('data/places.geojson').catch(()=>({type:'FeatureCollection',features:[]})),
    getJSON('data/officials.json').catch(()=>null),getJSON('data/candidates.json').catch(()=>null),getJSON('data/ballot.json').catch(()=>null),getJSON('data/guide.json').catch(()=>null)
  ]);
}).then(([h,s,l,co,pl,off,cand,bal,gd])=>{
  Object.assign(data,{us_house:h,state_senate:s,state_house:l,counties:co,places:pl,officials:off,candidates:cand,ballot:bal,guide:gd});
  countiesLayer=L.geoJSON(co,{interactive:false,style:{color:'#cfefff',weight:.6,opacity:.35,fill:false,dashArray:'2 4'}}).addTo(map);
  drawLayer('us_house');
  status.textContent='Click anywhere in '+C.name+' to get started.';
}).catch(()=>{status.textContent='The district files did not load. Please reload the page.';});

})();
