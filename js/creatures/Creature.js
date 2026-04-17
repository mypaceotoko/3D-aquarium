import * as THREE from 'three';
import { TANK } from '../scene.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const FWD = new THREE.Vector3(1, 0, 0);

/**
 * Base steering/behavior for all aquarium creatures.
 *
 * Sub-classes provide the visual `mesh` in their constructor and may override:
 *   - onUpdate(dt, time, state)     // extra per-frame work (shader uniforms, pulse, etc.)
 *   - onPickTarget(target, state)   // customize wander target (e.g. clamp to seafloor)
 *   - orient(dt)                    // override if the creature shouldn't face its velocity
 */
export class Creature {
  constructor({ species, cfg, mesh, position }) {
    this.species = species;
    this.cfg = {
      speed: 1.2,
      maxAccel: 1.2,
      turnRate: 1.4,
      depthMin: TANK.floorY + 1.5,
      depthMax: TANK.maxY - 1.0,
      wanderMin: 4,
      wanderMax: 9,
      wallMargin: 4,
      reactsToFood: false,
      facesVelocity: true,
      ...cfg,
    };
    this.mesh = mesh;

    this.pos = position ? position.clone() : new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(TANK.maxX * 1.4),
      THREE.MathUtils.randFloat(this.cfg.depthMin, this.cfg.depthMax),
      THREE.MathUtils.randFloatSpread(TANK.maxZ * 1.4),
    );
    this.vel = new THREE.Vector3(
      (Math.random() - 0.5) * this.cfg.speed,
      0,
      (Math.random() - 0.5) * this.cfg.speed,
    );
    this.heading = this.vel.clone().normalize();
    if (!isFinite(this.heading.x)) this.heading.set(1, 0, 0);

    this.target = new THREE.Vector3();
    this.wanderT = 0;
    this.turnSignal = 0; // -1..1, for shader body-bend
    this.speedNorm = 0;

    this.mesh.position.copy(this.pos);
    this.pickTarget();
  }

  pickTarget(state) {
    const { cfg } = this;
    this.target.set(
      THREE.MathUtils.randFloat(TANK.minX + cfg.wallMargin, TANK.maxX - cfg.wallMargin),
      THREE.MathUtils.randFloat(cfg.depthMin, cfg.depthMax),
      THREE.MathUtils.randFloat(TANK.minZ + cfg.wallMargin, TANK.maxZ - cfg.wallMargin),
    );
    this.onPickTarget?.(this.target, state);
    this.wanderT = THREE.MathUtils.randFloat(cfg.wanderMin, cfg.wanderMax);
  }

  /** Bias a desired-velocity vector away from tank walls/depth limits. */
  avoidWalls(desired) {
    const { pos, cfg } = this;
    const mx = cfg.wallMargin;
    if (pos.x >  TANK.maxX - mx) desired.x -= (pos.x - (TANK.maxX - mx)) * 0.9;
    if (pos.x <  TANK.minX + mx) desired.x += ((TANK.minX + mx) - pos.x) * 0.9;
    if (pos.z >  TANK.maxZ - mx) desired.z -= (pos.z - (TANK.maxZ - mx)) * 0.9;
    if (pos.z <  TANK.minZ + mx) desired.z += ((TANK.minZ + mx) - pos.z) * 0.9;
    if (pos.y >  cfg.depthMax)   desired.y -= (pos.y - cfg.depthMax) * 1.2;
    if (pos.y <  cfg.depthMin)   desired.y += (cfg.depthMin - pos.y) * 1.2;
  }

  update(dt, time, state) {
    const { cfg } = this;

    // Target selection -------------------------------------------------
    this.wanderT -= dt;
    let seekPos = this.target;
    let seekSpeedMul = 1.0;

    if (cfg.reactsToFood && state?.food?.active) {
      seekPos = state.food.position;
      seekSpeedMul = 1.45;
      this.wanderT = Math.max(this.wanderT, 0.8);
    } else if (this.wanderT <= 0) {
      this.pickTarget(state);
    }

    // Seek -------------------------------------------------------------
    _a.subVectors(seekPos, this.pos);
    const dist = _a.length();
    if (dist < 0.8 && !(cfg.reactsToFood && state?.food?.active)) {
      this.pickTarget(state);
    }
    const easeIn = Math.min(1, dist / 3.5);
    const desiredSpeed = cfg.speed * seekSpeedMul * (0.35 + 0.65 * easeIn);
    if (dist > 0.0001) _a.multiplyScalar(desiredSpeed / dist);

    // Wall avoidance ---------------------------------------------------
    this.avoidWalls(_a);

    // Steering (accel-limited) ----------------------------------------
    _b.subVectors(_a, this.vel);
    const maxDv = cfg.maxAccel * dt;
    if (_b.lengthSq() > maxDv * maxDv) _b.setLength(maxDv);
    this.vel.add(_b);

    // Cap speed
    const spd = this.vel.length();
    if (spd > cfg.speed * 1.6) this.vel.multiplyScalar((cfg.speed * 1.6) / spd);

    // Integrate --------------------------------------------------------
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);

    // Orient -----------------------------------------------------------
    this.orient(dt);

    // Normalized cached signals (for shaders) -------------------------
    this.speedNorm = Math.min(1, this.vel.length() / cfg.speed);

    // Subclass hook ----------------------------------------------------
    this.onUpdate?.(dt, time, state);
  }

  /** Default: face velocity with smooth turn + compute a signed turn signal. */
  orient(dt) {
    if (!this.cfg.facesVelocity) return;
    const spd = this.vel.length();
    if (spd < 0.02) return;

    _c.copy(this.vel).divideScalar(spd); // new heading

    // Signed turn (yaw): cross(old, new).y
    const signed = this.heading.x * _c.z - this.heading.z * _c.x;
    this.turnSignal = THREE.MathUtils.lerp(this.turnSignal, THREE.MathUtils.clamp(signed * 2.5, -1, 1), dt * 3);

    // Smoothly update heading
    this.heading.lerp(_c, Math.min(1, dt * this.cfg.turnRate)).normalize();

    _q.setFromUnitVectors(FWD, this.heading);
    this.mesh.quaternion.slerp(_q, Math.min(1, dt * this.cfg.turnRate * 1.2));
  }

  dispose() {
    this.mesh.traverse?.((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          for (const k in m) if (m[k]?.isTexture) m[k].dispose();
          m.dispose();
        });
      }
    });
  }

  /** World-space point used for raycast-selection + camera follow. */
  getCenter(out = new THREE.Vector3()) {
    return out.copy(this.pos);
  }
}
