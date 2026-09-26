import * as THREE from '../lib/three.module.js';
const caches=new WeakMap();
function fabricTexture(kind){
 const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
 if(kind==='tatami'){
  g.fillStyle='#8b8962';g.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=3){g.fillStyle=y%9?'#a29b70':'#797b52';g.fillRect(0,y,512,1);}
  for(let x=0;x<512;x+=8){g.fillStyle='rgba(44,53,32,.15)';g.fillRect(x,0,1,512);}
  g.fillStyle='#5c6244';g.fillRect(0,0,512,2);g.fillRect(0,510,512,2);
  g.fillStyle='#3e4a39';g.fillRect(0,0,12,512);g.fillRect(500,0,12,512);
  g.strokeStyle='#a29b71';for(let y=0;y<512;y+=12){g.strokeRect(2,y,8,7);g.strokeRect(502,y,8,7);}
 }else if(kind==='tile'){
  g.fillStyle='#454b49';g.fillRect(0,0,512,512);
  for(let x=0;x<4;x++)for(let y=0;y<4;y++){g.fillStyle=(x+y)%2?'#858d83':'#a8afa3';g.fillRect(x*128+2,y*128+2,124,124);g.strokeStyle='#c0c4b44a';g.strokeRect(x*128+4,y*128+4,120,120);}
 }else if(kind==='plaid'){
  g.fillStyle='#704638';g.fillRect(0,0,512,512);
  for(let i=0;i<512;i+=128){g.fillStyle='#1f302c88';g.fillRect(i,0,48,512);g.fillRect(0,i,512,48);g.fillStyle='#b28c5566';g.fillRect(i+70,0,16,512);g.fillRect(0,i+70,512,16);}
  g.strokeStyle='#ccac7177';for(let i=0;i<512;i+=64){g.beginPath();g.moveTo(i,0);g.lineTo(i,512);g.moveTo(0,i);g.lineTo(512,i);g.stroke();}
 }else{
  g.fillStyle='#cac7ad';g.fillRect(0,0,512,512);
  for(let y=30;y<512;y+=80)for(let x=30;x<512;x+=80){g.fillStyle='#617766';g.beginPath();g.ellipse(x+9,y+8,11,4,.6,0,Math.PI*2);g.fill();g.fillStyle='#727590';for(let i=0;i<5;i++){g.beginPath();g.ellipse(x+Math.cos(i*1.256)*5,y+Math.sin(i*1.256)*5,5,3,i*1.256,0,Math.PI*2);g.fill();}g.fillStyle='#c0a773';g.fillRect(x-2,y-2,4,4);}
 }
 for(let i=0;i<24000;i++){const x=(i*73)%512,y=(i*131+Math.floor(i/512)*17)%512;g.fillStyle=i%2?'#ffffff09':'#0000000c';g.fillRect(x,y,1,1);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
export function roomStyle(mats,room){
 const kind=['tv','office','dolls','child'].includes(room.kind)?'western':room.floor==='tatami'?'japanese':'utility';
 let cache=caches.get(mats);if(!cache){cache={};caches.set(mats,cache);}if(cache[kind])return cache[kind];
 const m={...mats};for(const key of ['paper','fusuma','wood','darkwood','wood_floor','tatami','entryFloor'])m[key]=mats[key].clone();
 m.paper.color.set(kind==='japanese'?0xad9776:kind==='western'?0x849184:0x889798);m.fusuma.color.copy(m.paper.color);
 m.wood.color.set(kind==='utility'?0x829e94:0xa18a6e);m.darkwood.color.set(0x655449);
 const tile=fabricTexture('tile');tile.repeat.set(4,3);m.entryFloor=new THREE.MeshLambertMaterial({map:tile});
 const tatami=fabricTexture('tatami');tatami.repeat.set(3,2);m.tatami=new THREE.MeshLambertMaterial({map:tatami});
 m.wood_floor.color.set(0xaa8b68);
 m.style=kind;
 m.cloth=new THREE.MeshLambertMaterial({map:fabricTexture('plaid'),side:THREE.DoubleSide});
 m.flowerCloth=new THREE.MeshLambertMaterial({map:fabricTexture('flower'),side:THREE.DoubleSide});
 m.leather=new THREE.MeshStandardMaterial({color:0x423b30,roughness:.75});
 m.trim=new THREE.MeshLambertMaterial({color:kind==='western'?0xa29e83:0x42372d});
 m.cabinetPaint=new THREE.MeshLambertMaterial({color:0x91a99e});
 m.cushionCover=new THREE.MeshLambertMaterial({color:0x414e62});
 cache[kind]=m;return m;
}
function part(g,w,h,d,mat,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m;}
function soft(g,w,h,d,mat,x,y,z){
 const r=Math.min(w,h,d)*.22,geo=new THREE.BoxGeometry(w,h,d,6,6,6),a=geo.attributes.position;
 for(let i=0;i<a.count;i++){const p=new THREE.Vector3(a.getX(i),a.getY(i),a.getZ(i));const q=new THREE.Vector3(Math.max(-w/2+r,Math.min(w/2-r,p.x)),Math.max(-h/2+r,Math.min(h/2-r,p.y)),Math.max(-d/2+r,Math.min(d/2-r,p.z)));p.sub(q).normalize().multiplyScalar(r).add(q);a.setXYZ(i,p.x,p.y,p.z);}geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m;
}
export function styleWalls(C){
 const {x0,x1,z1,zMid,H,mats:m}=C,depth=zMid-z1;
 const y=m.style==='japanese'?1.9:.83;
 for(const x of [x0+.025,x1-.025]){part(C.g,.05,.055,depth,m.trim,x,y,(zMid+z1)/2);part(C.g,.07,.085,depth,m.trim,x,H-.06,(zMid+z1)/2);}
 // Keep the existing window unobstructed; horizontal trim runs below its sill.
 part(C.g,x1-x0,.055,.045,m.trim,(x0+x1)/2,.82,z1+.025);
 for(const x of [x0+.045,x1-.045])part(C.g,.09,H,.09,m.trim,x,H/2,z1+.04);
 if(m.style==='western')for(const x of [x0+.033,x1-.033])for(let z=z1+.45;z<zMid-.35;z+=.78){part(C.g,.025,.50,.022,m.trim,x,.43,z);part(C.g,.025,.022,.60,m.trim,x,.18,z+.30);part(C.g,.025,.022,.60,m.trim,x,.68,z+.30);}
}
export function sofa(g,w,d,m){
 g.name='sofa';part(g,w,.14,d,m.darkwood,0,.20,0);
 for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(g,.075,.17,.075,m.darkwood,x,.085,z);
 for(const x of [-w/4+.035,w/4-.035]){soft(g,w/2-.12,.18,d-.17,m.leather,x,.35,.04);const back=soft(g,w/2-.11,.48,.16,m.leather,x,.64,-d/2+.09);back.rotation.x=-.10;}
 for(const x of [-w/2+.08,w/2-.08])soft(g,.16,.42,d,m.leather,x,.43,0);
 const cushion=soft(g,.32,.31,.12,m.cushionCover,-w*.23,.59,-d*.12);cushion.rotation.z=.18;
}
export function styledTable(C,x,z){
 const g=new THREE.Group();g.position.set(x,0,z);C.g.add(g);g.name=C.mats.style==='japanese'?'kotatsu':'coffee-table';
 const m=C.mats,jp=m.style==='japanese',h=.36;
 for(const xx of [-.35,.35])for(const zz of [-.29,.29])part(g,.06,h-.04,.06,m.darkwood,xx,(h-.04)/2,zz);
 if(jp){const geo=new THREE.PlaneGeometry(1.02,1.02,22,22);geo.rotateX(-Math.PI/2);const a=geo.attributes.position;for(let i=0;i<a.count;i++){const xx=a.getX(i),zz=a.getZ(i),edge=Math.max(Math.abs(xx)/.42,Math.abs(zz)/.35),t=Math.max(0,Math.min(1,(edge-1)/.45));a.setY(i,.31-t*.26+.012*Math.sin(xx*37+zz*17)*t);}geo.computeVertexNormals();g.add(new THREE.Mesh(geo,m.cloth));}
 part(g,.91,.055,.78,m.wood,0,h,0);
 if(!jp){const cloth=new THREE.Mesh(new THREE.PlaneGeometry(.85,.72),m.flowerCloth);cloth.rotation.x=-Math.PI/2;cloth.position.y=h+.029;g.add(cloth);}
 const cup=new THREE.Mesh(new THREE.CylinderGeometry(.038,.03,.07,16),m.porcelain);cup.position.set(.27,h+.064,-.20);g.add(cup);const tea=new THREE.Mesh(new THREE.CircleGeometry(.031,16),m.darkwood);tea.rotation.x=-Math.PI/2;tea.position.set(.27,h+.10,-.20);g.add(tea);
 // Retain the original table's collision footprint and clear passage around it.
 C.blk(x-.52,z-.52,x+.52,z+.52);
 if(jp){for(const side of [-1,1]){const cx=x+side*.87,cz=z;const a=cx-.25,b=cx+.25,c=cz-.25,e=cz+.25;if(a<C.x0+.1||b>C.x1-.1||c<C.z1+.1||e>C.zMid-.1)continue;if(C.col.list.some(o=>a<o.x1&&b>o.x0&&c<o.z1&&e>o.z0))continue;const cushion=soft(C.g,.47,.085,.47,m.cushionCover,cx,.07,cz);cushion.rotation.y=side*.13;}}
}
export function deskChair(C,x,z){
 const r=.24;if(x-r<C.x0+.12||x+r>C.x1-.12||z-r<C.z1+.12||z+r>C.zMid-.12)return;
 if(C.col.list.some(o=>x-r-.08<o.x1&&x+r+.08>o.x0&&z-r-.08<o.z1&&z+r+.08>o.z0))return;
 if(C.inter.some(it=>Math.hypot(it.x-x,it.z-z)<.65))return;
 const g=new THREE.Group();g.name='wooden-chair';g.position.set(x,0,z);C.g.add(g);const m=C.mats;
 part(g,.44,.055,.43,m.wood,0,.43,0);
 for(const xx of [-.18,.18])for(const zz of [-.17,.17])part(g,.045,.41,.045,m.darkwood,xx,.205,zz);
 for(const xx of [-.18,.18])part(g,.045,.46,.045,m.darkwood,xx,.65,.18);
 part(g,.43,.075,.04,m.wood,0,.87,.18);
 for(const xx of [-.11,0,.11])part(g,.025,.28,.025,m.wood,xx,.67,.18);
 C.blk(x-r,z-r,x+r,z+r);
}
