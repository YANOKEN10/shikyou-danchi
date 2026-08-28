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

  async showEnding(ending, stats, onAgain) {
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
