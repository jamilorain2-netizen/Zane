import * as THREE from 'three';
import { InteractionNode } from '../types/game';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { BoxCollider2D } from '../utils/collision';
import {
  createFresnelRimMaterial,
  createAnimatedPanelLineMaterial,
  createVolumetricLightShaft,
  CyberDustField,
  createAnamorphicStreakSprite,
} from '../utils/cyberAtmosphere';

export interface HallwaySpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface HallwayPanel {
  id: string;
  name: string;
  group: THREE.Group;
  pivot: THREE.Group;
  frameMesh: THREE.Mesh;
  photoMesh: THREE.Mesh;
  glowingEdge: THREE.Object3D;
  crookedAngle: number;
  currentAngle: number;
  isAligned: boolean;
  isAligning: boolean;
  alignTimer: number;
  sparkGroup: THREE.Group;
  sparks: HallwaySpark[];
  interactionNode: InteractionNode;
  triggerSparks: () => void;
}

export interface LivingRoomAnchors {
  sofaSeatAnchor: {
    position: THREE.Vector3;
    rotationY: number;
    facingDir: THREE.Vector3;
  };
  sofaApproachPoint: THREE.Vector3;
  tvStandCollider: BoxCollider2D;
  coffeeTableCollider: BoxCollider2D;
  sofaCollider: BoxCollider2D;
}

export class HouseMapScene {
  public group: THREE.Group;
  public interactionNodes: InteractionNode[] = [];
  public colliders: BoxCollider2D[] = [];
  public keyMesh: THREE.Group | null = null;
  public hallwayPanels: HallwayPanel[] = [];
  public hallwayDomeLights: THREE.PointLight[] = [];
  public hallwayBulbMeshes: THREE.Mesh[] = [];
  public isImaginationActive: boolean = false;

  public livingGroup: THREE.Group | null = null;
  public sofaGroup: THREE.Group | null = null;
  public tvGroup: THREE.Group | null = null;
  public coffeeGroup: THREE.Group | null = null;

  public hallwayFloorMat: THREE.Material | null = null;
  public hallwayWallMat: THREE.Material | null = null;
  public hallwayRugMat: THREE.Material | null = null;
  public hallwayCeilingMat: THREE.Material | null = null;
  public ashSparksGroup: THREE.Group = new THREE.Group();
  public ashSparks: { mesh: THREE.Mesh; vel: THREE.Vector3; rotSpeed: number }[] = [];
  public laserStreakGroup: THREE.Group = new THREE.Group();
  public laserStreaks: { mesh: THREE.Mesh; timer: number; speed: number; active: boolean }[] = [];

  public cyberAtmosphereMats: THREE.ShaderMaterial[] = [];
  public cyberDustField: CyberDustField | null = null;
  public streakSprites: { sprite: THREE.Sprite; material: THREE.SpriteMaterial }[] = [];
  public volumetricShafts: THREE.Mesh[] = [];
  private totalTime: number = 0;

  public drawerMesh: THREE.Group | null = null;
  public questChairMesh: THREE.Group | null = null;
  public beerBottleMesh: THREE.Group | null = null;

  public hideKey() {
    if (this.keyMesh) {
      this.keyMesh.visible = false;
    }
    this.interactionNodes = this.interactionNodes.filter((n) => n.id !== 'kitchen_key' && n.id !== 'kitchen_drawer');
  }

  public setKitchenImaginationMode(active: boolean) {
    const drawerNode = this.interactionNodes.find((n) => n.id === 'kitchen_drawer');
    if (drawerNode) {
      drawerNode.name = active ? 'Vault' : 'Kitchen Drawer';
      drawerNode.promptVerb = active ? 'Inspect' : 'Open';
    }
    const counterNode = this.interactionNodes.find((n) => n.id === 'house_kitchen');
    if (counterNode) {
      counterNode.name = active ? 'Supply Deck' : 'Kitchen Counter';
    }
  }

  public setLightProgress(progress: number) {
    // 1. Dome lights
    const warmColor = new THREE.Color(0xfef08a);
    const neonColor = new THREE.Color(0x06b6d4); // cool electric cyan
    const curColor = new THREE.Color().lerpColors(warmColor, neonColor, progress);
    for (const light of this.hallwayDomeLights) {
      light.color.copy(curColor);
      light.intensity = 0.7 + progress * 0.4;
    }
    for (const bulb of this.hallwayBulbMeshes) {
      const mat = bulb.material as THREE.MeshBasicMaterial;
      if (mat && mat.color) {
        mat.color.copy(curColor);
      }
    }

    // 2. Hallway surfaces darker & bluer battlefield tinting
    if (this.hallwayWallMat && (this.hallwayWallMat as any).color) {
      const realWall = new THREE.Color(0xded0bb);
      const battleWall = new THREE.Color(0x1e293b);
      (this.hallwayWallMat as any).color.lerpColors(realWall, battleWall, progress);
    }
    if (this.hallwayFloorMat && (this.hallwayFloorMat as any).color) {
      const realFloor = new THREE.Color(0xa86e38);
      const battleFloor = new THREE.Color(0x0f172a);
      (this.hallwayFloorMat as any).color.lerpColors(realFloor, battleFloor, progress);
    }
    if (this.hallwayRugMat && (this.hallwayRugMat as any).color) {
      const realRug = new THREE.Color(0x1e3a8a);
      const battleRug = new THREE.Color(0x0b132b);
      (this.hallwayRugMat as any).color.lerpColors(realRug, battleRug, progress);
    }
    if (this.hallwayCeilingMat && (this.hallwayCeilingMat as any).color) {
      const realCeiling = new THREE.Color(0xe6d7c5);
      const battleCeiling = new THREE.Color(0x09111e);
      (this.hallwayCeilingMat as any).color.lerpColors(realCeiling, battleCeiling, progress);
    }

    // 3. Hallway battlefield atmosphere particles & distant laser streaks
    this.ashSparksGroup.visible = progress > 0.05;
    this.laserStreakGroup.visible = progress > 0.05;

    // 4. Cyber atmosphere shaders & light shafts
    for (const mat of this.cyberAtmosphereMats) {
      if (mat.uniforms.uProgress) {
        mat.uniforms.uProgress.value = progress;
      }
    }
    for (const item of this.streakSprites) {
      item.material.opacity = progress * 0.75;
    }
  }

  public setImaginationMode(active: boolean) {
    this.isImaginationActive = active;
    for (const panel of this.hallwayPanels) {
      panel.glowingEdge.visible = active && !panel.isAligned;
      if (active && !panel.isAligned) {
        panel.interactionNode.name = 'Hull Panel';
        panel.interactionNode.promptVerb = 'Align';
        panel.interactionNode.description = 'Press E to align hull panel.';
      } else {
        panel.interactionNode.name = 'Framed Photo';
        panel.interactionNode.promptVerb = 'Look';
        panel.interactionNode.description = 'Framed wall photo.';
      }
    }
  }

  public alignPanel(panelId: string): boolean {
    const panel = this.hallwayPanels.find((p) => p.id === panelId);
    if (!panel || panel.isAligned || panel.isAligning) return false;
    panel.isAligning = true;
    panel.alignTimer = 0;
    panel.triggerSparks();
    return true;
  }

  public updatePanels(delta: number) {
    for (const panel of this.hallwayPanels) {
      if (panel.isAligning) {
        panel.alignTimer += delta;
        const progress = Math.min(1.0, panel.alignTimer / 0.6);
        const ease = 1 - Math.pow(1 - progress, 3);
        panel.currentAngle = panel.crookedAngle * (1 - ease);
        panel.pivot.rotation.z = panel.currentAngle;

        if (progress >= 1.0) {
          panel.isAligning = false;
          panel.isAligned = true;
          panel.currentAngle = 0;
          panel.pivot.rotation.z = 0;
          panel.glowingEdge.visible = false;
          panel.interactionNode.name = 'Framed Photo';
          panel.interactionNode.promptVerb = 'Look';
        }
      }

      for (const spark of panel.sparks) {
        if (spark.life < spark.maxLife) {
          spark.life += delta;
          spark.mesh.position.addScaledVector(spark.vel, delta);
          spark.vel.y -= 3.5 * delta;
          const remaining = Math.max(0.001, 1 - spark.life / spark.maxLife);
          spark.mesh.scale.setScalar(remaining);
        } else if (spark.mesh.visible) {
          spark.mesh.visible = false;
        }
      }
    }
  }

  constructor() {
    this.group = new THREE.Group();
    this.buildHallway();
    this.buildLivingRoom();
    this.buildKitchen();
    this.setupLighting();
    this.setupInteractionNodes();
    this.buildColliders();
  }

  // WARM NATURAL HOME: Hardwood Floors, Light Ivory Walls, Warm Trim
  private buildHallway() {
    // Floor: Warm honey oak hardwood floor from Z = 4.5 to Z = 19.5
    const floorMat = createToonMaterial({ color: 0xa86e38, desaturate: 0.08 });
    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });
    const ceilingMat = createToonMaterial({ color: 0xe6d7c5, desaturate: 0.06 });

    this.hallwayFloorMat = floorMat;
    this.hallwayWallMat = wallMat;
    this.hallwayCeilingMat = ceilingMat;

    const hallwayFloor = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 15.0), floorMat);
    hallwayFloor.rotation.x = -Math.PI / 2;
    hallwayFloor.position.set(0, 0, 12.0);
    hallwayFloor.receiveShadow = true;
    this.group.add(hallwayFloor);

    // Cozy hallway runner rug
    const rugMat = createToonMaterial({ color: 0x1e3a8a, desaturate: 0.1 });
    this.hallwayRugMat = rugMat;
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 14.0), rugMat);
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0, 0.012, 12.0);
    runner.receiveShadow = true;
    addInkOutline(runner, 0.02);
    this.group.add(runner);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 15.0), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.8, 12.0);
    this.group.add(ceiling);

    // Left Hallway Walls (X = -1.8)
    // Segment 1: Z = 4.5 to 6.85
    const leftWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 2.35), wallMat);
    leftWall1.position.set(-1.8, 1.9, 5.675);

    // Segment 2: Z = 8.15 to 13.5
    const leftWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 5.35), wallMat);
    leftWall2.position.set(-1.8, 1.9, 10.825);

    // Top beam above workshop doorway
    const leftDoorBeam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 1.3), wallMat);
    leftDoorBeam.position.set(-1.8, 3.15, 7.5);

    this.group.add(leftWall1, leftWall2, leftDoorBeam);

    // Right Hallway Walls (X = +1.8)
    // Segment 1: Z = 4.5 to 10.35
    const rightWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 5.85), wallMat);
    rightWall1.position.set(1.8, 1.9, 7.425);

    // Segment 2: Z = 11.65 to 13.5
    const rightWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 1.85), wallMat);
    rightWall2.position.set(1.8, 1.9, 12.575);

    // Top beam above basement doorway
    const rightDoorBeam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 1.3), wallMat);
    rightDoorBeam.position.set(1.8, 3.15, 11.0);

    this.group.add(rightWall1, rightWall2, rightDoorBeam);

    // Faint low-contrast architectural panel lines along hallway with animated energy pulse
    const panelLineMat = createAnimatedPanelLineMaterial(0x06b6d4);
    this.cyberAtmosphereMats.push(panelLineMat);

    for (const z of [6.0, 8.5, 11.0, 13.5, 16.0]) {
      const lineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 3.6, 0.025), panelLineMat);
      lineMesh.position.set(1.685, 1.9, z);
      this.group.add(lineMesh);

      const lineMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 3.6, 0.025), panelLineMat);
      lineMeshL.position.set(-1.685, 1.9, z);
      this.group.add(lineMeshL);
    }

    // Floor emissive panel lines
    const floorLineMat = createAnimatedPanelLineMaterial(0xf97316);
    this.cyberAtmosphereMats.push(floorLineMat);
    for (const x of [-0.9, 0.9]) {
      const fLine = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 14.0), floorLineMat);
      fLine.rotation.x = -Math.PI / 2;
      fLine.position.set(x, 0.015, 12.0);
      this.group.add(fLine);
    }

    // Faux volumetric light shafts under dome lights
    for (const z of [6.5, 11.0, 15.5]) {
      const shaft = createVolumetricLightShaft(3.4, 0.14, 0.95);
      shaft.position.set(0, 3.65, z);
      this.group.add(shaft);
      this.volumetricShafts.push(shaft);
      this.cyberAtmosphereMats.push(shaft.material as THREE.ShaderMaterial);
    }

    // Pooled Cyber Dust Particles
    this.cyberDustField = new CyberDustField(90);
    this.group.add(this.cyberDustField.points);

    // Drifting orange sparks and ash in hallway
    this.ashSparksGroup = new THREE.Group();
    this.ashSparksGroup.visible = false;
    const ashMat1 = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const ashMat2 = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const ashMat3 = new THREE.MeshBasicMaterial({ color: 0x64748b });
    const ashGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);

    for (let i = 0; i < 35; i++) {
      const mat = i % 3 === 0 ? ashMat1 : i % 3 === 1 ? ashMat2 : ashMat3;
      const mesh = new THREE.Mesh(ashGeo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 2.6,
        0.3 + Math.random() * 2.8,
        5.0 + Math.random() * 12.0
      );
      this.ashSparksGroup.add(mesh);
      this.ashSparks.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          0.15 + Math.random() * 0.35,
          (Math.random() - 0.5) * 0.25
        ),
        rotSpeed: (Math.random() - 0.5) * 3.0,
      });
    }
    this.group.add(this.ashSparksGroup);

    // Distant red laser streaks crossing far away outside end of hallway
    this.laserStreakGroup = new THREE.Group();
    this.laserStreakGroup.visible = false;
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const laserGeo = new THREE.BoxGeometry(0.04, 0.04, 2.2);

    for (let i = 0; i < 2; i++) {
      const lMesh = new THREE.Mesh(laserGeo, laserMat);
      lMesh.position.set(-8.0, 2.2 + i * 0.6, 21.0);
      lMesh.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
      this.laserStreakGroup.add(lMesh);
      this.laserStreaks.push({
        mesh: lMesh,
        timer: i * 1.6,
        speed: 28.0,
        active: false,
      });
    }
    this.group.add(this.laserStreakGroup);

    // End Wall (Z = 19.5) with Restroom Doorway
    const endWallL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.8, 0.2), wallMat);
    endWallL.position.set(-1.225, 1.9, 19.5);

    const endWallR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.8, 0.2), wallMat);
    endWallR.position.set(1.225, 1.9, 19.5);

    const endWallTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.2), wallMat);
    endWallTop.position.set(0, 3.15, 19.5);

    this.group.add(endWallL, endWallR, endWallTop);

    // Hallway Flush-Mount Dome Lights with warm local accent PointLights
    for (const z of [6.5, 11.0, 15.5]) {
      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16),
        createToonMaterial({ color: 0xffffff, desaturate: 0.05 })
      );
      fixture.position.set(0, 3.75, z);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      bulb.position.set(0, 3.68, z);

      const domeLight = new THREE.PointLight(0xfef08a, 0.7, 12.0, 2);
      domeLight.position.set(0, 3.5, z);

      this.hallwayDomeLights.push(domeLight);
      this.hallwayBulbMeshes.push(bulb);

      this.group.add(fixture, bulb, domeLight);
    }

    // Hallway Details: Coat rack with jacket and backpack, shoe rack with shoes, side table with plant & keys, wall clock, family photos, child's drawing
    const woodMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.1 });
    const darkWoodMat = createToonMaterial({ color: 0x451a03, desaturate: 0.1 });
    const metalMat = createToonMaterial({ color: 0x64748b, desaturate: 0.05 });

    // 1. Coat rack with jacket & school backpack
    const coatRackGroup = new THREE.Group();
    coatRackGroup.position.set(1.4, 0, 5.5);

    const rackBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 12), woodMat);
    rackBase.position.y = 0.02;
    rackBase.castShadow = true;

    const rackPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.75, 12), woodMat);
    rackPole.position.y = 0.9;
    rackPole.castShadow = true;
    addInkOutline(rackPole, 0.02);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 8), metalMat);
      hook.rotation.z = Math.PI / 4;
      hook.rotation.y = angle;
      hook.position.set(Math.cos(angle) * 0.06, 1.6, Math.sin(angle) * 0.06);
      coatRackGroup.add(hook);
    }

    const jacketMat = createToonMaterial({ color: 0xd97706, desaturate: 0.05 });
    const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.18), jacketMat);
    jacket.position.set(-0.1, 1.25, 0);
    jacket.castShadow = true;
    addInkOutline(jacket, 0.02);

    const backpackMat = createToonMaterial({ color: 0x2563eb, desaturate: 0.05 });
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.2), backpackMat);
    backpack.position.set(0.1, 1.15, 0.05);
    backpack.castShadow = true;
    addInkOutline(backpack, 0.02);

    const pocketMat = createToonMaterial({ color: 0xfacc15, desaturate: 0.05 });
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.05), pocketMat);
    pocket.position.set(0.1, 1.05, 0.16);
    backpack.add(pocket);

    coatRackGroup.add(rackBase, rackPole, jacket, backpack);
    this.group.add(coatRackGroup);

    // 2. Shoe rack with a few shoes
    const shoeRackGroup = new THREE.Group();
    shoeRackGroup.position.set(1.45, 0, 6.5);

    const shelf1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.8), woodMat);
    shelf1.position.y = 0.12;
    shelf1.castShadow = true;
    addInkOutline(shelf1, 0.02);

    const shelf2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.8), woodMat);
    shelf2.position.y = 0.38;
    shelf2.castShadow = true;
    addInkOutline(shelf2, 0.02);

    for (const legX of [-0.15, 0.15]) {
      for (const legZ of [-0.36, 0.36]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), woodMat);
        leg.position.set(legX, 0.21, legZ);
        shoeRackGroup.add(leg);
      }
    }

    const shoeMat1 = createToonMaterial({ color: 0xd97706, desaturate: 0.05 });
    const shoeMat2 = createToonMaterial({ color: 0xef4444, desaturate: 0.05 });
    const shoeMat3 = createToonMaterial({ color: 0x1e293b, desaturate: 0.05 });

    const shoe1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), shoeMat1);
    shoe1.position.set(0.02, 0.17, -0.2);
    const shoe2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), shoeMat2);
    shoe2.position.set(0.02, 0.17, 0.15);
    const shoe3 = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.10, 0.13), shoeMat3);
    shoe3.position.set(0.02, 0.43, -0.1);

    shoeRackGroup.add(shelf1, shelf2, shoe1, shoe2, shoe3);
    this.group.add(shoeRackGroup);

    // 3. Small side table with plant and bowl of keys
    const tableGroup = new THREE.Group();
    tableGroup.position.set(-1.45, 0, 9.5);

    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.85), darkWoodMat);
    tableTop.position.y = 0.75;
    tableTop.castShadow = true;
    addInkOutline(tableTop, 0.02);

    for (const legX of [-0.18, 0.18]) {
      for (const legZ of [-0.38, 0.38]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.04), darkWoodMat);
        leg.position.set(legX, 0.36, legZ);
        tableGroup.add(leg);
      }
    }

    const potMat = createToonMaterial({ color: 0xf8fafc, desaturate: 0.02 });
    const plantPot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.18, 12), potMat);
    plantPot.position.set(-0.05, 0.86, -0.2);
    plantPot.castShadow = true;
    addInkOutline(plantPot, 0.02);

    const leafMat = createToonMaterial({ color: 0x16a34a, desaturate: 0.05 });
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), leafMat);
      leaf.scale.set(1.2, 0.5, 0.8);
      leaf.position.set(
        -0.05 + Math.cos((i * Math.PI) / 2) * 0.08,
        0.97 + (i % 2) * 0.03,
        -0.2 + Math.sin((i * Math.PI) / 2) * 0.08
      );
      tableGroup.add(leaf);
    }

    const bowlMat = createToonMaterial({ color: 0x9333ea, desaturate: 0.05 });
    const keyBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.05, 12), bowlMat);
    keyBowl.position.set(0.02, 0.80, 0.2);
    addInkOutline(keyBowl, 0.015);

    const keyMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.05 });
    const keysMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.06), keyMat);
    keysMesh.position.set(0.02, 0.825, 0.2);

    tableGroup.add(tableTop, plantPot, keyBowl, keysMesh);
    this.group.add(tableGroup);

    // 4. Wall Clock
    const clockGroup = new THREE.Group();
    clockGroup.position.set(-1.69, 2.5, 10.5);
    clockGroup.rotation.y = Math.PI / 2;

    const clockRim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16), darkWoodMat);
    clockRim.rotation.x = Math.PI / 2;
    addInkOutline(clockRim, 0.02);

    const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.035, 16), createToonMaterial({ color: 0xffffff }));
    clockFace.rotation.x = Math.PI / 2;

    const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.04), createToonMaterial({ color: 0x0f172a }));
    hand1.position.set(0, 0.04, 0.01);
    const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.04), createToonMaterial({ color: 0x0f172a }));
    hand2.position.set(-0.03, 0, 0.01);

    clockGroup.add(clockRim, clockFace, hand1, hand2);
    this.group.add(clockGroup);

    // 5. 2 Framed Pictures on the same Right Hallway Wall at eye height (Y = 1.5, spaced 2.5 units apart)
    const createHallwayPanel = (
      id: string,
      x: number,
      y: number,
      z: number,
      rotY: number,
      crookedAngle: number,
      w: number,
      h: number,
      frameMatColor: number,
      artColor: number,
      detailArt?: (artGroup: THREE.Group) => void
    ): HallwayPanel => {
      const panelGroup = new THREE.Group();
      panelGroup.position.set(x, y, z);
      panelGroup.rotation.y = rotY;

      const pivot = new THREE.Group();
      pivot.rotation.z = crookedAngle;
      panelGroup.add(pivot);

      // Frame with toon shader & comic ink outline
      const frameMat = createToonMaterial({ color: frameMatColor, desaturate: 0.05 });
      const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), frameMat);
      addInkOutline(frameMesh, 0.02);
      pivot.add(frameMesh);

      // Picture canvas
      const photoMat = createToonMaterial({ color: artColor, desaturate: 0.05 });
      const photoMesh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, h - 0.08, 0.04), photoMat);
      photoMesh.position.z = 0.005;
      pivot.add(photoMesh);

      if (detailArt) {
        detailArt(pivot);
      }

      // Dual-tone Orange-Cyan Glowing Edge for Space Station Hull Panel in imagination mode
      const glowingEdge = new THREE.Group();
      glowingEdge.visible = false;

      const edgeGeo1 = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.025, h + 0.025, 0.05));
      const edgeMat1 = new THREE.LineBasicMaterial({
        color: 0x06b6d4, // Cyan
        transparent: true,
        opacity: 0.95,
      });
      const cyanLine = new THREE.LineSegments(edgeGeo1, edgeMat1);

      const edgeGeo2 = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.045, h + 0.045, 0.035));
      const edgeMat2 = new THREE.LineBasicMaterial({
        color: 0xf97316, // Orange
        transparent: true,
        opacity: 0.9,
      });
      const orangeLine = new THREE.LineSegments(edgeGeo2, edgeMat2);

      glowingEdge.add(cyanLine, orangeLine);
      pivot.add(glowingEdge);

      // Fresnel Rim-Light Overlay Mesh
      const fresnelMat = createFresnelRimMaterial(id === 'hallway_panel_1' ? 0x06b6d4 : 0xf97316, 2.4);
      this.cyberAtmosphereMats.push(fresnelMat);
      const fresnelMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, h + 0.01, 0.05), fresnelMat);
      pivot.add(fresnelMesh);

      // Anamorphic Lens Streak Flare Sprite
      const streak = createAnamorphicStreakSprite(id === 'hallway_panel_1' ? 0x38bdf8 : 0xf97316);
      streak.sprite.position.set(0, 0, 0.04);
      pivot.add(streak.sprite);
      this.streakSprites.push(streak);

      // Small spark burst particles for alignment moment
      const sparkGroup = new THREE.Group();
      pivot.add(sparkGroup);
      const sparks: HallwaySpark[] = [];
      const sparkMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const sparkGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);

      for (let i = 0; i < 14; i++) {
        const sm = new THREE.Mesh(sparkGeo, sparkMat);
        sm.visible = false;
        sparkGroup.add(sm);
        sparks.push({
          mesh: sm,
          vel: new THREE.Vector3(),
          life: 999,
          maxLife: 0.4,
        });
      }

      const triggerSparks = () => {
        for (const s of sparks) {
          s.mesh.visible = true;
          s.mesh.position.set((Math.random() - 0.5) * (w * 0.7), (Math.random() - 0.5) * (h * 0.7), 0.04);
          s.vel.set(
            (Math.random() - 0.5) * 1.8,
            (Math.random() - 0.2) * 1.6,
            (Math.random() - 0.5) * 0.6
          );
          s.life = 0;
          s.maxLife = 0.35 + Math.random() * 0.15;
          s.mesh.scale.setScalar(1.0);
        }
      };

      const interactionNode: InteractionNode = {
        id,
        name: 'Framed Photo',
        position: [x, y, z],
        promptKey: 'E',
        promptVerb: 'Look',
        description: 'Framed wall photograph.',
        interactRadius: 2.8,
      };

      this.group.add(panelGroup);

      return {
        id,
        name: 'Framed Photo',
        group: panelGroup,
        pivot,
        frameMesh,
        photoMesh,
        glowingEdge,
        crookedAngle,
        currentAngle: crookedAngle,
        isAligned: false,
        isAligning: false,
        alignTimer: 0,
        sparkGroup,
        sparks,
        interactionNode,
        triggerSparks,
      };
    };

    // Frame 1: Right wall (X = 1.69, Y = 1.5, Z = 7.5) - Family Under Sun (+14 degrees)
    const p1 = createHallwayPanel(
      'hallway_panel_1',
      1.69,
      1.5,
      7.5,
      -Math.PI / 2,
      14 * (Math.PI / 180),
      0.58,
      0.40,
      0x92400e,
      0xfef08a,
      (p) => {
        // Sun
        const sun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.045), createToonMaterial({ color: 0xfacc15 }));
        sun.position.set(0.18, 0.09, 0.01);
        // Grass Hill
        const grass = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.045), createToonMaterial({ color: 0x4ade80 }));
        grass.position.set(0, -0.10, 0.01);
        // 3 Family Figures
        const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.045), createToonMaterial({ color: 0x3b82f6 }));
        f1.position.set(-0.09, -0.01, 0.012);
        const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.045), createToonMaterial({ color: 0xf43f5e }));
        f2.position.set(0.01, -0.015, 0.012);
        const f3 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.045), createToonMaterial({ color: 0xf97316 }));
        f3.position.set(0.09, -0.03, 0.012);
        p.add(sun, grass, f1, f2, f3);
      }
    );

    // Frame 2: Right wall (X = 1.69, Y = 1.5, Z = 10.0) - House, Tree & Spaceship (-18 degrees, spaced 2.5 units from Frame 1)
    const p2 = createHallwayPanel(
      'hallway_panel_2',
      1.69,
      1.5,
      10.0,
      -Math.PI / 2,
      -18 * (Math.PI / 180),
      0.58,
      0.40,
      0x451a03,
      0x0284c7,
      (p) => {
        // Little House
        const house = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 0.045), createToonMaterial({ color: 0xfef3c7 }));
        house.position.set(-0.16, -0.06, 0.01);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.045), createToonMaterial({ color: 0xef4444 }));
        roof.position.set(-0.16, 0.01, 0.01);
        // Tree
        const tree = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.045), createToonMaterial({ color: 0x16a34a }));
        tree.position.set(-0.02, -0.03, 0.01);
        // Big Crayon Spaceship
        const ship = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), createToonMaterial({ color: 0xf8fafc }));
        ship.rotation.z = -Math.PI / 3;
        ship.position.set(0.14, 0.04, 0.012);
        const flame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.045), createToonMaterial({ color: 0xf97316 }));
        flame.position.set(0.08, 0.01, 0.012);
        p.add(house, roof, tree, ship, flame);
      }
    );

    this.hallwayPanels = [p1, p2];

    // 6. Child's drawing stuck to wall at kid height (Y = 1.15)
    const drawingGroup = new THREE.Group();
    drawingGroup.position.set(-1.69, 1.15, 8.8);
    drawingGroup.rotation.y = Math.PI / 2;
    drawingGroup.rotation.z = -0.04;

    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.015), createToonMaterial({ color: 0xffffff }));
    addInkOutline(paper, 0.015);

    const sunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), createToonMaterial({ color: 0xfacc15 }));
    sunMesh.position.set(0.1, 0.07, 0.005);

    const houseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 0.02), createToonMaterial({ color: 0xef4444 }));
    houseMesh.position.set(-0.06, -0.04, 0.005);

    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.02), createToonMaterial({ color: 0x3b82f6 }));
    roofMesh.position.set(-0.06, 0.03, 0.005);

    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.025), createToonMaterial({ color: 0xef4444, desaturate: 0.05 }));
    tape.position.set(0, 0.13, 0.005);

    drawingGroup.add(paper, sunMesh, houseMesh, roofMesh, tape);
    this.group.add(drawingGroup);
  }

  // OPEN LIVING ROOM (X >= +1.8, Z = [13.5, 19.5])
  private buildLivingRoom() {
    const livingGroup = new THREE.Group();
    livingGroup.position.set(5.0, 0, 16.5);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 6.0),
      createToonMaterial({ color: 0xa86e38, desaturate: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    livingGroup.add(floor);

    // Cozy rug
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 4.2),
      createToonMaterial({ color: 0xfef3c7, desaturate: 0.08 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.2, 0.015, 0);
    rug.receiveShadow = true;
    addInkOutline(rug, 0.02);
    livingGroup.add(rug);

    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });
    const wallFar = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.8, 0.2), wallMat);
    wallFar.position.set(0, 1.9, 3.0);
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 6.0), wallMat);
    wallRight.position.set(3.2, 1.9, 0);
    const wallNear = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.8, 0.2), wallMat);
    wallNear.position.set(0, 1.9, -3.0);
    livingGroup.add(wallFar, wallRight, wallNear);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 6.0),
      createToonMaterial({ color: 0xe6d7c5, desaturate: 0.06 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3.8;
    livingGroup.add(ceiling);

    // Plush Sofa with Cushions & Draped Blanket
    const sofaGroup = new THREE.Group();
    sofaGroup.position.set(1.5, 0, 0);
    sofaGroup.rotation.y = -Math.PI / 2;

    const sofaMat = createToonMaterial({ color: 0x2563eb, desaturate: 0.08 });
    const cushionMat = createToonMaterial({ color: 0xfacc15, desaturate: 0.08 });
    const blanketMat = createToonMaterial({ color: 0xef4444, desaturate: 0.08 });

    const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.9), sofaMat);
    sofaBase.position.y = 0.25;
    sofaBase.castShadow = true;
    addInkOutline(sofaBase, 0.035);

    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.25), sofaMat);
    sofaBack.position.set(0, 0.7, -0.35);
    sofaBack.castShadow = true;
    addInkOutline(sofaBack, 0.035);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.9), sofaMat);
    armL.position.set(-1.2, 0.45, 0);
    addInkOutline(armL, 0.035);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.9), sofaMat);
    armR.position.set(1.2, 0.45, 0);
    addInkOutline(armR, 0.035);

    // Decorative Cushions
    const cush1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.15), cushionMat);
    cush1.position.set(-0.7, 0.62, -0.22);
    cush1.rotation.y = 0.1;
    addInkOutline(cush1, 0.02);

    const cush2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.15), cushionMat);
    cush2.position.set(0.7, 0.62, -0.22);
    cush2.rotation.y = -0.1;
    addInkOutline(cush2, 0.02);

    // Cozily Draped Blanket over armrest
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.85), blanketMat);
    blanket.position.set(1.2, 0.48, 0.02);
    addInkOutline(blanket, 0.02);

    sofaGroup.add(sofaBase, sofaBack, armL, armR, cush1, cush2, blanket);
    livingGroup.add(sofaGroup);

    // Coffee Table with Comic Book & Cup
    const coffeeGroup = new THREE.Group();
    coffeeGroup.position.set(0.3, 0, 0);

    const woodMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.1 });
    const coffeeTableTop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 1.4), woodMat);
    coffeeTableTop.position.y = 0.40;
    coffeeTableTop.castShadow = true;
    addInkOutline(coffeeTableTop, 0.03);
    coffeeGroup.add(coffeeTableTop);

    for (const cx of [-0.34, 0.34]) {
      for (const cz of [-0.62, 0.62]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.05), woodMat);
        leg.position.set(cx, 0.19, cz);
        coffeeGroup.add(leg);
      }
    }

    // Comic Book
    const comicMat = createToonMaterial({ color: 0xef4444, desaturate: 0.02 });
    const comic = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 0.32), comicMat);
    comic.position.set(-0.15, 0.43, -0.2);
    comic.rotation.y = 0.15;
    addInkOutline(comic, 0.015);

    // Cup
    const cupMat = createToonMaterial({ color: 0xf8fafc });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.10, 10), cupMat);
    cup.position.set(0.18, 0.47, 0.25);
    addInkOutline(cup, 0.015);

    coffeeGroup.add(comic, cup);
    livingGroup.add(coffeeGroup);

    // TV Credenza & TV
    const tvGroup = new THREE.Group();
    tvGroup.position.set(-1.8, 0, 0);

    const credenzaMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.12 });
    const credenza = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 2.2), credenzaMat);
    credenza.position.y = 0.35;
    addInkOutline(credenza, 0.035);
    tvGroup.add(credenza);

    const tvScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.1, 1.8),
      createToonMaterial({ color: 0x1e293b, desaturate: 0.1 })
    );
    tvScreen.position.set(0, 1.3, 0);
    addInkOutline(tvScreen, 0.035);

    const tvPicture = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.95),
      createToonMaterial({ color: 0x38bdf8, desaturate: 0.05 })
    );
    tvPicture.position.set(0.06, 1.3, 0);
    tvPicture.rotation.y = Math.PI / 2;
    addInkOutline(tvPicture, 0.025);
    tvGroup.add(tvScreen, tvPicture);

    livingGroup.add(tvGroup);

    // Bookshelf against North Wall (local Z = -2.7)
    const bookshelfGroup = new THREE.Group();
    bookshelfGroup.position.set(1.2, 0, -2.7);

    const shelfFrameMat = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.4), shelfFrameMat);
    shelfBody.position.y = 0.9;
    shelfBody.castShadow = true;
    addInkOutline(shelfBody, 0.03);
    bookshelfGroup.add(shelfBody);

    // Colorful Books on shelves
    const bookColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899];
    for (let sy = 0.4; sy <= 1.4; sy += 0.5) {
      for (let bx = -0.5; bx <= 0.5; bx += 0.12) {
        const color = bookColors[Math.floor(Math.abs(bx * 10 + sy * 5) % bookColors.length)];
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.22), createToonMaterial({ color }));
        book.position.set(bx, sy, 0.02);
        bookshelfGroup.add(book);
      }
    }
    livingGroup.add(bookshelfGroup);

    // Floor Lamp (Emissive Only - NO NEW LIGHTS)
    const lampGroup = new THREE.Group();
    lampGroup.position.set(2.4, 0, -2.4);

    const metalRodMat = createToonMaterial({ color: 0x475569 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.8, 8), metalRodMat);
    rod.position.y = 0.9;
    rod.castShadow = true;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), metalRodMat);
    base.position.y = 0.015;

    const shadeMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.35, 12), shadeMat);
    shade.position.y = 1.85;

    lampGroup.add(rod, base, shade);
    livingGroup.add(lampGroup);

    // Framed Family Photo on South Wall (local Z = +2.9)
    const photoGroup = new THREE.Group();
    photoGroup.position.set(1.8, 2.2, 2.9);
    photoGroup.rotation.y = Math.PI;

    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.04), woodMat);
    addInkOutline(frameMesh, 0.02);
    const photoPic = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.045), createToonMaterial({ color: 0xfacc15, desaturate: 0.05 }));
    photoGroup.add(frameMesh, photoPic);
    livingGroup.add(photoGroup);

    // Toy Basket
    const basketGroup = new THREE.Group();
    basketGroup.position.set(2.2, 0, 2.0);

    const basketMat = createToonMaterial({ color: 0xd97706, desaturate: 0.15 });
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.35, 12), basketMat);
    basket.position.y = 0.175;
    basket.castShadow = true;
    addInkOutline(basket, 0.025);

    const toy1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), createToonMaterial({ color: 0xef4444 }));
    toy1.position.set(-0.08, 0.35, 0.05);
    const toy2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), createToonMaterial({ color: 0x3b82f6 }));
    toy2.position.set(0.08, 0.35, -0.05);

    basketGroup.add(basket, toy1, toy2);
    livingGroup.add(basketGroup);

    this.livingGroup = livingGroup;
    this.sofaGroup = sofaGroup;
    this.coffeeGroup = coffeeGroup;
    this.tvGroup = tvGroup;

    this.group.add(livingGroup);
  }

  // OPEN KITCHEN (X <= -1.8, Z = [13.5, 19.5])
  private buildKitchen() {
    const kitchenGroup = new THREE.Group();
    kitchenGroup.position.set(-5.0, 0, 16.5);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 6.0),
      createToonMaterial({ color: 0xc4905d, desaturate: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    kitchenGroup.add(floor);

    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });
    const wallFar = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.8, 0.2), wallMat);
    wallFar.position.set(0, 1.9, 3.0);
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 6.0), wallMat);
    wallLeft.position.set(-3.2, 1.9, 0);
    const wallNear = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.8, 0.2), wallMat);
    wallNear.position.set(0, 1.9, -3.0);
    kitchenGroup.add(wallFar, wallLeft, wallNear);

    // Kitchen Counter & Top Props
    const counterMat = createToonMaterial({ color: 0xf5ebe1, desaturate: 0.05 });
    const counterBaseMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.12 });

    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 3.8), counterBaseMat);
    counter.position.set(-2.4, 0.425, 0.4);
    counter.castShadow = true;
    addInkOutline(counter, 0.035);

    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 3.9), counterMat);
    counterTop.position.set(-2.4, 0.89, 0.4);
    counterTop.castShadow = true;
    addInkOutline(counterTop, 0.03);
    kitchenGroup.add(counter, counterTop);

    // Toaster on Counter
    const toasterMat = createToonMaterial({ color: 0x94a3b8 });
    const toaster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.32), toasterMat);
    toaster.position.set(-2.3, 1.01, 1.1);
    addInkOutline(toaster, 0.02);
    kitchenGroup.add(toaster);

    // Kettle on Counter
    const kettleMat = createToonMaterial({ color: 0x38bdf8 });
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.20, 10), kettleMat);
    kettle.position.set(-2.3, 1.03, 1.6);
    addInkOutline(kettle, 0.02);
    kitchenGroup.add(kettle);

    // Fruit Bowl on Counter
    const bowlMat = createToonMaterial({ color: 0xffffff });
    const fruitBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.10, 0.08, 12), bowlMat);
    fruitBowl.position.set(-2.3, 0.97, -0.2);
    addInkOutline(fruitBowl, 0.015);

    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), createToonMaterial({ color: 0xef4444 }));
    apple.position.set(-2.3, 1.03, -0.2);
    const orange = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), createToonMaterial({ color: 0xf97316 }));
    orange.position.set(-2.25, 1.03, -0.15);
    kitchenGroup.add(fruitBowl, apple, orange);

    // Kitchen Drawer next to fridge (front face of counter: local z = -1.1, x = -1.82)
    const drawerGroup = new THREE.Group();
    drawerGroup.name = 'kitchen_drawer_prop';
    drawerGroup.position.set(-1.82, 0.65, -1.1);

    const drawerMat = createToonMaterial({ color: 0x92400e, desaturate: 0.1 });
    const drawerFace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.52), drawerMat);
    drawerFace.castShadow = true;
    addInkOutline(drawerFace, 0.02);

    // Brass pull handle
    const handleMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.05 });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16), handleMat);
    handle.rotation.y = Math.PI / 2;
    handle.position.set(0.04, 0, 0);

    drawerGroup.add(drawerFace, handle);
    kitchenGroup.add(drawerGroup);
    this.drawerMesh = drawerGroup;

    // Refrigerator with Magnets & Drawings
    const fridgeMat = createToonMaterial({ color: 0xf8fafc, desaturate: 0.05 });
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.1), fridgeMat);
    fridge.position.set(-2.3, 1.1, -2.1);
    fridge.castShadow = true;
    addInkOutline(fridge, 0.035);
    kitchenGroup.add(fridge);

    // Colorful Magnets on Fridge Door
    const magnetColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b];
    for (let i = 0; i < magnetColors.length; i++) {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.06), createToonMaterial({ color: magnetColors[i] }));
      mag.position.set(-1.69, 1.2 + i * 0.18, -2.3 + (i % 2) * 0.2);
      kitchenGroup.add(mag);
    }

    // Drawing on Fridge
    const fridgeDrawing = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.25, 0.20), createToonMaterial({ color: 0xffffff }));
    fridgeDrawing.position.set(-1.69, 1.5, -2.0);
    const mPin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), createToonMaterial({ color: 0xef4444 }));
    mPin.position.set(-1.68, 1.61, -2.0);
    kitchenGroup.add(fridgeDrawing, mPin);

    // Helper function to create brown beer bottle mesh
    const makeBeerBottle = (isFront: boolean = false) => {
      const bottleGroup = new THREE.Group();
      
      const glassMat = createToonMaterial({ color: 0x5c2c06, desaturate: 0.05 });
      const capMat = createToonMaterial({ color: 0xd97706 });
      const labelMat = createToonMaterial({ color: 0xfef08a });

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 10), glassMat);
      body.position.y = 0.09;
      body.castShadow = true;

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, 0.08, 10), glassMat);
      neck.position.y = 0.22;
      neck.castShadow = true;

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), capMat);
      cap.position.y = 0.27;

      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.08, 10), labelMat);
      label.position.y = 0.09;

      bottleGroup.add(body, neck, cap, label);
      addInkOutline(body, 0.015);

      if (isFront) {
        bottleGroup.name = 'beer_bottle';
        bottleGroup.userData = { tag: 'beer_bottle', id: 'beer_bottle' };
        body.name = 'beer_bottle';
        body.userData = { tag: 'beer_bottle', id: 'beer_bottle' };
      }
      return bottleGroup;
    };

    // Tall Wall Shelf above Refrigerator Area (about 2.4 units high, just out of Zane's reach)
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-2.3, 2.4, -2.1);

    const shelfMat = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const shelfBoard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.38), shelfMat);
    shelfBoard.castShadow = true;
    addInkOutline(shelfBoard, 0.02);
    shelfGroup.add(shelfBoard);

    for (const bx of [-0.45, 0.45]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.25), shelfMat);
      bracket.position.set(bx, -0.1, -0.05);
      shelfGroup.add(bracket);
    }

    // Row of 6 brown beer bottles with 5 along back row and 1 at front edge
    for (let i = 0; i < 5; i++) {
      const b = makeBeerBottle(false);
      b.position.set(-0.44 + i * 0.22, 0.03, -0.08);
      shelfGroup.add(b);
    }
    const frontBottle = makeBeerBottle(true);
    frontBottle.position.set(0.0, 0.03, 0.12);
    shelfGroup.add(frontBottle);
    this.beerBottleMesh = frontBottle;

    kitchenGroup.add(shelfGroup);

    // Pushed-in Wooden Chair near Refrigerator (tagged quest_chair)
    const questChair = new THREE.Group();
    questChair.name = 'quest_chair';
    questChair.userData = { tag: 'quest_chair', id: 'quest_chair' };
    questChair.position.set(-1.65, 0, -2.0);
    questChair.rotation.y = -Math.PI / 6;
    this.questChairMesh = questChair;

    const qChairMat = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const qSeat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), qChairMat);
    qSeat.position.y = 0.42;
    qSeat.name = 'quest_chair';
    qSeat.userData = { tag: 'quest_chair', id: 'quest_chair' };
    qSeat.castShadow = true;
    addInkOutline(qSeat, 0.02);

    const qBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.04), qChairMat);
    qBack.position.set(0, 0.65, -0.19);
    qBack.name = 'quest_chair';
    qBack.userData = { tag: 'quest_chair', id: 'quest_chair' };
    qBack.castShadow = true;
    addInkOutline(qBack, 0.02);

    for (const lx of [-0.18, 0.18]) {
      for (const lz of [-0.18, 0.18]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.40, 0.04), qChairMat);
        leg.position.set(lx, 0.20, lz);
        leg.name = 'quest_chair';
        leg.userData = { tag: 'quest_chair', id: 'quest_chair' };
        questChair.add(leg);
      }
    }
    questChair.add(qSeat, qBack);
    kitchenGroup.add(questChair);

    // Counter with a few empty beer bottles
    const emptyBottle1 = makeBeerBottle(false);
    emptyBottle1.position.set(-2.35, 0.93, 0.1);
    emptyBottle1.rotation.y = 0.5;

    const emptyBottle2 = makeBeerBottle(false);
    emptyBottle2.position.set(-2.45, 0.93, 0.35);

    const emptyBottle3 = makeBeerBottle(false);
    emptyBottle3.position.set(-2.25, 0.97, 0.65);
    emptyBottle3.rotation.z = Math.PI / 2;

    kitchenGroup.add(emptyBottle1, emptyBottle2, emptyBottle3);

    // Bottle cap on floor
    const bottleCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.01, 12),
      createToonMaterial({ color: 0xd97706 })
    );
    bottleCap.position.set(-2.0, 0.005, -1.5);
    addInkOutline(bottleCap, 0.01);
    kitchenGroup.add(bottleCap);

    // Kitchen Table & Chairs
    const tableGroup = new THREE.Group();
    tableGroup.position.set(0.0, 0, -1.2);

    const woodMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.1 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 1.6), woodMat);
    tableTop.position.y = 0.75;
    tableTop.castShadow = true;
    addInkOutline(tableTop, 0.03);
    tableGroup.add(tableTop);

    for (const tx of [-0.52, 0.52]) {
      for (const tz of [-0.72, 0.72]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), woodMat);
        leg.position.set(tx, 0.36, tz);
        tableGroup.add(leg);
      }
    }

    // Cereal Box & Breakfast Plates on Table
    const cerealBox = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.24, 0.16), createToonMaterial({ color: 0xfacc15, desaturate: 0.02 }));
    cerealBox.position.set(-0.2, 0.90, -0.2);
    cerealBox.rotation.y = 0.2;
    addInkOutline(cerealBox, 0.02);

    const plate1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 12), createToonMaterial({ color: 0xffffff }));
    plate1.position.set(0.2, 0.79, -0.3);
    const plate2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 12), createToonMaterial({ color: 0xffffff }));
    plate2.position.set(0.2, 0.79, 0.3);

    tableGroup.add(cerealBox, plate1, plate2);

    // 4 Wooden Chairs around Table
    const chairMat = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const chairPositions: [number, number, number, number][] = [
      [-0.75, 0, 0, -Math.PI / 2],
      [0.75, 0, 0, Math.PI / 2],
      [0, 0, -0.9, 0],
      [0, 0, 0.9, Math.PI],
    ];

    for (const [cx, cy, cz, rotY] of chairPositions) {
      const chair = new THREE.Group();
      chair.position.set(cx, cy, cz);
      chair.rotation.y = rotY;

      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), chairMat);
      seat.position.y = 0.42;
      seat.castShadow = true;
      addInkOutline(seat, 0.02);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.04), chairMat);
      back.position.set(0, 0.65, -0.19);
      back.castShadow = true;
      addInkOutline(back, 0.02);

      for (const lx of [-0.18, 0.18]) {
        for (const lz of [-0.18, 0.18]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.40, 0.04), chairMat);
          leg.position.set(lx, 0.20, lz);
          chair.add(leg);
        }
      }
      chair.add(seat, back);
      tableGroup.add(chair);
    }

    kitchenGroup.add(tableGroup);

    // Wall Calendar on North Wall
    const calGroup = new THREE.Group();
    calGroup.position.set(0.0, 2.2, -2.9);

    const calPaper = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.02), createToonMaterial({ color: 0xffffff }));
    addInkOutline(calPaper, 0.02);
    const calHeader = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.025), createToonMaterial({ color: 0xef4444 }));
    calHeader.position.y = 0.215;

    calGroup.add(calPaper, calHeader);
    kitchenGroup.add(calGroup);

    this.group.add(kitchenGroup);
  }

  private setupLighting() {
    // Local warm accent light for living room couch area
    const livingLamp = new THREE.PointLight(0xffd166, 0.8, 12.0, 2);
    livingLamp.position.set(5.0, 2.2, 16.5);

    // Local warm accent light for kitchen counter area
    const kitchenLamp = new THREE.PointLight(0xfef08a, 0.8, 12.0, 2);
    kitchenLamp.position.set(-5.0, 2.2, 16.5);

    this.group.add(livingLamp, kitchenLamp);
  }

  public update(delta: number) {
    this.totalTime += delta;
    this.updatePanels(delta);

    // Update cyber atmosphere shaders
    for (const mat of this.cyberAtmosphereMats) {
      if (mat.uniforms.uTime) {
        mat.uniforms.uTime.value = this.totalTime;
      }
    }

    // Update cyber dust field
    if (this.cyberDustField) {
      const prog = this.isImaginationActive ? 1.0 : (this.cyberAtmosphereMats[0]?.uniforms?.uProgress?.value ?? 0.0);
      this.cyberDustField.update(delta, prog, this.totalTime);
    }

    // Update drifting ash particles in hallway when active
    if (this.ashSparksGroup.visible) {
      for (const spark of this.ashSparks) {
        spark.mesh.position.addScaledVector(spark.vel, delta);
        spark.mesh.rotation.y += spark.rotSpeed * delta;
        spark.mesh.rotation.z += spark.rotSpeed * 0.5 * delta;

        if (spark.mesh.position.y > 3.6) {
          spark.mesh.position.y = 0.2;
          spark.mesh.position.x = (Math.random() - 0.5) * 2.6;
        }
      }
    }

    // Update distant red laser streaks
    if (this.laserStreakGroup.visible) {
      for (const laser of this.laserStreaks) {
        laser.timer -= delta;
        if (laser.timer <= 0) {
          laser.timer = 2.4 + Math.random() * 2.0;
          laser.active = true;
          laser.mesh.position.x = -12.0;
        }
        if (laser.active) {
          laser.mesh.position.x += laser.speed * delta;
          if (laser.mesh.position.x > 12.0) {
            laser.active = false;
          }
        }
      }
    }
  }

  private setupInteractionNodes() {
    this.interactionNodes = [
      {
        id: 'house_tv',
        name: 'Living Room TV',
        position: [6.8, 1.4, 16.5],
        promptKey: 'E',
        promptVerb: 'Watch TV',
        description: 'Cozy living room television showing morning cartoons and news.',
        interactRadius: 2.8,
      },
      {
        id: 'house_kitchen',
        name: 'Kitchen Counter',
        position: [-6.8, 1.2, 16.5],
        promptKey: 'E',
        promptVerb: 'Inspect',
        description: 'Clean kitchen counter with fresh fruit and toaster.',
        interactRadius: 2.6,
      },
      {
        id: 'kitchen_drawer',
        name: 'Kitchen Drawer',
        position: [-6.75, 0.85, 15.4],
        promptKey: 'E',
        promptVerb: 'Open',
        description: 'Kitchen drawer next to the fridge.',
        interactRadius: 2.8,
      },
      ...this.hallwayPanels.map((p) => p.interactionNode),
    ];
  }

  private buildColliders() {
    this.colliders = [
      // Hallway Left Walls
      { id: 'house_wall_hall_left_1', name: 'Hallway Left Wall 1', minX: -1.95, maxX: -1.65, minZ: 4.5, maxZ: 6.85, height: 3.5 },
      { id: 'house_wall_hall_left_2', name: 'Hallway Left Wall 2', minX: -1.95, maxX: -1.65, minZ: 8.15, maxZ: 13.5, height: 3.5 },

      // Hallway Right Walls
      { id: 'house_wall_hall_right_1', name: 'Hallway Right Wall 1', minX: 1.65, maxX: 1.95, minZ: 4.5, maxZ: 10.35, height: 3.5 },
      { id: 'house_wall_hall_right_2', name: 'Hallway Right Wall 2', minX: 1.65, maxX: 1.95, minZ: 11.65, maxZ: 13.5, height: 3.5 },

      // Restroom Door Wall
      { id: 'house_wall_restroom_l', name: 'Restroom Wall Left', minX: -1.9, maxX: -0.65, minZ: 19.35, maxZ: 19.65, height: 3.5 },
      { id: 'house_wall_restroom_r', name: 'Restroom Wall Right', minX: 0.65, maxX: 1.9, minZ: 19.35, maxZ: 19.65, height: 3.5 },

      // Hallway Props Colliders (coat rack, shoe rack, side table)
      { id: 'house_coat_rack', name: 'Coat Rack', minX: 1.15, maxX: 1.65, minZ: 5.25, maxZ: 5.75, height: 1.8 },
      { id: 'house_shoe_rack', name: 'Shoe Rack', minX: 1.25, maxX: 1.65, minZ: 6.05, maxZ: 6.95, height: 0.5 },
      { id: 'house_side_table', name: 'Side Table', minX: -1.70, maxX: -1.20, minZ: 9.05, maxZ: 9.95, height: 1.0 },

      // Living Room
      { id: 'house_wall_lr_far', name: 'Living Room Far Wall', minX: 1.8, maxX: 8.35, minZ: 19.35, maxZ: 19.65, height: 3.5 },
      { id: 'house_wall_lr_near', name: 'Living Room Near Wall', minX: 1.8, maxX: 8.35, minZ: 13.35, maxZ: 13.65, height: 3.5 },
      { id: 'house_wall_lr_right', name: 'Living Room Right Wall', minX: 8.05, maxX: 8.35, minZ: 13.35, maxZ: 19.65, height: 3.5 },
      { id: 'house_sofa', name: 'Living Room Sofa', minX: 6.0, maxX: 7.1, minZ: 15.1, maxZ: 17.9, height: 1.1 },
      { id: 'house_coffee_table', name: 'Coffee Table', minX: 4.8, maxX: 5.8, minZ: 15.7, maxZ: 17.3, height: 0.5 },
      { id: 'house_tv_stand', name: 'TV Stand', minX: 2.8, maxX: 3.6, minZ: 15.3, maxZ: 17.7, height: 1.5 },
      { id: 'house_bookshelf', name: 'Bookshelf', minX: 5.5, maxX: 6.9, minZ: 13.4, maxZ: 14.2, height: 1.8 },

      // Kitchen
      { id: 'house_wall_kt_far', name: 'Kitchen Far Wall', minX: -8.35, maxX: -1.8, minZ: 19.35, maxZ: 19.65, height: 3.5 },
      { id: 'house_wall_kt_near', name: 'Kitchen Near Wall', minX: -8.35, maxX: -1.8, minZ: 13.35, maxZ: 13.65, height: 3.5 },
      { id: 'house_wall_kt_left', name: 'Kitchen Left Wall', minX: -8.35, maxX: -8.05, minZ: 13.35, maxZ: 19.65, height: 3.5 },
      { id: 'house_kitchen_counter', name: 'Kitchen Counter', minX: -8.15, maxX: -6.85, minZ: 14.85, maxZ: 19.15, height: 1.1 },
      { id: 'house_fridge', name: 'Family Refrigerator', minX: -8.05, maxX: -6.75, minZ: 13.65, maxZ: 14.95, height: 2.2 },
      { id: 'house_kitchen_table', name: 'Kitchen Table & Chairs', minX: -5.8, maxX: -4.2, minZ: 14.2, maxZ: 16.4, height: 0.9 },
      { id: 'house_beer_shelf', name: 'Wall Beer Shelf', minX: -7.9, maxX: -6.7, minZ: 14.2, maxZ: 14.6, height: 2.5 },
      { id: 'house_quest_chair', name: 'Kitchen Wooden Chair', minX: -6.85, maxX: -6.45, minZ: 14.3, maxZ: 14.7, height: 0.9 },
    ];
  }

  /**
   * Computes explicit living room anchors directly from actual sofa and TV mesh positions.
   * Requirement 1:
   * - sofaSeatAnchor: world position and facing direction where Dad's hips rest on the sofa seat, facing the TV
   * - sofaApproachPoint: point on the floor 1.2 units in front of the sofa, on the side away from the TV stand and coffee table
   * - tvStandCollider: the TV and its stand collider computed from mesh bounds
   */
  public computeLivingRoomAnchors(seatOffset?: { x: number; y: number; z: number; rotY: number }): LivingRoomAnchors {
    this.group.updateMatrixWorld(true);

    const sofaWorldPos = new THREE.Vector3();
    const tvWorldPos = new THREE.Vector3();
    const coffeeWorldPos = new THREE.Vector3();

    if (this.sofaGroup) {
      this.sofaGroup.getWorldPosition(sofaWorldPos);
    } else {
      sofaWorldPos.set(6.5, 0, 16.5);
    }

    if (this.tvGroup) {
      this.tvGroup.getWorldPosition(tvWorldPos);
    } else {
      tvWorldPos.set(3.2, 0, 16.5);
    }

    if (this.coffeeGroup) {
      this.coffeeGroup.getWorldPosition(coffeeWorldPos);
    } else {
      coffeeWorldPos.set(5.3, 0, 16.5);
    }

    const sofaBox = this.sofaGroup
      ? new THREE.Box3().setFromObject(this.sofaGroup)
      : new THREE.Box3(new THREE.Vector3(6.0, 0, 15.1), new THREE.Vector3(7.1, 1.1, 17.9));
    const tvBox = this.tvGroup
      ? new THREE.Box3().setFromObject(this.tvGroup)
      : new THREE.Box3(new THREE.Vector3(2.8, 0, 15.3), new THREE.Vector3(3.6, 1.85, 17.7));
    const coffeeBox = this.coffeeGroup
      ? new THREE.Box3().setFromObject(this.coffeeGroup)
      : new THREE.Box3(new THREE.Vector3(4.85, 0, 15.75), new THREE.Vector3(5.75, 0.5, 17.25));

    // 1. tvStandCollider: Computed from actual TV and its stand mesh bounds
    const tvStandCollider: BoxCollider2D = {
      id: 'house_tv_stand',
      name: 'TV Stand',
      minX: tvBox.min.x,
      maxX: tvBox.max.x,
      minZ: tvBox.min.z,
      maxZ: tvBox.max.z,
      height: Math.max(1.5, tvBox.max.y - tvBox.min.y),
    };

    // Keep existing colliders list synced with computed TV stand bounds
    const existingTvCol = this.colliders.find((c) => c.id === 'house_tv_stand');
    if (existingTvCol) {
      existingTvCol.minX = tvStandCollider.minX;
      existingTvCol.maxX = tvStandCollider.maxX;
      existingTvCol.minZ = tvStandCollider.minZ;
      existingTvCol.maxZ = tvStandCollider.maxZ;
      existingTvCol.height = tvStandCollider.height;
    }

    const coffeeTableCollider: BoxCollider2D = {
      id: 'house_coffee_table',
      name: 'Coffee Table',
      minX: coffeeBox.min.x,
      maxX: coffeeBox.max.x,
      minZ: coffeeBox.min.z,
      maxZ: coffeeBox.max.z,
      height: Math.max(0.5, coffeeBox.max.y - coffeeBox.min.y),
    };

    const sofaCollider: BoxCollider2D = {
      id: 'house_sofa',
      name: 'Living Room Sofa',
      minX: sofaBox.min.x,
      maxX: sofaBox.max.x,
      minZ: sofaBox.min.z,
      maxZ: sofaBox.max.z,
      height: Math.max(1.1, sofaBox.max.y - sofaBox.min.y),
    };

    // 2. sofaSeatAnchor: World position and facing direction where Dad's hips rest on the sofa seat, facing the TV
    const dirToTv = new THREE.Vector3(tvWorldPos.x - sofaWorldPos.x, 0, tvWorldPos.z - sofaWorldPos.z).normalize();
    const baseFacingRotY = Math.atan2(dirToTv.x, dirToTv.z); // Facing TV (-Math.PI / 2)

    const ox = seatOffset?.x ?? 0;
    const oy = seatOffset?.y ?? 0;
    const oz = seatOffset?.z ?? 0;
    const orot = seatOffset?.rotY ?? 0;

    // Dad's hips on the cushion with back resting against sofa back:
    // Sofa back is at local -0.35 (world X = 6.85). Sofa center is 6.5. Seat cushion center is ~6.45.
    const seatPos = new THREE.Vector3(
      sofaWorldPos.x - 0.05 + ox,
      0 + oy,
      sofaWorldPos.z + oz
    );
    const seatRotY = baseFacingRotY + orot;

    const sofaSeatAnchor = {
      position: seatPos,
      rotationY: seatRotY,
      facingDir: dirToTv,
    };

    // 3. sofaApproachPoint: A point on the floor 1.2 units in front of the sofa,
    // on the side away from the TV stand and coffee table.
    // 1.2 units in front of sofa (facing direction dirToTv = -X):
    const distInFront = 1.2;
    const approachX = (sofaWorldPos.x - 0.05) + dirToTv.x * distInFront; // ~ 5.25

    // Side away from TV stand and coffee table (South side):
    // TV stand extends to tvBox.max.z (~17.7), coffee table to coffeeBox.max.z (~17.25).
    // Stay at least 0.8 units clear of both colliders:
    const minClearance = 0.8;
    const approachZ = Math.max(tvBox.max.z + minClearance, coffeeBox.max.z + minClearance); // ~ 18.5

    const sofaApproachPoint = new THREE.Vector3(approachX, 0, approachZ);

    return {
      sofaSeatAnchor,
      sofaApproachPoint,
      tvStandCollider,
      coffeeTableCollider,
      sofaCollider,
    };
  }
}
