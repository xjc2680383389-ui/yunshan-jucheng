// 世界生成（纯逻辑，node 可跑）：seed → 高度场(Uint16 体素高) + 材质场(Uint8)
// 流程：基线山脊噪声 → 锚点(按表序) → 瀑布断面 → 环山抬升 → 溪槽开凿 → 坡度岩化 → 量化
import {
  VOXEL, GRID, HALF, SEED, MAT, ANCHORS, FALLS, CREEK,
  CREEK_HALF_W, CREEK_SAND_W, POOL_WATER, LAKE_WATER, CITY,
} from './consts.js';
import { makeNoise2D } from './rng.js';

// ---- 索引与换算 ----
export const idx = (ix, iz) => iz * GRID + ix;
export const cellX = (x) => Math.floor((x + HALF) / VOXEL);
export const cellZ = (z) => Math.floor((z + HALF) / VOXEL);
export const worldX = (ix) => (ix + 0.5) * VOXEL - HALF;
export const worldZ = (iz) => (iz + 0.5) * VOXEL - HALF;
export const mToVox = (m) => Math.round(m / VOXEL);
export const voxToM = (v) => v * VOXEL;

const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// 锚点平滑衰减权重：d=0 → 1，d=r → 0
export function falloff(d, r) { return smooth01(1 - d / r); }

// 瀑布崖壁断面（沿 z 的目标海拔，两级近垂直跌水）
export function fallsProfile(z) {
  const F = FALLS;
  if (z <= F.zTop) return F.hTop;
  if (z <= F.zMid1) return lerp(F.hTop, F.hMid, (z - F.zTop) / (F.zMid1 - F.zTop));
  if (z <= F.zMid2) return F.hMid;
  if (z <= F.zMid3) return lerp(F.hMid, F.hBot, (z - F.zMid2) / (F.zMid3 - F.zMid2));
  return F.hBot;
}

export function inEllipse(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  return dx * dx + dz * dz <= 1;
}

// ---- 主生成 ----
export function generateWorld(seed = SEED) {
  const nTerrain = makeNoise2D(101);
  const nRing = makeNoise2D(202);
  const height = new Float32Array(GRID * GRID);
  const mat = new Uint8Array(GRID * GRID);

  // 预计算溪流线段包围盒（分段局部更新，避免全图 × 7 段）
  const segs = [];
  for (let i = 0; i < CREEK.length - 1; i++) {
    const a = CREEK[i], b = CREEK[i + 1];
    segs.push({
      ax: a.x, az: a.z, bx: b.x, bz: b.z, ha: a.h, hb: b.h,
      ix0: cellX(Math.min(a.x, b.x) - CREEK_SAND_W - 2), ix1: cellX(Math.max(a.x, b.x) + CREEK_SAND_W + 2),
      iz0: cellZ(Math.min(a.z, b.z) - CREEK_SAND_W - 2), iz1: cellZ(Math.max(a.z, b.z) + CREEK_SAND_W + 2),
    });
  }
  const bestD = new Float32Array(GRID * GRID).fill(Infinity);
  const bestH = new Float32Array(GRID * GRID);
  for (const s of segs) {
    const abx = s.bx - s.ax, abz = s.bz - s.az, len2 = abx * abx + abz * abz;
    for (let iz = Math.max(0, s.iz0); iz <= Math.min(GRID - 1, s.iz1); iz++) {
      const z = worldZ(iz);
      for (let ix = Math.max(0, s.ix0); ix <= Math.min(GRID - 1, s.ix1); ix++) {
        const x = worldX(ix);
        let t = ((x - s.ax) * abx + (z - s.az) * abz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (s.ax + abx * t), z - (s.az + abz * t));
        const k = idx(ix, iz);
        if (d < bestD[k]) { bestD[k] = d; bestH[k] = s.ha + (s.hb - s.ha) * t; }
      }
    }
  }

  // 主循环：基线 + 锚点 + 瀑布 + 环山（材质在此仅做溪/滩/默认草，坡度岩化后置）
  for (let iz = 0; iz < GRID; iz++) {
    const z = worldZ(iz);
    for (let ix = 0; ix < GRID; ix++) {
      const x = worldX(ix);
      const k = idx(ix, iz);

      // 1) 基线：三层山脊噪声（2 倍频）
      const r1 = 1 - Math.abs(nTerrain(x / 56, z / 56));
      const r2 = 1 - Math.abs(nTerrain(x / 26 + 7.3, z / 26 + 3.1));
      const r3 = 1 - Math.abs(nTerrain(x / 12 + 13.7, z / 12 + 9.4));
      let h = 18 + (r1 * 0.5 + r2 * 0.3 + r3 * 0.2) * 46;

      // 2) 锚点锥形修正（表序，后应用者胜）
      for (let i = 0; i < ANCHORS.length; i++) {
        const a = ANCHORS[i];
        const dx = x - a.x, dz = z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= a.r * a.r) continue;
        h = lerp(h, a.h, falloff(Math.sqrt(d2), a.r));
      }

      // 3) 瀑布断面（潭之后应用，保住两级陡崖）
      {
        const ax = Math.abs(x - FALLS.cx);
        if (ax <= FALLS.blendW) {
          const w = ax <= FALLS.halfW ? 1 : 1 - smooth01((ax - FALLS.halfW) / (FALLS.blendW - FALLS.halfW));
          if (w > 0) h = lerp(h, fallsProfile(z), w);
        }
      }

      // 4) 环山抬升（南缘溪出口豁口除外）
      {
        const dEdge = Math.min(x + HALF, HALF - x, z + HALF, HALF - z);
        if (dEdge < 24) {
          let w = smooth01(1 - dEdge / 24);
          const dGap = Math.hypot(x - 18, z - 128);
          if (dGap < 30) w *= smooth01((dGap - 15) / 15);
          if (w > 0) {
            const target = 50 + 15 * (nRing(x / 40, z / 40) * 0.5 + 0.5);
            h = lerp(h, target, w);
          }
        }
      }

      // 5) 溪槽开凿与材质
      const d = bestD[k];
      if (d <= CREEK_HALF_W) {
        if (h > bestH[k] + VOXEL) h = bestH[k] + VOXEL;   // min 规则：兜住槽底
        mat[k] = MAT.CREEK;
      } else if (d <= CREEK_SAND_W && Math.abs(h - bestH[k]) <= 0.8 && mat[k] === MAT.GRASS) {
        mat[k] = MAT.SAND;
      } else {
        mat[k] = MAT.GRASS;
      }

      height[k] = h;
    }
  }

  // 6) 潭/湖盆底材质（水椭圆内溪底石，外 2m 滩沙）
  stampBasin(POOL_WATER, mat);
  stampBasin(LAKE_WATER, mat);

  // 7) 坡度岩化（2m 核，坡度 >38°）
  slopeRockify(height, mat);

  // 8) 量化为体素高（夹在 [6,115]m）
  const hq = new Uint16Array(GRID * GRID);
  for (let i = 0; i < hq.length; i++) {
    let v = Math.round(height[i] / VOXEL);
    if (v < 30) v = 30; if (v > 575) v = 575;
    hq[i] = v;
  }
  return { height: hq, mat };
}

function stampBasin(w, mat) {
  const ix0 = cellX(w.x - w.rx - 2), ix1 = cellX(w.x + w.rx + 2);
  const iz0 = cellZ(w.z - w.rz - 2), iz1 = cellZ(w.z + w.rz + 2);
  for (let iz = Math.max(0, iz0); iz <= Math.min(GRID - 1, iz1); iz++) {
    for (let ix = Math.max(0, ix0); ix <= Math.min(GRID - 1, ix1); ix++) {
      const k = idx(ix, iz);
      const dx = (worldX(ix) - w.x) / w.rx, dz = (worldZ(iz) - w.z) / w.rz;
      const e = dx * dx + dz * dz;
      if (e <= 1) mat[k] = MAT.CREEK;
      else if (e <= 1.44 && mat[k] === MAT.GRASS) mat[k] = MAT.SAND;
    }
  }
}

export function slopeRockify(height, mat) {
  const R = 10; // 2m 核
  const tan45 = 1.0; // 坡度 >45° 才岩化（保青山绿意，崖壁留给陡坎）
  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) {
      const k = idx(ix, iz);
      if (mat[k] !== MAT.GRASS) continue;
      const h = height[k];
      let g = 0;
      if (ix > R) { const d = Math.abs(h - height[k - R]) * VOXEL / 2; if (d > g) g = d; }
      if (ix < GRID - 1 - R) { const d = Math.abs(h - height[k + R]) * VOXEL / 2; if (d > g) g = d; }
      if (iz > R) { const d = Math.abs(h - height[k - R * GRID]) * VOXEL / 2; if (d > g) g = d; }
      if (iz < GRID - 1 - R) { const d = Math.abs(h - height[k + R * GRID]) * VOXEL / 2; if (d > g) g = d; }
      if (g > tan45) mat[k] = MAT.ROCK;
    }
  }
}

// ---- 查询辅助 ----
// 双线性采样海拔（米）
export function heightAtM(world, x, z) {
  const fx = (x + HALF) / VOXEL - 0.5, fz = (z + HALF) / VOXEL - 0.5;
  const ix = Math.max(0, Math.min(GRID - 2, Math.floor(fx)));
  const iz = Math.max(0, Math.min(GRID - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix)), tz = Math.max(0, Math.min(1, fz - iz));
  const h00 = world.height[idx(ix, iz)], h10 = world.height[idx(ix + 1, iz)];
  const h01 = world.height[idx(ix, iz + 1)], h11 = world.height[idx(ix + 1, iz + 1)];
  return voxToM(lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz));
}

// 2m 核坡度（度）
export function slopeDegAt(world, ix, iz) {
  const R = 10, h = world.height[idx(ix, iz)];
  let g = 0;
  if (ix > R) g = Math.max(g, Math.abs(h - world.height[idx(ix - R, iz)]));
  if (ix < GRID - 1 - R) g = Math.max(g, Math.abs(h - world.height[idx(ix + R, iz)]));
  if (iz > R) g = Math.max(g, Math.abs(h - world.height[idx(ix, iz - R)]));
  if (iz < GRID - 1 - R) g = Math.max(g, Math.abs(h - world.height[idx(ix, iz + R)]));
  return Math.atan(g * VOXEL / 2) * 180 / Math.PI;
}
