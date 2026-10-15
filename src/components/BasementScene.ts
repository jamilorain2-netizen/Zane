import * as THREE from 'three';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { BoxCollider2D } from '../utils/collision';
import { InteractionNode } from '../types/game';

export class BasementScene {
  public group: THREE.Group;
  public stairsGroup: THREE.Group;
  public stepMeshes: THREE.Mesh[] = [];
  public colliders: BoxCollider2D[] = [];
  public interactionNodes: InteractionNode[] = [];
  public wrenchMesh: THREE.Group | null = null;
  public flashlightMesh: THREE.Group | null = null;
  public hasFlashlight: boolean = false;
  public revealObjects: THREE.Object3D[] = [];

  public photoMesh: THREE.Mesh | null = null;
  public toyMesh: THREE.Group | null = null;
  public ceilingLight1: THREE.PointLight | null = null;
  public ceilingLight2: THREE.PointLight | null = null;
  public isImaginationMode: boolean = false;

  public hideWrench() {
    if (this.wrenchMesh) {
      this.wrenchMesh.visible = false;
    }
    this.interactionNodes = this.interactionNodes.filter((n) => n.id !== 'basement_wrench');
  }

  public revealWrench() {
    if (this.wrenchMesh) {
      this.wrenchMesh.visible = true;
    }
    if (!this.interactionNodes.some((n) => n.id === 'basement_wrench')) {
      this.interactionNodes.push({
        id: 'basement_wrench',
        name: this.isImaginationMode ? 'Plasma wrench' : "Dad's Wrench",
        position: [16.5, -2.25, 14.5],
        promptKey: 'E',
        promptVerb: 'Take',
        description: "Heavy steel mechanic's wrench from Dad's workbench in the lower basement.",
        interactRadius: 2.8,
      });
    }
  }

  public setCeilingLights(powerT: number, flickerMultiplier: number = 1.0) {
    const intensity1 = 1.8 * powerT * flickerMultiplier;
    const intensity2 = 1.2 * powerT * flickerMultiplier;
    if (this.ceilingLight1) this.ceilingLight1.intensity = intensity1;
    if (this.ceilingLight2) this.ceilingLight2.intensity = intensity2;
  }

  public pickupFlashlight() {
    // Flashlight mechanic removed
  }

  public openSpecialBox() {
    if (this.photoMesh) this.photoMesh.visible = true;
    if (this.toyMesh) this.toyMesh.visible = true;
  }

  public setImagination(active: boolean) {
    this.isImaginationMode = active;
    this.interactionNodes.forEach((node) => {
      if (node.id === 'basement_wrench') {
        node.name = active ? 'Plasma wrench' : "Dad's Wrench";
      }
    });
  }

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'BasementSceneGroup';
    this.stairsGroup = new THREE.Group();
    this.stairsGroup.name = 'BasementStairsGroup';

    this.buildBasement();
    this.setupInteractionNodes();
    this.buildColliders();
    this.logStairsDebug();
  }

  public logStairsDebug() {
    const stairBox = new THREE.Box3().setFromObject(this.stairsGroup);
    const stairWorldPos = new THREE.Vector3();
    this.stairsGroup.getWorldPosition(stairWorldPos);

    console.log('[Basement Stairs Debug]', {
      exists: !!this.stairsGroup,
      visible: this.stairsGroup.visible,
      worldPosition: stairWorldPos.toArray(),
      childCount: this.stairsGroup.children.length,
      stepMeshCount: this.stepMeshes.length,
      boundingBox: {
        min: stairBox.min.toArray(),
        max: stairBox.max.toArray(),
      },
    });
  }

  private buildBasement() {
    // Ensure all materials use side: THREE.DoubleSide
    const concreteFloorMat = createToonMaterial({ color: 0x334155, desaturate: 0.15 });
    concreteFloorMat.side = THREE.DoubleSide;

    const concreteWallMat = createToonMaterial({ color: 0x1e293b, desaturate: 0.2 });
    concreteWallMat.side = THREE.DoubleSide;

    const ceilingMat = createToonMaterial({ color: 0x18202f, desaturate: 0.1 });
    ceilingMat.side = THREE.DoubleSide;

    const darkStoneMat = createToonMaterial({ color: 0x0f172a, desaturate: 0.15 });
    darkStoneMat.side = THREE.DoubleSide;

    const woodMat = createToonMaterial({ color: 0x78350f, desaturate: 0.12 });
    woodMat.side = THREE.DoubleSide;

    const darkWoodMat = createToonMaterial({ color: 0x3b2416, desaturate: 0.15 });
    darkWoodMat.side = THREE.DoubleSide;

    const shelfMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.1 });
    shelfMat.side = THREE.DoubleSide;

    const boxMat = createToonMaterial({ color: 0xd97706, desaturate: 0.12 });
    const steelMat = createToonMaterial({ color: 0x475569, desaturate: 0.1 });
    steelMat.side = THREE.DoubleSide;

    // =========================================================================
    // 1. COMPLETELY ENCLOSED BASEMENT MAIN ROOM (X: 6.0 to 17.0, Z: 6.5 to 15.5)
    // Floor at y = -3.2, Ceiling at y = 0.0. Full height 3.2 units with NO GAPS.
    // =========================================================================

    // Solid concrete floor slab + floor plane (DoubleSide dark concrete)
    const floorSlab = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.4, 9.4), concreteFloorMat);
    floorSlab.position.set(11.5, -3.4, 11.0);
    floorSlab.receiveShadow = true;
    floorSlab.frustumCulled = false;
    this.group.add(floorSlab);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 9.2), concreteFloorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(11.5, -3.2, 11.0);
    floor.receiveShadow = true;
    floor.frustumCulled = false;
    this.group.add(floor);

    // Full Ceiling over main room (DoubleSide, completely blocks upstairs visibility)
    const ceilingSlab = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.3, 9.4), ceilingMat);
    ceilingSlab.position.set(11.5, 0.05, 11.0);
    ceilingSlab.receiveShadow = true;
    ceilingSlab.frustumCulled = false;
    this.group.add(ceilingSlab);

    const innerCeiling = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 9.2), ceilingMat);
    innerCeiling.rotation.x = Math.PI / 2;
    innerCeiling.position.set(11.5, -0.1, 11.0);
    innerCeiling.receiveShadow = true;
    innerCeiling.frustumCulled = false;
    this.group.add(innerCeiling);

    // Four Full-Height Concrete Walls (Height 3.4, from y = -3.3 to y = 0.1)
    // East / Back Wall (X = 17.05)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 9.4), concreteWallMat);
    backWall.position.set(17.05, -1.6, 11.0);
    backWall.receiveShadow = true;
    backWall.frustumCulled = false;
    this.group.add(backWall);

    // North Wall (Z = 6.45)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(11.4, 3.4, 0.35), concreteWallMat);
    northWall.position.set(11.5, -1.6, 6.45);
    northWall.receiveShadow = true;
    northWall.frustumCulled = false;
    this.group.add(northWall);

    // South Wall (Z = 15.55)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(11.4, 3.4, 0.35), concreteWallMat);
    southWall.position.set(11.5, -1.6, 15.55);
    southWall.receiveShadow = true;
    southWall.frustumCulled = false;
    this.group.add(southWall);

    // West / Front Wall (at X = 5.95) connecting seamlessly with stairwell at Z = 10.225 to 11.775
    // North section of West Wall: Z = 6.45 to 10.225 (length 3.775)
    const frontWallNorth = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 3.8), concreteWallMat);
    frontWallNorth.position.set(5.95, -1.6, 8.325);
    frontWallNorth.receiveShadow = true;
    frontWallNorth.frustumCulled = false;

    // South section of West Wall: Z = 11.775 to 15.55 (length 3.775)
    const frontWallSouth = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 3.8), concreteWallMat);
    frontWallSouth.position.set(5.95, -1.6, 13.675);
    frontWallSouth.receiveShadow = true;
    frontWallSouth.frustumCulled = false;

    // Header beam / Lintel above stair entry at X = 5.95 (spans Z: 10.2 to 11.8, Y: -1.2 to 0.1)
    const frontWallHeader = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.3, 1.65), concreteWallMat);
    frontWallHeader.position.set(5.95, -0.55, 11.0);
    frontWallHeader.receiveShadow = true;
    frontWallHeader.frustumCulled = false;

    this.group.add(frontWallNorth, frontWallSouth, frontWallHeader);

    // =========================================================================
    // 2. STAIRCASE & COMPLETELY ENCLOSED STAIRWELL (X: 1.7 to 6.0, Z: 10.15 to 11.85)
    // Closed on all sides and ceiling; only opening is the mouth at the top landing.
    // =========================================================================
    this.stepMeshes = [];
    const stepDepth = 0.30;
    const stepHeight = 3.2 / 14;

    for (let i = 0; i < 14; i++) {
      const stepGeo = new THREE.BoxGeometry(stepDepth, stepHeight + 0.01, 1.4);
      const step = new THREE.Mesh(stepGeo, woodMat);
      const stepX = 1.8 + (i + 0.5) * stepDepth;
      const stepY = -i * stepHeight - stepHeight / 2;
      step.position.set(stepX, stepY, 11.0);
      step.castShadow = true;
      step.receiveShadow = true;
      step.frustumCulled = false;
      addInkOutline(step, 0.025);

      this.stepMeshes.push(step);
      this.stairsGroup.add(step);
    }

    // Solid concrete slab foundation under the stairs (X: 1.7 to 6.1, Y = -3.4)
    const stairFloorSlab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 1.85), concreteFloorMat);
    stairFloorSlab.position.set(3.9, -3.4, 11.0);
    stairFloorSlab.receiveShadow = true;
    stairFloorSlab.frustumCulled = false;
    this.stairsGroup.add(stairFloorSlab);

    // Landing at the top behind the door (X: 1.75 to 2.4, Y = 0, Z: 10.25 to 11.75)
    const topLandingGeo = new THREE.BoxGeometry(0.65, 0.1, 1.55);
    const topLanding = new THREE.Mesh(topLandingGeo, concreteFloorMat);
    topLanding.position.set(2.075, -0.05, 11.0);
    topLanding.receiveShadow = true;
    topLanding.frustumCulled = false;
    this.stairsGroup.add(topLanding);

    // --- FULL-HEIGHT STAIRWELL SIDE WALLS (From Y = -3.4 all the way to Y = 2.45) ---
    // North Stairwell Wall (Z = 10.15): Lower Section (Y: -3.4 to 0.1) & Upper Section (Y: 0.0 to 2.45)
    const stairWallNorthLower = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.5, 0.25), concreteWallMat);
    stairWallNorthLower.position.set(3.9, -1.65, 10.15);
    stairWallNorthLower.receiveShadow = true;
    stairWallNorthLower.frustumCulled = false;

    const stairWallNorthUpper = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.45, 0.25), concreteWallMat);
    stairWallNorthUpper.position.set(3.9, 1.225, 10.15);
    stairWallNorthUpper.receiveShadow = true;
    stairWallNorthUpper.frustumCulled = false;

    // South Stairwell Wall (Z = 11.85): Lower Section (Y: -3.4 to 0.1) & Upper Section (Y: 0.0 to 2.45)
    const stairWallSouthLower = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.5, 0.25), concreteWallMat);
    stairWallSouthLower.position.set(3.9, -1.65, 11.85);
    stairWallSouthLower.receiveShadow = true;
    stairWallSouthLower.frustumCulled = false;

    const stairWallSouthUpper = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.45, 0.25), concreteWallMat);
    stairWallSouthUpper.position.set(3.9, 1.225, 11.85);
    stairWallSouthUpper.receiveShadow = true;
    stairWallSouthUpper.frustumCulled = false;

    // --- BACK WALL UNDER & AROUND THE TOP THRESHOLD (X = 1.725) ---
    // Lower back wall under the landing (from y = -3.4 to y = 0.0)
    const stairBackWallLower = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 1.8), concreteWallMat);
    stairBackWallLower.position.set(1.725, -1.7, 11.0);
    stairBackWallLower.receiveShadow = true;
    stairBackWallLower.frustumCulled = false;

    // Upper back wall framing the door mouth (X = 1.725, doorway is Z: 10.35 to 11.65, Y: 0 to 2.15)
    // North side jamb (Z: 10.0 to 10.35, Y: 0 to 2.45)
    const stairBackJambNorth = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.45, 0.35), concreteWallMat);
    stairBackJambNorth.position.set(1.725, 1.225, 10.175);
    stairBackJambNorth.receiveShadow = true;
    stairBackJambNorth.frustumCulled = false;

    // South side jamb (Z: 11.65 to 12.0, Y: 0 to 2.45)
    const stairBackJambSouth = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.45, 0.35), concreteWallMat);
    stairBackJambSouth.position.set(1.725, 1.225, 11.825);
    stairBackJambSouth.receiveShadow = true;
    stairBackJambSouth.frustumCulled = false;

    // Lintel wall header above door mouth (X = 1.725, Y: 2.15 to 2.45, Z: 10.15 to 11.85)
    const stairBackLintel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 1.75), concreteWallMat);
    stairBackLintel.position.set(1.725, 2.325, 11.0);
    stairBackLintel.receiveShadow = true;
    stairBackLintel.frustumCulled = false;

    this.stairsGroup.add(
      stairWallNorthLower, stairWallNorthUpper,
      stairWallSouthLower, stairWallSouthUpper,
      stairBackWallLower, stairBackJambNorth, stairBackJambSouth, stairBackLintel
    );

    // --- FULL CEILINGS OVER THE ENTIRE STAIRWELL ---
    // 1. Ceiling over the top landing (X: 1.7 to 2.45, Y = 2.45)
    const topLandingCeiling = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.25, 1.8), ceilingMat);
    topLandingCeiling.position.set(2.075, 2.45, 11.0);
    topLandingCeiling.receiveShadow = true;
    topLandingCeiling.frustumCulled = false;

    // 2. Sloping interior ceiling following the stairs descent (from X: 2.4, Y: 2.4 down to X: 6.0, Y: 0.05)
    const stairSlopeCeiling = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.22, 1.7), ceilingMat);
    stairSlopeCeiling.position.set(4.2, 1.2, 11.0);
    stairSlopeCeiling.rotation.z = -Math.atan2(2.35, 3.6);
    stairSlopeCeiling.receiveShadow = true;
    stairSlopeCeiling.frustumCulled = false;

    // 3. Flat upper roof slab over the entire stairwell (Y = 2.5, X: 1.7 to 6.1)
    const stairUpperRoof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 1.85), ceilingMat);
    stairUpperRoof.position.set(3.9, 2.5, 11.0);
    stairUpperRoof.receiveShadow = true;
    stairUpperRoof.frustumCulled = false;

    // 4. Bulkhead wall at X = 5.95 closing vertical transition from stairwell roof (Y = 2.5) down to basement room ceiling (Y = 0.05)
    const stairUpperBulkhead = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.45, 1.8), concreteWallMat);
    stairUpperBulkhead.position.set(6.0, 1.25, 11.0);
    stairUpperBulkhead.receiveShadow = true;
    stairUpperBulkhead.frustumCulled = false;

    this.stairsGroup.add(topLandingCeiling, stairSlopeCeiling, stairUpperRoof, stairUpperBulkhead);

    // Handrail along south wall
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.5, 8), woodMat);
    rail.rotation.z = Math.atan2(3.2, 4.2);
    rail.position.set(3.9, -0.9, 11.62);
    rail.frustumCulled = false;
    this.stairsGroup.add(rail);

    // Dressing: Exposed pipes along North wall
    const pipeMat = createToonMaterial({ color: 0x475569, desaturate: 0.1 });
    pipeMat.side = THREE.DoubleSide;
    const pipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8);
    const pipe1 = new THREE.Mesh(pipeGeo, pipeMat);
    pipe1.rotation.z = Math.PI / 2;
    pipe1.position.set(3.9, -0.6, 10.28);
    pipe1.frustumCulled = false;
    const pipe2 = pipe1.clone();
    pipe2.position.set(3.9, -0.8, 10.28);
    this.stairsGroup.add(pipe1, pipe2);

    // Ceiling point light over stairs (initialized at 0 intensity, lerped up on power restore - no fixture mesh)
    const stairLight = new THREE.PointLight(0xfef08a, 0, 10.0, 1.4);
    stairLight.position.set(3.9, -0.9, 11.0);
    this.stairsGroup.add(stairLight);
    this.ceilingLight2 = stairLight;

    // Landing at the bottom of the stairs (X: 6.0 to 7.5, Y = -3.20, Z = 11.0)
    const landingGeo = new THREE.BoxGeometry(1.5, 0.1, 2.5);
    const landing = new THREE.Mesh(landingGeo, concreteFloorMat);
    landing.position.set(6.75, -3.15, 11.0);
    landing.receiveShadow = true;
    landing.frustumCulled = false;
    this.stairsGroup.add(landing);

    // Add stairsGroup directly to basement group
    this.group.add(this.stairsGroup);

    // =========================================================================
    // 3. ARCHITECTURAL DARK ALCOVES & PROPER WALL SECTIONS (WEST WALL)
    // Anchored firmly between floor (Y = -3.2) and ceiling (Y = 0.0)
    // =========================================================================

    // North Alcove (Storage Alcove at X = 6.0, Z = 8.5)
    const alcoveNorthFrame = new THREE.Group();
    alcoveNorthFrame.position.set(6.0, -1.6, 8.5);
    const alcoveStoneL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.15), darkStoneMat);
    alcoveStoneL.position.set(0.06, 0, -1.1);
    const alcoveStoneR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.15), darkStoneMat);
    alcoveStoneR.position.set(0.06, 0, 1.1);
    const alcoveStoneTop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 2.35), darkStoneMat);
    alcoveStoneTop.position.set(0.06, 1.51, 0);
    alcoveNorthFrame.add(alcoveStoneL, alcoveStoneR, alcoveStoneTop);
    this.group.add(alcoveNorthFrame);

    // South Alcove: Dark, Closed Cellar Archway (X = 6.0, Z = 13.5)
    // Anchored firmly to concrete floor (Y = -3.2)
    const cellarArchGroup = new THREE.Group();
    cellarArchGroup.position.set(6.0, -1.6, 13.5);

    const archTrimL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.15), darkStoneMat);
    archTrimL.position.set(0.06, 0, -1.0);
    const archTrimR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.15), darkStoneMat);
    archTrimR.position.set(0.06, 0, 1.0);
    const archTrimTop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 2.15), darkStoneMat);
    archTrimTop.position.set(0.06, 1.49, 0);

    // Closed dark wooden door planks anchored down to floor
    const cellarDoorPlanks = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 1.85), darkWoodMat);
    cellarDoorPlanks.position.set(0.02, -0.15, 0);
    cellarDoorPlanks.receiveShadow = true;

    // Iron strap hinges and latch
    const ironStrap1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.6), steelMat);
    ironStrap1.position.set(0.07, 0.6, -0.6);
    const ironStrap2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.6), steelMat);
    ironStrap2.position.set(0.07, -0.8, -0.6);
    const ironRingLatch = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 12), steelMat);
    ironRingLatch.position.set(0.08, -0.1, 0.55);

    cellarArchGroup.add(archTrimL, archTrimR, archTrimTop, cellarDoorPlanks, ironStrap1, ironStrap2, ironRingLatch);
    this.group.add(cellarArchGroup);

    // =========================================================================
    // 4. ADDED BASEMENT DETAILS: SHELF WITH BOXES, CAMPING GEAR, OLD WORKBENCH
    // No lights added. Fully responsive to the player's flashlight.
    // =========================================================================

    // --- A. SHELF WITH BOXES (West Wall North, X = 6.4, Z = 8.6) ---
    const shelfWithBoxesGroup = new THREE.Group();
    shelfWithBoxesGroup.position.set(6.4, -3.2, 8.6);

    // 4-Tier metal & heavy wood storage shelving unit
    const shelfRackMat = createToonMaterial({ color: 0x334155, desaturate: 0.1 });
    shelfRackMat.side = THREE.DoubleSide;
    const shelfBoardMat = createToonMaterial({ color: 0x78350f, desaturate: 0.12 });
    shelfBoardMat.side = THREE.DoubleSide;

    const shelfPostGeo = new THREE.BoxGeometry(0.06, 2.4, 0.06);
    const postFL = new THREE.Mesh(shelfPostGeo, shelfRackMat); postFL.position.set(0.26, 1.2, -0.95);
    const postFR = new THREE.Mesh(shelfPostGeo, shelfRackMat); postFR.position.set(0.26, 1.2, 0.95);
    const postBL = new THREE.Mesh(shelfPostGeo, shelfRackMat); postBL.position.set(-0.26, 1.2, -0.95);
    const postBR = new THREE.Mesh(shelfPostGeo, shelfRackMat); postBR.position.set(-0.26, 1.2, 0.95);
    shelfWithBoxesGroup.add(postFL, postFR, postBL, postBR);

    for (let t = 0; t < 4; t++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 1.95), shelfBoardMat);
      plank.position.set(0, 0.15 + t * 0.65, 0);
      plank.receiveShadow = true;
      shelfWithBoxesGroup.add(plank);
    }

    // Tier 1 (Bottom): Heavy tool crate & large storage boxes
    const crateMat = createToonMaterial({ color: 0x5c3d2e, desaturate: 0.15 });
    const woodCrate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.6), crateMat);
    woodCrate.position.set(0, 0.35, -0.55);
    woodCrate.receiveShadow = true;
    woodCrate.castShadow = true;

    const bigBox1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.45, 0.65), createToonMaterial({ color: 0x92400e }));
    bigBox1.position.set(0, 0.40, 0.45);
    bigBox1.receiveShadow = true;
    bigBox1.castShadow = true;
    shelfWithBoxesGroup.add(woodCrate, bigBox1);

    // Tier 2: Stacked cardboard boxes with duct tape
    const tapeMat = createToonMaterial({ color: 0x94a3b8 });
    const midBox1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.5), createToonMaterial({ color: 0xb45309 }));
    midBox1.position.set(0, 1.0, -0.6);
    midBox1.receiveShadow = true;
    midBox1.castShadow = true;
    const tape1 = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.04, 0.51), tapeMat);
    tape1.position.set(0, 1.15, -0.6);

    const midBox2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.55), createToonMaterial({ color: 0xd97706 }));
    midBox2.position.set(0, 1.01, 0.0);
    midBox2.receiveShadow = true;
    midBox2.castShadow = true;

    const midBox3 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.45), createToonMaterial({ color: 0x78350f }));
    midBox3.position.set(0, 0.97, 0.6);
    midBox3.receiveShadow = true;
    midBox3.castShadow = true;
    shelfWithBoxesGroup.add(midBox1, tape1, midBox2, midBox3);

    // Tier 3: Plastic storage bins
    const blueTote = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.35, 0.6), createToonMaterial({ color: 0x1e3a8a, desaturate: 0.1 }));
    blueTote.position.set(0, 1.65, -0.45);
    blueTote.receiveShadow = true;
    blueTote.castShadow = true;
    const blueToteLid = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.04, 0.63), createToonMaterial({ color: 0x172554 }));
    blueToteLid.position.set(0, 1.84, -0.45);

    const grayTote = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.35, 0.6), createToonMaterial({ color: 0x334155, desaturate: 0.1 }));
    grayTote.position.set(0, 1.65, 0.45);
    grayTote.receiveShadow = true;
    grayTote.castShadow = true;
    shelfWithBoxesGroup.add(blueTote, blueToteLid, grayTote);

    // Tier 4 (Top): Row of old glass canning jars (amber and olive tones)
    const jarAmberMat = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const jarGreenMat = createToonMaterial({ color: 0x166534, desaturate: 0.1 });
    for (let j = 0; j < 5; j++) {
      const jar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8),
        j % 2 === 0 ? jarAmberMat : jarGreenMat
      );
      jar.position.set(0, 2.22, -0.6 + j * 0.3);
      jar.receiveShadow = true;
      shelfWithBoxesGroup.add(jar);
    }
    this.group.add(shelfWithBoxesGroup);

    // --- B. CAMPING GEAR (Next to shelf at X = 6.4, Z = 7.1) ---
    const campingGroup = new THREE.Group();
    campingGroup.position.set(6.4, -3.2, 7.1);

    // Vintage metal camping cooler / ice chest (Red body with white lid)
    const coolerBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.38, 0.65),
      createToonMaterial({ color: 0xb91c1c, desaturate: 0.08 })
    );
    coolerBody.position.set(0, 0.19, 0);
    coolerBody.receiveShadow = true;
    coolerBody.castShadow = true;

    const coolerLid = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.08, 0.67),
      createToonMaterial({ color: 0x475569, desaturate: 0.1 })
    );
    coolerLid.position.set(0, 0.42, 0);

    const coolerLatch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.08), steelMat);
    coolerLatch.position.set(0.26, 0.32, 0);

    // Rolled-up camping sleeping bags (Forest Green and Navy)
    const sleepBagMat1 = createToonMaterial({ color: 0x14532d, desaturate: 0.1 });
    const sleepBag1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.55, 12), sleepBagMat1);
    sleepBag1.rotation.x = Math.PI / 2;
    sleepBag1.position.set(0.05, 0.6, -0.05);
    sleepBag1.receiveShadow = true;
    sleepBag1.castShadow = true;

    const sleepBagMat2 = createToonMaterial({ color: 0x1e3a8a, desaturate: 0.1 });
    const sleepBag2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.55, 12), sleepBagMat2);
    sleepBag2.rotation.x = Math.PI / 2;
    sleepBag2.rotation.y = 0.2;
    sleepBag2.position.set(0.05, 0.84, -0.05);
    sleepBag2.receiveShadow = true;
    sleepBag2.castShadow = true;

    // Olive-drab canvas camping tent duffel bag on floor
    const tentDuffel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.65, 12),
      createToonMaterial({ color: 0x3f6212, desaturate: 0.15 })
    );
    tentDuffel.rotation.z = Math.PI / 2;
    tentDuffel.position.set(0, 0.16, -0.55);
    tentDuffel.receiveShadow = true;
    tentDuffel.castShadow = true;

    // Folded camp chair in cylindrical canvas carry bag leaning against wall
    const campChair = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.95, 10),
      createToonMaterial({ color: 0x374151, desaturate: 0.1 })
    );
    campChair.position.set(-0.15, 0.45, 0.45);
    campChair.rotation.z = 0.15;
    campChair.rotation.x = -0.1;
    campChair.receiveShadow = true;

    // Vintage metal unlit camping lantern (dark teal frame, glass globe, wire bail)
    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(0.1, 0.52, 0.22);
    const lanternBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.1, 10),
      createToonMaterial({ color: 0x155e75, desaturate: 0.15 })
    );
    const lanternGlobe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10),
      createToonMaterial({ color: 0x94a3b8, desaturate: 0.1 })
    );
    lanternGlobe.position.y = 0.12;
    const lanternCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.04, 0.06, 10),
      createToonMaterial({ color: 0x155e75, desaturate: 0.15 })
    );
    lanternCap.position.y = 0.22;
    lanternGroup.add(lanternBase, lanternGlobe, lanternCap);
    lanternGroup.receiveShadow = true;

    // Steel camping canteen
    const canteen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12),
      createToonMaterial({ color: 0x4d7c0f, desaturate: 0.2 })
    );
    canteen.position.set(0.15, 0.5, -0.22);
    canteen.rotation.x = Math.PI / 2;

    campingGroup.add(coolerBody, coolerLid, coolerLatch, sleepBag1, sleepBag2, tentDuffel, campChair, lanternGroup, canteen);
    this.group.add(campingGroup);

    // --- C. OLD WORKBENCH (West Wall South, X = 6.45, Z = 13.5) ---
    const oldBenchGroup = new THREE.Group();
    oldBenchGroup.position.set(6.45, -3.2, 13.5);

    // Weathered timber workbench structure (width 2.2m along Z, depth 0.8m along X, height 0.85m)
    const benchWoodMat = createToonMaterial({ color: 0x5c3d2e, desaturate: 0.18 });
    benchWoodMat.side = THREE.DoubleSide;

    // Heavy wooden slab top
    const oldBenchTop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 2.2), benchWoodMat);
    oldBenchTop.position.set(0, 0.85, 0);
    oldBenchTop.receiveShadow = true;
    oldBenchTop.castShadow = true;
    addInkOutline(oldBenchTop, 0.025);

    // 4 Heavy timber square legs
    const legGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    const legFL = new THREE.Mesh(legGeo, benchWoodMat); legFL.position.set(0.32, 0.4, -0.98);
    const legFR = new THREE.Mesh(legGeo, benchWoodMat); legFR.position.set(0.32, 0.4, 0.98);
    const legBL = new THREE.Mesh(legGeo, benchWoodMat); legBL.position.set(-0.32, 0.4, -0.98);
    const legBR = new THREE.Mesh(legGeo, benchWoodMat); legBR.position.set(-0.32, 0.4, 0.98);

    // Lower slatted timber shelf
    const lowerShelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 2.05), benchWoodMat);
    lowerShelf.position.set(0, 0.18, 0);
    lowerShelf.receiveShadow = true;

    // Scrap wood crate on lower shelf
    const scrapCrate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.7), crateMat);
    scrapCrate.position.set(0, 0.32, -0.45);
    scrapCrate.receiveShadow = true;

    // Heavy Cast-Iron Bench Vise mounted on front corner (X = 0.36, Z = -0.95, Y = 0.95)
    const viseMat = createToonMaterial({ color: 0x334155, desaturate: 0.15 });
    const viseBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), viseMat);
    viseBase.position.set(0.36, 0.96, -0.95);
    const viseJawFixed = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.22), viseMat);
    viseJawFixed.position.set(0.36, 1.05, -0.95);
    const viseJawMovable = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.22), viseMat);
    viseJawMovable.position.set(0.46, 1.05, -0.95);
    const viseScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), steelMat);
    viseScrew.rotation.z = Math.PI / 2;
    viseScrew.position.set(0.48, 1.0, -0.95);

    // Vintage red metal toolbox on benchtop
    const redToolbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.22, 0.55),
      createToonMaterial({ color: 0x991b1b, desaturate: 0.08 })
    );
    redToolbox.position.set(-0.12, 1.01, 0.55);
    redToolbox.receiveShadow = true;
    redToolbox.castShadow = true;
    const toolboxHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.22), steelMat);
    toolboxHandle.position.set(-0.12, 1.14, 0.55);

    // Vintage carpenter's hand plane (wood body with steel blade)
    const handPlane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), woodMat);
    handPlane.position.set(0.15, 0.94, -0.35);
    handPlane.rotation.y = 0.3;
    handPlane.receiveShadow = true;

    // Old rusty handsaw resting on bench surface
    const sawBlade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.12, 0.58), steelMat);
    sawBlade.position.set(0.05, 0.92, 0.05);
    sawBlade.rotation.y = -0.4;
    sawBlade.receiveShadow = true;
    const sawHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.12), darkWoodMat);
    sawHandle.position.set(-0.16, 0.94, -0.12);

    // Metal oil can with curved spout
    const oilCanBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8),
      createToonMaterial({ color: 0x475569, desaturate: 0.1 })
    );
    oilCanBody.position.set(-0.2, 0.97, -0.7);
    const oilCanSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.02, 0.16, 6), steelMat);
    oilCanSpout.position.set(-0.18, 1.08, -0.7);
    oilCanSpout.rotation.z = -0.4;

    // Wooden carpenter's mallet
    const malletHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.15), woodMat);
    malletHead.position.set(0.2, 0.95, 0.7);
    const malletHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), woodMat);
    malletHandle.rotation.x = Math.PI / 2;
    malletHandle.position.set(0.2, 0.93, 0.55);

    oldBenchGroup.add(
      oldBenchTop, legFL, legFR, legBL, legBR, lowerShelf, scrapCrate,
      viseBase, viseJawFixed, viseJawMovable, viseScrew,
      redToolbox, toolboxHandle, handPlane, sawBlade, sawHandle,
      oilCanBody, oilCanSpout, malletHead, malletHandle
    );
    this.group.add(oldBenchGroup);

    // =========================================================================
    // 5. EXISTING INTERACTIVES & AMBIENCE (FLASHLIGHT, SWITCH, BREAKER, ETC)
    // Kept intact to preserve all story quests and puzzle mechanics.
    // =========================================================================

    // Existing main ceiling point light (initialized at 0 intensity, lerped up on power restore)
    const mainCeilLight = new THREE.PointLight(0xfef08a, 0, 16.0, 1.4);
    mainCeilLight.position.set(11.5, -0.6, 11.0);
    this.group.add(mainCeilLight);
    this.ceilingLight1 = mainCeilLight;

    // Support Pillars
    const pillarMat = createToonMaterial({ color: 0x475569, desaturate: 0.1 });
    const pillarPositions = [
      [9.0, 9.0],
      [13.0, 9.0],
      [9.0, 13.0],
      [13.0, 13.0],
    ];
    for (const [px, pz] of pillarPositions) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), pillarMat);
      pillar.position.set(px, -1.6, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      pillar.frustumCulled = false;
      addInkOutline(pillar, 0.03);
      this.group.add(pillar);
    }

    // Shelves along two walls (East and North)
    const shelf1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 4.0), shelfMat);
    shelf1.position.set(16.5, -2.0, 9.0);
    shelf1.castShadow = true;
    shelf1.receiveShadow = true;
    shelf1.frustumCulled = false;
    addInkOutline(shelf1, 0.03);

    const shelf2 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.4, 0.6), shelfMat);
    shelf2.position.set(14.0, -2.0, 6.8);
    shelf2.castShadow = true;
    shelf2.receiveShadow = true;
    shelf2.frustumCulled = false;
    addInkOutline(shelf2, 0.03);
    this.group.add(shelf1, shelf2);

    // Shelf tier ledges for Shelf 1 so each box rests on a physical support tier
    for (let t = 0; t < 4; t++) {
      const tierLedge = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 3.9), shelfMat);
      tierLedge.position.set(16.5, -3.18 + t * 0.6, 9.0);
      tierLedge.receiveShadow = true;
      this.group.add(tierLedge);
    }

    for (let i = 0; i < 4; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.6), boxMat);
      box.position.set(16.4, -2.96 + i * 0.6, 8.5 + (i % 2) * 0.8);
      box.castShadow = true;
      box.receiveShadow = true;
      box.frustumCulled = false;
      addInkOutline(box, 0.02);
      this.group.add(box);
    }

    // Dad's Workshop Nook (East Wall South) with pegboard & Wrench
    const benchGroup = new THREE.Group();
    benchGroup.position.set(16.5, -3.2, 14.0);

    // 4 Solid steel support legs anchoring workbench to floor (from y = 0 to y = 0.81)
    const dadLegGeo = new THREE.BoxGeometry(0.08, 0.81, 0.08);
    const dadLegFL = new THREE.Mesh(dadLegGeo, steelMat); dadLegFL.position.set(0.42, 0.405, -1.0);
    const dadLegFR = new THREE.Mesh(dadLegGeo, steelMat); dadLegFR.position.set(0.42, 0.405, 1.0);
    const dadLegBL = new THREE.Mesh(dadLegGeo, steelMat); dadLegBL.position.set(-0.42, 0.405, -1.0);
    const dadLegBR = new THREE.Mesh(dadLegGeo, steelMat); dadLegBR.position.set(-0.42, 0.405, 1.0);
    dadLegFL.receiveShadow = true; dadLegFR.receiveShadow = true;
    dadLegBL.receiveShadow = true; dadLegBR.receiveShadow = true;
    benchGroup.add(dadLegFL, dadLegFR, dadLegBL, dadLegBR);

    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 2.2), shelfMat);
    benchTop.position.set(0, 0.85, 0);
    benchTop.castShadow = true;
    benchTop.receiveShadow = true;
    benchTop.frustumCulled = false;

    const pegboard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 2.0), steelMat);
    pegboard.position.set(-0.45, 1.5, 0);
    pegboard.castShadow = true;
    pegboard.receiveShadow = true;
    pegboard.frustumCulled = false;

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.5), steelMat);
    chest.position.set(0, 1.09, -0.5);
    chest.castShadow = true;
    chest.receiveShadow = true;
    chest.frustumCulled = false;

    const wrenchGroup = new THREE.Group();
    wrenchGroup.name = 'basement_wrench_prop';
    wrenchGroup.position.set(0, 0.92, 0.5);
    wrenchGroup.rotation.y = 0.5;
    wrenchGroup.visible = false; // Initially hidden until power is restored

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.35), steelMat);
    const head1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 12), steelMat);
    head1.position.set(0, 0, 0.17);
    handle.frustumCulled = false;
    head1.frustumCulled = false;
    wrenchGroup.add(handle, head1);

    benchGroup.add(benchTop, pegboard, chest, wrenchGroup);
    this.wrenchMesh = wrenchGroup;
    this.group.add(benchGroup);

    // Glowing Breaker box on East wall with pilot LEDs and subtle glowing label
    const breakerBoxGroup = new THREE.Group();
    breakerBoxGroup.position.set(16.92, -1.2, 7.3);

    const breakerHousingMat = createToonMaterial({
      color: 0x334155,
      emissive: 0x0284c7,
      emissiveIntensity: 0.15,
      desaturate: 0.1,
    });
    breakerHousingMat.side = THREE.DoubleSide;

    const breakerBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.52), breakerHousingMat);
    breakerBox.receiveShadow = true;
    breakerBox.castShadow = true;
    breakerBox.frustumCulled = false;
    addInkOutline(breakerBox, 0.02);

    // Subtle glowing label plaque for Breaker Box
    const labelPlaqueGeo = new THREE.BoxGeometry(0.015, 0.10, 0.32);
    const labelPlaqueMat = createToonMaterial({
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.5,
    });
    const labelPlaque = new THREE.Mesh(labelPlaqueGeo, labelPlaqueMat);
    labelPlaque.position.set(-0.075, 0.05, 0);
    addInkOutline(labelPlaque, 0.015);

    // Glowing indicator LEDs
    const ledAmber = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    ledAmber.position.set(-0.075, 0.22, -0.14);

    const ledCyan = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    ledCyan.position.set(-0.075, 0.22, 0.14);

    const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), steelMat);
    conduit.position.set(0, 0.55, 0);

    breakerBoxGroup.add(breakerBox, labelPlaque, ledAmber, ledCyan, conduit);
    this.group.add(breakerBoxGroup);

    // Carefully packed box in corner
    const specialBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), boxMat);
    specialBox.position.set(16.2, -2.9, 14.8);
    specialBox.castShadow = true;
    specialBox.receiveShadow = true;
    specialBox.frustumCulled = false;
    addInkOutline(specialBox, 0.03);
    this.group.add(specialBox);

    // Small old photo & wooden toy on box lid (hidden until opened)
    const photoMat = createToonMaterial({ color: 0xfef08a });
    const photoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.28), photoMat);
    photoMesh.position.set(16.2, -2.59, 14.7);
    photoMesh.visible = false;
    photoMesh.frustumCulled = false;
    this.photoMesh = photoMesh;
    this.group.add(photoMesh);

    const toyGroup = new THREE.Group();
    toyGroup.position.set(16.2, -2.58, 14.95);
    const toyBody = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.1), woodMat);
    toyBody.frustumCulled = false;
    toyGroup.add(toyBody);
    toyGroup.visible = false;
    this.toyMesh = toyGroup;
    this.group.add(toyGroup);
  }

  private setupInteractionNodes() {
    this.interactionNodes = [
      {
        id: 'basement_breaker_box',
        name: 'Breaker box',
        position: [16.85, -1.2, 7.3],
        promptKey: 'E',
        promptVerb: 'Open',
        description: 'Electrical breaker box with color-coded wiring circuits.',
        interactRadius: 2.8,
      },
      {
        id: 'basement_special_box',
        name: 'Carefully Packed Box',
        position: [16.2, -2.9, 14.8],
        promptKey: 'E',
        promptVerb: 'Open',
        description: 'A carefully packed cardboard box in the corner of the basement.',
        interactRadius: 2.5,
      },
    ];
  }

  private buildColliders() {
    this.colliders = [
      { id: 'bs_wall_back', name: 'Back Wall', minX: 16.8, maxX: 17.3, minZ: 6.3, maxZ: 15.7, height: 3.5 },
      { id: 'bs_wall_north', name: 'North Wall', minX: 5.8, maxX: 17.2, minZ: 6.3, maxZ: 6.7, height: 3.5 },
      { id: 'bs_wall_south', name: 'South Wall', minX: 5.8, maxX: 17.2, minZ: 15.3, maxZ: 15.8, height: 3.5 },
      { id: 'bs_wall_front_n', name: 'Front Wall North', minX: 5.7, maxX: 6.2, minZ: 6.3, maxZ: 10.25, height: 3.5 },
      { id: 'bs_wall_front_s', name: 'Front Wall South', minX: 5.7, maxX: 6.2, minZ: 11.75, maxZ: 15.8, height: 3.5 },
      { id: 'bs_stair_wall_n', name: 'Stair Wall North', minX: 1.7, maxX: 6.0, minZ: 10.0, maxZ: 10.35, height: 3.5 },
      { id: 'bs_stair_wall_s', name: 'Stair Wall South', minX: 1.7, maxX: 6.0, minZ: 11.65, maxZ: 12.0, height: 3.5 },
      { id: 'bs_workbench', name: 'Dad Workbench', minX: 15.5, maxX: 17.0, minZ: 12.5, maxZ: 15.5, height: 1.5 },
      { id: 'bs_old_workbench', name: 'Old Workbench', minX: 6.0, maxX: 7.0, minZ: 12.3, maxZ: 14.7, height: 1.5 },
      { id: 'bs_shelf_boxes', name: 'Shelf With Boxes', minX: 6.0, maxX: 6.9, minZ: 7.6, maxZ: 9.6, height: 2.5 },
      { id: 'bs_camping_gear', name: 'Camping Gear', minX: 6.0, maxX: 6.9, minZ: 6.5, maxZ: 7.6, height: 1.2 },
      { id: 'bs_shelf1', name: 'Shelf 1', minX: 16.0, maxX: 17.0, minZ: 7.0, maxZ: 11.0, height: 2.5 },
      { id: 'bs_shelf2', name: 'Shelf 2', minX: 11.5, maxX: 16.5, minZ: 6.5, maxZ: 7.5, height: 2.5 },
    ];
  }
}
