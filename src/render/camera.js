// 三模式相机（手写，不用 examples）：环绕 / 漫游（指针锁定）/ 巡游（曲线匀速+兴趣点注视）
import * as THREE from '../../vendor/three.module.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CameraRig {
  constructor(camera, dom, heightAt, onInput) {
    this.cam = camera;
    this.dom = dom;
    this.heightAt = heightAt;   // (x,z) → 海拔 m
    this.onInput = onInput;     // 输入后的即时渲染回调（节流环境下保证交互可见）
    this.mode = 'orbit';
    this.enabled = true;

    // 环绕
    this.target = new THREE.Vector3(5, 30, 45);
    this.r = 150;
    this.theta = 0;             // 方位角（0=相机在目标南侧）
    this.phi = 0.62;            // 仰角 5°–85°
    // 漫游
    this.wYaw = Math.PI; this.wPitch = -0.06;
    this.pos = new THREE.Vector3(5, 32, 62);
    this.keys = {};
    // 巡游
    this.curve = null; this.curveLen = 1; this.u = 0; this.speed = 2.0;
    this.pois = [];

    this._bind();
  }

  _wake() { this.onInput && this.onInput(); }

  _bind() {
    const dom = this.dom;
    let drag = 0, lx = 0, ly = 0;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('mousedown', (e) => {
      if (this.mode === 'walk') return;
      drag = e.button === 2 ? 2 : 1;
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mouseup', () => { drag = 0; });
    window.addEventListener('mousemove', (e) => {
      if (this.mode === 'walk' && document.pointerLockElement === dom) {
        this.wYaw -= e.movementX * 0.0022;
        this.wPitch = clamp(this.wPitch - e.movementY * 0.0022, -1.45, 1.45);
        this._wake();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (drag === 1) {
        this.theta -= dx * 0.005;
        this.phi = clamp(this.phi + dy * 0.005, 0.09, 1.48);
      } else {
        const k = this.r * 0.0012;
        const fx = Math.sin(this.theta), fz = Math.cos(this.theta);
        this.target.x -= (-fx) * dy * k + Math.cos(this.theta) * dx * k;
        this.target.z -= (-fz) * dy * k - Math.sin(this.theta) * dx * k;
        this.target.y = Math.max(4, this.target.y);
      }
      this._wake();
    });
    dom.addEventListener('wheel', (e) => {
      if (this.mode !== 'orbit') return;
      e.preventDefault();
      this.r = clamp(this.r * Math.exp(e.deltaY * 0.001), 8, 260);
      this._wake();
    }, { passive: false });
    // 触摸：单指环绕 / 双指捏合
    let tp = null;
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) tp = { x: e.touches[0].clientX, y: e.touches[0].clientY, d: 0 };
      else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        tp = { x: 0, y: 0, d };
      }
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (!tp || this.mode !== 'orbit') return;
      if (e.touches.length === 1 && tp.d === 0) {
        const dx = e.touches[0].clientX - tp.x, dy = e.touches[0].clientY - tp.y;
        tp.x = e.touches[0].clientX; tp.y = e.touches[0].clientY;
        this.theta -= dx * 0.006;
        this.phi = clamp(this.phi + dy * 0.006, 0.09, 1.48);
        this._wake();
      } else if (e.touches.length === 2 && tp.d > 0) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.r = clamp(this.r * (tp.d / d), 8, 260);
        tp.d = d;
        this._wake();
      }
    }, { passive: true });
    // 键盘
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.mode === 'tour' && (e.code === 'Space' || e.code === 'Escape')) {
        e.preventDefault();
        this.exitTour();
        this._wake();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('pointerlockchange', () => {
      if (this.mode === 'walk' && document.pointerLockElement !== this.dom) {
        this.setMode('orbit');
        this._wake();
      }
    });
  }

  setMode(m, tourData = null) {
    if (m === 'walk' && !('pointerLockEnabled' in (tourData || {}))) { /* 移动端由 main 拦截 */ }
    if (m === 'walk') {
      this.wYaw = Math.PI; this.wPitch = -0.06;
      this.pos.set(5, this.heightAt(5, 62) + 1.7, 66);
    }
    if (m === 'tour') {
      if (!tourData) return;
      this.curve = tourData.curve;
      this.curveLen = tourData.len;
      this.pois = tourData.pois;
      this.u = 0;
    }
    if (m === 'orbit' && this.mode === 'walk') {
      // 从漫游位置平滑接管：目标点取前方 30m
      const fx = Math.sin(this.wYaw), fz = Math.cos(this.wYaw);
      this.target.set(this.pos.x + fx * 30, this.heightAt(this.pos.x + fx * 30, this.pos.z + fz * 30) + 8, this.pos.z + fz * 30);
      this.r = 40; this.theta = Math.atan2(-fx, -fz); this.phi = 0.5;
    }
    this.mode = m;
    if (m !== 'walk' && document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  requestWalk() {
    this.setMode('walk');
    this.dom.requestPointerLock();
  }

  exitTour() {
    // 从当前巡游点切回环绕
    const p = this.curve.getPointAt(clamp(this.u, 0, 1));
    this.target.copy(p).add(new THREE.Vector3(0, -2, 0));
    this.r = 60; this.phi = 0.55;
    const ahead = this.curve.getPointAt(clamp(this.u + 0.02, 0, 1));
    this.theta = Math.atan2(ahead.x - p.x, ahead.z - p.z) + Math.PI;
    this.setMode('orbit');
  }

  update(dt) {
    if (this.mode === 'orbit') {
      const cp = Math.cos(this.phi), sp = Math.sin(this.phi);
      this.cam.position.set(
        this.target.x + this.r * cp * Math.sin(this.theta),
        this.target.y + this.r * sp,
        this.target.z + this.r * cp * Math.cos(this.theta),
      );
      this.cam.lookAt(this.target);
    } else if (this.mode === 'walk') {
      const run = this.keys.ShiftLeft || this.keys.ShiftRight ? 3 : 1;
      const sp = 6 * run * dt;
      const fx = Math.sin(this.wYaw), fz = Math.cos(this.wYaw);
      const rx = Math.cos(this.wYaw), rz = -Math.sin(this.wYaw);
      let mx = 0, mz = 0;
      if (this.keys.KeyW) { mx += fx; mz += fz; }
      if (this.keys.KeyS) { mx -= fx; mz -= fz; }
      if (this.keys.KeyA) { mx -= rx; mz -= rz; }
      if (this.keys.KeyD) { mx += rx; mz += rz; }
      const ml = Math.hypot(mx, mz);
      if (ml > 0) { this.pos.x += mx / ml * sp; this.pos.z += mz / ml * sp; }
      this.pos.x = clamp(this.pos.x, -126, 126);
      this.pos.z = clamp(this.pos.z, -126, 126);
      this.pos.y = this.heightAt(this.pos.x, this.pos.z) + 1.7;
      this.cam.position.copy(this.pos);
      this.cam.lookAt(this.pos.x + fx, this.pos.y + Math.tan(this.wPitch), this.pos.z + fz);
    } else if (this.mode === 'tour' && this.curve) {
      this.u = clamp(this.u + (this.speed * dt) / this.curveLen, 0, 1);
      const p = this.curve.getPointAt(this.u);
      // 防切角入地：曲线点低于地形时抬到离地 2.2m
      this.cam.position.set(p.x, Math.max(p.y, this.heightAt(p.x, p.z) + 2.2), p.z);
      // 视线：前方 8m；兴趣点窗口内改看兴趣点
      let look = this.curve.getPointAt(clamp(this.u + 8 / this.curveLen, 0, 1));
      const s = this.u * this.curveLen;
      for (const poi of this.pois) {
        if (Math.abs(poi.s - s) < 26) { look = poi.pos; break; }
      }
      this.cam.lookAt(look);
    }
  }
}
