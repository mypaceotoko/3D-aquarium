import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// 金魚ゼリー — translucent jelly-goldfish. Drifts, bobs softly,
// wobbles like it's made of gelatin. The most eye-catching in water.
// ─────────────────────────────────────────────────────────────────────────────

export class GoldfishJelly extends Creature {
  constructor(palette = 0) {
    const { mesh, body, tailBlade, tailBladeB } = makeJellyMesh(palette);
    super({
      species: 'goldfish-jelly',
      mesh,
      cfg: {
        speed: 0.85, maxAccel: 0.8, turnRate: 1.1,
        depthMin: TANK.floorY + 2.5, depthMax: TANK.floorY + 12,
        wanderMin: 3.5, wanderMax: 8, wallMargin: 5,
        facesVelocity: true, reactsToFood: true,
      },
    });
    this._body       = body;
    this._tailA      = tailBlade;
    this._tailB      = tailBladeB;
    this._phase      = Math.random() * Math.PI * 2;
    this._bobPhase   = Math.random() * Math.PI * 2;
  }

  onUpdate(dt, time) {
    // Ferry softly up & down (extra bob beyond wander)
    this.pos.y += Math.sin(time * 1.1 + this._bobPhase) * 0.012;

    // Jiggle: non-uniform scale wobble on body
    const wob = Math.sin(time * 3.2 + this._phase);
    const wob2 = Math.cos(time * 2.5 + this._phase * 0.7);
    this._body.scale.set(
      1.0 + wob * 0.045,
      1.0 + wob2 * 0.055,
      1.0 + wob * 0.035
    );

    // Gauzy tails — two fan blades sway out of phase
    const sway = Math.sin(time * 3.8 + this._phase) * 0.35;
    this._tailA.rotation.y = sway;
    this._tailB.rotation.y = -sway * 0.75;
  }
}

const PALETTES = [
  { fluid: 0xff6a7a, shell: 0xffc8d4 },  // classic red goldfish
  { fluid: 0xffa858, shell: 0xffd8b0 },  // orange koi
  { fluid: 0xa0a0ff, shell: 0xd8d8ff },  // rare ramune blue
];

function makeJellyMesh(paletteIdx) {
  const g = new THREE.Group();
  const pal = PALETTES[paletteIdx % PALETTES.length];

  // Transparent gelatin material — uses transmission for glass-like refraction
  const jellyMat = new THREE.MeshPhysicalMaterial({
    color: pal.shell,
    transmission: 0.92,
    thickness: 1.0,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.68,
    ior: 1.38,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
    sheen: 0.3,
    sheenColor: new THREE.Color(pal.shell).multiplyScalar(1.3),
    emissive: new THREE.Color(pal.fluid).multiplyScalar(0.12),
    attenuationColor: new THREE.Color(pal.fluid),
    attenuationDistance: 3.5,
  });

  // The "goldfish" shape suspended inside — solid core, tinted
  const coreMat = new THREE.MeshStandardMaterial({
    color: pal.fluid, roughness: 0.45, metalness: 0.08,
    emissive: new THREE.Color(pal.fluid).multiplyScalar(0.25),
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.8,
  });

  // Outer jelly blob (rounded cube-ish shape)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 16), jellyMat);
  body.scale.set(1.25, 1.0, 0.85);
  g.add(body);

  // Inner goldfish body (core)
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), coreMat);
  core.scale.set(1.2, 0.85, 0.55);
  core.position.set(0.08, 0.05, 0);
  g.add(core);

  // Core head bump
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), coreMat);
  head.position.set(0.55, 0.1, 0);
  head.scale.set(1, 0.85, 0.7);
  g.add(head);

  // Tiny dot eyes
  const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  const eyeGeo   = new THREE.SphereGeometry(0.055, 8, 6);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(eyeGeo, eyeBlack);
    e.position.set(0.7, 0.18, 0.18 * s);
    g.add(e);
  }

  // Flowing fan tails — two thin layered blades inside the jelly
  const tailMat = new THREE.MeshStandardMaterial({
    color: pal.fluid, roughness: 0.4, transparent: true, opacity: 0.65,
    emissive: new THREE.Color(pal.fluid).multiplyScalar(0.2),
    side: THREE.DoubleSide,
  });
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.bezierCurveTo(0.1, 0.35, 0.55, 0.55, 0.8, 0.15);
  tailShape.bezierCurveTo(0.6, -0.05, 0.45, -0.4, 0.15, -0.55);
  tailShape.bezierCurveTo(-0.05, -0.35, -0.05, -0.1, 0, 0);
  const tailGeo = new THREE.ShapeGeometry(tailShape);

  const tailA = new THREE.Group();
  tailA.position.set(-0.55, 0.05, 0);
  const bladeA = new THREE.Mesh(tailGeo, tailMat);
  bladeA.scale.setScalar(1.0);
  tailA.add(bladeA);
  g.add(tailA);

  const tailB = new THREE.Group();
  tailB.position.set(-0.6, -0.1, 0);
  const bladeB = new THREE.Mesh(tailGeo, tailMat);
  bladeB.scale.set(0.85, 0.9, 0.85);
  bladeB.rotation.z = -0.3;
  tailB.add(bladeB);
  g.add(tailB);

  // Tiny sugar bubble (a sparkle embedded in jelly)
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.1,
    emissive: 0xffe8f4, emissiveIntensity: 0.3,
  });
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bubbleMat);
  b1.position.set(-0.15, 0.55, 0.2);
  g.add(b1);
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bubbleMat);
  b2.position.set(0.25, -0.5, -0.15);
  g.add(b2);

  g.scale.setScalar(1.0);
  return { mesh: g, body, tailBlade: tailA, tailBladeB: tailB };
}
