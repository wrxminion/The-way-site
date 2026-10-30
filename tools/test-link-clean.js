global.window={}; require('../site/members/link-clean.js'); const A=window.WayLink.analyze; const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)){console.log('FAIL',m,JSON.stringify(a),JSON.stringify(b));process.exitCode=1}};
let r=A('https://example.com/a?id=5&utm_source=facebook&utm_medium=social&fbclid=ABC#x'); eq(r.clean,'https://example.com/a?id=5','clean1'); eq(r.types,['facebook'],'t1'); eq(r.params.includes('fbclid=ABC'),true,'p1');
r=A('https://news.google.com/rss/articles/CBM?oc=5'); eq(r.googleNews,true,'gn'); eq(r.clean,'','gn clean');
r=A('https://www.google.com/url?q=https%3A%2F%2Fnyt.com%2Fx%3Fgclid%3D1&sa=U&ved=2'); eq(r.clean,'https://nyt.com/x','unwrap'); eq(r.types,['google'],'ug');
r=A('https://a.com/p?mc_cid=1&mc_eid=2&ref=tw'); eq(r.types,['newsletter','other'],'mc'); eq(r.clean,'https://a.com/p','mc clean');
eq(A('javascript:alert(1)').clean,'','js'); eq(A('https://a.com/p?q=keep&page=2').clean,'https://a.com/p?q=keep&page=2','keep');
r=A('https://a.com/p?utm_source=google&utm_medium=cpc'); eq(r.types,['google'],'utm g');
console.log('link-clean ok');
