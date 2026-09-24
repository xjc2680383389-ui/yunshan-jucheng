// 布局（纯逻辑，node 可跑）：道路开凿 + 桥位探测 + 建筑/树/灯杆放置表
// 输入 worldgen 结果（内部克隆后开凿），输出 { world, placements, bridges, roadPts, mask, stats }
import {
  VOXEL, GRID, HALF, SEED, MAT, CITY, GATES, PLAZA, PAGODA, GUANLAN,
  ROAD_MAIN, ROAD_MOUNTAIN, ROAD_LAKE, ROAD_HALF, ROAD_STEP,
  CREEK, CREEK_HALF_W, POOL_WATER, LAKE_WATER, PAVILIONS,
} from './consts.js';
import {
  idx, cellX, cellZ, worldX, worldZ, mToVox, voxToM, heightAtM, slopeDegAt, inEllipse,
} from './worldgen.js';
import { makeRng } from './rng.js';

const TAU = Math.PI * 2;
const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// 折线重采样（步长 step，返回 {x,z,yaw}；yaw=线段朝向，模型长轴对齐用）
export function resamplePolyline(pts, step = ROAD_STEP) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = dist2D(ax, az, bx, bz);
    const n = Math.max(1, Math.round(len / step));
    const yaw = Math.atan2(-(bz - az), bx - ax); // 模型 +X 轴对齐线段
    for (let s = 0; s < n; s++) {
      const t = s / n;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw });
    }
  }
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  out.push({ x: last[0], z: last[1], yaw: Math.atan2(-(last[1] - prev[1]), last[0] - prev[0]) });
  return out;
}

// 城墙椭圆外偏弧线（环城路），过四门方位角连续采样
export function resampleRing(step = ROAD_STEP, off = 4.5) {
  const a = CITY.a + off, b = CITY.b + off;
  const total = Math.PI * (a + b) * 1.005; // 周长近似
  const n = Math.ceil(total / step);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const phi = Math.PI / 2 - (i / n) * TAU; // 南门(90°)→东(0°)→北(-90°)→西(180°)→南
    out.push({ x: CITY.cx + a * Math.cos(phi), z: CITY.cz + b * Math.sin(phi), yaw: 0 });
  }
  for (let i = 1; i < out.length; i++) {
    const p = out[i - 1], q = out[i];
    q.yaw = Math.atan2(-(q.z - p.z), q.x - p.x);
  }
  out[0].yaw = out[1].yaw;
  return out;
}

// 城内街巷线（16m 网格，广场为中心，椭圆内缩 4m 裁剪）
export function streetLines() {
  const a = CITY.a - 4, b = CITY.b - 4;
  const lines = [];
  for (let k = -3; k <= 3; k++) {
    const x = CITY.cx + k * 16;
    const t = 1 - ((x - CITY.cx) / a) ** 2;
    if (t <= 0.02) continue;
    const dz = b * Math.sqrt(t);
    lines.push([[x, CITY.cz - dz], [x, CITY.cz + dz]]);
    const z = CITY.cz + k * 16;
    const t2 = 1 - ((z - CITY.cz) / b) ** 2;
    if (t2 <= 0.02) continue;
    const dx = a * Math.sqrt(t2);
    lines.push([[CITY.cx - dx, z], [CITY.cx + dx, z]]);
  }
  return lines;
}

// 到溪流中心线距离（散点查询用）
export function distToCreek(x, z) {
  let best = Infinity;
  for (let i = 0; i < CREEK.length - 1; i++) {
    const a = CREEK[i], b = CREEK[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = dist2D(x, z, a.x + abx * t, a.z + abz * t);
    if (d < best) best = d;
  }
  return best;
}

function inWaterBody(x, z, pad = 0) {
  if (inEllipse(x, z, POOL_WATER.x, POOL_WATER.z, POOL_WATER.rx + pad, POOL_WATER.rz + pad)) return true;
  if (inEllipse(x, z, LAKE_WATER.x, LAKE_WATER.z, LAKE_WATER.rx + pad, LAKE_WATER.rz + pad)) return true;
  return false;
}

// OBB 范围内格操作（model 局部长轴=X，yaw 同 resample 约定）
function forCellsInOBB(cx, cz, yaw, hw, hd, fn) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const r = Math.ceil(Math.hypot(hw, hd) / VOXEL) + 1;
  const cx0 = cellX(cx - r * VOXEL), cx1 = cellX(cx + r * VOXEL);
  const cz0 = cellZ(cz - r * VOXEL), cz1 = cellZ(cz + r * VOXEL);
  for (let iz = Math.max(0, cz0); iz <= Math.min(GRID - 1, cz1); iz++) {
    for (let ix = Math.max(0, cx0); ix <= Math.min(GRID - 1, cx1); ix++) {
      const wx = worldX(ix), wz = worldZ(iz);
      const dx = wx - cx, dz = wz - cz;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) fn(idx(ix, iz), wx, wz);
    }
  }
}

// ---- 主入口 ----
export function buildLayout(world) {
  const rng = makeRng(SEED + ':layout');
  const height = world.height.slice();
  const mat = world.mat.slice();
  const W = { height, mat };
  const placements = [];
  const bridges = [];

  const cityIn = (x, z, inset = 0) =>
    ((x - CITY.cx) / (CITY.a - inset)) ** 2 + ((z - CITY.cz) / (CITY.b - inset)) ** 2 <= 1;

  const stampFlat = (cx, cz, yaw, hw, hd, hM, m) =>
    forCellsInOBB(cx, cz, yaw, hw, hd, (k) => { height[k] = mToVox(hM); mat[k] = m; });

  // —— 1) 街巷（城内 PAVE）——
  const streets = [];
  for (const line of streetLines()) {
    const s = resamplePolyline(line);
    // 平滑
    for (let i = 0; i < s.length; i++) {
      let sum = 0, n = 0;
      for (let j = Math.max(0, i - 5); j <= Math.min(s.length - 1, i + 5); j++) { sum += heightAtM(world, s[j].x, s[j].z); n++; }
      s[i].h = sum / n;
    }
    streets.push(s);
    for (const p of s) stampFlat(p.x, p.z, p.yaw, 2.0, 2.0, p.h, MAT.PAVE);
  }

  // —— 2) 道路采样与平滑 ——
  const main = resamplePolyline(ROAD_MAIN);
  const mountain = resamplePolyline(ROAD_MOUNTAIN);
  const ring = resampleRing();
  const lake = resamplePolyline(ROAD_LAKE);
  const smooth = (s) => {
    for (let i = 0; i < s.length; i++) {
      let sum = 0, n = 0;
      for (let j = Math.max(0, i - 8); j <= Math.min(s.length - 1, i + 8); j++) { sum += heightAtM(world, s[j].x, s[j].z); n++; }
      s[i].h0 = sum / n;
    }
  };
  for (const s of [main, mountain, ring, lake]) smooth(s);

  // —— 3) 桥位探测（连续涉水段 ≥3m 成桥，段内高度线性过渡）——
  const waterAt = (x, z) => inWaterBody(x, z, 0.8) ||
    (distToCreek(x, z) <= CREEK_HALF_W + 0.5 && heightAtM(world, x, z) < creekLineH(x, z) + 2);
  function creekLineH(x, z) {
    for (let i = 0; i < CREEK.length - 1; i++) {
      const a = CREEK[i], b = CREEK[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      let t = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (dist2D(x, z, a.x + abx * t, a.z + abz * t) <= CREEK_HALF_W + 1) return a.h + (b.h - a.h) * t;
    }
    return 0;
  }
  function detectBridges(s, name) {
    let i = 0;
    while (i < s.length) {
      if (!waterAt(s[i].x, s[i].z)) { i++; continue; }
      let j = i;
      while (j < s.length && waterAt(s[j].x, s[j].z)) j++;
      const spanM = (j - i) * ROAD_STEP;
      if (spanM >= 3 && i > 0 && j < s.length) {
        const mid = s[(i + j) >> 1];
        const deck = creekLineH(mid.x, mid.z) + 2.4; // 桥面 = 谷底水位 + 拱高
        bridges.push({ x: mid.x, z: mid.z, yaw: mid.yaw, y: deck, name });
        for (let k = i; k < j; k++) s[k].h0 = deck;
        // 两端 10m 引道向桥面压降（只降不抬，路面切进坡体成路堑）
        for (let m = 1; m <= 25; m++) {
          const t = m / 25;
          const a = i - 1 - m, b = j - 1 + m;
          if (a >= 0) s[a].h0 = Math.min(s[a].h0, deck + (s[i - 1].h0 - deck) * t);
          if (b < s.length) s[b].h0 = Math.min(s[b].h0, deck + (s[j].h0 - deck) * t);
        }
      }
      i = j;
    }
  }
  detectBridges(main, 'main');
  detectBridges(ring, 'ring');

  // —— 4) 道路开凿（跨水段格不动，留给桥模）——
  function carveRoad(s, halfW, m) {
    const pad = 2; // 半宽格数冗余
    for (const p of s) {
      const overWater = waterAt(p.x, p.z);
      const bx0 = cellX(p.x - halfW - pad * VOXEL), bx1 = cellX(p.x + halfW + pad * VOXEL);
      const bz0 = cellZ(p.z - halfW - pad * VOXEL), bz1 = cellZ(p.z + halfW + pad * VOXEL);
      for (let iz = Math.max(0, bz0); iz <= Math.min(GRID - 1, bz1); iz++) {
        for (let ix = Math.max(0, bx0); ix <= Math.min(GRID - 1, bx1); ix++) {
          const wx = worldX(ix), wz = worldZ(iz);
          if (overWater && waterAt(wx, wz)) continue; // 桥下水格不开凿，留给桥模
          if (dist2D(wx, wz, p.x, p.z) <= halfW) {
            height[idx(ix, iz)] = mToVox(p.h0);
            mat[idx(ix, iz)] = m;
          }
        }
      }
    }
  }

  carveRoad(main, ROAD_HALF, MAT.ROAD);
  carveRoad(mountain, ROAD_HALF - 0.2, MAT.ROAD);
  carveRoad(ring, ROAD_HALF, MAT.ROAD);
  carveRoad(lake, ROAD_HALF - 0.2, MAT.ROAD);

  // —— 5) 城墙段放置（沿椭圆，门洞区间跳过，沿线下方整平）——
  {
    const arc = Math.PI * (CITY.a + CITY.b) * 1.005;
    const n = Math.ceil(arc / 1.0);
    let sinceLast = 99;
    for (let i = 0; i <= n; i++) {
      const phi = Math.PI / 2 + (i / n) * TAU;
      const x = CITY.cx + CITY.a * Math.cos(phi), z = CITY.cz + CITY.b * Math.sin(phi);
      sinceLast += arc / n;
      const nearGate = GATES.some((g) => dist2D(x, z, g.x, g.z) < 11);
      if (nearGate) continue;
      if (sinceLast < 12.5) continue;
      sinceLast = 0;
      const tx = -CITY.a * Math.sin(phi), tz = CITY.b * Math.cos(phi);
      const yaw = Math.atan2(-tz, tx);
      const hL = heightAtM(W, x - tx / Math.hypot(tx, tz) * 6, z - tz / Math.hypot(tx, tz) * 6);
      const hR = heightAtM(W, x + tx / Math.hypot(tx, tz) * 6, z + tz / Math.hypot(tx, tz) * 6);
      const base = (hL + hR) / 2;
      stampFlat(x, z, yaw, 8, 1.3, base - 0.3, MAT.ROCK);
      placements.push({ type: 'wallSeg', x, z, y: base - 0.3, yaw });
    }
  }

  // —— 6) 城门（径向朝外）——
  for (const g of GATES) {
    const nx = (g.x - CITY.cx) / (CITY.a * CITY.a), nz = (g.z - CITY.cz) / (CITY.b * CITY.b);
    const yaw = Math.atan2(-nz, nx);
    placements.push({ type: 'gate', x: g.x, z: g.z, y: heightAtM(W, g.x, g.z), yaw, gate: g.name });
  }

  // —— 7) 大型建筑 ——
  placements.push({ type: 'pagoda', x: PAGODA.x, z: PAGODA.z, y: heightAtM(W, PAGODA.x, PAGODA.z), yaw: 0 });
  {
    // 塔院围墙（22m 方圈，南面留 3m 门）
    const h = heightAtM(W, PAGODA.x, PAGODA.z);
    for (const [dx, dz, yaw, hw] of [[0, -11, 0, 11], [0, 11, 0, 11], [-11, 0, Math.PI / 2, 11], [11, 0, Math.PI / 2, 11]]) {
      stampFlat(PAGODA.x + dx, PAGODA.z + dz, yaw, hw, 0.5, h, MAT.ROCK);
    }
    placements.push({ type: 'yuanWall', x: PAGODA.x, z: PAGODA.z, y: h, yaw: 0 });
  }
  {
    const gx = GUANLAN.x, gz = GUANLAN.z;
    const base = GUANLAN.baseH;
    stampFlat(gx, gz, 0, 11, 11, base, MAT.ROCK);
    const yaw = Math.atan2(-(-80 - gz), -26 - gx); // 朝阁前路（东北向）
    placements.push({ type: 'guanlan', x: gx, z: gz, y: base, yaw });
  }
  for (const p of PAVILIONS) {
    placements.push({ type: p.type === 'hex' ? 'pavilionHex' : 'pavilionSq', x: p.x, z: p.z, y: heightAtM(W, p.x, p.z), yaw: rng() * TAU });
  }
  // 牌坊 ×3：广场 / 南门外 / 阁前（贴主路）
  const placePaifang = (x, z) => {
    let best = main[0], bd = Infinity;
    for (const p of main) { const d = dist2D(x, z, p.x, p.z); if (d < bd) { bd = d; best = p; } }
    placements.push({ type: 'paifang', x: best.x, z: best.z, y: best.h0, yaw: best.yaw });
  };
  placePaifang(5, 69);
  placePaifang(5, 103);
  placePaifang(-22, -88);

  // —— 8) 城内民居/铺面（街区格 + 主路临街）——
  const occupied = []; // {x,z,r}
  const nearAny = (x, z, r) => occupied.some((o) => dist2D(x, z, o.x, o.z) < o.r + r);
  const isRoadCell = (x, z) => {
    const k = idx(cellX(x), cellZ(z));
    return mat[k] === MAT.ROAD || mat[k] === MAT.PAVE;
  };
  function padOK(x, z, yaw, hw, hd, needClear = 0.6) {
    let ok = true;
    forCellsInOBB(x, z, yaw, hw + needClear, hd + needClear, (k, wx, wz) => {
      if (!ok) return;
      const m = mat[k];
      if (m === MAT.ROAD || m === MAT.CREEK || m === MAT.SAND || m === MAT.PAVE) ok = false;
      else if (inWaterBody(wx, wz, 1)) ok = false;
    });
    return ok;
  }
  function addBuilding(type, x, z, yaw, hw, hd, opts = {}) {
    let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
    forCellsInOBB(x, z, yaw, hw, hd, (k) => {
      const h = voxToM(height[k]);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
      sum += h; n++;
    });
    const base = opts.base === 'max' ? hi : (n ? sum / n : heightAtM(W, x, z));
    if (opts.stamp !== false) stampFlat(x, z, yaw, hw, hd, base, opts.padMat ?? MAT.ROCK);
    placements.push({ type, x, z, y: base, yaw });
    occupied.push({ x, z, r: Math.max(hw, hd) + 2 });
    return base;
  }
  // 街区民居
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const bx = CITY.cx + gx * 16 + 8, bz = CITY.cz + gz * 16 + 8; // 街区中心（偏半格）
      if (!cityIn(bx, bz, 12)) continue;
      if (dist2D(bx, bz, PLAZA.x, PLAZA.z) < PLAZA.r + 4) continue;
      if (dist2D(bx, bz, PAGODA.x, PAGODA.z) < 13) continue;
      if (GATES.some((g) => dist2D(bx, bz, g.x, g.z) < 12)) continue;
      if (rng() < 0.18) continue; // 留出空院/菜畦
      const yaw = rng() < 0.5 ? 0 : Math.PI / 2;
      if (rng() < 0.3) { // 街块二选一：临街铺面或民居
        if (!padOK(bx, bz, yaw, 5, 4, 0)) continue;
        addBuilding('shop', bx, bz, yaw, 5, 4);
      } else {
        if (!padOK(bx, bz, yaw, 6, 5, 0)) continue; // 街块 12m 恰容 12×10 民居
        addBuilding('house', bx, bz, yaw, 6, 5);
      }
    }
  }
  // 主路临街铺面（城内段，两侧交错）
  {
    let side = 1, since = 99;
    for (const p of main) {
      if (!cityIn(p.x, p.z, 8)) continue;
      since += ROAD_STEP;
      if (since < 14) continue;
      const nx = Math.cos(p.yaw + Math.PI / 2) * side * 7.2;
      const nz = -Math.sin(p.yaw + Math.PI / 2) * side * 7.2;
      const x = p.x + nx, z = p.z + nz;
      side *= -1;
      if (dist2D(x, z, PLAZA.x, PLAZA.z) < PLAZA.r + 4) continue;
      if (nearAny(x, z, 5)) continue;
      if (!padOK(x, z, p.yaw, 5, 4, 0.2)) continue;
      addBuilding('shop', x, z, p.yaw, 5, 4);
      since = 0;
    }
  }

  // —— 9) 城外吊脚楼（30–70m、坡 6–25°）——
  {
    let placed = 0, tries = 0;
    while (placed < 60 && tries < 4000) {
      tries++;
      const x = (rng() * 2 - 1) * 124, z = (rng() * 2 - 1) * 124;
      if (cityIn(x, z, 8)) continue;
      const k = idx(cellX(x), cellZ(z));
      const hM = voxToM(height[k]);
      if (hM < 30 || hM > 70) continue;
      const sl = slopeDegAt(W, cellX(x), cellZ(z));
      if (sl < 6 || sl > 25) continue;
      if (distToCreek(x, z) < 7 || inWaterBody(x, z, 5)) continue;
      if (nearAny(x, z, 7)) continue;
      addBuilding('stilt', x, z, rng() * TAU, 4, 4, { stamp: false, base: 'max' });
      placed++;
    }
  }

  // —— 10) 树（~400）与灯杆（~80）——
  {
    let placed = 0, tries = 0;
    while (placed < 400 && tries < 9000) {
      tries++;
      const x = (rng() * 2 - 1) * 126, z = (rng() * 2 - 1) * 126;
      const ix = cellX(x), iz = cellZ(z), k = idx(ix, iz);
      if (mat[k] !== MAT.GRASS) continue;
      const hM = voxToM(height[k]);
      if (hM < 8 || hM > 65) continue;
      if (slopeDegAt(W, ix, iz) > 35) continue;
      if (distToCreek(x, z) < 3.5 || inWaterBody(x, z, 1.5)) continue;
      if (isRoadCell(x, z) || nearAny(x, z, 2.5)) continue;
      const pine = hM > 45 || rng() < 0.2;
      placements.push({ type: pine ? 'pine' : 'leafTree', x, z, y: hM, yaw: rng() * TAU });
      occupied.push({ x, z, r: 1.2 });
      placed++;
    }
  }
  {
    let placed = 0;
    for (const s of [main, ring]) {
      let acc = 0, side = 1;
      for (const p of s) {
        acc += ROAD_STEP;
        if (acc < 10) continue;
        acc = 0;
        const nx = Math.cos(p.yaw + Math.PI / 2) * side * 2.4;
        const nz = -Math.sin(p.yaw + Math.PI / 2) * side * 2.4;
        side *= -1;
        const x = p.x + nx, z = p.z + nz;
        if (inWaterBody(x, z, 1.2) || distToCreek(x, z) < 2.5) continue;
        if (nearAny(x, z, 1.5)) continue;
        const k = idx(cellX(x), cellZ(z));
        placements.push({ type: 'lantern', x, z, y: voxToM(height[k]), yaw: p.yaw });
        placed++;
        if (placed >= 80) break;
      }
      if (placed >= 80) break;
    }
  }
  // 城内街巷灯杆（每 8m 双侧交错；补城内实例密度）
  {
    for (const s of streets) {
      let acc = 0;
      for (const p of s) {
        acc += ROAD_STEP;
        if (acc < 8) continue;
        acc = 0;
        for (const side of [1, -1]) {
          const nx = Math.cos(p.yaw + Math.PI / 2) * side * 3.2;
          const nz = -Math.sin(p.yaw + Math.PI / 2) * side * 3.2;
          const x = p.x + nx, z = p.z + nz;
          if (nearAny(x, z, 1.2)) continue;
          const k = idx(cellX(x), cellZ(z));
          placements.push({ type: 'lantern', x, z, y: voxToM(height[k]), yaw: p.yaw });
        }
      }
    }
  }
  // 城内街块绿化（阔叶树，块角空地）
  {
    for (let gx = -3; gx <= 3; gx++) {
      for (let gz = -3; gz <= 3; gz++) {
        const bx = CITY.cx + gx * 16 + 8, bz = CITY.cz + gz * 16 + 8;
        if (!cityIn(bx, bz, 12)) continue;
        for (const [qx, qz] of [[4.5, 4.5], [-4.5, 4.5], [4.5, -4.5], [-4.5, -4.5]]) {
          if (rng() < 0.45) continue;
          const x = bx + qx, z = bz + qz;
          const k = idx(cellX(x), cellZ(z));
          if (mat[k] !== MAT.GRASS) continue;
          if (!padOK(x, z, 0, 0.8, 0.8, 0.3)) continue;
          placements.push({ type: 'leafTree', x, z, y: voxToM(height[k]), yaw: rng() * TAU });
        }
      }
    }
  }

  // —— 11) 桥放置与统计 ——
  for (const b of bridges) placements.push({ type: 'bridge', x: b.x, z: b.z, y: b.y, yaw: b.yaw });

  let roadCells = 0;
  for (let i = 0; i < mat.length; i++) if (mat[i] === MAT.ROAD || mat[i] === MAT.PAVE) roadCells++;
  const inCity = placements.filter((p) => cityIn(p.x, p.z, 0)).length;

  return {
    world: W,
    placements,
    bridges,
    roadPts: { main, mountain, ring, lake, streets },
    stats: { roadCells, roadPct: roadCells / (GRID * GRID), placements: placements.length, cityPlacements: inCity, bridges: bridges.length },
  };
}
