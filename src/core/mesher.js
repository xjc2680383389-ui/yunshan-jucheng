// 地形网格化（纯逻辑，node 可跑）：高度场+材质场 → quad 列表
// 顶面：贪心矩形合并，四角 AO 烘顶点色；侧面：矩形边缘按邻高 run-length，仅 +x/+z 方向发射（高处格发射，天然无缝）。
// 供 render/terrain.js 建 BufferGeometry，selftest 统计三角形。
import { VOXEL, GRID, HALF, MAT, PAL } from './consts.js';
import { idx, voxToM } from './worldgen.js';

const SNOW_H = 95, SNOW_RAMP = 4;      // h>95m 向雪色渐变
const CLIFF_DROP = 10;                 // 侧立面落差 >10 格(2m) 才用崖壁色（防近看斑马纹）
const AO_LEVELS = [1.0, 0.9, 0.78];    // 无遮挡 / 一侧 / 两侧
const SIDE_DIM = 0.93;                 // 侧面略暗

function hexRGB(hex) { return [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255]; }
const MAT_RGB = {
  [MAT.GRASS]: hexRGB(PAL.grass),
  [MAT.ROCK]: hexRGB(PAL.rock),
  [MAT.CLIFF]: hexRGB(PAL.cliff),
  [MAT.SNOW]: hexRGB(PAL.snow),
  [MAT.SAND]: hexRGB(PAL.sand),
  [MAT.CREEK]: hexRGB(PAL.creek),
  [MAT.ROAD]: hexRGB(PAL.road),
  [MAT.PAVE]: hexRGB(PAL.pave),
};
const SNOW_RGB = hexRGB(PAL.snow);

// 生成一个 chunk 的网格；world={height,mat}，ccx/ccz∈0..7，tol=合并容差(格)
// 返回 {pos,col,nrm,idx,quads}（普通数组；pos/col/nrm 每 3 个一顶点）
export function meshChunk(world, ccx, ccz, tol = 0) {
  const CC = 160; // CHUNK_CELLS
  const ix0 = ccx * CC, iz0 = ccz * CC;
  const H = world.height, M = world.mat;
  const pos = [], col = [], nrm = [], idxArr = [];
  let quads = 0;
  const inB = (x, z) => x >= 0 && x < GRID && z >= 0 && z < GRID;
  const hAt = (x, z) => (inB(x, z) ? H[idx(x, z)] : 0);
  const qq = (v) => (tol > 0 ? Math.round(v / (tol + 1)) * (tol + 1) : v);
  const keyOf = (x, z) => qq(H[idx(x, z)]) * 8 + M[idx(x, z)];
  const used = new Uint8Array(CC * CC);

  // 顶面矩形角 AO：corner 0..3 = (gx,gz)(gx,gz+d)(gx+w,gz+d)(gx+w,gz)，查除本矩形角列外 3 邻列
  function cornerAO(corner, gx, gz, w, d, h) {
    let cells;
    if (corner === 0) cells = [[gx - 1, gz - 1], [gx, gz - 1], [gx - 1, gz]];
    else if (corner === 1) cells = [[gx - 1, gz + d - 1], [gx - 1, gz + d], [gx, gz + d]];
    else if (corner === 2) cells = [[gx + w - 1, gz + d], [gx + w, gz + d], [gx + w, gz + d - 1]];
    else cells = [[gx + w - 1, gz - 1], [gx + w, gz - 1], [gx + w, gz]];
    let n = 0;
    for (let i = 0; i < 3; i++) if (hAt(cells[i][0], cells[i][1]) >= h + 2) n++;
    return AO_LEVELS[Math.min(n, 2)];
  }

  for (let lz = 0; lz < CC; lz++) {
    for (let lx = 0; lx < CC; lx++) {
      if (used[lz * CC + lx]) continue;
      const gx = ix0 + lx, gz = iz0 + lz;
      const k0 = keyOf(gx, gz);
      let w = 1;
      while (lx + w < CC) {
        if (used[lz * CC + lx + w] || keyOf(ix0 + lx + w, iz0 + lz) !== k0) break;
        w++;
      }
      let d = 1, ok = true;
      while (lz + d < CC && ok) {
        for (let i = 0; i < w; i++) {
          if (used[(lz + d) * CC + lx + i] || keyOf(ix0 + lx + i, iz0 + lz + d) !== k0) { ok = false; break; }
        }
        if (ok) d++;
      }
      for (let zz = 0; zz < d; zz++) for (let xx = 0; xx < w; xx++) used[(lz + zz) * CC + lx + xx] = 1;

      // ---- 顶面 ----
      const h = H[idx(gx, gz)];
      const y = voxToM(h);
      const x0 = gx * VOXEL - HALF, x1 = (gx + w) * VOXEL - HALF;
      const z0 = gz * VOXEL - HALF, z1 = (gz + d) * VOXEL - HALF;
      const base = MAT_RGB[M[idx(gx, gz)]];
      const snowT = Math.max(0, Math.min(1, (voxToM(h) - SNOW_H) / SNOW_RAMP));
      const cr = base[0] * (1 - snowT) + SNOW_RGB[0] * snowT;
      const cg = base[1] * (1 - snowT) + SNOW_RGB[1] * snowT;
      const cb = base[2] * (1 - snowT) + SNOW_RGB[2] * snowT;
      const vb = pos.length / 3;
      const px = [x0, x0, x1, x1], pz = [z0, z1, z1, z0];
      for (let c = 0; c < 4; c++) {
        pos.push(px[c], y, pz[c]);
        nrm.push(0, 1, 0);
        const ao = cornerAO(c, gx, gz, w, d, h);
        col.push(cr * ao, cg * ao, cb * ao);
      }
      idxArr.push(vb, vb + 1, vb + 2, vb, vb + 2, vb + 3);
      quads++;

      // ---- 东侧面（矩形东缘，邻列 gx+w）：按邻高 run-length，朝 +x ----
      const ex = gx + w;
      let zi = 0;
      while (zi < d) {
        const nh = hAt(ex, gz + zi);
        const drop = h - nh;
        if (drop <= 0) { zi++; continue; }
        let run = 1;
        while (zi + run < d && hAt(ex, gz + zi + run) === nh) run++;
        const yb = voxToM(nh);
        const zA = (gz + zi) * VOXEL - HALF, zB = (gz + zi + run) * VOXEL - HALF;
        const rgb = drop > CLIFF_DROP ? MAT_RGB[MAT.CLIFF] : MAT_RGB[MAT.ROCK];
        const v0 = pos.length / 3;
        pos.push(x1, y, zA, x1, y, zB, x1, yb, zB, x1, yb, zA);
        for (let c = 0; c < 4; c++) { nrm.push(1, 0, 0); col.push(rgb[0] * SIDE_DIM, rgb[1] * SIDE_DIM, rgb[2] * SIDE_DIM); }
        idxArr.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
        quads++;
        zi += run;
      }

      // ---- 南侧面（矩形南缘，邻行 gz+d）：按邻高 run-length，朝 +z ----
      const sz = gz + d;
      let xi = 0;
      while (xi < w) {
        const nh = hAt(gx + xi, sz);
        const drop = h - nh;
        if (drop <= 0) { xi++; continue; }
        let run = 1;
        while (xi + run < w && hAt(gx + xi + run, sz) === nh) run++;
        const yb = voxToM(nh);
        const xA = (gx + xi) * VOXEL - HALF, xB = (gx + xi + run) * VOXEL - HALF;
        const rgb = drop > CLIFF_DROP ? MAT_RGB[MAT.CLIFF] : MAT_RGB[MAT.ROCK];
        const v0 = pos.length / 3;
        pos.push(xB, y, z1, xA, y, z1, xA, yb, z1, xB, yb, z1);
        for (let c = 0; c < 4; c++) { nrm.push(0, 0, 1); col.push(rgb[0] * SIDE_DIM, rgb[1] * SIDE_DIM, rgb[2] * SIDE_DIM); }
        idxArr.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
        quads++;
        xi += run;
      }
    }
  }
  return { pos, col, nrm, idx: idxArr, quads };
}

// 全地形 quad 统计（selftest / 三角预算用）
export function countTerrainQuads(world, tol = 0) {
  let total = 0;
  for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) total += meshChunk(world, cx, cz, tol).quads;
  return total;
}
