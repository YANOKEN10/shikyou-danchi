// ============================================================
//  怪奇現象（各階でひとりでに起きること）
//   ・階ごとに時計を持ち、30〜55秒に一度、起こせるものを一つ選びます。
//   ・作った物は floor.group にぶら下げるので、階を移ると一緒に消えます。
//   ・同じことが二度つづかないように、直前の一つは選びません。
// ============================================================
import * as THREE from "../lib/three.module.js";
import * as TX from "./textures.js";
import { D } from "./build.js";

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

// 脱ぎ捨てられた靴ひとつぶん。甲・つま先・靴底の三段でかたちを出します
function makeShoe(upper, sole) {
  const s = new THREE.Group();
  const so = box(0.098, 0.026, 0.265, sole);
  so.position.y = 0.013;
  s.add(so);
  const heel = box(0.092, 0.078, 0.125, upper);   // かかと側の甲
  heel.position.set(0, 0.065, -0.062);
  s.add(heel);
  const mid = box(0.088, 0.052, 0.075, upper);    // 甲の途中
  mid.position.set(0, 0.052, 0.022);
  s.add(mid);
  const toe = box(0.078, 0.036, 0.085, upper);    // つま先
  toe.position.set(0, 0.044, 0.088);
  s.add(toe);
  return s;
}

export class Haunts {
  constructor(game) {
    this.g = game;
    this.live = [];      // 進行中のもの
    this.t = 0;
    this.last = "";
    this.shoeArmed = false;
    this.shoesDone = new Set();
  }

  // 階を組み立てたあとに呼びます
  reset() {
    this.live.length = 0;
    this.t = rnd(20, 34);
    this.last = "";
    this.shoeArmed = false;
    this.shoesDone = new Set();
  }

  /* ---------------- 進行 ---------------- */

  update(dt) {
    const g = this.g;
    if (!g.floor) return;
    if (g.versus && g.versus.on) return;

    // 進行中のものを進める
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.t += dt;
      e.step(e, dt);
      if (e.t > e.life) {
        if (e.end) e.end(e);
        this.live.splice(i, 1);
      }
    }

    this.t -= dt;
    if (this.t > 0) return;
    this.t = rnd(30, 55);
    this._fire();
  }

  _fire() {
    const all = ["pot", "blood", "sway", "opens", "roomLight", "outage"];
    const able = all.filter((k) => k !== this.last && this._can(k));
    if (!able.length) { this.t = 8; return; }
    const k = pick(able);
    this.last = k;
    if (k === "pot") this._pot();
    else if (k === "blood") this._blood();
    else if (k === "sway") this._sway();
    else if (k === "opens") this._opens();
    else if (k === "roomLight") this._roomLight();
    else this._outage();
  }

  _can(kind) {
    const g = this.g;
    const inUnit = g.player.inUnit;
    if (kind === "pot") return inUnit && Boolean(g.curRoom && g.curRoom.unitBounds);
    if (kind === "blood") return true;
    if (kind === "sway") return !inUnit && this._farDoors(3.5, 15, false).length > 0;
    if (kind === "opens") return !inUnit && this._farDoors(5, 16, true).length > 0;
    if (kind === "roomLight") return !inUnit && this._farDoors(4, 18, false).length > 0;
    if (kind === "outage") return !inUnit && g.floor.lights.some((L) => !L.dead);
    return false;
  }

  // 主人公から離れた、閉じている扉
  _farDoors(near, far, mustEnter) {
    const px = this.g.player.pos.x;
    return this.g.floor.doors.filter((d) => {
      if (d.open || d.busy) return false;
      if (mustEnter && !d.canEnter) return false;
      const dist = Math.abs(d.dx - px);
      return dist > near && dist < far;
    });
  }

  _add(o) {
    o.t = 0;
    this.live.push(o);
    return o;
  }

  /* ---------------- ひとつずつ ---------------- */

  // 台所で、鍋が急に落ちる（蓋も外れて、床をまわる）
  _pot() {
    const g = this.g;
    const rec = g.curRoom;
    if (!rec || !rec.unitBounds) return;
    const b = rec.unitBounds;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = rec.dx + side * rnd(1.4, 2.0);
    const z = b.z0 - rnd(0.9, 2.2);

    // 使いこまれたアルミの両手鍋。底は焦げている
    const alu = new THREE.MeshLambertMaterial({ color: 0x646b68, side: THREE.DoubleSide });
    const soot = new THREE.MeshLambertMaterial({ color: 0x22201c });

    const pot = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.165, 0.205, 18, 1, true), alu);
    body.position.y = 0.103;
    pot.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.199, 0.012, 6, 20), alu);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.205;
    pot.add(rim);
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.165, 18), soot);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.004;
    pot.add(base);
    const inside = new THREE.Mesh(new THREE.CircleGeometry(0.19, 18), soot);
    inside.rotation.x = -Math.PI / 2;
    inside.position.y = 0.02;
    pot.add(inside);
    [-1, 1].forEach((s) => {                      // 取っ手
      const h = box(0.075, 0.018, 0.05, soot);
      h.position.set(s * 0.235, 0.17, 0);
      pot.add(h);
    });
    pot.position.set(x, 1.34, z);
    g.floor.group.add(pot);

    // 蓋。別に落ちて、床でくるくるまわる
    const lid = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.016, 18), alu);
    lid.add(disc);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.035, 10), soot);
    knob.position.y = 0.025;
    lid.add(knob);
    lid.position.set(x + rnd(-0.1, 0.1), 1.5, z + rnd(-0.08, 0.08));
    lid.rotation.z = rnd(0.4, 0.9);
    g.floor.group.add(lid);

    let vy = 0, bounces = 0, done = false;
    let lvy = 0, lb = 0, ldone = false, spin = 0;
    this._add({
      life: 40,
      step: (e, dt) => {
        if (!done) {
          vy -= 9.2 * dt;
          pot.position.y += vy * dt;
          pot.rotation.z += dt * 3.0;
          pot.rotation.x += dt * 1.7;
          if (pot.position.y <= 0.1) {
            pot.position.y = 0.1;
            bounces++;
            if (bounces === 1) {
              g.snd.clatter();
              g.ui.hit();
              g.ui.sayNow("——台所で、鍋が落ちた。");
            }
            if (bounces > 3 || Math.abs(vy) < 0.9) {
              done = true;
              // 横倒しで止まる
              pot.rotation.set(Math.PI / 2, 0, rnd(0, 6.28));
              pot.position.y = 0.2;
            } else vy = -vy * 0.42;
          }
        }
        if (!ldone) {
          lvy -= 9.2 * dt;
          lid.position.y += lvy * dt;
          if (lid.position.y <= 0.02) {
            lid.position.y = 0.02;
            lb++;
            if (lb > 2 || Math.abs(lvy) < 0.7) {
              // 倒れきる直前、床の上でまわる
              ldone = true;
              spin = 7.5;
            } else lvy = -lvy * 0.4;
          }
        } else if (spin > 0.05) {
          // まわりながら、だんだん寝ていく
          spin *= Math.pow(0.42, dt);
          lid.rotation.y += spin * dt * 3.2;
          lid.rotation.z = Math.max(0, lid.rotation.z * Math.pow(0.5, dt));
          lid.position.y = 0.008 + lid.rotation.z * 0.12;
          if (Math.random() < dt * 4.5) g.snd.burst({ freq: rnd(700, 1300), q: 3.4, vol: 0.1 * Math.min(1, spin / 4), dur: 0.05, wet: 1.1 });
        }
      },
    });
  }

  // 出たら、無かったはずの靴が落ちている
  armShoes() { this.shoeArmed = true; }

  dropShoes(rec) {
    if (!this.shoeArmed || !rec) return;
    this.shoeArmed = false;
    const key = rec.no + ":" + rec.dx.toFixed(1);
    if (this.shoesDone.has(key)) return;
    if (Math.random() > 0.5) return;
    this.shoesDone.add(key);

    const g = this.g;
    const upper = new THREE.MeshLambertMaterial({ color: 0x2a2119 });
    const sole = new THREE.MeshLambertMaterial({ color: 0x14110d });
    const grp = new THREE.Group();
    // 左右がそろっていない。片方は横倒しになっている
    const a = makeShoe(upper, sole);
    a.position.set(-0.11, 0, 0);
    a.rotation.y = rnd(-0.5, 0.2);
    const b = makeShoe(upper, sole);
    b.position.set(0.13, 0.05, rnd(-0.12, 0.1));
    b.rotation.set(0, rnd(-1.1, -0.4), 1.5);
    grp.add(a); grp.add(b);
    grp.position.set(rec.dx + rnd(-0.35, 0.35), 0, D.CORR_Z0 + rnd(0.45, 0.7));
    g.floor.group.add(grp);

    // 出てすこししてから、気づく
    this._add({
      life: 3.2,
      step: () => {},
      end: () => { g.ui.say("……さっきまで、こんな靴は無かった。"); },
    });
  }

  // 壁に血が滲んで、また消える
  _blood() {
    const g = this.g;
    const mat = new THREE.MeshBasicMaterial({
      map: TX.bloodStain(), transparent: true, opacity: 0, depthWrite: false,
    });
    const m = plane(1.5, 1.5, mat);

    if (g.player.inUnit && g.curRoom && g.curRoom.unitBounds) {
      const b = g.curRoom.unitBounds;
      m.position.set(g.curRoom.dx + rnd(-1.4, 1.4), 1.35, b.z1 + 0.04);
    } else {
      // 廊下は、扉のない場所を選ぶ
      const px = g.player.pos.x;
      const doors = g.floor.doors.map((d) => d.dx);
      let x = px, ok = false;
      for (let i = 0; i < 24 && !ok; i++) {
        x = Math.max(1.2, Math.min(g.floor.len - 1.2, px + rnd(-9, 9)));
        ok = doors.every((dxx) => Math.abs(dxx - x) > 1.3);
      }
      if (!ok) return;
      m.position.set(x, 1.4, D.CORR_Z0 + 0.08);
    }
    g.floor.group.add(m);

    let said = false;
    this._add({
      life: 15,
      step: (e) => {
        // にじむ（5秒）→ とどまる（4秒）→ すっと消える（6秒）
        let a;
        if (e.t < 5) a = (e.t / 5) * 0.95;
        else if (e.t < 9) a = 0.95;
        else a = 0.95 * (1 - (e.t - 9) / 6);
        mat.opacity = Math.max(0, a);
        if (!said && e.t > 2.4) {
          said = true;
          const p = g.player.pos;
          if (Math.hypot(m.position.x - p.x, m.position.z - p.z) < 6) {
            g.ui.say("……壁が、濡れている。");
          }
        }
      },
      end: () => { g.floor.group.remove(m); m.geometry.dispose(); mat.dispose(); },
    });
  }

  // 玄関の扉がゆらゆら揺れている
  _sway() {
    const g = this.g;
    const d = pick(this._farDoors(3.5, 15, false));
    if (!d) return;
    d.busy = true;
    let creak = 1.4;
    this._add({
      life: 11,
      step: (e, dt) => {
        if (d.open) return;   // 主人公が開けたら、もう揺らさない
        // ゆっくり大きくなって、ゆっくり収まる
        const k = Math.sin(Math.PI * Math.min(1, e.t / 11));
        d.pivot.rotation.y = -Math.sin(e.t * 1.9) * 0.085 * k;
        creak -= dt;
        if (creak <= 0) { creak = rnd(2.2, 3.6); g.snd.creakFloor(); }
      },
      end: () => { d.pivot.rotation.y = d.open ? -1.95 : 0; d.busy = false; },
    });
    g.ui.say("……どこかの扉が、揺れている。");
  }

  // 勝手に部屋の扉が開く
  _opens() {
    const g = this.g;
    const d = pick(this._farDoors(5, 16, true));
    if (!d) return;
    d.busy = true;
    if (d.build) d.build();
    d.open = true;
    g.floor.col.remove(d.col);
    const it = g.floor.inter.find((i) => i.kind === "door" && i.door === d);
    if (it) it.label = "閉める";
    g.snd.doorOpen();
    g.ui.hit();
    g.ui.sayNow("——" + d.no + "号室の扉が、ひとりでに開いた。");

    this._add({
      life: 2.6,
      step: (e) => {
        if (!d.open) return;   // 主人公が閉めたなら、そのまま
        const k = Math.min(1, e.t / 2.6);
        d.pivot.rotation.y = -1.95 * (1 - Math.pow(1 - k, 2.4));
      },
      end: () => { if (d.open) d.pivot.rotation.y = -1.95; d.busy = false; },
    });
  }

  // 部屋の灯りが、勝手につく（扉の下から光が漏れる）
  _roomLight() {
    const g = this.g;
    const d = pick(this._farDoors(4, 18, false));
    if (!d) return;
    d.busy = true;

    const leakMat = new THREE.MeshBasicMaterial({
      color: 0xffe6b0, transparent: true, opacity: 0, depthWrite: false,
    });
    const leak = plane(D.DOOR_W - 0.06, 0.05, leakMat);
    leak.position.set(d.dx, 0.025, D.CORR_Z0 + 0.06);
    g.floor.group.add(leak);

    const glow = new THREE.PointLight(0xffd79a, 0, 2.2, 2.4);
    glow.position.set(d.dx, 0.22, D.CORR_Z0 + 0.35);
    g.floor.group.add(glow);

    g.snd.switchFlip();
    g.ui.say("……閉まったままの扉の下から、灯りが漏れている。");

    this._add({
      life: 16,
      step: (e) => {
        let k;
        if (e.t < 0.35) k = e.t / 0.35;
        else if (e.t < 12) k = 1;
        else k = 1 - (e.t - 12) / 4;
        k = Math.max(0, k);
        // ときどき、なかで誰かが動いたように翳る
        const sh = Math.random() < 0.012 ? 0.25 : 1;
        leakMat.opacity = 0.62 * k * sh;
        glow.intensity = 0.85 * k * sh;
      },
      end: () => {
        g.floor.group.remove(leak);
        g.floor.group.remove(glow);
        leak.geometry.dispose(); leakMat.dispose(); glow.dispose();
        d.busy = false;
        g.snd.switchFlip();
      },
    });
  }

  // 廊下の灯りが急に消える → 時間差でまた点く
  _outage() {
    const g = this.g;
    const live = g.floor.lights.filter((L) => !L.dead);
    if (!live.length) return;
    const memo = live.map((L) => ({ L, flicker: L.flicker }));
    memo.forEach((r) => {
      r.L.dead = true; r.L.flicker = false;
      r.L.light.intensity = 0;
      r.L.tube.material.color.setHex(0x121512);
    });
    g.snd.tubePop();
    g.snd.buzzOff();
    g.ui.hit();
    g.ui.sayNow("——灯りが、消えた。");

    const wait = rnd(5, 9);
    this._add({
      life: wait + 1.2,
      step: (e) => {
        if (e.t < wait) return;
        // 戻りぎわに、二度ばたつく
        const k = (e.t - wait) / 1.2;
        const on = k > 0.15 && (k > 0.55 || Math.random() > 0.4);
        memo.forEach((r) => {
          r.L.light.intensity = on ? r.L.base * rnd(0.6, 1) : 0;
          r.L.tube.material.color.setHex(on ? 0xd8e6d8 : 0x121512);
        });
      },
      end: () => {
        memo.forEach((r) => {
          r.L.dead = false; r.L.flicker = r.flicker;
          r.L.light.intensity = r.L.base;
          r.L.tube.material.color.setHex(0xd8e6d8);
        });
        g.snd.tubePop();
        if (!g.def.lightsOut) g.snd.buzzOn(g.def.flicker ? 0.045 : 0.022);
        g.ui.say("……また、点いた。");
      },
    });
  }
}
