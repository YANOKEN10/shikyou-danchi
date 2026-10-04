import { cc0Person } from './cc0-human.js';
import * as THREE from '../lib/three.module.js';

// Render the CC0 player and animated ghost into shared mirror textures.
// Each pane keeps its existing full-length or upper-body UV crop.
export class MirrorFigures {
  constructor(renderer, ghost) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xd7e3e9, 0x49423b, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-2,3,4); this.scene.add(light);
    this.camera = new THREE.OrthographicCamera(-.7,.7,2.12,-.08,.1,15);
    this.camera.position.set(0,0,5); this.camera.lookAt(0,0,0);
    this.player=cc0Person();this.scene.add(this.player);
    this.ghost=ghost;this.scene.add(ghost);ghost.traverse(o=>o.layers.set(0));
    ghost.userData.cc0Head?.userData.ready.then(()=>ghost.traverse(o=>o.layers.set(0)));
    this.targets = [0,1].map(()=>new THREE.WebGLRenderTarget(384,600));
  }
  render(time=0) {
    const r=this.renderer, target=r.getRenderTarget(), color=r.getClearColor(new THREE.Color()), alpha=r.getClearAlpha();
    r.setClearColor(0,0);
    this.player.userData.head.userData.animate?.(time);
    this.ghost.userData.cc0Head?.userData.animate?.(time,.45+.2*Math.sin(time));
    this.player.rotation.y=Math.sin(time*.5)*.025;
    for(let i=0;i<2;i++) {this.player.visible=i===0;this.ghost.visible=i===1;r.setRenderTarget(this.targets[i]);r.clear();r.render(this.scene,this.camera);}
    r.setRenderTarget(target);r.setClearColor(color,alpha);
  }
  apply(f,player) {
    if(!f.reflection) return;
    if(!f.reflection.material.map){f.reflection.material.map=this.targets[0].texture;f.mesh.material.map=this.targets[1].texture;
      f.reflection.material.needsUpdate=f.mesh.material.needsUpdate=true;}
    const angle=f.mesh.rotation.y, dx=player.pos.x-f.x,dz=player.pos.z-f.z;
    const lateral=Math.cos(angle)*dx-Math.sin(angle)*dz;
    const normal=Math.sin(angle)*dx+Math.cos(angle)*dz;
    // A person remains upright and disappears at a grazing/back-side view.
    f.reflection.material.opacity=Math.max(0,1-Math.abs(lateral)/Math.max(.7,normal))*Math.max(0,1-f.mesh.material.opacity/.9)*.55;
    f.reflection.visible=normal>0;
    const uv=f.reflection.geometry.attributes.uv;
    f.reflection.userData.baseUV ||= Array.from(uv.array);
    const shift=Math.max(-.42,Math.min(.42,lateral/Math.max(1,normal)*.3));
    for(let i=0;i<uv.count;i++) uv.setX(i,f.reflection.userData.baseUV[i*2]+shift);
    uv.needsUpdate=true;
  }
}
