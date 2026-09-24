// 云团：体素椭球并集烘焙半透明白团 × 8，向东漂移回绕（THREE 粘合层）
import * as THREE from '../../vendor/three.module.js';
import { makeRng } from '../core/rng.js';

const CS = 1.2; // 云体素

function bakeBlob(rng) {
  const m = new Map();
  const key = (x, y, z) => ((x + 32) * 64 + (y + 32)) * 64 + (z + 32);
  const has = (x, y, z) => m.has(key(x, y, z));
  const puffs = [];
  const nP = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nP; i++) {
    puffs.push({
      x: (rng() - 0.5) * 18, y: (rng() - 0.5) * 2.5, z: (rng() - 0.5) * 7,
      rx: 5 + rng() * 5, ry: 1.6 + rng() * 1.2, rz: 3 + rng() * 2.5,
    });
  }
  for (let x = -22; x <= 22; x++) for (let y = -4; y <= 4; y++) for (let z = -8; z <= 8; z++) {
    const wx = x * CS, wy = y * CS, wz = z * CS;
    for (const p of puffs) {
      const dx = (wx - p.x) / (p.rx * 2), dy = (wy - p.y) / (p.ry * 2), dz = (wz - p.z) / (p.rz * 2);
      if (dx * dx + dy * dy + dz * dz <= 1) { m.set(key(x, y, z), 1); break; }
    }
  }
  // 面剔除
  const FACES = [
    { n: [1, 0, 0], c: [[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]] },
    { n: [-1, 0, 0], c: [[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]] },
    { n: [0, 0, -1], c: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
  ];
  const pos = [], idx = [];
  for (const [k] of m) {
    const z = (k % 64) - 32, r = Math.floor(k / 64);
    const y = (r % 64) - 32, x = Math.floor(r / 64) - 32;
    for (const f of FACES) {
      if (has(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
      const v0 = pos.length / 3;
      for (const c of f.c) pos.push((x + c[0]) * CS, (y + c[1]) * CS, (z + c[2]) * CS);
      idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildClouds(scene) {
  const rng = makeRng('yunshan-clouds');
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
  });
  const geo = bakeBlob(rng);
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    const y = 82 + rng() * 26;
    mesh.position.set((rng() - 0.5) * 280, y, (rng() - 0.5) * 240);
    mesh.scale.setScalar(0.8 + rng() * 0.8);
    mesh.renderOrder = 5;
    scene.add(mesh);
    clouds.push({ mesh, speed: 0.5 + rng() * 0.7 });
  }
  function update(dt) {
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 160) c.mesh.position.x = -160;
    }
  }
  return { update };
}
