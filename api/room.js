// ============================================================
//  友達と遊ぶための「部屋」
//   ・4文字の合言葉で待ち合わせ、端末どうしを直接つなぐための
//     受け渡しだけをします（つながったら、ここは使いません）
//   ・部屋ひとつ＝記録ひとつ。1回の問い合わせで読み書きが済みます
//   ・20分でおしまい
// ============================================================
const crypto = require("crypto");
const L = require("./_lib");
const S = require("./_store");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 見まちがえる字は外す
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
const WHO_RE = /^(host|g[1-3])$/;
const ROOM_TTL = 20 * 60 * 1000;
const GONE = 35 * 1000;        // これだけ音沙汰がなければ、空き
const MAX_ICE = 40;

function roomKey(code) { return "sk/room/" + code + ".json"; }
function relayKey(code, who, lane) { return "sk/relay/" + code + "-" + who + "-" + lane + ".json"; }

function makeCode() {
  const b = crypto.randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

function cleanName(v, fallback) {
  let s = String(v == null ? "" : v).normalize("NFKC");
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x20 || c === 0x7f || ch === "<" || ch === ">") continue;
    out += ch;
  }
  out = out.trim().slice(0, 16);
  return out || fallback;
}

function blank(name, floor) {
  return {
    created: Date.now(),
    open: true,
    floor: floor,
    host: { name: name, answers: {}, ice: [], seen: Date.now() },
    g1: null, g2: null, g3: null,
  };
}

module.exports = async function handler(req, res) {
  L.cors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  if (!L.configured()) { L.notReady(res); return; }

  const b = L.body(req);
  const action = String(b.action || "");
  const code = String(b.code || "").toUpperCase();
  const who = String(b.who || "");

  try {
    /* --- 部屋を作る --- */
    if (action === "create") {
      const floor = Math.max(1, Math.min(5, b.floor | 0 || 1));
      // まれに同じ合言葉になることがあるので、空いているものを探す
      let c = "";
      for (let i = 0; i < 6; i++) {
        const t = makeCode();
        const cur = await S.readJson(roomKey(t));
        if (!cur || Date.now() - (cur.created || 0) > ROOM_TTL) { c = t; break; }
      }
      if (!c) { res.status(503).json({ error: "busy", message: "いま混み合っています。少し待ってください。" }); return; }
      await S.writeJson(roomKey(c), blank(cleanName(b.name, "ホスト"), floor));
      res.status(200).json({ code: c, floor: floor });
      return;
    }

    if (!CODE_RE.test(code)) {
      res.status(400).json({ error: "code", message: "合言葉は4文字です。" });
      return;
    }

    const room = await S.readJson(roomKey(code));
    if (!room) { res.status(404).json({ error: "nf", message: "その部屋は見つかりません。" }); return; }
    if (Date.now() - (room.created || 0) > ROOM_TTL) {
      res.status(410).json({ error: "old", message: "その部屋は時間切れです。作り直してください。" });
      return;
    }

    /* --- 入る --- */
    if (action === "join") {
      if (room.open === false) { res.status(409).json({ error: "started", message: "その部屋は、もう始まっています。" }); return; }
      let slot = "";
      for (let i = 1; i <= 3; i++) {
        const s = "g" + i;
        if (!room[s] || Date.now() - (room[s].seen || 0) > GONE) { slot = s; break; }
      }
      if (!slot) { res.status(409).json({ error: "full", message: "部屋がいっぱいです。" }); return; }
      room[slot] = { name: cleanName(b.name, "プレイヤー"), offer: null, ice: [], seen: Date.now() };
      await S.writeJson(roomKey(code), room);
      res.status(200).json({ slot: slot, host: { name: room.host.name }, floor: room.floor });
      return;
    }

    /* --- つなぐための書き置き --- */
    if (action === "post") {
      if (!WHO_RE.test(who)) { res.status(400).json({ error: "who" }); return; }
      const cur = room[who] || (who === "host"
        ? { name: "ホスト", answers: {}, ice: [] }
        : { name: "プレイヤー", ice: [] });
      if (b.data && typeof b.data === "object") {
        if (b.data.offer) cur.offer = b.data.offer;
        if (b.data.answers && typeof b.data.answers === "object") cur.answers = b.data.answers;
        if (typeof b.data.name === "string") cur.name = cleanName(b.data.name, cur.name);
      }
      if (Array.isArray(b.addIce) && b.addIce.length) {
        cur.ice = (Array.isArray(cur.ice) ? cur.ice : []).concat(b.addIce.slice(0, 12)).slice(-MAX_ICE);
      }
      cur.seen = Date.now();
      room[who] = cur;
      if (who === "host" && b.open === false) room.open = false;
      if (who === "host" && b.floor) room.floor = Math.max(1, Math.min(5, b.floor | 0));
      await S.writeJson(roomKey(code), room);
      res.status(200).json({ ok: true });
      return;
    }

    /* --- 直通できない回線の中継 --- */
    if (action === "relay") {
      const to = String(b.to || "");
      if (!WHO_RE.test(who) || !room[who] || !(to === "*" || (WHO_RE.test(to) && room[to]))) {
        res.status(400).json({ error: "relay" }); return;
      }
      const lane = b.lane === "control" ? "control" : "state";
      const packet = { from: who, to: to, lane: lane, seq: Math.max(1, Number(b.seq) || 1), at: Date.now(), data: b.data && typeof b.data === "object" ? b.data : {} };
      await S.writeJson(relayKey(code, who, lane), packet);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "relayPoll") {
      if (!WHO_RE.test(who) || !room[who]) { res.status(400).json({ error: "who" }); return; }
      const senders = who === "host" ? ["g1", "g2", "g3"] : ["host"];
      const reads = [];
      senders.forEach((s) => ["state", "control"].forEach((lane) => reads.push(S.readJson(relayKey(code, s, lane)))));
      const packets = await Promise.all(reads);
      const seen = b.seen && typeof b.seen === "object" ? b.seen : {};
      const messages = packets.filter((p) => {
        if (!p || (p.to !== "*" && p.to !== who)) return false;
        const id = p.from + ":" + p.lane;
        p.id = id;
        return Number(p.seq) > (Number(seen[id]) || 0);
      });
      res.status(200).json({ messages: messages });
      return;
    }

    /* --- 様子を見る --- */
    if (action === "poll") {
      const slots = { host: room.host };
      // WebRTCがつながった後も席を予約し続け、待機中の別参加者による上書きを防ぐ。
      if (WHO_RE.test(who) && room[who]) {
        room[who].seen = Date.now();
        await S.writeJson(roomKey(code), room);
      }
      for (let i = 1; i <= 3; i++) { const s = "g" + i; if (room[s]) slots[s] = room[s]; }
      res.status(200).json({ slots: slots, open: room.open !== false, floor: room.floor });
      return;
    }

    /* --- 片づける --- */
    if (action === "close") {
      await S.removeJson(roomKey(code));
      // 合言葉が将来再利用されても古い開始通知が届かないよう、中継箱も一緒に消す。
      const relayDeletes = [];
      ["host", "g1", "g2", "g3"].forEach((s) => ["state", "control"].forEach((lane) => relayDeletes.push(S.removeJson(relayKey(code, s, lane)))));
      await Promise.all(relayDeletes);

      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "action", message: "不明な操作です。" });
  } catch (e) {
    res.status(500).json({ error: "server", message: "通信に失敗しました。" });
  }
};
