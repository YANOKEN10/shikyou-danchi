// ============================================================
// 「それ」の恐怖演出
//  ・追跡を強くするのではなく、位置と規則を信用できなくする
//  ・大きな演出は重ねず、長い静けさを挟んで慣れを防ぐ
// ============================================================
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class DreadDirector {
  constructor(game) {
    this.g = game;
    this.live = null;
    this.last = "";
    this.seen = new Set();
    this.blinkCd = 0;
    this.reset();
  }

  reset() {
    this.live = null;
    this.last = "";
    this.seen.clear();
    this.blinkCd = 10;
    // 階へ着いた直後は安全だと思わせてから、最初の大きな異変を起こす。
    this.timer = rnd(38, 62);
  }

  update(dt, chaseOut) {
    const g = this.g;
    if (!g.floor || (g.versus && g.versus.on)) return;
    this._blinkStep(dt);

    if (chaseOut && chaseOut.nearMiss) this.nearMiss();
    if (this.live) {
      this.live.t += dt;
      this.live.step(this.live, dt);
      if (this.live.t >= this.live.life) {
        if (this.live.end) this.live.end(this.live);
        this.live = null;
        this.timer = rnd(105, 185);
      }
      return;
    }

    this.timer -= dt;
    if (this.timer > 0 || g.state.floor < 2) return;
    const all = ["mirror", "ambush", "peek", "crawl", "double", "mimic", "light", "audio"];
    const able = all.filter((kind) => kind !== this.last && this._can(kind));
    if (!able.length) { this.timer = 12; return; }
    this.trigger(pick(able));
  }

  // 自動試験から名指しで起こせるようにし、各演出を運任せにせず検証できるようにする。
  trigger(kind) {
    const fn = this["_" + kind];
    if (typeof fn !== "function" || !this._can(kind)) return false;
    if (this.live && this.live.end) this.live.end(this.live);
    this.live = null;
    this.last = kind;
    this.seen.add(kind);
    fn.call(this);
    return true;
  }

  _setLive(rec) { rec.t = 0; this.live = rec; }

  _firstStalker() {
    // 消えた直後の個体へ別演出を重ねると、消失の意味が伝わらないため対象から外す。
    return this.g.stalkers.list.find((s) => s.state !== "gone") || null;
  }

  _closedDoors() {
    const p = this.g.player.pos;
    return this.g.floor.doors.filter((d) => d.canEnter && !d.open && !d.busy && Math.abs(d.dx - p.x) > 2.5);
  }

  _can(kind) {
    const g = this.g, s = this._firstStalker();
    if (kind === "mirror") return g.player.inUnit && g.floor.fx.some((f) => f.kind === "mirror");
    if (kind === "ambush") return g.player.inUnit && g.curRoom && g.curRoom.unitBounds;
    if (kind === "peek") return !g.player.inUnit && this._closedDoors().length > 0;
    if (kind === "crawl" || kind === "mimic" || kind === "light") return !g.player.inUnit && Boolean(s);
    if (kind === "double") return !g.player.inUnit && Boolean(s) && g.floor.len > 12;
    if (kind === "audio") return Boolean(s);
    return false;
  }

  // 見ていない瞬間だけ少し近づく。連発すると規則が露骨になるため長い間隔を置く。
  _blinkStep(dt) {
    this.blinkCd -= dt;
    const g = this.g, s = this._firstStalker();
    if (!s || this.blinkCd > 0 || g.player.inUnit || s.state === "hunt" || !s.mesh.visible) return;
    if (s.inView(g.player) > -0.05) return;
    const d = g.player.pos.x - s.x;
    if (Math.abs(d) < 3.5) return;
    s.x += Math.sign(d) * Math.min(rnd(0.55, 1.25), Math.abs(d) - 2.8);
    s.place(s.x);
    this.blinkCd = rnd(14, 26);
  }

  // 鏡の中だけで三段階に距離を詰め、振り返っても実体は置かない。
  _mirror() {
    const g = this.g;
    const f = pick(g.floor.fx.filter((x) => x.kind === "mirror"));
    let rang = false, lunged = false;
    this._setLive({ life: 8.5, step: (e) => {
      const stage = Math.min(2, Math.floor(e.t / 2.4));
      const pulse = 0.28 + stage * 0.24;
      // 飛び出した後まで鏡面の平面像を残すと二体と板絵に見えるため、突進と同時に完全に消す。
      f.mesh.material.opacity = lunged ? 0 : Math.max(f.mesh.material.opacity, pulse * Math.sin(Math.PI * ((e.t % 2.4) / 2.4)));
      f.mesh.scale.setScalar(1 + stage * 0.14);
      if (!rang && e.t > 0.6) { rang = true; g.snd.mirrorRing(); }
      if (!lunged && e.t > 5.05) {
        lunged = true;
        f.mesh.material.opacity = 0;
        // 鏡の座標から立体の幽霊を出し、高速で顔面距離まで詰めて「画像の拡大」ではない動きにする。
        if (g._showApparition(f.x, f.z, 2.4,
          { mode: "approach", speed: 8.5, stopDistance: 0.18, scale: 1.55, pose: "lean" })) {
          g.snd.stinger(); g.ui.hit();
        }
      }
    }, end: () => { f.mesh.material.opacity = 0; f.mesh.scale.setScalar(1); } });
  }

  // 逃げ込んだ部屋の奥へ短時間だけ立たせ、出口を塞がない位置を選ぶ。
  _ambush() {
    const g = this.g, b = g.curRoom.unitBounds;
    const x = g.curRoom.dx + (Math.random() < 0.5 ? -1.65 : 1.65);
    g.appar.show(x, b.z1 + 0.75, 6.5);
    g.snd.spatialBreath(Math.sign(x - g.player.pos.x));
    g.snd.sample("wet-cloth-drag", { vol: 0.24, pan: Math.sign(x - g.player.pos.x), wet: 0.35 });
    this._setLive({ life: 6.5, step: () => {}, end: () => g.appar.hide() });
  }

  // 少しだけ開いた玄関扉の奥に立たせ、近づく直前に閉める。
  _peek() {
    const g = this.g, d = pick(this._closedDoors());
    d.busy = true;
    // 見える前にノブだけ鳴らし、プレイヤー自身が開けた扉との聞き分けを崩す。
    g.snd.sample("door-handle", { vol: 0.3, pan: Math.sign(d.dx - g.player.pos.x) });
    if (d.build) d.build();
    g.appar.show(d.dx, -0.62, 7);
    this._setLive({ life: 7, step: (e) => {
      const near = Math.abs(g.player.pos.x - d.dx) < 2.1;
      d.pivot.rotation.y = near ? 0 : -0.24 * Math.min(1, e.t / 2);
      if (near) { g.appar.hide(); e.life = Math.min(e.life, e.t + 0.35); }
    }, end: () => { d.pivot.rotation.y = 0; d.busy = false; g.appar.hide(); } });
  }

  // 低い姿勢だけに固定せず、遭遇ごとに異なる輪郭と重心で移動させる。
  _crawl() {
    const s = this._firstStalker();
    s.dreadPose = pick(["crouch", "crawl", "lean", "kneel"]); s.dreadT = 9;
    this.g.snd.spatialBreath(Math.random() < 0.5 ? -1 : 1);
    this.g.snd.sample("wet-cloth-drag", { vol: 0.34, pan: rnd(-0.5, 0.5), wet: 0.4 });
    setTimeout(() => this.g.snd.sample("joint-cracks", { vol: 0.32, pan: rnd(-0.7, 0.7) }), 850);
    this._setLive({ life: 9, step: () => {}, end: () => { s.dreadPose = ""; s.mesh.scale.set(1, 1, 1); } });
  }

  // 本物と反対側に残像を置き、どちらへ逃げるべきかだけ迷わせる。
  _double() {
    const g = this.g, s = this._firstStalker();
    const far = s.x < g.floor.len / 2 ? g.floor.len - 1.1 : 1.1;
    g.appar.show(far, null, 7.5);
    g.snd.sample("distant-laugh", { vol: 0.26, pan: Math.sign(far - g.player.pos.x), wet: 0.55 });
    this._setLive({ life: 7.5, step: () => {}, end: () => g.appar.hide() });
  }

  // 主人公が止まると止まり、規則を覚えたころに一度だけ破る。
  _mimic() {
    const s = this._firstStalker();
    s.mimicT = 8;
    this.g.snd.sample("barefoot-follow", { vol: 0.3, pan: rnd(-0.6, 0.6), wet: 0.42 });
    this._setLive({ life: 8, step: () => {}, end: () => { s.mimicT = 0; s.awareness = Math.max(s.awareness, 0.82); s.rage = 2.5; } });
  }

  // 光で止まる場合と、消した直後に詰める場合を交互にせずランダムにする。
  _light() {
    const g = this.g, s = this._firstStalker();
    s.lightTrick = Math.random() < 0.5 ? "freeze" : "betray";
    s.lightSeen = g.player.lightOn;
    g.snd.sample("joint-cracks", { vol: 0.25, pan: Math.sign(s.x - g.player.pos.x) });
    this._setLive({ life: 10, step: () => {}, end: () => { s.lightTrick = ""; s.lightSeen = false; } });
  }

  // 姿とは反対の耳から呼吸を鳴らし、視覚と聴覚の位置を一致させない。
  _audio() {
    const g = this.g, s = this._firstStalker();
    const side = Math.sign(s.x - g.player.pos.x) || 1;
    let next = 0;
    this._setLive({ life: 7, step: (e, dt) => {
      next -= dt;
      if (next <= 0) { next = rnd(1.4, 2.2); g.snd.spatialBreath(-side); }
    } });
  }

  // 捕獲直前の消失後は鏡を一度だけ光らせ、単なる処理落ちに見せない。
  nearMiss() {
    const g = this.g;
    g.snd.stinger(); g.ui.hit();
    setTimeout(() => g.snd.sample("distant-laugh", { vol: 0.25, pan: rnd(-0.9, 0.9), wet: 0.65 }), 900);
    const f = g.floor.fx.find((x) => x.kind === "mirror");
    if (f) { f.ph = 0.0001; f.t = 20; }
    g.ui.sayNow("——顔が触れる寸前、それは消えた。");
  }
}
