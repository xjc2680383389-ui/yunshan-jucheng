// 昼夜循环（纯逻辑，node 可跑）：t(小时) → 天体方向/各色/强度/灯与星因子/雾距
import { DAY_FRAMES, FOG } from './consts.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hex2rgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];

// 关键帧预展开（含末帧 24=0 回绕）
const FRAMES = DAY_FRAMES.map((f) => ({
  t: f[0], zenith: hex2rgb(f[1]), horizon: hex2rgb(f[2]), sunCol: hex2rgb(f[3]),
  sunI: f[4], ambI: f[5], fogCol: hex2rgb(f[6]), lamp: f[7], star: f[8],
}));

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

// 太阳方向：06:00 东升 / 12:00 近天顶 / 18:00 西落
export function sunDir(t) {
  const th = ((t - 6) / 12) * Math.PI;
  return norm3(Math.cos(th) * 0.92, Math.sin(th), 0.35);
}
// 月亮方向（与太阳反相）
export function moonDir(t) {
  const th = ((t - 18) / 12) * Math.PI;
  return norm3(Math.cos(th) * 0.92, Math.sin(th), 0.35);
}

// 单色插值
function mix3(a, b, u) {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

// t → 完整昼夜状态（渲染每帧调用；纯函数无副作用）
export function dayState(t) {
  t = ((t % 24) + 24) % 24;
  let i = 0;
  while (i < FRAMES.length - 2 && t >= FRAMES[i + 1].t) i++;
  const A = FRAMES[i], B = FRAMES[i + 1];
  const u = (t - A.t) / (B.t - A.t);
  const sd = sunDir(t), md = moonDir(t);
  const dayl = clamp01((sd[1] + 0.08) / 0.2);   // 太阳地平上高度因子
  const moonl = clamp01((md[1] + 0.08) / 0.2);

  // 晨雾高斯包络（05–08 时谷中云雾）
  const dm = t - FOG.mistCenter;
  const mist = Math.exp(-(dm * dm) / (FOG.mistWidth * FOG.mistWidth));

  return {
    sunDir: sd,
    moonDir: md,
    zenith: mix3(A.zenith, B.zenith, u),
    horizon: mix3(A.horizon, B.horizon, u),
    sunCol: mix3(A.sunCol, B.sunCol, u),
    fogCol: mix3(A.fogCol, B.fogCol, u),
    sunI: lerp(A.sunI, B.sunI, u) * dayl,
    moonI: 0.22 * moonl,
    ambI: lerp(A.ambI, B.ambI, u),
    lamp: lerp(A.lamp, B.lamp, u),
    star: lerp(A.star, B.star, u),
    fogNear: lerp(lerp(FOG.nightNear, FOG.dayNear, dayl), FOG.mistNear, mist),
    fogFar: lerp(lerp(FOG.nightFar, FOG.dayFar, dayl), FOG.mistFar, mist),
  };
}
