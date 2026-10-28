const r=document.getElementById('return');
window.addEventListener('scroll',()=>r.classList.toggle('show',scrollY>innerHeight*.7),{passive:true});
