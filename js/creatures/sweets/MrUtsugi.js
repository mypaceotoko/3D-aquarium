import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mr. ウツギ — 水槽の名物キャラ。小さくて丸い、メガネのおじさん。
// 普段は他のスイーツ生物を追いかけ、餌を見つけると猛烈に走り出す。
// ステップ3: 他のスイーツ生物を target として追いかける土台を追加。
// ─────────────────────────────────────────────────────────────────────────────

// 追跡対象にする近接半径（これより遠ければ wander にフォールバック）
const CHASE_SIGHT_R = 18;
// 追跡 target を再選定するインターバル
const RETARGET_MIN  = 1.4;
const RETARGET_MAX  = 3.0;

export class MrUtsugi extends Creature {
  constructor() {
    const { mesh, parts } = makeMrUtsugiMesh();
    super({
      species: 'mr-utsugi',
      mesh,
      cfg: {
        speed: 1.7, maxAccel: 2.6, turnRate: 2.8,
        // 床近くを「歩く/泳ぐ」イメージで低めに
        depthMin: TANK.floorY + 0.6,
        depthMax: TANK.floorY + 5.0,
        wanderMin: 1.6, wanderMax: 3.4,
        wallMargin: 4,
        facesVelocity: true,
        reactsToFood: true,
      },
    });
    this._parts = parts;
    this._phase = Math.random() * Math.PI * 2;
    this._chaseTarget = null; // 現在追いかけているスイーツ生物
    this._chompT  = 0;        // もぐもぐ演出タイマー（>0 のあいだアニメ）
    this._joyT    = 0;        // 食べた直後のうれしさ（pop）タイマー
  }

  /** 餌を食べた瞬間に sweets.js から呼ばれる。 */
  onAteFood(/* pos */) {
    this._chompT = 0.55;
    this._joyT   = 0.9;
    // 食べたら追跡対象をリセット → 次フレームの pickTarget で別の獲物へ
    this._chaseTarget = null;
    this.wanderT = 0;
  }

  /**
   * 既定の wander は乱数で適当な点を選ぶが、Mr. ウツギは
   * 「近くのスイーツ生物を追いかける」モードを優先する。
   * 対象が居なければ既定の wander にフォールバック。
   */
  pickTarget(state) {
    const others = state?.creatures;
    if (others && others.length) {
      let best = null, bestD = CHASE_SIGHT_R * CHASE_SIGHT_R;
      for (const c of others) {
        if (c === this) continue;
        if (c.species === 'mr-utsugi') continue; // 同族は追わない
        const dx = c.pos.x - this.pos.x;
        const dz = c.pos.z - this.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) { bestD = d2; best = c; }
      }
      if (best) {
        this._chaseTarget = best;
        // ターゲットの少し前/横にオフセットを足して「追いかけ回す」感じに
        const off = (Math.random() - 0.5) * 1.4;
        this.target.set(
          best.pos.x + off,
          THREE.MathUtils.clamp(best.pos.y - 0.4, this.cfg.depthMin, this.cfg.depthMax),
          best.pos.z + (Math.random() - 0.5) * 1.4,
        );
        this.wanderT = THREE.MathUtils.randFloat(RETARGET_MIN, RETARGET_MAX);
        return;
      }
    }
    // フォールバック: 通常の wander
    this._chaseTarget = null;
    super.pickTarget(state);
  }

  onUpdate(dt, time, state) {
    // 追跡中はターゲット位置に追従更新（毎フレ少しだけ追いつめる）
    if (this._chaseTarget && !(state?.food?.active)) {
      const t = this._chaseTarget;
      // 対象が居なくなった/別水槽切替などへの保険
      if (!t.pos) { this._chaseTarget = null; }
      else {
        this.target.x += (t.pos.x - this.target.x) * Math.min(1, dt * 1.6);
        this.target.z += (t.pos.z - this.target.z) * Math.min(1, dt * 1.6);
        this.target.y = THREE.MathUtils.clamp(t.pos.y - 0.4, this.cfg.depthMin, this.cfg.depthMax);
      }
    }

    // タイマー減算
    if (this._chompT > 0) this._chompT = Math.max(0, this._chompT - dt);
    if (this._joyT   > 0) this._joyT   = Math.max(0, this._joyT   - dt);

    // 小走りバウンス（速度に応じて強める）
    const bounce = Math.sin(time * 9.0 + this._phase)
                 * 0.06 * (0.3 + this.speedNorm * 0.7);
    // 食べた直後の「ぴょん」とした嬉しさ（短時間の追加バウンス）
    const joyK = this._joyT > 0 ? Math.sin((1 - this._joyT / 0.9) * Math.PI) : 0;
    const joy  = joyK * 0.18;
    this._parts.body.position.y = this._parts.bodyBaseY + bounce + joy;
    this._parts.head.position.y = this._parts.headBaseY + bounce * 0.6 + joy * 1.1;

    // 腕の振り
    const arm = Math.sin(time * 9.0 + this._phase) * 0.5 * (0.2 + this.speedNorm * 0.8);
    this._parts.armL.rotation.x =  arm;
    this._parts.armR.rotation.x = -arm;

    // 食べる演出: 口をパクパク + 体を縦にスクワッシュ
    if (this._chompT > 0) {
      const k = this._chompT / 0.55;          // 1 → 0
      const wave = Math.sin((1 - k) * Math.PI * 6); // 3回パクパク
      // 口を縦に開閉（torus を Y スケールで表現）
      this._parts.mouth.scale.y = 1 + Math.max(0, wave) * 2.4;
      // 体スクワッシュ
      const sq = 1 + wave * 0.06;
      this._parts.body.scale.set(1.10 / sq, 0.95 * sq, 1.10 / sq);
    } else {
      this._parts.mouth.scale.y = 1;
      this._parts.body.scale.set(1.10, 0.95, 1.10);
    }
  }
}

// ─── Mesh ────────────────────────────────────────────────────────────────────
function makeMrUtsugiMesh() {
  const g = new THREE.Group();

  // パレット
  const SKIN     = 0xf2c89c;
  const SHIRT    = 0xc83040; // 赤チェック風
  const SHIRT_D  = 0x4a1820; // 暗い格子
  const HEADBAND = 0xe04858;
  const HAIR     = 0x3a2418;
  const FRAME    = 0x141414; // メガネ
  const PANTS    = 0x2a2a30;

  const skinMat  = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55 });
  const shirtMat = new THREE.MeshStandardMaterial({
    map: makeCheckerTexture(SHIRT, SHIRT_D),
    roughness: 0.78, metalness: 0,
  });
  const bandMat  = new THREE.MeshStandardMaterial({
    color: HEADBAND, roughness: 0.6,
    emissive: 0x401418, emissiveIntensity: 0.15,
  });
  const hairMat  = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.8 });
  const frameMat = new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.4, metalness: 0.3 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.7 });
  const eyeMat   = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });

  // 体（太鼓腹・丸み）— 前方 +X を「正面」として配置
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.88, 20, 14), shirtMat);
  body.scale.set(1.10, 0.95, 1.10);
  body.position.set(0, 0.85, 0);
  body.castShadow = true;
  g.add(body);

  // ぽっこりお腹（前面に膨らみ）
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), shirtMat);
  belly.position.set(0.30, 0.55, 0);
  belly.scale.set(0.9, 1.0, 1.0);
  belly.castShadow = true;
  g.add(belly);

  // シャツのボタン（前面に縦並び）
  const buttonMat = new THREE.MeshStandardMaterial({ color: 0x2a0a10, roughness: 0.4, metalness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), buttonMat);
    btn.position.set(0.92 - i * 0.04, 1.20 - i * 0.30, 0);
    g.add(btn);
  }

  // 首
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.18, 12), skinMat);
  neck.position.set(0, 1.55, 0);
  g.add(neck);

  // 頭（丸顔・大きめ）
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.66, 22, 18), skinMat);
  head.position.set(0, 2.10, 0);
  head.scale.set(1.08, 1.0, 1.08);
  head.castShadow = true;
  g.add(head);

  // ほっぺ（赤らみ）
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff9c9c, transparent: true, opacity: 0.55 });
  for (const sz of [1, -1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), cheekMat);
    cheek.position.set(0.46, 1.96, 0.34 * sz);
    cheek.scale.set(0.6, 0.7, 0.6);
    g.add(cheek);
  }

  // メガネのフレーム（左右）— 大きめ・太め
  for (const sz of [1, -1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.034, 10, 22), frameMat);
    ring.position.set(0.55, 2.12, 0.22 * sz);
    ring.rotation.y = Math.PI * 0.5;
    g.add(ring);
    // レンズ（薄い反射）
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 18),
      new THREE.MeshBasicMaterial({ color: 0xc8e8ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    lens.position.set(0.555, 2.12, 0.22 * sz);
    lens.rotation.y = Math.PI * 0.5;
    g.add(lens);
  }
  // ブリッジ
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.20, 8), frameMat);
  bridge.position.set(0.55, 2.12, 0);
  bridge.rotation.x = Math.PI * 0.5;
  g.add(bridge);
  // テンプル（つる）— 耳側
  for (const sz of [1, -1]) {
    const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 6), frameMat);
    temple.position.set(0.30, 2.12, 0.42 * sz);
    temple.rotation.z = Math.PI * 0.5;
    temple.rotation.y = sz > 0 ? -0.25 : 0.25;
    g.add(temple);
  }

  // 目（メガネの中、白目＋黒目＋ハイライト）
  for (const sz of [1, -1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), shineMat);
    white.position.set(0.51, 2.12, 0.22 * sz);
    white.scale.set(0.35, 1.05, 1.05);
    g.add(white);

    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), eyeMat);
    pup.position.set(0.57, 2.12, 0.22 * sz);
    g.add(pup);

    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), shineMat);
    sh.position.set(0.61, 2.16, 0.235 * sz);
    g.add(sh);
  }

  // 眉毛（笑顔のハの字）
  for (const sz of [1, -1]) {
    const brow = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.028, 6, 10, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.7 })
    );
    brow.position.set(0.55, 2.32, 0.22 * sz);
    brow.rotation.y = Math.PI * 0.5;
    brow.rotation.z = Math.PI + (sz > 0 ? -0.25 : 0.25);
    g.add(brow);
  }

  // 口（大きな笑顔）
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x6a2818, roughness: 0.8 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 8, 14, Math.PI * 0.85), mouthMat);
  mouth.position.set(0.60, 1.86, 0);
  mouth.rotation.y = Math.PI * 0.5;
  mouth.rotation.z = Math.PI - 0.08;
  g.add(mouth);
  // 歯（白いライン）
  const teeth = new THREE.Mesh(
    new THREE.BoxGeometry(0.005, 0.04, 0.20),
    new THREE.MeshStandardMaterial({ color: 0xfff8ea, roughness: 0.4 })
  );
  teeth.position.set(0.62, 1.90, 0);
  g.add(teeth);

  // 髪のキャップ（頭の上半分をしっかり覆う）— 剥げ防止
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat
  );
  hairCap.position.set(0, 2.10, 0);
  hairCap.scale.set(1.10, 1.06, 1.10);
  hairCap.castShadow = true;
  g.add(hairCap);

  // つんつんスパイク（頭頂〜側頭部に密に分布）
  for (let i = 0; i < 38; i++) {
    const h = 0.22 + Math.random() * 0.20;
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.085 + Math.random() * 0.045, h, 6),
      hairMat
    );
    // 上半球に均一分布（頭頂を密、側頭をやや疎）
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.random() * Math.PI * 0.50; // 0(頭頂) → ~90°(側頭)
    const r = 0.70;
    const px = Math.sin(phi) * Math.cos(theta) * r * 1.10;
    const py = 2.10 + Math.cos(phi) * r * 1.06;
    const pz = Math.sin(phi) * Math.sin(theta) * r * 1.10;
    tuft.position.set(px, py + h * 0.30, pz);
    // 外向きに少し倒す（splay）
    tuft.rotation.z = -px * 0.55 + (Math.random() - 0.5) * 0.30;
    tuft.rotation.x =  pz * 0.55 + (Math.random() - 0.5) * 0.30;
    g.add(tuft);
  }

  // 後頭部の張り出し（リュック側）
  const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), hairMat);
  backHair.position.set(-0.32, 2.20, 0);
  backHair.scale.set(0.85, 0.95, 1.10);
  g.add(backHair);

  // もみあげ（耳の前を縦に流す）
  for (const sz of [1, -1]) {
    const side = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), hairMat);
    side.position.set(0.10, 1.92, 0.50 * sz);
    side.scale.set(0.55, 0.85, 0.55);
    g.add(side);
  }

  // ねじりハチマキ（赤）
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.085, 10, 24), bandMat);
  band.position.set(0, 2.34, 0);
  band.rotation.x = Math.PI * 0.5;
  band.rotation.z = -0.10;
  g.add(band);
  // ハチマキの結び目
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bandMat);
  knot.position.set(-0.48, 2.32, 0.32);
  knot.scale.set(1, 1, 1.4);
  g.add(knot);
  // ハチマキの垂れ
  for (const sz of [0.30, 0.40]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.32), bandMat);
    tail.position.set(-0.62, 2.20, sz);
    tail.rotation.y = -0.5;
    g.add(tail);
  }

  // リュック（背中側）
  const packMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.75 });
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.95), packMat);
  pack.position.set(-0.62, 0.95, 0);
  pack.castShadow = true;
  g.add(pack);
  // リュックのストラップ
  for (const sz of [1, -1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.10), packMat);
    strap.position.set(-0.10, 1.10, 0.42 * sz);
    strap.rotation.z = -0.05;
    g.add(strap);
  }

  // 腕（チェックシャツの袖）— ピボット用 Group
  const armL = new THREE.Group();
  armL.position.set(0, 1.30, 0.92);
  const armLMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.42, 4, 8), shirtMat);
  armLMesh.position.set(0, -0.25, 0);
  armL.add(armLMesh);
  // 手
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skinMat);
  handL.position.set(0, -0.55, 0);
  armL.add(handL);
  // 左手にお菓子（小さなマカロン）
  const macaShellMat = new THREE.MeshStandardMaterial({ color: 0xffa8c8, roughness: 0.55 });
  const macaCreamMat = new THREE.MeshStandardMaterial({ color: 0xfff0d8, roughness: 0.5 });
  const snackTop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), macaShellMat);
  snackTop.position.set(0.12, -0.55, 0);
  snackTop.scale.set(1, 0.42, 1);
  armL.add(snackTop);
  const snackCream = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14), macaCreamMat);
  snackCream.position.set(0.12, -0.61, 0);
  armL.add(snackCream);
  const snackBot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), macaShellMat);
  snackBot.position.set(0.12, -0.66, 0);
  snackBot.scale.set(1, 0.42, 1);
  armL.add(snackBot);
  g.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0, 1.30, -0.92);
  const armRMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.42, 4, 8), shirtMat);
  armRMesh.position.set(0, -0.25, 0);
  armR.add(armRMesh);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skinMat);
  handR.position.set(0, -0.55, 0);
  armR.add(handR);
  g.add(armR);

  // 脚（短め・ちょこっと）
  for (const sz of [0.30, -0.30]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.20, 4, 8), pantsMat);
    leg.position.set(0, 0.18, sz);
    g.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), pantsMat);
    shoe.position.set(0.05, 0.02, sz);
    shoe.scale.set(1.4, 0.55, 1);
    g.add(shoe);
  }

  // 全体スケール — 他の生物よりかなり小さく
  g.scale.setScalar(0.42);

  return {
    mesh: g,
    parts: {
      body, head, mouth, armL, armR,
      bodyBaseY: body.position.y,
      headBaseY: head.position.y,
    },
  };
}

// ─── Checker texture for the shirt ───────────────────────────────────────────
function makeCheckerTexture(colA, colB) {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const a = '#' + colA.toString(16).padStart(6, '0');
  const b = '#' + colB.toString(16).padStart(6, '0');
  g.fillStyle = a;
  g.fillRect(0, 0, s, s);
  g.fillStyle = b;
  const cell = s / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  // 細い格子線
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, s); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(s, i * cell); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
