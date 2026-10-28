"use strict";
document.querySelectorAll("[data-sequence]").forEach(function(sequence){
  const stops=Array.from(sequence.querySelectorAll("[data-step]"));
  const panels=Array.from(sequence.querySelectorAll(".gw-panel"));
  const controls=sequence.querySelector(".gw-controls");
  const previous=sequence.querySelector("[data-prev]");
  const next=sequence.querySelector("[data-next]");
  const all=sequence.querySelector("[data-all]");
  const position=sequence.querySelector("[data-position]");
  let current=0,showAll=false;
  function render(){
    panels.forEach(function(panel,i){panel.hidden=!showAll && i!==current;});
    stops.forEach(function(stop,i){
      if(!showAll && i===current) stop.setAttribute("aria-current","step");
      else stop.removeAttribute("aria-current");
      stop.setAttribute("aria-expanded",String(showAll || i===current));
    });
    previous.disabled=showAll || current===0;
    next.disabled=showAll || current===panels.length-1;
    position.textContent=showAll?"All "+panels.length+" steps":(current+1)+" of "+panels.length;
    all.textContent=showAll?"Show one step":"Read all steps";
    all.setAttribute("aria-pressed",String(showAll));
  }
  function select(index,focusPanel){
    current=index;showAll=false;render();
    if(focusPanel) panels[current].focus({preventScroll:true});
  }
  stops.forEach(function(stop,i){
    stop.addEventListener("click",function(){select(i,true);});
    stop.addEventListener("keydown",function(event){
      let target;
      if(event.key==="ArrowRight" || event.key==="ArrowDown") target=(i+1)%stops.length;
      if(event.key==="ArrowLeft" || event.key==="ArrowUp") target=(i+stops.length-1)%stops.length;
      if(event.key==="Home") target=0;
      if(event.key==="End") target=stops.length-1;
      if(target!==undefined){event.preventDefault();stops[target].focus();select(target,false);}
    });
  });
  previous.addEventListener("click",function(){if(current>0)select(current-1,true);});
  next.addEventListener("click",function(){if(current<panels.length-1)select(current+1,true);});
  all.addEventListener("click",function(){showAll=!showAll;render();});
  function openHash(){
    const index=panels.findIndex(function(panel){return "#"+panel.id===location.hash;});
    if(index>=0)select(index,false);
  }
  controls.hidden=false;openHash();render();
  window.addEventListener("hashchange",openHash);
});
