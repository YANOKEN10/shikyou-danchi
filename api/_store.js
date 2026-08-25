// ============================================================
//  記録の保管場所
//   ・公開サーバー(Vercel)では Blob に保管
//   ・自分のパソコンで動かすときは .devdata/ フォルダに保管
//  どちらでも同じ書き方で読み書きできるようにしています。
// ============================================================
const fs = require("fs");
const path = require("path");

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const DEV_DIR = path.join(__dirname, "..", ".devdata");

let blob = null;
if (useBlob) {
  try { blob = require("@vercel/blob"); } catch (e) { blob = null; }
}

function devPath(key) {
  return path.join(DEV_DIR, key.replace(/[\/]/g, "__"));
}

async function readJson(key) {
  if (blob) {
    let r;
    try {
      r = await blob.get(key, { access: "private", useCache: false });
    } catch (e) {
      if (e && /not.?found/i.test(e.message || "")) return null;
      throw e;
    }
    if (!r || r.statusCode !== 200) return null;
    const text = await new Response(r.stream).text();
    try { return JSON.parse(text); } catch (e) { return null; }
  }
  try {
    return JSON.parse(fs.readFileSync(devPath(key), "utf8"));
  } catch (e) { return null; }
}

async function writeJson(key, value) {
  const text = JSON.stringify(value);
  if (blob) {
    await blob.put(key, text, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  fs.mkdirSync(DEV_DIR, { recursive: true });
  fs.writeFileSync(devPath(key), text);
}

async function removeJson(key) {
  if (blob) {
    try { await blob.del(key); } catch (e) { /* もともと無いときは成功あつかい */ }
    return;
  }
  try { fs.unlinkSync(devPath(key)); } catch (e) { /* 同上 */ }
}

// 保管場所が使える状態か（公開サーバーなら Blob、手元なら常に使える）
function storeReady() {
  return Boolean(blob) || !useBlob;
}

module.exports = { readJson, writeJson, removeJson, storeReady, usingBlob: Boolean(blob) };
