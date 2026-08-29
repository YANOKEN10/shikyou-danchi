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
    this.volume = 1;       // 0〜1
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

    this._keepAwake();
    this._watchGestures();
  }

  // iPhone のマナーモードでは WebAudio が消されることがある。
  // 無音の音声を一本流しておくと、音楽の再生あつかいになって鳴ることがある。
  // （端末や iOS の版によっては、それでも鳴りません）
  _keepAwake() {
    if (this._silent) return;
    try {
      const rate = 8000, n = rate / 2;
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const put = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      put(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); put(8, "WAVE"); put(12, "fmt ");
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      put(36, "data"); v.setUint32(40, n * 2, true);
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);

      const a = document.createElement("audio");
      a.setAttribute("playsinline", "");
      a.setAttribute("aria-hidden", "true");
      a.loop = true;
      a.volume = 0.0001;
      a.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none";
      a.src = "data:audio/wav;base64," + btoa(bin);
      // 画面には出ないが、DOM に置いておく（iOS はそのほうが確実）
      document.body.appendChild(a);
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* 流せなくても、ふつうは鳴ります */ });
      this._silent = a;
    } catch (e) { /* 使えない環境もある */ }
  }

  // 画面を触るたび、止まっていたら鳴らせる状態に戻す
  _watchGestures() {
    if (this._watching) return;
    this._watching = true;
    const wake = () => {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      if (this._silent && this._silent.paused) {
        const p = this._silent.play();
        if (p && p.catch) p.catch(() => {});
      }
    };
    ["pointerdown", "touchend", "keydown", "visibilitychange"].forEach((ev) => {
      document.addEventListener(ev, wake, { passive: true });
    });
  }

  setMuted(m) {
    this.muted = Boolean(m);
    this._apply();
  }

  // 0〜1。1で作ったままの大きさ
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
    this._apply();
  }

  _apply() {
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9 * (this.volume == null ? 1 : this.volume);
  }

  // 音の一覧（小休止の「音のたしかめ」で使います）
  catalog() {
    return [
      ["足音（歩く）", () => this.step("walk", true)],
      ["足音（走る）", () => this.step("run", true)],
      ["足音（しゃがむ）", () => this.step("crouch", true)],
      ["階段", () => this.stepStair()],
      ["扉を開ける", () => this.doorOpen()],
      ["扉を閉める", () => this.doorShut()],
      ["鍵がかかっている", () => this.locked()],
      ["扉が勢いよく閉まる", () => this.slam()],
      ["紙をめくる", () => this.paper()],
      ["引き出し・押し入れ", () => this.drawer()],
      ["袋がこすれる", () => this.rustle()],
      ["床がきしむ", () => this.creakFloor()],
      ["鍋が落ちる", () => this.clatter()],
      ["拾う", () => this.pickup()],
      ["懐中電灯", () => this.click()],
      ["分電盤のつまみ", () => this.switchFlip()],
      ["水が一滴", () => this.drip()],
      ["蛍光灯が切れる", () => this.tubePop()],
      ["外廊下の風", () => this.gust()],
      ["遠くの物音", () => this.thud(true)],
      ["戸を叩く音", () => this.knock(3)],
      ["廊下を通る足音", () => this.passBy()],
      ["鏡が鳴る", () => this.mirrorRing()],
      ["ささやき", () => this.whisper()],
      ["見つかったとき", () => this.stinger()],
    ];
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

  // 濾したあとの目減りを見積もる。
  // 白色雑音を細い帯域で濾すと、通る成分はごくわずかになる。
  // その分を戻さないと、足音や扉の音だけが極端に小さくなってしまう。
  _makeup(type, freq, q) {
    const nyq = (this.ctx ? this.ctx.sampleRate : 48000) / 2;
    let bw;
    if (type === "bandpass") bw = freq / Math.max(0.3, q);
    else if (type === "highpass") bw = nyq - freq;   // 上が全部通るので、ほとんど減らない
    else bw = freq;                                   // lowpass など
    return Math.min(22, Math.max(1, Math.sqrt(nyq / Math.max(20, bw))));
  }

  // ノイズを1回、短く鳴らす
  burst(o) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;
    const src = this._src(false);
    src.playbackRate.value = o.rate || 1;

    const type = o.type || "bandpass";
    const freq = o.freq || 800;
    const q = o.q == null ? 1 : o.q;

    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;

    const g = ctx.createGain();
    const vol = (o.vol == null ? 0.3 : o.vol) * this._makeup(type, freq, q);
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
    // かかとの当たる硬い音、砂利、そして走ったときの踏み込み
    const run = kind === "run", crouch = kind === "crouch";
    const hard = run ? 0.62 : crouch ? 0.08 : 0.26;
    this.burst({ freq: rnd(125, 185), q: 1.1, vol: hard, dur: crouch ? 0.05 : 0.09, wet: outdoor ? 0.9 : 0.45 });
    this.burst({ freq: rnd(2200, 3400), q: 0.7, vol: hard * 0.20, dur: 0.035, wet: 0.3 });
    if (!crouch && Math.random() < 0.5) {
      this.burst({ freq: rnd(4200, 6200), q: 0.5, vol: hard * 0.07, dur: 0.02, wet: 0.2 });
    }
    // 走るとコンクリートが低く鳴る
    if (run) this.tone({ type: "sine", f0: rnd(96, 124), f1: 58, vol: 0.10, dur: 0.13, wet: outdoor ? 1.0 : 0.4 });
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
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);

    osc.connect(f); f.connect(g);
    this._out(g, 0.9);
    osc.start(t); lfo.start(t);
    osc.stop(t + 0.85); lfo.stop(t + 0.85);
  }

  doorShut() {
    this.burst({ freq: 150, q: 0.8, vol: 0.26, dur: 0.16, wet: 1.2 });
    this.tone({ type: "triangle", f0: 90, f1: 45, vol: 0.18, dur: 0.22, wet: 0.8 });
    setTimeout(() => this.burst({ freq: 2600, q: 4, vol: 0.08, dur: 0.04 }), 40);
  }

  locked() {
    // 開かない扉。ノブがガチャつく
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.burst({ freq: rnd(1800, 2800), q: 5, vol: 0.19, dur: 0.05, wet: 0.6 });
        this.burst({ freq: rnd(220, 320), q: 2, vol: 0.12, dur: 0.06, wet: 0.6 });
      }, i * 110);
    }
  }

  paper() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.burst({ freq: rnd(2600, 5200), q: 0.6, vol: rnd(0.07, 0.15), dur: rnd(0.03, 0.07), wet: 0.2 }), i * rnd(30, 70));
    }
  }

  // 何かを手に取る。音程は上げない（上げると「取った！」の効果音になってしまう）
  pickup() {
    this.burst({ freq: 1500, q: 1.8, vol: 0.15, dur: 0.055, wet: 0.4, rate: 0.9 });
    this.tone({ type: "triangle", f0: 120, f1: 82, vol: 0.08, dur: 0.17, wet: 0.6 });
    setTimeout(() => this.burst({ freq: 430, q: 1.2, vol: 0.19, dur: 0.10, wet: 0.7 }), 45);
    setTimeout(() => this.burst({ freq: 3400, q: 0.7, vol: 0.055, dur: 0.05, wet: 0.3 }), 95);
  }

  click() {
    this.burst({ freq: 2700, q: 7, vol: 0.80, dur: 0.018, wet: 0.12 });
    setTimeout(() => this.burst({ freq: 720, q: 5, vol: 0.45, dur: 0.032, wet: 0.14 }), 18);
  }

  // 画面の操作音。乾いた小さな打音だけ（音程を持たせない）
  ui() {
    this.burst({ freq: 1100, q: 3.5, vol: 0.10, dur: 0.022, wet: 0.12 });
    this.burst({ freq: 300, q: 2.2, vol: 0.07, dur: 0.03, wet: 0.12 });
  }

  // 遠くの物音
  thud(far) {
    const v = far ? 0.13 : 0.30;
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

  /* ---------- 団地のこまかい音 ---------- */

  // 分電盤のつまみ。重い金属が落ちる
  switchFlip() {
    this.burst({ freq: 420, q: 3.2, vol: 0.34, dur: 0.05, wet: 0.7 });
    setTimeout(() => {
      this.burst({ freq: 1500, q: 6, vol: 0.30, dur: 0.04, wet: 0.7 });
      this.tone({ type: "triangle", f0: 128, f1: 58, vol: 0.11, dur: 0.09, wet: 0.6 });
    }, 55);
  }

  // 金物が落ちて、床で跳ねる（台所の鍋）
  clatter() {
    this.burst({ freq: 620, q: 2.2, vol: 0.5, dur: 0.09, wet: 1.3 });
    this.tone({ type: "triangle", f0: 240, f1: 150, vol: 0.16, dur: 0.5, wet: 1.4 });
    this.tone({ type: "sine", f0: 96, f1: 58, vol: 0.22, dur: 0.35, wet: 1.2 });
    // 跳ねて、だんだん間隔が詰まる
    let d = 150;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.burst({ freq: rnd(520, 900), q: 3, vol: 0.26 / (i * 0.6 + 1), dur: 0.05, wet: 1.2 });
        this.tone({ type: "triangle", f0: rnd(200, 300), f1: 140, vol: 0.06 / (i * 0.5 + 1), dur: 0.18, wet: 1.1 });
      }, d);
      d += 150 * Math.pow(0.68, i);
    }
  }

  // 床のきしみ。部屋の中を歩くと、たまに鳴る
  creakFloor() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const base = rnd(70, 130);
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * rnd(1.2, 1.8), t + rnd(0.2, 0.45));

    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = rnd(380, 700); f.Q.value = 9;

    // きしみの粒
    const lfo = ctx.createOscillator();
    lfo.type = "square"; lfo.frequency.value = rnd(18, 34);
    const lg = ctx.createGain(); lg.gain.value = 22;
    lfo.connect(lg); lg.connect(osc.frequency);

    const g = ctx.createGain();
    const dur = rnd(0.25, 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.40, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(f); f.connect(g);
    this._out(g, 0.35);
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // 鏡が、澄んだ音で鳴る
  // 鏡が鳴る。わずかにずれた音を重ねて、耳ざわりな「うなり」を作る
  mirrorRing() {
    [[213, 0.085], [219.7, 0.075], [436, 0.032]].forEach(([f, v], i) => {
      this.tone({
        type: "sine", f0: f, f1: f * 0.968,
        vol: v, dur: 3.2 + i * 0.7, atk: 0.35, wet: 1.6,
      });
    });
    this.burst({ freq: 2500, q: 7, vol: 0.05, dur: 0.6, atk: 0.25, wet: 1.4 });
  }

  // 押し入れ・引き出し
  drawer() {
    if (!this.ready || this.muted) return;
    const t = this.t;
    for (let i = 0; i < 7; i++) {
      setTimeout(() => this.burst({
        freq: rnd(240, 480), q: 2.2, vol: 0.10, dur: 0.05, wet: 0.5, rate: 0.8,
      }), i * 32);
    }
    setTimeout(() => this.burst({ freq: 180, q: 1.4, vol: 0.16, dur: 0.09, wet: 0.7 }), 240);
  }

  // ゴミ袋が沈む
  rustle() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.burst({
        freq: rnd(3200, 6800), q: 0.5, vol: rnd(0.05, 0.11), dur: rnd(0.04, 0.1), wet: 0.25,
      }), i * rnd(60, 150));
    }
  }

  // 水が一滴
  drip() {
    const f = rnd(330, 520);
    this.burst({ freq: f, q: 9, vol: 0.22, dur: 0.055, atk: 0.001, wet: 1.7 });
    this.tone({ type: "sine", f0: f * 1.5, f1: f * 0.42, vol: 0.09, dur: 0.06, atk: 0.001, wet: 1.5 });
    setTimeout(() => this.burst({ freq: f * 0.6, q: 5, vol: 0.08, dur: 0.13, wet: 1.9 }), 32);
  }

  // 外廊下を抜ける風
  gust() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = this.t;
    const src = this._src(false);
    src.playbackRate.value = 0.7;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.setValueAtTime(220, t);
    f.frequency.linearRampToValueAtTime(620, t + 1.4);
    f.frequency.linearRampToValueAtTime(180, t + 3.0);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + 3.0);
    src.connect(f); f.connect(g);
    this._out(g, 0.8);
    src.start(t, Math.random());
    src.stop(t + 3.1);
  }

  // 蛍光灯が切れる
  tubePop() {
    this.burst({ type: "highpass", freq: 1900, vol: 0.30, dur: 0.012, atk: 0.001, wet: 0.9 });
    this.burst({ freq: 620, q: 1.4, vol: 0.26, dur: 0.05, wet: 1.1 });
    this.tone({ type: "sawtooth", f0: 92, f1: 38, vol: 0.06, dur: 0.10, wet: 0.6 });
    setTimeout(() => this.burst({ freq: 2200, q: 0.8, vol: 0.07, dur: 0.20, wet: 0.7, rate: 0.6 }), 28);
  }

  // ブラウン管の鳴き（部屋にいるあいだ）
  crtOn() {
    if (!this.ready || this._crt) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 15734; // 走査の周波数
    const hum = ctx.createOscillator(); hum.type = "sine"; hum.frequency.value = 100;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const hg = ctx.createGain(); hg.gain.value = 0.35;
    osc.connect(g); hum.connect(hg); hg.connect(g);
    g.connect(this.master);
    osc.start(); hum.start();
    g.gain.setTargetAtTime(0.022, this.t, 0.4);
    this._crt = { osc, hum, g };
  }

  crtOff() {
    if (!this._crt) return;
    const c = this._crt; this._crt = null;
    c.g.gain.setTargetAtTime(0.0001, this.t, 0.1);
    setTimeout(() => { try { c.osc.stop(); c.hum.stop(); } catch (e) {} }, 600);
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
      g.gain.exponentialRampToValueAtTime(0.095, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 5200;
      osc.connect(f); f.connect(g);
      this._out(g, 1.2);
      osc.start(t); osc.stop(t + 1.25);
    });

    this.burst({ freq: 200, q: 0.4, vol: 0.22, dur: 0.5, wet: 1.4 });
    this.tone({ type: "sine", f0: 55, f1: 28, vol: 0.30, dur: 1.4, wet: 1.0 });
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
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.15);
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
    this.burst({ freq: 110, q: 0.7, vol: 0.30, dur: 0.22, wet: 1.6 });
    this.tone({ type: "triangle", f0: 74, f1: 32, vol: 0.26, dur: 0.4, wet: 1.2 });
    setTimeout(() => this.burst({ freq: 2400, q: 5, vol: 0.12, dur: 0.05, wet: 0.8 }), 45);
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
    this.crtOff();
  }
}
