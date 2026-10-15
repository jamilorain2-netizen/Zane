import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { loadGltfWithFallback, stripRootMotion } from '../utils/assetLoader';
import { BoxCollider2D } from '../utils/collision';

/**
 * Creates a lit standard material tinted dark crimson with a vibrant cyan rim light shader on its silhouette edges.
 * Retains any original diffuse map texture.
 */
export function createMonsterMaterial(origMap: THREE.Texture | null = null): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x6b101c), // Dark crimson tint
    map: origMap || null,
    roughness: 0.45,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: new THREE.Color(0x00ffff) };
    shader.uniforms.rimPower = { value: 2.2 };
    shader.uniforms.rimIntensity = { value: 2.0 };
    shader.fragmentShader = `
      uniform vec3 rimColor;
      uniform float rimPower;
      uniform float rimIntensity;
      ${shader.fragmentShader}
    `.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       vec3 rimViewDir = normalize( vViewPosition );
       float rimFactor = 1.0 - max( dot( rimViewDir, normal ), 0.0 );
       rimFactor = pow( clamp( rimFactor, 0.0, 1.0 ), rimPower ) * rimIntensity;
       gl_FragColor.rgb += rimColor * rimFactor;`
    );
  };

  return mat;
}

export interface LaserBolt {
  mesh: THREE.Mesh;
  direction: THREE.Vector3;
  targetPos: THREE.Vector3;
  speed: number;
  isTargetedNearZane: boolean;
}

export interface PooledProjectile {
  mesh: THREE.Group;
  active: boolean;
  type: 'plasma_red' | 'plasma_cyan' | 'laser_crouch' | 'missile';
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  speed: number;
}

interface ActiveSpark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ActiveSmokePuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface ActiveGroundDebris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface DustPuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

// 2D line-segment AABB intersection helper for line-of-sight cover check
function lineIntersectsAABB2D(
  p1x: number, p1z: number,
  p2x: number, p2z: number,
  minX: number, maxX: number,
  minZ: number, maxZ: number
): boolean {
  let t0 = 0, t1 = 1;
  const dx = p2x - p1x;
  const dz = p2z - p1z;

  const p = [-dx, dx, -dz, dz];
  const q = [p1x - minX, maxX - p1x, p1z - minZ, maxZ - p1z];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

// Toy Mechs built from plastic toy building blocks & battery packs
interface ToyBuildingBlockMech {
  group: THREE.Group;
  torso: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  muzzleFlashL: THREE.Mesh;
  muzzleFlashR: THREE.Mesh;
  fireTimer: number;
  baseX: number;
  baseZ: number;
}

// Enemy soldiers crafted as stylized green/blue plastic toy action figures with molded plastic bases
interface ToyPlasticSoldier {
  group: THREE.Group;
  armR: THREE.Group;
  muzzleFlash: THREE.Mesh;
  legL: THREE.Group;
  legR: THREE.Group;
  fireTimer: number;
  isRunner: boolean;
  baseX: number;
  baseZ: number;
}

export class BattlefieldScene {
  public group: THREE.Group;

  // Parallax layers (scroll at different rates relative to Zane's position)
  private farLayer: THREE.Group;
  private midFarLayer: THREE.Group;
  private midLayer: THREE.Group;
  private foregroundLayer: THREE.Group;

  // Giant household Desk Lamps & Floor Lamps acting as Laser Searchlight Towers
  private lampLaserTowers: THREE.Group[] = [];

  // Animated background combat actors: Toy Block Mechs & Toy Plastic Soldiers
  private toyMechs: ToyBuildingBlockMech[] = [];
  private toySoldiers: ToyPlasticSoldier[] = [];

  // Distant explosion flickers
  private distantExplosionLights: THREE.PointLight[] = [];
  private distantExplosionFlares: THREE.Mesh[] = [];
  private distantExplosionTimers: number[] = [0.4, 1.2, 2.1];

  // Laser bolts & effects
  private laserBolts: LaserBolt[] = [];
  private laserSpawnTimer: number = 0;
  private animTimer: number = 0;

  // Dynamic impact lighting on Zane
  private impactFlashLight: THREE.PointLight;
  private flashIntensity: number = 0;

  // Particles: Sparks, Drifting Ash, Footstep Dust, Exploding Ground Debris, Billowing Smoke
  private activeSparks: ActiveSpark[] = [];
  private sparksGeometry: THREE.BufferGeometry;
  private sparksPoints: THREE.Points;

  private ashGeometry: THREE.BufferGeometry;
  private ashPoints: THREE.Points;

  private activeSmokePuffs: ActiveSmokePuff[] = [];
  private smokeGroup: THREE.Group;

  private activeDebris: ActiveGroundDebris[] = [];
  private debrisGroup: THREE.Group;

  private activeDust: DustPuff[] = [];
  private dustGroup: THREE.Group;
  private dustEmitCooldown: number = 0;

  // 2D Ground Plane Box Colliders
  public colliders: BoxCollider2D[] = [];
  private activeRings: { mesh: THREE.Mesh; scaleSpeed: number; life: number; maxLife: number; }[] = [];

  // Projectile pooling system
  public projectileGroup!: THREE.Group;
  private projectilePool: PooledProjectile[] = [];
  private firefightTimer: number = 0;

  // Shared projectile materials to prevent creating them on the fly
  private projRedMat!: THREE.MeshStandardMaterial;
  private projCyanMat!: THREE.MeshStandardMaterial;
  private projOrangeMat!: THREE.MeshStandardMaterial;
  private projMissileMat!: THREE.MeshStandardMaterial;

  // Callback for camera shake
  public onExplosionTrigger?: (intensity: number) => void;

  // Obstacle references for path clearance & visual debugging
  private groundMesh: THREE.Mesh | null = null;
  public obstacleMeshes: THREE.Object3D[] = [];
  public colliderHelpers: THREE.BoxHelper[] = [];

  constructor() {
    this.group = new THREE.Group();

    // 1. Setup Layered Parallax Hierarchy
    this.farLayer = new THREE.Group();
    this.midFarLayer = new THREE.Group();
    this.midLayer = new THREE.Group();
    this.foregroundLayer = new THREE.Group();

    this.group.add(this.farLayer);
    this.group.add(this.midFarLayer);
    this.group.add(this.midLayer);
    this.group.add(this.foregroundLayer);

    // 2. Build Household-Object Imagination Elements
    this.buildTerrainBedspreadDunes();
    this.buildFarCrayonRidges();
    this.buildToyMechsAndActionFigures();
    this.buildDeskLampLaserTowers();
    this.buildDistantExplosions();
    this.buildCouchCushionCoverAndProps();
    this.buildSupplyDepot();
    this.setupLighting();
    this.buildColliders();

    // Run cutscene path clearance corridor
    this.clearPath();

    // Initialize Projectile pooling system
    this.projectileGroup = new THREE.Group();
    this.projectileGroup.name = 'BattlefieldProjectileGroup';
    this.group.add(this.projectileGroup);
    this.initProjectilePool();

    // 3. Dynamic impact light
    this.impactFlashLight = new THREE.PointLight(0xf97316, 0, 10);
    this.impactFlashLight.position.set(0.5, 0.8, 0.5);
    this.group.add(this.impactFlashLight);

    // 4. Spark Particle System
    const sparkCount = 200;
    this.sparksGeometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(sparkCount * 3);
    this.sparksGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xfb923c,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
    });
    this.sparksPoints = new THREE.Points(this.sparksGeometry, sparkMat);
    this.group.add(this.sparksPoints);

    // 5. Drifting Ash & Sparkle Particle System
    const ashCount = 240;
    this.ashGeometry = new THREE.BufferGeometry();
    const ashPositions = new Float32Array(ashCount * 3);
    for (let i = 0; i < ashCount; i++) {
      ashPositions[i * 3] = (Math.random() - 0.5) * 36;
      ashPositions[i * 3 + 1] = 0.2 + Math.random() * 8;
      ashPositions[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    this.ashGeometry.setAttribute('position', new THREE.BufferAttribute(ashPositions, 3));
    const ashMat = new THREE.PointsMaterial({
      color: 0xd97724,
      size: 0.045,
      transparent: true,
      opacity: 0.75,
    });
    this.ashPoints = new THREE.Points(this.ashGeometry, ashMat);
    this.group.add(this.ashPoints);

    // 6. Particle Groups
    this.smokeGroup = new THREE.Group();
    this.debrisGroup = new THREE.Group();
    this.dustGroup = new THREE.Group();
    this.group.add(this.smokeGroup, this.debrisGroup, this.dustGroup);
  }

  // GROUND TERRAIN: Quilt / Bedspread folds transformed into alien cosmic crags
  private buildTerrainBedspreadDunes() {
    const groundGeo = new THREE.PlaneGeometry(60, 60, 28, 28);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Soft fabric blanket rolling waves mixed with craggy terrain
      const z = Math.sin(x * 0.25) * 0.35 + Math.cos(y * 0.2) * 0.3 + (Math.random() - 0.5) * 0.2;
      pos.setZ(i, z);
    }
    groundGeo.computeVertexNormals();

    // Deep sci-fi midnight teal with fabric texture undertones
    const groundMat = createToonMaterial({ color: 0x091629, desaturate: 0.18, side: THREE.DoubleSide });
    groundMat.side = THREE.DoubleSide;
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.groundMesh = ground;
    this.foregroundLayer.add(ground);

    // Glowing Burnt Orange fissures along the runner track
    const fissureMat = createToonMaterial({ color: 0xb45309, desaturate: 0.15 });
    for (let f = 0; f < 8; f++) {
      const fissure = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 6 + Math.random() * 4), fissureMat);
      fissure.rotation.x = -Math.PI / 2;
      fissure.position.set((f - 3.5) * 3.2 + (Math.random() - 0.5) * 1.5, 0.01, (Math.random() - 0.5) * 16);
      fissure.rotation.z = Math.random() * Math.PI;
      this.foregroundLayer.add(fissure);
    }
  }

  // FAR LAYER: Crayon-drawn space fortresses & distant bedroom furniture silhouette
  private buildFarCrayonRidges() {
    this.farLayer.position.set(0, 0, -24);

    const mountainMat1 = createToonMaterial({ color: 0x091424, desaturate: 0.25 });
    const mountainMat2 = createToonMaterial({ color: 0x0d2138, desaturate: 0.25 });

    const createMesaRidge = (width: number, height: number, x: number, y: number, mat: THREE.Material) => {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, 0);
      shape.lineTo(-width * 0.38, height);
      shape.lineTo(-width * 0.15, height * 0.85);
      shape.lineTo(width * 0.1, height * 1.1);
      shape.lineTo(width * 0.35, height);
      shape.lineTo(width / 2, 0);
      shape.closePath();
      const geom = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, 0);
      addInkOutline(mesh, 0.04);
      return mesh;
    };

    this.farLayer.add(createMesaRidge(32, 11, -12, 0, mountainMat1));
    this.farLayer.add(createMesaRidge(36, 13, 10, 0, mountainMat2));
    this.farLayer.add(createMesaRidge(26, 9.5, -2, 0, mountainMat1));

    // Alien orange ringed planet disc (drawn with child's crayon enthusiasm)
    const planetMat = createToonMaterial({ color: 0xb45309, desaturate: 0.15 });
    const planet = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), planetMat);
    planet.position.set(-6, 9.5, -0.5);
    addInkOutline(planet, 0.04);

    // Planet ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.8, 4.4, 24),
      createToonMaterial({ color: 0x0284c7, desaturate: 0.1 })
    );
    ring.position.set(-6, 9.5, -0.4);
    ring.rotation.z = -0.35;
    this.farLayer.add(planet, ring);
  }

  // MID-FAR LAYER: TOY BLOCK MECHS & ACTION FIGURE SOLDIERS
  private buildToyMechsAndActionFigures() {
    this.midFarLayer.position.set(0, 0, -15);

    const blockPlasticMat = createToonMaterial({ color: 0x1e3a8a, desaturate: 0.15 });
    const blockYellowMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.1 });
    const blockRedMat = createToonMaterial({ color: 0xef4444, desaturate: 0.1 });
    const muzzleFlashMat = createToonMaterial({ color: 0xf97316, desaturate: 0.1 });

    // Build 2 Toy Building-Block Mechs (Clearly recognizable as kids' construction toys with studs and joints)
    const mechConfigs = [
      { x: -14.5, z: 0, scale: 0.95 },
      { x: 15.5, z: -2, scale: 1.1 },
    ];

    mechConfigs.forEach((cfg) => {
      const mechGroup = new THREE.Group();
      mechGroup.position.set(cfg.x, 0, cfg.z);
      mechGroup.scale.setScalar(cfg.scale);

      // Torso made of chunky primary-colored toy blocks with studs
      const torso = new THREE.Group();
      torso.position.y = 2.4;

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.8), blockPlasticMat);
      addInkOutline(chassis, 0.045);
      torso.add(chassis);

      // Toy studs on top of block chassis
      for (let sx = -0.5; sx <= 0.5; sx += 0.5) {
        for (let sz = -0.5; sz <= 0.5; sz += 0.5) {
          const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 10), blockYellowMat);
          stud.position.set(sx, 0.65, sz);
          addInkOutline(stud, 0.025);
          torso.add(stud);
        }
      }

      // Visor / Cockpit
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.2), muzzleFlashMat);
      visor.position.set(0, 0.1, 0.95);
      torso.add(visor);

      // Left Heavy Toy Cannon (Crayon/marker barrel shape)
      const cannonL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 8), blockRedMat);
      cannonL.rotation.x = Math.PI / 2;
      cannonL.position.set(1.0, -0.2, 0.9);
      addInkOutline(cannonL, 0.04);
      torso.add(cannonL);

      const muzzleL = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.45, 6), muzzleFlashMat);
      muzzleL.rotation.x = -Math.PI / 2;
      muzzleL.position.set(1.0, -0.2, 2.1);
      muzzleL.visible = false;
      torso.add(muzzleL);

      // Right Heavy Cannon
      const cannonR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 8), blockRedMat);
      cannonR.rotation.x = Math.PI / 2;
      cannonR.position.set(-1.0, -0.2, 0.9);
      addInkOutline(cannonR, 0.04);
      torso.add(cannonR);

      const muzzleR = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.45, 6), muzzleFlashMat);
      muzzleR.rotation.x = -Math.PI / 2;
      muzzleR.position.set(-1.0, -0.2, 2.1);
      muzzleR.visible = false;
      torso.add(muzzleR);

      mechGroup.add(torso);

      // Articulated Legs
      const legL = new THREE.Group();
      legL.position.set(0.7, 1.8, 0);
      const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.4), blockPlasticMat);
      thighL.position.y = -0.6;
      addInkOutline(thighL, 0.04);
      legL.add(thighL);
      mechGroup.add(legL);

      const legR = new THREE.Group();
      legR.position.set(-0.7, 1.8, 0);
      const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.4), blockPlasticMat);
      thighR.position.y = -0.6;
      addInkOutline(thighR, 0.04);
      legR.add(thighR);
      mechGroup.add(legR);

      this.midFarLayer.add(mechGroup);

      this.toyMechs.push({
        group: mechGroup,
        torso,
        legL,
        legR,
        muzzleFlashL: muzzleL,
        muzzleFlashR: muzzleR,
        fireTimer: Math.random() * 2.0,
        baseX: cfg.x,
        baseZ: cfg.z,
      });
    });

    // Build 4 PLASTIC TOY ACTION FIGURE SOLDIERS with circular molded display stand bases!
    const plasticGreenMat = createToonMaterial({ color: 0x15803d, desaturate: 0.15 }); // Green army men plastic
    const plasticStandMat = createToonMaterial({ color: 0x166534, desaturate: 0.15 });

    const soldierPositions = [
      { x: -13.5, z: 2, isRunner: true },
      { x: -12.2, z: 3, isRunner: true },
      { x: 12.8, z: 1, isRunner: false },
      { x: 14.2, z: 2.5, isRunner: false },
    ];

    soldierPositions.forEach((pos) => {
      const soldierGroup = new THREE.Group();
      soldierGroup.position.set(pos.x, 0, pos.z);
      soldierGroup.scale.setScalar(0.75);

      // Molded round plastic toy figure base
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 12), plasticStandMat);
      stand.position.y = 0.025;
      addInkOutline(stand, 0.025);
      soldierGroup.add(stand);

      // Molded plastic body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.65, 0.25), plasticGreenMat);
      body.position.y = 0.65;
      addInkOutline(body, 0.035);
      soldierGroup.add(body);

      // Molded helmet & head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), plasticGreenMat);
      head.position.y = 1.1;
      addInkOutline(head, 0.035);
      soldierGroup.add(head);

      // Toy Blaster Rifle in hand
      const armR = new THREE.Group();
      armR.position.set(-0.25, 0.85, 0);
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.65), plasticGreenMat);
      rifle.position.set(0, -0.15, 0.3);
      addInkOutline(rifle, 0.03);
      armR.add(rifle);

      const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), muzzleFlashMat);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, -0.15, 0.7);
      muzzle.visible = false;
      armR.add(muzzle);
      soldierGroup.add(armR);

      const legL = new THREE.Group();
      legL.position.set(0.12, 0.45, 0);
      const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), plasticGreenMat);
      thighL.position.y = -0.25;
      addInkOutline(thighL, 0.03);
      legL.add(thighL);
      soldierGroup.add(legL);

      const legR = new THREE.Group();
      legR.position.set(-0.12, 0.45, 0);
      const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), plasticGreenMat);
      thighR.position.y = -0.25;
      addInkOutline(thighR, 0.03);
      legR.add(thighR);
      soldierGroup.add(legR);

      this.midFarLayer.add(soldierGroup);

      this.toySoldiers.push({
        group: soldierGroup,
        armR,
        muzzleFlash: muzzle,
        legL,
        legR,
        fireTimer: Math.random() * 1.5,
        isRunner: pos.isRunner,
        baseX: pos.x,
        baseZ: pos.z,
      });
    });
  }

  // DESK LAMPS & FLOOR LAMPS AS LASER SEARCHLIGHT TOWERS
  private buildDeskLampLaserTowers() {
    const lampPositions = [-11, 0, 12];
    const lampColors = [0x0284c7, 0xf59e0b, 0x06b6d4];

    lampPositions.forEach((posX, idx) => {
      const lampTower = new THREE.Group();
      lampTower.position.set(posX, 0, -20);

      const metalMat = createToonMaterial({ color: 0x475569, desaturate: 0.15 });
      const shadeMat = createToonMaterial({ color: lampColors[idx], desaturate: 0.08 });

      // Round lamp base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.4, 16), metalMat);
      base.position.y = 0.2;
      addInkOutline(base, 0.04);
      lampTower.add(base);

      // Long articulated metal lamp pole/neck
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 16, 8), metalMat);
      pole.position.y = 8.2;
      addInkOutline(pole, 0.035);
      lampTower.add(pole);

      // Conical lampshade housing the giant laser beam
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.5, 16, 1, true), shadeMat);
      shade.position.y = 16.5;
      shade.rotation.x = Math.PI;
      addInkOutline(shade, 0.04);
      lampTower.add(shade);

      // Emitted Laser Searchlight beam shooting from the lampshade
      const beamMat = createToonMaterial({ color: lampColors[idx], desaturate: 0.1 });
      const laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.6, 26, 8), beamMat);
      laserBeam.position.y = 29;
      addInkOutline(laserBeam, 0.035, 0x000000);
      lampTower.add(laserBeam);

      this.farLayer.add(lampTower);
      this.lampLaserTowers.push(lampTower);
    });
  }

  // DISTANT EXPLOSIONS WITH FLICKERING GLOWS
  private buildDistantExplosions() {
    const explosionPositions = [
      new THREE.Vector3(-11, 4.5, -21),
      new THREE.Vector3(4, 5.0, -23),
      new THREE.Vector3(12, 3.5, -20),
    ];

    const flareMat = createToonMaterial({ color: 0xf97316, desaturate: 0.1 });

    explosionPositions.forEach((pos, idx) => {
      const light = new THREE.PointLight(0xf97316, 0, 18);
      light.position.copy(pos);
      this.farLayer.add(light);
      this.distantExplosionLights.push(light);

      const flare = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 1), flareMat);
      flare.position.copy(pos);
      flare.visible = false;
      addInkOutline(flare, 0.04);
      this.farLayer.add(flare);
      this.distantExplosionFlares.push(flare);
    });
  }

  // FOREGROUND: COUCH CUSHIONS AS COMBAT COVER, BROOM BLASTER & CARDBOARD COCKPIT
  private buildCouchCushionCoverAndProps() {
    // Props removed to simplify the battlefield and prevent character clipping
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0x0c192c, 0.8);
    this.group.add(ambient);

    const warmKeyLight = new THREE.DirectionalLight(0xd97724, 2.5);
    warmKeyLight.position.set(-8.0, 10.0, 8.0);
    warmKeyLight.castShadow = true;
    warmKeyLight.shadow.mapSize.width = 2048;
    warmKeyLight.shadow.mapSize.height = 2048;
    warmKeyLight.shadow.bias = -0.001;
    this.group.add(warmKeyLight);

    const coolRimLight = new THREE.DirectionalLight(0x0e7490, 1.6);
    coolRimLight.position.set(10.0, 8.0, -10.0);
    this.group.add(coolRimLight);
  }

  // EMIT FOOTSTEP DUST PUFFS UNDER CHARACTER'S FEET
  public emitFootstepDust(pos: THREE.Vector3, isSliding: boolean = false) {
    const dustCount = isSliding ? 4 : 2;
    const dustMat = createToonMaterial({ color: 0x475569, desaturate: 0.3 });

    for (let i = 0; i < dustCount; i++) {
      const puff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.08 + Math.random() * 0.06, 0),
        dustMat
      );
      puff.position.set(
        pos.x + (Math.random() - 0.5) * 0.25,
        0.05,
        pos.z - (isSliding ? 0.3 : 0.15)
      );
      addInkOutline(puff, 0.03);
      this.dustGroup.add(puff);

      this.activeDust.push({
        mesh: puff,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * (isSliding ? 0.8 : 0.3),
          0.3 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.3 - (isSliding ? 1.2 : 0.6)
        ),
        life: 0,
        maxLife: isSliding ? 0.6 : 0.4,
      });
    }
  }

  // TRIGGER GROUND DEBRIS FLINGING ON IMPACT
  public triggerGroundDebris(pos: THREE.Vector3, isHeavy: boolean = false) {
    const debrisCount = isHeavy ? 20 : 10;
    const debrisMat = createToonMaterial({ color: 0x1e293b, desaturate: 0.25 });

    for (let i = 0; i < debrisCount; i++) {
      const chunk = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.07 + Math.random() * 0.08, 0),
        debrisMat
      );
      chunk.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3));
      addInkOutline(chunk, 0.035);
      this.debrisGroup.add(chunk);

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 3.5;
      const velY = 3.0 + Math.random() * 4.5;

      this.activeDebris.push({
        mesh: chunk,
        velocity: new THREE.Vector3(Math.cos(angle) * speed, velY, Math.sin(angle) * speed),
        rotVelocity: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 0,
        maxLife: 0.7 + Math.random() * 0.5,
      });
    }
  }

  // SPAWN TARGETED LASER BOLTS IMPACTING NEAR CHARACTER
  public spawnTargetedLaser(from: THREE.Vector3, toTarget: THREE.Vector3, speed: number = 34) {
    const dir = new THREE.Vector3().subVectors(toTarget, from).normalize();
    const length = 2.0;

    const geo = new THREE.CylinderGeometry(0.045, 0.045, length, 6);
    const mat = createToonMaterial({ color: 0xb45309, desaturate: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);

    const orientation = new THREE.Matrix4();
    orientation.lookAt(from, toTarget, new THREE.Vector3(0, 1, 0));
    mesh.quaternion.setFromRotationMatrix(orientation);
    mesh.rotateX(Math.PI / 2);

    addInkOutline(mesh, 0.04, 0x000000);
    this.group.add(mesh);

    this.laserBolts.push({
      mesh,
      direction: dir,
      targetPos: toTarget.clone(),
      speed,
      isTargetedNearZane: true,
    });
  }

  // GENERAL AMBIENT LASER BOLTS
  public spawnLaser(from: THREE.Vector3, to: THREE.Vector3, isWarm: boolean = true) {
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const length = 1.8;

    const geo = new THREE.CylinderGeometry(0.04, 0.04, length, 6);
    const col = isWarm ? 0xb45309 : 0x0e7490;
    const mat = createToonMaterial({ color: col, desaturate: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);

    const orientation = new THREE.Matrix4();
    orientation.lookAt(from, to, new THREE.Vector3(0, 1, 0));
    mesh.quaternion.setFromRotationMatrix(orientation);
    mesh.rotateX(Math.PI / 2);

    addInkOutline(mesh, 0.035, 0x000000);
    this.group.add(mesh);

    this.laserBolts.push({
      mesh,
      direction: dir,
      targetPos: to,
      speed: 28,
      isTargetedNearZane: false,
    });
  }

  // TRIGGER IMPACT EXPLOSION
  public triggerImpactExplosion(hitPos: THREE.Vector3, isHeavy: boolean = false, shakeCamera: boolean = true) {
    this.impactFlashLight.position.copy(hitPos).add(new THREE.Vector3(0, 0.4, 0));
    this.flashIntensity = isHeavy ? 5.0 : 3.5;

    // Sparks
    const sparkCount = isHeavy ? 45 : 24;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (isHeavy ? 4.5 : 3.2) + Math.random() * 2.5;
      const velY = 1.8 + Math.random() * (isHeavy ? 4.0 : 2.5);
      this.activeSparks.push({
        position: hitPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.05, (Math.random() - 0.5) * 0.2)),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, velY, Math.sin(angle) * speed),
        life: 0,
        maxLife: 0.4 + Math.random() * 0.35,
      });
    }

    // Flying ground debris
    this.triggerGroundDebris(hitPos, isHeavy);

    // Smoke puffs
    const smokeCount = isHeavy ? 5 : 3;
    const smokeMat = createToonMaterial({ color: 0x1e293b, desaturate: 0.2 });
    for (let s = 0; s < smokeCount; s++) {
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.15, 0), smokeMat);
      puff.position.copy(hitPos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3));
      addInkOutline(puff, 0.04);
      this.smokeGroup.add(puff);

      this.activeSmokePuffs.push({
        mesh: puff,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.6, 0.4 + Math.random() * 0.5),
        life: 0,
        maxLife: 1.2 + Math.random() * 0.6,
        baseScale: 1.0,
      });
    }

    // Shockwave Ring (Expanded shockwave ring on the ground)
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.copy(hitPos).add(new THREE.Vector3(0, 0.02, 0));
    this.group.add(ringMesh);
    this.activeRings.push({
      mesh: ringMesh,
      scaleSpeed: 5.0,
      life: 0,
      maxLife: 0.6,
    });

    if (shakeCamera && this.onExplosionTrigger) {
      this.onExplosionTrigger(isHeavy ? 1.0 : 0.65);
    }
  }

  public spawnSmokePuff(pos: THREE.Vector3, vel: THREE.Vector3) {
    const smokeMat = createToonMaterial({ color: 0x334155, desaturate: 0.2 });
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.1, 0), smokeMat);
    puff.position.copy(pos);
    addInkOutline(puff, 0.03);
    this.smokeGroup.add(puff);
    this.activeSmokePuffs.push({
      mesh: puff,
      velocity: vel,
      life: 0,
      maxLife: 0.8 + Math.random() * 0.4,
      baseScale: 1.0,
    });
  }

  // MAIN UPDATE: PARALLAX SCROLL, TOY MECHS, LAMP TOWERS, DEBRIS & EMITTERS
  public update(delta: number, zanePos: THREE.Vector3, isRunning: boolean = false, isSliding: boolean = false) {
    this.animTimer += delta;
    this.laserSpawnTimer += delta;

    // Update active shockwave rings
    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const ring = this.activeRings[i];
      ring.life += delta;
      const progress = ring.life / ring.maxLife;
      const scale = 1.0 + progress * ring.scaleSpeed;
      ring.mesh.scale.set(scale, scale, 1.0);
      if (ring.mesh.material instanceof THREE.Material) {
        ring.mesh.material.opacity = 1.0 - progress;
      }
      if (ring.life >= ring.maxLife) {
        this.group.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        if (Array.isArray(ring.mesh.material)) {
          ring.mesh.material.forEach(m => m.dispose());
        } else {
          ring.mesh.material.dispose();
        }
        this.activeRings.splice(i, 1);
      }
    }

    // 1. MULTI-PLANE PARALLAX SCROLL
    this.farLayer.position.x = -zanePos.x * 0.06;
    this.farLayer.position.z = -24 + zanePos.z * 0.08;

    this.midFarLayer.position.x = -zanePos.x * 0.15;
    this.midFarLayer.position.z = -15 + zanePos.z * 0.22;

    // 2. FOOTSTEP DUST EMISSION
    if (isRunning || isSliding) {
      this.dustEmitCooldown += delta;
      const rate = isSliding ? 0.04 : 0.11;
      if (this.dustEmitCooldown >= rate) {
        this.dustEmitCooldown = 0;
        this.emitFootstepDust(zanePos, isSliding);
      }
    }

    // 3. ANIMATE TOY MECHS
    this.toyMechs.forEach((mech, idx) => {
      const walkTime = this.animTimer * 2.2 + idx * 1.5;
      mech.legL.rotation.x = Math.sin(walkTime) * 0.45;
      mech.legR.rotation.x = -Math.sin(walkTime) * 0.45;
      mech.torso.rotation.y = Math.sin(walkTime * 0.5) * 0.25;

      mech.fireTimer += delta;
      if (mech.fireTimer > 1.8) {
        mech.fireTimer = 0;
        const useLeft = Math.random() > 0.5;
        const flashMesh = useLeft ? mech.muzzleFlashL : mech.muzzleFlashR;
        flashMesh.visible = true;
        setTimeout(() => {
          flashMesh.visible = false;
        }, 80);

        const worldPos = new THREE.Vector3();
        flashMesh.getWorldPosition(worldPos);
        this.spawnLaser(worldPos, worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, -0.5, 18)), true);
      }
    });

    // 4. ANIMATE TOY SOLDIERS
    this.toySoldiers.forEach((soldier, idx) => {
      const trot = this.animTimer * 6.0 + idx * 2.0;
      if (soldier.isRunner) {
        soldier.legL.rotation.x = Math.sin(trot) * 0.65;
        soldier.legR.rotation.x = -Math.sin(trot) * 0.65;
        soldier.group.position.x = soldier.baseX + Math.sin(this.animTimer * 0.8 + idx) * 1.2;
      }

      soldier.fireTimer += delta;
      if (soldier.fireTimer > 1.4) {
        soldier.fireTimer = 0;
        soldier.muzzleFlash.visible = true;
        setTimeout(() => {
          soldier.muzzleFlash.visible = false;
        }, 70);
      }
    });

    // 5. SWEEPING DESK LAMP LASER TOWERS
    this.lampLaserTowers.forEach((tower, idx) => {
      const sweep = Math.sin(this.animTimer * 0.9 + idx * 2.1) * 0.45;
      tower.rotation.z = sweep;
      tower.rotation.x = Math.cos(this.animTimer * 0.7 + idx) * 0.25;
    });

    // 6. FLICKERING DISTANT EXPLOSIONS
    this.distantExplosionTimers.forEach((timer, idx) => {
      this.distantExplosionTimers[idx] -= delta;
      if (this.distantExplosionTimers[idx] <= 0) {
        this.distantExplosionTimers[idx] = 1.4 + Math.random() * 2.2;
        const light = this.distantExplosionLights[idx];
        const flare = this.distantExplosionFlares[idx];

        light.intensity = 4.0;
        flare.visible = true;
        setTimeout(() => {
          flare.visible = false;
        }, 120);
      }

      const light = this.distantExplosionLights[idx];
      if (light.intensity > 0) {
        light.intensity = Math.max(0, light.intensity - delta * 6.5);
      }
    });

    // 7. DRIFTING ASH EMBERS
    const ashPos = this.ashGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < ashPos.length; i += 3) {
      ashPos[i] += delta * 1.4;
      ashPos[i + 1] -= delta * 0.4;
      ashPos[i + 2] += delta * 0.8;

      if (ashPos[i] > 18) ashPos[i] = -18;
      if (ashPos[i + 1] < 0.1) ashPos[i + 1] = 7.5;
      if (ashPos[i + 2] > 18) ashPos[i + 2] = -18;
    }
    this.ashGeometry.attributes.position.needsUpdate = true;

    // 8. UPDATE GROUND DEBRIS
    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const chunk = this.activeDebris[i];
      chunk.life += delta;
      chunk.velocity.y -= delta * 18.0;
      chunk.mesh.position.addScaledVector(chunk.velocity, delta);
      chunk.mesh.rotation.x += chunk.rotVelocity.x * delta;
      chunk.mesh.rotation.y += chunk.rotVelocity.y * delta;

      if (chunk.mesh.position.y < 0.05) {
        chunk.mesh.position.y = 0.05;
        chunk.velocity.y = -chunk.velocity.y * 0.25;
        chunk.velocity.x *= 0.7;
        chunk.velocity.z *= 0.7;
      }

      if (chunk.life >= chunk.maxLife) {
        this.debrisGroup.remove(chunk.mesh);
        this.activeDebris.splice(i, 1);
      }
    }

    // 9. UPDATE FOOTSTEP DUST PUFFS
    for (let i = this.activeDust.length - 1; i >= 0; i--) {
      const puff = this.activeDust[i];
      puff.life += delta;
      puff.mesh.position.addScaledVector(puff.velocity, delta);
      const scale = 1.0 + (puff.life / puff.maxLife) * 1.5;
      puff.mesh.scale.setScalar(scale);

      if (puff.life >= puff.maxLife) {
        this.dustGroup.remove(puff.mesh);
        this.activeDust.splice(i, 1);
      }
    }

    // 10. IMPACT LIGHT DECAY
    if (this.flashIntensity > 0) {
      this.flashIntensity = Math.max(0, this.flashIntensity - delta * 8.5);
      this.impactFlashLight.intensity = this.flashIntensity;
    }

    // 11. AMBIENT LASER SPAWNER REMOVED AS REQUESTED TO SIMPLIFY CUTSCENE

    // 12. UPDATE POOLED PROJECTILES & BACKGROUND FIREFIGHT
    if (this.group.visible) {
      this.firefightTimer += delta;
      if (this.firefightTimer >= 0.15) {
        this.firefightTimer = 0;
        const isLeft = Math.random() > 0.5;
        let fromPos = new THREE.Vector3();
        let toPos = new THREE.Vector3();
        if (isLeft) {
          fromPos.set(-20 - Math.random() * 10, 0.5 + Math.random() * 4.0, -15 + Math.random() * 30);
          toPos.set(-13 - Math.random() * 2, 0.05, -15 + Math.random() * 30);
        } else {
          fromPos.set(20 + Math.random() * 10, 0.5 + Math.random() * 4.0, -15 + Math.random() * 30);
          toPos.set(13 + Math.random() * 2, 0.05, -15 + Math.random() * 30);
        }
        const type = Math.random() > 0.5 ? 'plasma_red' : 'plasma_cyan';
        this.spawnFromPool(type, fromPos, toPos, 32.0, 1.5);
      }
    }

    this.projectilePool.forEach((proj) => {
      if (!proj.active) return;
      proj.lifetime += delta;

      // Move projectile
      proj.position.addScaledVector(proj.velocity, delta);
      proj.mesh.position.copy(proj.position);

      // Special logic for missile smoke trail
      if (proj.type === 'missile') {
        this.dustEmitCooldown += delta;
        if (this.dustEmitCooldown >= 0.05) {
          this.dustEmitCooldown = 0;
          this.spawnSmokePuff(proj.position, new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2));
        }
      }

      const isExpired = proj.lifetime >= proj.maxLifetime;
      if (isExpired) {
        proj.active = false;
        proj.mesh.visible = false;

        const isMissile = proj.type === 'missile';
        const isLaserCrouch = proj.type === 'laser_crouch';

        if (isMissile) {
          this.triggerImpactExplosion(proj.position, true, true); // Heavy, shake camera
        } else if (isLaserCrouch) {
          this.triggerImpactExplosion(proj.position, false, false); // Small, no shake
        } else {
          // Background firefight impact sparks, no screen shake
          this.triggerImpactExplosion(proj.position, false, false);
        }
      }
    });

    // 13. UPDATE SPARKS
    const sparkPositions = this.sparksGeometry.attributes.position.array as Float32Array;
    let sparkIdx = 0;
    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const spark = this.activeSparks[i];
      spark.life += delta;
      spark.velocity.y -= delta * 11.0;
      spark.position.addScaledVector(spark.velocity, delta);

      if (spark.position.y < 0.02) {
        spark.position.y = 0.02;
        spark.velocity.y = -spark.velocity.y * 0.35;
      }

      if (spark.life >= spark.maxLife) {
        this.activeSparks.splice(i, 1);
        continue;
      }

      if (sparkIdx < 200) {
        sparkPositions[sparkIdx * 3] = spark.position.x;
        sparkPositions[sparkIdx * 3 + 1] = spark.position.y;
        sparkPositions[sparkIdx * 3 + 2] = spark.position.z;
        sparkIdx++;
      }
    }
    for (let j = sparkIdx; j < 200; j++) {
      sparkPositions[j * 3] = 0;
      sparkPositions[j * 3 + 1] = -100;
      sparkPositions[j * 3 + 2] = 0;
    }
    this.sparksGeometry.attributes.position.needsUpdate = true;

    // 14. UPDATE SMOKE PUFFS
    for (let i = this.activeSmokePuffs.length - 1; i >= 0; i--) {
      const puff = this.activeSmokePuffs[i];
      puff.life += delta;
      puff.mesh.position.addScaledVector(puff.velocity, delta);
      puff.mesh.rotation.y += delta * 0.6;
      puff.mesh.rotation.x += delta * 0.4;

      const progress = puff.life / puff.maxLife;
      const currentScale = puff.baseScale * (1.0 + progress * 2.0);
      puff.mesh.scale.setScalar(currentScale * (1 - progress * 0.25));

      if (puff.life >= puff.maxLife) {
        this.smokeGroup.remove(puff.mesh);
        this.activeSmokePuffs.splice(i, 1);
      }
    }
  }

  // Build static 2D ground plane colliders (built ONCE on load, not per-frame)
  private buildColliders() {
    this.colliders = [
      // Track boundary left and right crags (at least 12 units away from path X=0)
      { id: 'battle_crags_left', name: 'Battlefield Left Boundary', minX: -24.0, maxX: -12.0, minZ: -20.0, maxZ: 20.0, height: 2.5 },
      { id: 'battle_crags_right', name: 'Battlefield Right Boundary', minX: 12.0, maxX: 24.0, minZ: -20.0, maxZ: 20.0, height: 2.5 },
      { id: 'battle_boundary_back', name: 'Rear Trench Boundary', minX: -24.0, maxX: 24.0, minZ: -22.0, maxZ: -19.5, height: 2.5 },
      { id: 'battle_boundary_front', name: 'Front Forward Boundary', minX: -24.0, maxX: 24.0, minZ: 17.5, maxZ: 20.0, height: 2.5 },
    ];
  }

  public spawnObstacle(
    id: string,
    name: string,
    x: number,
    z: number,
    width: number,
    length: number,
    height: number,
    type: 'rock' | 'crate',
    isLowObstacle: boolean = false
  ) {
    const obstacleGroup = new THREE.Group();
    obstacleGroup.position.set(x, height / 2, z);

    let mesh: THREE.Mesh;
    if (type === 'rock') {
      const rockMat = createToonMaterial({ color: 0x334155, desaturate: 0.15 });
      rockMat.side = THREE.DoubleSide;
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(height * 0.7, 0), rockMat);
      mesh.scale.set(width / (height * 1.4), 1.0, length / (height * 1.4));
    } else {
      const crateMat = createToonMaterial({ color: 0x7c2d12, desaturate: 0.1 });
      crateMat.side = THREE.DoubleSide;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), crateMat);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addInkOutline(mesh, 0.04);
    obstacleGroup.add(mesh);
    this.foregroundLayer.add(obstacleGroup);

    // Save references to reposition them during path clearance
    (obstacleGroup as any).obstacleId = id;
    (obstacleGroup as any).isLowObstacle = isLowObstacle;
    (obstacleGroup as any).halfWidth = width / 2;
    (obstacleGroup as any).halfLength = length / 2;
    (obstacleGroup as any).height = height;
    this.obstacleMeshes.push(obstacleGroup);

    // Also add collider helper wireframe for backtick debug visual
    const helper = new THREE.BoxHelper(obstacleGroup, 0x10b981);
    helper.visible = false;
    this.group.add(helper);
    this.colliderHelpers.push(helper);
  }

  public clearPath() {
    const waypoints = [
      new THREE.Vector2(0, -12),
      new THREE.Vector2(0, -10),
      new THREE.Vector2(0, -8),
      new THREE.Vector2(0, -6),
      new THREE.Vector2(0, -4),
      new THREE.Vector2(0, -2),
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.2, 1.0),
      new THREE.Vector2(0.35, 2.4),
      new THREE.Vector2(0.2, 4.0),
      new THREE.Vector2(0.1, 6.0),
      new THREE.Vector2(0, 8.0),
      new THREE.Vector2(0, 10.4),
      new THREE.Vector2(0, 12.0)
    ];

    const pathPoints: THREE.Vector2[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i+1];
      const dist = p1.distanceTo(p2);
      const steps = Math.ceil(dist / 0.1);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        pathPoints.push(new THREE.Vector2().lerpVectors(p1, p2, t));
      }
    }

    this.obstacleMeshes.forEach((obstacleGroup, index) => {
      const isLow = (obstacleGroup as any).isLowObstacle;
      if (isLow) return; // Skip low obstacles so Zane jumps/slides over them!

      const ox = obstacleGroup.position.x;
      const oz = obstacleGroup.position.z;

      // Find closest point on path corridor
      let minDist = Infinity;
      let closestPt = pathPoints[0];
      pathPoints.forEach((pt) => {
        const d = pt.distanceTo(new THREE.Vector2(ox, oz));
        if (d < minDist) {
          minDist = d;
          closestPt = pt;
        }
      });

      const halfW = (obstacleGroup as any).halfWidth || 0.5;
      const clearRadius = 1.6 + halfW;
      if (minDist < clearRadius) {
        // Push sideways out of the 1.6 unit corridor + halfWidth
        const pushDir = ox >= closestPt.x ? 1 : -1;
        const newX = closestPt.x + pushDir * (clearRadius + 0.05);
        obstacleGroup.position.x = newX;

        // Also update matching helper BoxHelper
        if (this.colliderHelpers[index]) {
          this.colliderHelpers[index].update();
        }
      }
    });

    // Rebuild/Update the colliders list based on final positions!
    this.colliders = [
      // Track boundary left and right crags (at least 12 units away from path X=0)
      { id: 'battle_crags_left', name: 'Battlefield Left Boundary', minX: -24.0, maxX: -12.0, minZ: -20.0, maxZ: 20.0, height: 2.5 },
      { id: 'battle_crags_right', name: 'Battlefield Right Boundary', minX: 12.0, maxX: 24.0, minZ: -20.0, maxZ: 20.0, height: 2.5 },
      { id: 'battle_boundary_back', name: 'Rear Trench Boundary', minX: -24.0, maxX: 24.0, minZ: -22.0, maxZ: -19.5, height: 2.5 },
      { id: 'battle_boundary_front', name: 'Front Forward Boundary', minX: -24.0, maxX: 24.0, minZ: 17.5, maxZ: 20.0, height: 2.5 },
    ];

    // Add obstacles to colliders list
    this.obstacleMeshes.forEach((obstacleGroup) => {
      const halfW = (obstacleGroup as any).halfWidth;
      const halfL = (obstacleGroup as any).halfLength;
      const h = (obstacleGroup as any).height;
      this.colliders.push({
        id: (obstacleGroup as any).obstacleId,
        name: (obstacleGroup as any).obstacleId,
        minX: obstacleGroup.position.x - halfW,
        maxX: obstacleGroup.position.x + halfW,
        minZ: obstacleGroup.position.z - halfL,
        maxZ: obstacleGroup.position.z + halfL,
        height: h,
      });
    });
  }

  public getGroundY(x: number, z: number): number {
    if (!this.groundMesh) {
      // Mathematical formula representation of the terrain height
      return Math.sin(x * 0.25) * 0.35 + Math.cos(z * 0.2) * 0.3;
    }
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(x, 15.0, z), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(this.groundMesh);
    if (intersects.length > 0) {
      return intersects[0].point.y;
    }
    // Fallback formula
    return Math.sin(x * 0.25) * 0.35 + Math.cos(z * 0.2) * 0.3;
  }

  public getActiveProjectileCount(): number {
    return this.projectilePool.filter((p) => p.active).length;
  }

  private initProjectilePool() {
    const poolSize = 60;
    
    // Create materials once
    this.projRedMat = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      emissive: 0xff0000,
      emissiveIntensity: 3.5,
      roughness: 0.2,
      metalness: 0.1,
    });
    
    this.projCyanMat = new THREE.MeshStandardMaterial({
      color: 0x33ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 3.5,
      roughness: 0.2,
      metalness: 0.1,
    });
    
    this.projOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff5500,
      emissiveIntensity: 3.5,
      roughness: 0.2,
      metalness: 0.1,
    });
    
    this.projMissileMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.4,
      metalness: 0.3,
    });
    
    for (let i = 0; i < poolSize; i++) {
      const group = new THREE.Group();
      group.name = `Projectile_${i}`;
      group.visible = false;
      group.frustumCulled = false;
      
      // Create sub-meshes for laser/plasma
      const laserGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6);
      const laserMesh = new THREE.Mesh(laserGeo, this.projRedMat);
      laserMesh.rotation.x = Math.PI / 2;
      laserMesh.frustumCulled = false;
      group.add(laserMesh);
      
      // Create sub-mesh for missile
      const missileBodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8);
      const missileConeGeo = new THREE.ConeGeometry(0.12, 0.25, 8);
      const missileBody = new THREE.Mesh(missileBodyGeo, this.projMissileMat);
      const missileCone = new THREE.Mesh(missileConeGeo, this.projOrangeMat);
      missileCone.position.y = 0.425;
      
      const missileSubGroup = new THREE.Group();
      missileSubGroup.add(missileBody, missileCone);
      missileSubGroup.rotation.x = Math.PI / 2;
      missileSubGroup.name = 'missile_sub';
      missileSubGroup.visible = false;
      missileSubGroup.frustumCulled = false;
      missileBody.frustumCulled = false;
      missileCone.frustumCulled = false;
      group.add(missileSubGroup);
      
      this.projectileGroup.add(group);
      
      this.projectilePool.push({
        mesh: group,
        active: false,
        type: 'plasma_red',
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        lifetime: 0,
        maxLifetime: 3.0,
        speed: 25.0,
      });
    }
  }

  public spawnFromPool(
    type: 'plasma_red' | 'plasma_cyan' | 'laser_crouch' | 'missile',
    from: THREE.Vector3,
    to: THREE.Vector3,
    speed: number = 25.0,
    maxLifetime: number = 3.0
  ) {
    const proj = this.projectilePool.find((p) => !p.active);
    if (!proj) return;
    
    proj.active = true;
    proj.type = type;
    proj.position.copy(from);
    proj.speed = speed;
    proj.lifetime = 0;
    proj.maxLifetime = maxLifetime;
    
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    proj.velocity.copy(dir).multiplyScalar(speed);
    
    proj.mesh.position.copy(from);
    proj.mesh.visible = true;
    proj.mesh.lookAt(to);
    
    const laserMesh = proj.mesh.children[0] as THREE.Mesh;
    const missileSub = proj.mesh.children[1] as THREE.Group;
    
    if (type === 'missile') {
      laserMesh.visible = false;
      missileSub.visible = true;
    } else {
      laserMesh.visible = true;
      missileSub.visible = false;
      
      if (type === 'plasma_cyan') {
        laserMesh.material = this.projCyanMat;
      } else if (type === 'laser_crouch') {
        laserMesh.material = this.projOrangeMat;
      } else {
        laserMesh.material = this.projRedMat;
      }
    }
  }

  // =========================================================================
  // SUPPLY DEPOT & MONSTER DAD (Kitchen Beer Stealth Minigame)
  // =========================================================================
  public supplyDepotGroup: THREE.Group = new THREE.Group();
  public monsterDadGroup: THREE.Group = new THREE.Group();
  public monsterHeadGroup: THREE.Group = new THREE.Group();
  public supplyCapsuleMesh: THREE.Group = new THREE.Group();
  public supplyDepotColliders: BoxCollider2D[] = [];
  public supplyDepotCoverBoxes: { minX: number; maxX: number; minZ: number; maxZ: number; height: number }[] = [];

  // Monster Dad properties
  public readonly monsterPlatformPos: THREE.Vector3 = new THREE.Vector3(1.2, 0.8, 11.2);
  public monsterLoopTimer: number = 0;
  public monsterIsFacingPlayer: boolean = false;
  public monsterEyeMat: THREE.MeshStandardMaterial | null = null;
  public monsterEyeLight: THREE.PointLight | null = null;
  public monsterPlaceholderGroup: THREE.Group | null = null;
  public monsterPlaceholderTorso: THREE.Group | null = null;
  public monsterPlaceholderHead: THREE.Group | null = null;
  public monsterPlaceholderLeftLeg: THREE.Group | null = null;
  public monsterPlaceholderRightLeg: THREE.Group | null = null;
  public monsterPlaceholderTimer: number = 0;
  public monsterModelGroup: THREE.Group | null = null;
  public monsterMixer: THREE.AnimationMixer | null = null;
  public monsterHeadBone: THREE.Object3D | null = null;
  public monsterTorsoBone: THREE.Object3D | null = null;
  public monsterRootBone: THREE.Object3D | null = null;
  public monsterHeadRestQ: THREE.Quaternion | null = null;
  public monsterTorsoRestQ: THREE.Quaternion | null = null;
  public monsterTurnAngle: number = 0;
  public monsterShadowDisc: THREE.Mesh | null = null;
  public monsterActions: Record<string, THREE.AnimationAction> = {};
  public monsterCurrentAction: THREE.AnimationAction | null = null;

  // Beer Bottle properties
  public beerPulseLight: THREE.PointLight | null = null;
  public beerHaloMesh: THREE.Mesh | null = null;
  public beerSparks: { mesh: THREE.Mesh; angle: number; radius: number; speed: number; y: number; bobSpeed: number }[] = [];

  /**
   * Builds the 2.8 unit tall dark figure placeholder with hunched shoulders, spikes,
   * long claws, chest cracks, and glowing orange eyes.
   */
  private buildMonsterPlaceholder(): THREE.Group {
    const placeholder = new THREE.Group();
    placeholder.name = 'MonsterDadPlaceholder';

    const mat = createMonsterMaterial();
    const spikeMat = createMonsterMaterial();
    const clawMat = createMonsterMaterial();

    // 1. Muscular Digitigrade Legs (Feet at y = 0, Hips at y = 1.35)
    for (const lx of [-0.32, 0.32]) {
      const legGroup = new THREE.Group();
      legGroup.position.set(lx, 1.35, 0);

      // Upper leg (slanted)
      const upperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.35), mat);
      upperLeg.position.set(0, -0.40, -0.05);
      upperLeg.rotation.x = 0.12;
      upperLeg.castShadow = true;
      upperLeg.receiveShadow = true;

      // Lower leg
      const lowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.28), mat);
      lowerLeg.position.set(0, -0.97, 0.05);
      lowerLeg.castShadow = true;
      lowerLeg.receiveShadow = true;

      // Foot with claws
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.45), mat);
      foot.position.set(0, -1.28, -0.1);
      foot.castShadow = true;
      for (const cx of [-0.08, 0, 0.08]) {
        const toeClaw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), clawMat);
        toeClaw.position.set(cx, -1.30, -0.32);
        toeClaw.rotation.x = -Math.PI / 2;
        legGroup.add(toeClaw);
      }

      legGroup.add(upperLeg, lowerLeg, foot);
      placeholder.add(legGroup);

      if (lx < 0) {
        this.monsterPlaceholderLeftLeg = legGroup;
      } else {
        this.monsterPlaceholderRightLeg = legGroup;
      }
    }

    // 2. Pelvis & Lower Torso
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.42, 0.52), mat);
    pelvis.position.set(0, 1.35, 0);
    pelvis.castShadow = true;
    placeholder.add(pelvis);

    // Torso group (origin at y = 1.45, just above pelvis)
    this.monsterPlaceholderTorso = new THREE.Group();
    this.monsterPlaceholderTorso.name = 'MonsterPlaceholderTorso';
    this.monsterPlaceholderTorso.position.set(0, 1.45, 0);

    const midTorso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.56), mat);
    midTorso.position.set(0, 1.68 - 1.45, -0.04);
    midTorso.rotation.x = 0.12;
    midTorso.castShadow = true;
    this.monsterPlaceholderTorso.add(midTorso);

    // 3. Hunched Upper Torso & Broad Shoulders
    const upperTorso = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.62, 0.72), mat);
    upperTorso.position.set(0, 2.12 - 1.45, -0.12);
    upperTorso.rotation.x = 0.18;
    upperTorso.castShadow = true;
    this.monsterPlaceholderTorso.add(upperTorso);

    // Hunched shoulder muscle bulges & Spikes on shoulders
    for (const sx of [-0.62, 0.62]) {
      const shPad = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.52), mat);
      shPad.position.set(sx, 2.26 - 1.45, -0.08);
      shPad.rotation.z = sx > 0 ? -0.2 : 0.2;
      shPad.castShadow = true;
      this.monsterPlaceholderTorso.add(shPad);

      for (let i = 0; i < 3; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.42 + i * 0.06, 5), spikeMat);
        const outward = sx > 0 ? 1 : -1;
        spike.position.set(sx + outward * (0.12 + i * 0.08), 2.38 - 1.45 + i * 0.08, -0.08 - i * 0.06);
        spike.rotation.set(-0.2, 0, -outward * (0.6 + i * 0.2));
        spike.castShadow = true;
        this.monsterPlaceholderTorso.add(spike);
      }
    }

    // 4. Jagged Spikes on Back / Spine
    for (let i = 0; i < 5; i++) {
      const spineSpike = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.46 + i * 0.04, 5), spikeMat);
      spineSpike.position.set(0, 1.55 - 1.45 + i * 0.16, 0.26 + i * 0.04);
      spineSpike.rotation.set(1.2 - i * 0.1, 0, 0);
      spineSpike.castShadow = true;
      this.monsterPlaceholderTorso.add(spineSpike);
    }

    // 5. Emissive Red Cracks on Chest
    const redCrackMat = new THREE.MeshStandardMaterial({
      color: 0xff1e2b,
      emissive: 0xff1e2b,
      emissiveIntensity: 2.6,
      roughness: 0.3,
    });
    const crackGroup = new THREE.Group();
    crackGroup.position.set(0, 2.12 - 1.45, -0.48);
    const crackCoords = [
      { x: -0.18, y: 0.12, w: 0.04, h: 0.26, rz: 0.4 },
      { x: 0.16, y: 0.10, w: 0.04, h: 0.28, rz: -0.35 },
      { x: -0.04, y: -0.04, w: 0.035, h: 0.32, rz: 0.15 },
      { x: 0.08, y: -0.14, w: 0.035, h: 0.22, rz: -0.5 },
      { x: -0.22, y: -0.08, w: 0.035, h: 0.20, rz: 0.6 },
      { x: 0.0, y: 0.18, w: 0.04, h: 0.22, rz: -0.1 },
    ];
    for (const c of crackCoords) {
      const cMesh = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, 0.03), redCrackMat);
      cMesh.position.set(c.x, c.y, 0);
      cMesh.rotation.z = c.rz;
      crackGroup.add(cMesh);
    }
    this.monsterPlaceholderTorso.add(crackGroup);

    // 6. Arms and Long Claws on Hands
    for (const ax of [-0.68, 0.68]) {
      const uArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.28), mat);
      uArm.position.set(ax, 1.82 - 1.45, -0.06);
      uArm.rotation.z = ax > 0 ? -0.15 : 0.15;
      uArm.castShadow = true;

      const fArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.58, 0.24), mat);
      fArm.position.set(ax * 1.05, 1.34 - 1.45, -0.16);
      fArm.rotation.x = -0.3;
      fArm.castShadow = true;

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.26), mat);
      hand.position.set(ax * 1.05, 1.08 - 1.45, -0.28);
      hand.castShadow = true;

      for (let i = 0; i < 4; i++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.36, 5), clawMat);
        const cx = (i - 1.5) * 0.055;
        claw.position.set(ax * 1.05 + cx, 1.02 - 1.45, -0.42);
        claw.rotation.set(-1.3, 0, (i - 1.5) * 0.12);
        claw.castShadow = true;
        this.monsterPlaceholderTorso.add(claw);
      }

      this.monsterPlaceholderTorso.add(uArm, fArm, hand);
    }

    // 7. Head Group (pivot at base of neck: y = 2.38 - 1.45 = 0.93, z = -0.24)
    this.monsterPlaceholderHead = new THREE.Group();
    this.monsterPlaceholderHead.name = 'MonsterPlaceholderHead';
    this.monsterPlaceholderHead.position.set(0, 0.93, -0.24);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.38), mat);
    neck.position.set(0, 0, 0);
    neck.rotation.x = 0.25;
    neck.castShadow = true;
    this.monsterPlaceholderHead.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.52), mat);
    head.position.set(0, 0.20, -0.14);
    head.castShadow = true;
    this.monsterPlaceholderHead.add(head);

    // Brow horns
    for (const hx of [-0.18, 0.18]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.32, 5), spikeMat);
      horn.position.set(hx, 0.36, -0.08);
      horn.rotation.set(0.4, 0, hx > 0 ? 0.35 : -0.35);
      horn.castShadow = true;
      this.monsterPlaceholderHead.add(horn);
    }

    // 8. Pair of Emissive Glowing Eyes & PointLight attached directly to head
    if (this.monsterEyeMat) {
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), this.monsterEyeMat);
      eyeL.position.set(-0.12, 0.20, -0.40);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), this.monsterEyeMat);
      eyeR.position.set(0.12, 0.20, -0.40);
      this.monsterPlaceholderHead.add(eyeL, eyeR);

      if (this.monsterEyeLight) {
        this.monsterEyeLight.position.set(0, 0.20, -0.48);
        this.monsterPlaceholderHead.add(this.monsterEyeLight);
      }
    }

    this.monsterPlaceholderTorso.add(this.monsterPlaceholderHead);
    placeholder.add(this.monsterPlaceholderTorso);

    // Ensure all children are on layer 0, cast/receive shadows, frustumCulled false
    placeholder.traverse((child) => {
      child.frustumCulled = false;
      child.layers.set(0);
    });

    return placeholder;
  }

  /**
   * Loads the real Dad model, applies dark crimson lit material with cyan rim shader,
   * attaches spikes, claws, chest cracks, glowing eyes, and replaces placeholder.
   */
  private async loadMonsterModel() {
    try {
      const loader = new GLTFLoader();
      const files: Array<{ key: 'walk' | 'run' | 'roar' | 'attack'; file: string }> = [
        { key: 'walk', file: 'monster_walk' },
        { key: 'run', file: 'monster_run' },
        { key: 'roar', file: 'monster_roar' },
        { key: 'attack', file: 'monster_attack' },
      ];

      const loadedMap: Partial<Record<'walk' | 'run' | 'roar' | 'attack', any>> = {};
      const failedFiles: string[] = [];

      for (const item of files) {
        try {
          const res = await loadGltfWithFallback(loader, item.file);
          if (res && res.gltf && res.gltf.scene) {
            loadedMap[item.key] = res.gltf;
          } else {
            failedFiles.push(item.file);
          }
        } catch {
          failedFiles.push(item.file);
        }
      }

      // Build the visible model from the first one that loads
      const firstKey = (['walk', 'run', 'roar', 'attack'] as const).find((k) => loadedMap[k]);
      if (firstKey && loadedMap[firstKey]) {
        this.setupRealMonsterModel(loadedMap[firstKey], loadedMap);
      } else {
        console.warn(
          '[BattlefieldScene] Monster model failed to load. Keeping procedural placeholder. Failed files:',
          failedFiles
        );
      }
    } catch (err) {
      console.warn('[BattlefieldScene] Monster model load exception, keeping placeholder:', err);
    }
  }

  private setupRealMonsterModel(gltf: any, loadedClipsMap: Partial<Record<'walk' | 'run' | 'roar' | 'attack', any>> = {}) {
    if (!this.monsterDadGroup) return;

    // Clone model using SkeletonUtils
    const clonedScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    clonedScene.name = 'MonsterDadModel';

    // Scale to ~2.8 units tall (base model is ~1.9m)
    const scale = 2.8 / 1.9;
    clonedScene.scale.setScalar(scale);

    // Apply dark crimson lit material with cyan rim shader, keeping original textures
    clonedScene.traverse((child: THREE.Object3D) => {
      child.frustumCulled = false;
      child.layers.set(0);
      if ((child as THREE.Mesh).isMesh || (child as any).isSkinnedMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const newMats = mats.map((m: any) => {
            const origMap = m.map || null;
            return createMonsterMaterial(origMap);
          });
          mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
        }
      }
    });

    // Find bones or key parts to attach spikes, claws, chest cracks, eyes
    const foundBones: Record<string, THREE.Object3D> = {};

    clonedScene.traverse((child: THREE.Object3D) => {
      child.frustumCulled = false;
      const lower = child.name.toLowerCase();
      if (lower.includes('head')) foundBones['head'] = child;
      else if (lower.includes('neck')) foundBones['neck'] = child;
      else if (lower.includes('spine2') || lower.includes('chest')) foundBones['chest'] = child;
      else if (lower.includes('spine1')) foundBones['spine1'] = child;
      else if (lower.includes('spine')) foundBones['spine'] = child;
      else if (lower.includes('hips') || lower.includes('root') || lower.includes('pelvis')) foundBones['root'] = child;
      else if (lower.includes('leftshoulder') || lower.includes('shoulder_l') || lower.includes('shoulder.l')) foundBones['lShoulder'] = child;
      else if (lower.includes('rightshoulder') || lower.includes('shoulder_r') || lower.includes('shoulder.r')) foundBones['rShoulder'] = child;
      else if (lower.includes('lefthand') || lower.includes('hand_l') || lower.includes('hand.l')) foundBones['lHand'] = child;
      else if (lower.includes('righthand') || lower.includes('hand_r') || lower.includes('hand.r')) foundBones['rHand'] = child;
    });

    this.monsterHeadBone = foundBones['head'] || null;
    this.monsterTorsoBone = foundBones['chest'] || foundBones['spine2'] || foundBones['spine1'] || foundBones['spine'] || null;
    this.monsterRootBone = foundBones['root'] || null;
    if (this.monsterHeadBone) this.monsterHeadRestQ = this.monsterHeadBone.quaternion.clone();
    if (this.monsterTorsoBone) this.monsterTorsoRestQ = this.monsterTorsoBone.quaternion.clone();

    // Jagged spikes on shoulders and back
    const spikeMat = createMonsterMaterial();
    const makeSpike = (rx: number, ry: number, rz: number, length: number = 0.45) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, length, 5), spikeMat);
      cone.rotation.set(rx, ry, rz);
      cone.castShadow = true;
      cone.frustumCulled = false;
      return cone;
    };

    const lShoulder = foundBones['lShoulder'];
    if (lShoulder) {
      lShoulder.add(makeSpike(-0.4, 0, -1.2, 0.45));
      lShoulder.add(makeSpike(0.2, 0, -1.4, 0.5));
    }

    const rShoulder = foundBones['rShoulder'];
    if (rShoulder) {
      rShoulder.add(makeSpike(-0.4, 0, 1.2, 0.45));
      rShoulder.add(makeSpike(0.2, 0, 1.4, 0.5));
    }

    const chest = foundBones['chest'];
    if (chest) {
      // Back spikes
      const s1 = makeSpike(1.5, 0, 0, 0.5);
      s1.position.set(0, 0.1, -0.2);
      const s2 = makeSpike(1.3, 0, 0, 0.55);
      s2.position.set(0, 0.25, -0.22);
      chest.add(s1, s2);

      // Emissive red cracks on chest
      const crackMat = new THREE.MeshStandardMaterial({
        color: 0xff1e2b,
        emissive: 0xff1e2b,
        emissiveIntensity: 2.6,
        roughness: 0.3,
      });
      const crackGroup = new THREE.Group();
      crackGroup.position.set(0, 0.15, 0.18);
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16 + Math.random() * 0.1, 0.02), crackMat);
        seg.position.set((i - 2.5) * 0.08, (Math.random() - 0.5) * 0.12, 0);
        seg.rotation.z = (Math.random() - 0.5) * 0.8;
        seg.frustumCulled = false;
        crackGroup.add(seg);
      }
      chest.add(crackGroup);
    }

    // Long claws on hands
    const clawMat = createMonsterMaterial();
    const makeClaw = () => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.35, 5), clawMat);
      c.rotation.x = -Math.PI / 2;
      c.castShadow = true;
      c.frustumCulled = false;
      return c;
    };

    const lHand = foundBones['lHand'];
    if (lHand) {
      for (let i = 0; i < 4; i++) {
        const cl = makeClaw();
        cl.position.set((i - 1.5) * 0.05, -0.15, 0.1);
        lHand.add(cl);
      }
    }

    const rHand = foundBones['rHand'];
    if (rHand) {
      for (let i = 0; i < 4; i++) {
        const cl = makeClaw();
        cl.position.set((i - 1.5) * 0.05, -0.15, 0.1);
        rHand.add(cl);
      }
    }

    // Emissive glowing eyes
    const head = foundBones['head'];
    if (head && this.monsterEyeMat) {
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), this.monsterEyeMat);
      eyeL.position.set(-0.08, 0.1, 0.16);
      eyeL.frustumCulled = false;
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), this.monsterEyeMat);
      eyeR.position.set(0.08, 0.1, 0.16);
      eyeR.frustumCulled = false;
      head.add(eyeL, eyeR);
      if (this.monsterEyeLight) {
        head.add(this.monsterEyeLight);
        this.monsterEyeLight.position.set(0, 0.1, 0.2);
      }
    }

    // Helper: Strip only X and Z components of hips/root position tracks and keep Y intact!
    const stripHipsXZKeepY = (clip: THREE.AnimationClip) => {
      if (!clip || !clip.tracks) return;
      clip.tracks.forEach((track) => {
        const lower = track.name.toLowerCase();
        if (lower.endsWith('.position')) {
          if (
            lower.includes('root') ||
            lower.includes('hip') ||
            lower.includes('pelvis') ||
            lower.includes('armature') ||
            lower.includes('bip')
          ) {
            for (let i = 0; i < track.values.length; i += 3) {
              track.values[i] = 0; // Strip X
              // keep track.values[i + 1] (Y) intact!
              track.values[i + 2] = 0; // Strip Z
            }
          }
        }
      });
    };

    this.monsterMixer = new THREE.AnimationMixer(clonedScene);
    this.monsterActions = {};

    // Register first clip of EACH loaded file under fixed keys 'walk', 'run', 'roar', 'attack'
    for (const key of ['walk', 'run', 'roar', 'attack'] as const) {
      const sourceGltf = loadedClipsMap[key] || (gltf.animations && gltf.animations.length > 0 && key === 'walk' ? gltf : null);
      if (sourceGltf && sourceGltf.animations && sourceGltf.animations.length > 0) {
        const clip = sourceGltf.animations[0].clone();
        stripHipsXZKeepY(clip);
        clip.name = key;
        const action = this.monsterMixer.clipAction(clip);
        action.loop = THREE.LoopRepeat;
        this.monsterActions[key] = action;
      }
    }

    // Default action to start with
    const defaultAction = this.monsterActions['walk'] || this.monsterActions['run'] || Object.values(this.monsterActions)[0];
    if (defaultAction) {
      defaultAction.play();
      this.monsterCurrentAction = defaultAction;
    }

    // Hide placeholder and add real model
    if (this.monsterPlaceholderGroup) {
      this.monsterPlaceholderGroup.visible = false;
    }
    this.monsterModelGroup = clonedScene;
    this.monsterDadGroup.add(clonedScene);

    // Ensure all monster elements have frustumCulled = false
    this.monsterDadGroup.traverse((child) => {
      child.frustumCulled = false;
    });
  }

  public isChaseMode: boolean = false;

  public setChaseMode(on: boolean) {
    this.isChaseMode = on;
    if (on) {
      if (this.monsterEyeMat) {
        this.monsterEyeMat.color.setHex(0xff0000);
        this.monsterEyeMat.emissive.setHex(0xff0000);
        this.monsterEyeMat.emissiveIntensity = 3.6;
      }
      if (this.monsterEyeLight) {
        this.monsterEyeLight.color.setHex(0xff0000);
        this.monsterEyeLight.intensity = 2.8;
      }
    } else {
      // When off, restore the platform lock
      if (this.monsterDadGroup) {
        this.monsterDadGroup.position.copy(this.monsterPlatformPos);
        this.monsterDadGroup.rotation.set(0, 0, 0);
      }
      if (this.monsterModelGroup) {
        this.monsterModelGroup.position.set(0, 0, 0);
      }
      if (this.monsterPlaceholderGroup) {
        this.monsterPlaceholderGroup.position.set(0, 0, 0);
      }
      if (this.monsterPlaceholderTorso) {
        this.monsterPlaceholderTorso.position.set(0, 1.45, 0);
        this.monsterPlaceholderTorso.rotation.set(0, 0, 0);
      }
      if (this.monsterPlaceholderLeftLeg) {
        this.monsterPlaceholderLeftLeg.rotation.set(0, 0, 0);
      }
      if (this.monsterPlaceholderRightLeg) {
        this.monsterPlaceholderRightLeg.rotation.set(0, 0, 0);
      }
      if (this.monsterHeadBone && this.monsterHeadRestQ) {
        this.monsterHeadBone.quaternion.copy(this.monsterHeadRestQ);
      }
      if (this.monsterTorsoBone && this.monsterTorsoRestQ) {
        this.monsterTorsoBone.quaternion.copy(this.monsterTorsoRestQ);
      }
      this.monsterIsFacingPlayer = false;
      if (this.monsterEyeMat) {
        this.monsterEyeMat.color.setHex(0x551100);
        this.monsterEyeMat.emissive.setHex(0x551100);
        this.monsterEyeMat.emissiveIntensity = 0.2;
      }
      if (this.monsterEyeLight) {
        this.monsterEyeLight.color.setHex(0x551100);
        this.monsterEyeLight.intensity = 0.1;
      }
    }
  }

  public moveMonsterTo(worldPos: THREE.Vector3, facingDir?: THREE.Vector3) {
    if (this.monsterDadGroup) {
      this.monsterDadGroup.position.copy(worldPos);
      if (facingDir && (facingDir.x !== 0 || facingDir.z !== 0)) {
        const target = worldPos.clone().add(facingDir);
        this.monsterDadGroup.lookAt(target.x, worldPos.y, target.z);
      }
    }
  }

  public moveMonsterToWorld(worldPos: THREE.Vector3, lookAtWorld?: THREE.Vector3) {
    if (!this.monsterDadGroup) return;

    // Convert the world position to local by subtracting supplyDepotGroup.position (+500 on X)
    const depotX = this.supplyDepotGroup?.position.x ?? 0;
    const depotY = this.supplyDepotGroup?.position.y ?? 0;
    const depotZ = this.supplyDepotGroup?.position.z ?? 0;

    const localX = worldPos.x - depotX;
    const localZ = worldPos.z - depotZ;
    // Set its y to the ground height at that position (use getGroundY on the old terrain, not 0.8)
    const localY = this.getGroundY(worldPos.x, worldPos.z) - depotY;

    this.monsterDadGroup.position.set(localX, localY, localZ);

    if (lookAtWorld) {
      const localLookAtX = lookAtWorld.x - depotX;
      const localLookAtZ = lookAtWorld.z - depotZ;
      this.monsterDadGroup.lookAt(localLookAtX, localY, localLookAtZ);
    }

    this.monsterDadGroup.visible = true;

    // Make the monster clearly visible during the chase (dark crimson body, rim glow and glowing eyes)
    if (this.monsterEyeMat) {
      this.monsterEyeMat.color.setHex(0xff0000);
      this.monsterEyeMat.emissive.setHex(0xff0000);
      this.monsterEyeMat.emissiveIntensity = 3.6;
    }
    if (this.monsterEyeLight) {
      this.monsterEyeLight.color.setHex(0xff0000);
      this.monsterEyeLight.intensity = 2.8;
    }
  }

  public updateMonsterAnimation(delta: number) {
    if (this.monsterMixer && this.monsterModelGroup && this.monsterModelGroup.visible) {
      this.monsterMixer.update(delta);
    } else if (this.monsterPlaceholderGroup && this.monsterPlaceholderGroup.visible) {
      this.monsterPlaceholderTimer += delta;
      const t = this.monsterPlaceholderTimer;

      if (this.isChaseMode) {
        // Forward lean, rapid body bob, and leg swing in code during chase
        if (this.monsterPlaceholderTorso) {
          this.monsterPlaceholderTorso.rotation.x = 0.32 + Math.sin(t * 12) * 0.08;
          this.monsterPlaceholderTorso.position.y = 1.45 + Math.abs(Math.sin(t * 12)) * 0.10;
        }
        if (this.monsterPlaceholderLeftLeg && this.monsterPlaceholderRightLeg) {
          this.monsterPlaceholderLeftLeg.rotation.x = Math.sin(t * 12) * 0.55;
          this.monsterPlaceholderRightLeg.rotation.x = -Math.sin(t * 12) * 0.55;
        }
      } else {
        // Idle subtle body bob
        if (this.monsterPlaceholderTorso) {
          this.monsterPlaceholderTorso.position.y = 1.45 + Math.sin(t * 2.5) * 0.03;
          this.monsterPlaceholderTorso.rotation.x = 0;
        }
        if (this.monsterPlaceholderLeftLeg && this.monsterPlaceholderRightLeg) {
          this.monsterPlaceholderLeftLeg.rotation.x = 0;
          this.monsterPlaceholderRightLeg.rotation.x = 0;
        }
      }
    }
  }

  public playMonsterAnimation(
    animKey: 'run' | 'walk' | 'roar' | 'attack' | string,
    timeScale: number = 1.0
  ) {
    if (!this.monsterMixer) return;
    const key = (animKey || 'run').toLowerCase() as 'run' | 'walk' | 'roar' | 'attack';
    let action = this.monsterActions[key];

    // Fallback: if monster_run isn't loaded, use monster_walk at 1.8x speed
    if (!action && key === 'run') {
      action = this.monsterActions['walk'];
      timeScale = 1.8;
    }
    if (!action) {
      action = Object.values(this.monsterActions)[0];
    }
    if (!action) return;

    action.setEffectiveTimeScale(timeScale);
    action.loop = THREE.LoopRepeat;
    action.enabled = true;

    if (this.monsterCurrentAction !== action) {
      if (this.monsterCurrentAction) {
        this.monsterCurrentAction.crossFadeTo(action, 0.2, true);
      }
      action.reset();
      action.play();
      this.monsterCurrentAction = action;
    } else {
      action.setEffectiveTimeScale(timeScale);
      if (!action.isRunning()) {
        action.play();
      }
    }
  }

  public getMonsterAnimInfo() {
    const isModelVisible = Boolean(this.monsterModelGroup && this.monsterModelGroup.visible);
    const clipName = this.monsterCurrentAction?.getClip().name || (isModelVisible ? 'idle' : 'procedural_placeholder');
    return {
      currentAnimName: clipName,
      mixerTime: this.monsterMixer?.time ?? 0,
      isClipLoaded: Boolean(this.monsterCurrentAction),
    };
  }

  public buildSupplyDepot() {
    this.supplyDepotGroup = new THREE.Group();
    this.supplyDepotGroup.name = 'SupplyDepotGroup';
    this.supplyDepotGroup.position.set(500, 0, 0);

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e2e4a, // Dark navy (not pure black)
      roughness: 0.45,
      metalness: 0.3,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Lighter blue-gray
      emissive: 0x0ea5e9, // Emissive cyan trim
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.2,
    });
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x6b7280, // Lighter blue-gray
      emissive: 0x06b6d4, // Emissive cyan edge trim
      emissiveIntensity: 0.32,
      roughness: 0.4,
      metalness: 0.2,
    });
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x243b5e, // Deep navy platform
      emissive: 0x0284c7, // Emissive cyan trim
      emissiveIntensity: 0.28,
      roughness: 0.5,
      metalness: 0.2,
    });

    // 1. Floor Plating with 3 Kinematic Jump Gaps
    const floorSections = [
      { zStart: -12, zEnd: -6.5 },
      { zStart: -5.5, zEnd: -0.5 },
      { zStart: 0.5, zEnd: 5.5 },
      { zStart: 6.5, zEnd: 13.8 },
    ];

    floorSections.forEach((sec) => {
      const depth = sec.zEnd - sec.zStart;
      const centerZ = (sec.zStart + sec.zEnd) / 2;
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.2, depth), darkMetalMat);
      floorMesh.position.set(0, -0.1, centerZ);
      floorMesh.receiveShadow = true;
      this.supplyDepotGroup.add(floorMesh);
    });

    // Outer Corridor Side Walls & End Walls
    // End wall moved to z = 13.6 so it is 2.4 units away from the monster at z = 11.2 (no overlap)
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.0, 27.2), wallMat);
    wallL.position.set(-4.2, 1.5, 0.5);
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.0, 27.2), wallMat);
    wallR.position.set(4.2, 1.5, 0.5);
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.0, 0.4), wallMat);
    wallBack.position.set(0, 1.5, -12.5);
    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.0, 0.4), wallMat);
    wallFront.position.set(0, 1.5, 13.6);
    this.supplyDepotGroup.add(wallL, wallR, wallBack, wallFront);

    this.supplyDepotColliders.push(
      { id: 'depot_wall_l', name: 'Depot Left Wall', minX: -4.5 + 500, maxX: -3.9 + 500, minZ: -13, maxZ: 14.0, height: 3.0 },
      { id: 'depot_wall_r', name: 'Depot Right Wall', minX: 3.9 + 500, maxX: 4.5 + 500, minZ: -13, maxZ: 14.0, height: 3.0 },
      { id: 'depot_wall_back', name: 'Depot Back Wall', minX: -4.5 + 500, maxX: 4.5 + 500, minZ: -13.0, maxZ: -12.3, height: 3.0 },
      { id: 'depot_wall_front', name: 'Depot Front Wall', minX: -4.5 + 500, maxX: 4.5 + 500, minZ: 13.4, maxZ: 14.1, height: 3.0 }
    );

    // Cover Low Walls & Crates along the 24u depot path
    const covers = [
      { type: 'wall', x: -1.5, z: -8.0, w: 2.2, h: 1.1, d: 0.4 },
      { type: 'crate', x: 1.8, z: -4.5, w: 1.6, h: 1.0, d: 1.2 },
      { type: 'wall', x: 1.2, z: -1.5, w: 2.2, h: 1.1, d: 0.4 },
      { type: 'crate', x: -1.8, z: 2.5, w: 1.6, h: 1.0, d: 1.2 },
      { type: 'wall', x: -0.8, z: 7.5, w: 2.2, h: 1.1, d: 0.4 },
    ];

    covers.forEach((c, i) => {
      const mat = c.type === 'wall' ? wallMat : crateMat;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), mat);
      mesh.position.set(c.x, c.h / 2, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.supplyDepotGroup.add(mesh);

      const minX = c.x - c.w / 2 + 500;
      const maxX = c.x + c.w / 2 + 500;
      const minZ = c.z - c.d / 2;
      const maxZ = c.z + c.d / 2;

      this.supplyDepotColliders.push({
        id: `depot_cover_${i}`,
        name: `Cover ${i}`,
        minX, maxX, minZ, maxZ, height: c.h
      });

      this.supplyDepotCoverBoxes.push({ minX, maxX, minZ, maxZ, height: c.h });
    });

    // 2. Raised Platform at Far End (z = 10.7, height = 0.8, depth = 3.8 covers z = 8.8 to 12.6)
    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.8, 3.8), platformMat);
    platform.position.set(0, 0.4, 10.7);
    platform.receiveShadow = true;
    this.supplyDepotGroup.add(platform);

    this.supplyDepotColliders.push({
      id: 'depot_platform',
      name: 'Supply Platform',
      minX: -2.5 + 500, maxX: 2.5 + 500, minZ: 8.8, maxZ: 12.6, height: 0.8
    });

    // Solid monster collider on the platform
    this.supplyDepotColliders.push({
      id: 'depot_monster',
      name: 'Monster Dad',
      minX: 1.2 - 0.7 + 500, maxX: 1.2 + 0.7 + 500, minZ: 11.2 - 0.7, maxZ: 11.2 + 0.7, height: 2.8
    });

    // Dedicated Platform Lighting ensuring depot lights reach the platform and monster
    const platformFlood = new THREE.DirectionalLight(0x9fd8ff, 1.6);
    platformFlood.position.set(1.5, 7.0, 7.0);
    platformFlood.target.position.set(1.2, 1.8, 11.2);
    this.supplyDepotGroup.add(platformFlood);
    this.supplyDepotGroup.add(platformFlood.target);

    const platformRim = new THREE.DirectionalLight(0x00ffff, 1.2);
    platformRim.position.set(-2.0, 5.5, 14.0);
    platformRim.target.position.set(1.2, 1.8, 11.2);
    this.supplyDepotGroup.add(platformRim);
    this.supplyDepotGroup.add(platformRim.target);

    const platformFill = new THREE.PointLight(0x38bdf8, 1.0, 14.0);
    platformFill.position.set(-1.5, 3.5, 9.5);
    this.supplyDepotGroup.add(platformFill);

    // 3. CLEARLY VISIBLE BEER BOTTLE on Raised Platform next to Monster
    this.supplyCapsuleMesh = new THREE.Group();
    this.supplyCapsuleMesh.name = 'SupplyBeerBottleGroup';
    // Platform surface is at y = 0.8. Placed next to monster at x = 0.0, z = 11.2 (monster is at x = 1.2, z = 11.2)
    this.supplyCapsuleMesh.position.set(0.0, 0.8, 11.2);

    const brownGlassMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      roughness: 0.15,
      metalness: 0.12,
      emissive: 0xb45309,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.94,
    });

    const bottleGroup = new THREE.Group();

    // Bottle Body: brown glass cylinder
    const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.54, 24), brownGlassMat);
    bottleBody.position.y = 0.27;
    bottleBody.castShadow = true;
    bottleBody.receiveShadow = true;

    // Bottle Shoulder: tapering transition
    const bottleShoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 0.18, 24), brownGlassMat);
    bottleShoulder.position.y = 0.63;
    bottleShoulder.castShadow = true;

    // Bottle Neck
    const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.30, 24), brownGlassMat);
    bottleNeck.position.y = 0.87;
    bottleNeck.castShadow = true;

    // Bottle Lip Rim
    const bottleLip = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 24), brownGlassMat);
    bottleLip.position.y = 1.02;
    bottleLip.rotation.x = Math.PI / 2;

    // Bottle Crown Cap (metallic gold/amber sheen)
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x92400e,
      emissiveIntensity: 0.35,
    });
    const bottleCap = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.05, 16), capMat);
    bottleCap.position.y = 1.045;
    bottleCap.castShadow = true;

    // White Label wrapped around body
    const labelMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      roughness: 0.5,
      emissive: 0x78350f,
      emissiveIntensity: 0.15,
      side: THREE.DoubleSide,
    });
    const labelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.184, 0.30, 24, 1, true), labelMat);
    labelMesh.position.y = 0.27;

    // Red Label Accent Stripe
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const stripeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.186, 0.186, 0.12, 24, 1, true), stripeMat);
    stripeMesh.position.y = 0.27;

    // Amber Emissive Glow Core (Internal radiance)
    const amberCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
    });
    const amberCore = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.48, 16), amberCoreMat);
    amberCore.position.y = 0.27;

    bottleGroup.add(bottleBody, bottleShoulder, bottleNeck, bottleLip, bottleCap, labelMesh, stripeMesh, amberCore);
    this.supplyCapsuleMesh.add(bottleGroup);

    // Pulsing Amber Light Halo
    this.beerPulseLight = new THREE.PointLight(0xf59e0b, 2.8, 14.0);
    this.beerPulseLight.position.y = 0.55;

    const haloGeo = new THREE.SphereGeometry(0.48, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    this.beerHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.beerHaloMesh.position.y = 0.55;
    this.supplyCapsuleMesh.add(this.beerPulseLight, this.beerHaloMesh);

    // Orbiting Sparks, visible from the start of the depot
    this.beerSparks = [];
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const sparkGeo = new THREE.SphereGeometry(0.042, 8, 8);
    for (let i = 0; i < 10; i++) {
      const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
      const angle = (i / 10) * Math.PI * 2;
      const radius = 0.38 + (i % 3) * 0.15;
      const speed = 1.6 + (i % 4) * 0.4;
      const y = 0.15 + (i / 10) * 0.8;
      const bobSpeed = 2.0 + (i % 3) * 0.8;
      sparkMesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      this.supplyCapsuleMesh.add(sparkMesh);
      this.beerSparks.push({ mesh: sparkMesh, angle, radius, speed, y, bobSpeed });
    }

    this.supplyDepotGroup.add(this.supplyCapsuleMesh);

    // 4. MONSTER DAD on Raised Platform
    this.monsterDadGroup = new THREE.Group();
    this.monsterDadGroup.name = 'MonsterDadGroup';
    this.monsterDadGroup.position.copy(this.monsterPlatformPos);
    this.monsterDadGroup.layers.set(0);

    // Soft shadow disc directly under the monster on top of the platform
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(5, 10, 20, 0.82)');
      grad.addColorStop(0.45, 'rgba(5, 10, 20, 0.55)');
      grad.addColorStop(0.78, 'rgba(5, 10, 20, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeo = new THREE.PlaneGeometry(2.0, 2.0);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.monsterShadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    this.monsterShadowDisc.name = 'MonsterShadowDisc';
    this.monsterShadowDisc.rotation.x = -Math.PI / 2;
    this.monsterShadowDisc.position.set(0, 0.005, 0); // Positioned at base of monster in monsterDadGroup
    this.monsterDadGroup.add(this.monsterShadowDisc);

    // Eyes material and light (orange/dim by default, bright red when looking at Zane)
    this.monsterEyeMat = new THREE.MeshStandardMaterial({
      color: 0x551100,
      emissive: 0x551100,
      emissiveIntensity: 0.2,
      roughness: 0.2,
    });
    this.monsterEyeLight = new THREE.PointLight(0x551100, 0.1, 3.5);

    // Create immediate 2.8 unit tall placeholder so figure is always fully present
    this.monsterPlaceholderGroup = this.buildMonsterPlaceholder();
    this.monsterDadGroup.add(this.monsterPlaceholderGroup);

    // Start background asset load of real Dad model
    this.loadMonsterModel();

    this.monsterDadGroup.traverse((child) => {
      child.frustumCulled = false;
    });

    this.supplyDepotGroup.add(this.monsterDadGroup);
    this.group.add(this.supplyDepotGroup);
  }

  public updateSupplyDepot(delta: number, soundEngine: any) {
    // When in chase mode, do NOT lock position or rotation, and skip red-light-green-light logic
    if (this.isChaseMode) {
      if (this.beerPulseLight) {
        const pulse = 1.0 + Math.sin(this.monsterLoopTimer * 3.5) * 0.35;
        this.beerPulseLight.intensity = 2.8 * pulse;
        if (this.beerHaloMesh) {
          this.beerHaloMesh.scale.setScalar(pulse);
        }
      }

      for (const spark of this.beerSparks) {
        spark.angle += spark.speed * delta;
        const sx = Math.cos(spark.angle) * spark.radius;
        const sz = Math.sin(spark.angle) * spark.radius;
        const sy = spark.y + Math.sin(spark.angle * spark.bobSpeed) * 0.14;
        spark.mesh.position.set(sx, sy, sz);
      }
      return;
    }

    // 1. Strictly lock world position to platform spot every frame when not chasing
    if (this.monsterDadGroup) {
      this.monsterDadGroup.position.copy(this.monsterPlatformPos);
      this.monsterDadGroup.rotation.set(0, 0, 0); // Base stays planted on platform
    }
    if (this.monsterModelGroup) {
      this.monsterModelGroup.position.set(0, 0, 0);
    }
    if (this.monsterPlaceholderGroup) {
      this.monsterPlaceholderGroup.position.set(0, 0, 0);
    }

    this.monsterLoopTimer += delta;
    const cycle = this.monsterLoopTimer % 6.0;

    // 3. Update beer bottle pulsing amber light halo & orbiting sparks
    if (this.beerPulseLight) {
      const pulse = 1.0 + Math.sin(this.monsterLoopTimer * 3.5) * 0.35;
      this.beerPulseLight.intensity = 2.8 * pulse;
      if (this.beerHaloMesh) {
        this.beerHaloMesh.scale.setScalar(pulse);
      }
    }

    for (const spark of this.beerSparks) {
      spark.angle += spark.speed * delta;
      const sx = Math.cos(spark.angle) * spark.radius;
      const sz = Math.sin(spark.angle) * spark.radius;
      const sy = spark.y + Math.sin(spark.angle * spark.bobSpeed) * 0.14;
      spark.mesh.position.set(sx, sy, sz);
    }

    const wasFacing = this.monsterIsFacingPlayer;

    // 4. Red light vs Green light states
    if (cycle >= 4.0 && cycle < 6.0) {
      // RED LIGHT: Head & torso turn toward Zane (looking toward -Z)
      this.monsterIsFacingPlayer = true;
      if (this.monsterEyeMat) {
        this.monsterEyeMat.color.setHex(0xff0000);
        this.monsterEyeMat.emissive.setHex(0xff0000);
        this.monsterEyeMat.emissiveIntensity = 3.6;
      }
      if (this.monsterEyeLight) {
        this.monsterEyeLight.color.setHex(0xff0000);
        this.monsterEyeLight.intensity = 2.8;
      }
    } else {
      // GREEN LIGHT: Head & torso turn away from Zane (facing +Z)
      this.monsterIsFacingPlayer = false;
      if (this.monsterEyeMat) {
        this.monsterEyeMat.color.setHex(0x551100);
        this.monsterEyeMat.emissive.setHex(0x551100);
        this.monsterEyeMat.emissiveIntensity = 0.2;
      }
      if (this.monsterEyeLight) {
        this.monsterEyeLight.color.setHex(0x551100);
        this.monsterEyeLight.intensity = 0.1;
      }
    }

    // 5. Rotate only head and torso (turning toward Zane and away)
    const targetTurn = this.monsterIsFacingPlayer ? Math.PI : 0;
    this.monsterTurnAngle = THREE.MathUtils.lerp(this.monsterTurnAngle, targetTurn, delta * 9);

    if (this.monsterPlaceholderTorso) {
      this.monsterPlaceholderTorso.rotation.y = this.monsterTurnAngle * 0.6;
    }
    if (this.monsterPlaceholderHead) {
      this.monsterPlaceholderHead.rotation.y = this.monsterTurnAngle * 0.4;
    }

    if (this.monsterTorsoBone) {
      if (this.monsterTorsoRestQ) {
        this.monsterTorsoBone.quaternion.copy(this.monsterTorsoRestQ);
      }
      const torsoTurnQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.monsterTurnAngle * 0.6);
      this.monsterTorsoBone.quaternion.multiply(torsoTurnQ);
    }
    if (this.monsterHeadBone) {
      if (this.monsterHeadRestQ) {
        this.monsterHeadBone.quaternion.copy(this.monsterHeadRestQ);
      }
      const headTurnQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.monsterTurnAngle * 0.4);
      this.monsterHeadBone.quaternion.multiply(headTurnQ);
    }

    if (this.monsterIsFacingPlayer !== wasFacing) {
      soundEngine?.playMonsterGrowl?.();
    }
  }

  public checkMonsterDetection(playerPos: THREE.Vector3, isCrouching: boolean): boolean {
    const monsterPos = new THREE.Vector3(1.2 + 500, 1.8, 11.2);
    const dist = playerPos.distanceTo(monsterPos);

    if (dist > 14.0) return false;
    if (!this.monsterIsFacingPlayer) return false;
    if (isCrouching) return false;

    const monsterToPlayer = new THREE.Vector3(playerPos.x - monsterPos.x, 0, playerPos.z - monsterPos.z).normalize();
    const forward = new THREE.Vector3(0, 0, -1);
    const dot = forward.dot(monsterToPlayer);
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

    if (angleDeg > 32.0) return false;

    const p1x = monsterPos.x;
    const p1z = monsterPos.z;
    const p2x = playerPos.x;
    const p2z = playerPos.z;

    for (const box of this.supplyDepotCoverBoxes) {
      if (lineIntersectsAABB2D(p1x, p1z, p2x, p2z, box.minX, box.maxX, box.minZ, box.maxZ)) {
        return false; // Hidden behind cover!
      }
    }

    return true; // Detected!
  }
}
