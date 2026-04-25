import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';
import { injectTentacleShader } from './MoonJellyfish.js';

/**
 * オワンクラゲ / Crystal Jellyfish (Aequorea victoria)
 *
 * Famous for green fluorescent protein (GFP) — bioluminescent rim that
 * flashes brilliant green on every contraction. Almost completely
 * transparent bell, fine fiber-like tentacles. Small, ethereal.
 */
export class CrystalJellyfish extends Creature {
  constructor(opts = {}) {
    const size = THREE.MathUtils.randFloat(0.8, 1.25) * (opts.scale ?? 1);
    const group = new THREE.Group();

    // Bell — almost a half-sphere, very glassy ────────────────────────
    const bellGeo = new THREE.SphereGeometry(1.0, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const bp = bellGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const ang = Math.atan2(z, x);
      // 24 fine radial ridges — the gastrovascular canals
      const ridge = Math.sin(ang * 24) * 0.012;
      bp.setXYZ(i, x * (1 + ridge), y * 0.66, z * (1 + ridge));
    }
    bellGeo.computeVertexNormals();

    const bellMat = new THREE.MeshPhysicalMaterial({
      color:        0xeafff8,
      roughness:    0.10,
      metalness:    0.0,
      transmission: 0.97,
      thickness:    0.4,
      ior:          1.34,
      transparent:  true,
      opacity:      0.30,
      side:         THREE.DoubleSide,
      clearcoat:    0.9,
      clearcoatRoughness: 0.15,
      emissive:     0x4cffb8,
      emissiveIntensity: 0.04,
      depthWrite:   false,
      fog:          true,
    });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.renderOrder = 2;
    group.add(bell);

    // Bioluminescent rim — drives most of the visual identity ─────────
    const rimGeo = new THREE.TorusGeometry(0.97, 0.055, 10, 80);
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0x2cffb0,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = -0.02;
    group.add(rim);

    // Glow halo around rim (larger, faded torus) ──────────────────────
    const haloGeo = new THREE.TorusGeometry(1.05, 0.18, 10, 64);
    haloGeo.rotateX(Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x40ffc0,
      transparent: true,
      opacity: 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = -0.04;
    group.add(halo);

    // Inner glow — pulses green during contraction ────────────────────
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshBasicMaterial({
        color: 0x60ffd0,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
      }),
    );
    glow.position.y = -0.04;
    group.add(glow);

    const tentUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };

    // Many fine fiber tentacles around the rim ───────────────────────
    const tentCount = 48;
    const tentLen = 1.6;
    const tentMat = new THREE.MeshBasicMaterial({
      color: 0xa8ffe0,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    for (let i = 0; i < tentCount; i++) {
      const ang = (i / tentCount) * Math.PI * 2;
      const r = 0.96;
      const g = new THREE.CylinderGeometry(0.012, 0.002, tentLen, 4, 8, true);
      g.translate(0, -tentLen / 2, 0);
      const m = tentMat.clone();
      injectTentacleShader(m, tentUniforms, Math.random() * Math.PI * 2 + ang, tentLen, {
        sway: 0.12, swirl: 0.10, freq: 1.4,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * r, -0.01, Math.sin(ang) * r);
      group.add(mesh);
    }

    // Single short central manubrium (mouth-stem) ────────────────────
    const manuMat = new THREE.MeshBasicMaterial({
      color: 0x40ffb0,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const manu = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.02, 0.45, 8, 4),
      manuMat,
    );
    manu.position.y = -0.20;
    group.add(manu);

    group.scale.setScalar(size);

    super({
      species: 'crystal-jelly',
      mesh: group,
      cfg: {
        speed: 0.50,
        maxAccel: 0.36,
        turnRate: 0.46,
        depthMin: TANK.floorY + 4.0,
        depthMax: TANK.maxY - 0.5,
        wanderMin: 5, wanderMax: 10,
        wallMargin: 3,
        reactsToFood: false,
        facesVelocity: false,
      },
      position: opts.position,
    });

    this._bell = bell;
    this._glow = glow;
    this._rim  = rim;
    this._halo = halo;
    this._rimMat = rimMat;
    this._haloMat = haloMat;
    this._glowMat = glow.material;
    this._tentUniforms = tentUniforms;
    this._baseScale = size;
    this._phase = Math.random() * Math.PI * 2;
    this._pulseFreq = 0.55 + Math.random() * 0.25;
    this._lastPulse = 0;

    this.vel.set(
      (Math.random() - 0.5) * 0.10,
      Math.random() * 0.14,
      (Math.random() - 0.5) * 0.10,
    );
  }

  onPickTarget(target) {
    target.y = THREE.MathUtils.randFloat(
      THREE.MathUtils.lerp(this.cfg.depthMin, this.cfg.depthMax, 0.3),
      this.cfg.depthMax,
    );
  }

  onUpdate(dt, time) {
    const raw = Math.sin(time * this._pulseFreq * Math.PI + this._phase);
    const squeeze = Math.pow(Math.max(raw, 0), 3);

    const s = this._baseScale;
    this._bell.scale.set(
      s * (1 + squeeze * 0.18),
      s * (1 - squeeze * 0.32),
      s * (1 + squeeze * 0.18),
    );
    this._rim.scale.set(
      s * (1 + squeeze * 0.22),
      s,
      s * (1 + squeeze * 0.22),
    );
    this._halo.scale.set(
      s * (1 + squeeze * 0.30),
      s * (1 + squeeze * 0.20),
      s * (1 + squeeze * 0.30),
    );

    // GFP-style flash: rim & halo brighten on contraction
    this._rimMat.opacity  = 0.55 + squeeze * 0.45;
    this._haloMat.opacity = 0.18 + squeeze * 0.42;
    this._glowMat.opacity = 0.10 + squeeze * 0.35;

    this._tentUniforms.uTime.value = time;
    this._tentUniforms.uPulse.value = squeeze;

    if (squeeze > 0.7 && this._lastPulse < 0.7) {
      this.vel.y += 0.36;
      this.vel.x += (Math.random() - 0.5) * 0.06;
      this.vel.z += (Math.random() - 0.5) * 0.06;
    }
    this._lastPulse = squeeze;

    this.vel.multiplyScalar(Math.pow(0.78, dt * 2.0));
    this.vel.y -= 0.16 * dt;

    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -this.vel.x * 0.36, Math.min(1, dt * 1.3));
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x,  this.vel.z * 0.36, Math.min(1, dt * 1.3));
  }
}
