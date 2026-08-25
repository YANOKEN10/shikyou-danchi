// サーバーの状態を見る（値そのものは返しません）
const L = require("./_lib");
const S = require("./_store");

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  res.status(200).json({
    ok: true,
    store: S.usingBlob ? "blob" : "local",
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    configured: L.configured(),
    now: Date.now(),
  });
};
