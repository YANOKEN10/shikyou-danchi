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
