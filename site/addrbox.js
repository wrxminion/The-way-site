(function(){
  // Front page, "Find your ballot": enter your street address. The address never leaves this page except in the
  // address part of the link (after #, which the web server never receives); the map page looks it up and does not store it.
  (function(){
    var form=document.getElementById('fb-addr'),msg=document.getElementById('fb-msg');
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
      var q=document.getElementById('fb-q').value.trim();
      msg.classList.remove('warn');
      if(!q){msg.classList.add('warn');msg.textContent='Type your address with your state at the end, or click your state on the map below.';return;}
      var st=stateOf(q);
      if(!st){msg.classList.add('warn');msg.textContent='Put your state at the end, like "Denver, CO 80202", or click your state on the map below.';return;}
      var only=q.replace(/[,\s.]/g,'').length<=N[st].length&&(q.length===2||q.toLowerCase()===N[st].toLowerCase());
      location.href='/map'+(st==='CO'?'':'-'+st.toLowerCase())+'/'+(only?'':'#q='+encodeURIComponent(q));
    });
  })();
})();
