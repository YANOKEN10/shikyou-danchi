// ============================================================
//  ログインと記録のクラウド保存（クライアント側）
//
//   ・メールアドレスは「あってもなくてもよい」
//       無い人 … 名前 ＋ 合言葉
//       有る人 … 名前でも メールでも ログインできる
//   ・合言葉は端末に一切保存しない。保存するのは
//     サーバーが署名した「券（トークン）」だけ（1年で切れる）
//   ・ログインしない人のために、端末内だけの保存も用意する
// ============================================================

const TOK = "shikyou:token";     // ログインの券
const LOCAL = "shikyou:local";   // この端末だけの記録
const LASTID = "shikyou:lastid"; // 前回の名前（入力欄の初期値に使う）

function ls(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

export class Cloud {
  constructor() {
    this.token = ls(() => localStorage.getItem(TOK), "") || "";
    this.user = null;
    this.rev = 0;          // 手元の記録の版。サーバーより古ければ上書きしない
    this.mode = "guest";   // "cloud" | "guest"
  }

  get signedIn() { return Boolean(this.token && this.user); }
  get display() { return this.user ? (this.user.display || this.user.id) : ""; }

  setToken(t) {
    this.token = t || "";
    ls(() => (t ? localStorage.setItem(TOK, t) : localStorage.removeItem(TOK)));
  }

  rememberName(n) { ls(() => localStorage.setItem(LASTID, n || "")); }
  get lastName() { return ls(() => localStorage.getItem(LASTID), "") || ""; }

  /* ---------------- 通信の土台 ---------------- */

  async call(path, opt) {
    const o = opt || {};
    const h = { "Content-Type": "application/json" };
    if (this.token) h.Authorization = "Bearer " + this.token;

    let r;
    try {
      r = await fetch(path, {
        method: o.method || "GET",
        headers: h,
        body: o.body ? JSON.stringify(o.body) : undefined,
      });
    } catch (e) {
      return { ok: false, why: "サーバーに接続できませんでした。通信の状態を確かめてください。", offline: true };
    }

    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }

    if (!r.ok) {
      // 券が切れていた／消えていた
      if (r.status === 401) { this.setToken(""); this.user = null; }

      // サーバー機能が置かれていない場所で開いたとき
      if (r.status === 404 && !d) {
        return { ok: false, status: 404, missing: true, why: "サーバー機能が見つかりません。公開URLで開いてください。" };
      }
      return {
        ok: false,
        status: r.status,
        data: d || {},
        why: (d && d.message) || "うまくいきませんでした（" + r.status + "）",
      };
    }
    return { ok: true, data: d || {} };
  }

  /* ---------------- 出入り ---------------- */

  // 起動時、券が生きていれば黙ってログイン状態に戻す
  async restore() {
    if (!this.token) return false;
    const r = await this.call("/api/save");
    if (!r.ok) return false;
    this.user = r.data.user;
    this.rev = (r.data.user && r.data.user.rev) | 0;
    this.mode = "cloud";
    return true;
  }

  async checkName(name) {
    return await this.call("/api/auth", { method: "POST", body: { action: "check", name } });
  }

  async signup(name, pw, mail) {
    return await this.enter({ action: "signup", name, pw, mail: mail || "" });
  }

  // name には メールアドレスを入れてもよい
  async login(name, pw) {
    return await this.enter({ action: "login", name, pw });
  }

  async enter(body) {
    const r = await this.call("/api/auth", { method: "POST", body });
    if (!r.ok) return r;
    this.setToken(r.data.token);
    this.user = r.data.user;
    this.rev = (r.data.user && r.data.user.rev) | 0;
    this.mode = "cloud";
    this.rememberName(body.name || "");
    return { ok: true, user: this.user };
  }

  signOut() {
    this.setToken("");
    this.user = null;
    this.rev = 0;
    this.mode = "guest";
  }

  /* ---------------- アカウントの設定 ---------------- */
  // どれも「今の合言葉」が必要
  async setMail(pw, mail) { return await this.account({ action: "setmail", pw, mail }); }
  async clearMail(pw) { return await this.account({ action: "clearmail", pw }); }
  async setPw(pw, newPw) { return await this.account({ action: "setpw", pw, newPw }); }
  async rename(pw, display) { return await this.account({ action: "rename", pw, display }); }

  async account(body) {
    const r = await this.call("/api/account", { method: "POST", body });
    if (r.ok) {
      if (r.data.user) this.user = r.data.user;
      if (r.data.token) this.setToken(r.data.token);
    }
    return r;
  }

  async removeAccount(pw) {
    const r = await this.account({ action: "delete", pw });
    if (r.ok) this.signOut();
    return r;
  }

  /* ---------------- 記録 ---------------- */

  // 端末内の記録（ログインしていない人・通信できないとき用）
  readLocal() { return ls(() => JSON.parse(localStorage.getItem(LOCAL) || "null"), null); }
  writeLocal(payload) { ls(() => localStorage.setItem(LOCAL, JSON.stringify(payload))); }
  clearLocal() { ls(() => localStorage.removeItem(LOCAL)); }

  // 読み出し。ログインしていればサーバー、していなければ端末内
  async load() {
    if (!this.signedIn) return { ok: true, payload: this.readLocal(), where: "local" };
    const r = await this.call("/api/save");
    if (!r.ok) return { ok: false, why: r.why, payload: this.readLocal(), where: "local" };
    this.user = r.data.user;
    this.rev = (r.data.user && r.data.user.rev) | 0;
    return { ok: true, payload: r.data.payload, where: "cloud" };
  }

  // 保存。クラウドが駄目でも端末内には必ず残す
  async save(payload, force) {
    this.writeLocal(payload);
    if (!this.signedIn) return { ok: true, where: "local" };

    const r = await this.call("/api/save", {
      method: "POST",
      body: { payload, rev: this.rev, force: Boolean(force) },
    });

    // 別の端末で先に進めていた
    if (!r.ok && r.status === 409) {
      return { ok: false, conflict: true, theirs: r.data.payload, user: r.data.user, why: r.why };
    }
    if (!r.ok) return { ok: false, why: r.why, where: "local" };

    this.user = r.data.user;
    this.rev = r.data.rev | 0;
    return { ok: true, where: "cloud", rev: this.rev };
  }

  // クラウドの記録だけ消す
  async wipeCloud() {
    if (!this.signedIn) return { ok: true };
    const r = await this.call("/api/save", { method: "DELETE" });
    if (r.ok) { this.user = r.data.user; this.rev = (r.data.user && r.data.user.rev) | 0; }
    return r;
  }
}
