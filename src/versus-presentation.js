import * as T from '../lib/three.module.js';
import {cc0Person} from './cc0-human.js';
import {nameTag} from './textures.js';
import {language} from './i18n.js';
export const vsText=(ja,en,es)=>language==='en'?en:language==='es'?es:ja;
export function resident(name){
 const root=new T.Group(),body=cc0Person();root.add(body);
 const tag=new T.Sprite(new T.SpriteMaterial({map:nameTag(name),transparent:true,depthTest:true,depthWrite:false}));tag.position.y=1.94;tag.scale.set(.7,.18,1);root.add(tag);
 const lamp=new T.Mesh(new T.CylinderGeometry(.033,.03,.19,12),new T.MeshStandardMaterial({color:0x363934,metalness:.5,roughness:.5}));lamp.rotation.x=Math.PI/2;lamp.position.set(.28,.76,.08);body.add(lamp);
 let held=false,out=false,phase=0,amount=0,lastState='';const parts=[];
 body.userData.ready.then(()=>{body.children.forEach(m=>{if(!m.isMesh||m===lamp)return;parts.push({m,base:m.geometry.attributes.position.array.slice()});if(m.material.color)m.material.color.multiplyScalar(.82);});});
 root.userData.ready=body.userData.ready;
 root.userData.setHeld=(h,o)=>{held=h;out=o;const state=o?'out':h?'held':'free';if(state!==lastState){lastState=state;tag.material.map.dispose();tag.material.map=nameTag(h?vsText('捕獲中','CAUGHT','ATRAPADO'):o?vsText('脱落','OUT','ELIMINADO'):name);}root.visible=!out;};
 root.userData.animate=(dt,moving)=>{amount+=(Number(moving&&!held)-amount)*Math.min(1,dt*8);phase+=dt*(2+amount*6);body.userData.head.userData.animate?.(phase);body.rotation.x+=((held?.65:0)-body.rotation.x)*Math.min(1,dt*8);body.position.y=held?0:Math.abs(Math.sin(phase))*amount*.023;tag.position.y=held?1.65:1.94;
 for(const {m,base}of parts){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=base[i*3],y=base[i*3+1],z=base[i*3+2],side=x<0?-1:1;let angle=0,pivot=0;if(y<.94){angle=Math.sin(phase)*side*amount*.34*Math.min(1,(.94-y)/.28);pivot=.94;}else if(Math.abs(x)>.22&&y<1.48){angle=-Math.sin(phase)*side*amount*.23;pivot=1.4;}const dy=y-pivot;p.setXYZ(i,x,pivot+dy*Math.cos(angle)-z*Math.sin(angle),dy*Math.sin(angle)+z*Math.cos(angle));}p.needsUpdate=true;}
 };
 return root;
}
export function captureNotice(ui,title,detail){let el=document.getElementById('captureNotice');if(!el){el=document.createElement('div');el.id='captureNotice';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.dataset.noTranslate='';el.style.cssText='position:fixed;z-index:40;top:21%;left:50%;transform:translateX(-50%);width:min(84vw,440px);box-sizing:border-box;padding:20px 22px;border:1px solid #9f7762;background:#130e0ef2;color:#eee4ce;text-align:center;pointer-events:none;box-shadow:0 12px 50px #0008;line-height:1.7';el.innerHTML='<strong style="display:block;font-size:26px;font-weight:500"></strong><span style="display:block;font-size:15px;overflow-wrap:anywhere"></span>';document.body.append(el);}el.querySelector('strong').textContent=title;el.querySelector('span').textContent=detail;el.hidden=false;clearTimeout(ui.captureTimer);ui.captureTimer=setTimeout(()=>el.hidden=true,4200);}
