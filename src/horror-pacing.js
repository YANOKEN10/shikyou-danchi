// A chase earns a quiet recovery window; simulation time keeps pause/menu time out.
export class HorrorPacing {
 constructor(){this.reset();}
 reset(){this.rest=12;this.stress=0;this.hunting=false;}
 update(dt,out={}){this.hunting=Boolean(out.hunting);if(this.hunting){this.rest=18;this.stress=Math.min(1,this.stress+dt*.1);}else{this.rest=Math.max(0,this.rest-dt);this.stress=Math.max(0,this.stress-dt*.02);}}
 get canScare(){return !this.hunting&&this.rest<=0&&this.stress<.65;}
}
