// ============================================================
//  入り口
//   1. ログイン画面（メールは任意。名前でもメールでもログインできます）
//   2. 記録を読み出す（クラウド／この端末）
//   3. ゲーム開始
// ============================================================
import { Sound } from "./audio.js";
import { Cloud } from "./cloud.js";
import { Game } from "./game.js";
import { Net } from "./net.js";
import { Versus } from "./versus.js";
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

$("toVersus").onclick = () => openLobby();

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
  game.onWantVersus = openLobby;
  game.onQuitVersus = quitVersus;
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

/* ---------------- 鬼ごっこ ---------------- */

const net = new Net();
let versus = null;
let lobbyFloor = 1;

function lobbyMsg(text, kind) {
  const m = $("lobbyMsg");
  m.textContent = text || "";
  m.className = "msg" + (kind ? " " + kind : "");
}

function myName() {
  return (cloud.signedIn && cloud.display) || cloud.lastName || "プレイヤー";
}

function drawRoster() {
  const box = $("lobbyWho");
  box.innerHTML = "";
  net.roster().forEach((r) => {
    const d = document.createElement("div");
    d.className = "whorow" + (r.ok ? " ok" : "");
    const dot = document.createElement("i");
    dot.className = "dot";
    const nm = document.createElement("span");
    nm.textContent = r.name;
    const tag = document.createElement("span");
    tag.className = "tagm";
    tag.textContent = r.slot === "host" ? "部屋の主" : (r.ok ? (r.relay ? "中継でつながった" : "つながった") : "つないでいます…");
    d.appendChild(dot); d.appendChild(nm); d.appendChild(tag);
    box.appendChild(d);
  });
  const n = net.roster().length;
  $("startGame").disabled = !(net.role === "host" && n >= 2 && net.openCount() >= n - 1);
  $("startGame").textContent = net.role === "host"
    ? (n < 2 ? "友達を待っています…" : "はじめる（" + n + "人）")
    : "部屋の主が始めるのを待っています…";
  if (net.role !== "host") $("startGame").disabled = true;
}

function openLobby() {
  snd.unlock(); snd.ui();
  // 初期画面より手前にロビーを出し、開始後も初期画面がゲームを覆わないようにする。
  $("gate").classList.remove("show");
  $("lobby").classList.add("show");
  $("lobbyMake").style.display = "";
  $("lobbyWait").style.display = "none";
  lobbyMsg("");
  if (game) game.paused = true;
}

function closeLobby() {
  $("lobby").classList.remove("show");
}

document.querySelectorAll("#floorPick .f").forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll("#floorPick .f").forEach((x) => x.classList.remove("on"));
    el.classList.add("on");
    lobbyFloor = Number(el.dataset.f) || 1;
    snd.ui();
  };
});

$("mkRoom").onclick = async () => {
  lobbyMsg("部屋をつくっています…");
  const r = await net.host(myName(), lobbyFloor);
  if (!r.ok) { lobbyMsg(r.why, "err"); return; }
  net.onMembers = drawRoster;
  net.onDrop = drawRoster;
  net.onReady = drawRoster;
  net.onMessage = lobbyMessage;
  $("lobbyMake").style.display = "none";
  $("lobbyWait").style.display = "";
  $("lobbyCode").textContent = r.code;
  $("lobbyFloor").textContent = (FLOORS[lobbyFloor - 1] || {}).title + "で遊びます";
  lobbyMsg("");
  drawRoster();
};

$("joinRoom").onclick = async () => {
  const code = ($("codeIn").value || "").trim().toUpperCase();
  if (code.length !== 4) { lobbyMsg("合言葉は4文字です。", "err"); return; }
  lobbyMsg("その部屋を探しています…");
  const r = await net.join(code, myName());
  if (!r.ok) { lobbyMsg(r.why, "err"); return; }
  net.onMembers = drawRoster;
  net.onDrop = drawRoster;
  net.onReady = drawRoster;
  net.onMessage = lobbyMessage;
  lobbyFloor = r.floor || 1;
  $("lobbyMake").style.display = "none";
  $("lobbyWait").style.display = "";
  $("lobbyCode").textContent = code;
  $("lobbyFloor").textContent = (FLOORS[lobbyFloor - 1] || {}).title + "で遊びます";
  $("lobbyHint").textContent = "つながりました。部屋の主が始めるのを待ちましょう。";
  lobbyMsg("");
  drawRoster();
};

$("startGame").onclick = async () => {
  if (net.role !== "host") return;
  snd.ui();
  const slots = net.roster().map((r) => r.slot);
  const oni = slots[Math.floor(Math.random() * slots.length)];
  await net.begin();
  const g = ensureGame();
  versus = new Versus(g, net);
  versus.onAgain = () => location.reload();
  const keys = null;   // ホストが決めて、下で配ります
  // 先に鍵を決めるため、いったん組み立ててから配る
  g.onQuitVersus = quitVersus;
  closeLobby();
  await g.startVersus(versus, lobbyFloor, oni, keys);
  // 開始時の顔ぶれも一緒に確定し、参加した順番に関係なく全端末で同じ人数にする。
  net.broadcast({
    t: "go", oni: oni, floor: lobbyFloor,
    members: { ...net.members },
    keys: versus.keys.map((k) => ({ x: k.x, z: k.z })),
  });
};

function lobbyMessage(from, o) {
  if (!o || o.t !== "go") return;
  net.stopPolling();
  net.started = true;
  net.syncMembers(o.members);
  const g = ensureGame();
  versus = new Versus(g, net);
  versus.onAgain = () => location.reload();
  g.onQuitVersus = quitVersus;
  closeLobby();
  g.startVersus(versus, o.floor || 1, o.oni, o.keys);
}

async function quitVersus() {
  const g = ensureGame();
  g.endVersus();
  versus = null;
  await net.leave();
  location.reload();
}

$("lobbyClose").onclick = async () => {
  snd.ui();
  await net.leave();
  closeLobby();
  // ロビーをやめた時だけ、元の初期画面へ戻す。
  $("gate").classList.add("show");
  if (game && game.running) game.resume();
};

$("codeIn").addEventListener("input", () => {
  $("codeIn").value = $("codeIn").value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 4);
});

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
