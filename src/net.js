// ============================================================
//  友達とつなぐ（WebRTC）
//   ・4文字の合言葉で待ち合わせ、つながったら端末どうしで直接やりとり
//   ・つながった後はサーバーを使わないので、反応が速く、費用もかからない
//   ・部屋を作った人（ホスト）が審判。捕まえた／鍵を取った／勝敗を決める
// ============================================================

const API = "/api/room";
const POLL = 2000;          // つながるまでの、待ち合わせの確認間隔
const ICE_WAIT = 700;       // 通信経路の候補は、まとめて送る

function rtcConfig() {
  return {
    iceServers: [{
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
      ],
    }],
  };
}

export class Net {
  constructor() {
    this.reset();
  }

  reset() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.iceTimer) { clearTimeout(this.iceTimer); this.iceTimer = null; }
    for (const k in (this.pcs || {})) { try { this.pcs[k].close(); } catch (e) { /* もう閉じている */ } }
    this.role = null;          // "host" | "guest"
    this.code = "";
    this.slot = "";            // ゲストなら g1〜g3
    this.myName = "";
    this.pcs = {};             // slot -> RTCPeerConnection
    this.dcs = {};             // slot -> RTCDataChannel
    this.members = {};         // slot -> 名前
    this.iceQueue = [];
    this.started = false;
    this.floor = 1;
    this.onMessage = null;     // (from, obj) => void
    this.onMembers = null;     // () => void
    this.onDrop = null;        // (slot) => void
    this.onReady = null;       // () => void
  }

  get connected() {
    if (this.role === "guest") return Boolean(this.dcs.host && this.dcs.host.readyState === "open");
    return this.openCount() > 0;
  }

  openCount() {
    let n = 0;
    for (const k in this.dcs) if (this.dcs[k].readyState === "open") n++;
    return n;
  }

  // ロビーに並べる顔ぶれ
  roster() {
    const out = [{ slot: "host", name: this.members.host || "ホスト", ok: true }];
    for (let i = 1; i <= 3; i++) {
      const s = "g" + i;
      if (!this.members[s]) continue;
      const ok = this.role === "guest" ? true : Boolean(this.dcs[s] && this.dcs[s].readyState === "open");
      out.push({ slot: s, name: this.members[s], ok: ok });
    }
    return out;
  }

  /* ---------------- 待ち合わせ（サーバー） ---------------- */

  async call(body) {
    let r;
    try {
      r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { ok: false, why: "つながりませんでした。通信の状態を確かめてください。" };
    }
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok) return { ok: false, why: (d && d.message) || "うまくいきませんでした（" + r.status + "）", code: d && d.error };
    return { ok: true, data: d || {} };
  }

  // 経路の候補はまとめて送る（1つずつ送ると書き込みが増えるため）
  queueIce(cand) {
    this.iceQueue.push(cand);
    if (this.iceTimer) return;
    this.iceTimer = setTimeout(() => {
      const send = this.iceQueue.splice(0, this.iceQueue.length);
      this.iceTimer = null;
      if (!send.length || !this.code) return;
      this.call({ action: "post", code: this.code, who: this.role === "host" ? "host" : this.slot, addIce: send, data: {} });
    }, ICE_WAIT);
  }

  stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  /* ---------------- 部屋を作る（ホスト） ---------------- */

  async host(name, floor) {
    this.reset();
    this.role = "host";
    this.myName = name;
    const r = await this.call({ action: "create", name: name, floor: floor });
    if (!r.ok) return r;
    this.code = r.data.code;
    this.floor = r.data.floor;
    this.members.host = name;
    this.pollTimer = setInterval(() => this._hostPoll(), POLL);
    this._hostPoll();
    return { ok: true, code: this.code };
  }

  async _hostPoll() {
    if (this.role !== "host" || !this.code) return;
    const r = await this.call({ action: "poll", code: this.code });
    if (!r.ok) return;
    const slots = r.data.slots || {};
    let changed = false;
    for (let i = 1; i <= 3; i++) {
      const s = "g" + i, gst = slots[s];
      if (!gst) continue;
      if (!this.members[s]) { this.members[s] = gst.name || "プレイヤー"; changed = true; }
      if (gst.offer && !this.pcs[s]) this._hostAnswer(s, gst.offer);
      if (gst.ice && gst.ice.length && this.pcs[s]) {
        const seen = this.pcs[s]._seen || 0;
        for (let k = seen; k < gst.ice.length; k++) {
          try { this.pcs[s].addIceCandidate(gst.ice[k]); } catch (e) { /* 古い候補 */ }
        }
        this.pcs[s]._seen = gst.ice.length;
      }
    }
    if (changed && this.onMembers) this.onMembers();
  }

  async _hostAnswer(slot, offer) {
    const pc = new RTCPeerConnection(rtcConfig());
    this.pcs[slot] = pc;
    pc._seen = 0;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.queueIce({ to: slot, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    pc.ondatachannel = (e) => this._bind(slot, e.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") this._drop(slot);
    };
    try {
      await pc.setRemoteDescription(offer);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      // 返事は host の answers に、相手ごとに置く
      const answers = {};
      for (const k in this.pcs) {
        if (this.pcs[k].localDescription) {
          answers[k] = { type: this.pcs[k].localDescription.type, sdp: this.pcs[k].localDescription.sdp };
        }
      }
      await this.call({ action: "post", code: this.code, who: "host", data: { answers: answers, name: this.myName } });
    } catch (e) {
      this._drop(slot);
    }
  }

  /* ---------------- 部屋に入る（ゲスト） ---------------- */

  async join(code, name) {
    this.reset();
    this.role = "guest";
    this.myName = name;
    this.code = String(code || "").toUpperCase();

    const r = await this.call({ action: "join", code: this.code, name: name });
    if (!r.ok) { this.role = null; return r; }
    this.slot = r.data.slot;
    this.floor = r.data.floor || 1;
    this.members.host = (r.data.host && r.data.host.name) || "ホスト";
    this.members[this.slot] = name;

    const pc = new RTCPeerConnection(rtcConfig());
    this.pcs.host = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.queueIce({ to: "host", c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") this._drop("host");
    };
    const dc = pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 });
    this._bind("host", dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.call({
      action: "post", code: this.code, who: this.slot,
      data: { offer: { type: offer.type, sdp: offer.sdp }, name: name },
    });

    this.pollTimer = setInterval(() => this._guestPoll(), POLL);
    return { ok: true, slot: this.slot, floor: this.floor };
  }

  async _guestPoll() {
    if (this.role !== "guest" || !this.code) return;
    const r = await this.call({ action: "poll", code: this.code });
    if (!r.ok) return;
    const slots = r.data.slots || {};
    const host = slots.host;
    if (!host) return;

    this.floor = r.data.floor || this.floor;
    let changed = false;
    if (host.name && this.members.host !== host.name) { this.members.host = host.name; changed = true; }
    for (let i = 1; i <= 3; i++) {
      const s = "g" + i;
      if (slots[s] && this.members[s] !== slots[s].name) { this.members[s] = slots[s].name; changed = true; }
    }
    if (changed && this.onMembers) this.onMembers();

    const pc = this.pcs.host;
    if (!pc) return;
    if (host.answers && host.answers[this.slot] && !pc.currentRemoteDescription) {
      try { await pc.setRemoteDescription(host.answers[this.slot]); } catch (e) { /* 二重に来た */ }
    }
    if (host.ice && host.ice.length) {
      const seen = pc._seen || 0;
      for (let k = seen; k < host.ice.length; k++) {
        const it = host.ice[k];
        if (it && it.to && it.to !== this.slot) continue;
        try { await pc.addIceCandidate(it && it.c ? it.c : it); } catch (e) { /* 古い候補 */ }
      }
      pc._seen = host.ice.length;
    }
  }

  /* ---------------- やりとり ---------------- */

  _bind(slot, dc) {
    this.dcs[slot] = dc;
    dc.onopen = () => {
      if (this.onMembers) this.onMembers();
      // つながったら、待ち合わせの確認は止める
      if (this.role === "guest") this.stopPolling();
      if (this.onReady) this.onReady();
    };
    dc.onclose = () => this._drop(slot);
    dc.onmessage = (e) => {
      let obj = null;
      try { obj = JSON.parse(e.data); } catch (err) { return; }
      if (this.onMessage) this.onMessage(slot, obj);
    };
  }

  _drop(slot) {
    if (this.dcs[slot]) { try { this.dcs[slot].close(); } catch (e) {} delete this.dcs[slot]; }
    if (this.pcs[slot]) { try { this.pcs[slot].close(); } catch (e) {} delete this.pcs[slot]; }
    delete this.members[slot];
    if (this.onDrop) this.onDrop(slot);
    if (this.onMembers) this.onMembers();
  }

  send(slot, obj) {
    const dc = this.dcs[slot];
    if (!dc || dc.readyState !== "open") return;
    try { dc.send(JSON.stringify(obj)); } catch (e) { /* 落ちても次で送り直す */ }
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const k in this.dcs) {
      const dc = this.dcs[k];
      if (dc.readyState !== "open") continue;
      try { dc.send(s); } catch (e) { /* 同上 */ }
    }
  }

  // ホストへ（ゲストのとき）
  toHost(obj) { this.send("host", obj); }

  async begin() {
    if (this.role !== "host") return;
    this.started = true;
    this.stopPolling();
    await this.call({ action: "post", code: this.code, who: "host", open: false, data: {} });
  }

  async leave() {
    if (this.role === "host" && this.code) {
      await this.call({ action: "close", code: this.code });
    }
    this.reset();
  }
}
