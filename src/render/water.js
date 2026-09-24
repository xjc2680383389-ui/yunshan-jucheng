// 水效：溪带（谷底线插值）+ 潭/湖椭圆 + 两级瀑布滚动 CanvasTexture + 泡沫环 + 雾团
import * as THREE from '../../vendor/three.module.js';
import { CREEK, POOL_WATER, LAKE_WATER, FALLS, PAL } from '../core/consts.js';

function waterMaterial(timeU) {
  const mat = new THREE.MeshLambertMaterial({
    color: PAL.water, transparent: true, opacity: 0.78, side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y += sin(position.x*0.8+uTime*1.6)*0.05 + sin(position.z*0.6+uTime)*0.04;');
  };
  return mat;
}

// 溪流带：顶点取各锚点 h+0.12，宽度 5m
function creekMesh(mat) {
  const pts = CREEK;
  const n = pts.length;
  const pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * 2.5, nz = dx / l * 2.5;   // 半宽 2.5m
    pos.push(pts[i].x + nx, pts[i].h + 0.12, pts[i].z + nz);
    pos.push(pts[i].x - nx, pts[i].h + 0.12, pts[i].z - nz);
  }
  for (let i = 0; i < n - 1; i++) {
    const v = i * 2;
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function fallTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7FA8C4';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#FFFFFF' : '#5E88A8';
    g.fillRect((i * 5 + 2) % 62, 0, 3, 256);
  }
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 8; i++) g.fillRect((i * 8 + 1) % 60, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildWater(scene) {
  const group = { timeU: { value: 0 }, update: null };
  const timeU = group.timeU;
  const mat = waterMaterial(timeU);

  scene.add(creekMesh(mat));

  // 潭 / 湖
  for (const w of [POOL_WATER, LAKE_WATER]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w.rx, w.rz, 1);
    m.position.set(w.x, w.y, w.z);
    scene.add(m);
  }

  // 瀑布两级（竖直平面 + 纹理下滚；顶端没入溢流口，底端没入潭面）
  const tex = fallTexture();
  const falls = [];
  const mkFall = (w, yTop, yBot, z, yTex) => {
    const m = new THREE.MeshBasicMaterial({
      map: tex.clone(), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    m.map.needsUpdate = true;
    m.map.repeat.set(2, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, yTop - yBot), m);
    mesh.position.set(FALLS.cx, (yTop + yBot) / 2, z);
    mesh.renderOrder = 4;
    scene.add(mesh);
    falls.push({ m, yTex });
  };
  mkFall(14, FALLS.hTop + 0.2, FALLS.hMid - 0.4, -96.4, 1.6);   // 上级 58→36
  mkFall(18, FALLS.hMid + 0.2, FALLS.hBot - 0.4, -91.4, 1.1);   // 下级 36→16

  // 崖顶溢流水膜 + 中台水面
  const strip = (w, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
  };
  strip(10, 3, FALLS.cx, FALLS.hTop + 0.12, -98.5);   // 溢流口
  strip(10, 3.6, FALLS.cx, FALLS.hMid + 0.12, -93.9); // 中台

  // 泡沫环（潭缘白沫脉动）
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
  });
  const foam = new THREE.Mesh(new THREE.RingGeometry(6.2, 8.6, 40), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(POOL_WATER.x, POOL_WATER.y + 0.08, POOL_WATER.z);
  foam.scale.set(1, 0.62, 1);
  foam.renderOrder = 5;
  scene.add(foam);

  // 潭上雾团 ×4（billboard 缓慢起伏）
  const mistTex = mistTexture();
  const mists = [];
  for (let i = 0; i < 4; i++) {
    const sm = new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    const s = new THREE.Sprite(sm);
    s.scale.set(9 + i * 1.5, 6 + i, 1);
    s.position.set(POOL_WATER.x + (i - 1.5) * 3.5, POOL_WATER.y + 2.5 + (i % 2), -88 + i * 1.4);
    s.renderOrder = 6;
    scene.add(s);
    mists.push({ s, m: sm, ph: i * 1.7, base: s.position.y });
  }

  let t = 0;
  group.update = (dt) => {
    t += dt;
    timeU.value = t;
    for (const f of falls) f.m.map.offset.y = -(t * 1.8) * f.yTex;
    foamMat.opacity = 0.34 + 0.14 * Math.sin(t * 2.2);
    for (const m of mists) {
      m.s.position.y = m.base + Math.sin(t * 0.3 + m.ph) * 0.9;
      m.m.opacity = 0.42 + 0.12 * Math.sin(t * 0.5 + m.ph);
    }
  };
  return group;
}
