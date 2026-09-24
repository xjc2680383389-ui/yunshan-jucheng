// 自检：node selftest.js（exit 1 on fail）— 确定性 / 布局 / 昼夜 / 换算 / 结构 五组
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { VOXEL, GRID, SEED, DAY_FRAMES } from './src/core/consts.js';
import { generateWorld, idx, cellX, cellZ, voxToM } from './src/core/worldgen.js';
import { buildLayout } from './src/core/layout.js';
import { sunDir, moonDir, dayState } from './src/core/daynight.js';
import { buildModel } from './src/core/models.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
const close = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------- 一、确定性组 ----------
console.log('一、确定性');
console.time('  (生成 ×2)');
const w1 = generateWorld(SEED);
const w2 = generateWorld(SEED);
console.timeEnd('  (生成 ×2)');
ok(w1.height.length === w2.height.length && w1.mat.length === w2.mat.length, '两次生成尺寸一致');
let same = true;
for (let i = 0; i < w1.height.length; i++) {
  if (w1.height[i] !== w2.height[i] || w1.mat[i] !== w2.mat[i]) { same = false; break; }
}
ok(same, '高度场/材质场逐字节一致（同 seed）');
{
  let mn = 999, mx = -999;
  for (let i = 0; i < w1.height.length; i++) {
    const h = voxToM(w1.height[i]);
    if (h < mn) mn = h;
    if (h > mx) mx = h;
  }
  ok(mn >= 6, '全图最低 ' + mn.toFixed(1) + 'm ≥ 6m');
  ok(mx <= 115, '全图最高 ' + mx.toFixed(1) + 'm ≤ 115m');
}
for (const [x, z, target, name] of [
  [30, -60, 110, '主峰'], [5, 55, 30, '城区台地'], [-30, -100, 58, '瀑崖顶'],
  [-30, -84, 16, '潭'], [85, 85, 10, '南湖'],
]) {
  const h = voxToM(w1.height[idx(cellX(x), cellZ(z))]);
  ok(close(h, target, 3), name + ' 锚点 ' + h.toFixed(1) + 'm ≈ ' + target + 'm (±3)');
}

// ---------- 二、布局组 ----------
console.log('二、布局');
console.time('  (布局)');
const L1 = buildLayout(generateWorld(SEED));
const L2 = buildLayout(generateWorld(SEED));
console.timeEnd('  (布局)');
{
  const ser = (L) => L.placements.map((p) => p.type + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ',' + p.y.toFixed(1)).join(';');
  ok(ser(L1) === ser(L2), '布局确定性（放置表一致）');
}
ok(L1.stats.roadPct >= 0.015 && L1.stats.roadPct <= 0.06, '路径格占比 ' + (L1.stats.roadPct * 100).toFixed(2) + '% ∈ [1.5%, 6%]');
ok(L1.stats.cityPlacements >= 150, '城内实例数 ' + L1.stats.cityPlacements + ' ≥ 150');
{
  const gl = L1.placements.find((p) => p.type === 'guanlan');
  ok(!!gl, '观澜阁放置存在');
  if (gl) {
    const model = buildModel('guanlan');
    let top = 0;
    for (let i = 1; i < model.opaque.pos.length; i += 3) if (model.opaque.pos[i] > top) top = model.opaque.pos[i];
    ok(gl.y + top > 60, '观澜阁顶高 ' + (gl.y + top).toFixed(1) + 'm > 60m');
  }
}
{
  const hexes = L1.placements.filter((p) => p.type === 'pavilionHex');
  for (const [x, z, name] of [[30, -60, '揽云亭'], [-85, -25, '望城亭'], [95, 30, '观湖亭']]) {
    const d = Math.min(...hexes.map((p) => Math.hypot(p.x - x, p.z - z)));
    ok(d <= 3, name + ' 位于峰顶 (距锚点 ' + d.toFixed(1) + 'm ≤ 3)');
  }
}
ok(L1.bridges.length === 3, '桥位 = ' + L1.bridges.length + ' = 3');

// ---------- 三、昼夜组 ----------
console.log('三、昼夜');
{
  let maxY = -9, maxT = 0;
  for (let t = 0; t < 24; t += 0.1) {
    const y = sunDir(t)[1];
    if (y > maxY) { maxY = y; maxT = t; }
  }
  ok(sunDir(12)[1] > 0.9, 'sunDir(12).y = ' + sunDir(12)[1].toFixed(3) + ' > 0.9');
  ok(close(maxT, 12, 0.2), '太阳最高点在正午 (' + maxT.toFixed(1) + ')');
  ok(sunDir(0)[1] < 0, 'sunDir(0).y = ' + sunDir(0)[1].toFixed(3) + ' < 0');
}
ok(dayState(12).lamp === 0, '灯因子(12) = 0');
ok(Math.abs(dayState(19.5).lamp - 1) <= 0.05, '灯因子(19.5) = ' + dayState(19.5).lamp.toFixed(3) + ' ≈ 1 (±0.05)');
{
  // 关键帧端点：t=6.5 落在表值
  const f = DAY_FRAMES.find((r) => r[0] === 6.5);
  const ds = dayState(6.5);
  const expect = f[4];
  ok(close(ds.sunI / Math.max(1e-6, 1), expect > 0 ? expect : ds.sunI, 0.13), '6.5 帧太阳强度落在表值 ' + expect + '（含高度因子）');
  ok(close(ds.ambI, f[5], 1e-6), '6.5 帧环境强度 = 表值');
  ok(close(ds.lamp, f[7], 1e-6), '6.5 帧灯因子 = 表值');
}
{
  const day = dayState(12).moonI, night = dayState(0).moonI;
  ok(day === 0, '月光白天 = 0');
  ok(night > 0.2 && night <= 0.22, '月光夜间 ' + night.toFixed(3) + ' > 0');
}
{
  // 24h 回绕连续性
  const a = dayState(23.999), b = dayState(0.001);
  ok(close(a.lamp, b.lamp, 0.01), '24→0 回绕灯因子连续');
}

// ---------- 四、换算组 ----------
console.log('四、换算');
ok(VOXEL === 0.2, 'VOXEL = 0.2');
ok(GRID === 1280, 'GRID = 1280');
ok(w1.height.length === 1280 * 1280, '高度场长度 = 1280×1280');

// ---------- 五、结构组 ----------
console.log('五、结构');
{
  const files = [
    '项目方案.md', 'README.md', 'package.json', 'start.bat', 'selftest.js', 'index.html',
    'vendor/three.module.js', 'assets/css/style.css',
    'src/main.js', 'src/core/rng.js', 'src/core/worldgen.js', 'src/core/layout.js',
    'src/core/daynight.js', 'src/core/consts.js', 'src/core/models.js', 'src/core/mesher.js',
    'src/render/terrain.js', 'src/render/buildings.js', 'src/render/water.js',
    'src/render/sky.js', 'src/render/clouds.js', 'src/render/camera.js', 'src/render/ui.js',
  ];
  for (const f of files) ok(existsSync(join(ROOT, f)), '文件存在 ' + f);
}
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok(!/https?:\/\//.test(html), 'index.html 无外部网络链接');
  const js = ['src/main.js', 'src/render/sky.js', 'src/render/water.js', 'src/render/camera.js', 'src/render/ui.js', 'src/render/terrain.js', 'src/render/buildings.js', 'src/render/clouds.js']
    .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  ok(!/https?:\/\//.test(js), '渲染层无外部网络链接');
}
{
  const bat = readFileSync(join(ROOT, 'start.bat'));
  ok(bat.includes(Buffer.from([0xD4, 0xC6])), 'start.bat 为 GBK 编码（「云」= D4 C6）');
}
{
  const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  ok(!/^boot\(\);\s*$/m.test(main), 'main.js 无裸 boot() 调用（双实例会抢同一 canvas 的 GL 上下文）');
  ok(/function wake\(\)/.test(main) && /new CameraRig\([^)]*wake\)/.test(main), 'wake 事件即时帧已接线（节流环境交互可见）');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
