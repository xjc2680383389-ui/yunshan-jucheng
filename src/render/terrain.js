// 地形渲染：mesher 输出 → 64 chunk BufferGeometry（THREE 粘合层）
import * as THREE from '../../vendor/three.module.js';
import { meshChunk } from '../core/mesher.js';

const MERGE_TOL = 1; // 预算实测：tol=1 → 地形约 137 万 tri

export function buildTerrainChunk(world, cx, cz) {
  const q = meshChunk(world, cx, cz, MERGE_TOL);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(q.pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(q.col), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(q.nrm), 3));
  g.setIndex(q.idx);
  const mesh = new THREE.Mesh(g, terrainMaterial());
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

let _mat = null;
function terrainMaterial() {
  if (!_mat) _mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return _mat;
}
