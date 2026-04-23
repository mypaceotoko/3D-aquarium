import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// たい焼き — the hero creature. Fish-shaped waffle with red-bean filling.
// Waggles its tail as it swims and makes occasional tight turns.
// ─────────────────────────────────────────────────────────────────────────────

export class Taiyaki extends Creature {
  constructor() {
    const { mesh, tail } = makeTaiyakiMesh();
    super({
      species: 'taiyaki',
      mesh,
      cfg: {
        speed: 2.0, maxAccel: 1.8, turnRate: 1.9,
        depthMin: TANK.floorY + 1.8, depthMax: TANK.floorY + 10,
        wanderMin: 2.5, wanderMax: 6, wallMargin: 5,
        facesVelocity: true, reactsToFood: true,
      },
    });
    this._tail    = tail;
    this._phase   = Math.random() * Math.PI * 2;
    this._spinT   = THREE.MathUtils.randFloat(6, 14);
    this._spin    = 0;
    // Per-individual variation so 3 Taiyaki don't move in sync
    this._wagFreq = THREE.MathUtils.randFloat(6.5, 9.0);
    this._wagAmp  = THREE.MathUtils.randFloat(0.32, 0.46);
    this._bobAmp  = THREE.MathUtils.randFloat(0.006, 0.014);
  }

  onUpdate(dt, time) {
    // Tail waggle (lateral wag, faster when swimming harder)
    const waggle = Math.sin(time * this._wagFreq + this._phase)
                   * this._wagAmp * (0.4 + this.speedNorm * 0.6);
    this._tail.rotation.y = waggle;

    // Subtle vertical bob (like fish body dipping as it swims)
    this.pos.y += Math.sin(time * 2.0 + this._phase * 1.3) * this._bobAmp;

    // Subtle roll as tail wags (tilts body with the swing)
    this.mesh.rotation.z += (waggle * 0.08 - this.mesh.rotation.z) * Math.min(1, dt * 3);

    // Occasional quick in-place spin
    this._spinT -= dt;
    if (this._spinT <= 0) {
      this._spinT = THREE.MathUtils.randFloat(6, 14);
      this._spin  = (Math.random() < 0.5 ? 1 : -1) * 1.1;
    }
    if (Math.abs(this._spin) > 0.01) {
      const step = Math.sign(this._spin) * Math.min(Math.abs(this._spin), dt * 2.0);
      this.mesh.rotateY(step);
      this._spin -= step;
    }
  }
}

function makeTaiyakiMesh() {
  const g = new THREE.Group();

  const waffleMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0a468, roughness: 0.62, metalness: 0.02,
    emissive: 0x3a2008, emissiveIntensity: 0.22,
    clearcoat: 0.3, clearcoatRoughness: 0.6,
    sheen: 0.4, sheenColor: 0xffd8a0,
  });
  const crustMat = new THREE.MeshStandardMaterial({
    color: 0xb07038, roughness: 0.78, metalness: 0.02,
    emissive: 0x2a1008, emissiveIntensity: 0.1,
  });

  // Main body — flattened ellipsoid (fish profile)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), waffleMat);
  body.scale.set(1.35, 0.9, 0.45);
  body.castShadow = true;
  g.add(body);

  // Belly ridges (waffle grid feel)
  for (let i = -1; i <= 1; i++) {
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.045, 6, 18, Math.PI), crustMat);
    ridge.position.set(i * 0.45, -0.05, 0);
    ridge.rotation.x = Math.PI * 0.5;
    ridge.rotation.z = Math.PI;
    ridge.scale.set(1, 0.55, 1);
    g.add(ridge);
  }

  // Head bump
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), waffleMat);
  head.position.set(0.85, 0.15, 0);
  head.scale.set(1, 0.75, 0.5);
  head.castShadow = true;
  g.add(head);

  // Eyes
  const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  const eyeShine = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
  const eyeGeo   = new THREE.SphereGeometry(0.085, 10, 8);
  const shineGeo = new THREE.SphereGeometry(0.035, 8, 6);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(eyeGeo, eyeBlack);
    e.position.set(1.08, 0.22, 0.23 * s);
    g.add(e);
    const sh = new THREE.Mesh(shineGeo, eyeShine);
    sh.position.set(1.13, 0.28, 0.27 * s);
    g.add(sh);
  }

  // Mouth
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x8a4a1a, roughness: 0.8 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 10, Math.PI), mouthMat);
  mouth.position.set(1.28, -0.05, 0);
  mouth.rotation.z = Math.PI * 0.5;
  g.add(mouth);

  // Dorsal fin
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), waffleMat);
  dorsal.position.set(-0.1, 0.78, 0);
  dorsal.rotation.x = Math.PI * 0.5;
  dorsal.scale.set(1, 1, 0.35);
  g.add(dorsal);

  // Tail group — pivot near body joint so Y rotation wags the blade
  const tail = new THREE.Group();
  tail.position.set(-1.25, 0.05, 0);
  const tailBlade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 8), waffleMat);
  tailBlade.rotation.z = Math.PI * 0.5;
  tailBlade.position.set(-0.4, 0, 0);
  tailBlade.scale.set(1, 1, 0.3);
  tail.add(tailBlade);
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.55), crustMat);
  notch.position.set(-0.78, 0, 0);
  tail.add(notch);
  g.add(tail);

  // Red-bean filling hint (visible as a dark band near the seam)
  const anMat = new THREE.MeshStandardMaterial({ color: 0x4a1a20, roughness: 0.7 });
  for (const s of [1, -1]) {
    const an = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), anMat);
    an.position.set(-0.05, -0.02, 0.45 * s);
    an.scale.set(1.4, 0.9, 0.15);
    g.add(an);
  }

  // Sugar sparkle dust on the top
  const sugarMat = new THREE.MeshStandardMaterial({
    color: 0xfff4dc, roughness: 0.25,
    emissive: 0xfff4dc, emissiveIntensity: 0.35,
  });
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), sugarMat);
    sp.position.set(
      -0.7 + Math.random() * 1.6,
      0.55 + Math.random() * 0.2,
      (Math.random() - 0.5) * 0.3
    );
    g.add(sp);
  }

  g.scale.setScalar(1.1);
  return { mesh: g, tail };
}
