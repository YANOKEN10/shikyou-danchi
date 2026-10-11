import * as THREE from '../lib/three.module.js';
import * as B from './build.js';
import {FLOORS} from './story.js';
export function prepareFloor(f,n){
 f.doors.forEach(d=>{d.build?.();if(d.canEnter){d.open=true;f.col.remove(d.col);d.col=null;d.pivot.rotation.y=-Math.PI/2;}});
 f.inter=f.inter.filter(i=>i.kind==='up'&&n<5||i.kind==='down'&&n>1||i.kind==='exit'&&n===1);
 return f;
}
export function arenaFloor(v,n){
 if(!v.floors.has(n)){const scene=new THREE.Scene();v.floors.set(n,prepareFloor(B.buildFloor(scene,FLOORS[n-1],{lap:0,canExit:true}),n));}
 return v.floors.get(n);
}
export async function travel(v,delta){
 const g=v.game,me=v.players.get(v.me),n=me.floor+delta;
 if(v.travelling||v.over||me.st!==0||n<1||n>5)return;
 v.travelling=true;
 try{await g.ui.fade(1,.25);if(me.st!==0||v.over)return;
 const old=g.floor,f=arenaFloor(v,n);g.scene.remove(old.group);g.scene.add(f.group);g.floor=f;g.def=FLOORS[n-1];g.state.floor=n;g.curRoom=null;g.slamT=0;g.slamDoor=null;
 const landing=f.inter.find(i=>i.kind===(delta>0?'down':'up'));
 g.player.place(new THREE.Vector3(landing?landing.x:f.spawn.x,0,landing?landing.z:f.spawn.z),-Math.PI/2);
 f.col.resolve(g.player.pos,.3);me.floor=n;me.x=g.player.pos.x;me.z=g.player.pos.z;g.ui.floorTag(n+'F');
 if(v.isHost)v._sendState();else v.net.toHost({t:'p',x:me.x,z:me.z,yaw:g.player.yaw,fl:n,li:g.player.lightOn?1:0,n:0});
 }finally{await g.ui.fade(0,.3);v.travelling=false;}
}
