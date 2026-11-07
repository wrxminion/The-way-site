"use strict";
// "Show a president" on the executive branch page: fills the president and vice president cards with any presidency.
// The data rides on each <option> (written by tools/government/build_executive.py). Without JavaScript the current pair shows.
(function(){
  var sel=document.getElementById("gv-pres");
  var pc=document.getElementById("gv-pcard"), vc=document.getElementById("gv-vcard");
  if(!sel||!pc||!vc) return;
  sel.closest(".gv-pick").hidden=false;
  function q(c,k){return c.querySelector('[data-k="'+k+'"]');}
  function ord(n){var s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
  var vname=q(vc,"vname"), vtiles=q(vc,"vtiles"), vlist=q(vc,"vlist"), vn=q(vc,"vn");
  var orig={vname:vname.cloneNode(true),vn:vn.textContent};
  function show(){
    var o=sel.options[sel.selectedIndex], d=o.dataset, cur=sel.value===sel.getAttribute("data-current");
    var now=d.end.indexOf("now|")===0;
    q(pc,"pn").textContent=ord(+o.value)+" president";
    var a=q(pc,"pname").querySelector("a");
    a.textContent=d.name; a.href="/government/presidents/"+d.slug+".html";
    q(pc,"pmeta").textContent=[d.party,d.how].filter(Boolean).join(" · ");
    q(pc,"pl1").textContent=now?"In office since":"Took office";
    q(pc,"ps").textContent=d.start;
    q(pc,"pl2").textContent=now?"Current term ends":"Left office";
    q(pc,"pe").textContent=now?d.end.slice(4):d.end;
    var m=q(pc,"pmore").querySelector("a");
    m.textContent="Open "+d.name+"’s page: the money during their years and who they appointed →";
    m.href="/government/presidents/"+d.slug+".html";
    var pn=document.getElementById("gv-pick-note"), dn=document.getElementById("gv-dept-note");
    if(pn) pn.hidden=cur;
    if(dn){dn.hidden=cur; dn.textContent=cur?"":"You picked "+d.name+". These department heads are today’s, not the ones who served with "+d.name+". Each president’s cabinet is not on this page yet.";}
    if(cur){
      vname.replaceChildren.apply(vname,Array.prototype.slice.call(orig.vname.cloneNode(true).childNodes)); vn.textContent=orig.vn; vtiles.hidden=false; vlist.hidden=true; return;
    }
    var vps=d.vps?d.vps.split("~"):[];
    vtiles.hidden=true;
    vlist.textContent="";
    vps.forEach(function(v){
      var p=v.split("|"), li=document.createElement("li"), b=document.createElement("strong"), sp=document.createElement("span");
      sp.className="gv-muted"; sp.textContent=p[1]+" to "+p[2];
      if(p[3]){var a=document.createElement("a"); a.href="/government/presidents/"+p[3]+".html"; a.textContent=p[0]; b.appendChild(a);} else b.textContent=p[0];
      if(vps.length>1) li.appendChild(b);
      li.appendChild(sp); vlist.appendChild(li);
    });
    vlist.hidden=vps.length===0;
    vn.textContent=vps.length>1?"Vice presidents":"Vice president";
    vname.textContent=vps.length===0?"None during this presidency":vps.length===1?"":vps.length+" during this presidency";
    if(vps.length===1){var v1=vps[0].split("|");
      if(v1[3]){var a1=document.createElement("a"); a1.href="/government/presidents/"+v1[3]+".html"; a1.textContent=v1[0]; vname.appendChild(a1);} else vname.textContent=v1[0];}
  }
  sel.addEventListener("change",show);
})();
