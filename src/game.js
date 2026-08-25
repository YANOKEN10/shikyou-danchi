// ============================================================
//  ゲーム本体
//   ・階を1つずつ組み立て／片づけしながら進みます（軽くするため）
//   ・記録はクラウド（ログイン時）と端末内の両方に残します
// ============================================================
import * as THREE from "../lib/three.module.js";
import * as B from "./build.js";
import { Player } from "./player.js";
import { Stalkers, Apparition } from "./entity.js";
import { UI } from "./ui.js";
import * as S from "./story.js";

const SAVE_V = 1;

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + "分" + String(s).padStart(2, "0") + "秒";
}

export class Game {
  constructor(canvas, sound, cloud) {
    this.canvas = canvas;
    this.snd = sound;
    this.cloud = cloud;
    this.ui = new UI(sound);
    this.running = false;
    this.paused = false;

    this.touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.quality = this.touch ? "low" : "high";

    this._initThree();

    this.player = new Player(this.camera, sound);
    this.player.bindMouse(canvas);
    this.player.onBatteryDead = () => {
      this.ui.sayNow("——電池が切れた。");
      this.snd.click();
    };
    this.player.onLockChange = (locked) => {
      if (!locked && this.running && !this.ui.open) this.doPause();
    };

    this.stalkers = new Stalkers(this.scene);
    this.appar = new Apparition(this.scene);

    this.ui.onClose = () => this._afterClose();

    // 開いている画面は Esc / Tab でも閉じられるように（ゲーム側の更新は止まっているため）
    window.addEventListener("keydown", (e) => {
      if (!this.ui.open || this.ui.open === "ending") return;
      if (e.code !== "Escape" && e.code !== "Tab") return;
      e.preventDefault();
      if (this.ui.open === "reader") this.ui.closeReader();
      else if (this.ui.open === "book") this.ui.closeBook();
      else if (this.ui.open === "pause") this.resume();
    });

    this.state = this._fresh();
    this.floor = null;
    this.clock = new THREE.Clock();

    addEventListener("resize", () => this._resize());
    this._resize();
  }

  _fresh() {
    return {
      v: SAVE_V,
      floor: 1,
      lap: 0,
      memos: [],
      items: {},
      spare: 0,
      flags: {},
      seconds: 0,
      endings: [],
      light: null,
    };
  }

  /* ---------------- 三次元の下ごしらえ ---------------- */

  _initThree() {
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality === "high",
      powerPreference: "high-performance",
    });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality === "high" ? 1.75 : 1.25));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04050a);
    this.scene.fog = new THREE.FogExp2(0x04050a, 0.062);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);

    // ほとんど見えないくらいの環境光。暗さがこのゲームの本体です
    this.amb = new THREE.HemisphereLight(0x1b2230, 0x05070a, 0.30);
    this.scene.add(this.amb);

    // 懐中電灯
    this.torch = new THREE.SpotLight(0xffeec8, 0, 26, 0.44, 0.5, 1.5);
    this.torch.position.set(0, 0, 0);
    this.torchTarget = new THREE.Object3D();
    this.scene.add(this.torch);
    this.scene.add(this.torchTarget);
    this.torch.target = this.torchTarget;

    // 手元のごくわずかな明かり（真っ暗で何も分からないのを防ぐ）
    this.near = new THREE.PointLight(0x8899bb, 1.6, 5.0, 1.8);
    this.scene.add(this.near);
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    // 縦長の画面だと横の視野が狭くなりすぎるので、そのぶん縦を広げます
    const MIN_H = (58 * Math.PI) / 180;
    let vfov = (72 * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    if (hfov < MIN_H) vfov = 2 * Math.atan(Math.tan(MIN_H / 2) / aspect);
    this.camera.fov = Math.min(100, (vfov * 180) / Math.PI);

    this.camera.updateProjectionMatrix();
  }

  /* ---------------- 進行 ---------------- */

  async start(payload) {
    this.state = this._merge(payload);
    this.player.restore(this.state.light);
    this.player.hasLight = Boolean(this.state.items.light);
    this.player.spare = this.state.spare | 0;

    this.snd.unlock();
    this.snd.ambienceOn();

    await this.ui.fade(1, 0.01);
    await this.loadFloor(this.state.floor, this.state.lap, true);
    await this.ui.fade(0, 1.6);

    if (!this.state.flags.opened) {
      this.state.flags.opened = true;
      S.OPENING.forEach((l) => this.ui.say(l));
    }

    this.running = true;
    this.clock.getDelta();
    this._loop();
  }

  _merge(p) {
    const s = this._fresh();
    if (!p || p.v !== SAVE_V) return s;
    s.floor = Math.max(1, Math.min(5, p.floor | 0 || 1));
    s.lap = p.lap | 0;
    s.memos = Array.isArray(p.memos) ? p.memos.filter((m) => S.MEMOS[m]) : [];
    s.items = p.items && typeof p.items === "object" ? p.items : {};
    s.spare = p.spare | 0;
    s.flags = p.flags && typeof p.flags === "object" ? p.flags : {};
    s.seconds = Number(p.seconds) || 0;
    s.endings = Array.isArray(p.endings) ? p.endings : [];
    s.light = p.light || null;
    return s;
  }

  payload() {
    this.state.spare = this.player.spare;
    this.state.light = this.player.serialize();
    return JSON.parse(JSON.stringify(this.state));
  }

  async save(quiet) {
    const r = await this.cloud.save(this.payload());
    if (r.conflict) { this._askConflict(r); return; }
    if (!quiet) {
      this.ui.toast(r.where === "cloud" ? "記録しました（どの端末でも続けられます）" : "この端末に記録しました");
    }
  }

  _askConflict(r) {
    this.doPause((body) => {
      const p = document.createElement("p");
      p.className = "warn";
      p.textContent = "別の端末に、あとから保存された記録があります。どちらを残しますか。";
      body.appendChild(p);

      const mine = document.createElement("button");
      mine.className = "big";
      mine.textContent = "この端末の記録を残す";
      mine.onclick = async () => {
        await this.cloud.save(this.payload(), true);
        this.ui.toast("この端末の記録で上書きしました");
        this.resume();
      };
      body.appendChild(mine);

      const theirs = document.createElement("button");
      theirs.className = "ghost";
      theirs.textContent = "向こうの記録を読み込む";
      theirs.onclick = async () => {
        this.state = this._merge(r.theirs);
        this.player.restore(this.state.light);
        this.player.hasLight = Boolean(this.state.items.light);
        this.player.spare = this.state.spare | 0;
        this.cloud.rev = (r.user && r.user.rev) | 0;
        this.ui.closePause();
        await this.ui.fade(1, 0.5);
        await this.loadFloor(this.state.floor, this.state.lap, true);
        await this.ui.fade(0, 0.9);
        this.resume();
      };
      body.appendChild(theirs);
    });
  }

  /* ---------------- 階の読み込み ---------------- */

  async loadFloor(n, lap, silent) {
    const def = S.FLOORS[n - 1];
    this.state.floor = n;
    this.state.lap = lap | 0;

    B.disposeFloor(this.scene, this.floor);
    this.stalkers.clear();
    this.appar.hide();

    this.floor = B.buildFloor(this.scene, def, {
      lap: this.state.lap,
      canExit: Boolean(this.state.flags.hasNotebook),
    });
    this.def = def;

    // 開けたままにしていた扉を戻す
    this.usedInter = new Set(this.state.flags.used || []);

    this.player.place(this.floor.spawn, -Math.PI / 2);
    this.player.inUnit = false;

    // 追跡者
    const lapDef = this.floor.lapDef;
    const ecfg = def.entity;
    if (ecfg) {
      this.stalkers.spawn(ecfg, this.floor.len, lapDef ? lapDef.entities : 1);
    }

    // 事件の時計
    this.floorTime = 0;
    this.eventsDone = new Set();
    this.apparT = 8 + Math.random() * 12;
    this.whisperT = 14 + Math.random() * 18;

    this.snd.buzzOff();
    if (!def.lightsOut) this.snd.buzzOn(def.flicker ? 0.045 : 0.022);

    if (!silent) {
      this.ui.floorTag(def.title);
    } else {
      this.ui.floorTag(def.title);
    }
    const introText = (lapDef && lapDef.intro) || def.intro;
    if (introText) this.ui.say(introText);
    if (lapDef && lapDef.say) this.ui.say(lapDef.say);
    if (def.stairHint && this._stairBlocked()) this.ui.say(def.stairHint);
  }

  _stairBlocked() {
    const d = this.def;
    if (!d.stairLocked) return false;
    if (d.stairKey) return !this.state.items[d.stairKey];
    if (d.stairTask === "breaker") return !this.state.flags.breaker;
    return false;
  }

  /* ---------------- 主ループ ---------------- */

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    let dt = this.clock.getDelta();
    if (dt > 0.1) dt = 0.1;

    if (!this.paused && !this.ui.open) {
      this.state.seconds += dt;
      this.floorTime += dt;
      this._step(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _step(dt) {
    const p = this.player;
    const f = this.floor;

    p.update(dt, f.col);
    p.inUnit = this._insideUnit();

    // 懐中電灯
    const on = p.lightOn && p.hasLight && p.battery > 0;
    const weak = p.battery < 0.2 ? (0.55 + Math.sin(performance.now() * 0.02) * 0.15 * (0.2 - p.battery) * 5) : 1;
    this.torch.intensity += ((on ? 46 * weak : 0) - this.torch.intensity) * Math.min(1, dt * 12);
    this.torch.position.copy(this.camera.position);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.torchTarget.position.copy(this.camera.position).add(fwd.multiplyScalar(6));
    this.near.position.copy(this.camera.position);

    // 蛍光灯の明滅
    f.lights.forEach((L) => {
      if (L.dead && !L.flicker) return;
      if (L.flicker) {
        const n = Math.sin(performance.now() * 0.011) * Math.sin(performance.now() * 0.0031);
        const on2 = n > -0.15 && Math.random() > 0.02;
        L.light.intensity = on2 ? L.base * (0.6 + Math.random() * 0.5) : 0;
        L.tube.material.color.setHex(on2 ? 0xd8e6d8 : 0x121512);
      }
    });

    // 追跡者
    let out = { tension: 0, veryNear: 0, caught: false, spotted: false };
    if (this.stalkers.active) out = this.stalkers.update(dt, p, f.col, this.snd);
    this.appar.update(dt, p);

    if (out.spotted && !this._spotFlag) {
      this._spotFlag = true;
      this.snd.stinger();
      this.ui.sayNow(S.CHASE_LINES[Math.floor(Math.random() * S.CHASE_LINES.length)]);
      this.ui.hit();
    }
    if (!out.spotted && this._spotFlag && out.tension < 0.3) this._spotFlag = false;

    const tension = Math.min(1, out.tension + (this.state.flags.chase ? 0.35 : 0));
    this.snd.setTension(tension);
    this.ui.setTension(tension);
    if (out.veryNear > 0.5) this.snd.breathOn(); else this.snd.breathOff();

    if (out.caught) { this._caught(); return; }

    // 事件
    this._events(dt);

    // 調べられるもの
    this._interact();

    this.ui.setBattery(p.battery, p.hasLight);
    this.ui.setStamina(p.stamina);
    this.ui.tickSub(dt);

    // 帳面・ポーズ
    if (p.wantBook) { p.wantBook = false; this._openBook(); }
    if (p.wantPause) { p.wantPause = false; this.doPause(); }
  }

  _insideUnit() {
    const p = this.player.pos;
    if (p.z > -0.1) return false;
    for (const d of this.floor.doors) {
      if (!d.unitBounds) continue;
      const b = d.unitBounds;
      if (p.x > b.x0 && p.x < b.x1 && p.z < b.z0 && p.z > b.z1) return true;
    }
    return false;
  }

  /* ---------------- 出来事 ---------------- */

  _events(dt) {
    const def = this.def;
    (def.events || []).forEach((e, i) => {
      if (this.eventsDone.has(i)) return;
      if (this.floorTime < e.at) return;
      this.eventsDone.add(i);
      if (e.sound === "thud") this.snd.thud(true);
      if (e.sound === "doorShut") this.snd.doorShut();
      if (e.sound === "whisper") this.snd.whisper();
      if (e.say) this.ui.say(e.say);
    });

    // ふと、廊下の端に立っている
    if (this.stalkers.active || def.n >= 3) {
      this.apparT -= dt;
      if (this.apparT <= 0) {
        this.apparT = 22 + Math.random() * 30;
        const far = this.player.pos.x < this.floor.len / 2 ? this.floor.len - 1.2 : 1.2;
        if (Math.abs(far - this.player.pos.x) > 8) {
          this.appar.show(far, null, 1.1 + Math.random());
          this.snd.whisper();
        }
      }
    }

    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = 26 + Math.random() * 40;
      if (def.n >= 2) {
        this.snd.whisper();
        if (Math.random() < 0.5) this.ui.say(S.WHISPERS[Math.floor(Math.random() * S.WHISPERS.length)]);
      }
    }
  }

  /* ---------------- 調べる ---------------- */

  _nearest() {
    const p = this.player.pos;
    const fwd = this.player.forward();
    let best = null, bestScore = -1;
    for (const it of this.floor.inter) {
      if (it.done) continue;
      const dx = it.x - p.x, dz = it.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > it.r) continue;
      const dot = d < 0.01 ? 1 : (dx / d) * fwd.x + (dz / d) * fwd.z;
      if (dot < 0.15) continue;
      const score = dot * 2 - d * 0.3;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  _interact() {
    const it = this._nearest();
    this.ui.setPrompt(it ? it.label : "");
    if (!this.player.wantInteract) return;
    this.player.wantInteract = false;
    if (!it) return;
    this._doInteract(it);
  }

  async _doInteract(it) {
    const p = this.player;

    if (it.kind === "door") {
      const d = it.door;
      if (!d.canEnter) {
        this.snd.locked();
        this.ui.sayNow(d.no === 404 ? "……四〇四号室。名前の札が、無い。" : "鍵がかかっている。人の気配もない。");
        return;
      }
      d.open = !d.open;
      if (d.open) {
        this.snd.doorOpen();
        this.floor.col.remove(d.col);
        this._swing(d, -1.95);
        it.label = "閉める";
        if (d.unit && d.unit.note && !this.usedInter.has("note" + d.no)) {
          this.usedInter.add("note" + d.no);
          this.ui.say(d.unit.note);
        }
      } else {
        this.snd.doorShut();
        d.col = this.floor.col.add(d.dx - B.D.DOOR_W / 2, B.D.CORR_Z0 - 0.1, d.dx + B.D.DOOR_W / 2, B.D.CORR_Z0 + 0.06, "door");
        this._swing(d, 0);
        it.label = "開ける";
      }
      return;
    }

    if (it.kind === "sdoor") {
      const s = it.door || it.sdoor;
      s.open = !s.open;
      if (s.open) {
        this.snd.doorOpen();
        if (s.col) { this.floor.col.remove(s.col); s.col = null; }
        this._swingTo(s.pivot, s.opened);
        it.label = "扉を閉める";
      } else {
        this.snd.doorShut();
        s.col = this.floor.col.add(B.D.STAIR_X1 - 0.06, s.cz - 0.9, B.D.STAIR_X1 + 0.06, s.cz + 0.1, "sdoor");
        this._swingTo(s.pivot, s.shut);
        it.label = "扉を開ける";
      }
      return;
    }

    if (it.kind === "memo" || it.kind === "goal") {
      it.done = true;
      if (this.state.memos.indexOf(it.id) < 0) this.state.memos.push(it.id);
      if (it.id === "m5") this.state.flags.loopBroken = true;
      this.ui.showMemo(it.id);
      if (it.kind === "goal") {
        this.state.flags.hasNotebook = true;
        this._pendingChase = true;
      }
      this.save(true);
      return;
    }

    if (it.kind === "item") {
      it.done = true;
      const info = S.ITEMS[it.id];
      if (it.id === "battery") {
        p.spare += 1;
        this.state.items.battery = true;
      } else {
        this.state.items[it.id] = true;
      }
      if (it.id === "light") {
        p.hasLight = true;
        p.lightOn = true;
        this.snd.click();
      }
      this.state.spare = p.spare;
      this.snd.pickup();
      if (it.note) this.ui.say(it.note);
      if (info) this.ui.say(info.say);
      this.save(true);
      return;
    }

    if (it.kind === "breaker") {
      if (this.state.flags.breaker) { this.ui.sayNow("もう入れてある。"); return; }
      this.state.flags.breaker = true;
      it.label = "調べる";
      this.snd.click();
      setTimeout(() => {
        this.snd.thud(false);
        this.snd.buzzOn(0.05);
        this.floor.lights.forEach((L) => { L.dead = false; L.flicker = false; L.light.intensity = L.base * 0.8; L.tube.material.color.setHex(0xd8e6d8); });
        const st = this.floor.stair;
        if (st && st.bulbLight) { st.bulbLight.intensity = 6; st.bulb.material.color.setHex(0xffe6b0); }
        this.ui.sayNow("階段室に、明かりがついた。");
        // 音と光に、向こうも気づく
        this.stalkers.list.forEach((s) => { s.awareness = Math.min(1, s.awareness + 0.75); s.spawnDelay = 0; s.mesh.visible = true; });
      }, 700);
      this.save(true);
      return;
    }

    if (it.kind === "up") {
      if (this._stairBlocked()) {
        this.snd.locked();
        this.ui.sayNow(this.def.stairHint || "上れない。");
        return;
      }
      await this._goUp();
      return;
    }

    if (it.kind === "down") {
      if (this.state.floor === 1 && this.state.flags.hasNotebook) { await this._escape(); return; }
      if (this.state.floor === 1) { this.ui.sayNow("……まだ帰れない。"); return; }
      await this._goDown();
      return;
    }
  }

  _swing(d, rad) { this._swingTo(d.pivot, rad); }

  _swingTo(pivot, rad) {
    const d = { pivot }, to = rad;
    const from = d.pivot.rotation.y;
    const t0 = performance.now();
    const dur = 620;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      d.pivot.rotation.y = from + (to - from) * e;
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  /* ---------------- 階の移動 ---------------- */

  async _goUp() {
    const n = this.state.floor;
    this.paused = true;
    await this._stairWalk(true);

    // 四階のループ（母の手紙を読むまで、上っても四階に出る）
    if (n === 4 && !this.state.flags.loopBroken) {
      const lap = this.state.lap;
      if (lap < 2) {
        await this.loadFloor(4, lap + 1);
      } else {
        await this.loadFloor(4, 2);
        this.ui.say("……まだ、上に行かせてもらえない。");
      }
    } else {
      await this.loadFloor(Math.min(5, n + 1), 0);
    }

    await this.ui.fade(0, 1.1);
    this.paused = false;
    this.save(true);
  }

  async _goDown() {
    const n = this.state.floor;
    this.paused = true;
    await this._stairWalk(false);
    await this.loadFloor(Math.max(1, n - 1), 0);
    await this.ui.fade(0, 1.1);
    this.paused = false;
    this.save(true);
  }

  async _stairWalk(up) {
    await this.ui.fade(1, 0.75);
    this.snd.breathOff();
    this.snd.setTension(0);
    const n = 8 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.snd.stepStair();
      await new Promise((r) => setTimeout(r, up ? 190 : 165));
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  /* ---------------- 終盤 ---------------- */

  _startChase() {
    this.state.flags.chase = true;
    this.snd.stinger();
    this.floor.lights.forEach((L) => { L.light.intensity = 0; L.dead = true; L.flicker = false; L.tube.material.color.setHex(0x121512); });
    this.snd.buzzOff();
    this.ui.sayNow("——廊下の灯りが、いっせいに落ちた。");
    this.ui.say("階段まで。振り返るな。");
    this.stalkers.spawn({ speed: 2.35, hear: 30, sight: 40, patience: 99 }, this.floor.len, 2);
    this.stalkers.enrage(1);
    this.stalkers.list.forEach((s, i) => s.place(this.floor.len - 1.5 - i * 3));
  }

  async _escape() {
    this.paused = true;
    this.snd.allOff();
    await this.ui.fade(1, 1.0);
    this.running = false;
    this.state.flags.cleared = true;

    const end = S.endingFor(this.state.memos.length);
    if (this.state.endings.indexOf(end.id) < 0) this.state.endings.push(end.id);
    await this.save(true);
    await this._showEnding(end);
  }

  async _caught() {
    if (this._ending) return;
    this._ending = true;
    this.running = false;
    this.snd.stinger();
    this.ui.hit();
    this.snd.allOff();
    this.player.unlock();
    await this.ui.fade(1, 1.4);

    const end = S.ENDINGS.caught;
    if (this.state.endings.indexOf(end.id) < 0) this.state.endings.push(end.id);
    // 捕まっても記録は残す（同じ階からやり直せます）
    this.state.flags.chase = false;
    await this.save(true);
    await this._showEnding(end, true);
  }

  async _showEnding(end, retry) {
    this.ui.closeAll();
    await this.ui.showEnding(end, {
      memos: this.state.memos.length,
      time: fmtTime(this.state.seconds),
    }, async () => {
      this.ui.closeEnding();
      this._ending = false;
      if (retry) {
        // その階のはじめから
        await this.ui.fade(1, 0.4);
        await this.loadFloor(this.state.floor, this.state.lap, true);
        await this.ui.fade(0, 1.2);
        this.running = true;
        this.paused = false;
        this.clock.getDelta();
        this.snd.ambienceOn();
        this._loop();
      } else if (this.onFinish) {
        this.onFinish();
      }
    });
  }

  /* ---------------- 帳面・ポーズ ---------------- */

  _openBook() {
    this.player.unlock();
    this.ui.showBook({
      items: this.state.items, spare: this.player.spare, memos: this.state.memos,
    }, this.touch);
  }

  // custom を渡すと、小休止の中身を差し替えます（アカウント設定・確認など）
  doPause(custom) {
    this.paused = true;
    this.player.unlock();
    this.snd.breathOff();

    this.ui.showPause((body) => {
      if (custom) { custom(body); return; }

      const who = document.createElement("p");
      who.className = "dim";
      who.textContent = this.cloud.signedIn
        ? "ログイン中：" + this.cloud.display + (this.cloud.user.hasMail ? "（" + this.cloud.user.mail + "）" : "")
        : "この端末だけに記録しています";
      body.appendChild(who);

      const stat = document.createElement("p");
      stat.className = "dim";
      stat.textContent = S.FLOORS[this.state.floor - 1].title + "　／　見つけたもの " + this.state.memos.length + " / " + S.MEMO_ORDER.length + "　／　" + fmtTime(this.state.seconds);
      body.appendChild(stat);

      const mk = (label, cls, fn) => {
        const b = document.createElement("button");
        b.className = cls;
        b.textContent = label;
        b.onclick = () => { this.snd.ui(); fn(b); };
        body.appendChild(b);
        return b;
      };

      mk("つづける", "big", () => this.resume());
      mk("いま記録する", "ghost", async (b) => {
        b.disabled = true; b.textContent = "記録しています…";
        await this.save();
        b.disabled = false; b.textContent = "いま記録する";
      });
      mk("持ち物とメモ", "ghost", () => { this.ui.closePause(); this._openBook(); });

      // 音・操作
      const opt = document.createElement("div");
      opt.className = "opts";
      body.appendChild(opt);

      const chk = (label, val, fn) => {
        const l = document.createElement("label");
        l.className = "chk";
        const i = document.createElement("input");
        i.type = "checkbox"; i.checked = val;
        i.onchange = () => fn(i.checked);
        l.appendChild(i);
        l.appendChild(document.createTextNode(label));
        opt.appendChild(l);
      };
      chk("音を消す", this.snd.muted, (v) => this.snd.setMuted(v));
      chk("上下の視点を反転", this.player.invertY, (v) => { this.player.invertY = v; });

      const sens = document.createElement("label");
      sens.className = "rng";
      sens.innerHTML = "<span>視点の速さ</span>";
      const ri = document.createElement("input");
      ri.type = "range"; ri.min = "40"; ri.max = "260"; ri.value = String(Math.round((this.touch ? this.player.sensTouch / 0.0042 : this.player.sensPC / 0.0022) * 100));
      ri.oninput = () => {
        const k = Number(ri.value) / 100;
        this.player.sensPC = 0.0022 * k;
        this.player.sensTouch = 0.0042 * k;
      };
      sens.appendChild(ri);
      opt.appendChild(sens);

      const hr = document.createElement("hr");
      body.appendChild(hr);

      if (this.cloud.signedIn) {
        mk("アカウントの設定", "ghost", () => this._accountPanel());
        mk("ログアウト", "ghost", () => {
          this.cloud.signOut();
          this.ui.toast("ログアウトしました。この端末の記録は残ります。");
          this.ui.closePause();
          this.doPause();
        });
      } else {
        mk("ログインして、どの端末でも続ける", "ghost", () => {
          if (this.onWantLogin) this.onWantLogin();
        });
      }

      mk("最初からやり直す", "danger", () => {
        this.doPause((b2) => {
          const p = document.createElement("p");
          p.className = "warn";
          p.textContent = "いまの記録を消して、最初からやり直しますか。";
          b2.appendChild(p);
          const yes = document.createElement("button");
          yes.className = "danger"; yes.textContent = "消してやり直す";
          yes.onclick = async () => {
            this.state = this._fresh();
            this.player.hasLight = false; this.player.lightOn = false;
            this.player.battery = 1; this.player.spare = 0;
            await this.cloud.save(this.payload(), true);
            this.ui.closePause();
            await this.ui.fade(1, 0.4);
            await this.loadFloor(1, 0, true);
            await this.ui.fade(0, 1.2);
            this.resume();
          };
          b2.appendChild(yes);
          const no = document.createElement("button");
          no.className = "ghost"; no.textContent = "やめる";
          no.onclick = () => { this.ui.closePause(); this.doPause(); };
          b2.appendChild(no);
        });
      });
    });
  }

  _accountPanel() {
    this.doPause((body) => {
      const u = this.cloud.user;
      const t = document.createElement("h3");
      t.textContent = "アカウントの設定";
      body.appendChild(t);

      const info = document.createElement("p");
      info.className = "dim";
      info.textContent = "名前：" + u.display + "　／　メール：" + (u.hasMail ? u.mail : "登録なし");
      body.appendChild(info);

      const note = document.createElement("p");
      note.className = "dim";
      note.textContent = "メールアドレスを登録しておくと、名前を忘れてもログインできます。登録しないままでも、ずっと遊べます。";
      body.appendChild(note);

      const field = (labelText, type, ph) => {
        const l = document.createElement("label");
        l.className = "fld";
        const s = document.createElement("span");
        s.textContent = labelText;
        const i = document.createElement("input");
        i.type = type; i.placeholder = ph || "";
        if (type === "password") i.autocomplete = "current-password";
        l.appendChild(s); l.appendChild(i);
        body.appendChild(l);
        return i;
      };

      const pw = field("いまの合言葉", "password", "確認のため必要です");
      const mail = field("メールアドレス", "email", u.hasMail ? "変更するときだけ入力" : "登録するときだけ入力");
      const npw = field("新しい合言葉", "password", "変えるときだけ入力");

      const msg = document.createElement("p");
      msg.className = "msg";
      body.appendChild(msg);

      const run = async (fn, okText) => {
        if (!pw.value) { msg.textContent = "いまの合言葉を入れてください。"; msg.className = "msg err"; return; }
        msg.textContent = "送っています…"; msg.className = "msg";
        const r = await fn();
        if (r.ok) { msg.textContent = okText; msg.className = "msg ok"; info.textContent = "名前：" + this.cloud.user.display + "　／　メール：" + (this.cloud.user.hasMail ? this.cloud.user.mail : "登録なし"); }
        else { msg.textContent = r.why; msg.className = "msg err"; }
      };

      const mk = (label, cls, fn) => {
        const b = document.createElement("button");
        b.className = cls; b.textContent = label;
        b.onclick = () => { this.snd.ui(); fn(); };
        body.appendChild(b);
      };

      mk("メールアドレスを登録・変更", "ghost", () => {
        if (!mail.value) { msg.textContent = "メールアドレスを入れてください。"; msg.className = "msg err"; return; }
        run(() => this.cloud.setMail(pw.value, mail.value), "メールアドレスを登録しました。");
      });
      if (u.hasMail) {
        mk("メールアドレスを外す", "ghost", () => run(() => this.cloud.clearMail(pw.value), "メールアドレスを外しました。"));
      }
      mk("合言葉を変える", "ghost", () => {
        if (!npw.value) { msg.textContent = "新しい合言葉を入れてください。"; msg.className = "msg err"; return; }
        run(() => this.cloud.setPw(pw.value, npw.value), "合言葉を変えました。");
      });

      const hr = document.createElement("hr");
      body.appendChild(hr);
      mk("戻る", "big", () => { this.ui.closePause(); this.doPause(); });
    });
  }

  resume() {
    this.ui.closeAll();
    this.paused = false;
    this._ending = false;
    this.clock.getDelta();
    if (!this.touch && !this.player.locked && this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }

  _afterClose() {
    if (this.ui.open) return;
    this.paused = false;
    this.clock.getDelta();
    // 「閉じる」を押した勢いで、そのまま何かを調べてしまわないように
    this.player.wantInteract = false;
    this.player.wantBook = false;
    this.player.wantPause = false;
    // ノートを読み終えた、そのとき
    if (this._pendingChase) { this._pendingChase = false; this._startChase(); }
  }
}
