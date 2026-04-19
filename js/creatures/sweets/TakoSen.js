import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// タコせん — flat octopus senbei. Drifts while spinning, occasionally
// flutters like a tossed coin. Shows off its flat silhouette.
// ─────────────────────────────────────────────────────────────────────────────

export class TakoSen extends Creature {
  constructor() {
    const { mesh, disc } = makeTakoSenMesh();
    super({
      species: 'tako-sen',
      mesh,
      cfg: {
        speed: 1.1, maxAccel: 0.8, turnRate: 0.8,
        depthMin: TANK.floorY + 3.0, depthMax: TANK.floorY + 11,
        wanderMin: 4, wanderMax: 9, wallMargin: 5,
        facesVelocity: false, reactsToFood: false,
      },
    });
    this._disc  = disc;
    this._phase = Math.random() * Math.PI * 2;
    this._spin  = THREE.MathUtils.randFloat(0.4, 0.9) * (Math.random() < 0.5 ? 1 : -1);
    this._flutterT = THREE.MathUtils.randFloat(4, 10);
    this._flutter  = 0;
  }

  orient(dt) {
    // Keep cracker flat-ish but lean softly with motion
    const v = this.vel;
    const bank = Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.35;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, bank, Math.min(1, dt * 1.6));
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      Math.atan2(-v.x, v.z) * 0.15,
      Math.min(1, dt * 1.6)
    );
  }

  onUpdate(dt, time) {
    // Continuous slow spin around the disc's normal (the Y axis of the disc group)
    this._disc.rotation.y += this._spin * dt;

    // Occasional flutter (extra wobble like a flipped coin)
    this._flutterT -= dt;
    if (this._flutterT <= 0) {
      this._flutterT = THREE.MathUtils.randFloat(4, 10);
      this._flutter  = 1.0;
    }
    if (this._flutter > 0) {
      this._flutter = Math.max(0, this._flutter - dt * 1.4);
      this._disc.rotation.x = Math.sin(time * 12) * 0.25 * this._flutter;
    } else {
      this._disc.rotation.x *= 0.92;
    }
  }
}

function makeTakoSenMesh() {
  const g = new THREE.Group();

  // The spinning disc sits inside; outer group handles travel+banking.
  const disc = new THREE.Group();
  g.add(disc);

  // Base cracker — very flat cylinder with slightly warped edges
  const crackerMat = new THREE.MeshStandardMaterial({
    color: 0xf8c878, roughness: 0.85, metalness: 0.02,
    emissive: 0x3a2008, emissiveIntensity: 0.12,
  });
  const charMat = new THREE.MeshStandardMaterial({
    color: 0xa05028, roughness: 0.9,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 22), crackerMat);
  base.castShadow = true;
  // Warp it a bit — displace a few verts slightly
  const pos = base.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) + (Math.random() - 0.5) * 0.025);
  }
  pos.needsUpdate = true;
  base.geometry.computeVertexNormals();
  disc.add(base);

  // Toasted rim ring
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 26), charMat);
  rim.rotation.x = Math.PI * 0.5;
  rim.position.y = 0.0;
  disc.add(rim);

  // Imprinted octopus silhouette — darker flattened shape on top
  const inkMat = new THREE.MeshStandardMaterial({
    color: 0x5a2018, roughness: 0.8,
    emissive: 0x2a0808, emissiveIntensity: 0.1,
  });
  // Head bulb
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), inkMat);
  head.scale.set(1, 0.15, 1);
  head.position.y = 0.07;
  disc.add(head);
  // Forehead bump (octopus mantle dome)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), inkMat);
  dome.scale.set(1, 0.12, 1);
  dome.position.set(0, 0.074, 0.25);
  disc.add(dome);
  // Tentacles — 8 short flat curves around the disc
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.065, 6, 10, Math.PI), inkMat);
    t.position.set(Math.cos(ang) * 0.55, 0.065, Math.sin(ang) * 0.55);
    t.rotation.y = ang + Math.PI * 0.5;
    t.rotation.x = Math.PI * 0.5;
    t.scale.set(1, 0.12, 1);
    disc.add(t);
  }
  // Eyes (tiny white spots)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat);
    e.position.set(s * 0.13, 0.078, 0.12);
    e.scale.set(1, 0.2, 1);
    disc.add(e);
  }

  // Underside — salt speckle (subtle dots on bottom)
  const saltMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.5 });
  for (let i = 0; i < 10; i++) {
    const r = Math.random() * 0.9;
    const a = Math.random() * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), saltMat);
    s.position.set(Math.cos(a) * r, -0.068, Math.sin(a) * r);
    s.scale.set(1, 0.2, 1);
    disc.add(s);
  }

  g.scale.setScalar(1.15);
  return { mesh: g, disc };
}
