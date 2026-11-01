(function(root){'use strict';const R=typeof module!=='undefined'?require('./revision-scenes.js'):root.WayRevision,M=typeof module!=='undefined'?require('./more-coming.js'):root.MoreComing;
const inner=s=>s.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,''),clamp=R.clamp,ease=R.smooth;
function state(t){const swim=Math.max(0,t-.8),x=1150-225*swim,y=48+9*Math.sin(swim*1.2)+4*Math.sin(swim*2.1),mouthX=x+86,mouthY=y+226;return{x,y,mouthX,mouthY,textRemaining:clamp(mouthX/1000),done:t>=11};}
function bruce(t,chewOverride=null){const defaultChew=.15+1.18*ease((t-1.3)/.5)*(1-ease((t-6)/.6))+.12*Math.sin(t*6);const chew=chewOverride===null?defaultChew:chewOverride,q=t*.14+.012*Math.sin(t);let s=inner(R.shark(q,true,Math.max(0,chew)));
const shift=-100+Math.sin(t*.6)*100;let stops='';for(let i=0;i<7;i++)stops+=`<stop offset="${i/6}" stop-color="hsl(${(i*55+t*24)%360},75%,72%)"/>`;
s=s.replace('<defs>',`<defs><linearGradient id="bruce-rainbow" gradientUnits="userSpaceOnUse" x1="${shift}" y1="20" x2="${shift+360}" y2="150" gradientTransform="rotate(${Math.sin(t*.7)*22} 180 100)">${stops}</linearGradient>`);
const body='<path d="M36 99C39 46 127 32 196 53q48 13 79 49-20 48-96 51-81 6-127-31z" fill="url(#shark-skin)" stroke="#aacdd0" stroke-width="1.5"/>';
s=s.replace(body,body+'<path d="M36 99C39 46 127 32 196 53q48 13 79 49-20 48-96 51-81 6-127-31z" fill="url(#bruce-rainbow)" opacity=".32"/>');
s=s.replace('<ellipse cx="84" cy="76"','<ellipse cx="108" cy="70" rx="10" ry="12" fill="#f4edd5" stroke="#4a7481" stroke-width="1.2"/><circle cx="106" cy="72" r="9.2" fill="#172c37"/><circle cx="104" cy="69" r="1.5" fill="#fff"/><ellipse cx="84" cy="76"');
s=s.replace('<circle cx="79" cy="79" r="6"','<circle cx="81" cy="77" r="12.7"');return s;}
function edibleText(t){const p=state(t);if(p.mouthX<=0)return '';if(p.mouthX>=1100)return inner(M.scene(3.3));let s=`<defs><g id="edible-type">${inner(M.scene(3.3))}</g></defs>`;
for(let x=0;x<1000&&x<p.mouthX;x+=50){const width=Math.min(50,p.mouthX-x),near=ease(1-(p.mouthX-x-25)/170),compression=1-near*.85,cy=280+(p.mouthY-280)*near;s+=`<defs><clipPath id="bite-${x}"><rect x="${x}" width="${width}" height="560"/></clipPath></defs><g transform="translate(0 ${cy}) scale(1 ${compression}) translate(0 -280)"><g clip-path="url(#bite-${x})"><use href="#edible-type"/></g></g>`;}return s;}
function fart(t){const age=t-6.8;if(age<0||age>4.2)return '';const at=state(6.8),bloom=ease(age/.8),fade=1-ease((age-2.3)/1.9),cx=at.x+560+age*14,cy=at.y+223-age*7;let s='';for(let i=0;i<13;i++){const a=i*2.4,r=(18+i%3*11)*bloom,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.7,rx=(13+i%4*5)*(.3+.7*bloom);s+=`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx*.8}" fill="${['#91643b','#ae7b48','#6b4a31','#bd925e'][i%4]}" opacity="${fade*.46}"/>`;}return s;}
function scene(t,includeText=true){const p=state(t);let s=includeText?edibleText(t):'';s+=fart(t);s+=`<g transform="translate(${p.x} ${p.y}) scale(2)">${bruce(t)}</g>`;
if(t>1.5&&t<6.1)for(let i=0;i<9;i++){const age=(t*1.7+i*.11)%1,x=p.mouthX+12+age*35,y=p.mouthY+Math.sin(i*2.5)*age*28;s+=`<rect x="${x}" y="${y}" width="${2+i%3}" height="${3+i%4}" rx="1" fill="${i%2?'#d7f8df':'#70c0b7'}" opacity="${1-age}" transform="rotate(${i*31+age*110} ${x} ${y})"/>`;}
return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560" aria-hidden="true">${s}</svg>`;}
root.BruceTextGulp={scene,state,bruce,DURATION:11};if(typeof module!=='undefined')module.exports=root.BruceTextGulp;
})(typeof window!=='undefined'?window:globalThis);
