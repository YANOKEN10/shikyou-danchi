// ============================================================
//  サーバー側の共通処理（四号棟）
//   ・アカウント1つ＝JSONファイル1つ
//   ・合言葉（パスワード）は scrypt でハッシュ化して保管
//   ・メールアドレスは「あってもなくてもよい」
//       - 無い人  … 名前 ＋ 合言葉 でログイン
//       - 有る人  … 名前 でも メール でもログインできる
// ============================================================
const crypto = require("crypto");
const S = require("./_store");

const SECRET = process.env.AUTH_SECRET || (process.env.VERCEL ? "" : "shikyou-danchi-local-dev-secret-0000");
const YEAR = 1000 * 60 * 60 * 24 * 365;

const ORIGINS = [
  "https://shikyou-danchi.vercel.app",
  "https://yanoken10.github.io",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
];
const PREVIEW = /^https:\/\/shikyou-danchi-[a-z0-9-]+\.vercel\.app$/;

function configured() { return S.storeReady() && SECRET.length >= 16; }

function notReady(res) {
  res.status(503).json({
    error: "setup",
    message: "サーバーの準備がまだです。『この端末だけ』で遊べます。",
  });
}

function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ORIGINS.indexOf(o) >= 0 || PREVIEW.test(o))) res.setHeader("Access-Control-Allow-Origin", o);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

/* --- 名前・メールの正規化と保管キー ---------------------------- */
function normId(v) { return String(v == null ? "" : v).normalize("NFKC").trim().toLowerCase(); }
function normMail(v) { return String(v == null ? "" : v).normalize("NFKC").trim().toLowerCase(); }
function isMail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normMail(v)); }

function userKey(id) {
  return "sk/u/" + crypto.createHash("sha256").update("skd1:" + id).digest("hex") + ".json";
}
function mailKey(mail) {
  return "sk/e/" + crypto.createHash("sha256").update("skmail1:" + mail).digest("hex") + ".json";
}

async function readUser(id) { return S.readJson(userKey(id)); }
async function writeUser(u) {
  u.updated = Date.now();
  await S.writeJson(userKey(u.id), u);
}
async function deleteUser(u) {
  if (u.email) await S.removeJson(mailKey(u.email));
  await S.removeJson(userKey(u.id));
}
// メール → 名前 の対応表
async function idForMail(mail) {
  const r = await S.readJson(mailKey(normMail(mail)));
  return r && r.id ? r.id : null;
}
async function linkMail(mail, id) { await S.writeJson(mailKey(normMail(mail)), { id: id, at: Date.now() }); }
async function unlinkMail(mail) { await S.removeJson(mailKey(normMail(mail))); }

// 入力が名前でもメールでも、その人を見つける
async function findUser(loginName) {
  if (isMail(loginName)) {
    const id = await idForMail(loginName);
    if (!id) return null;
    return readUser(id);
  }
  return readUser(normId(loginName));
}

/* --- 合言葉 ------------------------------------------------- */
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString("hex"); }
function checkPw(pw, u) {
  if (!u || !u.salt) return false;
  const a = Buffer.from(hashPw(pw, u.salt), "hex");
  const b = Buffer.from(String(u.pw || ""), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function setPw(u, pw) {
  u.salt = crypto.randomBytes(16).toString("hex");
  u.pw = hashPw(pw, u.salt);
}
// 間違えたときは少し待たせる（総当たり対策）
function slowDown() { return new Promise((r) => setTimeout(r, 400 + Math.random() * 300)); }

/* --- ログインの券（1年有効） ---------------------------------- */
function makeToken(id) {
  const b = Buffer.from(JSON.stringify({ id: id, exp: Date.now() + YEAR })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
  return b + "." + sig;
}
function readToken(tok) {
  if (!tok || String(tok).indexOf(".") < 0) return null;
  const parts = String(tok).split(".");
  const want = crypto.createHmac("sha256", SECRET).update(parts[0]).digest("base64url");
  if (parts[1].length !== want.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(want))) return null;
  try {
    const d = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (!d.id || d.exp < Date.now()) return null;
    return d;
  } catch (e) { return null; }
}
function bearer(req) {
  const h = req.headers.authorization || "";
  return h.indexOf("Bearer ") === 0 ? h.slice(7) : "";
}

/* --- 外に見せてよい情報だけ ---------------------------------- */
function maskMail(m) {
  if (!m) return "";
  const at = m.indexOf("@");
  const head = m.slice(0, at);
  const tail = m.slice(at);
  return (head.length <= 2 ? head[0] + "*" : head.slice(0, 2) + "***") + tail;
}
function publicUser(u) {
  return {
    id: u.id,
    display: u.display || u.id,
    mail: maskMail(u.email || ""),
    hasMail: Boolean(u.email),
    created: u.created,
    updated: u.updated,
    hasSave: Boolean(u.payload),
    savedAt: u.savedAt || 0,
    rev: u.rev | 0,
  };
}

module.exports = {
  configured, notReady, cors, body,
  normId, normMail, isMail, findUser, readUser, writeUser, deleteUser,
  idForMail, linkMail, unlinkMail,
  hashPw, checkPw, setPw, slowDown,
  makeToken, readToken, bearer, publicUser, maskMail,
};
