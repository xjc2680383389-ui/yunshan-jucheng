// 建筑渲染：放置表 → 构件烘焙 → InstancedMesh（THREE 粘合层）
// 发光几何：窗/灯笼各一份 MeshBasicMaterial，颜色由昼夜灯因子驱动（main 每帧改 material.color）
import * as THREE from '../../vendor/three.module.js';
import { buildModel } from '../core/models.js';
import { PAL, SEED } from '../core/consts.js';
import { makeRng } from '../core/rng.js';

function toGeo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nrm), 3));
  g.setIndex(b.idx);
  return g;
}

export function buildBuildings(placements) {
  const group = new THREE.Group();
  const byType = {};
  for (const p of placements) (byType[p.type] = byType[p.type] || []).push(p);

  const windowMat = new THREE.MeshBasicMaterial({ color: PAL.windowDay });
  const lanternMat = new THREE.MeshBasicMaterial({ color: PAL.lanternNight });
  const opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const rng = makeRng(SEED + ':tint');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
  const v3 = new THREE.Vector3(1, 1, 1), col = new THREE.Color();

  for (const type of Object.keys(byType)) {
    const list = byType[type];
    const baked = buildModel(type);
    const parts = [
      [baked.opaque, opaqueMat, true],
      [baked.win, windowMat, false],
      [baked.lantern, lanternMat, false],
    ];
    for (const [bucket, material, castShadow] of parts) {
      if (!bucket.idx.length) continue;
      const mesh = new THREE.InstancedMesh(toGeo(bucket), material, list.length);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        eu.set(0, -p.yaw, 0);
        q.setFromEuler(eu);
        m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, v3);
        mesh.setMatrixAt(i, m4);
        if (castShadow && rng() < 1) {
          const t = 0.92 + rng() * 0.16;   // 同构件轻微色差
          col.setRGB(t, t, t);
          mesh.setColorAt(i, col);
        }
      }
      mesh.castShadow = castShadow;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
  }
  return { group, windowMat, lanternMat };
}
