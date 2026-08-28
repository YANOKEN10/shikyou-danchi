// ============================================================
//  見た目のもと（テクスチャ）
//   画像ファイルは使わず、その場で canvas に描いて作ります。
//   古い団地らしい「汚れ」と「継ぎ目」がいちばん効きます。
// ============================================================
import * as THREE from "../lib/three.module.js";

const cache = new Map();

function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h || w;
  return c;
}

function tex(key, w, h, draw, rx, ry) {
  if (cache.has(key)) return cache.get(key);
  const c = cv(w, h);
  draw(c.getContext("2d"), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/* ---------- 下地の道具 ---------- */

// ざらつき
function grain(g, w, h, amount, alpha) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    if (alpha) d[i + 3] = Math.min(255, d[i + 3]);
  }
  g.putImageData(img, 0, 0);
}

// 大きなむら（雲のような濃淡）
function blotch(g, w, h, n, r0, r1, color, a0, a1) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const r = r0 + Math.random() * (r1 - r0);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = a0 + Math.random() * (a1 - a0);
    grd.addColorStop(0, "rgba(" + color + "," + a.toFixed(3) + ")");
    grd.addColorStop(1, "rgba(" + color + ",0)");
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// 雨だれの筋
function streaks(g, w, h, n, color, len) {
  g.save();
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.4;
    const l = len * (0.4 + Math.random() * 0.9);
    const wd = 1 + Math.random() * 5;
    const grd = g.createLinearGradient(0, y, 0, y + l);
    grd.addColorStop(0, "rgba(" + color + ",0.20)");
    grd.addColorStop(0.25, "rgba(" + color + ",0.11)");
    grd.addColorStop(1, "rgba(" + color + ",0)");
    g.fillStyle = grd;
    g.fillRect(x, y, wd, l);
  }
  g.restore();
}

// ひび割れ
function cracks(g, w, h, n) {
  g.save();
  g.strokeStyle = "rgba(0,0,0,0.30)";
  for (let i = 0; i < n; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    let a = Math.random() * Math.PI * 2;
    g.lineWidth = 0.6 + Math.random();
    g.beginPath(); g.moveTo(x, y);
    const seg = 6 + (Math.random() * 10 | 0);
    for (let s = 0; s < seg; s++) {
      a += (Math.random() - 0.5) * 1.1;
      x += Math.cos(a) * (4 + Math.random() * 12);
      y += Math.sin(a) * (4 + Math.random() * 12);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
}

/* ---------- 実際のテクスチャ ---------- */

// 打ちっぱなしの外壁（塗装が浮いている）
export function wallConcrete(rx, ry) {
  return tex("wall", 512, 512, (g, w, h) => {
    g.fillStyle = "#b9b3a6"; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 34, 40, 190, "150,145,132", 0.05, 0.22);
    blotch(g, w, h, 16, 20, 90, "205,200,188", 0.04, 0.16);
    // 型枠の継ぎ目
    g.strokeStyle = "rgba(90,86,78,0.35)"; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // 塗装の剥がれ
    g.fillStyle = "rgba(122,112,96,0.28)";
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.beginPath();
      const r = 5 + Math.random() * 26;
      for (let a = 0; a < 7; a++) {
        const ang = (a / 7) * Math.PI * 2;
        const rr = r * (0.5 + Math.random() * 0.8);
        const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    }
    streaks(g, w, h, 26, "70,66,58", 300);
    cracks(g, w, h, 7);
    grain(g, w, h, 26);
  }, rx || 1, ry || 1);
}

// 外廊下の床（モルタル＋目地）
export function floorCorridor(rx, ry) {
  return tex("floorc", 512, 512, (g, w, h) => {
    g.fillStyle = "#8e8a80"; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 40, 30, 160, "104,100,92", 0.06, 0.24);
    blotch(g, w, h, 10, 40, 120, "60,58,54", 0.05, 0.14);
    // 目地
    g.strokeStyle = "rgba(58,56,50,0.5)"; g.lineWidth = 3;
    for (let x = 0; x <= w; x += 170) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    cracks(g, w, h, 9);
    grain(g, w, h, 30);
  }, rx || 6, ry || 2);
}

// 階段室の床（ノンスリップの筋）
export function floorStair(rx, ry) {
  return tex("floors", 256, 256, (g, w, h) => {
    g.fillStyle = "#6f6a62"; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 24, 20, 90, "48,46,42", 0.08, 0.24);
    g.strokeStyle = "rgba(40,38,34,0.45)"; g.lineWidth = 2;
    for (let y = 6; y < h; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    grain(g, w, h, 24);
  }, rx || 2, ry || 2);
}

// 天井（塗り天井・雨漏りのしみ）
export function ceilingPaint(rx, ry) {
  return tex("ceil", 256, 256, (g, w, h) => {
    g.fillStyle = "#9c968a"; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 18, 30, 110, "120,112,96", 0.06, 0.26);
    blotch(g, w, h, 5, 30, 80, "86,70,44", 0.10, 0.28);
    grain(g, w, h, 20);
  }, rx || 4, ry || 2);
}

// 玄関ドア（鉄扉。錆と、上のほうに古い塗装）
export function doorSteel(no) {
  return tex("door" + no, 256, 512, (g, w, h) => {
    g.fillStyle = "#5d6360"; g.fillRect(0, 0, w, h);
    // 縦のヘアライン
    g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 1;
    for (let x = 0; x < w; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    blotch(g, w, h, 16, 20, 90, "36,40,38", 0.08, 0.26);
    // 錆
    blotch(g, w, h, 12, 8, 46, "116,64,30", 0.10, 0.34);
    streaks(g, w, h, 10, "96,52,24", 220);

    // 郵便受けの口
    g.fillStyle = "#2b2f2d"; g.fillRect(48, 300, 160, 26);
    g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(48, 300, 160, 3);

    // 部屋番号のプレート
    g.fillStyle = "#d8d3c6"; g.fillRect(74, 74, 108, 56);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(74, 126, 108, 4);
    g.fillStyle = "#20211f";
    g.font = "bold 40px 'MS Gothic', monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(no), 128, 103);

    // 覗き穴
    g.fillStyle = "#1a1c1b";
    g.beginPath(); g.arc(128, 190, 9, 0, 7); g.fill();
    g.strokeStyle = "rgba(200,200,200,0.25)"; g.lineWidth = 2; g.stroke();

    grain(g, w, h, 16);
  }, 1, 1);
}

// 掲示板の紙
export function noticeBoard(lines) {
  const key = "notice:" + lines.join("|");
  return tex(key, 512, 384, (g, w, h) => {
    g.fillStyle = "#2a2723"; g.fillRect(0, 0, w, h);
    // 紙
    g.save();
    g.translate(w / 2, h / 2); g.rotate(-0.012);
    g.fillStyle = "#e6e0cf"; g.fillRect(-w / 2 + 30, -h / 2 + 26, w - 60, h - 52);
    g.restore();
    blotch(g, w, h, 12, 20, 80, "150,140,110", 0.05, 0.20);

    g.fillStyle = "#25231f";
    g.textAlign = "center"; g.textBaseline = "top";
    g.font = "bold 34px 'MS Gothic', serif";
    g.fillText(lines[0] || "", w / 2, 58);
    g.font = "22px 'MS Gothic', serif";
    for (let i = 1; i < lines.length; i++) {
      g.fillText(lines[i], w / 2, 116 + (i - 1) * 34);
    }
    // 画鋲
    g.fillStyle = "#6b6b6b";
    [[52, 44], [w - 52, 44], [52, h - 44], [w - 52, h - 44]].forEach((p) => {
      g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.fill();
    });
    grain(g, w, h, 12);
  }, 1, 1);
}

// 階数のプレート
export function floorPlate(n) {
  return tex("plate" + n, 256, 256, (g, w, h) => {
    g.fillStyle = "#3f4642"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#cfd3c9"; g.fillRect(18, 18, w - 36, h - 36);
    blotch(g, w, h, 8, 10, 40, "120,116,104", 0.08, 0.24);
    g.fillStyle = "#1c1e1c";
    g.font = "bold 150px 'MS Gothic', monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(n), w / 2, h / 2 + 6);
    g.font = "bold 30px 'MS Gothic', monospace";
    g.fillText("階", w / 2 + 62, h / 2 + 66);
    grain(g, w, h, 14);
  }, 1, 1);
}

// 室内の壁紙（黄ばんだクロス）
export function wallpaper(rx, ry) {
  return tex("paper", 256, 256, (g, w, h) => {
    g.fillStyle = "#cfc4a8"; g.fillRect(0, 0, w, h);
    // 細かい織り目
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = "rgba(0,0,0,0.03)"; g.fillRect(0, y, w, 1);
    }
    blotch(g, w, h, 20, 20, 100, "150,128,86", 0.06, 0.22);
    blotch(g, w, h, 6, 20, 70, "92,74,44", 0.08, 0.20);
    streaks(g, w, h, 8, "110,92,58", 150);
    grain(g, w, h, 16);
  }, rx || 3, ry || 2);
}

// 畳
export function tatami(rx, ry) {
  return tex("tatami", 256, 256, (g, w, h) => {
    g.fillStyle = "#9d9358"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = y % 6 === 0 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.04)";
      g.fillRect(0, y, w, 1.5);
    }
    blotch(g, w, h, 14, 20, 90, "108,98,52", 0.08, 0.22);
    blotch(g, w, h, 5, 20, 60, "70,60,32", 0.10, 0.22);
    grain(g, w, h, 14);
  }, rx || 2, ry || 2);
}

// 台所などのタイル
export function tileWall(rx, ry) {
  return tex("tile", 256, 256, (g, w, h) => {
    g.fillStyle = "#8a8b80"; g.fillRect(0, 0, w, h);
    const s = 64;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        g.fillStyle = "rgb(" + (196 + (Math.random() * 16 | 0)) + "," + (194 + (Math.random() * 14 | 0)) + "," + (182 + (Math.random() * 14 | 0)) + ")";
        g.fillRect(x + 2, y + 2, s - 4, s - 4);
      }
    }
    blotch(g, w, h, 16, 14, 70, "110,104,86", 0.06, 0.24);
    grain(g, w, h, 12);
  }, rx || 3, ry || 2);
}

// 手すり・配管などの塗装鉄
export function paintedSteel() {
  return tex("psteel", 128, 128, (g, w, h) => {
    g.fillStyle = "#5c6a63"; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 14, 6, 34, "112,60,28", 0.12, 0.36);
    blotch(g, w, h, 8, 8, 26, "36,42,38", 0.10, 0.26);
    grain(g, w, h, 22);
  }, 3, 1);
}

// フローリング（板張り）
export function flooring(rx, ry) {
  return tex("floorw", 256, 256, (g, w, h) => {
    g.fillStyle = "#6b5334"; g.fillRect(0, 0, w, h);
    const bh = 32;
    for (let y = 0, i = 0; y < h; y += bh, i++) {
      const off = (i % 2) * 60;
      for (let x = -60; x < w; x += 120) {
        const c = 92 + (Math.random() * 26 | 0);
        g.fillStyle = "rgb(" + c + "," + (c - 22) + "," + (c - 48) + ")";
        g.fillRect(x + off + 1, y + 1, 118, bh - 2);
        // 木目
        g.strokeStyle = "rgba(0,0,0,0.10)"; g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const yy = y + 6 + k * 9 + Math.random() * 3;
          g.beginPath(); g.moveTo(x + off + 2, yy); g.lineTo(x + off + 117, yy + (Math.random() - 0.5) * 3); g.stroke();
        }
      }
    }
    blotch(g, w, h, 14, 16, 80, "40,28,14", 0.08, 0.26);
    grain(g, w, h, 16);
  }, rx || 3, ry || 3);
}

// 段ボール
export function cardboard() {
  return tex("cardb", 128, 128, (g, w, h) => {
    g.fillStyle = "#9c7c4e"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = y % 8 === 0 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
      g.fillRect(0, y, w, 2);
    }
    blotch(g, w, h, 10, 10, 44, "94,68,36", 0.10, 0.28);
    // 貼られたガムテープ
    g.fillStyle = "rgba(200,180,140,0.55)"; g.fillRect(0, 54, w, 18);
    grain(g, w, h, 14);
  }, 1, 1);
}

// 砂嵐（テレビ）。何枚か作って、順ぐりに差し替えると動いて見えます
export function tvStatic(i) {
  return tex("tvs" + (i || 0), 128, 96, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 30 + Math.random() * 190;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 8; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // 走査線
    g.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  }, 1, 1);
}

// 鏡の面（古い姿見。銀が曇っている）
export function mirrorGlass() {
  return tex("mirrorg", 256, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#39434c");
    bg.addColorStop(0.45, "#232c34");
    bg.addColorStop(0.7, "#2e3841");
    bg.addColorStop(1, "#1a2027");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // 斜めの映り込み
    g.save();
    g.translate(w / 2, h / 2); g.rotate(-0.5);
    const sh = g.createLinearGradient(-w, 0, w, 0);
    sh.addColorStop(0, "rgba(190,205,220,0)");
    sh.addColorStop(0.5, "rgba(190,205,220,0.16)");
    sh.addColorStop(1, "rgba(190,205,220,0)");
    g.fillStyle = sh; g.fillRect(-w, -h * 0.2, w * 2, h * 0.4);
    g.restore();
    // 銀の曇り（点々と、ふちの腐食）
    blotch(g, w, h, 26, 8, 44, "60,54,44", 0.10, 0.40);
    blotch(g, w, h, 8, 20, 70, "18,20,24", 0.10, 0.34);
    g.fillStyle = "rgba(30,26,20,0.5)";
    for (let i = 0; i < 90; i++) {
      const e = Math.random();
      const x = e < 0.5 ? Math.random() * 26 : w - Math.random() * 26;
      g.beginPath(); g.arc(x, Math.random() * h, 1 + Math.random() * 4, 0, 7); g.fill();
    }
    grain(g, w, h, 10);
  }, 1, 1);
}

// カレンダー（何かの日に丸がついている）
export function calendar() {
  return tex("calendar", 200, 280, (g, w, h) => {
    g.fillStyle = "#e2dbc8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a3a3a"; g.fillRect(0, 0, w, 54);
    g.fillStyle = "#e8e2d2";
    g.font = "bold 30px 'MS Gothic', serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("八月", w / 2, 28);
    g.fillStyle = "#3a3a3a";
    g.font = "13px 'MS Gothic', monospace";
    let n = 1;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7 && n <= 31; c++, n++) {
        g.fillStyle = c === 0 ? "#9a3a3a" : "#3a3a3a";
        g.fillText(String(n), 18 + c * 27, 76 + r * 34);
      }
    }
    // 三十一日に、赤い丸
    g.strokeStyle = "rgba(160,40,40,0.9)"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(18 + 2 * 27, 76 + 4 * 34, 13, 0, 7); g.stroke();
    blotch(g, w, h, 8, 14, 60, "150,138,108", 0.05, 0.18);
    grain(g, w, h, 10);
  }, 1, 1);
}

// 遺影（顔のところが削られている）
export function portrait() {
  return tex("portrait", 256, 320, (g, w, h) => {
    g.fillStyle = "#1a1712"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#c9c3b2"; g.fillRect(20, 20, w - 40, h - 40);
    // 肩と首
    g.fillStyle = "#8e897c";
    g.beginPath(); g.ellipse(w / 2, h - 40, 78, 62, 0, 0, 7); g.fill();
    g.fillStyle = "#a49e90"; g.fillRect(w / 2 - 16, h - 130, 32, 40);
    // 顔——描かない。こすり取られている
    g.fillStyle = "#b4aea0";
    g.beginPath(); g.ellipse(w / 2, h - 168, 48, 58, 0, 0, 7); g.fill();
    g.save();
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      g.arc(w / 2 + (Math.random() - 0.5) * 84, h - 168 + (Math.random() - 0.5) * 96, 6 + Math.random() * 13, 0, 7);
      g.fill();
    }
    g.restore();
    g.fillStyle = "rgba(20,18,14,0.85)";
    for (let i = 0; i < 40; i++) {
      g.fillRect(w / 2 - 46 + Math.random() * 92, h - 214 + Math.random() * 96, 2 + Math.random() * 8, 1 + Math.random() * 3);
    }
    // 黒いリボン
    g.fillStyle = "#17150f"; g.fillRect(20, 20, 62, 10); g.fillRect(w - 82, 20, 62, 10);
    blotch(g, w, h, 8, 20, 70, "120,110,88", 0.06, 0.20);
    grain(g, w, h, 14);
  }, 1, 1);
}

// 子どもの落書き（背景は透ける）
export function scribble() {
  const key = "scribble";
  if (cache.has(key)) return cache.get(key);
  const c = cv(256, 256);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 256);
  // 家族の絵。人が四人。ひとりだけ顔がない
  const person = (x, y, s, col, face) => {
    g.strokeStyle = col; g.lineWidth = 3.2; g.lineCap = "round";
    g.beginPath(); g.arc(x, y - s * 1.15, s * 0.42, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(x, y - s * 0.72); g.lineTo(x, y + s * 0.5); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.6, y - s * 0.1); g.lineTo(x + s * 0.6, y - s * 0.1); g.stroke();
    g.beginPath(); g.moveTo(x, y + s * 0.5); g.lineTo(x - s * 0.45, y + s * 1.2); g.stroke();
    g.beginPath(); g.moveTo(x, y + s * 0.5); g.lineTo(x + s * 0.45, y + s * 1.2); g.stroke();
    if (face) {
      g.beginPath(); g.arc(x - s * 0.15, y - s * 1.2, 2.2, 0, 7); g.fill();
      g.beginPath(); g.arc(x + s * 0.15, y - s * 1.2, 2.2, 0, 7); g.fill();
    }
  };
  g.fillStyle = "#3a5a8a";
  person(52, 150, 30, "#3a5a8a", true);
  g.fillStyle = "#a03a3a";
  person(112, 150, 28, "#a03a3a", true);
  g.fillStyle = "#3a7a4a";
  person(168, 152, 24, "#3a7a4a", true);
  g.fillStyle = "#2a2a2a";
  person(220, 148, 34, "#2a2a2a", false);   // この子だけ、顔がない
  g.fillStyle = "rgba(60,60,60,0.8)";
  g.font = "bold 20px 'MS Gothic', monospace";
  g.fillText("かぞく", 16, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// 長い髪（房のすきまが透ける）
export function hair() {
  const key = "hair";
  if (cache.has(key)) return cache.get(key);
  const c = cv(256, 512);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 512);
  // 頭のあたりは隙間なく、下へ行くほど房に分かれる
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    const len = 150 + Math.random() * 350;
    const w = 2 + Math.random() * 9;
    const grd = g.createLinearGradient(0, 0, 0, len);
    const v = 48 + Math.random() * 22;          // 房ごとに、わずかな濃淡
    grd.addColorStop(0, "rgba(" + v + "," + v + "," + (v + 5) + ",1)");
    grd.addColorStop(0.72, "rgba(" + (v - 8) + "," + (v - 8) + "," + (v - 3) + ",0.95)");
    grd.addColorStop(1, "rgba(10,10,14,0)");
    g.fillStyle = grd;
    g.save();
    g.translate(x, 0);
    g.rotate((Math.random() - 0.5) * 0.10);
    g.fillRect(-w / 2, 0, w, len);
    g.restore();
  }
  // てっぺんは必ず塞ぐ
  g.fillStyle = "rgba(54,54,62,1)";
  g.fillRect(0, 0, 256, 110);
  // 分け目
  g.fillStyle = "rgba(12,12,16,0.9)";
  g.fillRect(120, 0, 10, 200);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// 名札（頭の上に浮かぶ）
export function nameTag(name) {
  const key = "tag:" + name;
  if (cache.has(key)) return cache.get(key);
  const c = cv(256, 64);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 64);
  g.font = "bold 30px 'Noto Sans JP', 'Hiragino Sans', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 6; g.strokeStyle = "rgba(4,5,8,0.9)";
  g.strokeText(name, 128, 34);
  g.fillStyle = "#e6e0cf";
  g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// 「それ」の衣。縦の襞と、黴のような染み
export function shroud() {
  return tex("shroud", 256, 512, (g, w, h) => {
    g.fillStyle = "#1b1b21"; g.fillRect(0, 0, w, h);
    // 縦の襞。回り込むほど濃くなる
    for (let x = 0; x < w; x += 1) {
      const f = Math.sin((x / w) * Math.PI * 9) * 0.5 + 0.5;
      const v = 16 + f * 30;
      g.fillStyle = "rgba(" + v + "," + v + "," + (v + 7) + ",0.55)";
      g.fillRect(x, 0, 1, h);
    }
    // 裾へ向かって暗くする
    const dark = g.createLinearGradient(0, h * 0.45, 0, h);
    dark.addColorStop(0, "rgba(0,0,0,0)");
    dark.addColorStop(1, "rgba(0,0,0,0.72)");
    g.fillStyle = dark; g.fillRect(0, 0, w, h);
    // 黴と、乾いた染み
    blotch(g, w, h, 22, 12, 70, "96,98,92", 0.05, 0.16);
    blotch(g, w, h, 14, 10, 46, "8,8,10", 0.14, 0.34);
    // ほつれ
    g.strokeStyle = "rgba(120,120,126,0.14)"; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y + 8 + Math.random() * 26); g.stroke();
    }
    grain(g, w, h, 14);
  }, 1, 1);
}

// 顔。髪のすきまから、かろうじて見えるもの
export function face() {
  const key = "face";
  if (cache.has(key)) return cache.get(key);
  const c = cv(128, 160);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 160);
  // 血の気のない肌
  const skin = g.createRadialGradient(64, 74, 6, 64, 80, 62);
  skin.addColorStop(0, "rgba(196,192,186,1)");
  skin.addColorStop(0.75, "rgba(150,148,146,0.95)");
  skin.addColorStop(1, "rgba(96,96,98,0)");
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(64, 80, 40, 54, 0, 0, 7); g.fill();
  // 落ちくぼんだ目
  ["-", "+"].forEach((s, i) => {
    const x = i === 0 ? 48 : 80;
    const hole = g.createRadialGradient(x, 72, 1, x, 72, 15);
    hole.addColorStop(0, "rgba(2,2,4,1)");
    hole.addColorStop(0.6, "rgba(4,4,6,0.9)");
    hole.addColorStop(1, "rgba(20,20,24,0)");
    g.fillStyle = hole;
    g.beginPath(); g.ellipse(x, 73, 11, 14, 0, 0, 7); g.fill();
  });
  // うっすら開いた口
  g.fillStyle = "rgba(6,6,9,0.85)";
  g.beginPath(); g.ellipse(64, 112, 7, 12, 0, 0, 7); g.fill();
  // 頬のくぼみ
  g.fillStyle = "rgba(40,40,44,0.30)";
  g.beginPath(); g.ellipse(40, 96, 12, 20, 0.3, 0, 7); g.fill();
  g.beginPath(); g.ellipse(88, 96, 12, 20, -0.3, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// 鏡にうつるもの（うすい人影。背景は透ける）
export function figure() {
  const key = "figure";
  if (cache.has(key)) return cache.get(key);
  const c = cv(128, 256);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 256);
  const col = (a) => "rgba(196,204,214," + a + ")";
  // 頭
  let grd = g.createRadialGradient(64, 62, 2, 64, 62, 30);
  grd.addColorStop(0, col(0.85)); grd.addColorStop(1, col(0));
  g.fillStyle = grd; g.beginPath(); g.ellipse(64, 62, 26, 32, 0, 0, 7); g.fill();
  // 胴
  grd = g.createLinearGradient(0, 90, 0, 250);
  grd.addColorStop(0, col(0.75)); grd.addColorStop(0.75, col(0.28)); grd.addColorStop(1, col(0));
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(40, 96); g.quadraticCurveTo(64, 84, 88, 96);
  g.lineTo(98, 250); g.lineTo(30, 250); g.closePath(); g.fill();
  // 目のあたりの闇
  g.fillStyle = "rgba(6,8,12,0.75)";
  g.beginPath(); g.ellipse(55, 58, 5, 8, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(73, 58, 5, 8, 0, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// 貼り紙
export function poster(lines, tone) {
  const key = "poster:" + lines.join("|");
  return tex(key, 256, 320, (g, w, h) => {
    g.fillStyle = tone || "#ded6c0"; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 10, 16, 70, "150,138,108", 0.05, 0.18);
    g.fillStyle = "#26241f";
    g.textAlign = "center"; g.textBaseline = "top";
    g.font = "bold 26px 'MS Gothic', serif";
    g.fillText(lines[0] || "", w / 2, 34);
    g.font = "19px 'MS Gothic', serif";
    for (let i = 1; i < lines.length; i++) g.fillText(lines[i], w / 2, 82 + (i - 1) * 30);
    grain(g, w, h, 12);
  }, 1, 1);
}

// 壁の落書き（背景が透けるので、壁に重ねて貼ります）
export function graffiti(text) {
  const key = "graffiti:" + text;
  if (cache.has(key)) return cache.get(key);
  const c = cv(512, 256);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 512, 256);
  g.font = "bold 30px 'MS Gothic', monospace";
  for (let i = 0; i < 6; i++) {
    g.fillStyle = "rgba(150,40,40," + (0.55 + Math.random() * 0.25).toFixed(2) + ")";
    g.fillText(text, 8 + (i % 2) * 7, 40 + i * 38);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// メモ用紙（読むときに全画面で出すもの）
export function memoSheet(title, body) {
  const c = cv(700, 900);
  const g = c.getContext("2d");
  g.fillStyle = "#ded7c4"; g.fillRect(0, 0, 700, 900);
  blotch(g, 700, 900, 16, 30, 140, "150,138,108", 0.05, 0.18);
  g.strokeStyle = "rgba(0,0,0,0.10)"; g.lineWidth = 1;
  for (let y = 150; y < 860; y += 42) { g.beginPath(); g.moveTo(60, y); g.lineTo(640, y); g.stroke(); }
  g.fillStyle = "#22201c";
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.font = "bold 34px 'MS Gothic', serif";
  g.fillText(title, 60, 100);
  g.font = "26px 'MS Gothic', serif";
  body.forEach((line, i) => g.fillText(line, 60, 178 + i * 42));
  grain(g, 700, 900, 10);
  return c.toDataURL();
}

export function clearCache() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
