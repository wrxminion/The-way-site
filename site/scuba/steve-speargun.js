(function(root){function rig(t,uri,fired){
 const phase=t*Math.PI*2/1.75,a=10*Math.sin(phase),k=16*Math.sin(phase-.18);
 const image='<use href="#art"/>',part=(name)=>`<g clip-path="url(#${name})">${image}</g>`;
 let s=`<defs><image id="art" href="${uri}" width="1774" height="887"/><clipPath id="body"><rect x="${fired?146:0}" width="${fired?884:1030}" height="887"/></clipPath><clipPath id="tip"><rect width="148" height="887"/></clipPath><clipPath id="upper"><path d="M1000 0H1774V630L1700 610L1600 575L1500 540L1450 520L1400 490L1360 505L1300 524L1260 532L1220 548L1160 565L1080 562L1000 550Z"/></clipPath><clipPath id="lower"><path d="M1000 550L1080 562L1160 565L1220 548L1260 532L1300 524L1360 505L1400 490L1450 520L1500 540L1600 575L1700 610L1774 630V887H1000Z"/></clipPath><clipPath id="thigh"><rect x="1000" y="420" width="230" height="467"/></clipPath><clipPath id="calf"><rect x="1185" width="589" height="887"/></clipPath></defs>`;
 for(const [name,sign,hipY,kneeY] of [['lower',-1,555,636],['upper',1,485,526]])s+=`<g transform="rotate(${a*sign} 1005 ${hipY})"><g transform="rotate(${k*sign} 1200 ${kneeY})"><g clip-path="url(#${name})">${part('calf')}</g></g><g clip-path="url(#${name})">${part('thigh')}</g></g>`;
 return s+part('body');
}
function scene(t,uri,fire=true,transparent=false,opt){opt=opt||{};const spd=opt.speed||1,climb=opt.climb||0;
 const shot=1.4,dt=t-shot,fired=fire&&dt>=0,recoil=fired?95*Math.exp(-dt*3)*Math.sin(Math.min(dt/.13,1)*Math.PI/2):0,tilt=fired?-4*Math.exp(-dt*3)*Math.sin(Math.min(dt/.13,1)*Math.PI/2):0;
 let s=transparent?'':'<defs><linearGradient id="water" x2="0" y2="1"><stop stop-color="#103d50"/><stop offset="1" stop-color="#081f32"/></linearGradient></defs><rect width="1100" height="620" fill="url(#water)"/>';
 const x=210+recoil*.43,y=110+2*Math.sin(t*2);
 s+=`<g transform="translate(${x} ${y}) scale(.46) rotate(${tilt} 800 460)">${rig(t,uri,fired)}</g>`;
 if(fired&&dt<1.1/spd){const travel=dt*1900*spd,tilt2=climb?Math.atan(climb)*180/Math.PI:0;s+=`<g transform="translate(${x-travel*.46} ${y-travel*.46*climb}) rotate(${tilt2} 74 443) scale(.46)"><g clip-path="url(#tip)"><use href="#art"/></g></g>`;}
 if(fired&&dt<1.2){const fade=Math.max(0,1-dt/1.2),mx=x+66,my=y+230;for(let i=0;i<28;i++){const age=dt*(.7+i%5*.08),bx=mx-age*(145+i*7),by=my+Math.sin(i*2.4)*(10+age*65)-age*18;s+=`<ellipse cx="${bx}" cy="${by}" rx="${(3+i%4*1.3)*(1+age)}" ry="${2+i%4}" fill="#d4fff5" fill-opacity="${fade*.2}" stroke="#b6f6eb" stroke-opacity="${fade*.8}" stroke-width="1.3"/>`;}s+=`<path d="M${mx} ${my-6} Q${mx-35-dt*80} ${my-30} ${mx-80-dt*120} ${my-8} M${mx} ${my+4}Q${mx-50-dt*60} ${my+26} ${mx-95-dt*130} ${my+10}" fill="none" stroke="#dbfff5" stroke-width="${4*fade}" opacity="${fade*.7}"/>`;}
 for(let i=0;i<5;i++){const age=(t*.65+i*.2)%1;s+=`<circle cx="${x+180-age*18}" cy="${y+185-age*75}" r="${1.5+age*3}" fill="none" stroke="#aee8de" opacity="${.6*(1-age)}"/>`;}
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="620" viewBox="0 0 1100 620">${s}</svg>`;
}
root.SteveSpearGun={scene,rig};})(window);