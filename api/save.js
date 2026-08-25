// ============================================================
//  記録（クラウド保存）
//   GET    /api/save          … 自分の記録を取り出す
//   POST   /api/save          … 記録を預ける
//   DELETE /api/save          … クラウドの記録だけ消す
//  ログインしている本人の分しか触れません。
// ============================================================
const L = require("./_lib");

const MAX_BYTES = 300 * 1024;   // 記録1つの上限

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (!L.configured()) { L.notReady(res); return; }

  const claim = L.readToken(L.bearer(req));
  if (!claim) { res.status(401).json({ error: "auth", message: "ログインし直してください。" }); return; }

  try {
    const user = await L.readUser(claim.id);
    if (!user) { res.status(404).json({ error: "gone", message: "アカウントが見つかりませんでした。" }); return; }

    if (req.method === "GET") {
      res.status(200).json({ user: L.publicUser(user), payload: user.payload || null });
      return;
    }

    if (req.method === "DELETE") {
      user.payload = null;
      user.savedAt = 0;
      user.rev = (user.rev | 0) + 1;
      await L.writeUser(user);
      res.status(200).json({ user: L.publicUser(user), cleared: true });
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

    const b = L.body(req);
    if (b.payload == null || typeof b.payload !== "object") {
      res.status(400).json({ error: "payload", message: "記録の中身がありません。" });
      return;
    }
    const size = Buffer.byteLength(JSON.stringify(b.payload));
    if (size > MAX_BYTES) {
      res.status(413).json({ error: "big", message: "記録が大きすぎます。" });
      return;
    }

    // 別の端末で先に保存されていたら、上書きする前に確認する
    const myRev = b.rev | 0;
    const serverRev = user.rev | 0;
    if (!b.force && user.payload && myRev < serverRev) {
      res.status(409).json({
        error: "conflict",
        message: "別の端末に新しい記録があります。",
        user: L.publicUser(user),
        payload: user.payload,
      });
      return;
    }

    user.payload = b.payload;
    user.savedAt = Date.now();
    user.rev = serverRev + 1;
    await L.writeUser(user);
    res.status(200).json({ user: L.publicUser(user), saved: true, rev: user.rev });
  } catch (e) {
    res.status(500).json({ error: "server", message: "サーバーに接続できませんでした。" });
  }
};
