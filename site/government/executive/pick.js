"use strict";
// "Show a president" on the executive branch page: fills the president and vice president cards with any presidency,
// and each department card with the heads who served in those years.
// The data rides on each <option> and each card (written by tools/government/build_executive.py). Without JavaScript the current officials show.
(function(){
  var sel=document.getElementById("gv-pres");
  var pc=document.getElementById("gv-pcard"), vc=document.getElementById("gv-vcard");
  if(!sel||!pc||!vc) return;
  sel.closest(".gv-pick").hidden=false;
  function q(c,k){return c.querySelector('[data-k="'+k+'"]');}
  function ord(n){var s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
  var MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function ld(iso){var p=iso.split("-");return MONTHS[+p[1]-1]+" "+(+p[2])+", "+p[0];}
  function dayAfter(a,b){return (Date.parse(b)-Date.parse(a))/864e5;}
  var SRC={d:"the Chamberlain dataset",w:"Wikipedia",o:"the department’s list"};
  function mark(r){
    if(r.chk==="o") return "";
    var a=r.chk==="od"?"Name is on the department’s list. ":"Not on an official list we could read. ";
    return a+(r.agree?"Dates agree in two other sources.":"Dates from "+(SRC[r.src]||"another source")+" only.");
  }
  var vname=q(vc,"vname"), vtiles=q(vc,"vtiles"), vlist=q(vc,"vlist"), vn=q(vc,"vn");
  var orig={vname:vname.cloneNode(true),vn:vn.textContent};
  var depts=Array.prototype.slice.call(document.querySelectorAll(".gv-dept[data-heads]")).map(function(c){
    var offices=c.getAttribute("data-offices").split("~");
    var rows=c.getAttribute("data-heads").split("~").map(function(x){
      var p=x.split("|"); return {office:offices[+p[0]],name:p[1],s:p[2],e:p[3],chk:p[4],src:p[5],agree:p[6]==="1",note:p[7]||""};
    });
    return {card:c,title:c.getAttribute("data-title"),rows:rows};
  });
  function li(text,cls){var l=document.createElement("li"); if(cls) l.className=cls; l.textContent=text; return l;}
  function fillDept(D,s,e,cur,today){
    var c=D.card, past=q(c,"past"), h=q(c,"pasth"), ul=q(c,"plist");
    var head=c.querySelector(".gv-dept-head"), who=q(c,"who");
    ul.textContent="";
    var rows=D.rows.filter(function(r){return r.s<e && (r.e||today)>s;});
    if(cur) rows=rows.filter(function(r){return r.e;});
    head.hidden=!cur; if(who) who.hidden=!cur;
    if(cur && !rows.length){past.hidden=true; return;}
    past.hidden=false;
    h.className="gv-past-h";
    if(cur){h.textContent="Earlier in this term";}
    else if(!rows.length){
      var first=D.rows[0];
      h.className="gv-past-none";
      if(first.s>=e){h.textContent="Not created yet. The first "+first.office+" took office on "+ld(first.s)+".";}
      else{h.textContent="No head is listed for these years.";}
      return;
    }
    else{h.textContent=rows.length===1?"Led by":"Led by, in order";}
    // a gap is shown only when the dates on both sides of it are firm (on an official list, or agreed by two sources)
    var at=s, atFirm=true;
    rows.forEach(function(r){
      var firm=r.chk==="o"||r.agree;
      if(!cur && atFirm && firm && dayAfter(at,r.s)>30) ul.appendChild(li("No head is listed from "+ld(at)+" to "+ld(r.s)+".","gv-gap"));
      var l=document.createElement("li"), b=document.createElement("strong"), sp=document.createElement("span");
      b.textContent=r.name; l.appendChild(b);
      if(r.office!==D.title){var o=document.createElement("span"); o.className="gv-office"; o.textContent=r.office; l.appendChild(o);}
      sp.className="gv-muted"; sp.textContent=ld(r.s)+" to "+(r.e?ld(r.e):"now"); l.appendChild(sp);
      if(r.note){var n=document.createElement("span"); n.className="gv-muted"; n.textContent=r.note.charAt(0).toUpperCase()+r.note.slice(1)+"."; l.appendChild(n);}
      var mk=mark(r); if(mk){var m=document.createElement("small"); m.className="gv-mark"; m.textContent=mk; l.appendChild(m);}
      ul.appendChild(l);
      if((r.e||today)>at){at=r.e||today; atFirm=firm;}
    });
    if(!cur && atFirm && at<e && dayAfter(at,e)>30) ul.appendChild(li("No head is listed from "+ld(at)+" to "+ld(e)+".","gv-gap"));
  }
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
    if(dn){dn.hidden=cur; dn.textContent=cur?"":"Showing who led each department while "+d.name+" was president, "+d.start+" to "+(now?"now":d.end)+".";}
    var today=sel.options[0].dataset.e;
    depts.forEach(function(D){fillDept(D,d.s,d.e,cur,today);});
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
  show();
})();
