import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// ジュゴン — chibi-cute character. Big ellipsoid belly, rounded head with a
// soft little muzzle, sparkly anime eyes, pink cheek blush, tiny smile, paddle
// flippers, and a horizontal dolphin-style fluke that waves smoothly up & down.
//
// No vertex shaders, no jerky velocity hacks — every motion is a smooth sin()
// curve driven from `time`, scaled by speedNorm. The creature glides gracefully
// through the whole tank.
// ─────────────────────────────────────────────────────────────────────────────

export class Dugong extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? 1.0;
    const built = buildDugongMesh({ scale, castShadow: !!opts.castShadow });

    super({
      species: 'dugong',
      mesh: built.root,
      cfg: {
        // Graceful, leisurely — but covers the whole tank
        speed: 1.10,
        maxAccel: 0.55,
        turnRate: 0.95,
        depthMin: TANK.floorY + 1.6,
        depthMax: TANK.maxY  - 1.8,
        wanderMin: 5,  wanderMax: 10,
        wallMargin: 5.5,
        // Generous personal space so it never tangles with smaller creatures
        sepRadius: 5.5,
        sepStr:    1.2,
        sepAll:    true,
        facesVelocity: true,
        reactsToFood: false,
      },
      position: opts.position,
    });

    this._scale     = scale;
    this._tailPivot = built.tailPivot;
    this._lFlipper  = built.lFlipper;
    this._rFlipper  = built.rFlipper;
    this._head      = built.head;
    this._body      = built.body;
    this._headRestY = built.headRestY;
    this._flipperRestX = built.flipperRestX;
    this._phase     = Math.random() * Math.PI * 2;
    this._tailFreq  = 1.05;          // base flap frequency in Hz × 2π
    this._roll      = 0;
    this._bob       = 0;
  }

  onUpdate(dt, time) {
    const speedN = this.speedNorm;

    // ── Vertical fluke flap (smooth sin, faster when swimming faster) ──
    // Driven entirely by time → no jitter from velocity changes
    const flap = Math.sin(time * this._tailFreq * Math.PI * 2 * (0.55 + 0.35 * speedN) + this._phase);
    this._tailPivot.rotation.z = flap * 0.42 * (0.5 + 0.5 * speedN);

    // ── Gentle whole-body bob (very subtle vertical sway) ───────────────
    const bobTarget = Math.sin(time * 0.55 + this._phase) * 0.06;
    this._bob += (bobTarget - this._bob) * Math.min(1, dt * 1.2);
    this._body.position.y = this._bob;
    this._head.position.y = this._headRestY + this._bob * 0.7;

    // ── Bank into turns (smooth roll based on turnSignal) ───────────────
    const rollTarget = -this.turnSignal * 0.22;
    this._roll += (rollTarget - this._roll) * Math.min(1, dt * 2.2);
    this.mesh.rotation.x = this._roll;

    // ── Pectoral flippers: lazy paddling, slower than tail ─────────────
    const padL = Math.sin(time * 0.85 + this._phase + Math.PI) * 0.18;
    const padR = Math.sin(time * 0.85 + this._phase)          * 0.18;
    this._lFlipper.rotation.x = this._flipperRestX + padL;
    this._rFlipper.rotation.x = this._flipperRestX + padR;
  }
}

// ─── Mesh construction ─────────────────────────────────────────────────────

function buildDugongMesh({ scale, castShadow }) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  // ── Materials ────────────────────────────────────────────────────────────
  // Soft cool-gray with a warm pearly sheen for the "anime mascot" finish.
  const skin = new THREE.MeshPhysicalMaterial({
    color:     0xb6c5cf,
    roughness: 0.55, metalness: 0.02,
    clearcoat: 0.55, clearcoatRoughness: 0.45,
    sheen:     0.55, sheenColor: 0xfff0e8, sheenRoughness: 0.55,
    emissive:  0x4a5560, emissiveIntensity: 0.10,
  });
  const belly = new THREE.MeshPhysicalMaterial({
    color:     0xe7d9c9,
    roughness: 0.50, metalness: 0.02,
    clearcoat: 0.35, clearcoatRoughness: 0.50,
    sheen: 0.6, sheenColor: 0xfff8ec,
  });
  const cheek = new THREE.MeshBasicMaterial({ color: 0xff9aac, transparent: true, opacity: 0.78 });
  const eyeWhite = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.18,
    emissive: 0xfff5f8, emissiveIntensity: 0.20,
  });
  const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });
  const eyeIris  = new THREE.MeshStandardMaterial({
    color: 0x223044, roughness: 0.25,
    emissive: 0x101822, emissiveIntensity: 0.4,
  });
  const eyeShine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x7a4050, roughness: 0.6 });
  const flukeM = new THREE.MeshPhysicalMaterial({
    color: 0xa5b3bd, roughness: 0.55, metalness: 0.05,
    clearcoat: 0.45, clearcoatRoughness: 0.55,
    sheen: 0.4, sheenColor: 0xfff0e8,
    side: THREE.DoubleSide,
  });

  // ── Body — fat rounded ellipsoid (chibi: short & chunky) ────────────
  // Length axis = X. Head at +X, tail at -X.
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const bodyMain = new THREE.Mesh(new THREE.SphereGeometry(1.0, 28, 22), skin);
  bodyMain.scale.set(2.10, 1.20, 1.30);   // long-ish but wide & tall (chubby)
  bodyMain.position.x = -0.30;             // shift back so head sits in front
  bodyMain.castShadow = castShadow;
  bodyGroup.add(bodyMain);

  // Belly patch — slightly-flattened cream sphere overlapping the lower half
  const bellyPatch = new THREE.Mesh(new THREE.SphereGeometry(0.88, 22, 18), belly);
  bellyPatch.scale.set(2.10, 0.80, 1.08);
  bellyPatch.position.set(-0.30, -0.45, 0);
  bellyPatch.castShadow = castShadow;
  bodyGroup.add(bellyPatch);

  // ── Head — sphere attached to the front, slightly above ────────────
  const headGroup = new THREE.Group();
  const headRestY = 0.18;
  headGroup.position.set(+1.55, headRestY, 0);
  root.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 26, 22), skin);
  head.scale.set(1.10, 1.0, 1.05);
  head.castShadow = castShadow;
  headGroup.add(head);

  // Soft muzzle bump — small forward-and-down bulge for the dugong's
  // characteristic snout, kept tiny so it stays cute (not droopy).
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 22, 18), skin);
  muzzle.scale.set(1.05, 0.78, 0.90);
  muzzle.position.set(+0.62, -0.32, 0);
  muzzle.castShadow = castShadow;
  headGroup.add(muzzle);

  // Mouth — tiny smile arc on the front-bottom of the muzzle.
  // Default TorusGeometry: ring in X-Y plane around Z, arc 0→π goes through +Y.
  // Rotate so the half-arc lies in the Y-Z plane (visible from +X) and curves
  // downward → reads as a smile when viewed from the front of the face.
  const mouthGeo = new THREE.TorusGeometry(0.16, 0.030, 8, 20, Math.PI);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.rotation.x = Math.PI;          // flip Y (top half → bottom half)
  mouth.rotation.y = -Math.PI / 2;     // rotate ring around X axis → faces +X
  mouth.position.set(+1.02, -0.42, 0);
  headGroup.add(mouth);

  // Tiny lip dot (philtrum) just above the mouth
  const philtrum = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mouthMat);
  philtrum.position.set(+1.06, -0.30, 0);
  philtrum.scale.set(0.6, 1.0, 0.6);
  headGroup.add(philtrum);

  // Nostrils — paired tiny dimples on top of the muzzle
  for (const side of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mouthMat);
    n.scale.set(1.0, 0.45, 0.65);
    n.position.set(+0.95, +0.05, 0.16 * side);
    headGroup.add(n);
  }

  // ── EYES — big sparkly anime style ────────────────────────────────────
  // Layered: white sclera → dark iris → black pupil → two white highlights.
  // Positioned on the *front* of the head (chibi face proportions) so both
  // eyes read clearly from any angle, not just one at a time like a fish.
  // Geometry stacks in +Z (outward from anchor); the anchor's +Z is oriented
  // forward-and-slightly-outward via setFromUnitVectors.
  for (const side of [-1, 1]) {
    const eyeAnchor = new THREE.Group();
    // On the upper-front of the head sphere — sits just outside the surface
    // so the eye protrudes cleanly instead of being eaten by the head mesh.
    eyeAnchor.position.set(+0.92, +0.30, 0.42 * side);
    // Face mostly forward (+X) with ~17° outward tilt so both eyes show
    // from 3/4 views without the silhouette flattening from direct front.
    const lookDir = new THREE.Vector3(1, 0.10, 0.30 * side).normalize();
    eyeAnchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lookDir);
    headGroup.add(eyeAnchor);

    // White sclera — slightly taller-than-wide for the cartoony "big eye"
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), eyeWhite);
    sclera.scale.set(1.0, 1.12, 0.45);
    eyeAnchor.add(sclera);

    // Dark iris
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 12), eyeIris);
    iris.scale.set(1.0, 1.0, 0.30);
    iris.position.z = 0.11;
    eyeAnchor.add(iris);

    // Pupil
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), eyeBlack);
    pupil.scale.set(1.0, 1.0, 0.25);
    pupil.position.z = 0.15;
    eyeAnchor.add(pupil);

    // Big highlight — upper-left of the pupil
    const shine1 = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), eyeShine);
    shine1.position.set(-0.07, +0.08, 0.19);
    shine1.scale.set(1.0, 1.0, 0.3);
    eyeAnchor.add(shine1);
    // Small second highlight — lower-right
    const shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), eyeShine);
    shine2.position.set(+0.06, -0.06, 0.19);
    shine2.scale.set(1.0, 1.0, 0.3);
    eyeAnchor.add(shine2);
  }

  // ── Pink cheek blush — flat circles glued to the head surface ───────
  for (const side of [-1, 1]) {
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), cheek);
    blush.position.set(+0.65, -0.05, 0.72 * side);
    // CircleGeometry's normal is +Z. lookAt makes local -Z face the target,
    // so targeting the head center (origin) leaves +Z facing OUTWARD ✓
    blush.lookAt(0, 0, 0);
    headGroup.add(blush);
  }

  // ── Pectoral flippers — small rounded paddles ─────────────────────────
  const flipperRestX = -0.35;
  const lFlipper = makeFlipper(skin, +1);
  const rFlipper = makeFlipper(skin, -1);
  lFlipper.position.set(+0.40, -0.35, +1.10);
  rFlipper.position.set(+0.40, -0.35, -1.10);
  lFlipper.rotation.y = -0.55;
  rFlipper.rotation.y = +0.55;
  lFlipper.rotation.x = flipperRestX;
  rFlipper.rotation.x = flipperRestX;
  if (castShadow) {
    lFlipper.traverse(o => o.isMesh && (o.castShadow = true));
    rFlipper.traverse(o => o.isMesh && (o.castShadow = true));
  }
  root.add(lFlipper);
  root.add(rFlipper);

  // ── Caudal fluke — horizontal crescent (waves vertically via pivot) ──
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-2.05, 0, 0);
  root.add(tailPivot);

  // Tail peduncle — narrow rounded join between body & fluke
  const peduncle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), skin);
  peduncle.scale.set(1.6, 0.55, 0.85);
  peduncle.position.x = +0.10;
  peduncle.castShadow = castShadow;
  tailPivot.add(peduncle);

  // Fluke crescent
  const flukeGeo = makeFlukeGeometry({ span: 1.55, back: 0.95 });
  const flukeMesh = new THREE.Mesh(flukeGeo, flukeM);
  flukeMesh.position.set(-0.20, 0, 0);
  flukeMesh.castShadow = castShadow;
  tailPivot.add(flukeMesh);

  return {
    root,
    body: bodyGroup,
    head: headGroup,
    headRestY,
    tailPivot,
    lFlipper,
    rFlipper,
    flipperRestX,
  };
}

// ─── Flipper geometry (rounded paddle, extruded for thickness) ──────────
function makeFlipper(material, side) {
  const W = 0.70, L = 0.95;
  const s = new THREE.Shape();
  s.moveTo(0, +W * 0.42);
  s.quadraticCurveTo(L * 0.40, +W * 0.58, L * 0.90, +W * 0.22);
  s.quadraticCurveTo(L * 1.04, 0,         L * 0.90, -W * 0.20);
  s.quadraticCurveTo(L * 0.45, -W * 0.42, 0,        -W * 0.34);
  s.quadraticCurveTo(-W * 0.22, 0,        0,        +W * 0.42);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05,
    bevelSegments: 3, curveSegments: 10,
  });
  geo.translate(0, 0, -0.08);   // center the thickness
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  if (side < 0) m.scale.z = -1; // mirror for the other side
  return m;
}

// ─── Crescent fluke geometry — 三日月形 dolphin/dugong tail ───────────────
// Two pointed lobes sweep outward (with modest back-sweep) and the trailing
// edge has a clear V-notch in the middle so the silhouette reads clearly as
// a crescent. Control points are chosen so the bezier tangents meet at the
// tip from different directions → the lobe tips read as proper points
// instead of a smooth rounded arc.
function makeFlukeGeometry({ span, back }) {
  const FB = back, FW = span;

  const s = new THREE.Shape();
  s.moveTo(0, 0);   // attachment point (front-center)

  // ── RIGHT lobe ──
  // Leading edge (front of the fluke) — gentle outward sweep from the
  // attachment toward the tip. Control 2 is just inside the tip so the
  // leading-edge tangent arrives nearly parallel to the +Y axis (pointed).
  s.bezierCurveTo(
    -FB * 0.10, +FW * 0.32,
    -FB * 0.42, +FW * 0.92,
    -FB * 0.62, +FW * 1.00,    // RIGHT TIP
  );
  // Trailing edge (back of the fluke) — concave inward curve from the tip
  // back to the notch shoulder. Control 1 sits backward & inboard of the
  // tip so the trailing-edge tangent LEAVES the tip going mostly in -Y,
  // i.e., at an angle to the leading-edge arrival → POINTED tip.
  s.bezierCurveTo(
    -FB * 0.92, +FW * 0.92,
    -FB * 0.92, +FW * 0.30,
    -FB * 0.62, +FW * 0.16,    // notch shoulder
  );
  // V-notch into the centerline (clear inward indent)
  s.lineTo(-FB * 0.35, 0);     // notch bottom

  // ── LEFT lobe (mirror) ──
  s.lineTo(-FB * 0.62, -FW * 0.16);
  s.bezierCurveTo(
    -FB * 0.92, -FW * 0.30,
    -FB * 0.92, -FW * 0.92,
    -FB * 0.62, -FW * 1.00,    // LEFT TIP
  );
  s.bezierCurveTo(
    -FB * 0.42, -FW * 0.92,
    -FB * 0.10, -FW * 0.32,
    0, 0,                      // back to attachment
  );

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.10, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04,
    bevelSegments: 2, curveSegments: 18,
  });
  // Shape currently lives in X-Y; rotate so it lies in X-Z (horizontal fluke)
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.05, 0);   // center the thickness around y=0
  geo.computeVertexNormals();
  return geo;
}

// ─── Spawner ─────────────────────────────────────────────────────────────
export function spawnDugongs(scene, count = 1, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Dugong(opts);
    scene.add(d.mesh);
    out.push(d);
  }
  return out;
}
