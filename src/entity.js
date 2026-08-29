// ============================================================
//  追ってくるもの
//   ・外廊下の上だけを動きます（住戸の中と階段室には入りません）
//   ・音を聞き、光を見ます。走ると、まず見つかります。
//   ・懐中電灯を向けると一瞬止まりますが、そのあと速くなります。
// ============================================================
import * as THREE from "../lib/three.module.js";
import { buildEntity, animateEntity } from "./build.js";

const LANE_Z = 1.25;

export class Stalker {
  constructor(scene, cfg, len) {
    this.cfg = Object.assign({ speed: 1.05, hear: 9, sight: 13, patience: 5 }, cfg || {});
    this.len = len;
    this.mesh = buildEntity();
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.x = len - 2.0;
    this.z = LANE_Z;
    this.dir = -1;
    this.state = "sleep";     // sleep / patrol / listen / hunt / stare / gone
    this.timer = 0;
    this.lastKnown = this.x;
    this.awareness = 0;       // 0〜1。1で発見
    this.stunned = 0;
    this.stunCd = 0;      // 懐中電灯の硬直が、次に効くまでの間
    this.rage = 0;        // 硬直の直後、しばらく速くなる
    this.spawnDelay = 4 + Math.random() * 5;
    this.moving = false;
  }

  place(x) { this.x = x; this.mesh.position.set(x, 0, LANE_Z); }

  get pos() { return { x: this.x, z: this.z }; }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  // player が見ている方向に自分がいるか
  _inView(player) {
    const dx = this.x - player.pos.x, dz = this.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return 1;
    const f = player.forward();
    const dot = (dx / d) * f.x + (dz / d) * f.z;
    return dot;
  }

  update(dt, player, col, snd, out) {
    const cfg = this.cfg;
    const dist = Math.hypot(this.x - player.pos.x, this.z - player.pos.z);
    const safe = player.inUnit || player.pos.x < 0.2;   // 住戸か階段室

    if (this.state === "sleep") {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) {
        this.state = "patrol";
        this.mesh.visible = true;
      }
      return;
    }
    if (this.state === "gone") return;

    /* --- 気づき --- */
    let gain = 0;
    if (!safe) {
      const los = col.clear(this.x, this.z, player.pos.x, player.pos.z);
      // 音
      const heard = player.noise * Math.max(0, 1 - dist / cfg.hear);
      gain += heard * 1.6;
      // 光
      if (player.lightOn) {
        const facing = this._inView(player);
        if (los && dist < cfg.sight * 1.3 && facing > 0.2) gain += 0.9;
        else if (los && dist < cfg.sight * 0.6) gain += 0.35;
      }
      // 目
      if (los && dist < cfg.sight) gain += (1 - dist / cfg.sight) * 0.55;
    }

    if (gain > 0) this.awareness = Math.min(1, this.awareness + gain * dt);
    else this.awareness = Math.max(0, this.awareness - dt * 0.42);

    if (this.awareness >= 1 && this.state !== "hunt") {
      this.state = "hunt";
      this.timer = 0;
      if (out) out.spotted = true;
    } else if (this.awareness > 0.35 && this.state === "patrol") {
      this.state = "listen";
      this.lastKnown = player.pos.x;
      this.timer = 0;
    }

    /* --- 懐中電灯を正面から当てると一瞬固まる。ただし、そう何度も効きません --- */
    if (this.stunCd > 0) this.stunCd -= dt;
    if (this.rage > 0) this.rage -= dt;
    if (player.lightOn && this.state === "hunt" && this.stunned <= 0 && this.stunCd <= 0) {
      const facing = this._inView(player);
      if (facing > 0.93 && dist < 8 && col.clear(this.x, this.z, player.pos.x, player.pos.z)) {
        this.stunned = 0.7;
        this.stunCd = 9;      // 次に効くまでの間
        this.rage = 4;        // そのあと、しばらく速くなる
        if (out) out.stare = true;
      }
    }
    if (this.stunned > 0) this.stunned -= dt;

    /* --- 動き --- */
    let speed = 0;
    let goal = this.x;

    if (this.state === "patrol") {
      speed = cfg.speed * 0.42;
      goal = this.dir > 0 ? this.len - 1.2 : 1.2;
      if (Math.abs(this.x - goal) < 0.4) this.dir *= -1;
      // ときどき立ち止まる
      this.timer -= dt;
      if (this.timer < -3.5) { this.timer = 1.4 + Math.random() * 2.6; }
      if (this.timer > 0) speed = 0;
    } else if (this.state === "listen") {
      speed = cfg.speed * 0.8;
      goal = this.lastKnown;
      if (Math.abs(this.x - goal) < 0.6) {
        this.timer += dt;
        speed = 0;
        if (this.timer > cfg.patience) { this.state = "patrol"; this.timer = 0; this.awareness = 0; }
      }
      if (this.awareness < 0.15) { this.state = "patrol"; this.timer = 0; }
    } else if (this.state === "hunt") {
      speed = this.stunned > 0 ? 0 : cfg.speed * 1.3 * (this.rage > 0 ? 1.45 : 1);
      if (safe) {
        // 見失った
        this.timer += dt;
        goal = this.lastKnown;
        if (this.timer > cfg.patience) {
          this.state = "listen"; this.timer = 0; this.awareness = 0.4;
        }
      } else {
        this.timer = 0;
        this.lastKnown = player.pos.x;
        goal = player.pos.x;
      }
    }

    if (speed > 0) {
      const d = goal - this.x;
      const step = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
      this.x += step;
      this.x = Math.max(0.7, Math.min(this.len - 0.7, this.x));
      this.moving = Math.abs(step) > 0.0005;
    } else {
      this.moving = false;
    }

    // 少しだけ横に揺れる
    this.z = LANE_Z + Math.sin(performance.now() * 0.0006 + this.x) * 0.07;

    this.mesh.position.set(this.x, 0, this.z);
    const face = (goal - this.x) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    this.mesh.rotation.y += (face - this.mesh.rotation.y) * Math.min(1, dt * 4);
    animateEntity(this.mesh, dt, this.moving);

    /* --- つかまえる --- */
    // 廊下の幅は 2.55m。ここを広くすると、壁ぎわを抜けられなくなる
    if (!safe && dist < 0.6 && this.state === "hunt") {
      if (out) out.caught = true;
    }

    // 近さ（緊張の度合いに使う）
    if (out) {
      const near = Math.max(0, 1 - dist / 14);
      out.tension = Math.max(out.tension || 0, this.state === "hunt" ? Math.max(0.55, near) : near * 0.7 + this.awareness * 0.3);
      out.veryNear = Math.max(out.veryNear || 0, this.state === "hunt" && dist < 3.5 ? 1 : 0);
    }
  }
}

/* ---------- まとめて面倒をみる ---------- */

export class Stalkers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  spawn(cfg, len, count) {
    this.clear();
    const n = count || 1;
    for (let i = 0; i < n; i++) {
      const s = new Stalker(this.scene, cfg, len);
      s.place(len - 2 - i * 6);
      s.spawnDelay = 3 + i * 2 + Math.random() * 4;
      this.list.push(s);
    }
  }

  clear() {
    this.list.forEach((s) => s.dispose(this.scene));
    this.list = [];
  }

  get active() { return this.list.length > 0; }

  update(dt, player, col, snd) {
    const out = { tension: 0, veryNear: 0, caught: false, spotted: false, stare: false };
    this.list.forEach((s) => s.update(dt, player, col, snd, out));
    return out;
  }

  // 出口へ向かって全力で追わせる（終盤用）
  enrage(mult) {
    this.list.forEach((s) => {
      s.state = "hunt";
      s.awareness = 1;
      s.cfg.speed *= mult || 1.5;
      s.cfg.patience = 99;
      s.mesh.visible = true;
      s.spawnDelay = 0;
    });
  }
}

/* ---------- 廊下の端に一瞬だけ立っているもの ---------- */

export class Apparition {
  constructor(scene) {
    this.scene = scene;
    this.mesh = buildEntity();
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.life = 0;
  }

  show(x, z, sec) {
    this.mesh.position.set(x, 0, z == null ? LANE_Z : z);
    this.mesh.rotation.y = -Math.PI / 2;
    this.mesh.visible = true;
    this.life = sec || 1.4;
  }

  update(dt, player) {
    if (!this.mesh.visible) return;
    this.life -= dt;
    animateEntity(this.mesh, dt, false);
    // こちらを向く
    const dx = player.pos.x - this.mesh.position.x;
    this.mesh.rotation.y = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
    if (this.life <= 0) this.mesh.visible = false;
  }

  hide() { this.mesh.visible = false; this.life = 0; }

  dispose() { this.scene.remove(this.mesh); }
}

export { LANE_Z };
