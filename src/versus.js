// ============================================================
//  鬼ごっこ（非対称）
//   ・1人が「それ」、残りが住人
//   ・住人は鍵を3本あつめて、階段室から逃げる
//   ・「それ」は制限時間のうちに、住人を全員つかまえる
//   ・つかまっても、仲間がそばに数秒いれば起きあがる。3回で脱落
//   ・審判はホスト。位置は各自が動かし、勝ち負けはホストが決める
// ============================================================
import * as THREE from "../lib/three.module.js";
import * as B from "./build.js";
import * as TX from "./textures.js";

export const RULES = {
  TIME: 300,          // 制限時間（秒）
  KEYS: 3,            // 逃げるのに要る鍵の数
  CATCH: 0.95,        // つかまえられる間合い
  RESCUE: 1.35,       // 助けられる間合い
  RESCUE_SEC: 4,      // 助けるのにかかる時間
  LIVES: 3,           // つかまってよい回数
  TICK: 0.05,         // やりとりの間隔（秒）
};

const ST = { FREE: 0, HELD: 1, OUT: 2, SAFE: 3 };

export class Versus {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.on = false;
    this.me = "";
    this.oni = "";              // 鬼の slot
    this.players = new Map();   // slot -> 状態
    this.keys = [];
    this.timeLeft = RULES.TIME;
    this.over = null;           // "oni" | "nige"
    this.sendAcc = 0;
    this.ripples = [];
    this.wantAct = false;
    this._msg = (from, o) => this._recv(from, o);
  }

  get isHost() { return this.net.role === "host"; }
  get amOni() { return this.me === this.oni; }
  get myState() { const p = this.players.get(this.me); return p ? p.st : ST.FREE; }

  /* ---------------- はじめる ---------------- */

  async start(floorNo, oniSlot, keys) {
    const g = this.game;
    this.on = true;
    this.me = this.isHost ? "host" : this.net.slot;
    this.oni = oniSlot;
    this.over = null;
    this.timeLeft = RULES.TIME;
    this.net.onMessage = this._msg;

    // 顔ぶれ
    this.players.clear();
    this.net.roster().forEach((r) => {
      this.players.set(r.slot, {
        slot: r.slot, name: r.name, x: 2, z: 1.2, yaw: 0,
        light: false, noise: 0, st: ST.FREE, lives: RULES.LIVES,
        keys: 0, held: 0, mesh: null,
      });
    });

    await g.loadFloor(floorNo, 0, true);
    // 物語のしかけは使わない
    g.stalkers.clear();
    g.appar.hide();
    // 階の移動はしない。扉の開け閉めだけ残す
    g.floor.inter = g.floor.inter.filter((i) => i.kind === "door" || i.kind === "sdoor");
    g.floor.doors.forEach((d) => { if (d.build) d.build(); });

    if (keys && keys.length) this.keys = keys.map((k) => ({ x: k.x, z: k.z, by: null, mesh: null }));
    else this._placeKeys();
    this._makeKeyMeshes();

    // 立ち位置。鬼は突き当り、住人は階段室のそば
    const spread = ["host", "g1", "g2", "g3"].filter((s) => this.players.has(s));
    spread.forEach((s, i) => {
      const p = this.players.get(s);
      if (s === this.oni) { p.x = g.floor.len - 2.0; p.z = 1.2; p.yaw = Math.PI / 2; }
      else { p.x = 1.5 + i * 1.2; p.z = 1.2; p.yaw = -Math.PI / 2; }
    });

    const mine = this.players.get(this.me);
    g.player.place(new THREE.Vector3(mine.x, 0, mine.z), mine.yaw);

    // 鬼は懐中電灯なし。そのかわり暗くても見える
    if (this.amOni) {
      g.player.hasLight = false;
      g.player.lightOn = false;
      g.player.speedMul = 1.14;
      g.player.noTire = true;
      g.amb.intensity = 1.05;
      g.scene.fog.density = 0.035;
    } else {
      g.player.hasLight = true;
      g.player.lightOn = true;
      g.player.battery = 1;
      g.player.spare = 0;
      g.player.speedMul = 1;
      g.player.noTire = false;
      g.amb.intensity = 0.30;
      g.scene.fog.density = 0.062;
    }

    this._makePlayerMeshes();
    g.ui.floorTag(this.amOni ? "それ" : "住人");
    g.ui.say(this.amOni
      ? "住人を全員つかまえろ。音の波紋が見える。"
      : "鍵を三本あつめて、階段室から出る。走れば聞かれる。");
  }

  stop() {
    this.on = false;
    this.net.onMessage = null;
    this.players.forEach((p) => { if (p.mesh) this.game.scene.remove(p.mesh); });
    this.players.clear();
    this.keys.forEach((k) => { if (k.mesh) this.game.scene.remove(k.mesh); });
    this.keys = [];
    this.ripples.forEach((r) => this.game.scene.remove(r.mesh));
    this.ripples = [];
    this.game.amb.intensity = 0.30;
    this.game.scene.fog.density = 0.062;
    this.game.player.speedMul = 1;
    this.game.player.noTire = false;
  }

  /* ---------------- 鍵 ---------------- */

  _placeKeys() {
    const g = this.game;
    const spots = [];
    // 住戸の中と、廊下の端のほう
    g.floor.doors.forEach((d) => {
      if (d.unitBounds) spots.push({ x: d.dx + (Math.random() - 0.5) * 2.4, z: d.unitBounds.z1 + 1.2 + Math.random() * 2.4 });
    });
    for (let i = 0; i < 4; i++) spots.push({ x: 3 + Math.random() * (g.floor.len - 6), z: 0.7 + Math.random() * 1.4 });
    // ばらけるように選ぶ
    const picked = [];
    for (let n = 0; n < RULES.KEYS && spots.length; n++) {
      let best = 0, bestD = -1;
      spots.forEach((s, i) => {
        const d = picked.length ? Math.min.apply(null, picked.map((p) => Math.hypot(p.x - s.x, p.z - s.z))) : 999;
        if (d > bestD) { bestD = d; best = i; }
      });
      picked.push(spots.splice(best, 1)[0]);
    }
    this.keys = picked.map((p) => ({ x: p.x, z: p.z, by: null, mesh: null }));
  }

  _makeKeyMeshes() {
    const g = this.game;
    this.keys.forEach((k) => {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.055, 0.014, 6, 14),
        new THREE.MeshBasicMaterial({ color: 0xe8d8a0 })
      );
      ring.rotation.x = Math.PI / 2;
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.018, 0.14),
        new THREE.MeshBasicMaterial({ color: 0xe8d8a0 })
      );
      shaft.position.z = 0.1;
      grp.add(ring, shaft);
      // 暗くても見つかるように、ほのかな光
      const glow = new THREE.PointLight(0xffdf9a, 2.2, 3.2, 1.6);
      grp.add(glow);
      grp.position.set(k.x, 0.55, k.z);
      g.scene.add(grp);
      k.mesh = grp;
    });
  }

  /* ---------------- 見た目 ---------------- */

  _makePlayerMeshes() {
    const g = this.game;
    this.players.forEach((p) => {
      if (p.slot === this.me) return;           // 自分は映さない
      const m = p.slot === this.oni ? B.buildEntity() : B.buildSurvivor(p.name);
      m.position.set(p.x, 0, p.z);
      g.scene.add(m);
      p.mesh = m;
    });
  }

  // 音の波紋（鬼にだけ見える）
  _ripple(x, z, size) {
    if (!this.amOni) return;
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 24),
      new THREE.MeshBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    this.game.scene.add(m);
    this.ripples.push({ mesh: m, t: 0, size: size });
  }

  /* ---------------- 毎フレーム ---------------- */

  update(dt) {
    if (!this.on) return;
    const g = this.game;
    const me = this.players.get(this.me);
    if (!me) return;

    // 自分の位置を書きこむ
    me.x = g.player.pos.x;
    me.z = g.player.pos.z;
    me.yaw = g.player.yaw;
    me.light = g.player.lightOn;
    me.noise = g.player.noise;

    // つかまっているあいだは動けない
    g.player.frozen = (me.st === ST.HELD || me.st === ST.OUT || Boolean(this.over));

    // 波紋
    this.ripples.forEach((r) => {
      r.t += dt;
      const k = r.t / 1.6;
      r.mesh.scale.setScalar(1 + k * r.size * 7);
      r.mesh.material.opacity = Math.max(0, 0.55 * (1 - k));
    });
    this.ripples = this.ripples.filter((r) => {
      if (r.t < 1.6) return true;
      g.scene.remove(r.mesh);
      return false;
    });

    // ほかの人を、なめらかに寄せる
    this.players.forEach((p) => {
      if (!p.mesh) return;
      p.mesh.position.x += (p.x - p.mesh.position.x) * Math.min(1, dt * 9);
      p.mesh.position.z += (p.z - p.mesh.position.z) * Math.min(1, dt * 9);
      const face = p.slot === this.oni ? p.yaw + Math.PI : p.yaw + Math.PI;
      let d = face - p.mesh.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.mesh.rotation.y += d * Math.min(1, dt * 8);
      p.mesh.visible = p.st !== ST.SAFE;
      if (p.mesh.userData && p.mesh.userData.setHeld) p.mesh.userData.setHeld(p.st === ST.HELD, p.st === ST.OUT);
      if (p.slot === this.oni) B.animateEntity(p.mesh, dt, true);
    });

    // 鍵の見た目
    this.keys.forEach((k) => {
      if (!k.mesh) return;
      k.mesh.visible = !k.by && !this.amOni;      // 鬼には鍵は見えない
      k.mesh.rotation.y += dt * 1.4;
      k.mesh.position.y = 0.55 + Math.sin(performance.now() * 0.002 + k.x) * 0.04;
    });

    // 音の波紋は、鬼の画面にだけ出す
    if (this.amOni) {
      this.ripAcc = (this.ripAcc || 0) + dt;
      if (this.ripAcc > 0.32) {
        this.ripAcc = 0;
        this.players.forEach((p) => {
          if (p.slot === this.oni || p.st !== ST.FREE) return;
          if ((p.noise || 0) > 0.3) this._ripple(p.x, p.z, p.noise);
        });
      }
    }

    if (this.isHost) this._hostTick(dt);

    // 送る
    this.sendAcc += dt;
    if (this.sendAcc >= RULES.TICK) {
      this.sendAcc = 0;
      if (this.isHost) this._sendState();
      else this.net.toHost({
        t: "p", x: +me.x.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2),
        li: me.light ? 1 : 0, n: +me.noise.toFixed(2), a: this.wantAct ? 1 : 0,
      });
      this.wantAct = false;
    }

    this._hud();
  }

  /* ---------------- ホストの審判 ---------------- */

  _hostTick(dt) {
    if (this.over) return;
    this.timeLeft -= dt;

    const oni = this.players.get(this.oni);
    const alive = [];
    this.players.forEach((p) => { if (p.slot !== this.oni && p.st !== ST.OUT && p.st !== ST.SAFE) alive.push(p); });

    // つかまえる
    if (oni) {
      alive.forEach((p) => {
        if (p.st !== ST.FREE) return;
        if (Math.hypot(p.x - oni.x, p.z - oni.z) < RULES.CATCH) {
          p.st = ST.HELD;
          p.held = 0;
          p.lives -= 1;
          this._event({ e: "caught", s: p.slot, lives: p.lives });
        }
      });
    }

    // 助ける
    this.players.forEach((p) => {
      if (p.st !== ST.HELD) return;
      let helper = false;
      alive.forEach((q) => {
        if (q.slot === p.slot || q.st !== ST.FREE) return;
        if (Math.hypot(p.x - q.x, p.z - q.z) < RULES.RESCUE) helper = true;
      });
      if (helper) {
        p.held += dt;
        if (p.held >= RULES.RESCUE_SEC) {
          p.st = p.lives > 0 ? ST.FREE : ST.OUT;
          this._event({ e: p.lives > 0 ? "rescued" : "out", s: p.slot });
        }
      } else {
        p.held = Math.max(0, p.held - dt * 0.5);
        // 誰も来なければ、そのうち連れて行かれる
        if (p.held <= 0) {
          p.holdT = (p.holdT || 0) + dt;
          if (p.holdT > 20) {
            p.holdT = 0;
            p.st = p.lives > 0 ? ST.FREE : ST.OUT;
            this._event({ e: p.lives > 0 ? "escaped_hold" : "out", s: p.slot });
          }
        }
      }
    });

    // 鍵をひろう
    this.players.forEach((p) => {
      if (p.slot === this.oni || p.st !== ST.FREE) return;
      this.keys.forEach((k, i) => {
        if (k.by) return;
        if (Math.hypot(p.x - k.x, p.z - k.z) < 1.0) {
          k.by = p.slot;
          p.keys += 1;
          this._event({ e: "key", s: p.slot, i: i });
        }
      });
    });

    // 逃げきる
    const got = this.keys.filter((k) => k.by).length;
    if (got >= RULES.KEYS) {
      this.players.forEach((p) => {
        if (p.slot === this.oni || p.st !== ST.FREE) return;
        if (p.x < 0.0) {
          p.st = ST.SAFE;
          this._finish("nige", p.slot);
        }
      });
    }

    // 決着
    const left = [];
    this.players.forEach((p) => { if (p.slot !== this.oni && p.st !== ST.OUT) left.push(p); });
    if (!left.length) this._finish("oni", "", "all");
    else if (this.timeLeft <= 0) this._finish("oni", "", "time");
  }

  _finish(who, slot, why) {
    if (this.over) return;
    this.over = who;
    this.why = why || "";
    this._event({ e: "over", w: who, s: slot || "", r: this.why });
    this._onOver(who, slot, this.why);
  }

  _sendState() {
    const ps = [];
    this.players.forEach((p) => {
      ps.push([p.slot, +p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), p.light ? 1 : 0, p.st, p.lives, +(p.held || 0).toFixed(1), +(p.noise || 0).toFixed(2)]);
    });
    this.net.broadcast({
      t: "s", tm: Math.max(0, Math.round(this.timeLeft)),
      ps: ps, ks: this.keys.map((k) => (k.by ? 1 : 0)),
    });
  }

  _event(o) {
    o.t = "e";
    this.net.broadcast(o);
    this._apply(o);
  }

  /* ---------------- 受けとり ---------------- */

  _recv(from, o) {
    if (!o || !this.on) return;

    if (o.t === "p" && this.isHost) {
      const p = this.players.get(from);
      if (!p) return;
      p.x = o.x; p.z = o.z; p.yaw = o.yaw;
      p.light = Boolean(o.li);
      p.noise = o.n || 0;
      return;
    }

    if (o.t === "init" && !this.isHost) {
      this.oni = o.oni;
      this.keys = (o.keys || []).map((k) => ({ x: k.x, z: k.z, by: null, mesh: null }));
      return;
    }

    if (o.t === "s" && !this.isHost) {
      this.timeLeft = o.tm;
      (o.ps || []).forEach((a) => {
        const p = this.players.get(a[0]);
        if (!p) return;
        if (a[0] === this.me) { p.st = a[5]; p.lives = a[6]; p.held = a[7]; return; }
        p.x = a[1]; p.z = a[2]; p.yaw = a[3];
        p.light = Boolean(a[4]); p.st = a[5]; p.lives = a[6]; p.held = a[7]; p.noise = a[8] || 0;
      });
      (o.ks || []).forEach((v, i) => { if (this.keys[i]) this.keys[i].by = v ? "?" : null; });
      return;
    }

    if (o.t === "e") { this._apply(o); return; }
  }

  _apply(o) {
    const g = this.game;
    const name = (s) => { const p = this.players.get(s); return p ? p.name : "だれか"; };
    if (o.e === "caught") {
      const p = this.players.get(o.s);
      if (p) { p.st = ST.HELD; p.lives = o.lives; }
      g.snd.stinger();
      g.ui.hit();
      g.ui.sayNow(o.s === this.me ? "つかまった。仲間が来るまで動けない。" : name(o.s) + " がつかまった。");
    } else if (o.e === "rescued" || o.e === "escaped_hold") {
      const p = this.players.get(o.s);
      if (p) { p.st = ST.FREE; p.held = 0; }
      g.snd.pickup();
      g.ui.sayNow(o.s === this.me ? "助けてもらった。" : name(o.s) + " が起きあがった。");
    } else if (o.e === "out") {
      const p = this.players.get(o.s);
      if (p) p.st = ST.OUT;
      g.snd.thud(false);
      g.ui.sayNow(o.s === this.me ? "……連れて行かれた。" : name(o.s) + " が連れて行かれた。");
    } else if (o.e === "key") {
      if (this.keys[o.i]) this.keys[o.i].by = o.s;
      const p = this.players.get(o.s);
      if (p) p.keys = (p.keys || 0) + 1;
      g.snd.pickup();
      const got = this.keys.filter((k) => k.by).length;
      g.ui.sayNow("鍵 " + got + " / " + RULES.KEYS + (got >= RULES.KEYS ? "　階段室へ！" : ""));
    } else if (o.e === "over") {
      this.over = o.w;
      this.why = o.r || "";
      this._onOver(o.w, o.s, this.why);
    }
  }

  _onOver(who, slot, why) {
    const g = this.game;
    g.player.frozen = true;
    g.snd.allOff();
    const win = who === "oni" ? this.amOni : !this.amOni;
    const title = who === "oni" ? (why === "time" ? "時間切れ" : "全員つかまった") : "逃げきった";
    const lines = who === "oni"
      ? (why === "time"
        ? ["夜が明けはじめた。", "廊下に、誰の姿もない。", "郵便受けの札が、一枚ずつ増えている。"]
        : ["廊下の照明が、一本ずつ点いていく。", "郵便受けに、名前の札が増えている。"])
      : ["鉄扉を押し開けて、外に出た。", "うしろで、扉が閉まる音がした。"];
    setTimeout(() => {
      g.ui.closeAll();
      g.ui.showEnding(
        { name: title + (win ? "　——勝ち" : "　——負け"), lines: lines },
        { memos: this.keys.filter((k) => k.by).length, time: "" },
        () => { if (this.onAgain) this.onAgain(); }
      );
    }, 900);
  }

  /* ---------------- 画面の表示 ---------------- */

  _hud() {
    const g = this.game;
    const me = this.players.get(this.me);
    const t = Math.max(0, Math.round(this.timeLeft));
    const got = this.keys.filter((k) => k.by).length;
    let s = (t / 60 | 0) + ":" + String(t % 60).padStart(2, "0");
    if (this.amOni) {
      let left = 0;
      this.players.forEach((p) => { if (p.slot !== this.oni && p.st !== ST.OUT && p.st !== ST.SAFE) left++; });
      s += "　のこり " + left + "人";
    } else {
      s += "　鍵 " + got + "/" + RULES.KEYS;
      if (me) s += "　あと" + Math.max(0, me.lives) + "回";
    }
    g.ui.setVersus(s, this.amOni);
  }
}
