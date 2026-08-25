// ============================================================
//  四号棟の組み立て
//   ・団地の外廊下は「片側に住戸の扉、片側に手すりと夜」
//   ・階段室は左端に一つだけ。各階、行って戻ってくることになる。
//   ・当たり判定は上から見た四角（AABB）の集まりで持ちます。
// ============================================================
import * as THREE from "../lib/three.module.js";
import * as TX from "./textures.js";

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

function buildUnit(g, col, inter, unit, dx, mats) {
  const z0 = -0.16, z1 = z0 - D.UNIT_D;
  const x0 = dx - D.UNIT_W / 2, x1 = dx + D.UNIT_W / 2;
  const H = 2.3;

  // 床（手前＝台所のタイル、奥＝畳）
  const zMid = z0 - 3.1;
  const f1 = plane(D.UNIT_W, z0 - zMid, mats.tile);
  f1.rotation.x = -Math.PI / 2;
  put(g, f1, dx, 0.01, (z0 + zMid) / 2);
  const f2 = plane(D.UNIT_W, zMid - z1, mats.tatami);
  f2.rotation.x = -Math.PI / 2;
  put(g, f2, dx, 0.01, (zMid + z1) / 2);

  // 天井
  const cl = plane(D.UNIT_W, D.UNIT_D, mats.ceil);
  cl.rotation.x = Math.PI / 2;
  put(g, cl, dx, H, (z0 + z1) / 2);

  // 壁 4枚（内向き）
  const mk = (w, rotY, px, pz) => {
    const m = plane(w, H, mats.paper);
    m.rotation.y = rotY;
    put(g, m, px, H / 2, pz);
  };
  mk(D.UNIT_D, Math.PI / 2, x0, (z0 + z1) / 2);          // 左
  mk(D.UNIT_D, -Math.PI / 2, x1, (z0 + z1) / 2);         // 右
  mk(D.UNIT_W, 0, dx, z1);                                // 奥
  // 手前の壁（廊下側）は玄関の穴をあけて2枚
  const sideW = (D.UNIT_W - D.DOOR_W) / 2;
  const bk = (w, px) => {
    const m = plane(w, H, mats.paper);
    m.rotation.y = Math.PI;
    put(g, m, px, H / 2, z0);
  };
  bk(sideW, x0 + sideW / 2);
  bk(sideW, x1 - sideW / 2);
  // 玄関の上の壁（垂れ壁）
  const lint = plane(D.DOOR_W, H - D.DOOR_H, mats.paper);
  lint.rotation.y = Math.PI;
  put(g, lint, dx, D.DOOR_H + (H - D.DOOR_H) / 2, z0);

  // 外壁の当たり判定
  col.add(x0 - 0.1, z1 - 0.1, x0, z0, "unit");
  col.add(x1, z1 - 0.1, x1 + 0.1, z0, "unit");
  col.add(x0 - 0.1, z1 - 0.1, x1 + 0.1, z1, "unit");
  col.add(x0 - 0.1, z0, x0 + sideW, z0 + 0.1, "unit");
  col.add(x1 - sideW, z0, x1 + 0.1, z0 + 0.1, "unit");

  // 仕切り（襖）——真ん中に通り抜けの穴
  const pw = (D.UNIT_W - 1.1) / 2;
  [[x0 + pw / 2, pw], [x1 - pw / 2, pw]].forEach(([px, w]) => {
    const m = box(w, H, 0.08, mats.fusuma);
    put(g, m, px, H / 2, zMid);
    col.add(px - w / 2, zMid - 0.06, px + w / 2, zMid + 0.06, "unit");
  });

  // 台所の流し
  const sink = box(1.7, 0.85, 0.6, mats.steel);
  put(g, sink, x0 + 1.0, 0.43, z0 - 0.9);
  col.add(x0 + 0.15, z0 - 1.2, x0 + 1.85, z0 - 0.6, "prop");

  // 吊り戸棚
  put(g, box(1.7, 0.6, 0.35, mats.wood), x0 + 1.0, 1.72, z0 - 0.75);

  // 押し入れ
  const oshi = box(1.8, H, 0.5, mats.wood);
  put(g, oshi, x1 - 1.1, H / 2, z1 + 0.26);
  col.add(x1 - 2.0, z1, x1 - 0.2, z1 + 0.5, "prop");

  // ちゃぶ台
  const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 16), mats.wood);
  put(g, tbl, dx, 0.34, zMid - 1.5);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8), mats.wood);
  put(g, leg, dx, 0.16, zMid - 1.5);
  col.add(dx - 0.55, zMid - 2.05, dx + 0.55, zMid - 0.95, "prop");

  // 奥の窓（外の夜）
  const win = plane(1.6, 1.1, mats.night);
  put(g, win, dx, 1.45, z1 + 0.03);
  put(g, box(1.72, 0.06, 0.06, mats.steel), dx, 2.02, z1 + 0.06);
  put(g, box(0.06, 1.16, 0.06, mats.steel), dx, 1.45, z1 + 0.06);

  // 中にあるもの
  if (unit.item) {
    inter.push({
      x: x0 + 1.0, y: 0.95, z: z0 - 0.9, r: 1.15,
      kind: "item", id: unit.item, label: "調べる", once: true, note: unit.note,
    });
  }
  // 目的の品がある部屋では、そちらが本体なので、ちゃぶ台には置きません
  if (unit.memo && !unit.goal) {
    inter.push({
      x: dx, y: 0.5, z: zMid - 1.5, r: 1.2,
      kind: "memo", id: unit.memo, label: "読む", once: true,
    });
  }
  if (unit.goal) {
    // 机の上のノート
    const desk = box(1.0, 0.7, 0.5, mats.wood);
    put(g, desk, x0 + 1.0, 0.35, z1 + 0.8);
    col.add(x0 + 0.4, z1 + 0.5, x0 + 1.6, z1 + 1.1, "prop");
    const nb = box(0.22, 0.04, 0.3, mats.notebook);
    put(g, nb, x0 + 1.0, 0.73, z1 + 0.8);
    nb.rotation.y = 0.2;
    inter.push({
      x: x0 + 1.0, y: 0.8, z: z1 + 1.1, r: 1.1,
      kind: "goal", id: unit.memo || "m6", label: "手に取る", once: true,
    });
  }

  return { x0, x1, z0, z1, dx };
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

  /* --- 材料 --- */
  const mats = {
    wall: lam({ map: TX.wallConcrete(4, 1) }),
    corr: lam({ map: TX.wallConcrete(Math.round(LEN / 3), 1) }),
    floor: lam({ map: TX.floorCorridor(Math.round(LEN / 3), 1) }),
    fstair: lam({ map: TX.floorStair(2, 2) }),
    ceil: lam({ map: TX.ceilingPaint(Math.round(LEN / 4), 1) }),
    steel: lam({ map: TX.paintedSteel(), color: 0x9aa0a0 }),
    paper: lam({ map: TX.wallpaper(2, 1) }),
    tatami: lam({ map: TX.tatami(2, 2) }),
    tile: lam({ map: TX.tileWall(2, 2) }),
    wood: lam({ color: 0x6a5138 }),
    fusuma: lam({ color: 0xb8ad90 }),
    notebook: lam({ color: 0x2e3d5c }),
    night: lam({ color: 0x0a1020 }),
    blackhole: new THREE.MeshBasicMaterial({ color: 0x000000 }),
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
      open: false, canEnter, unit: u, forced,
    };
    doors.push(rec);

    inter.push({
      x: dx, y: 1.1, z: D.CORR_Z0 + 0.5, r: 1.25,
      kind: "door", door: rec, label: canEnter ? "開ける" : "調べる",
    });

    if (canEnter) {
      const useUnit = forced ? { no: 404, enter: true, memo: "m5" } : u;
      const b = buildUnit(g, col, inter, useUnit, dx, mats);
      rec.unitBounds = b;
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
    group: g, col, inter, lights, doors, mats, stair,
    len: LEN, lap, lapDef,
    spawn: stair.spawn.clone(),
  };
}

/* ---------- 追跡者 ---------- */

export function buildEntity() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x07080a });
  const darker = new THREE.MeshLambertMaterial({ color: 0x030405 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.62, 4, 10), dark);
  torso.position.y = 1.16;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), darker);
  head.position.y = 1.66;
  head.scale.set(1, 1.22, 0.9);
  g.add(head);

  const limbs = [];
  const mkLimb = (x, y, len, r) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), dark);
    m.position.set(x, y, 0);
    g.add(m);
    limbs.push(m);
    return m;
  };
  const armL = mkLimb(-0.26, 1.02, 0.66, 0.055);
  const armR = mkLimb(0.26, 1.02, 0.66, 0.055);
  const legL = mkLimb(-0.11, 0.42, 0.74, 0.07);
  const legR = mkLimb(0.11, 0.42, 0.74, 0.07);

  // 髪のような、輪郭をぼかすもの
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.55, 10, 1, true), darker);
  hair.position.set(0, 1.52, 0.02);
  g.add(hair);

  g.userData = { torso, head, armL, armR, legL, legR, hair, phase: 0 };
  return g;
}

export function animateEntity(ent, dt, moving) {
  const u = ent.userData;
  u.phase += dt * (moving ? 6.2 : 1.1);
  const s = Math.sin(u.phase);
  u.legL.rotation.x = s * (moving ? 0.55 : 0.03);
  u.legR.rotation.x = -s * (moving ? 0.55 : 0.03);
  u.armL.rotation.x = -s * (moving ? 0.35 : 0.05);
  u.armR.rotation.x = s * (moving ? 0.35 : 0.05);
  u.head.rotation.z = Math.sin(u.phase * 0.31) * 0.08;
  u.torso.position.y = 1.16 + Math.abs(s) * (moving ? 0.025 : 0.006);
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
