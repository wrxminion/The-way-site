(function(){
  // Deadline badges: <span class="when" data-date="2026-10-05"></span>
  var today=new Date();today.setHours(0,0,0,0);
  document.querySelectorAll('.when[data-date]').forEach(function(el){
    var p=el.getAttribute('data-date').split('-');
    var d=new Date(+p[0],+p[1]-1,+p[2]);
    var days=Math.round((d-today)/864e5);
    if(days<0){el.textContent='passed';el.classList.add('passed');}
    else if(days===0){el.textContent='today';el.classList.add('soon');}
    else{el.textContent=days===1?'tomorrow':days+' days left';if(days<=7)el.classList.add('soon');}
  });

  // News from this state: <section class="newsfeed" data-feed="../news/data/states/co.json">. Text only via textContent.
  var feed=document.querySelector('.newsfeed[data-feed]');
  if(feed&&window.fetch){
    var list=feed.querySelector('.news-list'),status=feed.querySelector('.news-status');
    var fmt=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'});
    fetch(feed.getAttribute('data-feed'),{cache:'no-cache',credentials:'same-origin'}).then(function(r){
      if(r.status===404)return {items:[]};
      if(!r.ok)throw new Error('http');
      return r.json();
    }).then(function(doc){
      var items=(doc&&Array.isArray(doc.items)?doc.items:[]).filter(function(it){
        return it&&typeof it.title==='string'&&typeof it.url==='string'&&/^https?:\/\//i.test(it.url);
      }).slice(0,10);
      if(!items.length){status.textContent='No recent headlines for this state yet.';return;}
      items.forEach(function(it){
        var li=document.createElement('li'),a=document.createElement('a'),meta=document.createElement('span');
        a.textContent=it.title.slice(0,400);a.href=(typeof it.source_url==='string'&&/^https?:\/\//i.test(it.source_url))?it.source_url:it.url;a.target='_blank';a.rel='noopener noreferrer nofollow';
        var when=it.published_at||it.first_seen_at,t=null;
        if(typeof when==='string'){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(when);t=m?new Date(+m[1],+m[2]-1,+m[3]):new Date(when);}
        meta.className='meta';
        meta.textContent=[typeof it.source==='string'?it.source.slice(0,120):'',t&&!isNaN(t)?fmt.format(t):'','unchecked',it.snapshot&&it.snapshot.status==='snapped'?'snapped':'not snapped'].filter(Boolean).join(' · ');
        li.appendChild(a);li.appendChild(meta);list.appendChild(li);
      });
      status.textContent='';
    }).catch(function(){status.textContent='News could not be loaded right now.';});
  }

  // State list filters and search (index page only)
  var grid=document.getElementById('grid');
  if(!grid)return;
  var items=[].slice.call(grid.children);
  var buttons=[].slice.call(document.querySelectorAll('.filters button'));
  var q=document.getElementById('q');
  var count=document.getElementById('count');
  var active='all';
  function apply(){
    var text=(q&&q.value||'').trim().toLowerCase();
    var shown=0;
    items.forEach(function(li){
      var tags=(li.getAttribute('data-tags')||'').split(' ');
      var ok=(active==='all'||tags.indexOf(active)>=0)&&(!text||li.getAttribute('data-name').indexOf(text)>=0);
      li.hidden=!ok;if(ok)shown++;
    });
    count.textContent=shown+(shown===1?' state':' states')+' shown'+(shown===items.length?'':' of '+items.length);
  }
  buttons.forEach(function(b){
    b.addEventListener('click',function(){
      active=b.getAttribute('data-filter');
      buttons.forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
      apply();
    });
  });
  if(q)q.addEventListener('input',apply);
  document.querySelector('.filters').hidden=false;
  if(q)q.parentNode.hidden=false;
  apply();
})();

(function(){
  // Step 1: "Pick your state / enter your address". The address never leaves this page except in the
  // address part of the link (after #, which the web server never receives); the map page looks it up and does not store it.
  (function(){
    var form=document.getElementById('vg-addr'),msg=document.getElementById('vg-addr-msg');
    if(!form||!msg)return;
    var N={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
    var byName={};Object.keys(N).forEach(function(k){byName[N[k].toLowerCase()]=k;});
    function stateOf(t){
      t=t.replace(/[,\s]*\b\d{5}(-\d{4})?\s*$/,'').replace(/[\s,.]+$/,'');
      var m=/(?:^|[\s,])([A-Za-z]{2})$/.exec(t);
      if(m&&N[m[1].toUpperCase()]&&(t.length===2||/[\s,]/.test(t.charAt(t.length-3)||' ')))return m[1].toUpperCase();
      var low=t.toLowerCase(),best='';
      Object.keys(byName).forEach(function(n){if((low===n||low.slice(-n.length-1).replace(/^[\s,]/,'')===n&&/[\s,]/.test(low.charAt(low.length-n.length-1)))&&n.length>best.length)best=n;});
      return best?byName[best]:'';
    }
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var q=document.getElementById('vg-q').value.trim();
      msg.classList.remove('warn');
      if(!q){msg.classList.add('warn');msg.textContent='Type your address with your state at the end, or click your state on the map below.';return;}
      var st=stateOf(q);
      if(!st){msg.classList.add('warn');msg.textContent='Put your state at the end, like "Denver, CO 80202", or click your state on the map below.';return;}
      var only=q.replace(/[,\s.]/g,'').length<=N[st].length&&(q.length===2||q.toLowerCase()===N[st].toLowerCase());
      location.href='/preview/pages/map'+(st==='CO'?'':'-'+st.toLowerCase())+'/'+(only?'':'#q='+encodeURIComponent(q));
    });
  })();
})();
