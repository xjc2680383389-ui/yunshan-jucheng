// 构件体素模型（纯逻辑，node 可跑）：每种构件一个砌筑函数，0.4m 体素（灯杆 0.2m）。
// bake 输出面片（仅外露面 + 顶点色），发光体素分桶：0=不发光 1=窗 2=灯笼。
// 供 render/buildings.js 建 InstancedMesh 与 selftest 统计三角形。
import { PAL } from './consts.js';

const S = 0.4;   // 建筑体素边长
const SL = 0.2;  // 灯杆体素边长

class B {
  constructor(s) { this.s = s; this.m = new Map(); }
  // 键编码需容负 y（吊脚楼腿）：x∈[-64,191], y∈[-128,127], z∈[-64,191]
  k(x, y, z) { return ((x + 64) * 256 + (y + 128)) * 256 + (z + 64); }
  dec(key) {
    const z = (key % 256) - 64;
    const r = Math.floor(key / 256);
    const y = (r % 256) - 128;
    return [Math.floor(r / 256) - 64, y, z];
  }
  set(x, y, z, col, glow = 0) { this.m.set(this.k(x, y, z), glow * 0x1000000 + (col & 0xffffff)); }
  get(x, y, z) { const v = this.m.get(this.k(x, y, z)); return v === undefined ? -1 : v; }
  box(x0, y0, z0, x1, y1, z1, col, glow = 0) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) this.set(x, y, z, col, glow);
  }
}

// 6 向外露面：角点模板（体素格坐标，原点=体素最小角）
const FACES = [
  { n: [1, 0, 0], c: [[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]] },
  { n: [-1, 0, 0], c: [[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
];

function mkBucket() { return { pos: [], col: [], nrm: [], idx: [] }; }
function emit(bucket, vx, vy, vz, s, f, col) {
  const v0 = bucket.pos.length / 3;
  for (const c of f.c) bucket.pos.push((vx + c[0]) * s, (vy + c[1]) * s, (vz + c[2]) * s);
  for (let i = 0; i < 4; i++) { bucket.nrm.push(f.n[0], f.n[1], f.n[2]); bucket.col.push(col[0], col[1], col[2]); }
  bucket.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
}
const rgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];

// 烘焙：返回 {opaque, win, lantern} 各 {pos,col,nrm,idx}
export function bake(b) {
  const buckets = [mkBucket(), mkBucket(), mkBucket()];
  const white = [1, 1, 1];
  for (const [key, v] of b.m) {
    const [x, y, z] = b.dec(key);
    const glow = Math.floor(v / 0x1000000), col = rgb(v & 0xffffff);
    const bk = buckets[glow];
    const useCol = glow ? white : col;
    for (const f of FACES) {
      if (b.get(x + f.n[0], y + f.n[1], z + f.n[2]) !== -1) continue;
      emit(bk, x, y, z, b.s, f, useCol);
    }
  }
  return { opaque: buckets[0], win: buckets[1], lantern: buckets[2] };
}

// ---------- 砌筑辅助 ----------
// 双坡屋顶（屋脊沿 X）：z 宽 zw 格，从 yBase 每两行升高 1 格，出挑 ov 格，脊端上翘 1 格
function gable(b, x0, x1, z0, z1, yBase, tile, ridge) {
  const cz = (z0 + z1) / 2;
  const halfW = (x1 - x0) / 2;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const rise = Math.floor((halfW - Math.abs(x - cz)) / 3);
      const y = yBase + rise;
      b.set(x, y, z, tile);
      if (Math.abs(x - cz) > halfW - 1) b.set(x, y, z, PAL.eave >>> 0 ? (PAL.eave) : tile); // 檐口深色
    }
  }
  // 屋脊
  const yr = yBase + Math.floor(halfW / 3);
  for (let x = x0; x <= x1; x++) b.set(x, yr + 1, Math.round(cz), ridge);
  b.set(x0, yr + 2, Math.round(cz), ridge);   // 脊端微翘
  b.set(x1, yr + 2, Math.round(cz), ridge);
}

// 墙体带柱：周圈每 step 格一根暗红柱，其余米白
function wallsWithCols(b, x0, x1, z0, z1, y0, y1, step = 3) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const onX = x === x0 || x === x1, onZ = z === z0 || z === z1;
        if (!onX && !onZ) continue;
        const isCol = (onX && ((z - z0) % step === 0 || z === z1)) || (onZ && ((x - x0) % step === 0 || x === x1));
        b.set(x, y, z, isCol ? PAL.woodDark : PAL.wall);
      }
    }
  }
}

// 前脸（z=z0）开窗带：每 step 一扇，y 范围 glow
function windows(b, x0, x1, z, y0, y1, step = 4, glow = 1) {
  for (let x = x0 + 2; x <= x1 - 2; x += step) b.box(x, y0, z, x + 1, y1, z, PAL.winDay, glow);
}

// 四坡攒尖顶（方形逐层收分）
function pyramid(b, x0, x1, z0, z1, yBase, tile, gold) {
  let x0c = x0, x1c = x1, z0c = z0, z1c = z1, y = yBase;
  while (x1c - x0c >= 0 && z1c - z0c >= 0) {
    b.box(x0c, y, z0c, x1c, y, z1c, tile);
    x0c++; x1c--; z0c++; z1c--; y++;
  }
  b.box((x0 + x1) >> 1, y, (z0 + z1) >> 1, (x0 + x1) >> 1, y + 1, (z0 + z1) >> 1, gold); // 宝顶
}

// ---------- 各构件 ----------
// 民居 12×10×6
function buildHouse(b) {
  b.box(0, 0, 0, 29, 1, 24, PAL.pave);                    // 台基 0.8m
  wallsWithCols(b, 2, 27, 1, 23, 2, 9);                   // 墙柱圈 3.2m
  b.box(13, 2, 1, 16, 8, 1, PAL.woodDark);                // 前门
  windows(b, 2, 27, 23, 4, 6);
  windows(b, 2, 27, 1, 4, 6);
  gable(b, 0, 29, -1, 25, 10, PAL.tile, PAL.eave);        // 屋顶出挑
}

// 铺面/酒旗楼 10×8×9（两层，敞门，布幌）
function buildShop(b) {
  b.box(0, 0, 0, 24, 1, 19, PAL.pave);
  // 一层：临街敞开（前墙只在角上设柱）
  for (let x = 0; x <= 24; x++) for (let y = 2; y <= 7; y++) {
    const corner = (x < 3 || x > 21);
    if (corner) b.set(x, y, 0, PAL.red);
    if (x === 0 || x === 24 || !corner) b.set(x, y, 19, PAL.wall);
  }
  for (let y = 2; y <= 7; y++) { b.set(0, y, 0, PAL.red); b.set(24, y, 0, PAL.red); }
  b.box(0, 8, 0, 24, 8, 19, PAL.woodDark);                // 楼板
  wallsWithCols(b, 0, 24, 0, 19, 9, 15, 4);
  windows(b, 0, 24, 0, 10, 13, 4);
  windows(b, 0, 24, 19, 10, 13, 4);
  gable(b, -1, 25, -1, 20, 16, PAL.tile, PAL.eave);
  // 酒旗：前角旗杆 + 红白布幌
  b.box(24, 8, 3, 24, 20, 3, PAL.woodDark);
  for (let y = 10; y <= 18; y++) b.box(23, y, 3, 23, y, 4, y % 2 ? PAL.red : PAL.wall);
}

// 吊脚楼 8×8×8（坡地侧柱撑 2–5m，模型底以下留腿）
function buildStilt(b) {
  const legH = 20; // 8m 腿（坡地侧够到谷脚）
  for (const [x, z] of [[0, 0], [19, 0], [0, 19], [19, 19], [10, 10]]) {
    b.box(x, -legH, z, x, -1, z, PAL.woodDark);
  }
  for (let i = 0; i <= 19; i++) {                         // 底梁盘（仅周圈梁，省面）
    b.set(i, 0, 0, PAL.woodDark); b.set(i, 0, 19, PAL.woodDark);
    b.set(0, 0, i, PAL.woodDark); b.set(19, 0, i, PAL.woodDark);
  }
  wallsWithCols(b, 1, 18, 1, 18, 1, 8);
  b.box(8, 1, 1, 11, 7, 1, PAL.woodDark);                 // 门
  windows(b, 1, 18, 18, 3, 5);
  gable(b, 0, 19, -1, 20, 9, PAL.tile, PAL.eave);
}

// 七级密檐塔 8×8×28
function buildPagoda(b) {
  b.box(0, 0, 0, 19, 4, 19, PAL.rock);                    // 石基 1m+
  let y = 5;
  for (let i = 0; i < 7; i++) {
    const w = 9 - i;                                      // 半宽逐层收分
    const x0 = 10 - w, x1 = 9 + w, z0 = 10 - w, z1 = 9 + w;
    wallsWithCols(b, x0, x1, z0, z1, y, y + 6, 4);
    b.box(9, y + 2, z0, 10, y + 4, z0, PAL.winDay, 1);    // 塔窗
    // 密檐（出挑 2 格，四角上翘）
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let z = z0 - 2; z <= z1 + 2; z++) {
      if (x < x0 - 1 || x > x1 + 1 || z < z0 - 1 || z > z1 + 1) b.set(x, y + 7, z, PAL.tile);
      else b.set(x, y + 7, z, PAL.eave);
    }
    for (const [cx, cz] of [[x0 - 2, z0 - 2], [x1 + 2, z0 - 2], [x0 - 2, z1 + 2], [x1 + 2, z1 + 2]]) b.set(cx, y + 8, cz, PAL.eave);
    y += 8;
  }
  // 塔刹
  b.box(9, y, 9, 10, y + 4, 10, PAL.gold);
  b.set(9, y + 5, 9, PAL.gold); b.set(10, y + 6, 10, PAL.gold);
}

// 观澜阁 20×20×44（三重台基 + 九层木构 + 观瀑平台 + 金刹）
function buildGuanlan(b) {
  // 台基三层 4m
  let y = 0;
  for (const [half, h] of [[25, 3], [22, 3], [19, 4]]) {
    b.box(25 - half, y, 25 - half, 25 + half - 1, y + h - 1, 25 + half - 1, PAL.rock);
    y += h;
  }
  // 九层
  for (let i = 0; i < 9; i++) {
    const w = 17 - i;                                     // 半宽 17→9
    const x0 = 25 - w, x1 = 24 + w, z0 = 25 - w, z1 = 24 + w;
    // 周圈栏杆（朱）
    b.box(x0 - 1, y, z0 - 1, x1 + 1, y, z1 + 1, PAL.red);
    b.box(x0 - 1, y + 3, z0 - 1, x1 + 1, y + 3, z1 + 1, PAL.red);
    // 柱与墙
    wallsWithCols(b, x0, x1, z0, z1, y + 1, y + 7, 4);
    // 四面窗
    for (const zz of [z0, z1]) windows(b, x0, x1, zz, y + 3, y + 5, 4);
    for (let xx = x0 + 2; xx <= x1 - 2; xx += 4) {
      b.box(xx, y + 3, z0, xx + 1, y + 5, z0, PAL.winDay, 1);
      b.box(xx, y + 3, z1, xx + 1, y + 5, z1, PAL.winDay, 1);
    }
    // 东侧观瀑平台（+x 出挑 6 格）
    b.box(x1 + 1, y - 1, 20, x1 + 6, y - 1, 29, PAL.woodDark);
    b.box(x1 + 6, y, 20, x1 + 6, y + 2, 29, PAL.red);
    // 出檐（+2 格，檐角阶梯上翘）
    const ey = y + 8;
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let z = z0 - 2; z <= z1 + 2; z++) {
      const edge = x < x0 || x > x1 || z < z0 || z > z1;
      b.set(x, ey, z, edge ? PAL.tile : PAL.eave);
    }
    for (const [cx, cz] of [[x0 - 2, z0 - 2], [x1 + 2, z0 - 2], [x0 - 2, z1 + 2], [x1 + 2, z1 + 2]]) {
      b.set(cx, ey + 1, cz, PAL.eave); b.set(cx, ey + 2, cz, PAL.eave);
    }
    y += 9;
  }
  // 顶部攒尖金顶
  pyramid(b, 13, 35, 13, 35, y, PAL.tile, PAL.gold);
  b.box(23, y + 9, 23, 25, y + 13, 25, PAL.gold);         // 塔刹加高
}

// 城门楼 12×8×14（城台券洞 + 三开间门楼）
function buildGate(b) {
  b.box(0, 0, 0, 29, 15, 19, PAL.rock);                   // 城台 6m
  // 券门洞（穿 z 向，宽 4m 高 4.8m，拱顶）
  for (let x = 10; x <= 19; x++) for (let y = 0; y <= 11; y++) {
    const arch = y > 8 && (x < 12 || x > 17);
    if (!arch) for (let z = 0; z <= 19; z++) b.set(x, y, z, -1 === b.get(x, y, z) ? PAL.rock : b.get(x, y, z));
  }
  // 简化：直接挖洞
  for (let x = 10; x <= 19; x++) for (let y = 0; y <= 11; y++) {
    const arch = y > 8 && (x < 12 || x > 17);
    if (!arch) for (let z = 0; z <= 19; z++) b.m.delete(b.k(x, y, z));
  }
  // 城台顶垛口
  for (let x = 0; x <= 29; x += 3) { b.box(x, 16, 0, x + 1, 17, 1, PAL.rock); b.box(x, 16, 18, x + 1, 17, 19, PAL.rock); }
  // 三开间门楼
  wallsWithCols(b, 3, 26, 4, 15, 16, 23, 4);
  windows(b, 3, 26, 4, 18, 20, 5);
  gable(b, 2, 27, 3, 16, 24, PAL.tile, PAL.eave);
}

// 城墙段 16×4×6（内侧垛口）
function buildWallSeg(b) {
  b.box(0, 0, 0, 39, 13, 19, PAL.rock);                   // 墙体 5.6m
  b.box(0, 14, 0, 39, 15, 19, PAL.pave);                  // 顶道
  for (let x = 0; x <= 39; x += 6) b.box(x, 16, 0, x + 2, 17, 2, PAL.rock);   // 内侧垛口 0.8m
}

// 牌坊 8×2×8（四柱三间）
function buildPaifang(b) {
  b.box(0, 0, 0, 19, 0, 19, PAL.pave);
  for (const [x, z] of [[1, 6], [1, 13], [18, 6], [18, 13]]) b.box(x, 1, z, x + 1, 14, z + 1, PAL.red);
  b.box(0, 8, 5, 19, 8, 14, PAL.woodDark);                // 下梁
  b.box(0, 12, 6, 19, 12, 13, PAL.woodDark);              // 上梁
  b.box(1, 15, 6, 18, 15, 13, PAL.tile);                  // 顶檐
  b.box(3, 16, 7, 16, 16, 12, PAL.tile);
}

// 六角重檐亭 径6×高6
function buildPavilionHex(b) {
  const c = 7, R = 7;
  const hex = (r, y, col) => {
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const d = Math.hypot(x, z);
      if (d <= r && d > r - 1.5) b.set(c + x, y, c + z, col);
    }
  };
  b.box(c - 5, 0, c - 5, c + 5, 1, c + 5, PAL.rock);      // 石基
  // 六柱
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = c + Math.round(Math.cos(a) * R), z = c + Math.round(Math.sin(a) * R);
    b.box(x - 1, 2, z - 1, x, 9, z, PAL.red);
  }
  hex(R + 1, 10, PAL.tile); hex(R + 3, 11, PAL.tile);     // 下檐
  hex(R, 11, PAL.eave);
  hex(R - 2, 13, PAL.tile);                               // 上檐收分
  hex(R - 4, 14, PAL.tile);
  b.set(c, 15, c, PAL.tile); b.set(c, 16, c, PAL.gold);   // 宝顶
}

// 方亭 4×4×4
function buildPavilionSq(b) {
  b.box(0, 0, 0, 9, 0, 9, PAL.rock);
  for (const [x, z] of [[0, 0], [8, 0], [0, 8], [8, 8]]) b.box(x, 1, z, x + 1, 6, z + 1, PAL.red);
  b.box(0, 7, 0, 9, 7, 9, PAL.tile);
  b.box(2, 8, 2, 7, 8, 7, PAL.tile);
  b.set(4, 9, 4, PAL.gold); b.set(5, 9, 5, PAL.gold);
  b.set(5, 10, 5, PAL.gold);
}

// 石拱桥 跨10×宽4（阶梯桥面）
function buildBridge(b) {
  const N = 13; // 半跨格数
  for (let i = -N; i <= N; i++) {
    const t = i / (N + 2);
    const deck = Math.round(6 * Math.sqrt(Math.max(0, 1 - t * t))); // 拱高 2.4m
    b.box(N + i, deck, 0, N + i, deck, 9, PAL.pave);
    if (Math.abs(i) <= N - 1) {
      b.set(N + i, deck + 1, 0, PAL.rock); b.set(N + i, deck + 1, 9, PAL.rock); // 石栏
    }
    // 拱腹：填充 deck 以下到抛物线
    const under = Math.round(5.5 * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let y = Math.max(0, under - 1); y < deck; y++) b.set(N + i, y, 4, PAL.rock);
    for (let y = Math.max(0, under - 1); y < deck; y++) b.set(N + i, y, 5, PAL.rock);
  }
  // 桥台
  b.box(0, 0, 0, 2, 2, 9, PAL.rock);
  b.box(2 * N - 2, 0, 0, 2 * N, 2, 9, PAL.rock);
}

// 松树 4×4×7
function buildPine(b) {
  b.box(4, 0, 4, 5, 6, 5, PAL.trunk);
  const cone = (r, y0, y1) => {
    for (let y = y0; y <= y1; y++) {
      const rr = r - (y - y0) * 0.6;
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        if (Math.hypot(x, z) <= rr) b.set(4 + x, y, 4 + z, PAL.pine);
      }
    }
  };
  cone(3.5, 4, 8); cone(2.5, 8, 11); cone(1.5, 11, 14);
}

// 阔叶树 5×5×6
function buildLeafTree(b) {
  b.box(5, 0, 5, 6, 4, 6, PAL.trunk);
  for (let x = 0; x <= 11; x++) for (let y = 3; y <= 10; y++) for (let z = 0; z <= 11; z++) {
    if (Math.hypot(x - 5.5, (y - 7) * 1.2, z - 5.5) <= 4.4) b.set(x, y, z, PAL.leaf);
  }
}

// 灯笼杆 0.6×0.6×3.4（0.2m 体素）
function buildLantern(b) {
  b.box(1, 0, 1, 1, 14, 1, PAL.woodDark);
  b.box(0, 15, 0, 2, 17, 2, PAL.red, 2);                  // 灯笼（发光）
  b.box(0, 18, 0, 2, 18, 2, PAL.woodDark);
}

// 塔院围墙 22×22×2.2（南面留门）
function buildYuanWall(b) {
  const h = 5, t = 1;
  const seg = (x0, z0, x1, z1) => {
    b.box(x0, 0, z0, x1, h, z1, PAL.wall);
    b.box(x0, h + 1, z0, x1, h + 1, z1, PAL.tile);
  };
  seg(0, 0, 54, t);                                       // 北
  seg(0, 54 - t, 54, 54);                                 // 南墙
  for (let x = 24; x <= 30; x++) for (let z = 54 - t; z <= 54; z++) b.m.delete(b.k(x, z)); // 南门洞
  seg(0, 0, t, 54);                                       // 西
  seg(54 - t, 0, 54, 54);                                 // 东
}

// ---------- 注册表 ----------
export const MODEL_DEFS = {
  house: { s: S, build: buildHouse },
  shop: { s: S, build: buildShop },
  stilt: { s: S, build: buildStilt },
  pagoda: { s: S, build: buildPagoda },
  guanlan: { s: S, build: buildGuanlan },
  gate: { s: S, build: buildGate },
  wallSeg: { s: S, build: buildWallSeg },
  paifang: { s: S, build: buildPaifang },
  pavilionHex: { s: S, build: buildPavilionHex },
  pavilionSq: { s: S, build: buildPavilionSq },
  bridge: { s: S, build: buildBridge },
  pine: { s: S, build: buildPine },
  leafTree: { s: S, build: buildLeafTree },
  lantern: { s: SL, build: buildLantern },
  yuanWall: { s: S, build: buildYuanWall },
};

const cache = new Map();
export function buildModel(name) {
  if (cache.has(name)) return cache.get(name);
  const def = MODEL_DEFS[name];
  const b = new B(def.s);
  def.build(b);
  const out = bake(b);
  cache.set(name, out);
  return out;
}
