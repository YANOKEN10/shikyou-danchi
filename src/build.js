// ============================================================
//  四号棟の組み立て
//   ・団地の外廊下は「片側に住戸の扉、片側に手すりと夜」
//   ・階段室は左端に一つだけ。各階、行って戻ってくることになる。
//   ・当たり判定は上から見た四角（AABB）の集まりで持ちます。
// ============================================================
import * as THREE from "../lib/three.module.js";
import * as TX from "./textures.js";
import { ROOMS } from "./story.js";

export const D = {
  CEIL: 2.42,        // 廊下の天井
  CORR_Z0: 0,        // 住戸側の壁
  CORR_Z1: 2.55,     // 手すり側
  CORR_LEN: 36,      // 廊下の長さ（階によって変わる）
  WALL: 0.22,
  DOOR_W: 0.98,
  DOOR_H: 2.02,
  STAIR_X0: -5.0,    // 階段室
  STAIR_X1: -0.3,
  STAIR_Z0: -1.2,
  STAIR_Z1: 3.6,
  PARAPET: 1.08,     // 腰壁の高さ
  RAIL: 1.34,
  UNIT_D: 6.4,       // 住戸の奥行き
  UNIT_W: 5.2,
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- 小道具 ---------- */

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function put(g, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

function lam(opt) { return new THREE.MeshLambertMaterial(opt); }

// 生成画像は一度だけ読み込み、階を移るたびに同じ大きな画像を再取得しないようにする。
const generatedLoader = new THREE.TextureLoader();
function generatedTexture(path, rx = 1, ry = 1) {
  const tex = generatedLoader.load(path);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  return tex;
}
const generatedWall = generatedTexture("./assets/generated/wall-aged.webp", 2, 1);
const generatedTatami = generatedTexture("./assets/generated/tatami-aged.webp", 2, 2);
// URLを更新して旧版がブラウザキャッシュに残っていても、現在の「それ」を必ず再取得させる。
const generatedEntity = generatedTexture("./assets/generated/entity-photoreal.webp?v=20260830-2");
const interiorAtlas = generatedTexture("./assets/generated/interior-decay-atlas-v2.png?v=20260830");

// 一枚の生成画像を六つの素材へ切り分け、通信量を増やさず家具ごとの質感を変える。
function interiorTexture(col, row) {
  const tex = interiorAtlas.clone();
  tex.needsUpdate = true;
  tex.repeat.set(1 / 3, 1 / 2);
  // Three.js の画像原点は下なので、row=0 を画像の上段として反転する。
  tex.offset.set(col / 3, row === 0 ? 1 / 2 : 0);
  return tex;
}

/* ---------- 当たり判定 ---------- */

export class Colliders {
  constructor() { this.list = []; }
  add(x0, z0, x1, z1, tag) {
    this.list.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), tag: tag || "" });
    return this.list[this.list.length - 1];
  }
  remove(c) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }
  // 半径 r の円が、どこにも重ならない位置へ押し戻す
  resolve(p, r) {
    for (let k = 0; k < 3; k++) {
      let hit = false;
      for (const c of this.list) {
        const cx = Math.max(c.x0, Math.min(p.x, c.x1));
        const cz = Math.max(c.z0, Math.min(p.z, c.z1));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // 完全に中にいる。いちばん近い辺へ出す
          const l = p.x - c.x0, rr = c.x1 - p.x, u = p.z - c.z0, dn = c.z1 - p.z;
          const m = Math.min(l, rr, u, dn);
          if (m === l) p.x = c.x0 - r;
          else if (m === rr) p.x = c.x1 + r;
          else if (m === u) p.z = c.z0 - r;
          else p.z = c.z1 + r;
        }
      }
      if (!hit) break;
    }
  }
  // 2点のあいだが壁で遮られていないか（追跡者の視線に使う）
  clear(ax, az, bx, bz) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const c of this.list) {
        if (c.tag === "soft") continue;
        if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return false;
      }
    }
    return true;
  }
}

/* ---------- 住戸の中 ---------- */
//  部屋ごとに家財を変えています（story.js の ROOMS）。
//  組み立ては扉を開けた瞬間なので、開けていない部屋のぶんは作りません。

function unitMaterials(mats, room) {
  const f = room.floor === "wood" ? mats.wood_floor : room.floor === "bare" ? mats.bare_floor : mats.tatami;
  return f;
}

function buildUnit(g, col, inter, unit, dx, mats, room, fx) {
  const z0 = -0.16, z1 = z0 - D.UNIT_D;
  const x0 = dx - D.UNIT_W / 2, x1 = dx + D.UNIT_W / 2;
  const H = 2.3;
  const zMid = z0 - 3.1;

  /* --- 床・天井・壁 --- */
  const f1 = plane(D.UNIT_W, z0 - zMid, mats.tile);      // 手前は台所の床
  f1.rotation.x = -Math.PI / 2;
  put(g, f1, dx, 0.01, (z0 + zMid) / 2);
  const f2 = plane(D.UNIT_W, zMid - z1, unitMaterials(mats, room));
  f2.rotation.x = -Math.PI / 2;
  put(g, f2, dx, 0.012, (zMid + z1) / 2);

  const cl = plane(D.UNIT_W, D.UNIT_D, mats.ceil);
  cl.rotation.x = Math.PI / 2;
  put(g, cl, dx, H, (z0 + z1) / 2);

  const wallMat = room.floor === "bare" ? mats.tile : mats.paper;
  const mk = (w, rotY, px, pz) => {
    const m = plane(w, H, wallMat);
    m.rotation.y = rotY;
    put(g, m, px, H / 2, pz);
  };
  mk(D.UNIT_D, Math.PI / 2, x0, (z0 + z1) / 2);
  mk(D.UNIT_D, -Math.PI / 2, x1, (z0 + z1) / 2);
  mk(D.UNIT_W, 0, dx, z1);

  const sideW = (D.UNIT_W - D.DOOR_W) / 2;
  const bk = (w, px) => {
    const m = plane(w, H, wallMat);
    m.rotation.y = Math.PI;
    put(g, m, px, H / 2, z0);
  };
  bk(sideW, x0 + sideW / 2);
  bk(sideW, x1 - sideW / 2);
  const lint = plane(D.DOOR_W, H - D.DOOR_H, wallMat);
  lint.rotation.y = Math.PI;
  put(g, lint, dx, D.DOOR_H + (H - D.DOOR_H) / 2, z0);

  col.add(x0 - 0.1, z1 - 0.1, x0, z0, "unit");
  col.add(x1, z1 - 0.1, x1 + 0.1, z0, "unit");
  col.add(x0 - 0.1, z1 - 0.1, x1 + 0.1, z1, "unit");
  col.add(x0 - 0.1, z0, x0 + sideW, z0 + 0.1, "unit");
  col.add(x1 - sideW, z0, x1 + 0.1, z0 + 0.1, "unit");

  // 襖（通り抜けの穴つき）
  const pw = (D.UNIT_W - 1.1) / 2;
  [[x0 + pw / 2, pw], [x1 - pw / 2, pw]].forEach(([px, w]) => {
    const m = box(w, H, 0.08, mats.fusuma);
    put(g, m, px, H / 2, zMid);
    col.add(px - w / 2, zMid - 0.06, px + w / 2, zMid + 0.06, "unit");
  });

  // 奥の窓。部屋によって、カーテン・目張り・そのまま
  const win = plane(1.6, 1.1, mats.night);
  put(g, win, dx, 1.45, z1 + 0.03);
  put(g, box(1.72, 0.06, 0.06, mats.steel), dx, 2.02, z1 + 0.06);
  put(g, box(0.06, 1.16, 0.06, mats.steel), dx, 1.45, z1 + 0.06);

  const style = (unit.no || 0) % 3;
  if (style === 1) {
    // カーテン（片方だけ開いている）
    put(g, box(0.55, 1.25, 0.05, mats.curtain), dx - 0.62, 1.42, z1 + 0.10);
    put(g, box(0.28, 1.25, 0.05, mats.curtain), dx + 0.72, 1.42, z1 + 0.10);
    put(g, box(1.9, 0.04, 0.04, mats.steel), dx, 2.08, z1 + 0.10);
  } else if (style === 2) {
    // 内側から新聞紙で目張りしてある
    for (let i = 0; i < 4; i++) {
      const p = box(0.46, 0.62, 0.02, mats.newspaper);
      p.position.set(dx - 0.58 + (i % 2) * 0.78, 1.72 - Math.floor(i / 2) * 0.56, z1 + 0.09);
      p.rotation.z = (Math.random() - 0.5) * 0.09;
      g.add(p);
    }
  }

  /* --- 家財 --- */
  const C = {
    g, col, inter, fx, mats, dx, x0, x1, z0, z1, zMid, H, room,
    pb(w, h, d, mat, px, py, pz, ry) {
      const m = box(w, h, d, mat);
      m.position.set(px, py, pz);
      if (ry) m.rotation.y = ry;
      g.add(m);
      return m;
    },
    blk(ax, az, bx, bz) { col.add(ax, az, bx, bz, "prop"); },
    // 壁に貼るもの（奥の壁は rot=0、左は +90、右は -90）
    wall(w, h, mat, px, py, pz, ry) {
      const m = plane(w, h, mat);
      m.position.set(px, py, pz);
      m.rotation.y = ry || 0;
      g.add(m);
      return m;
    },
  };

  commonRoom(C);
  commonWetArea(C);
  (FURNISH[room.kind] || FURNISH.kitchen)(C);

  /* --- 部屋の中のもの（拾う・読む） --- */
  if (unit.item) {
    const at = C.itemAt || [x0 + 1.0, z0 - 0.9];
    const prop = buildItemProp(C, unit.item, at[0], at[1]);
    inter.push({
      x: at[0], y: prop.userData.interactY || 0.8, z: at[1], r: 1.35,
      kind: "item", id: unit.item, label: "手に取る", once: true, note: unit.note, prop,
    });
  }
  if (unit.memo && !unit.goal) {
    const at = C.memoAt || [dx, zMid - 1.4];
    const prop = buildMemoProp(C, unit.memo, at[0], at[1]);
    inter.push({
      x: at[0], y: prop.userData.interactY || 0.55, z: at[1], r: 1.3,
      kind: "memo", id: unit.memo, label: "読む", once: true, prop,
    });
  }
  if (unit.goal) {
    const at = C.goalAt || [x0 + 1.0, z1 + 1.15];
    const prop = buildMemoProp(C, unit.memo || "m6", at[0], at[1]);
    inter.push({
      x: at[0], y: prop.userData.interactY || 0.76, z: at[1], r: 1.2,
      kind: "goal", id: unit.memo || "m6", label: "手に取る", once: true, prop,
    });
  }

  // 部屋ごとの「調べる」
  if (room.detail) {
    inter.push({
      x: C.detailAt ? C.detailAt[0] : dx,
      y: 1.1,
      z: C.detailAt ? C.detailAt[1] : zMid - 1.2,
      r: 1.35,
      kind: "detail", label: room.detail.label || "調べる",
      say: room.detail.say, scare: room.scare, once: true,
    });
  }

  return { x0, x1, z0, z1, dx };
}

/* ---------- どの部屋にもあるもの ---------- */
//  巾木・天井の照明器具と引き紐・カレンダー・玄関の靴。
//  こまごました物があるだけで、「人が住んでいた」感じが出ます。

function commonRoom(C) {
  const { mats, dx, x0, x1, z0, z1, zMid, H } = C;

  // 巾木
  const skirt = (w, px, pz, ry) => {
    const m = box(w, 0.09, 0.03, mats.darkwood);
    m.position.set(px, 0.045, pz);
    if (ry) m.rotation.y = ry;
    C.g.add(m);
  };
  skirt(D.UNIT_W, dx, z1 + 0.02);
  skirt(D.UNIT_D, x0 + 0.02, (z0 + z1) / 2, Math.PI / 2);
  skirt(D.UNIT_D, x1 - 0.02, (z0 + z1) / 2, Math.PI / 2);

  // 天井の照明器具（笠と引き紐）
  const shadeZ = (zMid + z1) / 2;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.14, 14), mats.shade);
  shade.position.set(dx, H - 0.10, shadeZ);
  C.g.add(shade);
  C.pb(0.05, 0.14, 0.05, mats.steel, dx, H - 0.2, shadeZ);
  const cord = box(0.012, 0.62, 0.012, mats.cord);
  cord.position.set(dx + 0.16, H - 0.5, shadeZ);
  C.g.add(cord);
  const knob = box(0.035, 0.07, 0.035, mats.cord);
  knob.position.set(dx + 0.16, H - 0.84, shadeZ);
  C.g.add(knob);
  C.fx.push({ kind: "cord", mesh: cord, knob, x: dx, z: shadeZ, base: H - 0.5, sway: 0 });

  // 玄関の靴（そろえてある／片方だけ裏返っている）
  C.pb(0.11, 0.06, 0.26, mats.darkwood, dx - 0.22, 0.03, z0 - 0.35, 0.1);
  C.pb(0.11, 0.06, 0.26, mats.darkwood, dx + 0.02, 0.03, z0 - 0.38, Math.random() < 0.4 ? 2.6 : -0.1);

  // カレンダー
  const cal = plane(0.34, 0.47, mats.calendar);
  cal.rotation.y = Math.PI / 2;
  cal.position.set(x0 + 0.04, 1.52, zMid - 0.9);
  C.g.add(cal);

  // コンセントと、壁のしみ
  C.pb(0.09, 0.13, 0.015, mats.plate, x1 - 0.02, 0.32, z1 + 1.6, -Math.PI / 2);
}

/* ---------- どの部屋にもある水まわり ---------- */

function hingedDoor(C, opt) {
  const pivot = new THREE.Group();
  pivot.position.set(opt.x, 0, opt.z);
  pivot.rotation.y = opt.shut || 0;
  const mesh = box(opt.w, opt.h, 0.055, opt.mat);
  mesh.position.set(opt.w / 2, opt.h / 2, 0);
  pivot.add(mesh);
  C.g.add(pivot);
  const rec = { pivot, open: false, opened: opt.opened, shut: opt.shut || 0, col: opt.collider, width: opt.w };
  C.inter.push({ x: opt.ix, y: 1.0, z: opt.iz, r: 1.05, kind: "fixtureDoor", door: rec, label: opt.label });
  return rec;
}

function commonWetArea(C) {
  const { mats, x0, x1, z0, H } = C;
  const front = z0 - 0.25, back = z0 - 2.85;
  const left = x0 + 0.12, right = x0 + 1.62;
  const doorW = 0.68;

  // 水まわりを左へ寄せ、玄関から居室まで一直線に歩ける幅を中央に残す。
  C.pb(right - left, 0.06, front - back, mats.tile, (left + right) / 2, 0.035, (front + back) / 2);
  const split = z0 - 1.52;
  C.pb(right - left, H, 0.08, mats.tile, (left + right) / 2, H / 2, split);
  C.blk(left, split - 0.04, right, split + 0.04);

  // 廊下側の壁は戸口だけ切り欠く。戸を開けたときだけ当たり判定も外す。
  const makeFront = (za, zb, name) => {
    const gap0 = za + 0.28, gap1 = gap0 + doorW;
    C.pb(0.08, H, gap0 - za, mats.tile, right, H / 2, (za + gap0) / 2);
    C.pb(0.08, H, zb - gap1, mats.tile, right, H / 2, (gap1 + zb) / 2);
    C.blk(right - 0.04, za, right + 0.04, gap0);
    C.blk(right - 0.04, gap1, right + 0.04, zb);
    const dc = C.col.add(right - 0.05, gap0, right + 0.05, gap1, "fixtureDoor");
    // 戸口は正のZ方向へ続くため、閉状態では戸板も正のZへ伸ばして隙間を塞ぐ。
    hingedDoor(C, { x: right, z: gap0, w: doorW, h: 1.92, mat: mats.frostglass, shut: -Math.PI / 2, opened: 0,
      collider: dc, ix: right + 0.38, iz: (gap0 + gap1) / 2, label: name + "を開ける" });
  };
  makeFront(split, front, "トイレ");
  makeFront(back, split, "風呂");

  // 便器は座面・ふた・タンクを分け、入口から用途が分かる形にする。
  const toilet = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.35, 16), mats.porcelain);
  toilet.scale.z = 1.3; toilet.position.set(left + 0.48, 0.22, z0 - 0.78); C.g.add(toilet);
  C.pb(0.5, 0.08, 0.58, mats.porcelain, left + 0.48, 0.43, z0 - 0.78);
  C.pb(0.46, 0.65, 0.22, mats.porcelain, left + 0.48, 0.33, z0 - 0.39);
  C.blk(left + 0.18, z0 - 1.12, left + 0.78, z0 - 0.3);

  // 狭いトイレほど鏡の中の奥行きが不自然に見えるため、便器の横に縦長の鏡を置く。
  addWetMirror(C, left + 0.035, 1.38, z0 - 0.82, Math.PI / 2, 0.42, 0.72, "トイレの鏡を覗く");
  const toiletStain = plane(0.58, 0.72, mats.damp);
  toiletStain.rotation.x = -Math.PI / 2;
  toiletStain.position.set(left + 0.5, 0.068, z0 - 0.82);
  C.g.add(toiletStain);

  // 浴槽は縁と底を別にして、実際に中へ踏み込める洗い場を手前へ確保する。
  const tubZ = z0 - 2.48;
  C.pb(1.18, 0.5, 0.08, mats.porcelain, left + 0.69, 0.25, tubZ - 0.43);
  C.pb(0.08, 0.5, 0.86, mats.porcelain, left + 0.14, 0.25, tubZ);
  C.pb(0.08, 0.5, 0.86, mats.porcelain, right - 0.14, 0.25, tubZ);
  C.pb(1.18, 0.12, 0.86, mats.porcelain, left + 0.69, 0.06, tubZ);
  C.blk(left + 0.08, tubZ - 0.48, right - 0.08, tubZ + 0.48);

  // 浴室の鏡は洗い場から正面に見える位置へ置き、見続けたときだけ人影を出す。
  addWetMirror(C, left + 0.035, 1.35, z0 - 2.02, Math.PI / 2, 0.52, 0.68, "風呂の鏡を覗く");
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.012, 16), mats.drain);
  drain.position.set(right - 0.28, 0.075, z0 - 1.87); C.g.add(drain);
  // 排水口から伸びる髪は曲線にし、ただの黒い棒ではなく濡れて床へ貼り付いた形にする。
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 1.8 - 0.7;
    const len = 0.18 + Math.random() * 0.34;
    const sx = right - 0.28, sz = z0 - 1.87;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx, 0.084, sz),
      new THREE.Vector3(sx + Math.cos(a + 0.45) * len * 0.45, 0.086, sz + Math.sin(a + 0.45) * len * 0.45),
      new THREE.Vector3(sx + Math.cos(a) * len, 0.085, sz + Math.sin(a) * len),
    ]);
    C.g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.006, 4, false), mats.wetHair));
  }

  // 右壁を共通の台所にし、部屋の種類にかかわらず流しと冷蔵庫を持たせる。
  C.pb(1.45, 0.82, 0.48, mats.kitchenSteel, x1 - 0.86, 0.41, z0 - 1.03);
  C.blk(x1 - 1.62, z0 - 1.31, x1 - 0.1, z0 - 0.75);
  const sink = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 16), mats.darksteel);
  sink.scale.z = 1.35; sink.position.set(x1 - 0.88, 0.84, z0 - 1.03); C.g.add(sink);
  // 吊り戸棚は部屋別に置くとトイレへ重なるため、共通の流しの真上だけに固定する。
  const upper = C.pb(1.35, 0.55, 0.3, mats.wood, x1 - 0.86, 1.73, z0 - 0.86);
  upper.userData.kind = "kitchenUpper";
  buildFridge(C, x1 - 0.48, z0 - 2.25);
}

function addWetMirror(C, px, py, pz, ry, w, h, label) {
  const frame = box(0.055, h + 0.1, w + 0.1, C.mats.rustedSteel);
  frame.position.set(px, py, pz); C.g.add(frame);
  const mirror = C.wall(w, h, C.mats.mirror, px + 0.035, py, pz, ry);
  const smear = C.wall(w * 0.92, h * 0.92, C.mats.mirrorSmear, px + 0.044, py, pz, ry);
  // 鏡像の人影を鏡面よりわずかに手前へ置き、ちらつき時のZファイティングを避ける。
  addGhost(C, mirror, px + 0.052, py - 0.05, pz, ry, w * 0.68, h * 0.82);
  C.inter.push({ x: px + 0.42, y: py, z: pz, r: 0.95, kind: "detail", label,
    say: "曇った鏡に、自分ではない息の跡が増えている。", scare: "mirror", once: true });
  return { mirror, smear };
}

function buildFridge(C, px, pz) {
  const { mats } = C;
  const w = 0.68, h = 1.48, d = 0.62, t = 0.055;
  const front = pz + d / 2;
  // 中身まで詰まった直方体では扉を開けても正面が塞がるため、外板を組んで空洞を作る。
  C.pb(w, t, d, mats.appliance, px, t / 2, pz);
  C.pb(w, t, d, mats.appliance, px, h - t / 2, pz);
  C.pb(t, h, d, mats.appliance, px - w / 2 + t / 2, h / 2, pz);
  C.pb(t, h, d, mats.appliance, px + w / 2 - t / 2, h / 2, pz);
  C.pb(w - t * 2, h - t * 2, t, mats.fridgeInside, px, h / 2, pz - d / 2 + t / 2);
  C.blk(px - w / 2 - 0.02, pz - d / 2 - 0.02, px + w / 2 + 0.02, pz + d / 2 + 0.02);

  const inside = new THREE.Group();
  // 棚を扉と別にしておくと、開いた瞬間に冷蔵庫の奥行きと向きが読み取れる。
  for (const y of [0.43, 0.82, 1.17]) {
    const shelf = box(w - 0.14, 0.025, d - 0.13, mats.fridgeInside);
    shelf.position.set(px, y, pz + 0.015); inside.add(shelf);
  }
  inside.visible = false; C.g.add(inside);

  const pivot = new THREE.Group();
  pivot.position.set(px - w / 2, 0, front + 0.018);
  const door = box(w, h - 0.06, 0.055, mats.fridgeDoor);
  door.position.set(w / 2, h / 2, 0); pivot.add(door);
  const handle = box(0.035, 0.55, 0.04, mats.darksteel);
  handle.position.set(w - 0.09, 0.86, 0.045); pivot.add(handle); C.g.add(pivot);
  pivot.userData.kind = "fridgeDoor";
  C.inter.push({ x: px, y: 1.0, z: pz + 0.7, r: 1.2, kind: "detail", label: "冷蔵庫を開ける",
    say: "電気は止まっているのに、中が冷えている。", scare: "fridge", repeat: true,
    fixture: { pivot, inside, open: false, opened: -Math.PI * 0.58 } });
}

function buildItemProp(C, id, px, pz) {
  const g = new THREE.Group();
  if (id === "light") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.24, 12), C.mats.darksteel);
    body.rotation.x = Math.PI / 2; g.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.055, 0.07, 12), C.mats.steel);
    lens.rotation.x = Math.PI / 2; lens.position.z = -0.15; g.add(lens);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), C.mats.lens);
    glass.position.z = -0.187; glass.rotation.y = Math.PI; g.add(glass);
    const sw = box(0.04, 0.025, 0.06, C.mats.switchMat); sw.position.set(0, 0.065, -0.01); g.add(sw);
    g.position.set(px, 0.82, pz); g.userData.interactY = 0.82;
  } else if (id.indexOf("key") === 0) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 16), C.mats.key);
    bow.rotation.x = Math.PI / 2; bow.position.x = -0.11; g.add(bow);
    const shaft = box(0.22, 0.025, 0.045, C.mats.key); shaft.position.x = 0.035; g.add(shaft);
    const tooth = box(0.055, 0.06, 0.045, C.mats.key); tooth.position.set(0.13, -0.025, 0); g.add(tooth);
    const tag = box(0.13, 0.025, 0.09, C.mats.keyTag); tag.position.x = -0.22; g.add(tag);
    g.position.set(px, 0.92, pz); g.rotation.z = -0.18; g.userData.interactY = 0.92;
  } else {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 10), C.mats.darksteel);
    cell.rotation.z = Math.PI / 2; g.add(cell); g.position.set(px, 0.78, pz); g.userData.interactY = 0.78;
  }
  C.g.add(g);
  return g;
}

function buildMemoProp(C, id, px, pz) {
  const g = new THREE.Group();
  const isLetter = id === "m5" || id === "m3draft";
  if (isLetter) {
    const env = box(0.3, 0.025, 0.2, C.mats.envelope); env.position.x = -0.12; env.rotation.y = -0.12; g.add(env);
    const sheet = box(0.32, 0.012, 0.42, C.mats.letterPaper); sheet.position.set(0.13, 0.018, 0.08); sheet.rotation.y = 0.14; g.add(sheet);
    for (let i = 0; i < 5; i++) { const line = box(0.22 - i * 0.012, 0.006, 0.008, C.mats.ink); line.position.set(0.13, 0.028, -0.06 + i * 0.055); g.add(line); }
  } else {
    const cover = box(0.32, 0.055, 0.42, C.mats.notebook); g.add(cover);
    const pages = box(0.29, 0.045, 0.39, C.mats.letterPaper); pages.position.x = 0.012; pages.position.y = 0.012; g.add(pages);
    const band = box(0.025, 0.062, 0.43, C.mats.darkwood); band.position.x = -0.12; g.add(band);
  }
  g.position.set(px, id === "m6" ? 0.76 : 0.38, pz); g.rotation.y = 0.18;
  g.userData.interactY = g.position.y; C.g.add(g); return g;
}

/* ---------- 家財のひとそろい ---------- */

const FURNISH = {
  // 台所と茶の間（ふつうの住まい）
  kitchen(C) {
    const { mats, dx, x0, x1, z0, z1, zMid, H } = C;
    // 靴箱
    C.pb(0.9, 0.75, 0.35, mats.wood, x1 - 0.6, 0.38, z0 - 2.5);
    C.blk(x1 - 1.1, z0 - 2.7, x1 - 0.1, z0 - 2.3);
    // 靴箱の上。ここに懐中電灯や鍵を置きます
    C.itemAt = [x1 - 0.6, z0 - 2.48];
    // 押し入れ
    C.pb(1.8, H, 0.5, mats.wood, x1 - 1.1, H / 2, z1 + 0.26);
    C.blk(x1 - 2.0, z1, x1 - 0.2, z1 + 0.5);
    // ちゃぶ台
    lowTable(C, dx, zMid - 1.4);
    C.detailAt = [x1 - 0.6, z0 - 2.0];
  },

  // 仏間
  butsudan(C) {
    const { mats, dx, x0, x1, z1, zMid, H } = C;
    // 仏壇（黒檀の箱に、内側だけ金色）
    C.pb(1.0, 1.55, 0.55, mats.darkwood, x0 + 0.8, 0.78, z1 + 0.35);
    C.blk(x0 + 0.25, z1, x0 + 1.35, z1 + 0.65);
    const inner = C.wall(0.72, 0.95, mats.gold, x0 + 0.8, 1.02, z1 + 0.63);
    inner.rotation.y = 0;
    // 位牌
    for (let i = 0; i < 5; i++) {
      C.pb(0.07, 0.24, 0.05, mats.darkwood, x0 + 0.48 + i * 0.16, 0.72, z1 + 0.6);
    }
    // 遺影
    C.wall(0.5, 0.62, mats.portrait, x0 + 0.8, 1.86, z1 + 0.05);
    // 座布団
    C.pb(0.6, 0.09, 0.6, mats.cushion, x0 + 0.8, 0.05, z1 + 1.3);
    C.pb(0.6, 0.09, 0.6, mats.cushion, x0 + 1.6, 0.05, z1 + 1.3);
    // 花立てと線香
    C.pb(0.09, 0.22, 0.09, mats.steel, x0 + 0.42, 0.98, z1 + 0.58);
    C.pb(0.09, 0.22, 0.09, mats.steel, x0 + 1.18, 0.98, z1 + 0.58);
    lowTable(C, dx + 0.9, zMid - 1.5);
    C.fx.push({ kind: "portrait", mesh: inner, x: x0 + 0.8, z: z1 + 0.6 });
    C.detailAt = [x0 + 0.8, z1 + 1.05];
  },

  // 引っ越しの途中
  boxes(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    const spots = [
      [x0 + 0.7, z1 + 0.6, 3], [x0 + 1.5, z1 + 0.7, 2], [x1 - 0.8, z1 + 0.9, 3],
      [dx, zMid - 1.2, 2], [x0 + 0.6, zMid - 2.2, 1], [x1 - 1.0, zMid - 2.4, 2],
    ];
    spots.forEach(([px, pz, n]) => {
      for (let i = 0; i < n; i++) {
        const s = 0.52 - i * 0.04;
        C.pb(s, 0.42, s, mats.cardboard, px + (Math.random() - 0.5) * 0.1, 0.21 + i * 0.42, pz, (Math.random() - 0.5) * 0.5);
      }
      C.blk(px - 0.32, pz - 0.32, px + 0.32, pz + 0.32);
    });
    C.detailAt = [x0 + 0.7, z1 + 1.25];
  },

  // 子ども部屋
  child(C) {
    const { mats, dx, x0, x1, z1, zMid, H } = C;
    // 学習机と椅子
    C.pb(1.15, 0.72, 0.6, mats.wood, x0 + 0.9, 0.36, z1 + 0.45);
    C.pb(1.15, 0.5, 0.28, mats.wood, x0 + 0.9, 1.15, z1 + 0.2);
    C.blk(x0 + 0.3, z1, x0 + 1.5, z1 + 0.8);
    C.pb(0.42, 0.06, 0.42, mats.wood, x0 + 0.9, 0.42, z1 + 1.0);
    C.pb(0.05, 0.4, 0.05, mats.wood, x0 + 0.75, 0.2, z1 + 1.0);
    // ランドセル
    C.pb(0.3, 0.36, 0.22, mats.satchel, x0 + 1.7, 0.18, z1 + 0.9);
    // 本棚
    C.pb(0.8, 1.5, 0.3, mats.wood, x1 - 0.5, 0.75, z1 + 0.3);
    C.blk(x1 - 0.9, z1, x1 - 0.1, z1 + 0.5);
    // 柱の傷
    for (let i = 0; i < 12; i++) {
      C.pb(0.16, 0.012, 0.012, mats.scar, x1 - 0.04, 0.62 + i * 0.11, zMid - 0.4);
    }
    // 落書き
    C.wall(1.5, 1.0, mats.scribble, dx, 0.85, z1 + 0.04);
    lowTable(C, dx + 0.4, zMid - 1.9);
    C.detailAt = [x1 - 0.55, zMid - 0.5];
  },

  // 空室
  empty(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    // 畳に焼きついた家財の跡
    const stain = (px, pz, w, d) => {
      const m = plane(w, d, mats.stain);
      m.rotation.x = -Math.PI / 2;
      m.position.set(px, 0.022, pz);
      C.g.add(m);
      return m;
    };
    stain(x0 + 1.0, z1 + 0.5, 1.6, 0.6);      // 箪笥
    stain(dx, zMid - 1.6, 1.0, 1.0);           // 卓袱台
    stain(x1 - 0.9, zMid - 2.4, 0.9, 0.5);
    // 人がひとり、ずっと座っていた形
    const sit = stain(x1 - 1.1, z1 + 1.1, 0.55, 0.75);
    sit.material = C.mats.stainDark;
    C.fx.push({ kind: "shape", mesh: sit, x: x1 - 1.1, z: z1 + 1.1 });
    C.detailAt = [x1 - 1.1, z1 + 1.75];
  },

  // ゴミ袋の山
  trash(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    for (let i = 0; i < 16; i++) {
      const px = x0 + 0.5 + Math.random() * (D.UNIT_W - 1.0);
      const pz = z1 + 0.4 + Math.random() * 2.4;
      const r = 0.24 + Math.random() * 0.16;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mats.bag);
      m.scale.set(1, 0.78, 1);
      m.position.set(px, r * 0.7, pz);
      C.g.add(m);
      if (i % 3 === 0) C.blk(px - r, pz - r, px + r, pz + r);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mats.bag);
    top.scale.set(1, 0.8, 1);
    top.position.set(dx, 0.72, z1 + 1.2);
    C.g.add(top);
    C.fx.push({ kind: "sink", mesh: top, y0: 0.72 });
    C.detailAt = [dx, z1 + 1.9];
  },

  // 水回り
  bath(C) {
    const { mats, dx, x0, x1, z1, zMid, H } = C;
    // 洗濯機
    C.pb(0.62, 0.92, 0.62, mats.appliance, x0 + 0.6, 0.46, zMid - 0.6);
    C.blk(x0 + 0.25, zMid - 0.95, x0 + 0.95, zMid - 0.25);
    // 洗面台と鏡
    C.pb(0.8, 0.8, 0.45, mats.porcelain, x1 - 0.6, 0.4, zMid - 0.6);
    C.blk(x1 - 1.0, zMid - 0.85, x1 - 0.2, zMid - 0.35);
    const mir = C.wall(0.55, 0.7, mats.mirror, x1 - 0.05, 1.45, zMid - 0.6, -Math.PI / 2);
    addGhost(C, mir, x1 - 0.12, 1.35, zMid - 0.6, -Math.PI / 2, 0.5, 1.0);
    // 共通の浴室を使うため、この型は脱衣所の生活感だけを足す。
    C.fx.push({ kind: "water", x: dx, z: z1 + 0.8 });
    C.detailAt = [dx, z1 + 0.85];
  },

  // 姿見
  mirrors(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    const specs = [
      [x0 + 0.12, 1.15, z1 + 1.4, Math.PI / 2, 0.75, 1.75],
      [x1 - 0.12, 1.15, z1 + 2.1, -Math.PI / 2, 0.75, 1.75],
      [dx + 0.9, 1.1, z1 + 0.08, 0, 0.7, 1.6],
    ];
    specs.forEach(([px, py, pz, ry, w, h]) => {
      // 壁から手前へ出す向き
      const nx = ry === 0 ? 0 : (ry > 0 ? 1 : -1);
      const nz = ry === 0 ? 1 : 0;
      // 枠（少し厚みを持たせると鏡に見えます）
      const fr = box(ry === 0 ? w + 0.11 : 0.07, h + 0.11, ry === 0 ? 0.07 : w + 0.11, mats.frame);
      fr.position.set(px + nx * 0.035, py, pz + nz * 0.035);
      C.g.add(fr);
      const m = C.wall(w, h, mats.mirror, px + nx * 0.075, py, pz + nz * 0.075, ry);
      addGhost(C, m, px + nx * 0.09, py - 0.10, pz + nz * 0.09, ry, w * 0.66, h * 0.80);
      C.blk(px - (ry === 0 ? w / 2 : 0.1), pz - (ry === 0 ? 0.1 : w / 2), px + (ry === 0 ? w / 2 : 0.1), pz + (ry === 0 ? 0.1 : w / 2));
    });
    lowTable(C, dx - 0.6, zMid - 1.8);
    C.detailAt = [x0 + 0.95, z1 + 1.4];
  },

  // 万年床
  futon(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    C.pb(1.15, 0.09, 1.95, mats.futon, dx - 0.5, 0.05, z1 + 1.3);
    const kake = C.pb(1.2, 0.16, 1.9, mats.futon2, dx - 0.5, 0.14, z1 + 1.3);
    C.pb(0.5, 0.13, 0.32, mats.pillow, dx - 0.5, 0.15, z1 + 2.15);
    C.blk(dx - 1.15, z1 + 0.3, dx + 0.15, z1 + 2.3);
    // ふくらみ
    const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), mats.futon2);
    bulge.scale.set(1.0, 0.42, 1.75);
    bulge.position.set(dx - 0.5, 0.16, z1 + 1.25);
    C.g.add(bulge);
    C.fx.push({ kind: "bulge", mesh: bulge, y0: 0.16 });
    // 小さなテレビと灰皿
    C.pb(0.5, 0.42, 0.42, mats.appliance, x1 - 0.5, 0.21, z1 + 0.4);
    C.pb(0.2, 0.05, 0.2, mats.porcelain, dx + 0.7, 0.03, z1 + 1.4);
    C.detailAt = [dx + 0.35, z1 + 1.3];
  },

  // 花
  flowers(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    // 棚
    C.pb(2.2, 0.06, 0.34, mats.wood, dx, 0.95, z1 + 0.2);
    C.pb(2.2, 0.06, 0.34, mats.wood, dx, 1.45, z1 + 0.2);
    C.blk(dx - 1.2, z1, dx + 1.2, z1 + 0.4);
    const vase = (px, py, pz, h, c) => {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, h, 10), c);
      v.position.set(px, py + h / 2, pz);
      C.g.add(v);
      // 枯れた茎
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 5), mats.driedStem);
        s.position.set(px + (Math.random() - 0.5) * 0.07, py + h + 0.16, pz + (Math.random() - 0.5) * 0.05);
        s.rotation.z = (Math.random() - 0.5) * 0.5;
        C.g.add(s);
      }
    };
    for (let i = 0; i < 5; i++) vase(dx - 0.9 + i * 0.45, 0.98, z1 + 0.2, 0.2, mats.porcelain);
    for (let i = 0; i < 4; i++) vase(dx - 0.7 + i * 0.45, 1.48, z1 + 0.2, 0.18, mats.porcelain);
    // 床の供花
    for (let i = 0; i < 4; i++) vase(x0 + 0.6 + i * 0.42, 0.02, z1 + 1.3, 0.22, mats.porcelain);
    lowTable(C, dx + 0.5, zMid - 1.7);
    C.detailAt = [dx, z1 + 0.95];
  },

  // 物置（奥へは行けない）
  storage(C) {
    const { mats, dx, x0, x1, z1, zMid, H } = C;
    // 積み上がった家財で、奥をふさぐ
    for (let i = 0; i < 9; i++) {
      const px = x0 + 0.5 + (i % 3) * 1.75;
      const py = 0.35 + Math.floor(i / 3) * 0.72;
      C.pb(1.5, 0.68, 0.55, i % 2 ? mats.wood : mats.cardboard, px, py, z1 + 1.05, (Math.random() - 0.5) * 0.12);
    }
    C.blk(x0, z1 + 0.6, x1, z1 + 1.5);
    // すきま
    const eyes = new THREE.Group();
    [-0.06, 0.06].forEach((o) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mats.eye);
      e.position.set(dx + o, 1.05, z1 + 0.72);
      eyes.add(e);
    });
    C.g.add(eyes);
    C.fx.push({ kind: "eyes", mesh: eyes, x: dx, z: z1 + 0.72 });
    lowTable(C, dx, zMid - 2.0);
    C.detailAt = [dx, z1 + 1.85];
  },

  // 管理人の詰所
  office(C) {
    const { mats, dx, x0, x1, z1, zMid, H } = C;
    C.pb(1.9, 1.85, 0.4, mats.appliance, x0 + 1.1, 0.93, z1 + 0.25);
    C.blk(x0 + 0.15, z1, x0 + 2.05, z1 + 0.5);
    // スチール机と椅子
    C.pb(1.3, 0.72, 0.65, mats.appliance, x1 - 0.9, 0.36, z1 + 1.1);
    C.blk(x1 - 1.6, z1 + 0.75, x1 - 0.2, z1 + 1.45);
    C.pb(0.42, 0.06, 0.42, mats.wood, x1 - 0.9, 0.45, z1 + 1.75);
    C.pb(0.05, 0.42, 0.05, mats.wood, x1 - 1.05, 0.22, z1 + 1.75);
    // 貼り紙
    C.wall(0.42, 0.52, mats.notice, x1 - 0.05, 1.6, z1 + 1.2, -Math.PI / 2);
    C.itemAt = [x0 + 1.1, z1 + 0.95];
    lowTable(C, dx, zMid - 1.4);
    C.detailAt = [x0 + 1.1, z1 + 0.95];
  },

  // テレビがついている
  tv(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    C.pb(0.9, 0.5, 0.42, mats.wood, dx, 0.25, z1 + 0.5);
    const body = C.pb(0.82, 0.68, 0.62, mats.appliance, dx, 0.84, z1 + 0.5);
    C.blk(dx - 0.5, z1 + 0.15, dx + 0.5, z1 + 0.85);
    const screen = C.wall(0.62, 0.48, mats.tvScreen, dx, 0.88, z1 + 0.82);
    const glow = new THREE.PointLight(0xaebfd0, 2.2, 4.5, 1.8);
    glow.position.set(dx, 0.95, z1 + 1.1);
    C.g.add(glow);
    C.fx.push({ kind: "static", mesh: screen, light: glow, x: dx, z: z1 + 1.0 });
    // 座布団と卓
    C.pb(0.6, 0.09, 0.6, mats.cushion, dx, 0.05, z1 + 2.0);
    lowTable(C, dx + 1.1, z1 + 2.0);
    C.detailAt = [dx, z1 + 1.5];
  },

  // ぬいぐるみ
  dolls(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    C.pb(2.3, 0.06, 0.3, mats.wood, dx, 0.85, z1 + 0.18);
    C.pb(2.3, 0.06, 0.3, mats.wood, dx, 1.32, z1 + 0.18);
    C.blk(dx - 1.2, z1, dx + 1.2, z1 + 0.35);
    const made = [];
    const doll = (px, py, facing) => {
      const grp = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mats.plush);
      b.scale.set(1, 1.15, 0.9); b.position.y = 0.1;
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mats.plush);
      h.position.y = 0.26;
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), mats.eye);
      e1.position.set(-0.028, 0.28, 0.068);
      const e2 = e1.clone(); e2.position.x = 0.028;
      grp.add(b, h, e1, e2);
      grp.position.set(px, py, z1 + 0.18);
      grp.rotation.y = facing ? 0 : Math.PI;   // ほとんどが壁を向いている
      C.g.add(grp);
      made.push(grp);
    };
    for (let i = 0; i < 5; i++) doll(dx - 0.9 + i * 0.45, 0.88, i === 3);
    for (let i = 0; i < 4; i++) doll(dx - 0.7 + i * 0.45, 1.35, false);
    C.fx.push({ kind: "turned", dolls: made, x: dx, z: z1 + 0.6 });
    // 学習机
    C.pb(1.0, 0.7, 0.55, mats.wood, x1 - 0.7, 0.35, zMid - 0.6);
    C.blk(x1 - 1.25, zMid - 0.9, x1 - 0.15, zMid - 0.3);
    C.detailAt = [dx, z1 + 1.0];
  },

  // 四〇四号室（母の手紙）
  letter(C) {
    const { mats, dx, x0, x1, z1, zMid } = C;
    // 文机の上に、封を切っていない手紙
    C.pb(0.95, 0.32, 0.5, mats.darkwood, dx, 0.16, zMid - 1.4);
    C.blk(dx - 0.55, zMid - 1.7, dx + 0.55, zMid - 1.1);
    C.memoAt = [dx, zMid - 1.4];
    C.pb(0.6, 0.09, 0.6, mats.cushion, dx, 0.05, zMid - 2.1);
    // 布団のふくらみ
    C.pb(1.15, 0.09, 1.9, mats.futon, x1 - 1.1, 0.05, z1 + 1.2);
    const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), mats.futon2);
    bulge.scale.set(1.0, 0.4, 1.7);
    bulge.position.set(x1 - 1.1, 0.15, z1 + 1.15);
    C.g.add(bulge);
    C.blk(x1 - 1.7, z1 + 0.25, x1 - 0.5, z1 + 2.15);
    C.fx.push({ kind: "bulge", mesh: bulge, y0: 0.15 });
    C.pb(1.8, C.H, 0.5, mats.wood, x0 + 1.1, C.H / 2, z1 + 0.26);
    C.blk(x0 + 0.2, z1, x0 + 2.0, z1 + 0.5);
    C.detailAt = [dx - 0.9, zMid - 1.6];
  },

  // 五〇四号室（自宅）
  home(C) {
    const { mats, dx, x0, x1, z1, zMid, H } = C;
    // 母の机（ノートが置いてある）
    C.pb(1.0, 0.7, 0.5, mats.wood, x0 + 1.0, 0.35, z1 + 0.8);
    C.blk(x0 + 0.4, z1 + 0.5, x0 + 1.6, z1 + 1.1);
    C.goalAt = [x0 + 1.0, z1 + 0.8];
    // 押し入れ・ちゃぶ台・座布団
    C.pb(1.8, H, 0.5, mats.wood, x1 - 1.1, H / 2, z1 + 0.26);
    C.blk(x1 - 2.0, z1, x1 - 0.2, z1 + 0.5);
    lowTable(C, dx, zMid - 1.5);
    C.pb(0.6, 0.09, 0.6, mats.cushion, dx - 0.75, 0.05, zMid - 1.5);
    // 灰皿の上の線香
    C.pb(0.18, 0.04, 0.18, mats.porcelain, dx + 0.3, 0.4, zMid - 1.5);
    C.detailAt = [dx + 0.55, zMid - 2.1];
  },
};

function lowTable(C, px, pz) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 16), C.mats.wood);
  t.position.set(px, 0.34, pz);
  C.g.add(t);
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8), C.mats.wood);
  l.position.set(px, 0.16, pz);
  C.g.add(l);
  C.blk(px - 0.52, pz - 0.52, px + 0.52, pz + 0.52);
}

// 鏡にうつるもの（ふだんは見えない）
function addGhost(C, mirror, px, py, pz, ry, w, h) {
  const m = plane(w, h, C.mats.ghost.clone());
  m.material.opacity = 0;
  m.material.transparent = true;
  m.position.set(px, py, pz);
  m.rotation.y = ry || 0;
  C.g.add(m);
  C.fx.push({ kind: "mirror", mesh: m, mirror, x: px, z: pz, t: 4 + Math.random() * 8 });
}

/* ---------- 階段室 ---------- */

function buildStair(g, col, inter, floorDef, mats, canDown) {
  const { STAIR_X0: x0, STAIR_X1: x1, STAIR_Z0: z0, STAIR_Z1: z1 } = D;
  const H = 2.9;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  const fl = plane(x1 - x0, z1 - z0, mats.fstair);
  fl.rotation.x = -Math.PI / 2;
  put(g, fl, cx, 0.01, cz);

  const cl = plane(x1 - x0, z1 - z0, mats.ceil);
  cl.rotation.x = Math.PI / 2;
  put(g, cl, cx, H, cz);

  const mk = (w, rotY, px, pz) => {
    const m = plane(w, H, mats.wall);
    m.rotation.y = rotY;
    put(g, m, px, H / 2, pz);
  };
  mk(z1 - z0, Math.PI / 2, x0, cz);
  mk(x1 - x0, 0, cx, z0);
  mk(x1 - x0, Math.PI, cx, z1);

  col.add(x0 - 0.2, z0 - 0.2, x0, z1 + 0.2, "stair");
  col.add(x0 - 0.2, z0 - 0.2, x1 + 0.2, z0, "stair");
  col.add(x0 - 0.2, z1, x1 + 0.2, z1 + 0.2, "stair");

  // 部屋の使いかた
  //   z が小さいほう … 上りの段
  //   まんなか　　　 … 踊り場（廊下への出入口はここ）
  //   z が大きいほう … 下りの段
  const SX0 = x0 + 0.7, SX1 = x1 - 1.25;     // 段の左右の端
  const rise = 0.185, run = 0.30;
  const upZ0 = z0 + 0.05, upZ1 = upZ0 + 1.25;
  const dnZ1 = z1 - 0.05, dnZ0 = dnZ1 - 1.25;

  // 上りの段（-x へ向かって上がる）
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const y = rise * (i + 1);
    const x = SX1 - 0.15 - i * run;
    put(g, box(run, 0.05, upZ1 - upZ0, mats.fstair), x, y - 0.025, (upZ0 + upZ1) / 2);
    put(g, box(0.05, rise, upZ1 - upZ0, mats.wall), x + run / 2, y - rise / 2, (upZ0 + upZ1) / 2);
  }
  col.add(SX0, upZ0 - 0.1, SX1, upZ1, "stair");
  // 段の脇の手すり
  const upRail = box((SX1 - SX0) * 1.02, 0.05, 0.05, mats.steel);
  upRail.rotation.z = Math.atan2(rise * steps, SX1 - SX0);
  put(g, upRail, (SX0 + SX1) / 2, 0.95 + (rise * steps) / 2, upZ1 + 0.06);

  // 下りの段（-x へ向かって下がる。穴は黒く塗って、奥行きを出します）
  const hole = plane(SX1 - SX0, dnZ1 - dnZ0, mats.blackhole);
  hole.rotation.x = -Math.PI / 2;
  put(g, hole, (SX0 + SX1) / 2, 0.015, (dnZ0 + dnZ1) / 2);
  for (let i = 0; i < 4; i++) {
    const y = -rise * i;
    const x = SX1 - 0.15 - i * run;
    put(g, box(run, 0.05, dnZ1 - dnZ0, mats.fstair), x, y - 0.025, (dnZ0 + dnZ1) / 2);
  }
  col.add(SX0, dnZ0, SX1, dnZ1 + 0.1, "stair");
  const dnRail = box((SX1 - SX0) * 1.02, 0.05, 0.05, mats.steel);
  put(g, dnRail, (SX0 + SX1) / 2, 0.98, dnZ0 - 0.06);
  put(g, box(0.05, 0.98, 0.05, mats.steel), SX1, 0.49, dnZ0 - 0.06);

  // 階数のプレート（廊下から入って、正面に見える位置）
  const pl = plane(0.5, 0.5, new THREE.MeshLambertMaterial({ map: TX.floorPlate(floorDef.n) }));
  pl.rotation.y = Math.PI / 2;
  put(g, pl, x0 + 0.04, 1.62, cz);

  // 裸電球
  const bulbOn = !floorDef.lightsOut && floorDef.stairTask !== "breaker";
  put(g, box(0.05, 0.22, 0.05, mats.steel), x1 - 1.5, H - 0.11, cz);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshBasicMaterial({ color: bulbOn ? 0xffe6b0 : 0x1a1815 })
  );
  put(g, bulb, x1 - 1.5, H - 0.26, cz);
  const bulbLight = new THREE.PointLight(0xffd9a0, bulbOn ? 6 : 0, 8, 1.7);
  bulbLight.position.set(x1 - 1.5, H - 0.3, cz);
  g.add(bulbLight);

  // 上る／下りる
  inter.push({
    x: (SX0 + SX1) / 2 + 0.6, y: 1.0, z: upZ1 + 0.15, r: 1.7,
    kind: "up", label: "上る",
  });
  if (canDown) {
    inter.push({
      x: (SX0 + SX1) / 2 + 0.6, y: 1.0, z: dnZ0 - 0.15, r: 1.7,
      kind: "down", label: "下りる",
    });
  }

  // 廊下へ出る鉄扉。はじめは開いています（閉めると、向こうから入って来られません）
  const SD_SHUT = -Math.PI / 2;          // 出入口をふさぐ角度
  const SD_OPEN = -Math.PI / 2 - 1.5;    // 階段室の側へ開いた角度
  const dm = new THREE.MeshLambertMaterial({ color: 0x4a504c });
  const door = box(1.0, D.DOOR_H, 0.07, dm);
  const pivot = new THREE.Group();
  pivot.position.set(x1, 0, cz - 0.9);
  door.position.set(0.5, D.DOOR_H / 2, 0);
  pivot.add(door);
  pivot.rotation.y = SD_OPEN;
  g.add(pivot);

  const sdoor = { pivot, open: true, col: null, cz, shut: SD_SHUT, opened: SD_OPEN };
  inter.push({
    x: x1 - 0.5, y: 1.1, z: cz - 0.45, r: 1.3,
    kind: "sdoor", sdoor, label: "扉を閉める",
  });

  // 扉のわきの壁（出入口の分だけ穴をあける）
  const upperH = H - D.DOOR_H;
  const up = plane(z1 - z0, upperH, mats.wall);
  up.rotation.y = -Math.PI / 2;
  put(g, up, x1, D.DOOR_H + upperH / 2, cz);
  const seg1 = plane(Math.abs((cz - 0.9) - z0), D.DOOR_H, mats.wall);
  seg1.rotation.y = -Math.PI / 2;
  put(g, seg1, x1, D.DOOR_H / 2, (z0 + (cz - 0.9)) / 2);
  const seg2 = plane(Math.abs(z1 - (cz + 0.1)), D.DOOR_H, mats.wall);
  seg2.rotation.y = -Math.PI / 2;
  put(g, seg2, x1, D.DOOR_H / 2, ((cz + 0.1) + z1) / 2);
  col.add(x1 - 0.06, z0, x1 + 0.06, cz - 0.9, "stair");
  col.add(x1 - 0.06, cz + 0.1, x1 + 0.06, z1, "stair");

  return {
    sdoor, bulb, bulbLight, cx, cz,
    spawn: V(x1 - 1.1, 0, cz - 0.3),
  };
}

/* ---------- 一階ぶん ---------- */

export function buildFloor(scene, floorDef, opt) {
  const o = opt || {};
  const lap = o.lap || 0;
  const lapDef = (floorDef.laps && floorDef.laps[Math.min(lap, floorDef.laps.length - 1)]) || null;
  const LEN = lapDef && lapDef.short ? 18 : (floorDef.len || D.CORR_LEN);

  const g = new THREE.Group();
  scene.add(g);
  const col = new Colliders();
  const inter = [];
  const lights = [];
  const doors = [];
  const fx = [];        // 部屋のしかけ（鏡・砂嵐・ふくらみ など）

  /* --- 材料 --- */
  const mats = {
    wall: lam({ map: TX.wallConcrete(4, 1) }),
    corr: lam({ map: TX.wallConcrete(Math.round(LEN / 3), 1) }),
    floor: lam({ map: TX.floorCorridor(Math.round(LEN / 3), 1) }),
    fstair: lam({ map: TX.floorStair(2, 2) }),
    ceil: lam({ map: TX.ceilingPaint(Math.round(LEN / 4), 1) }),
    steel: lam({ map: TX.paintedSteel(), color: 0x9aa0a0 }),
    darksteel: lam({ color: 0x34383a }),
    // 写実素材は室内だけに使い、廊下の既存の読みやすさと軽さは保つ。
    paper: lam({ map: generatedWall, color: 0xc1b6a3 }),
    tatami: lam({ map: generatedTatami, color: 0xb3ad91 }),
    tile: lam({ map: TX.tileWall(2, 2) }),
    wood: lam({ map: interiorTexture(2, 0), color: 0xb8a590 }),
    fusuma: lam({ color: 0xb8ad90 }),
    notebook: lam({ color: 0x2e3d5c }),
    night: lam({ color: 0x0a1020 }),
    blackhole: new THREE.MeshBasicMaterial({ color: 0x000000 }),

    /* --- 部屋ごとの家財 --- */
    wood_floor: lam({ map: TX.flooring(3, 3) }),
    bare_floor: lam({ map: TX.floorStair(2, 2), color: 0x8a8a86 }),
    darkwood: lam({ map: interiorTexture(2, 0), color: 0x776655 }),
    gold: lam({ color: 0x6b5a2a }),
    portrait: lam({ map: TX.portrait() }),
    cushion: lam({ color: 0x5a3f42 }),
    cardboard: lam({ map: interiorTexture(1, 1), color: 0xb39a78 }),
    appliance: lam({ map: interiorTexture(1, 0), color: 0xb3aea0 }),
    fridgeDoor: lam({ map: interiorTexture(1, 0), color: 0xc4ba9e }),
    fridgeInside: new THREE.MeshBasicMaterial({ color: 0xb8d4d0 }),
    satchel: lam({ color: 0x7a2028 }),
    scar: lam({ color: 0x2a2018 }),
    scribble: lam({ map: TX.scribble(), transparent: true }),
    stain: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.30, depthWrite: false }),
    stainDark: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
    bag: lam({ color: 0x22242a }),
    porcelain: lam({ map: interiorTexture(0, 0), color: 0xd0cbc0 }),
    kitchenSteel: lam({ map: interiorTexture(0, 1), color: 0xb2b0aa }),
    mirror: lam({ map: interiorTexture(2, 1), color: 0xa5aaa7 }),
    mirrorSmear: new THREE.MeshBasicMaterial({ map: TX.mirrorSmear(), transparent: true, depthWrite: false }),
    shade: lam({ color: 0xcdc6b2 }),
    cord: lam({ color: 0xb8b2a2 }),
    calendar: lam({ map: TX.calendar() }),
    plate: lam({ color: 0xd8d4c8 }),
    frame: lam({ color: 0x5a4530 }),
    curtain: lam({ color: 0x6e6656 }),
    newspaper: lam({ color: 0xbdb49c }),
    frostglass: lam({ color: 0x8f9aa0 }),
    rustedSteel: lam({ color: 0x4d4b46 }),
    drain: lam({ color: 0x242729 }),
    wetHair: new THREE.MeshBasicMaterial({ color: 0x07080a }),
    damp: new THREE.MeshBasicMaterial({ map: TX.dampStain(), transparent: true, opacity: 0.74, depthWrite: false }),
    driedStem: lam({ color: 0x4a4230 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xd8dcc8 }),
    plush: lam({ color: 0x8d6f52 }),
    tvScreen: new THREE.MeshBasicMaterial({ map: TX.tvStatic() }),
    notice: lam({ map: TX.poster(["住民各位", "夜間の物音について", "心当たりのある方は", "管理人室まで"]) }),
    envelope: lam({ color: 0xd8d2c0 }),
    letterPaper: lam({ color: 0xe6dfcc }),
    ink: new THREE.MeshBasicMaterial({ color: 0x39352f }),
    key: lam({ color: 0xb89442 }),
    keyTag: lam({ color: 0x6a1820 }),
    lens: new THREE.MeshBasicMaterial({ color: 0xdbe8dc }),
    switchMat: lam({ color: 0x781d22 }),
    futon: lam({ color: 0xa8a196 }),
    futon2: lam({ color: 0x7d7a72 }),
    pillow: lam({ color: 0xbdb6a8 }),
    ghost: new THREE.MeshBasicMaterial({ map: TX.figure(), transparent: true, opacity: 0, depthWrite: false }),
  };

  /* --- 廊下の床・天井 --- */
  const fl = plane(LEN, D.CORR_Z1, mats.floor);
  fl.rotation.x = -Math.PI / 2;
  put(g, fl, LEN / 2, 0, D.CORR_Z1 / 2);

  const cl = plane(LEN, D.CORR_Z1 + 0.4, mats.ceil);
  cl.rotation.x = Math.PI / 2;
  put(g, cl, LEN / 2, D.CEIL, D.CORR_Z1 / 2);

  /* --- 住戸側の壁（扉のところだけ穴をあける） --- */
  const units = (floorDef.units || []).slice(0, lapDef && lapDef.short ? 2 : 5);
  const gap = LEN / (units.length + 1);
  const doorX = units.map((_, i) => gap * (i + 1));

  let cursor = 0;
  const wallSeg = (xa, xb) => {
    if (xb - xa < 0.02) return;
    const m = plane(xb - xa, D.CEIL, mats.corr);
    put(g, m, (xa + xb) / 2, D.CEIL / 2, D.CORR_Z0);
    col.add(xa, D.CORR_Z0 - 0.12, xb, D.CORR_Z0 + 0.06, "wall");
  };
  doorX.forEach((dx) => {
    wallSeg(cursor, dx - D.DOOR_W / 2);
    // 扉の上の垂れ壁
    const lin = plane(D.DOOR_W, D.CEIL - D.DOOR_H, mats.corr);
    put(g, lin, dx, D.DOOR_H + (D.CEIL - D.DOOR_H) / 2, D.CORR_Z0);
    cursor = dx + D.DOOR_W / 2;
  });
  wallSeg(cursor, LEN);

  /* --- 突き当りの壁 --- */
  const endW = plane(D.CORR_Z1, D.CEIL, mats.wall);
  endW.rotation.y = -Math.PI / 2;
  put(g, endW, LEN, D.CEIL / 2, D.CORR_Z1 / 2);
  col.add(LEN, -0.2, LEN + 0.2, D.CORR_Z1 + 0.2, "wall");

  /* --- 手すり側（腰壁＋鉄の手すり＋外の夜） --- */
  const par = box(LEN, D.PARAPET, 0.16, mats.wall);
  put(g, par, LEN / 2, D.PARAPET / 2, D.CORR_Z1);
  col.add(0, D.CORR_Z1 - 0.1, LEN, D.CORR_Z1 + 0.1, "wall");

  const railTop = box(LEN, 0.05, 0.05, mats.steel);
  put(g, railTop, LEN / 2, D.RAIL, D.CORR_Z1);
  for (let x = 0.6; x < LEN; x += 1.2) {
    put(g, box(0.04, D.RAIL - D.PARAPET, 0.04, mats.steel), x, (D.RAIL + D.PARAPET) / 2, D.CORR_Z1);
  }
  // 天井と腰壁のあいだ、外の闇
  const outer = plane(LEN, D.CEIL - D.PARAPET, new THREE.MeshBasicMaterial({ color: 0x04060c }));
  outer.rotation.y = Math.PI;
  put(g, outer, LEN / 2, (D.CEIL + D.PARAPET) / 2, D.CORR_Z1 + 12);

  // 向かいの棟の窓明かり（ごくわずか）
  if (!floorDef.lightsOut) {
    const winMat = new THREE.MeshBasicMaterial({ color: 0x1a1f14 });
    for (let i = 0; i < 7; i++) {
      if (Math.random() < 0.5) continue;
      const w = plane(0.7, 0.5, winMat);
      w.rotation.y = Math.PI;
      put(g, w, 3 + i * 4.6, 1.5 + (i % 3) * 0.9, D.CORR_Z1 + 11.6);
    }
  }

  /* --- 扉 --- */
  units.forEach((u, i) => {
    const dx = doorX[i];
    const shownNo = lapDef && lapDef.doors ? lapDef.doors : u.no;
    const dmat = lam({ map: TX.doorSteel(shownNo) });
    const mesh = box(D.DOOR_W, D.DOOR_H, 0.07, dmat);
    // 蝶番で開くように、入れ物ごと回す
    const pivot = new THREE.Group();
    pivot.position.set(dx - D.DOOR_W / 2, 0, D.CORR_Z0 - 0.04);
    mesh.position.set(D.DOOR_W / 2, D.DOOR_H / 2, 0);
    pivot.add(mesh);
    g.add(pivot);

    const dcol = col.add(dx - D.DOOR_W / 2, D.CORR_Z0 - 0.1, dx + D.DOOR_W / 2, D.CORR_Z0 + 0.06, "door");

    const forced = lapDef && lapDef.open404 && i === 0;
    const canEnter = Boolean(u.enter) || forced;

    const rec = {
      no: shownNo, realNo: u.no, dx, pivot, mesh, col: dcol,
      open: false, canEnter, unit: u, forced, built: false,
    };
    doors.push(rec);

    inter.push({
      x: dx, y: 1.1, z: D.CORR_Z0 + 0.5, r: 1.25,
      kind: "door", door: rec, label: canEnter ? "開ける" : "調べる",
    });

    // 階へ着いた瞬間は全戸を閉め、扉の変化は歩き始めてから怪異として見せる。

    if (canEnter) {
      // 中身は、扉を開けたときにはじめて組み立てます（開けない部屋のぶんは作りません）
      const useUnit = forced ? { no: 404, enter: true, memo: "m5" } : u;
      const room = ROOMS[useUnit.no] || ROOMS[u.no] || { kind: "kitchen", floor: "tatami" };
      rec.room = room;
      rec.build = () => {
        if (rec.built) return;
        rec.built = true;
        rec.unitBounds = buildUnit(g, col, inter, useUnit, dx, mats, room, fx);
      };
    }
  });

  /* --- 照明器具 --- */
  const lightCount = Math.max(2, Math.round(LEN / 9));
  for (let i = 0; i < lightCount; i++) {
    const x = (LEN / lightCount) * (i + 0.5);
    const housing = box(1.15, 0.09, 0.22, new THREE.MeshBasicMaterial({ color: 0x0c0e0c }));
    put(g, housing, x, D.CEIL - 0.06, D.CORR_Z1 * 0.42);

    const dead = floorDef.lightsOut || (floorDef.flicker && i !== 1);
    const pl = new THREE.PointLight(0xbfd0c0, dead ? 0 : 11, 13, 1.6);
    pl.position.set(x, D.CEIL - 0.18, D.CORR_Z1 * 0.42);
    g.add(pl);

    const tube = plane(1.05, 0.16, new THREE.MeshBasicMaterial({ color: dead ? 0x121512 : 0xd8e6d8 }));
    tube.rotation.x = Math.PI / 2;
    put(g, tube, x, D.CEIL - 0.115, D.CORR_Z1 * 0.42);

    lights.push({ light: pl, tube, dead, base: 11, flicker: Boolean(floorDef.flicker) && i === 1, x });
  }

  /* --- 掲示板・郵便受け・落書き・分電盤 --- */
  if (floorDef.board) {
    const bd = plane(1.5, 1.1, new THREE.MeshLambertMaterial({ map: TX.noticeBoard(floorDef.board.lines) }));
    put(g, bd, 1.9, 1.45, D.CORR_Z0 + 0.05);
    put(g, box(1.62, 1.22, 0.07, mats.wood), 1.9, 1.45, D.CORR_Z0 + 0.01);
    inter.push({ x: 1.9, y: 1.45, z: D.CORR_Z0 + 0.6, r: 1.2, kind: "memo", id: floorDef.board.memo, label: "読む", once: true });
  }

  if (floorDef.post) {
    const bank = box(1.9, 0.95, 0.24, mats.steel);
    put(g, bank, 2.2, 1.25, D.CORR_Z0 + 0.14);
    col.add(1.25, D.CORR_Z0, 3.15, D.CORR_Z0 + 0.26, "prop");
    const slot = new THREE.MeshBasicMaterial({ color: 0x08090a });
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 5; c++) {
        const s = plane(0.3, 0.34, slot);
        put(g, s, 2.2 - 0.76 + c * 0.38, 1.0 + r * 0.42, D.CORR_Z0 + 0.27);
      }
    }
    inter.push({ x: 2.2, y: 1.2, z: D.CORR_Z0 + 0.8, r: 1.2, kind: "memo", id: floorDef.post.memo, label: "覗く", once: true });
  }

  if (floorDef.graffiti && !(lapDef && lapDef.short)) {
    const gx = LEN * 0.55;
    const gm = plane(2.0, 1.0, new THREE.MeshLambertMaterial({
      map: TX.graffiti("４かいは かえれない"), transparent: true,
    }));
    put(g, gm, gx, 0.85, D.CORR_Z0 + 0.05);
    inter.push({ x: gx, y: 0.85, z: D.CORR_Z0 + 0.6, r: 1.2, kind: "memo", id: floorDef.graffiti.memo, label: "読む", once: true });
  }

  if (floorDef.stairTask === "breaker") {
    const bxm = box(0.5, 0.7, 0.22, mats.steel);
    put(g, bxm, LEN - 0.9, 1.35, D.CORR_Z0 + 0.13);
    col.add(LEN - 1.2, D.CORR_Z0, LEN - 0.6, D.CORR_Z0 + 0.25, "prop");
    inter.push({ x: LEN - 0.9, y: 1.35, z: D.CORR_Z0 + 0.7, r: 1.2, kind: "breaker", label: "開ける" });
  }

  /* --- 階段室 --- */
  const stair = buildStair(g, col, inter, floorDef, mats, floorDef.n > 1 || o.canExit);

  /* --- 空気（霧と弱い環境光） --- */
  return {
    group: g, col, inter, lights, doors, mats, stair, fx,
    len: LEN, lap, lapDef,
    spawn: stair.spawn.clone(),
  };
}

/* ---------- 追跡者 ---------- */

/* ---------- 引きずる裾 ---------- */
//  真円で床に接していると「置物」に見えるので、房ごとに長さと高さを変え、
//  さらに毎フレーム揺らして、進む向きの後ろへ流れるようにします。

const HEM_N = 26;

function buildHem(mat, r0, y0) {
  const base = [];
  for (let i = 0; i < HEM_N; i++) {
    base.push({
      r: 0.30 + Math.random() * 0.24,        // 広がりの深さ
      y: Math.random() * Math.random() * 0.11, // ほとんどは床すれすれ、たまに浮く
      ph: Math.random() * 6.283,             // 揺れの位相
      sp: 0.5 + Math.random() * 1.3,         // 揺れの速さ
    });
  }
  const pos = new Float32Array(HEM_N * 2 * 3);
  const idx = [];
  for (let i = 0; i < HEM_N; i++) {
    const j = (i + 1) % HEM_N;
    idx.push(i * 2, i * 2 + 1, j * 2 + 1, i * 2, j * 2 + 1, j * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, mat);
  m.userData = { base, pos, geo, r0, y0 };
  animateHem(m, 0, 0);
  return m;
}

function animateHem(mesh, t, drag) {
  const u = mesh.userData, p = u.pos;
  for (let i = 0; i < HEM_N; i++) {
    const a = (i / HEM_N) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    // 内側（腰のところ）は動かさない
    p[i * 6] = c * u.r0; p[i * 6 + 1] = u.y0; p[i * 6 + 2] = s * u.r0;
    // 外側（床のあたり）
    const b = u.base[i];
    const w = Math.sin(t * b.sp + b.ph);
    const front = s * drag;                    // 進む向き＝手前(+z)
    const r = Math.max(0.16, b.r + w * 0.038 - front * 0.09);
    const y = Math.max(0, b.y + w * 0.022 - front * 0.03);
    p[i * 6 + 3] = c * r; p[i * 6 + 4] = y; p[i * 6 + 5] = s * r;
  }
  u.geo.attributes.position.needsUpdate = true;
  u.geo.computeVertexNormals();
}

// 裾と同じ形の、平たい影
function buildBlob(mat, base, scale) {
  const pos = new Float32Array((HEM_N + 1) * 3);
  const idx = [];
  for (let i = 0; i < HEM_N; i++) {
    const a = (i / HEM_N) * Math.PI * 2;
    pos[(i + 1) * 3] = Math.cos(a) * base[i].r * scale;
    pos[(i + 1) * 3 + 2] = Math.sin(a) * base[i].r * scale;
    idx.push(0, i + 1, ((i + 1) % HEM_N) + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = 0;
  return m;
}

//  背が高く、細く、足が見えない。裾を引きずって滑るように寄ってくる。
//  顔はほとんど髪で隠れていて、光が当たったときだけ見える。
export function buildEntity() {
  const g = new THREE.Group();
  const H = 1.92;                 // 見上げる高さ

  const cloth = new THREE.MeshLambertMaterial({ map: TX.shroud(), color: 0xe8e8f0 });
  const clothDark = new THREE.MeshLambertMaterial({ color: 0x131318 });
  // 懐中電灯を至近で当てても白く飛ばない暗さにする。顔は下の絵で見せる
  const skin = new THREE.MeshLambertMaterial({ color: 0x171512 });   // 頭は暗く。顔は下の絵で見せる
  const pale = new THREE.MeshLambertMaterial({ color: 0x857f74 });

  // 胴。肩から裾へ、まっすぐ広がる長い衣
  // 胴。裾は床まで下ろさず、下は別に作った不規則な裾でつなぐ
  const prof = [
    [0.335, 0.20], [0.315, 0.40], [0.285, 0.66],
    [0.235, 1.00], [0.205, 1.22], [0.225, 1.36], [0.215, 1.48],
    [0.155, 1.58], [0.075, 1.64],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, HEM_N), cloth);
  g.add(body);

  // 裾。円ではなく、房ごとに長さも高さも違う。歩くと後ろへ流れる
  const hem = buildHem(clothDark, 0.335, 0.20);
  g.add(hem);

  // 床の影。これも円にしない
  const shadow = buildBlob(new THREE.MeshBasicMaterial({ color: 0x000000 }), hem.userData.base, 0.86);
  shadow.position.y = 0.011;
  g.add(shadow);

  // 肩から先。腕は長すぎて、膝の下まで垂れている
  const arms = [];
  [-1, 1].forEach((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.20, 1.50, 0.02);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.52, 3, 7), cloth);
    upper.position.y = -0.28;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.46, 3, 7), cloth);
    fore.position.y = -0.76;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 7), pale);
    hand.scale.set(0.7, 1.7, 0.45);
    hand.position.y = -1.03;
    pivot.add(upper, fore, hand);
    g.add(pivot);
    arms.push(pivot);
  });


  // 首と頭
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.12, 8), skin);
  neck.position.y = 1.665;
  g.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.795;
  g.add(headPivot);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.137, 16, 14), skin);
  skull.scale.set(1.02, 1.28, 0.90);
  headPivot.add(skull);

  // 顔。暗くても、うっすら見えるように光らせておく
  const faceMat = new THREE.MeshBasicMaterial({
    map: TX.face(), transparent: true, opacity: 0.95, depthWrite: false,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.285, 0.375), faceMat);
  face.position.set(0, -0.045, 0.171);
  // 新しい全身素材の顔と二重に表示されていた旧Canvas顔は描画しない。
  // マテリアル自体は互換性のため残し、既存の演出コードが参照しても壊れないようにする。
  face.visible = false;
  headPivot.add(face);

  // 髪。頭から胸の下まで、房になって垂れる
  const hairMat = new THREE.MeshLambertMaterial({
    map: TX.hair(), color: 0x32323b, transparent: true, side: THREE.FrontSide, depthWrite: false,
  });
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.158, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.92), hairMat);
  hairTop.scale.set(1.02, 1.22, 1.02);
  headPivot.add(hairTop);

  const veil = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.22, 0.88, 18, 1, true), hairMat);
  veil.position.y = -0.50;
  headPivot.add(veil);

  // 前髪。顔をほとんど覆う
  // 顔の前に垂れる髪。これがないと、顔がお面に見えてしまう
  const bangMat = new THREE.MeshLambertMaterial({
    map: TX.hairFront(), color: 0x4a4a55, transparent: true, side: THREE.FrontSide, depthWrite: false,
  });
  const bang = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.98), bangMat);
  bang.position.set(0, -0.295, 0.176);
  // 写実素材の濡れ髪を使うため、四角い輪郭が出る旧前髪は影としても表示しない。
  bang.visible = false;
  headPivot.add(bang);

  // 生成画像へ切り替えたあとも旧立体モデルが背後で描画され、透明部分や横から
  // 古い胴体・頭髪がはみ出していた。影と当たり判定は別なので、旧外観だけを止める。
  body.visible = false;
  hem.visible = false;
  neck.visible = false;
  headPivot.visible = false;
  arms.forEach((arm) => { arm.visible = false; });

  // 当たり判定はキャラクター位置から計算されるため、外観は生成画像だけで見せる。
  // 顔が髪で隠れない全身素材なので、遠距離は人影、近距離は異様な表情として読める。
  const photoMat = new THREE.MeshBasicMaterial({
    map: generatedEntity, transparent: true, alphaTest: 0.045,
    // 黒背景は加算合成では光を足さないため消え、肌と衣服の細部だけを立体へ重ねられる。
    depthWrite: false, side: THREE.DoubleSide, color: 0x737b80,
    opacity: 0.88, blending: THREE.AdditiveBlending,
  });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.28, H), photoMat);
  // 胴体より手前へ出し、立体が写真面を突き抜けて胸元に穴のような形を作らないようにする。
  photo.position.set(0, H / 2, 0.39);
  g.add(photo);

  // この一体だけ、別の層で照らす（懐中電灯で白飛びさせないため）
  g.traverse((o) => o.layers.set(1));

  g.userData = {
    body, hem, shadow, arms, headPivot, face: faceMat, veil, photo,
    phase: Math.random() * 6, twitch: 2 + Math.random() * 4, tilt: 0, H,
    hemT: Math.random() * 10,
  };
  return g;
}

/* ---------- 友達（住人）の姿 ---------- */
//  暗い廊下でも、味方だと分かるように名札と懐中電灯の光を持たせます。

export function buildSurvivor(name) {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: 0x3d4654 });
  const skin = new THREE.MeshLambertMaterial({ color: 0x6d6259 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.62, 4, 10), coat);
  body.position.y = 1.02;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), skin);
  head.position.y = 1.55;
  g.add(head);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 3, 8), coat);
  legs.position.y = 0.36;
  g.add(legs);

  // 名札。いつもこちらを向く
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.nameTag(name), transparent: true, depthTest: false, depthWrite: false,
  }));
  tag.scale.set(1.1, 0.28, 1);
  tag.position.y = 1.92;
  g.add(tag);

  // その人の懐中電灯（遠くからでも位置が分かる）
  const torch = new THREE.PointLight(0xffe6bb, 3.0, 6.0, 1.7);
  torch.position.set(0, 1.4, 0.25);
  g.add(torch);

  g.userData = {
    body, head, legs, tag, torch,
    setHeld(held, out) {
      const s = held ? 0.55 : 1;
      body.scale.y = s; legs.scale.y = s;
      head.position.y = held ? 1.05 : 1.55;
      tag.position.y = held ? 1.35 : 1.92;
      coat.color.setHex(held ? 0x5a3f42 : 0x3d4654);
      torch.intensity = out ? 0 : held ? 0.6 : 3.0;
      g.visible = !out;
    },
  };
  return g;
}

export function animateEntity(ent, dt, moving) {
  const u = ent.userData;
  u.phase += dt * (moving ? 2.6 : 0.8);

  // 足を動かさない。裾ごと、すべるように運ぶ
  const s = Math.sin(u.phase);
  ent.position.y = Math.abs(Math.sin(u.phase * 1.7)) * (moving ? 0.022 : 0.006);
  u.body.rotation.z = s * (moving ? 0.022 : 0.006);
  // 写実素材にも呼吸のような微動だけを与え、板絵に見える静止感を弱める。
  u.photo.rotation.z = s * (moving ? 0.012 : 0.003);
  u.photo.scale.x = 1 + Math.sin(u.phase * 0.53) * 0.006;

  // 裾。歩いているときほど後ろへ流れ、房ごとにばらばらに揺れる
  u.hemT += dt * (moving ? 2.4 : 0.9);
  animateHem(u.hem, u.hemT, moving ? 1 : 0.18);

  // 腕は、ゆっくり前後に振れるだけ
  u.arms[0].rotation.x = s * (moving ? 0.16 : 0.03);
  u.arms[1].rotation.x = -s * (moving ? 0.16 : 0.03);
  u.arms[0].rotation.z = 0.05 + s * 0.02;
  u.arms[1].rotation.z = -0.05 - s * 0.02;

  // 首は、たまに変な角度へ「かくん」と落ちる
  u.twitch -= dt;
  if (u.twitch <= 0) {
    u.twitch = 3 + Math.random() * 7;
    u.tilt = (Math.random() - 0.5) * 1.15;
  }
  u.headPivot.rotation.z += (u.tilt - u.headPivot.rotation.z) * Math.min(1, dt * 14);
  u.headPivot.rotation.x = Math.sin(u.phase * 0.37) * 0.06;

  // 髪の房が、わずかに遅れて揺れる
  u.veil.rotation.z = -u.headPivot.rotation.z * 0.35 + s * 0.03;
}

/* ---------- 片づけ ---------- */

export function disposeFloor(scene, floor) {
  if (!floor) return;
  scene.remove(floor.group);
  floor.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach((m) => m.dispose());
    }
  });
}
