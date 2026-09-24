// 全局常量与布局事实源（唯一来源，其余模块只读不定义）
// 坐标约定：原点=世界中心，+X 东、+Z 南、-Z 北；h 为海拔米。

export const VOXEL = 0.2;              // 体素边长（米）
export const WORLD_M = 256;            // 世界边长（米）
export const GRID = 1280;              // 底面格数（WORLD_M / VOXEL）
export const HALF = WORLD_M / 2;       // 128
export const SEED = 'yunshan-jucheng-2026';

// ---- 地表材质字节 ----
export const MAT = { GRASS: 0, ROCK: 1, CLIFF: 2, SNOW: 3, SAND: 4, CREEK: 5, ROAD: 6, PAVE: 7 };

// ---- 调色板（4.1 / 4.3）----
export const PAL = {
  grass: 0x6E8F5A, rock: 0x8A8578, cliff: 0x7B7466, snow: 0xE8ECEF,
  sand: 0xC9BC96, creek: 0x9AA0A8, road: 0xB3A98F, pave: 0xADA08A,
  woodDark: 0x7A3B30, red: 0xA63C2E, wall: 0xD8D2C4, tile: 0x4A4E57,
  eave: 0x3A3E46, gold: 0xD9A441, trunk: 0x6B5138, pine: 0x3E5C46,
  leaf: 0x5E7C4A, water: 0x5E8CA8,
  windowDay: 0x6B6B60, windowNight: 0xFFC964, lanternNight: 0xFF6A4A,
};

// ---- 地形锚点（3.1，按序应用，后应用者胜）----
// { x, z, h(目标海拔m), r(半径m) }
export const ANCHORS = [
  { x: 30, z: -60, h: 110, r: 36 },   // 主峰
  { x: -85, z: -25, h: 76, r: 30 },   // 峰二（望城亭）
  { x: 95, z: 30, h: 62, r: 26 },     // 峰三（观湖亭）
  { x: 75, z: -95, h: 54, r: 22 },    // 峰四
  { x: 5, z: 55, h: 30, r: 46 },      // 城区台地
  { x: -30, z: -100, h: 58, r: 20 },  // 瀑崖平台
  { x: -30, z: -84, h: 16, r: 13 },   // 潭
  { x: -42, z: -68, h: 13, r: 9 },    // 溪锚1
  { x: -50, z: -40, h: 12, r: 9 },    // 溪锚2
  { x: -52, z: -8, h: 12, r: 9 },     // 溪锚3
  { x: -48, z: 28, h: 13, r: 9 },     // 溪锚4
  { x: -30, z: 60, h: 14, r: 10 },    // 溪锚5
  { x: 0, z: 95, h: 12, r: 10 },      // 溪锚6
  { x: 18, z: 128, h: 10, r: 8 },     // 溪出口（南缘豁口）
  { x: 85, z: 85, h: 10, r: 30 },     // 南湖
];

// 瀑布崖壁断面（3.1 瀑布链路：崖顶58 → 中台36 → 潭16，两级近垂直跌水）
// 断面沿 z 生效于 x∈[-30±W]，使两级跌落在 1.2m 水平距内完成（视觉垂直崖壁体素）
export const FALLS = {
  cx: -30, halfW: 8, blendW: 16,           // 中心 / 全权重半宽 / 混合外沿
  zTop: -97, zMid1: -95.8, zMid2: -92, zMid3: -90.8, // 崖顶沿 / 一级跌落止 / 中台止 / 二级跌落止
  hTop: 58, hMid: 36, hBot: 16,
};

// ---- 溪流中心线（潭 → 溪锚1..6 → 出口，h=谷底海拔）----
export const CREEK = [
  { x: -30, z: -84, h: 16 }, { x: -42, z: -68, h: 13 }, { x: -50, z: -40, h: 12 },
  { x: -52, z: -8, h: 12 }, { x: -48, z: 28, h: 13 }, { x: -30, z: 60, h: 14 },
  { x: 0, z: 95, h: 12 }, { x: 18, z: 128, h: 10 },
];
export const CREEK_HALF_W = 2.5;   // 河床半宽（m）
export const CREEK_SAND_W = 5.0;   // 滩沙外沿（m）

// ---- 水面（椭圆）----
export const POOL_WATER = { x: -30, z: -84, rx: 8, rz: 8, y: 16.1 };   // 潭（半径收小：山道起点须陆地）
export const LAKE_WATER = { x: 88, z: 92, rx: 14, rz: 14, y: 10.1 };   // 南湖（偏东北：湖畔亭/望湖路须陆地）

// ---- 城墙椭圆与四门（3.2）----
export const CITY = { cx: 5, cz: 55, a: 48, b: 42 };
export const GATES = [
  { x: 5, z: 97, name: 'south' }, { x: 5, z: 13, name: 'north' },
  { x: 53, z: 55, name: 'east' }, { x: -43, z: 55, name: 'west' },
];
export const PLAZA = { x: 5, z: 62, r: 12 };
export const PAGODA = { x: 5, z: 28 };
export const GUANLAN = { x: -18, z: -90, baseH: 22, topH: 66 };

// ---- 道路（3.3 waypoint 折线）----
export const ROAD_MAIN = [
  [12, 126], [8, 110], [5, 97], [5, 62], [5, 30], [5, 13],
  [0, -8], [-14, -38], [-30, -64], [-34, -80], [-18, -90],
];
export const ROAD_MOUNTAIN = [
  [-24, -78], [-8, -76], [8, -78], [18, -72], [10, -66],
  [24, -60], [16, -54], [28, -48], [30, -60],
];
export const ROAD_LAKE = [[53, 55], [75, 70], [82, 78]];
export const ROAD_HALF = 1.2;    // 路半宽（m），总宽 2.4m
export const ROAD_STEP = 0.4;         // 采样步长（m）

// ---- 亭（3.2）----
export const PAVILIONS = [
  { x: 30, z: -60, type: 'hex', name: '揽云亭' },
  { x: -85, z: -25, type: 'hex', name: '望城亭' },
  { x: 95, z: 30, type: 'hex', name: '观湖亭' },
  { x: 82, z: 78, type: 'hex', name: '湖畔亭' },
  { x: -1, z: 56, type: 'sq' }, { x: 11, z: 68, type: 'sq' },        // 广场角方亭
  { x: 1.5, z: 44, type: 'sq' }, { x: 8.5, z: 50, type: 'sq' },      // 主路廊亭
  { x: 1.5, z: 74, type: 'sq' }, { x: 8.5, z: 80, type: 'sq' },
];

// ---- 昼夜关键帧（5.3，t 小时，线性插值，24 回绕同 0）----
// [t, 天顶色, 地平色, 太阳色, 太阳强度, 环境强度, 雾色, 灯因子, 星因子]
export const DAY_FRAMES = [
  [0.0, 0x070B18, 0x10182C, 0x000000, 0.0, 0.30, 0x141D2E, 1.0, 1.0],
  [5.0, 0x0B1226, 0x1E2A44, 0x000000, 0.0, 0.35, 0x1B2438, 1.0, 0.6],
  [6.5, 0x2E3B63, 0xE8935C, 0xFF9E5A, 1.1, 0.55, 0x8A6E63, 0.85, 0.0],
  [8.0, 0x5E86C4, 0xBFD2E8, 0xFFF2DC, 2.0, 0.80, 0xA8BEDC, 0.0, 0.0],
  [12.0, 0x4E7BC8, 0xC9DAEC, 0xFFF6E8, 2.4, 0.95, 0xB8CBE0, 0.0, 0.0],
  [17.5, 0x3A4C86, 0xE8A05C, 0xFFAF6E, 1.2, 0.65, 0x9A8578, 0.5, 0.0],
  [19.0, 0x1A2547, 0xD96E4A, 0xFF7B4A, 0.4, 0.45, 0x5C4A52, 0.95, 0.15],
  [20.5, 0x0C1428, 0x22304E, 0x000000, 0.0, 0.33, 0x182236, 1.0, 0.7],
  [24.0, 0x070B18, 0x10182C, 0x000000, 0.0, 0.30, 0x141D2E, 1.0, 1.0],
];

// ---- 雾距离（4.7：正午 80/420，夜 40/260，晨雾 25/160）----
export const FOG = { dayNear: 80, dayFar: 420, nightNear: 40, nightFar: 260, mistNear: 25, mistFar: 160, mistCenter: 6.5, mistWidth: 1.2 };

// ---- 性能 ----
export const CHUNK_CELLS = 160;       // 32m / 0.2m
export const CHUNK_COUNT = 8;         // 8×8 = 64 chunk
export const TRI_BUDGET = 2_500_000;
