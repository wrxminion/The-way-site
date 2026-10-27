(function(){
'use strict';
function update(){
  var signed=false;
  try{
    var state=JSON.parse(localStorage.getItem('theway.bar')||'null');
    for(var i=0;i<localStorage.length;i++){
      if(/^sb-.+-auth-token$/.test(localStorage.key(i)||'') && state && state.v===1 && typeof state.name==='string' && state.name.trim()){signed=true;break;}
    }
  }catch(e){}
  document.querySelectorAll('.essay-quick-access').forEach(function(n){n.hidden=signed;});
}
document.querySelectorAll('.essay-quick-search').forEach(function(form){form.addEventListener('submit',function(e){e.preventDefault();var value=form.querySelector('input').value.trim();location.href='/search/'+(value?'?q='+encodeURIComponent(value):'');});});
window.addEventListener('storage',update);
update();
})();