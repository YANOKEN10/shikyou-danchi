// ============================================================
//  プレイヤー（視点・移動・懐中電灯）
//   ・パソコン … WASD ＋ マウス（画面を1回クリックで視点が固定されます）
//   ・スマホ　 … 左スティックで移動、画面をなぞって見まわす
//   ・「音」の大きさを持っていて、追跡者はこれを聞きつけます。
// ============================================================
import * as THREE from "../lib/three.module.js";

const CLAMP_PITCH = Math.PI / 2 - 0.06;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.02;
const RADIUS = 0.3;

export class Player {
  constructor(camera, sound) {
    this.cam = camera;
    this.snd = sound;

    this.pos = new THREE.Vector3(0, 0, 1.2);
    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();

    this.crouch = false;
    this.running = false;
    this.eye = EYE_STAND;
    this.bob = 0;
    this.stepAcc = 0;
    this.noise = 0;         // 0〜1。追跡者が聞く音の大きさ
    this.moving = false;
    this.inUnit = false;    // 住戸の中にいる（安全）
    this.frozen = false;

    this.stamina = 1;
    this.tired = false;

    // 懐中電灯
    this.lightOn = false;
    this.battery = 1;
    this.spare = 0;
    this.hasLight = false;

    this.keys = Object.create(null);
    this.look = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
    this.wantInteract = false;
    this.wantBook = false;
    this.wantPause = false;

    this.sensPC = 0.0022;
    this.sensTouch = 0.0042;
    this.invertY = false;

    this._bindKeys();
  }

  /* ---------- 入力 ---------- */

  _bindKeys() {
    const down = (e) => {
      const k = e.code;
      if (k === "Tab") e.preventDefault();
      if (this.keys[k]) return;
      this.keys[k] = true;
      if (k === "KeyE") this.wantInteract = true;
      if (k === "Tab" || k === "KeyI") this.wantBook = true;
      if (k === "Escape") this.wantPause = true;
      if (k === "KeyF") this.toggleLight();
    };
    const up = (e) => { this.keys[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => { this.keys = Object.create(null); });
    this._unbindKeys = () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }

  // マウス（ポインタロック）
  bindMouse(el) {
    this.el = el;
    el.addEventListener("click", () => {
      if (this.locked || this.frozen || this.touchMode) return;
      if (el.requestPointerLock) el.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === el;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked || this.frozen) return;
      this.yaw -= e.movementX * this.sensPC;
      this.pitch -= e.movementY * this.sensPC * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-CLAMP_PITCH, Math.min(CLAMP_PITCH, this.pitch));
    });
    document.addEventListener("mousedown", (e) => {
      if (this.locked && e.button === 0) this.wantInteract = true;
    });
  }

  unlock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  // スマホ。stickEl＝左下のつまみ、lookEl＝見まわす範囲
  bindTouch(stickEl, knobEl, lookEl) {
    this.touchMode = true;
    document.body.classList.add("touch");

    let stickId = null, cx = 0, cy = 0;
    const R = 54;

    const stickStart = (t) => {
      stickId = t.identifier;
      const r = stickEl.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      stickMove(t);
    };
    const stickMove = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knobEl.style.transform = "translate(" + dx + "px," + dy + "px)";
      this.stick.x = dx / R;
      this.stick.y = dy / R;
    };
    const stickEnd = () => {
      stickId = null;
      this.stick.x = this.stick.y = 0;
      knobEl.style.transform = "translate(0,0)";
    };

    let lookId = null, lx = 0, ly = 0, moved = 0;

    // つまみの近く、または画面の左下寄りを触ったら「移動」、それ以外は「見まわす」
    const isStickArea = (t) => {
      const r = stickEl.getBoundingClientRect();
      if (t.clientX > r.left - 44 && t.clientX < r.right + 44 &&
          t.clientY > r.top - 44 && t.clientY < r.bottom + 44) return true;
      return t.clientX < window.innerWidth * 0.45 && t.clientY > window.innerHeight * 0.5;
    };

    const onStart = (e) => {
      for (const t of e.changedTouches) {
        // 画面のボタンを押したときは、視点を動かさない
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el && el.closest && el.closest(".tbtn")) continue;
        if (stickId === null && isStickArea(t)) {
          stickStart(t);
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY; moved = 0;
        }
      }
    };
    const onMove = (e) => {
      if (this.frozen) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickMove(t); e.preventDefault(); }
        else if (t.identifier === lookId) {
          const dx = t.clientX - lx, dy = t.clientY - ly;
          lx = t.clientX; ly = t.clientY;
          moved += Math.abs(dx) + Math.abs(dy);
          this.yaw -= dx * this.sensTouch;
          this.pitch -= dy * this.sensTouch * (this.invertY ? -1 : 1);
          this.pitch = Math.max(-CLAMP_PITCH, Math.min(CLAMP_PITCH, this.pitch));
          e.preventDefault();
        }
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) stickEnd();
        else if (t.identifier === lookId) {
          // ほとんど動かさずに離したら「調べる」
          if (moved < 12) this.wantInteract = true;
          lookId = null;
        }
      }
    };

    // つまみもボタンも同じ入れ物の中にあるので、まとめて受けます
    const surface = lookEl.parentElement || lookEl;
    surface.addEventListener("touchstart", onStart, { passive: false });
    surface.addEventListener("touchmove", onMove, { passive: false });
    surface.addEventListener("touchend", onEnd);
    surface.addEventListener("touchcancel", onEnd);
  }

  // 画面上のボタン（押している間だけ効くものと、押した瞬間のもの）
  bindButton(el, kind) {
    const on = (e) => {
      e.preventDefault();
      el.classList.add("on");
      if (kind === "run") this.btnRun = true;
      else if (kind === "crouch") this.btnCrouch = !this.btnCrouch, el.classList.toggle("on", this.btnCrouch);
      else if (kind === "act") this.wantInteract = true;
      else if (kind === "light") this.toggleLight();
      else if (kind === "book") this.wantBook = true;
      else if (kind === "pause") this.wantPause = true;
    };
    const off = (e) => {
      if (kind === "run") { this.btnRun = false; el.classList.remove("on"); }
      else if (kind !== "crouch") el.classList.remove("on");
    };
    el.addEventListener("touchstart", on, { passive: false });
    el.addEventListener("touchend", off);
    el.addEventListener("touchcancel", off);
    el.addEventListener("mousedown", on);
    el.addEventListener("mouseup", off);
    el.addEventListener("mouseleave", off);
  }

  /* ---------- 懐中電灯 ---------- */

  toggleLight() {
    if (this.frozen) return;

    // まだ持っていない／電池が切れている、を黙って無視しない
    if (!this.hasLight) {
      this.snd.click();
      if (this.onLightFail) this.onLightFail("none");
      return;
    }
    if (!this.lightOn && this.battery <= 0.001) {
      if (this.spare > 0) {
        this.spare--;
        this.battery = 1;
        if (this.onLightFail) this.onLightFail("swap");
      } else {
        this.snd.click();
        if (this.onLightFail) this.onLightFail("empty");
        return;
      }
    }
    this.lightOn = !this.lightOn;
    this.snd.click();
  }

  swapBattery() {
    if (this.spare <= 0) return false;
    this.spare--;
    this.battery = 1;
    this.snd.pickup();
    return true;
  }

  /* ---------- 毎フレーム ---------- */

  update(dt, col) {
    const k = this.keys;

    // 向き
    let ix = 0, iz = 0;
    if (!this.frozen) {
      if (k.KeyW || k.ArrowUp) iz -= 1;
      if (k.KeyS || k.ArrowDown) iz += 1;
      if (k.KeyA || k.ArrowLeft) ix -= 1;
      if (k.KeyD || k.ArrowRight) ix += 1;
      if (this.touchMode) {
        ix += this.stick.x;
        iz += this.stick.y;
      }
    }
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }

    const wantRun = Boolean(k.ShiftLeft || k.ShiftRight || this.btnRun);
    const wantCrouch = Boolean(k.ControlLeft || k.ControlRight || k.KeyC || this.btnCrouch);

    this.crouch = wantCrouch;
    this.running = wantRun && !wantCrouch && mag > 0.2 && this.stamina > 0.02 && !this.tired;

    // 体力
    if (this.running) {
      this.stamina = Math.max(0, this.stamina - dt * 0.28);
      if (this.stamina <= 0) this.tired = true;
    } else {
      this.stamina = Math.min(1, this.stamina + dt * (this.crouch ? 0.24 : 0.16));
      if (this.tired && this.stamina > 0.35) this.tired = false;
    }

    const speed = this.crouch ? 1.25 : this.running ? 4.5 : 2.45;

    // 進む向きは、見ている向き
    // カメラの向き（-sin, -cos）にそろえる。ここがずれると、見ている方向と進む方向が食い違う
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = ix * cy + iz * sy;
    const wz = -ix * sy + iz * cy;

    const target = new THREE.Vector3(wx * speed, 0, wz * speed);
    // 少しだけ滑らせる（急に止まらない）
    this.vel.lerp(target, 1 - Math.pow(0.0008, dt));

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    col.resolve(this.pos, RADIUS);

    this.moving = mag > 0.12;

    // 目の高さと、歩くときの揺れ
    const targetEye = this.crouch ? EYE_CROUCH : EYE_STAND;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 9);

    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (this.moving) {
      this.bob += dt * (this.running ? 11.5 : this.crouch ? 5.0 : 7.6);
      this.stepAcc += spd * dt;
      const stride = this.running ? 1.9 : this.crouch ? 1.35 : 1.55;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.snd.step(this.running ? "run" : this.crouch ? "crouch" : "walk", !this.inUnit);
        if (this.onStep) this.onStep();
      }
    } else {
      this.stepAcc = 0;
    }

    // 出している音
    const want = !this.moving ? 0 : this.running ? 1 : this.crouch ? 0.14 : 0.5;
    this.noise += (want - this.noise) * Math.min(1, dt * 6);

    // 電池
    if (this.lightOn) {
      this.battery = Math.max(0, this.battery - dt * 0.0018);
      if (this.battery <= 0) {
        this.lightOn = false;
        if (this.onBatteryDead) this.onBatteryDead();
      }
    }

    // カメラ
    const bobY = this.moving ? Math.sin(this.bob) * (this.running ? 0.055 : 0.03) : Math.sin(performance.now() * 0.0011) * 0.006;
    const bobX = this.moving ? Math.cos(this.bob * 0.5) * (this.running ? 0.03 : 0.014) : 0;
    this.cam.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.eye + bobY, this.pos.z + bobX * Math.sin(this.yaw));
    this.cam.rotation.set(0, 0, 0);
    this.cam.rotateY(this.yaw);
    this.cam.rotateX(this.pitch);
    this.cam.rotateZ(this.moving ? Math.sin(this.bob * 0.5) * 0.012 : 0);
  }

  // 見ている向き（水平のみ）
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  place(v, yaw) {
    this.pos.copy(v);
    this.pos.y = 0;
    this.vel.set(0, 0, 0);
    if (yaw != null) this.yaw = yaw;
    this.pitch = 0;
  }

  serialize() {
    return {
      hasLight: this.hasLight, lightOn: this.lightOn,
      battery: Number(this.battery.toFixed(3)), spare: this.spare,
    };
  }

  restore(s) {
    if (!s) return;
    this.hasLight = Boolean(s.hasLight);
    this.lightOn = Boolean(s.lightOn) && this.hasLight;
    this.battery = typeof s.battery === "number" ? s.battery : 1;
    this.spare = s.spare | 0;
  }
}
