// ============================================================
//  画面まわり
//   ・字幕、調べる案内、メモの全画面表示、持ち物、ポーズ、終幕
//   ・3D の上に重ねた普通の HTML です
// ============================================================
import { MEMOS, MEMO_ORDER, ITEMS, HELP_PC, HELP_TOUCH } from "./story.js";

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(snd) {
    this.snd = snd;
    this.el = {
      sub: $("sub"), prompt: $("prompt"), vig: $("vig"), flash: $("flash"),
      hud: $("hud"), bat: $("bat"), batFill: $("batFill"), stam: $("stamFill"),
      reader: $("reader"), readerTitle: $("readerTitle"), readerWhere: $("readerWhere"),
      readerBody: $("readerBody"), readerClose: $("readerClose"),
      book: $("book"), bookBody: $("bookBody"), bookClose: $("bookClose"),
      pause: $("pause"), pauseBody: $("pauseBody"),
      ending: $("ending"), endingBody: $("endingBody"),
      toast: $("toast"), fade: $("fade"), floorTag: $("floorTag"), versus: $("versus"),
      objective: $("objective"),
      grain: $("grain"),
    };
    this.subQueue = [];
    this.subTimer = 0;
    this.open = null;   // "reader" | "book" | "pause" | "ending"

    if (this.el.readerClose) this.el.readerClose.onclick = () => this.closeReader();
    if (this.el.bookClose) this.el.bookClose.onclick = () => this.closeBook();
  }

  /* ---------- 字幕 ---------- */

  say(text, sec) {
    if (!text) return;
    this.subQueue.push({ text, sec: sec || Math.max(2.2, text.length * 0.11) });
    if (!this.subTimer && !this._gap) this._nextSub();
  }

  sayNow(text, sec) {
    this.subQueue.length = 0;
    this.subTimer = 0;
    clearTimeout(this._gap);
    this._gap = 0;
    this.say(text, sec);
  }

  _nextSub() {
    const n = this.subQueue.shift();
    if (!n) { this.el.sub.classList.remove("show"); this.subTimer = 0; return; }
    this.el.sub.textContent = n.text;
    this.el.sub.classList.add("show");
    this.subTimer = n.sec;
  }

  tickSub(dt) {
    if (!this.subTimer) return;
    this.subTimer -= dt;
    if (this.subTimer > 0) return;
    // いったん消して、少し間を置いてから次の一行を出す
    this.subTimer = 0;
    this.el.sub.classList.remove("show");
    if (this._gap) return;
    this._gap = setTimeout(() => { this._gap = 0; this._nextSub(); }, 200);
  }

  /* ---------- 調べる案内 ---------- */

  setPrompt(label) {
    const p = this.el.prompt;
    if (!label) { p.classList.remove("show"); return; }
    p.textContent = label;
    p.classList.add("show");
  }

  /* ---------- 体調まわり ---------- */

  setBattery(v, has) {
    this.el.bat.style.display = has ? "" : "none";
    this.el.batFill.style.width = Math.max(0, Math.min(1, v)) * 100 + "%";
    this.el.batFill.classList.toggle("low", v < 0.25);
    // 「灯」ボタン。まだ持っていない／電池切れは、見て分かるようにする
    const b = document.getElementById("bLight");
    if (b) b.classList.toggle("off", !has || v <= 0.001);
  }

  setStamina(v) {
    this.el.stam.style.width = Math.max(0, Math.min(1, v)) * 100 + "%";
    this.el.stam.parentElement.style.opacity = v > 0.98 ? 0 : 1;
  }

  // いま、すること
  setObjective(text) {
    const el = this.el.objective;
    if (!el) return;
    if (el.textContent !== (text || "")) el.textContent = text || "";
    el.classList.toggle("show", Boolean(text));
  }

  // 鬼ごっこの表示（残り時間・鍵・人数）
  setVersus(text, isOni) {
    const el = this.el.versus;
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("show", Boolean(text));
    el.classList.toggle("oni", Boolean(isOni));
  }

  setTension(v) {
    // 画面のふち。近いほど暗く、赤みが差す
    this.el.vig.style.opacity = (0.35 + v * 0.5).toFixed(3);
    this.el.vig.style.setProperty("--t", v.toFixed(3));
    this.el.grain.style.opacity = (0.05 + v * 0.14).toFixed(3);
  }

  hit() {
    this.el.flash.classList.remove("go");
    void this.el.flash.offsetWidth;
    this.el.flash.classList.add("go");
  }

  floorTag(text) {
    const t = this.el.floorTag;
    t.textContent = text;
    t.classList.remove("go");
    void t.offsetWidth;
    t.classList.add("go");
  }

  toast(text) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------- 暗転 ---------- */

  fade(to, sec) {
    return new Promise((res) => {
      const f = this.el.fade;
      f.style.transition = "opacity " + (sec || 0.8) + "s ease";
      f.style.opacity = to;
      setTimeout(res, (sec || 0.8) * 1000);
    });
  }

  /* ---------- メモを読む ---------- */

  showMemo(id) {
    const m = MEMOS[id];
    if (!m) return;
    this.el.readerTitle.textContent = m.title;
    this.el.readerWhere.textContent = m.where;
    this.el.readerBody.innerHTML = "";
    m.body.forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (!line) p.className = "gap";
      this.el.readerBody.appendChild(p);
    });
    this.el.reader.classList.add("show");
    this.open = "reader";
    this.snd.paper();
  }

  closeReader() {
    this.el.reader.classList.remove("show");
    if (this.open === "reader") this.open = null;
    if (this.onClose) this.onClose();
  }

  /* ---------- 持ち物とメモ ---------- */

  showBook(state, touch) {
    const b = this.el.bookBody;
    b.innerHTML = "";

    const sec = (t) => {
      const h = document.createElement("h3");
      h.textContent = t;
      b.appendChild(h);
    };

    sec("持ち物");
    const inv = document.createElement("div");
    inv.className = "invlist";
    const items = Object.keys(state.items || {}).filter((k) => state.items[k]);
    if (!items.length) {
      inv.innerHTML = '<p class="dim">なにも持っていない。</p>';
    } else {
      items.forEach((k) => {
        const d = document.createElement("div");
        d.className = "invrow";
        let extra = "";
        if (k === "battery") extra = "　×" + state.spare;
        d.textContent = "・" + ((ITEMS[k] && ITEMS[k].name) || k) + extra;
        inv.appendChild(d);
      });
    }
    b.appendChild(inv);

    sec("見つけたもの　" + (state.memos || []).length + " / " + MEMO_ORDER.length);
    const list = document.createElement("div");
    list.className = "memolist";
    MEMO_ORDER.forEach((id) => {
      const got = (state.memos || []).indexOf(id) >= 0;
      const row = document.createElement("button");
      row.className = "memorow" + (got ? "" : " locked");
      row.textContent = got ? MEMOS[id].title : "？？？";
      if (got) row.onclick = () => { this.snd.ui(); this.showMemo(id); };
      list.appendChild(row);
    });
    b.appendChild(list);

    sec("操作");
    const help = document.createElement("div");
    help.className = "helplist";
    (touch ? HELP_TOUCH : HELP_PC).forEach(([k, v]) => {
      const r = document.createElement("div");
      r.className = "helprow";
      r.innerHTML = "<kbd></kbd><span></span>";
      r.querySelector("kbd").textContent = k;
      r.querySelector("span").textContent = v;
      help.appendChild(r);
    });
    b.appendChild(help);

    this.el.book.classList.add("show");
    this.open = "book";
    this.snd.paper();
  }

  closeBook() {
    this.el.book.classList.remove("show");
    if (this.open === "book") this.open = null;
    if (this.onClose) this.onClose();
  }

  /* ---------- ポーズ ---------- */

  showPause(build) {
    this.el.pauseBody.innerHTML = "";
    build(this.el.pauseBody);
    this.el.pause.classList.add("show");
    this.open = "pause";
  }

  closePause() {
    this.el.pause.classList.remove("show");
    if (this.open === "pause") this.open = null;
    if (this.onClose) this.onClose();
  }

  /* ---------- 終幕 ---------- */

  // 黒い文章画面へ直行せず、玄関を抜けて夜明けへ出る距離をCanvasのカメラ移動で見せる。
  _playExitScene(ending) {
    return new Promise((resolve) => {
      const root = document.createElement("div"); root.className = "endcinematic";
      const canvas = document.createElement("canvas");
      const exterior = new Image();
      exterior.decoding = "async";
      exterior.src = "./assets/generated/ending-exterior-dawn-v1.png?v=20260905";
      const caption = document.createElement("div"); caption.className = "endcaption";
      const skip = document.createElement("button"); skip.className = "endskip"; skip.textContent = "先へ";
      root.append(canvas, caption, skip); this.el.ending.appendChild(root);
      this.el.ending.classList.add("show", "cinematic"); this.open = "ending";
      this.snd.endingDawn(Boolean(ending.best));

      const ctx = canvas.getContext("2d");
      let w = 0, h = 0, raf = 0, done = false, shownCaption = "";
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduce ? 1800 : ending.best ? 10800 : 8800;
      const started = performance.now();
      const resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 1.6);
        w = innerWidth; h = innerHeight;
        canvas.width = Math.max(1, Math.floor(w * dpr)); canvas.height = Math.max(1, Math.floor(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      const ease = (v) => v * v * (3 - 2 * v);
      const setCaption = (s) => {
        if (shownCaption === s) return;
        shownCaption = s; caption.classList.remove("show");
        setTimeout(() => { if (!done) { caption.textContent = s; caption.classList.toggle("show", Boolean(s)); } }, 120);
      };
      const finish = () => {
        if (done) return; done = true; cancelAnimationFrame(raf);
        removeEventListener("resize", resize); root.remove();
        this.el.ending.classList.remove("cinematic"); resolve();
      };
      skip.onclick = finish; setTimeout(() => { if (!done) skip.classList.add("show"); }, 1300);
      addEventListener("resize", resize); resize();

      const drawSkyAndStreet = (time, dawn) => {
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, `rgb(${4 + dawn * 38},${7 + dawn * 38},${16 + dawn * 48})`);
        sky.addColorStop(0.68, `rgb(${12 + dawn * 78},${18 + dawn * 48},${28 + dawn * 36})`);
        sky.addColorStop(1, `rgb(${22 + dawn * 90},${22 + dawn * 55},${25 + dawn * 42})`);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        const horizon = h * 0.57;
        ctx.fillStyle = `rgba(5,8,12,${0.9 - dawn * 0.2})`;
        for (let i = 0; i < 12; i++) {
          const bw = w / 11 + (i % 3) * 13, bh = h * (0.08 + (i % 5) * 0.025);
          ctx.fillRect(i * w / 11 - 10, horizon - bh, bw, bh);
        }
        ctx.fillStyle = `rgb(${17 + dawn * 24},${19 + dawn * 23},${22 + dawn * 21})`;
        ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
        // 濡れた路面の消失点を動かし、静止画ではなく前へ歩いている感覚を出す。
        const drift = (time * 46) % 70;
        ctx.strokeStyle = `rgba(132,145,150,${0.10 + dawn * 0.08})`; ctx.lineWidth = 1;
        for (let y = horizon + drift; y < h; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.strokeStyle = `rgba(178,159,128,${0.08 + dawn * 0.1})`;
        ctx.beginPath(); ctx.moveTo(w * 0.5, horizon); ctx.lineTo(w * 0.35, h); ctx.moveTo(w * 0.5, horizon); ctx.lineTo(w * 0.65, h); ctx.stroke();
        // 雨粒は座標を時刻から計算し、画像素材なしでも奥行きの違う速度で流す。
        for (let i = 0; i < 85; i++) {
          const depth = 0.25 + (i % 9) / 9, x = (i * 83.7 + time * (34 + depth * 70)) % (w + 80) - 40;
          const y = (i * 47.3 + time * (120 + depth * 210)) % (h + 80) - 40;
          ctx.strokeStyle = `rgba(185,204,211,${0.035 + depth * 0.09})`;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4 * depth, y + 12 * depth); ctx.stroke();
        }
      };

      // 生成した実景を画面いっぱいに切り抜き、わずかな前進と横振りで静止画にもカメラ移動を与える。
      // 読み込みが間に合わない瞬間だけ従来のCanvas景色を使い、黒画面で演出を止めない。
      const drawExterior = (time, p, dawn) => {
        if (!exterior.complete || !exterior.naturalWidth) {
          drawSkyAndStreet(time, dawn);
          return;
        }
        const iw = exterior.naturalWidth, ih = exterior.naturalHeight;
        const cover = Math.max(w / iw, h / ih);
        const zoom = cover * (1.105 - ease(p) * 0.055);
        const sw = w / zoom, sh = h / zoom;
        const travel = ease(Math.max(0, (p - 0.18) / 0.82));
        const sx = Math.max(0, Math.min(iw - sw, (iw - sw) * (0.42 + travel * 0.13)));
        const sy = Math.max(0, Math.min(ih - sh, (ih - sh) * (0.48 - travel * 0.08)));
        ctx.drawImage(exterior, sx, sy, sw, sh, 0, 0, w, h);
        const shade = ctx.createLinearGradient(0, 0, 0, h);
        shade.addColorStop(0, `rgba(2,7,13,${0.28 - dawn * 0.12})`);
        shade.addColorStop(0.7, `rgba(2,4,7,${0.12 - dawn * 0.05})`);
        shade.addColorStop(1, "rgba(0,0,0,.34)");
        ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
      };

      const drawBuilding = (p, alpha) => {
        const scale = 1.18 - ease(p) * 0.35;
        const bw = Math.min(w * 0.78, 760) * scale, bh = h * 0.64 * scale;
        const bx = w / 2 - bw / 2, by = h * 0.54 - bh / 2;
        ctx.save(); ctx.globalAlpha = alpha;
        const wall = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        wall.addColorStop(0, "#202629"); wall.addColorStop(0.5, "#3c3f3d"); wall.addColorStop(1, "#171d20");
        ctx.fillStyle = wall; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "rgba(0,0,0,.18)";
        for (let i = 0; i < 16; i++) ctx.fillRect(bx + ((i * 71) % bw), by, 2 + (i % 3), bh);
        const floors = 5, cols = 6, pad = bw * 0.055, gapX = bw * 0.022;
        const ww = (bw - pad * 2 - gapX * (cols - 1)) / cols, fh = bh / floors;
        for (let row = 0; row < floors; row++) {
          ctx.fillStyle = "rgba(6,9,11,.48)"; ctx.fillRect(bx, by + row * fh + fh * 0.69, bw, fh * 0.07);
          ctx.strokeStyle = "rgba(125,132,128,.28)"; ctx.beginPath(); ctx.moveTo(bx, by + row * fh + fh * 0.74); ctx.lineTo(bx + bw, by + row * fh + fh * 0.74); ctx.stroke();
          for (let col = 0; col < cols; col++) {
            const x = bx + pad + col * (ww + gapX), y = by + row * fh + fh * 0.14;
            const mother = row === 0 && col === 4;
            const blink = mother && p > 0.56 && p < 0.72 ? (Math.sin(p * 92) > -0.15 ? 1 : 0.12) : mother ? Math.max(0, 1 - p * 0.9) : 0;
            ctx.fillStyle = mother ? `rgba(222,177,101,${0.18 + blink * 0.58})` : "rgba(2,5,8,.92)";
            ctx.fillRect(x, y, ww, fh * 0.46);
            ctx.strokeStyle = "rgba(126,130,122,.32)"; ctx.strokeRect(x, y, ww, fh * 0.46);
            ctx.beginPath(); ctx.moveTo(x + ww / 2, y); ctx.lineTo(x + ww / 2, y + fh * 0.46); ctx.stroke();
          }
        }
        ctx.fillStyle = "rgba(0,0,0,.88)"; ctx.fillRect(w / 2 - bw * 0.055, by + bh * 0.82, bw * 0.11, bh * 0.18);
        if (ending.best && p > 0.45 && p < 0.82) {
          const a = Math.sin(Math.min(1, (p - 0.45) / 0.12) * Math.PI / 2) * Math.min(1, (0.82 - p) / 0.14);
          ctx.globalAlpha = alpha * Math.max(0, a) * 0.72; ctx.fillStyle = "#020203";
          ctx.beginPath(); ctx.ellipse(w / 2, by + bh * 0.83, bw * 0.026, bh * 0.095, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(w / 2, by + bh * 0.715, bw * 0.018, bh * 0.033, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      };

      const frame = (now) => {
        const elapsed = now - started, p = Math.min(1, elapsed / duration), time = elapsed / 1000;
        const dawn = ease(Math.max(0, (p - 0.16) / 0.84));
        ctx.clearRect(0, 0, w, h); drawExterior(time, p, dawn);
        if (p < 0.43) {
          const open = ease(Math.min(1, p / 0.24));
          const side = w * (0.48 - open * 0.43);
          ctx.fillStyle = "#030405"; ctx.fillRect(0, 0, side, h); ctx.fillRect(w - side, 0, side, h);
          ctx.fillStyle = "rgba(28,31,31,.9)"; ctx.fillRect(side, 0, 7, h); ctx.fillRect(w - side - 7, 0, 7, h);
          const lintel = h * (0.22 - open * 0.17); ctx.fillStyle = "#030405"; ctx.fillRect(0, 0, w, lintel);
        } else {
          const turn = ease(Math.min(1, (p - 0.43) / 0.2));
          ctx.fillStyle = `rgba(1,2,4,${Math.sin(turn * Math.PI) * 0.82})`; ctx.fillRect(0, 0, w, h);
          // 真エンドだけ建物の玄関に母の影を一瞬残し、背景写真へ描き足す怪異を控えめにする。
          if (ending.best && p > 0.56 && p < 0.81) {
            const a = Math.min(1, (p - 0.56) / 0.08) * Math.min(1, (0.81 - p) / 0.1);
            ctx.save(); ctx.globalAlpha = Math.max(0, a) * 0.58; ctx.fillStyle = "#010203";
            ctx.beginPath(); ctx.ellipse(w * 0.79, h * 0.78, h * 0.025, h * 0.12, 0.04, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(w * 0.79, h * 0.645, h * 0.021, h * 0.036, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
        if (p < 0.38) setCaption("夜明け前　四号棟を出る");
        else if (p < 0.74) setCaption(ending.best ? "足音は、敷居の内側で止まった。" : "背後で、足音が止まった。");
        else setCaption(ending.best ? "元気でね。" : "私は、外へ歩き出した。");
        if (p >= 1) finish(); else raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }
  async showEnding(ending, stats, onAgain) {
    if (!ending.bad) await this._playExitScene(ending);
    const b = this.el.endingBody;
    b.innerHTML = "";

    const h = document.createElement("h2");
    h.textContent = ending.name;
    b.appendChild(h);

    const wrap = document.createElement("div");
    wrap.className = "endlines";
    b.appendChild(wrap);

    this.el.ending.classList.add("show");
    this.open = "ending";

    // 一行ずつ、ゆっくり出す
    for (const line of ending.lines) {
      const p = document.createElement("p");
      p.textContent = line;
      if (!line) p.className = "gap";
      wrap.appendChild(p);
      p.classList.add("in");
      await new Promise((r) => setTimeout(r, line ? Math.max(600, line.length * 55) : 320));
    }

    const st = document.createElement("div");
    st.className = "endstats";
    st.innerHTML =
      "<div>見つけたもの　" + stats.memos + " / " + MEMO_ORDER.length + "</div>" +
      "<div>かかった時間　" + stats.time + "</div>";
    b.appendChild(st);

    const again = document.createElement("button");
    again.className = "big";
    again.textContent = "もう一度";
    again.onclick = () => { this.snd.ui(); onAgain(); };
    b.appendChild(again);
  }

  closeEnding() {
    this.el.ending.classList.remove("show");
    this.open = null;
  }

  closeAll() {
    this.closeReader();
    this.closeBook();
    this.closePause();
    this.closeEnding();
  }
}
