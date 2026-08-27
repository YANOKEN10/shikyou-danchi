// ============================================================
//  入り口
//   1. ログイン画面（メールは任意。名前でもメールでもログインできます）
//   2. 記録を読み出す（クラウド／この端末）
//   3. ゲーム開始
// ============================================================
import { Sound } from "./audio.js";
import { Cloud } from "./cloud.js";
import { Game } from "./game.js";
import { TITLE, SUB, FLOORS, MEMO_ORDER } from "./story.js";

const $ = (id) => document.getElementById(id);

const snd = new Sound();
const cloud = new Cloud();
let game = null;
let mode = "login";      // login | signup | guest
let fromPause = false;

/* ---------------- ログイン画面 ---------------- */

const gate = $("gate");
const msg = $("msg");
const form = $("form");
const goBtn = $("go");
const whoIn = $("who");
const nameIn = $("name");
const pwIn = $("pw");
const mailIn = $("mail");

function setMsg(text, kind) {
  msg.textContent = text || "";
  msg.className = "msg" + (kind ? " " + kind : "");
}

function showFields() {
  const show = {
    login: ["who", "pw"],
    signup: ["name", "pw", "mail"],
    guest: [],
  }[mode];
  document.querySelectorAll("#fields [data-f]").forEach((el) => {
    el.style.display = show.indexOf(el.dataset.f) >= 0 ? "" : "none";
  });
  $("guestNote").style.display = mode === "guest" ? "" : "none";
  goBtn.textContent = { login: "ログイン", signup: "はじめる", guest: "この端末で はじめる" }[mode];
  pwIn.autocomplete = mode === "signup" ? "new-password" : "current-password";
  setMsg("");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("on"));
    tab.classList.add("on");
    mode = tab.dataset.mode;
    showFields();
    snd.unlock(); snd.ui();
  };
});

whoIn.value = cloud.lastName;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  snd.unlock();
  goBtn.disabled = true;
  setMsg("");

  try {
    if (mode === "guest") {
      cloud.mode = "guest";
      cloud.guestOnly = true;      // この回はクラウドを使わない
      await afterAuth();
      return;
    }

    if (mode === "login") {
      const who = whoIn.value.trim();
      if (!who || !pwIn.value) { setMsg("名前（またはメール）と合言葉を入れてください。", "err"); return; }
      setMsg("確かめています…");
      const r = await cloud.login(who, pwIn.value);
      if (!r.ok) { setMsg(r.why, "err"); return; }
    } else {
      const n = nameIn.value.trim();
      if (!n) { setMsg("名前を入れてください。", "err"); return; }
      if (pwIn.value.length < 4) { setMsg("合言葉は4文字以上にしてください。", "err"); return; }
      setMsg("登録しています…");
      const r = await cloud.signup(n, pwIn.value, mailIn.value.trim());
      if (!r.ok) { setMsg(r.why, "err"); return; }
    }
    pwIn.value = "";
    cloud.guestOnly = false;
    await afterAuth();
  } finally {
    goBtn.disabled = false;
  }
});

$("skip").onclick = () => {
  snd.unlock(); snd.ui();
  cloud.mode = "guest";
  cloud.guestOnly = true;        // この回はクラウドを使わない
  afterAuth();
};

/* ---------------- 記録の読み出し ---------------- */

function summarize(p) {
  if (!p || !p.floor) return "はじめから";
  const f = FLOORS[Math.max(0, Math.min(4, (p.floor | 0) - 1))];
  const m = Array.isArray(p.memos) ? p.memos.length : 0;
  const sec = Math.floor(Number(p.seconds) || 0);
  return (f ? f.title : "一階") + "　／　見つけたもの " + m + "/" + MEMO_ORDER.length +
    "　／　" + Math.floor(sec / 60) + "分";
}

async function afterAuth() {
  setMsg("記録を読んでいます…");

  // 別の人がこの端末で遊んだ記録は、引き継がない
  const local = cloud.canAdoptLocal() ? cloud.readLocal() : null;
  let remote = null;

  try {
    if (cloud.signedIn) {
      const r = await cloud.load();
      remote = r.payload;

      // 端末に進み具合があって、クラウドが空なら預ける
      if (local && !remote) {
        await cloud.save(local, true);
        remote = local;
        setMsg("この端末の記録を、クラウドに預けました。", "ok");
      } else if (local && remote && (local.seconds | 0) > (remote.seconds | 0) + 30) {
        // どちらを使うか選んでもらう
        chooseSave(local, remote);
        return;
      }
    }
  } catch (e) {
    // 読み出しに失敗しても、ここで止めない。端末の記録で始める
    remote = null;
  }

  const payload = cloud.signedIn ? (remote || local) : local;
  begin(payload);
}

function chooseSave(local, remote) {
  const pick = $("pick");
  // ログイン画面を必ず引っこめる（重なって見えなくなるため）
  gate.classList.remove("show");
  setMsg("");
  pick.classList.add("show");
  $("pickLocal").textContent = summarize(local);
  $("pickCloud").textContent = summarize(remote);
  $("pickLocalBtn").onclick = async () => {
    snd.ui();
    pick.classList.remove("show");
    await cloud.save(local, true);
    begin(local);
  };
  $("pickCloudBtn").onclick = () => {
    snd.ui();
    pick.classList.remove("show");
    begin(remote);
  };
}

/* ---------------- 開始 ---------------- */

function ensureGame() {
  if (game) return game;
  game = new Game($("screen"), snd, cloud);
  game.onWantLogin = () => {
    fromPause = true;
    game.paused = true;
    mode = "login";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.mode === "login"));
    showFields();
    gate.classList.add("show");
    game.ui.closePause();
  };
  game.onFinish = () => {
    location.reload();
  };
  bindTouch(game);
  // 手元で動かしているときだけ、確認用に取り出せるようにしておく
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") window.__g = game;
  return game;
}

function bindTouch(g) {
  if (!g.touch) return;
  g.player.bindTouch($("stick"), $("knob"), $("look"));
  [["bAct", "act"], ["bRun", "run"], ["bCrouch", "crouch"], ["bLight", "light"], ["bBook", "book"], ["bPause", "pause"]]
    .forEach(([id, kind]) => {
      const el = $(id);
      if (el) g.player.bindButton(el, kind);
    });
}

async function begin(payload) {
  gate.classList.remove("show");
  $("pick").classList.remove("show");
  setMsg("");

  let g;
  try {
    g = ensureGame();
  } catch (e) {
    // 3D が始められない端末。理由を出して、開いたままにしない
    gate.classList.add("show");
    setMsg("この端末では画面を描き始められませんでした。ブラウザを新しくするか、別の端末でお試しください。（" + (e && e.message ? e.message : "原因不明") + "）", "err");
    return;
  }
  updateWho();

  if (fromPause) {
    // ポーズ中にログインしただけ。いまの進み具合をそのまま預ける
    fromPause = false;
    await cloud.save(g.payload(), true);
    g.ui.toast("ログインしました。どの端末でも続けられます。");
    g.resume();
    return;
  }

  await g.start(payload);
}

function updateWho() {
  const w = $("whoami");
  if (!w) return;
  w.textContent = cloud.signedIn ? "☁ " + cloud.display : "📱 この端末だけ";
  w.title = cloud.signedIn ? "ログイン中" : "ログインしていません";
}

/* ---------------- 起動 ---------------- */

(async function boot() {
  showFields();
  gate.classList.add("show");
  $("gTitle").textContent = TITLE;
  $("gSub").textContent = SUB;

  // 券が生きていれば、そのまま入る
  const ok = await cloud.restore();
  if (ok) {
    updateWho();
    setMsg(cloud.display + " さん、おかえりなさい。", "ok");
    const cont = $("cont");
    cont.style.display = "block";
    $("contName").textContent = cloud.display;
    cont.onclick = async () => { snd.unlock(); snd.ui(); cloud.guestOnly = false; await afterAuth(); };
    // ログイン欄は「別のアカウントで入る」用に残しておく
  }

  // 画面の向き・拡大の抑制
  document.addEventListener("gesturestart", (e) => e.preventDefault());
})();

// 途中で閉じられても、なるべく残す
addEventListener("pagehide", () => {
  if (game && game.running) {
    try { cloud.writeLocal(game.payload()); } catch (e) { /* できなくても仕方ない */ }
  }
});
addEventListener("visibilitychange", () => {
  if (document.hidden && game && game.running) {
    try { cloud.writeLocal(game.payload()); } catch (e) {}
    if (!game.paused && !game.ui.open) game.doPause();
  }
});
