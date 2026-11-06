"use strict";
// Member search on the Congress page: filters the state lists by name, state or district.
(function(){
  var box=document.querySelector(".gv-search");
  var input=document.getElementById("gv-q");
  if(!box||!input) return;
  var states=Array.prototype.slice.call(document.querySelectorAll(".gv-state"));
  var count=document.getElementById("gv-count");
  box.hidden=false;
  function run(){
    var q=input.value.trim().toLowerCase();
    var shown=0;
    states.forEach(function(st){
      var any=false;
      var placeHit=q&&st.getAttribute("data-place").indexOf(q)>=0;
      st.querySelectorAll("li[data-q]").forEach(function(li){
        var hit=!q||placeHit||li.getAttribute("data-q").indexOf(q)>=0;
        li.hidden=!hit; if(hit){any=true;shown++;}
      });
      st.hidden=!any;
      if(q) st.open=any; else st.open=false;
    });
    var unit=box.getAttribute("data-unit")||"member";count.textContent=q?(shown+" "+unit+(shown===1?"":"s")):"";
  }
  input.addEventListener("input",run);
})();
