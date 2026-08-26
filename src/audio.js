// ============================================================
//  音（すべて WebAudio で合成。音声ファイルは1つも使いません）
//   ・ブラウザの決まりで、最初の操作より前には音を鳴らせません。
//     unlock() を「はじめる」ボタンなどから呼んでください。
// ============================================================

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

export class Sound {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.tension = 0;      // 0=静か 1=すぐそこ
    this._amb = null;
    this._buzz = null;
    this._heart = null;
    this._breath = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // 団地の外廊下らしい、短めの反響
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.7, 2.6);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.34;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    this.noiseBuf = this._noise(2.0);
    this.ready = true;
  }

  setMuted(m) {
    this.muted = Boolean(m);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  /* ---------- 材料づくり ---------- */

  _noise(sec) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // 残響用のインパルス応答（減衰するノイズ）
  _impulse(sec, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return b;
  }

  // 送り先（乾いた音＋残響）
  _out(node, wet) {
    node.connect(this.dry);
    if (wet !== 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet == null ? 1 : wet;
      node.connect(g);
      g.connect(this.verb);
    }
  }

  _src(loop) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = Boolean(loop);
    return s;
  }

  // ノイズを1回、短く鳴らす
  burst(o) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;
    const src = this._src(false);
    src.playbackRate.value = o.rate || 1;

    const f = ctx.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.frequency.value = o.freq || 800;
    f.Q.value = o.q == null ? 1 : o.q;

    const g = ctx.createGain();
    const vol = (o.vol == null ? 0.3 : o.vol);
    const atk = o.atk == null ? 0.004 : o.atk;
    const dur = o.dur == null ? 0.12 : o.dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);

    src.connect(f); f.connect(g);
    this._out(g, o.wet);
    src.start(t, o.off == null ? Math.random() * 1.5 : o.off);
    src.stop(t + atk + dur + 0.05);
  }

  // 音程のある音を1回
  tone(o) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;
    const osc = ctx.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f0 || 200, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.dur || 0.3));

    const g = ctx.createGain();
    const vol = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (o.atk || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.3));

    osc.connect(g);
    this._out(g, o.wet);
    osc.start(t);
    osc.stop(t + (o.dur || 0.3) + 0.05);
  }

  /* ---------- 足音 ---------- */

  step(kind, outdoor) {
    // かかとの当たる硬い音＋わずかな砂利
    const hard = kind === "run" ? 0.42 : kind === "crouch" ? 0.07 : 0.2;
    this.burst({ freq: rnd(120, 190), q: 1.1, vol: hard, dur: kind === "crouch" ? 0.05 : 0.09, wet: outdoor ? 0.9 : 0.45 });
    this.burst({ freq: rnd(2200, 3400), q: 0.7, vol: hard * 0.22, dur: 0.035, wet: 0.3 });
    if (kind !== "crouch" && Math.random() < 0.5) {
      this.burst({ freq: rnd(4200, 6200), q: 0.5, vol: hard * 0.08, dur: 0.02, wet: 0.2 });
    }
  }

  stepStair() {
    this.burst({ freq: rnd(160, 240), q: 2.4, vol: 0.26, dur: 0.11, wet: 1.1 });
    this.burst({ freq: rnd(1400, 2000), q: 3, vol: 0.06, dur: 0.05, wet: 0.5 });
  }

  /* ---------- もの ---------- */

  doorOpen() {
    // 蝶番のきしみ
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(rnd(190, 260), t);
    osc.frequency.linearRampToValueAtTime(rnd(320, 430), t + 0.7);

    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 7;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = rnd(11, 19);
    const lg = ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg); lg.connect(osc.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.075, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);

    osc.connect(f); f.connect(g);
    this._out(g, 0.9);
    osc.start(t); lfo.start(t);
    osc.stop(t + 0.85); lfo.stop(t + 0.85);
  }

  doorShut() {
    this.burst({ freq: 150, q: 0.8, vol: 0.45, dur: 0.16, wet: 1.2 });
    this.tone({ type: "triangle", f0: 90, f1: 45, vol: 0.22, dur: 0.22, wet: 0.8 });
    setTimeout(() => this.burst({ freq: 2600, q: 4, vol: 0.09, dur: 0.04 }), 40);
  }

  locked() {
    // 開かない扉。ノブがガチャつく
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.burst({ freq: rnd(1800, 2800), q: 5, vol: 0.16, dur: 0.05, wet: 0.6 });
        this.burst({ freq: rnd(220, 320), q: 2, vol: 0.1, dur: 0.06, wet: 0.6 });
      }, i * 110);
    }
  }

  paper() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.burst({ freq: rnd(2600, 5200), q: 0.6, vol: rnd(0.05, 0.11), dur: rnd(0.03, 0.07), wet: 0.2 }), i * rnd(30, 70));
    }
  }

  pickup() {
    this.tone({ type: "sine", f0: 520, f1: 780, vol: 0.14, dur: 0.18, wet: 0.5 });
    this.burst({ freq: 3000, q: 1, vol: 0.06, dur: 0.05 });
  }

  click() {
    this.burst({ freq: 3200, q: 6, vol: 0.2, dur: 0.02, wet: 0.15 });
    this.burst({ freq: 900, q: 4, vol: 0.1, dur: 0.03, wet: 0.15 });
  }

  ui() { this.tone({ type: "sine", f0: 700, vol: 0.06, dur: 0.06, wet: 0.2 }); }

  // 遠くの物音
  thud(far) {
    const v = far ? 0.16 : 0.34;
    this.tone({ type: "sine", f0: 62, f1: 34, vol: v, dur: 0.5, wet: 1.4 });
    this.burst({ freq: 160, q: 0.7, vol: v * 0.5, dur: 0.18, wet: 1.4 });
  }

  knock(n) {
    const c = n || 3;
    for (let i = 0; i < c; i++) {
      setTimeout(() => {
        this.burst({ freq: rnd(260, 380), q: 2.5, vol: 0.26, dur: 0.09, wet: 1.3 });
        this.tone({ type: "sine", f0: 110, f1: 70, vol: 0.12, dur: 0.14, wet: 1.2 });
      }, i * rnd(320, 420));
    }
  }

  /* ---------- 驚かす音 ---------- */

  stinger() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;

    // 弦を擦るような不協和音
    [0, 1, 2].forEach((i) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const base = [880, 932, 1245][i];
      osc.frequency.setValueAtTime(base * rnd(0.98, 1.02), t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.35, t + 1.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 5200;
      osc.connect(f); f.connect(g);
      this._out(g, 1.2);
      osc.start(t); osc.stop(t + 1.25);
    });

    this.burst({ freq: 200, q: 0.4, vol: 0.5, dur: 0.5, wet: 1.4 });
    this.tone({ type: "sine", f0: 55, f1: 28, vol: 0.4, dur: 1.4, wet: 1.0 });
  }

  whisper() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;
    const src = this._src(false);
    src.playbackRate.value = rnd(0.7, 1.0);

    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = rnd(900, 1600); f.Q.value = 3.5;

    // 口の動きらしい揺れ
    const lfo = ctx.createOscillator();
    lfo.type = "sine"; lfo.frequency.value = rnd(4, 9);
    const lg = ctx.createGain(); lg.gain.value = 400;
    lfo.connect(lg); lg.connect(f.frequency);

    const g = ctx.createGain();
    const dur = rnd(0.6, 1.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(f); f.connect(g);
    this._out(g, 1.3);
    src.start(t, Math.random()); lfo.start(t);
    src.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }

  /* ---------- 鳴りっぱなしの音 ---------- */

  // 夜風（外廊下）
  ambienceOn() {
    if (!this.ready || this._amb) return;
    const ctx = this.ctx;
    const src = this._src(true);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 420; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.09, this.t + 2.5);

    // 風の強弱
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = ctx.createGain(); lg.gain.value = 0.045;
    lfo.connect(lg); lg.connect(g.gain);

    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this._amb = { src, g, lfo, f };
  }

  ambienceOff() {
    if (!this._amb) return;
    const a = this._amb; this._amb = null;
    a.g.gain.linearRampToValueAtTime(0.0001, this.t + 1.2);
    setTimeout(() => { try { a.src.stop(); a.lfo.stop(); } catch (e) {} }, 1400);
  }

  // 部屋の中の空気（低く、耳に残る唸り）
  roomToneOn() {
    if (!this.ready || this._room) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 52;
    const osc2 = ctx.createOscillator(); osc2.type = "sine"; osc2.frequency.value = 78.5;
    const src = this._src(true);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 240; f.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    src.connect(f); f.connect(ng);
    const g = ctx.createGain(); g.gain.value = 0.0001;
    osc.connect(g); osc2.connect(g); ng.connect(g);
    g.connect(this.master);
    osc.start(); osc2.start(); src.start();
    g.gain.setTargetAtTime(0.075, this.t, 0.9);
    this._room = { osc, osc2, src, g };
  }

  roomToneOff() {
    if (!this._room) return;
    const r = this._room; this._room = null;
    r.g.gain.setTargetAtTime(0.0001, this.t, 0.35);
    setTimeout(() => { try { r.osc.stop(); r.osc2.stop(); r.src.stop(); } catch (e) {} }, 1200);
  }

  // 廊下を、誰かが通っていく足音
  passBy() {
    if (!this.ready || this.muted) return;
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const far = Math.abs(i - n / 2) / (n / 2);       // 近づいて、遠ざかる
        const v = 0.06 + (1 - far) * 0.16;
        this.burst({ freq: rnd(120, 180), q: 1.2, vol: v, dur: 0.1, wet: 1.4 });
        this.burst({ freq: rnd(2400, 3200), q: 0.8, vol: v * 0.2, dur: 0.04, wet: 0.6 });
      }, i * rnd(430, 520));
    }
  }

  // 水の音（風呂の向こう）
  waterOn() {
    if (!this.ready || this._water) return;
    const ctx = this.ctx;
    const src = this._src(true);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    g.gain.setTargetAtTime(0.028, this.t, 0.6);
    this._water = { src, g };
  }

  waterOff() {
    if (!this._water) return;
    const w = this._water; this._water = null;
    w.g.gain.setTargetAtTime(0.0001, this.t, 0.12);
    setTimeout(() => { try { w.src.stop(); } catch (e) {} }, 700);
  }

  // 扉が勢いよく閉まる
  slam() {
    this.burst({ freq: 110, q: 0.7, vol: 0.6, dur: 0.22, wet: 1.6 });
    this.tone({ type: "triangle", f0: 74, f1: 32, vol: 0.34, dur: 0.4, wet: 1.2 });
    setTimeout(() => this.burst({ freq: 2400, q: 5, vol: 0.14, dur: 0.05, wet: 0.8 }), 45);
  }

  // 蛍光灯のうなり
  buzzOn(level) {
    if (!this.ready) return;
    if (this._buzz) { this._buzz.g.gain.setTargetAtTime(level == null ? 0.03 : level, this.t, 0.2); return; }
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 100;
    const osc2 = ctx.createOscillator(); osc2.type = "square"; osc2.frequency.value = 300;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 6;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    osc.connect(f); osc2.connect(f); f.connect(g); g.connect(this.master);
    osc.start(); osc2.start();
    g.gain.setTargetAtTime(level == null ? 0.03 : level, this.t, 0.5);
    this._buzz = { osc, osc2, g };
  }

  buzzOff() {
    if (!this._buzz) return;
    const b = this._buzz; this._buzz = null;
    b.g.gain.setTargetAtTime(0.0001, this.t, 0.15);
    setTimeout(() => { try { b.osc.stop(); b.osc2.stop(); } catch (e) {} }, 600);
  }

  // 心臓の音。緊張(0〜1)で速さと大きさが変わる
  setTension(x) {
    this.tension = clamp(x, 0, 1);
    if (!this.ready) return;
    if (this.tension > 0.12 && !this._heart) this._startHeart();
    if (this.tension <= 0.12 && this._heart) this._stopHeart();
  }

  _startHeart() {
    const self = this;
    let alive = true;
    const beat = () => {
      if (!alive || !self.ready || !self._heart) return;
      const v = 0.06 + self.tension * 0.22;
      self.tone({ type: "sine", f0: 62, f1: 40, vol: v, dur: 0.16, wet: 0.2 });
      setTimeout(() => self.tone({ type: "sine", f0: 54, f1: 34, vol: v * 0.66, dur: 0.14, wet: 0.2 }), 150);
      const bpm = 58 + self.tension * 78;
      self._heart.timer = setTimeout(beat, (60000 / bpm));
    };
    this._heart = { stop: () => { alive = false; }, timer: 0 };
    beat();
  }

  _stopHeart() {
    if (!this._heart) return;
    this._heart.stop();
    clearTimeout(this._heart.timer);
    this._heart = null;
  }

  // すぐ後ろにいるときの息づかい
  breathOn() {
    if (!this.ready || this._breath) return;
    const self = this;
    let alive = true;
    const cycle = () => {
      if (!alive || !self._breath) return;
      self.burst({ freq: rnd(500, 800), q: 1.2, vol: 0.09, dur: 0.45, atk: 0.18, wet: 0.8, rate: 0.6 });
      self._breath.timer = setTimeout(cycle, rnd(1100, 1700));
    };
    this._breath = { stop: () => { alive = false; }, timer: 0 };
    cycle();
  }

  breathOff() {
    if (!this._breath) return;
    this._breath.stop();
    clearTimeout(this._breath.timer);
    this._breath = null;
  }

  allOff() {
    this.ambienceOff();
    this.buzzOff();
    this._stopHeart();
    this.breathOff();
    this.roomToneOff();
    this.waterOff();
  }
}
