import * as T from '../lib/three.module.js';
// Planar reflection uses the actual room and a reflected camera, not a fixed backdrop.
export function mirrorSurface(mirror){
 const target=new T.WebGLRenderTarget(384,512,{depthBuffer:true});
 const matrix=new T.Matrix4();
 const mat=new T.ShaderMaterial({uniforms:{reflection:{value:target.texture},projection:{value:matrix}},vertexShader:'uniform mat4 projection; varying vec4 projected; varying vec2 surfaceUV; void main(){surfaceUV=uv; projected=projection*vec4(position,1.0); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`uniform sampler2D reflection; varying vec4 projected; varying vec2 surfaceUV;
 void main(){vec3 c=texture2DProj(reflection,projected).rgb;float edge=min(min(surfaceUV.x,1.-surfaceUV.x),min(surfaceUV.y,1.-surfaceUV.y));float tarnish=1.-smoothstep(0.,.055,edge);c*=vec3(.86,.91,.88)*(1.-tarnish*.48);gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 mirror.material=mat;mirror.userData.mirrorSurface=true;
 const figures=new T.Scene();figures.add(new T.HemisphereLight(0xdde4df,0x554d42,1.6));const fill=new T.DirectionalLight(0xeee4d2,1.5);figures.add(fill,fill.target);
 return {target,matrix,camera:new T.PerspectiveCamera(),figures,fill,last:-Infinity};
}
export function reflectRoom(surface,mirror,world,camera,renderer,avatar,player){
 world.updateMatrixWorld(true);camera.updateMatrixWorld();
 const origin=mirror.getWorldPosition(new T.Vector3()),normal=new T.Vector3(0,0,1).applyQuaternion(mirror.getWorldQuaternion(new T.Quaternion()));
 const eye=camera.getWorldPosition(new T.Vector3()),distance=normal.dot(eye.clone().sub(origin));if(distance<=.04)return false;
 const reflect=p=>p.addScaledVector(normal,-2*normal.dot(p.clone().sub(origin)));
 const virtual=surface.camera;virtual.copy(camera,false);virtual.position.copy(reflect(eye.clone()));
 virtual.up.set(0,1,0).applyQuaternion(camera.getWorldQuaternion(new T.Quaternion())).reflect(normal);
 virtual.lookAt(reflect(eye.clone().add(camera.getWorldDirection(new T.Vector3()))));virtual.updateMatrixWorld();virtual.projectionMatrix.copy(camera.projectionMatrix);
 surface.matrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse).multiply(mirror.matrixWorld);
 const plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,origin).applyMatrix4(virtual.matrixWorldInverse),clip=new T.Vector4(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant),p=virtual.projectionMatrix.elements;
 const q=new T.Vector4((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);clip.multiplyScalar(2/clip.dot(q));p[2]=clip.x;p[6]=clip.y;p[10]=clip.z+1-.003;p[14]=clip.w;virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
 const hidden=[];world.traverse(o=>{if(o.userData.mirrorSurface||o.userData.mirrorOverlay){hidden.push([o,o.visible]);o.visible=false;}});
 const parent=avatar.parent,oldPosition=avatar.position.clone(),oldRotation=avatar.rotation.clone();
 avatar.position.set(player.pos.x,0,player.pos.z);avatar.rotation.y=player.yaw+Math.PI;surface.figures.add(avatar);surface.fill.position.copy(origin).add(new T.Vector3(0,.9,0));surface.fill.target.position.set(player.pos.x,1.2,player.pos.z);
 const target=renderer.getRenderTarget(),xr=renderer.xr.enabled,shadow=renderer.shadowMap.autoUpdate,autoClear=renderer.autoClear;renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
 try{renderer.setRenderTarget(surface.target);renderer.clear();renderer.render(world,virtual);renderer.autoClear=false;renderer.render(surface.figures,virtual);}finally{renderer.setRenderTarget(target);renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadow;renderer.autoClear=autoClear;surface.figures.remove(avatar);if(parent)parent.add(avatar);avatar.position.copy(oldPosition);avatar.rotation.copy(oldRotation);for(const [o,v]of hidden)o.visible=v;}
 return true;
}
