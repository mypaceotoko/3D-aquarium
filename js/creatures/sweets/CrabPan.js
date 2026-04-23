import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// カニパン — crab-shaped melon-bread. Scuttles sideways near the floor
// with twitchy little legs. A bit goofy.
// ─────────────────────────────────────────────────────────────────────────────

export class CrabPan extends Creature {
  constructor() {
    const { mesh, legs, claws } = makeCrabPanMesh();
    super({
      species: 'crab-pan',
      mesh,
      cfg: {
        speed: 1.5, maxAccel: 2.0, turnRate: 1.2,
        depthMin: TANK.floorY + 0.8, depthMax: TANK.floorY + 3.5,
        wanderMin: 2, wanderMax: 5, wallMargin: 4,
        facesVelocity: false, // crabs don't face velocity; we orient sideways
        reactsToFood: true,
      },
    });
    this._legs    = legs;
    this._claws   = claws;
    this._phase   = Math.random() * Math.PI * 2;
    this._sideDir = Math.random() < 0.5 ? 1 : -1;
    // Per-individual leg tempo and claw sway freq
    this._legFreq  = THREE.MathUtils.randFloat(12, 17);
    this._clawFreq = THREE.MathUtils.randFloat(2.8, 4.2);
    this._hopT     = THREE.MathUtils.randFloat(1.5, 3.5);
    this._hopY     = 0;
  }

  orient(dt) {
    const v = this.vel;
    if (v.lengthSq() < 0.0004) return;
    // Face perpendicular to velocity (sideways crab walk)
    const heading = Math.atan2(v.z, v.x);
    const target  = heading + this._sideDir * Math.PI * 0.5;
    const cur = this.mesh.rotation.y;
    let delta = target - cur;
    while (delta >  Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.mesh.rotation.y += delta * Math.min(1, dt * this.cfg.turnRate * 1.5);
  }

  onUpdate(dt, time) {
    // Legs twitch in alternating pairs (per-instance tempo)
    const tw = Math.sin(time * this._legFreq + this._phase) * 0.55 * (0.35 + this.speedNorm * 0.7);
    for (let i = 0; i < this._legs.length; i++) {
      const L = this._legs[i];
      const alt = (i % 2 === 0) ? tw : -tw;
      L.rotation.z = L.userData.base + alt * 0.8;
    }
    // Claws bob slightly (threatening... in a goofy way)
    const cbob = Math.sin(time * this._clawFreq + this._phase) * 0.18;
    this._claws[0].rotation.z = 0.4 + cbob;
    this._claws[1].rotation.z = -0.4 - cbob;

    // Tiny scuttle-hop: brief Y pulse every few seconds
    this._hopT -= dt;
    if (this._hopT <= 0) {
      this._hopT = THREE.MathUtils.randFloat(1.5, 3.5);
      this._hopY = 0.22;
    }
    if (this._hopY > 0.002) {
      this._hopY *= Math.pow(0.05, dt);
      this.pos.y += this._hopY * dt * 4;
    }
  }
}

function makeCrabPanMesh() {
  const g = new THREE.Group();

  const breadMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8c888, roughness: 0.75, metalness: 0,
    emissive: 0x3a1f08, emissiveIntensity: 0.16,
    sheen: 0.35, sheenColor: 0xffe0a8,
    clearcoat: 0.1, clearcoatRoughness: 0.8,
  });
  const sugarMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e0, roughness: 0.6,
  });
  const crustMat = new THREE.MeshStandardMaterial({
    color: 0xc48048, roughness: 0.88,
  });

  // Body — round melon-bread top (wider than tall)
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 22, 14), breadMat);
  body.scale.set(1.25, 0.7, 1.0);
  body.castShadow = true;
  g.add(body);

  // Melon-pan criss-cross stripes (sugar glaze)
  const stripeGeo = new THREE.TorusGeometry(1.0, 0.04, 6, 24);
  for (let i = -1; i <= 1; i++) {
    const s1 = new THREE.Mesh(stripeGeo, sugarMat);
    s1.position.y = 0.1;
    s1.rotation.x = Math.PI * 0.5;
    s1.rotation.z = i * Math.PI * 0.22;
    s1.scale.set(1, 0.55, 1);
    g.add(s1);
    const s2 = s1.clone();
    s2.rotation.z = -i * Math.PI * 0.22 + Math.PI * 0.5;
    g.add(s2);
  }

  // Eyes on little stalks
  const stalkMat = new THREE.MeshStandardMaterial({ color: 0xc48048, roughness: 0.85 });
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
  const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  for (const s of [1, -1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.35, 8), stalkMat);
    stalk.position.set(0.25, 0.75, 0.35 * s);
    g.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), eyeWhite);
    eye.position.set(0.25, 0.95, 0.35 * s);
    g.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), eyeBlack);
    pup.position.set(0.33, 0.97, 0.37 * s);
    g.add(pup);
  }

  // Mouth — cartoon curve
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x6a3818 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 10, Math.PI), mouthMat);
  mouth.position.set(0.85, 0.35, 0);
  mouth.rotation.x = Math.PI * 0.5;
  g.add(mouth);

  // Claws — front two, jointed
  const claws = [];
  for (const s of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.45, 0.05, 0.85 * s);
    arm.rotation.z = 0.4 * s;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 8), breadMat);
    seg.position.y = 0.27;
    arm.add(seg);
    const pincerA = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), breadMat);
    pincerA.position.set(0, 0.6, 0.05);
    pincerA.scale.set(1.1, 0.55, 0.7);
    arm.add(pincerA);
    const pincerB = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), breadMat);
    pincerB.position.set(0, 0.6, -0.05);
    pincerB.scale.set(1.1, 0.55, 0.7);
    arm.add(pincerB);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.1), crustMat);
    slit.position.set(0.12, 0.6, 0);
    arm.add(slit);
    g.add(arm);
    claws.push(arm);
  }

  // Legs — 3 pairs, short, with hip pivots
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.6, 7);
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const hip = new THREE.Group();
      hip.position.set(-0.1 + i * -0.32, -0.1, 0.9 * s);
      const baseRot = 0.3 * s;
      hip.rotation.z = baseRot;
      hip.userData.base = baseRot;
      const seg = new THREE.Mesh(legGeo, breadMat);
      seg.position.y = -0.28;
      hip.add(seg);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), crustMat);
      foot.position.y = -0.58;
      hip.add(foot);
      g.add(hip);
      legs.push(hip);
    }
  }

  // Sugar crystals scattered on the shell (very small)
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xfff4dc, roughness: 0.25,
    emissive: 0xfff4dc, emissiveIntensity: 0.25,
  });
  for (let i = 0; i < 9; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r   = Math.random() * 0.95;
    const sp  = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), crystalMat);
    sp.position.set(Math.cos(ang) * r, 0.55, Math.sin(ang) * r * 0.75);
    g.add(sp);
  }

  g.scale.setScalar(1.05);
  return { mesh: g, legs, claws };
}
