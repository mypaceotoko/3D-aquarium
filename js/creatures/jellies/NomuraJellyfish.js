import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';
import { injectTentacleShader } from './MoonJellyfish.js';

/**
 * エチゼンクラゲ / Nomura's Jellyfish (Nemopilema nomurai)
 *
 * The giant. Massively domed bulbous bell, pinkish-brown, with many short
 * shaggy oral arms instead of long tentacles. Slow, majestic pulse.
 * Scaled 4–5.5x — a centerpiece creature.
 */
export class NomuraJellyfish extends Creature {
  constructor(opts = {}) {
    const size = THREE.MathUtils.randFloat(4.0, 5.5) * (opts.scale ?? 1);
    const group = new THREE.Group();

    // Bell — almost a 2/3 sphere, very rounded ────────────────────────
    const bellGeo = new THREE.SphereGeometry(1.0, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.66);
    const bp = bellGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const rim = 1 - THREE.MathUtils.clamp(y, 0, 1);
      const ang = Math.atan2(z, x);
      const lumps = Math.sin(ang * 12 + y * 3) * 0.018 * rim;
      bp.setXYZ(i, x * (1 + lumps), y * 0.95, z * (1 + lumps));
    }
    bellGeo.computeVertexNormals();

    const bellMat = new THREE.MeshPhysicalMaterial({
      color:        0xefc8b4,
      roughness:    0.32,
      metalness:    0.0,
      transmission: 0.55,
      thickness:    1.4,
      ior:          1.34,
      transparent:  true,
      opacity:      0.88,
      side:         THREE.DoubleSide,
      clearcoat:    0.4,
      clearcoatRoughness: 0.45,
      emissive:     0x9a4a40,
      emissiveIntensity: 0.06,
      depthWrite:   false,
      fog:          true,
    });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.renderOrder = 2;
    group.add(bell);

    // Inner glow — warm rosewood ──────────────────────────────────────
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.74, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshBasicMaterial({
        color: 0xc06070,
        transparent: true,
        opacity: 0.40,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
      }),
    );
    glow.position.y = -0.05;
    group.add(glow);

    // Rim — subtle, as Nomura's rim isn't striking ────────────────────
    const rimGeo = new THREE.TorusGeometry(0.97, 0.06, 8, 56);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
      color: 0xd87a78,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    rim.position.y = -0.02;
    group.add(rim);

    const tentUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };

    // Many short shaggy oral arms ─────────────────────────────────────
    // 8 thick central arms + 24 thinner rim filaments
    const armMat = new THREE.MeshStandardMaterial({
      color: 0xd89888,
      roughness: 0.5,
      metalness: 0.0,
      transparent: true,
      opacity: 0.78,
      emissive: 0x884448,
      emissiveIntensity: 0.20,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
    // Thick central arms — frilly cabbage-leaf look
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.05;
      const armLen = 1.4 + Math.random() * 0.5;
      const r = 0.25;
      const phase = Math.random() * Math.PI * 2;
      const g = new THREE.PlaneGeometry(0.55, armLen, 1, 8);
      const pp = g.attributes.position;
      for (let j = 0; j < pp.count; j++) {
        const yn = (pp.getY(j) + armLen * 0.5) / armLen;
        // bulge then taper
        const w = 0.6 + Math.sin(yn * Math.PI) * 0.7 - yn * 0.3;
        pp.setX(j, pp.getX(j) * w);
        // ripple
        pp.setZ(j, pp.getZ(j) + Math.sin(yn * 8 + phase) * 0.04);
      }
      pp.needsUpdate = true;
      g.translate(0, -armLen / 2, 0);
      const m = armMat.clone();
      injectTentacleShader(m, tentUniforms, phase + ang, armLen, {
        sway: 0.18, swirl: 0.16, freq: 0.7,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * r, -0.05, Math.sin(ang) * r);
      mesh.rotation.y = ang;
      group.add(mesh);
      // perpendicular pair for volume
      const m2 = armMat.clone();
      injectTentacleShader(m2, tentUniforms, phase + ang + 1.1, armLen, {
        sway: 0.18, swirl: 0.18, freq: 0.7,
      });
      const mesh2 = new THREE.Mesh(g.clone(), m2);
      mesh2.position.copy(mesh.position);
      mesh2.rotation.y = ang + Math.PI * 0.5;
      group.add(mesh2);
    }

    // Rim filaments — short, many ─────────────────────────────────────
    const fringeCount = 28;
    const fringeLen = 0.95;
    const fringeMat = new THREE.MeshStandardMaterial({
      color: 0xc88478,
      roughness: 0.6,
      transparent: true,
      opacity: 0.6,
      emissive: 0x7a3038,
      emissiveIntensity: 0.18,
      depthWrite: false,
      fog: true,
    });
    for (let i = 0; i < fringeCount; i++) {
      const ang = (i / fringeCount) * Math.PI * 2;
      const r = 0.92;
      const g = new THREE.CylinderGeometry(0.04, 0.012, fringeLen, 5, 8, true);
      g.translate(0, -fringeLen / 2, 0);
      const m = fringeMat.clone();
      injectTentacleShader(m, tentUniforms, Math.random() * Math.PI * 2 + ang, fringeLen, {
        sway: 0.14, swirl: 0.14, freq: 0.95,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * r, -0.03, Math.sin(ang) * r);
      group.add(mesh);
    }

    group.scale.setScalar(size);

    super({
      species: 'nomura-jelly',
      mesh: group,
      cfg: {
        speed: 0.32,
        maxAccel: 0.20,
        turnRate: 0.22,
        depthMin: TANK.floorY + 5.0,
        depthMax: TANK.maxY - 2.0,
        wanderMin: 12, wanderMax: 22,
        wallMargin: 8,
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
    this._pulseFreq = 0.26 + Math.random() * 0.10;   // slow majestic pulse
    this._lastPulse = 0;

    this.vel.set(
      (Math.random() - 0.5) * 0.05,
      Math.random() * 0.06,
      (Math.random() - 0.5) * 0.05,
    );
  }

  onPickTarget(target) {
    target.y = THREE.MathUtils.randFloat(
      this.cfg.depthMin,
      THREE.MathUtils.lerp(this.cfg.depthMin, this.cfg.depthMax, 0.7),
    );
  }

  onUpdate(dt, time) {
    const raw = Math.sin(time * this._pulseFreq * Math.PI + this._phase);
    const squeeze = Math.pow(Math.max(raw, 0), 3);

    const s = this._baseScale;
    this._bell.scale.set(
      s * (1 + squeeze * 0.13),
      s * (1 - squeeze * 0.20),
      s * (1 + squeeze * 0.13),
    );
    this._glow.scale.set(
      s * (1 + squeeze * 0.08),
      s * (1 - squeeze * 0.16),
      s * (1 + squeeze * 0.08),
    );
    this._rim.scale.set(
      s * (1 + squeeze * 0.16),
      s,
      s * (1 + squeeze * 0.16),
    );

    this._tentUniforms.uTime.value = time;
    this._tentUniforms.uPulse.value = squeeze;

    if (squeeze > 0.7 && this._lastPulse < 0.7) {
      this.vel.y += 0.42;
      this.vel.x += (Math.random() - 0.5) * 0.04;
      this.vel.z += (Math.random() - 0.5) * 0.04;
    }
    this._lastPulse = squeeze;

    this.vel.multiplyScalar(Math.pow(0.84, dt * 2.0));
    this.vel.y -= 0.22 * dt;

    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -this.vel.x * 0.20, Math.min(1, dt * 1.0));
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x,  this.vel.z * 0.20, Math.min(1, dt * 1.0));
  }
}
