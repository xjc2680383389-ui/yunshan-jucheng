// 入口：载入流程（分帧生成→进度）→ 场景装配 → 主循环
import * as THREE from '../vendor/three.module.js';
import { SEED, PAL } from './core/consts.js';
import { generateWorld, heightAtM } from './core/worldgen.js';
import { buildLayout } from './core/layout.js';
import { dayState } from './core/daynight.js';
import { buildTerrainChunk } from './render/terrain.js';
import { buildBuildings } from './render/buildings.js';
import { buildWater } from './render/water.js';
import { buildSky, buildNightLights } from './render/sky.js';
import { buildClouds } from './render/clouds.js';
import { CameraRig } from './render/camera.js';
import { initUI } from './render/ui.js';
import { buildModel, MODEL_DEFS } from './core/models.js';

const params = new URLSearchParams(location.search);
// 载入期分帧让出：前台≈60fps，节流环境自动降频（rAF 死火时 setTimeout 兜底）
const frame = () => new Promise((r) => setTimeout(r, params.has('shot') ? 0 : 16));
const CHUNKS = 8; // 8×8

async function boot() {
  // ---- 渲染器 / 场景 ----
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // 不 setSize 的话 drawing buffer 停在 canvas 默认 300×150，被 CSS 拉伸到全屏会严重模糊
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xB8CBE0, 80, 420);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 1400);

  const ui = initUI({
    onMode: (m) => {
      if (m === 'walk') rig.requestWalk();
      else rig.setMode(m, m === 'tour' ? tourData : null);
      wake();
    },
    onPlay: () => { paused = !paused; ui.setPlay(paused); wake(); },
    onSpeed: (v) => { speed = v; },
    onScrub: (v) => { timeH = v; wake(); },
    onPerf: (on) => { applyPerf(on); wake(); },
    isScrubbing: () => scrubbing,
  });
  let scrubbing = false;
  ui.slider && ui.slider.addEventListener('pointerdown', () => { scrubbing = true; });
  ui.slider && ui.slider.addEventListener('pointerup', () => { scrubbing = false; });

  ui.setProgress(0.04);
  await frame();

  // ---- 世界生成与布局（纯逻辑，同步）----
  const world = generateWorld(SEED);
  ui.setProgress(0.1); await frame();
  const layout = buildLayout(world);
  const heightAt = (x, z) => heightAtM(layout.world, x, z);
  ui.setProgress(0.16); await frame();

  // ---- 地形 64 chunk 分帧 ----
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      scene.add(buildTerrainChunk(layout.world, cx, cz));
      if ((cx + cz * CHUNKS) % 4 === 3) {
        ui.setProgress(0.16 + 0.5 * ((cx + cz * CHUNKS + 1) / 64));
        await frame();
      }
    }
  }

  // ---- 构件预热（逐个让出主线程）----
  const types = [...new Set(layout.placements.map((p) => p.type))].filter((t) => MODEL_DEFS[t]);
  for (let i = 0; i < types.length; i++) {
    buildModel(types[i]);
    ui.setProgress(0.66 + 0.2 * ((i + 1) / types.length));
    if (i % 2 === 1) await frame();
  }
  const built = buildBuildings(layout.placements);
  scene.add(built.group);

  // ---- 水 / 云 / 天空 / 灯 ----
  const water = buildWater(scene);
  const clouds = buildClouds(scene);
  const sky = buildSky(scene);
  const nightLights = buildNightLights(scene, () => lampF);
  ui.setProgress(0.97); await frame();

  // ---- 巡游曲线（主路全程 → 退回 → 山道 → 峰顶）----
  const every = (s, step) => {
    const out = [];
    for (let i = 0; i < s.length; i += step) out.push(new THREE.Vector3(s[i].x, heightAt(s[i].x, s[i].z) + 2.6, s[i].z));
    const e = s[s.length - 1];
    out.push(new THREE.Vector3(e.x, heightAt(e.x, e.z) + 2.6, e.z));
    return out;
  };
  const mainPts = every(layout.roadPts.main, 6);
  // 原路退回至山道口附近（主路最接近 (-30,-64) 的点）
  let cut = 0, bd = 1e9;
  for (let i = 0; i < mainPts.length; i++) {
    const d = (mainPts[i].x + 30) ** 2 + (mainPts[i].z + 64) ** 2;
    if (d < bd) { bd = d; cut = i; }
  }
  const back = mainPts.slice(cut, mainPts.length - 1).reverse();
  const mPts = every(layout.roadPts.mountain, 6);
  const tourPts = [...mainPts, ...back, ...mPts];
  const curve = new THREE.CatmullRomCurve3(tourPts, false, 'centripetal', 0.2);
  const tourLen = curve.getLength();
  // 兴趣点弧长定位
  const pois = [
    { x: 5, z: 97, y: 0, name: 'southGate' }, { x: 5, z: 28, y: 20 },
    { x: -18, z: -90, y: 34 }, { x: -30, z: -84, y: 34 }, { x: 30, z: -60, y: 12 },
  ].map((p) => {
    let bu = 0, bdist = 1e9;
    for (let i = 0; i <= 600; i++) {
      const pt = curve.getPointAt(i / 600);
      const d = (pt.x - p.x) ** 2 + (pt.z - p.z) ** 2;
      if (d < bdist) { bdist = d; bu = i / 600; }
    }
    return { pos: new THREE.Vector3(p.x, heightAt(p.x, p.z) + p.y, p.z), s: bu * tourLen };
  });
  const tourData = { curve, len: tourLen, pois };

  // ---- 相机 ----
  const rig = new CameraRig(camera, canvas, heightAt, wake);
  let introT = 0, introDone = params.has('shot') || params.has('cam');
  const introFrom = new THREE.Vector3(-12, 92, 170);
  const introLook = new THREE.Vector3(-4, 38, -70);
  const cancelIntro = () => { introDone = true; };
  window.addEventListener('pointerdown', cancelIntro, { once: false });
  window.addEventListener('wheel', cancelIntro, { passive: true });
  window.addEventListener('keydown', cancelIntro);

  // ---- 昼夜状态 ----
  let timeH = params.has('t') ? parseFloat(params.get('t')) : 9.0;
  let paused = params.has('pause');
  let speed = 360;
  let lampF = 0;
  const WIN_DAY = new THREE.Color(PAL.windowDay), WIN_NIGHT = new THREE.Color(PAL.windowNight);
  const LAN_DAY = new THREE.Color(PAL.windowDay), LAN_NIGHT = new THREE.Color(PAL.lanternNight);
  const tmpC = new THREE.Color();

  // 定点相机预设（无头截图用）
  const camPresets = {
    opening: () => { camera.position.set(-8, 88, 176); camera.lookAt(-4, 34, -66); },
    peak: () => { camera.position.set(30, 128, -26); camera.lookAt(30, 106, -60); },
    falls: () => { camera.position.set(-16, 44, -54); camera.lookAt(-27, 30, -90); },
    city: () => { camera.position.set(5, 78, 142); camera.lookAt(5, 30, 55); },
  };

  let perfOn = false;
  function applyPerf(on) {
    perfOn = on;
    renderer.shadowMap.enabled = !on;
    renderer.setPixelRatio(on ? 1 : Math.min(devicePixelRatio, 2));
    scene.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh) && o.material) o.material.needsUpdate = true;
    });
  }

  // 窗口尺寸变化：同步投影与 drawing buffer，否则 canvas 被拉伸发糊
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---- 主循环 ----
  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsN = 0, fpsShown = 60;
  let mode = 'orbit';

  // rAF 前台 vsync 驱动；IAB/后台页 rAF 可能死火，setTimeout 兜底（被节流则自动降频）。
  // ran 防同轮双跑即可——门限拦截会导致链断（拦截后无人续链，页面冻结）。
  function scheduleTick() {
    let ran = false;
    const run = () => { if (ran) return; ran = true; tick(); };
    requestAnimationFrame(run);
    setTimeout(run, 16);
  }
  function tick() {
    scheduleTick();
    tickBody(Math.min(clock.getDelta(), 0.1));
  }
  // 事件驱动的即时帧：节流环境下保证点击/拖拽立即可见（dt=0，不推进时间与动画）
  let wakeAt = 0;
  function wake() {
    const now = performance.now();
    if (now - wakeAt < 100) return;
    wakeAt = now;
    tickBody(0);
  }
  function tickBody(dt) {
    if (!paused) timeH = (timeH + (dt * speed) / 3600) % 24;
    const ds = dayState(timeH);
    lampF = ds.lamp;

    sky.update(ds);
    nightLights.update();
    scene.fog.color.setRGB(ds.fogCol[0], ds.fogCol[1], ds.fogCol[2]);
    scene.fog.near = ds.fogNear;
    if (!perfOn) scene.fog.far = ds.fogFar;
    tmpC.lerpColors(WIN_DAY, WIN_NIGHT, ds.lamp);
    built.windowMat.color.copy(tmpC);
    tmpC.lerpColors(LAN_DAY, LAN_NIGHT, ds.lamp);
    built.lanternMat.color.copy(tmpC);
    water.update(dt);
    clouds.update(dt);

    // 相机
    if (!introDone) {
      introT += dt;
      const u = Math.min(introT / 2.5, 1);
      const e = 1 - Math.pow(1 - u, 3);
      camera.position.set(-8, 96 + (88 - 96) * e, 178);
      camera.lookAt(introLook);
      if (u >= 1) {
        introDone = true;
        rig.target.set(6, 30, -20);
        rig.r = 190; rig.theta = 0; rig.phi = 0.32;
      }
    } else if (params.has('cam') && camPresets[params.get('cam')]) {
      camPresets[params.get('cam')]();
    } else {
      rig.update(dt);
    }

    ui.setTime(timeH);
    if (dt > 0) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc >= 0.5) { fpsShown = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; ui.setFPS(fpsShown); }
    }
    renderer.render(scene, camera);
  }
  tick();

  if (params.has('fpsbeacon')) {
    setTimeout(() => { try { fetch('/fps-beacon-' + Math.round(fpsShown)); } catch (e) {} }, 15000);
  }
  if (params.has('autotest')) {
    window.addEventListener('error', (e) => {
      document.getElementById('autotest').dataset.status = 'ERR:' + e.message;
    });
    setTimeout(() => {
      const el = document.getElementById('autotest');
      if (el.dataset.status !== 'ERR:undefined') {
        const inf = renderer.info.render;
        el.dataset.status = 'OK';
        el.dataset.tri = inf.triangles;
        el.dataset.calls = inf.calls;
      }
      el.textContent = 'status=' + el.dataset.status + ' tri=' + el.dataset.tri + ' calls=' + el.dataset.calls;
    }, 2500);
  }

  ui.hideLoading();
  ui.setPlay(paused);
}

window.addEventListener('error', (e) => {
  const el = document.getElementById('err');
  if (el) { el.textContent = '出错了：' + (e.message || e.type); el.style.display = 'block'; }
});
window.addEventListener('unhandledrejection', (e) => {
  const el = document.getElementById('err');
  if (el) { el.textContent = '出错了：' + (e.reason && e.reason.message || e.reason); el.style.display = 'block'; }
});
boot().catch((e) => {
  const el = document.getElementById('err');
  if (el) { el.textContent = '出错了：' + (e && e.message || e); el.style.display = 'block'; }
  console.error(e);
});
