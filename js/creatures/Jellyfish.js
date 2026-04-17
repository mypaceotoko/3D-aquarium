import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

/**
 * クラゲ — half-sphere bell with transmission, additive inner glow, 8 wavy tentacles.
 * Drifts slowly with tiny vertical thrust on each pulse peak.
 */
export class Jellyfish extends Creature {
  constructor(opts = {}) {
    const variant = Math.floor(Math.random() * JELLY_VARIANTS.length);
    const v = JELLY_VARIANTS[variant];

    const size = THREE.MathUtils.randFloat(0.75, 1.25) * (opts.scale ?? 1);
    const group = new THREE.Group();

    // Bell -------------------------------------------------------------
    const bellGeo = new THREE.SphereGeometry(1.0, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55);
    // Slightly flatten + ripple the rim
    const p = bellGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rim = 1 - THREE.MathUtils.clamp(y, 0, 1);
      const ripple = Math.sin(Math.atan2(z, x) * 8) * 0.04 * rim;
      p.setXYZ(i, x * (1 + ripple), y * 0.82, z * (1 + ripple));
    }
    bellGeo.computeVertexNormals();

    const bellMat = makeBellMaterial(v);
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.renderOrder = 2;
    group.add(bell);

    // Inner glow (additive) -------------------------------------------
    const glowGeo = new THREE.SphereGeometry(0.55, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: v.glow,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = -0.08;
    glow.renderOrder = 1;
    group.add(glow);

    // Rim highlight (Fresnel-esque): thin cone sprite ring on the bell edge
    const rimGeo = new THREE.TorusGeometry(0.98, 0.04, 6, 40);
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = new THREE.MeshBasicMaterial({
      color: v.rim,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = -0.02;
    group.add(rim);

    // Tentacles --------------------------------------------------------
    const tentacleCount = 8;
    const tentacleLen = 3.2 + Math.random() * 1.2;
    const tentacles = [];
    const tentUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };

    const tentMat = new THREE.MeshStandardMaterial({
      color: v.tentacle,
      roughness: 0.55,
      metalness: 0.0,
      transparent: true,
      opacity: 0.72,
      emissive: v.glow,
      emissiveIntensity: 0.25,
      depthWrite: false,
      fog: true,
    });
    tentMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime  = tentUniforms.uTime;
      shader.uniforms.uPulse = tentUniforms.uPulse;
      shader.uniforms.uPhase = { value: 0 }; // overridden per-tentacle below
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          uniform float uPulse;
          uniform float uPhase;
        `)
        .replace('#include <begin_vertex>', `
          vec3 transformed = vec3( position );
          float tlen = ${tentacleLen.toFixed(3)};
          float tnorm = clamp(-transformed.y / tlen, 0.0, 1.0);
          float grow  = pow(tnorm, 1.25);
          float wave  = sin(uTime * 1.15 + uPhase + tnorm * 3.2);
          float swirl = cos(uTime * 0.85 + uPhase * 0.7 + tnorm * 2.4);
          transformed.x += wave  * 0.22 * grow;
          transformed.z += swirl * 0.20 * grow;
          transformed.y *= (1.0 - uPulse * 0.14);
        `);
    };
    // Each tentacle's material is shared except for its phase — we work around this
    // by cloning the material per-tentacle so onBeforeCompile gets distinct uniforms.
    for (let i = 0; i < tentacleCount; i++) {
      const ang = (i / tentacleCount) * Math.PI * 2 + Math.random() * 0.08;
      const r = 0.62 + Math.random() * 0.15;
      const geo = new THREE.CylinderGeometry(0.045, 0.018, tentacleLen, 5, 10, true);
      geo.translate(0, -tentacleLen / 2, 0);

      const mat = tentMat.clone();
      const phase = Math.random() * Math.PI * 2;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime  = tentUniforms.uTime;
        shader.uniforms.uPulse = tentUniforms.uPulse;
        shader.uniforms.uPhase = { value: phase + ang };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
            uniform float uTime;
            uniform float uPulse;
            uniform float uPhase;
          `)
          .replace('#include <begin_vertex>', `
            vec3 transformed = vec3( position );
            float tlen = ${tentacleLen.toFixed(3)};
            float tnorm = clamp(-transformed.y / tlen, 0.0, 1.0);
            float grow  = pow(tnorm, 1.25);
            float wave  = sin(uTime * 1.15 + uPhase + tnorm * 3.2);
            float swirl = cos(uTime * 0.85 + uPhase * 0.7 + tnorm * 2.4);
            transformed.x += wave  * 0.24 * grow;
            transformed.z += swirl * 0.22 * grow;
            transformed.y *= (1.0 - uPulse * 0.14);
          `);
      };

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(ang) * r, -0.05, Math.sin(ang) * r);
      tentacles.push(mesh);
      group.add(mesh);
    }

    // Thin fringe threads (very thin, extra layer of translucency)
    const fringeCount = 16;
    const fringeLen = 1.8;
    for (let i = 0; i < fringeCount; i++) {
      const ang = (i / fringeCount) * Math.PI * 2;
      const r = 0.92;
      const g = new THREE.CylinderGeometry(0.02, 0.004, fringeLen, 4, 6, true);
      g.translate(0, -fringeLen / 2, 0);
      const m = tentMat.clone();
      const phase = Math.random() * Math.PI * 2;
      m.opacity = 0.45;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime  = tentUniforms.uTime;
        shader.uniforms.uPulse = tentUniforms.uPulse;
        shader.uniforms.uPhase = { value: phase + ang };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
            uniform float uTime;
            uniform float uPulse;
            uniform float uPhase;
          `)
          .replace('#include <begin_vertex>', `
            vec3 transformed = vec3( position );
            float tlen = ${fringeLen.toFixed(3)};
            float tnorm = clamp(-transformed.y / tlen, 0.0, 1.0);
            float grow  = pow(tnorm, 1.4);
            float wave  = sin(uTime * 1.6 + uPhase + tnorm * 4.0);
            float swirl = cos(uTime * 1.3 + uPhase * 0.9 + tnorm * 3.0);
            transformed.x += wave  * 0.15 * grow;
            transformed.z += swirl * 0.14 * grow;
            transformed.y *= (1.0 - uPulse * 0.10);
          `);
      };
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * r, -0.02, Math.sin(ang) * r);
      group.add(mesh);
    }

    group.scale.setScalar(size);

    super({
      species: 'jellyfish',
      mesh: group,
      cfg: {
        speed: 0.45,
        maxAccel: 0.35,
        turnRate: 0.4,
        depthMin: TANK.floorY + 3.0,
        depthMax: TANK.maxY - 0.5,
        wanderMin: 6, wanderMax: 12,
        wallMargin: 3.5,
        reactsToFood: false,
        facesVelocity: false,
      },
      position: opts.position,
    });

    this._bell = bell;
    this._glow = glow;
    this._rim  = rim;
    this._tentUniforms = tentUniforms;
    this._baseScale = size;
    this._phase = Math.random() * Math.PI * 2;
    this._pulseFreq = 0.55 + Math.random() * 0.25;   // Hz-ish
    this._lastPulse = 0;

    // Jellyfish drift mostly vertical with gentle lateral sway
    this.vel.set(
      (Math.random() - 0.5) * 0.1,
      Math.random() * 0.15,
      (Math.random() - 0.5) * 0.1,
    );
  }

  onPickTarget(target) {
    // Jellyfish prefer the upper half of the water column
    target.y = THREE.MathUtils.randFloat(
      THREE.MathUtils.lerp(this.cfg.depthMin, this.cfg.depthMax, 0.35),
      this.cfg.depthMax,
    );
  }

  onUpdate(dt, time) {
    // Non-linear pulse: sin³ gives a sharp squeeze + slow relax, like a real medusa
    const raw = Math.sin(time * this._pulseFreq * Math.PI + this._phase);
    const squeeze = Math.pow(Math.max(raw, 0), 3); // 0..1, only positive half

    // Bell anim: squeeze = flatter + slightly wider
    const s = this._baseScale;
    this._bell.scale.set(
      s * (1 + squeeze * 0.18),
      s * (1 - squeeze * 0.28),
      s * (1 + squeeze * 0.18),
    );
    this._glow.scale.set(
      s * (1 + squeeze * 0.10),
      s * (1 - squeeze * 0.22),
      s * (1 + squeeze * 0.10),
    );
    this._rim.scale.set(
      s * (1 + squeeze * 0.22),
      s,
      s * (1 + squeeze * 0.22),
    );

    // Tentacle shader pulse
    this._tentUniforms.uTime.value = time;
    this._tentUniforms.uPulse.value = squeeze;

    // Pulse thrust: when squeeze transitions from low→high, add small upward impulse
    if (squeeze > 0.7 && this._lastPulse < 0.7) {
      this.vel.y += 0.35;
      this.vel.x += (Math.random() - 0.5) * 0.06;
      this.vel.z += (Math.random() - 0.5) * 0.06;
    }
    this._lastPulse = squeeze;

    // Constant slow drag so it eases between pulses
    this.vel.multiplyScalar(Math.pow(0.78, dt * 2.0));
    // Very mild sink so they don't all stack at the ceiling
    this.vel.y -= 0.18 * dt;

    // Gentle whole-body tilt follows lateral drift
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -this.vel.x * 0.35, Math.min(1, dt * 1.2));
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x,  this.vel.z * 0.35, Math.min(1, dt * 1.2));
  }
}

// ---------------------------------------------------------------------

const JELLY_VARIANTS = [
  { bell: 0xd7f3ff, glow: 0x8ee8ff, rim: 0xbfefff, tentacle: 0xbae4ff }, // pale cyan
  { bell: 0xffc7f0, glow: 0xff78b5, rim: 0xffd7ef, tentacle: 0xffb4d8 }, // pink
  { bell: 0xf6e6ff, glow: 0xb685ff, rim: 0xd9c7ff, tentacle: 0xc9b2ff }, // violet
  { bell: 0xe2fff0, glow: 0x7bffc6, rim: 0xb2f5d4, tentacle: 0xa9ecd2 }, // emerald
];

function makeBellMaterial(v) {
  // Try MeshPhysicalMaterial with transmission; fall back silently on unsupported GPUs
  const mat = new THREE.MeshPhysicalMaterial({
    color: v.bell,
    roughness: 0.18,
    metalness: 0.0,
    transmission: 0.85,
    thickness: 0.5,
    ior: 1.33,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    emissive: v.glow,
    emissiveIntensity: 0.08,
    depthWrite: false,
    fog: true,
  });
  return mat;
}

/** Helper: spawn N jellyfish around the tank. */
export function spawnJellyfish(scene, count = 4) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const j = new Jellyfish();
    scene.add(j.mesh);
    out.push(j);
  }
  return out;
}
