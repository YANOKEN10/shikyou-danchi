// ============================================================
//  アカウントの設定
//   POST /api/account { action:"setmail"|"clearmail"|"setpw"|"rename"|"delete", ... }
//  どの操作にも「今の合言葉」が必要です。
// ============================================================
const L = require("./_lib");

// 危険な文字（制御文字と山かっこ）を取り除く
function cleanText(v, max) {
  let s = String(v == null ? "" : v);
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x20 || c === 0x7f || ch === "<" || ch === ">") continue;
    out += ch;
  }
  return out.trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  if (!L.configured()) { L.notReady(res); return; }

  const claim = L.readToken(L.bearer(req));
  if (!claim) { res.status(401).json({ error: "auth", message: "ログインし直してください。" }); return; }

  const b = L.body(req);
  const action = String(b.action || "");

  try {
    const user = await L.readUser(claim.id);
    if (!user) { res.status(404).json({ error: "gone", message: "アカウントが見つかりませんでした。" }); return; }

    if (!L.checkPw(String(b.pw == null ? "" : b.pw), user)) {
      await L.slowDown();
      res.status(401).json({ error: "auth", message: "今の合言葉が違います。" });
      return;
    }

    // メールアドレスを付ける／変える
    if (action === "setmail") {
      const mail = L.normMail(b.mail);
      if (!L.isMail(mail)) {
        res.status(400).json({ error: "mail", message: "メールアドレスの形式が違います。" });
        return;
      }
      const owner = await L.idForMail(mail);
      if (owner && owner !== user.id) {
        res.status(409).json({ error: "mailtaken", message: "そのメールアドレスはすでに使われています。" });
        return;
      }
      if (user.email && user.email !== mail) await L.unlinkMail(user.email);
      user.email = mail;
      await L.writeUser(user);
      await L.linkMail(mail, user.id);
      res.status(200).json({ user: L.publicUser(user) });
      return;
    }

    // メールアドレスを外す（名前＋合言葉だけに戻す）
    if (action === "clearmail") {
      if (user.email) await L.unlinkMail(user.email);
      user.email = "";
      await L.writeUser(user);
      res.status(200).json({ user: L.publicUser(user) });
      return;
    }

    // 合言葉を変える
    if (action === "setpw") {
      const np = String(b.newPw == null ? "" : b.newPw);
      if (np.length < 4 || np.length > 64) {
        res.status(400).json({ error: "pw", message: "合言葉は4文字以上にしてください。" });
        return;
      }
      L.setPw(user, np);
      await L.writeUser(user);
      res.status(200).json({ user: L.publicUser(user), token: L.makeToken(user.id) });
      return;
    }

    // 表示名だけ変える（ログイン用の名前は変わりません）
    if (action === "rename") {
      const d = cleanText(b.display, 16);
      if (!d) { res.status(400).json({ error: "name", message: "名前を入力してください。" }); return; }
      user.display = d;
      await L.writeUser(user);
      res.status(200).json({ user: L.publicUser(user) });
      return;
    }

    // アカウントごと消す
    if (action === "delete") {
      await L.deleteUser(user);
      res.status(200).json({ deleted: true });
      return;
    }

    res.status(400).json({ error: "action", message: "不明な操作です。" });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーに接続できませんでした。" });
  }
};
