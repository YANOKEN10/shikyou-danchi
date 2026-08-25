// ============================================================
//  登録 と ログイン
//   POST /api/auth  { action:"signup"|"login"|"check", ... }
//
//   ・メールアドレスは入力しなくてもよい
//   ・ログインは「名前」でも「メールアドレス」でもできる
// ============================================================
const L = require("./_lib");

const NAME_RE = /^[^\s@<>]{2,16}$/;

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  if (!L.configured()) { L.notReady(res); return; }

  const b = L.body(req);
  const action = String(b.action || "login");

  try {
    /* --- 名前が使えるか調べる -------------------------------- */
    if (action === "check") {
      const rawName = String(b.name == null ? "" : b.name).trim();
      if (!NAME_RE.test(rawName)) {
        res.status(200).json({ free: false, message: "名前は2〜16文字。空白と @ は使えません。" });
        return;
      }
      const u = await L.readUser(L.normId(rawName));
      res.status(200).json({ free: !u, message: u ? "その名前は使われています。" : "この名前は使えます。" });
      return;
    }

    /* --- 新規登録 -------------------------------------------- */
    if (action === "signup") {
      const rawName = String(b.name == null ? "" : b.name).trim();
      const id = L.normId(rawName);
      const pw = String(b.pw == null ? "" : b.pw);
      const mailIn = String(b.mail == null ? "" : b.mail).trim();

      if (!NAME_RE.test(rawName)) {
        res.status(400).json({ error: "name", message: "名前は2〜16文字。空白と @ は使えません。" });
        return;
      }
      if (pw.length < 4 || pw.length > 64) {
        res.status(400).json({ error: "pw", message: "合言葉は4文字以上にしてください。" });
        return;
      }
      if (mailIn && !L.isMail(mailIn)) {
        res.status(400).json({ error: "mail", message: "メールアドレスの形式が違います。" });
        return;
      }
      if (await L.readUser(id)) {
        res.status(409).json({ error: "taken", message: "その名前はすでに使われています。" });
        return;
      }
      const mail = mailIn ? L.normMail(mailIn) : "";
      if (mail && await L.idForMail(mail)) {
        res.status(409).json({ error: "mailtaken", message: "そのメールアドレスはすでに使われています。" });
        return;
      }

      const user = {
        id: id,
        display: rawName,
        email: mail,
        created: Date.now(),
        rev: 0,
        payload: null,
      };
      L.setPw(user, pw);
      await L.writeUser(user);
      if (mail) await L.linkMail(mail, id);

      res.status(200).json({ token: L.makeToken(id), user: L.publicUser(user) });
      return;
    }

    /* --- ログイン ------------------------------------------- */
    if (action === "login") {
      const who = String(b.name == null ? "" : b.name).trim();
      const pw = String(b.pw == null ? "" : b.pw);
      if (!who || !pw) {
        res.status(400).json({ error: "input", message: "名前（またはメール）と合言葉を入力してください。" });
        return;
      }
      const user = await L.findUser(who);
      if (!user || !L.checkPw(pw, user)) {
        await L.slowDown();
        res.status(401).json({ error: "auth", message: "名前か合言葉が違います。" });
        return;
      }
      res.status(200).json({ token: L.makeToken(user.id), user: L.publicUser(user) });
      return;
    }

    res.status(400).json({ error: "action", message: "不明な操作です。" });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーに接続できませんでした。" });
  }
};
