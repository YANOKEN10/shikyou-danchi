import * as THREE from '../lib/three.module.js';

// Keep the player reflection and use separately generated full-length/bust ghost images.
// Mirror panes retain their own frames; portrait aspect ratios are never stretched.
export class MirrorFigures {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xd7e3e9, 0x49423b, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-2,3,4); this.scene.add(light);
    this.camera = new THREE.OrthographicCamera(-.7,.7,2.12,-.08,.1,15);
    this.camera.position.set(0,0,5); this.camera.lookAt(0,0,0);
    const loader=new THREE.TextureLoader();
    this.ghostTextures=['full','bust'].map(kind=>{
      const tex=loader.load(new URL('../assets/generated/mirror-ghost-'+kind+'-v3.png',import.meta.url).href);
      tex.colorSpace=THREE.SRGBColorSpace; return tex;
    });
    this.player = new THREE.Group(); this.scene.add(this.player);
    const skin = new THREE.MeshStandardMaterial({color:0x88796d,roughness:.85});
    const coat = new THREE.MeshStandardMaterial({color:0x404d58,roughness:.95});
    const trousers = new THREE.MeshStandardMaterial({color:0x303944,roughness:.95});
    const hair = new THREE.MeshStandardMaterial({color:0x24201e,roughness:1});
    const part=(geo,mat,x,y,z,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);this.player.add(m);return m;};
    const ball=()=>new THREE.SphereGeometry(1,20,14);
    part(new THREE.CylinderGeometry(.2,.165,.57,20),coat,0,1.15,0,1,1,.62);
    for(const x of [-.21,.21]) part(ball(),coat,x,1.38,0,.09,.085,.09);
    part(ball(),trousers,0,.82,0,.17,.1,.1);
    for(const y of [1.02,1.13,1.24,1.35]) part(ball(),hair,0,y,.126,.009,.009,.005);
    for(const side of [-1,1]) {
      part(new THREE.CylinderGeometry(.075,.06,.73,12),trousers,side*.105,.46,0);
      part(ball(),hair,side*.105,.08,.045,.085,.065,.16);
      part(new THREE.CylinderGeometry(.065,.047,.54,12),coat,side*.28,1.09,0).rotation.z=side*.12;
      part(ball(),skin,side*.315,.79,.015,.047,.08,.04);
    }
    part(new THREE.CylinderGeometry(.065,.075,.13,12),skin,0,1.49,0);
    part(ball(),skin,0,1.65,.015,.102,.142,.098);
    part(ball(),hair,0,1.73,-.015,.11,.088,.101);
    for(const x of [-.045,.045]) part(ball(),hair,x,1.67,.116,.012,.007,.008);
    part(ball(),skin,0,1.635,.123,.018,.032,.023);
    part(new THREE.CylinderGeometry(.035,.035,.17,12),hair,-.315,.72,.025);
    this.targets = [0].map(()=>new THREE.WebGLRenderTarget(384,600));
  }
  render(time=0) {
    const r=this.renderer, target=r.getRenderTarget(), color=r.getClearColor(new THREE.Color()), alpha=r.getClearAlpha();
    r.setClearColor(0,0);
    this.player.rotation.y=Math.sin(time*.5)*.025;
    for(let i=0;i<1;i++) {this.player.visible=true;r.setRenderTarget(this.targets[i]);r.clear();r.render(this.scene,this.camera);}
    r.setRenderTarget(target);r.setClearColor(color,alpha);
  }
  apply(f,player) {
    if(!f.reflection) return;
    if(!f.reflection.material.map){f.reflection.material.map=this.targets[0].texture;const tall=f.mirror.geometry.parameters.height>1.2;
      f.mesh.material.map=this.ghostTextures[tall?0:1];
      const height=f.mirror.geometry.parameters.height*.92, width=f.mirror.geometry.parameters.width*.94;
      // Contain the image within the glass with its original 2:3 aspect ratio.
      const fittedWidth=tall?width:Math.min(width,height*2/3), fittedHeight=tall?height:fittedWidth*3/2;
      f.mesh.geometry.dispose();f.mesh.geometry=new THREE.PlaneGeometry(fittedWidth,fittedHeight);
      if(tall){const uv=f.mesh.geometry.attributes.uv,crop=(fittedWidth/fittedHeight)/(2/3);for(let i=0;i<uv.count;i++)uv.setX(i,.5+(uv.getX(i)-.5)*crop);}
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
