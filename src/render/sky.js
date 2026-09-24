// 天空与光：反向大球 shader（方案 4.6 照抄）+ 星点 + 日/月平行光 + 半球环境光 + 夜灯
import * as THREE from '../../vendor/three.module.js';
import { makeRng } from '../core/rng.js';

const SKY_VERT = `
varying vec3 vPos;
void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
const SKY_FRAG = `
uniform vec3 cTop, cHor, sunDir, sunCol; uniform vec3 moonDir;
varying vec3 vPos;
void main(){
  vec3 d = normalize(vPos);
  float h = clamp(d.y*1.4+0.12, 0.0, 1.0);
  vec3 col = mix(cHor, cTop, pow(h, 0.8));
  float s  = max(dot(d, normalize(sunDir)), 0.0);
  float m  = max(dot(d, normalize(moonDir)), 0.0);
  col += sunCol * (pow(s,700.0)*3.0 + pow(s,18.0)*0.30);
  col += vec3(0.85,0.90,1.0) * pow(m,1200.0)*2.2;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildSky(scene) {
  const uniforms = {
    cTop: { value: new THREE.Color(0x4E7BC8) },
    cHor: { value: new THREE.Color(0xC9DAEC) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunCol: { value: new THREE.Color(0xFFF6E8) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // 星星：800 点 seeded 球面 y>0.05
  const rng = makeRng('yunshan-stars');
  const sp = new Float32Array(800 * 3);
  let n = 0;
  while (n < 800) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2;
    const y = u, r = Math.sqrt(Math.max(0, 1 - u * u));
    if (y <= 0.05) continue;
    sp[n * 3] = Math.cos(a) * r * 580; sp[n * 3 + 1] = y * 580; sp[n * 3 + 2] = Math.sin(a) * r * 580;
    n++;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false,
    transparent: true, opacity: 0, fog: false, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // 光源
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const SC = sun.shadow.camera;
  SC.left = -130; SC.right = 130; SC.top = 130; SC.bottom = -130; SC.near = 10; SC.far = 700;
  sun.shadow.bias = -0.0006;
  sun.target.position.set(-10, 20, -30);
  scene.add(sun); scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xBFD2E8, 0x4A4438, 0.9);
  scene.add(hemi);

  const moonCol = new THREE.Color(0xA8B8D8);
  const dayCol = new THREE.Color();

  // 每帧：昼夜状态 → 天空/光
  function update(ds) {
    uniforms.cTop.value.setRGB(ds.zenith[0], ds.zenith[1], ds.zenith[2]);
    uniforms.cHor.value.setRGB(ds.horizon[0], ds.horizon[1], ds.horizon[2]);
    uniforms.sunDir.value.set(ds.sunDir[0], ds.sunDir[1], ds.sunDir[2]);
    uniforms.sunCol.value.setRGB(ds.sunCol[0], ds.sunCol[1], ds.sunCol[2]);
    uniforms.moonDir.value.set(ds.moonDir[0], ds.moonDir[1], ds.moonDir[2]);
    starMat.opacity = ds.star;

    if (ds.sunI >= ds.moonI) {
      dayCol.setRGB(ds.sunCol[0], ds.sunCol[1], ds.sunCol[2]);
      sun.color.copy(dayCol);
      sun.intensity = ds.sunI;
      sun.position.set(ds.sunDir[0] * 400, Math.max(30, ds.sunDir[1] * 400), ds.sunDir[2] * 400);
    } else {
      sun.color.copy(moonCol);
      sun.intensity = ds.moonI;
      sun.position.set(ds.moonDir[0] * 400, Math.max(30, ds.moonDir[1] * 400), ds.moonDir[2] * 400);
    }
    hemi.intensity = ds.ambI;
    hemi.color.setRGB(ds.zenith[0], ds.zenith[1], ds.zenith[2]);
  }
  return { update };
}

// 夜间点光（阁顶 + 四门，仅灯因子 > 0.5 开启）
export function buildNightLights(scene, lampFactorGetter) {
  const spots = [
    [-18, 60, -90],   // 观澜阁顶
    [5, 24, 97], [5, 24, 13], [53, 24, 55], [-43, 24, 55],  // 四门城台
  ];
  const lights = spots.map(([x, y, z]) => {
    const l = new THREE.PointLight(0xFFB050, 0, 45, 2);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  });
  function update() {
    const on = lampFactorGetter() > 0.5;
    for (const l of lights) l.intensity = on ? 1.6 : 0;
  }
  return { update };
}
