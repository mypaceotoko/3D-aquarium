import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

/**
 * ミズクラゲ / Moon Jellyfish (Aurelia aurita)
 *
 * Iconic translucent bell with the characteristic 4-leaf-clover gonad ring
 * visible through the dome. Short scalloped fringe + 4 frilly oral arms.
 * Medium-sized (1.6–2.4), drifts in the upper-mid water column.
 */
export class MoonJellyfish extends Creature {
  constructor(opts = {}) {
    const size = THREE.MathUtils.randFloat(1.6, 2.4) * (opts.scale ?? 1);
    const group = new THREE.Group();

    // Bell ─────────────────────────────────────────────────────────────
    const bellGeo = new THREE.SphereGeometry(1.0, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const bp = bellGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const rim = 1 - THREE.MathUtils.clamp(y, 0, 1);
      const ang = Math.atan2(z, x);
      // 16 gentle scallops along the rim
      const scallop = Math.sin(ang * 16) * 0.025 * rim * rim;
      bp.setXYZ(i, x * (1 + scallop), y * 0.78, z * (1 + scallop));
    }
    bellGeo.computeVertexNormals();

    const bellMat = new THREE.MeshPhysicalMaterial({
      color:        0xeaf6ff,
      roughness:    0.14,
      metalness:    0.0,
      transmission: 0.92,
      thickness:    0.6,
      ior:          1.33,
      transparent:  true,
      opacity:      0.55,
      side:         THREE.DoubleSide,
      clearcoat:    0.7,
      clearcoatRoughness: 0.22,
      emissive:     0x88c8ff,
      emissiveIntensity: 0.05,
      depthWrite:   false,
      fog:          true,
    });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.renderOrder = 2;
    group.add(bell);

    // Gonad ring (4-leaf clover horseshoes) ───────────────────────────
    const gonadGroup = new THREE.Group();
    gonadGroup.position.y = -0.05;
    gonadGroup.renderOrder = 1;
    const gonadMat = new THREE.MeshBasicMaterial({
      color: 0xffb8de,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const r = 0.36;
      const horse = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.05, 8, 18, Math.PI * 1.5),
        gonadMat,
      );
      horse.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      horse.rotation.y = -a + Math.PI * 0.5;
      horse.rotation.x = Math.PI * 0.5;
      gonadGroup.add(horse);
    }
    group.add(gonadGroup);

    // Inner glow ──────────────────────────────────────────────────────
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xc8e8ff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.66, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
      glowMat,
    );
    glow.position.y = -0.06;
    group.add(glow);

    // Rim highlight ───────────────────────────────────────────────────
    const rimGeo = new THREE.TorusGeometry(0.97, 0.035, 8, 64);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
      color: 0xeafcff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    rim.position.y = -0.02;
    group.add(rim);

    // Tentacle shader uniforms (shared across oral arms + fringe) ─────
    const tentUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };

    // Oral arms ─ 4 frilly ribbons hanging from the centre ────────────
    const armLen = 1.6;
    const armMat = new THREE.MeshStandardMaterial({
      color: 0xfff0f8,
      roughness: 0.5,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55,
      emissive: 0xffc8e8,
      emissiveIntensity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
    for (let i = 0; i < 4; i++) {
      const ang  = (i / 4) * Math.PI * 2;
      const phase = Math.random() * Math.PI * 2;
      const g = new THREE.PlaneGeometry(0.18, armLen, 1, 8);
      g.translate(0, -armLen / 2, 0);
      const m = armMat.clone();
      injectTentacleShader(m, tentUniforms, phase + ang, armLen, {
        sway: 0.18, swirl: 0.16, freq: 0.95,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * 0.08, -0.05, Math.sin(ang) * 0.08);
      mesh.rotation.y = ang;
      group.add(mesh);
      // Add a perpendicular ribbon to give it volume
      const mesh2 = mesh.clone();
      mesh2.material = m.clone();
      injectTentacleShader(mesh2.material, tentUniforms, phase + ang + 1.2, armLen, {
        sway: 0.16, swirl: 0.18, freq: 0.95,
      });
      mesh2.rotation.y = ang + Math.PI * 0.5;
      group.add(mesh2);
    }

    // Fringe — 32 fine threads around the rim ─────────────────────────
    const fringeCount = 32;
    const fringeLen = 1.05;
    const fringeMat = new THREE.MeshBasicMaterial({
      color: 0xd8efff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      fog: true,
    });
    for (let i = 0; i < fringeCount; i++) {
      const ang = (i / fringeCount) * Math.PI * 2;
      const r = 0.94;
      const g = new THREE.CylinderGeometry(0.012, 0.003, fringeLen, 4, 6, true);
      g.translate(0, -fringeLen / 2, 0);
      const m = fringeMat.clone();
      injectTentacleShader(m, tentUniforms, Math.random() * Math.PI * 2 + ang, fringeLen, {
        sway: 0.10, swirl: 0.10, freq: 1.6,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * r, -0.02, Math.sin(ang) * r);
      group.add(mesh);
    }

    group.scale.setScalar(size);

    super({
      species: 'moon-jelly',
      mesh: group,
      cfg: {
        speed: 0.40,
        maxAccel: 0.30,
        turnRate: 0.36,
        depthMin: TANK.floorY + 4.5,
        depthMax: TANK.maxY - 0.5,
        wanderMin: 7, wanderMax: 13,
        wallMargin: 4,
        reactsToFood: false,
        facesVelocity: false,
      },
      position: opts.position,
    });

    this._bell = bell;
    this._glow = glow;
    this._rim  = rim;
    this._gonads = gonadGroup;
    this._tentUniforms = tentUniforms;
    this._baseScale = size;
    this._phase = Math.random() * Math.PI * 2;
    this._pulseFreq = 0.50 + Math.random() * 0.20;
    this._lastPulse = 0;

    this.vel.set(
      (Math.random() - 0.5) * 0.08,
      Math.random() * 0.12,
      (Math.random() - 0.5) * 0.08,
    );
  }

  onPickTarget(target) {
    target.y = THREE.MathUtils.randFloat(
      THREE.MathUtils.lerp(this.cfg.depthMin, this.cfg.depthMax, 0.4),
      this.cfg.depthMax,
    );
  }

  onUpdate(dt, time) {
    const raw = Math.sin(time * this._pulseFreq * Math.PI + this._phase);
    const squeeze = Math.pow(Math.max(raw, 0), 3);

    const s = this._baseScale;
    this._bell.scale.set(
      s * (1 + squeeze * 0.20),
      s * (1 - squeeze * 0.30),
      s * (1 + squeeze * 0.20),
    );
    this._glow.scale.set(
      s * (1 + squeeze * 0.12),
      s * (1 - squeeze * 0.22),
      s * (1 + squeeze * 0.12),
    );
    this._rim.scale.set(
      s * (1 + squeeze * 0.24),
      s,
      s * (1 + squeeze * 0.24),
    );
    this._gonads.scale.set(
      s * (1 + squeeze * 0.10),
      s,
      s * (1 + squeeze * 0.10),
    );

    this._tentUniforms.uTime.value = time;
    this._tentUniforms.uPulse.value = squeeze;

    if (squeeze > 0.7 && this._lastPulse < 0.7) {
      this.vel.y += 0.32;
      this.vel.x += (Math.random() - 0.5) * 0.05;
      this.vel.z += (Math.random() - 0.5) * 0.05;
    }
    this._lastPulse = squeeze;

    this.vel.multiplyScalar(Math.pow(0.78, dt * 2.0));
    this.vel.y -= 0.16 * dt;

    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -this.vel.x * 0.32, Math.min(1, dt * 1.2));
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x,  this.vel.z * 0.32, Math.min(1, dt * 1.2));
  }
}

// ─────────────────────────────────────────────────────────────────────
// Shader helper — adds a swaying-tentacle vertex perturbation that
// reacts to a shared uTime + uPulse. Used by oral arms & fringe.
// ─────────────────────────────────────────────────────────────────────
export function injectTentacleShader(mat, shared, phase, length, opts = {}) {
  const sway  = (opts.sway  ?? 0.22).toFixed(3);
  const swirl = (opts.swirl ?? 0.20).toFixed(3);
  const freq  = (opts.freq  ?? 1.15).toFixed(3);
  const len   = length.toFixed(3);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime  = shared.uTime;
    shader.uniforms.uPulse = shared.uPulse;
    shader.uniforms.uPhase = { value: phase };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uPulse;
        uniform float uPhase;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3( position );
        float tlen = ${len};
        float tnorm = clamp(-transformed.y / tlen, 0.0, 1.0);
        float grow  = pow(tnorm, 1.25);
        float wave  = sin(uTime * ${freq} + uPhase + tnorm * 3.2);
        float swirl = cos(uTime * ${(parseFloat(freq) * 0.74).toFixed(3)} + uPhase * 0.7 + tnorm * 2.4);
        transformed.x += wave  * ${sway} * grow;
        transformed.z += swirl * ${swirl} * grow;
        transformed.y *= (1.0 - uPulse * 0.13);
      `);
  };
}
