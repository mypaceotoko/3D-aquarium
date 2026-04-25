import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';
import { injectTentacleShader } from './MoonJellyfish.js';

/**
 * アカクラゲ / Pacific Sea Nettle (Chrysaora pacifica)
 *
 * Amber-red bell with 16 vertical stripes, long fluttering oral arms,
 * 16 long stinging tentacles. Dramatic, beautiful, drifts mid-water.
 */
export class RedJellyfish extends Creature {
  constructor(opts = {}) {
    const size = THREE.MathUtils.randFloat(1.4, 2.0) * (opts.scale ?? 1);
    const group = new THREE.Group();

    // Bell — slightly more dome-shaped, with vertical stripes ─────────
    const bellGeo = new THREE.SphereGeometry(1.0, 56, 28, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const bp = bellGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const rim = 1 - THREE.MathUtils.clamp(y, 0, 1);
      const ang = Math.atan2(z, x);
      // 8 deeper scallops at the rim (wave-edge)
      const scallop = Math.sin(ang * 8) * 0.06 * rim;
      bp.setXYZ(i, x * (1 + scallop), y * 0.88, z * (1 + scallop));
    }
    bellGeo.computeVertexNormals();

    const bellTex = makeStripedBellTexture(16);
    const bellMat = new THREE.MeshPhysicalMaterial({
      color:        0xfff0e0,
      map:          bellTex,
      roughness:    0.22,
      metalness:    0.0,
      transmission: 0.78,
      thickness:    0.7,
      ior:          1.34,
      transparent:  true,
      opacity:      0.78,
      side:         THREE.DoubleSide,
      clearcoat:    0.55,
      clearcoatRoughness: 0.28,
      emissive:     0xff5f60,
      emissiveIntensity: 0.10,
      depthWrite:   false,
      fog:          true,
    });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.renderOrder = 2;
    group.add(bell);

    // Inner glow — warm amber ─────────────────────────────────────────
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff7a6c,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
      glowMat,
    );
    glow.position.y = -0.06;
    group.add(glow);

    // Rim torus ───────────────────────────────────────────────────────
    const rimGeo = new THREE.TorusGeometry(0.97, 0.05, 8, 64);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
      color: 0xffac90,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    rim.position.y = -0.04;
    group.add(rim);

    const tentUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };

    // Oral arms — 8 long fluttering ribbons (frilly mouth-curtain) ───
    const armLen = 4.2 + Math.random() * 1.2;
    const armMat = new THREE.MeshStandardMaterial({
      color: 0xffd4cc,
      roughness: 0.45,
      metalness: 0.0,
      transparent: true,
      opacity: 0.62,
      emissive: 0xff8470,
      emissiveIntensity: 0.30,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = 0.18;
      const phase = Math.random() * Math.PI * 2;
      // tapered ribbon
      const g = new THREE.PlaneGeometry(0.42, armLen, 1, 12);
      // Taper width by scaling X by row — done by raw position edits
      const pp = g.attributes.position;
      for (let j = 0; j < pp.count; j++) {
        const yn = (pp.getY(j) + armLen * 0.5) / armLen; // 0 top, 1 bottom
        pp.setX(j, pp.getX(j) * (1.0 - yn * 0.55));
      }
      pp.needsUpdate = true;
      g.translate(0, -armLen / 2, 0);
      const m = armMat.clone();
      injectTentacleShader(m, tentUniforms, phase + ang, armLen, {
        sway: 0.42, swirl: 0.32, freq: 0.85,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * r, -0.05, Math.sin(ang) * r);
      mesh.rotation.y = ang;
      group.add(mesh);
      // 90° pair to fake volume
      const m2 = armMat.clone();
      injectTentacleShader(m2, tentUniforms, phase + ang + 1.4, armLen, {
        sway: 0.38, swirl: 0.34, freq: 0.85,
      });
      const mesh2 = new THREE.Mesh(g.clone(), m2);
      mesh2.position.copy(mesh.position);
      mesh2.rotation.y = ang + Math.PI * 0.5;
      group.add(mesh2);
    }

    // Long stinging tentacles ── 16 thin filaments at the rim ─────────
    const tentCount = 16;
    const tentLen = 5.0 + Math.random() * 1.5;
    const tentMat = new THREE.MeshStandardMaterial({
      color: 0xffd2c8,
      roughness: 0.55,
      transparent: true,
      opacity: 0.55,
      emissive: 0xff6650,
      emissiveIntensity: 0.20,
      depthWrite: false,
      fog: true,
    });
    for (let i = 0; i < tentCount; i++) {
      const ang = (i / tentCount) * Math.PI * 2 + Math.random() * 0.05;
      const r = 0.86 + Math.random() * 0.10;
      const g = new THREE.CylinderGeometry(0.025, 0.005, tentLen, 5, 14, true);
      g.translate(0, -tentLen / 2, 0);
      const m = tentMat.clone();
      const phase = Math.random() * Math.PI * 2;
      injectTentacleShader(m, tentUniforms, phase + ang, tentLen, {
        sway: 0.30, swirl: 0.28, freq: 1.05,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(Math.cos(ang) * r, -0.02, Math.sin(ang) * r);
      group.add(mesh);
    }

    group.scale.setScalar(size);

    super({
      species: 'red-jelly',
      mesh: group,
      cfg: {
        speed: 0.42,
        maxAccel: 0.30,
        turnRate: 0.34,
        depthMin: TANK.floorY + 3.5,
        depthMax: TANK.maxY - 1.0,
        wanderMin: 8, wanderMax: 14,
        wallMargin: 4.5,
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
    this._pulseFreq = 0.42 + Math.random() * 0.18;
    this._lastPulse = 0;

    this.vel.set(
      (Math.random() - 0.5) * 0.08,
      Math.random() * 0.10,
      (Math.random() - 0.5) * 0.08,
    );
  }

  onPickTarget(target) {
    target.y = THREE.MathUtils.randFloat(
      this.cfg.depthMin + 1,
      THREE.MathUtils.lerp(this.cfg.depthMin, this.cfg.depthMax, 0.85),
    );
  }

  onUpdate(dt, time) {
    const raw = Math.sin(time * this._pulseFreq * Math.PI + this._phase);
    const squeeze = Math.pow(Math.max(raw, 0), 3);

    const s = this._baseScale;
    this._bell.scale.set(
      s * (1 + squeeze * 0.16),
      s * (1 - squeeze * 0.26),
      s * (1 + squeeze * 0.16),
    );
    this._glow.scale.set(
      s * (1 + squeeze * 0.10),
      s * (1 - squeeze * 0.20),
      s * (1 + squeeze * 0.10),
    );
    this._rim.scale.set(
      s * (1 + squeeze * 0.20),
      s,
      s * (1 + squeeze * 0.20),
    );

    this._tentUniforms.uTime.value = time;
    this._tentUniforms.uPulse.value = squeeze;

    if (squeeze > 0.7 && this._lastPulse < 0.7) {
      this.vel.y += 0.30;
      this.vel.x += (Math.random() - 0.5) * 0.06;
      this.vel.z += (Math.random() - 0.5) * 0.06;
    }
    this._lastPulse = squeeze;

    this.vel.multiplyScalar(Math.pow(0.78, dt * 2.0));
    this.vel.y -= 0.18 * dt;

    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -this.vel.x * 0.30, Math.min(1, dt * 1.2));
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x,  this.vel.z * 0.30, Math.min(1, dt * 1.2));
  }
}

// Procedural striped bell texture: vertical amber/red bands radiating
// from the bell apex. The texture is mapped via spherical UVs so the
// stripes appear as meridians of the dome.
function makeStripedBellTexture(stripes) {
  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // base gradient — paler at the apex, deeper amber at the rim
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#ffe2c8');
  grad.addColorStop(0.45, '#ff9a72');
  grad.addColorStop(0.85, '#c43c40');
  grad.addColorStop(1.00, '#8a1c2e');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // vertical stripe overlay
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < stripes; i++) {
    const x = (i / stripes) * w;
    const stripeW = w / stripes * 0.32;
    const stripeGrad = g.createLinearGradient(x - stripeW, 0, x + stripeW, 0);
    stripeGrad.addColorStop(0, 'rgba(255,255,255,0)');
    stripeGrad.addColorStop(0.5, 'rgba(120,30,50,0.55)');
    stripeGrad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = stripeGrad;
    g.fillRect(x - stripeW, 0, stripeW * 2, h);
  }
  g.globalCompositeOperation = 'source-over';
  // soft mottling
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(255,${180+Math.random()*60|0},${140+Math.random()*40|0},${Math.random()*0.18})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
