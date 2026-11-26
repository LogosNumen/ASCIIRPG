import * as THREE from 'three';
import { heightAt } from './world/layout.js';

const SENS = 0.0024;

// Orbit camera that trails the player and never dips under the terrain.
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.16;
    this.dist = 7.5;
    this.target = null;
  }

  rotate(dx, dy) {
    this.yaw -= dx * SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * SENS, -0.25, 1.2);
  }

  update(p, dt) {
    const want = new THREE.Vector3(p.x, p.y + 2.1, p.z);
    if (!this.target) this.target = want;
    else this.target.lerp(want, 1 - Math.exp(-dt * 12));
    const t = this.target, cp = Math.cos(this.pitch);
    const x = t.x + Math.sin(this.yaw) * cp * this.dist;
    const z = t.z + Math.cos(this.yaw) * cp * this.dist;
    const y = Math.max(t.y + Math.sin(this.pitch) * this.dist, heightAt(x, z) + 0.6);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(t);
  }
}
