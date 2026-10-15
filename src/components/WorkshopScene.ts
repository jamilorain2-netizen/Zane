import * as THREE from 'three';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { BoxCollider2D } from '../utils/collision';
import { InteractionNode } from '../types/game';

export class WorkshopScene {
  public group: THREE.Group;
  public colliders: BoxCollider2D[] = [];
  public interactionNodes: InteractionNode[] = [];

  // Reserved spots for story logic
  public keySpotGroup!: THREE.Group;
  public dadSpotGroup!: THREE.Group;
  public wrenchProp: THREE.Group | null = null;

  public placeWrench() {
    if (this.wrenchProp) {
      this.wrenchProp.visible = true;
    }
  }

  constructor() {
    this.group = new THREE.Group();
    this.buildRoom();
    this.buildWorkbenchAndBackWall();
    this.buildSideFurnitureAndProps();
    this.buildCentralWorkTableAndStool();
    this.buildStorySpots();
    this.buildLightingFixture();
    this.buildColliders();
  }

  // LARGER WORKSHOP (Floor area ~36 sq units, 1.8x larger: X=[-8.0, -1.8], Z=[4.7, 10.5], Height Y=3.2)
  private buildRoom() {
    const floorMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.1 });
    floorMat.polygonOffset = true;
    floorMat.polygonOffsetFactor = 1;
    floorMat.polygonOffsetUnits = 1;

    const wallMat = createToonMaterial({ color: 0xd97706, desaturate: 0.15 });
    wallMat.polygonOffset = true;
    wallMat.polygonOffsetFactor = 1;
    wallMat.polygonOffsetUnits = 1;

    const ceilingMat = createToonMaterial({ color: 0xe6d7c5, desaturate: 0.06 });
    const trimMat = createToonMaterial({ color: 0x451a03, desaturate: 0.1 });

    // Floor (Width = 6.2 along X, Length = 5.8 along Z)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 5.8), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-4.9, 0, 7.6);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling (Height Y = 3.2)
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 5.8), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(-4.9, 3.2, 7.6);
    ceiling.receiveShadow = false;
    this.group.add(ceiling);

    // Back Outer Wall (X = -8.0) - offset 0.015
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 5.8), wallMat);
    backWall.position.set(-8.0, 1.6, 7.6);
    backWall.receiveShadow = false;
    this.group.add(backWall);

    // North Outer Wall (Z = 4.7)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.2, 0.2), wallMat);
    northWall.position.set(-4.9, 1.6, 4.7);
    northWall.receiveShadow = false;
    this.group.add(northWall);

    // South Outer Wall (Z = 10.5)
    const southWall = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.2, 0.2), wallMat);
    southWall.position.set(-4.9, 1.6, 10.5);
    southWall.receiveShadow = false;
    this.group.add(southWall);

    // Dark trim baseboards along walls (offset 0.015 units off wall surfaces)
    const bbBack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 5.8), trimMat);
    bbBack.position.set(-7.865, 0.06, 7.6);
    const bbNorth = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, 0.04), trimMat);
    bbNorth.position.set(-4.9, 0.06, 4.835);
    const bbSouth = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, 0.04), trimMat);
    bbSouth.position.set(-4.9, 0.06, 10.365);

    this.group.add(bbBack, bbNorth, bbSouth);

    // Sawdust patches on floor (offset 0.015 off floor)
    const sawdustMat = createToonMaterial({ color: 0xfde047, desaturate: 0.15 });
    const dustPatch1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), sawdustMat);
    dustPatch1.rotation.x = -Math.PI / 2;
    dustPatch1.position.set(-6.8, 0.015, 7.5);
    dustPatch1.receiveShadow = true;

    const dustPatch2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), sawdustMat);
    dustPatch2.rotation.x = -Math.PI / 2;
    dustPatch2.position.set(-4.8, 0.015, 7.2);
    dustPatch2.receiveShadow = true;

    this.group.add(dustPatch1, dustPatch2);
  }

  // WORKBENCH & PEGBOARD ALONG BACK WALL (X = -8.0)
  private buildWorkbenchAndBackWall() {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(-7.3, 0, 7.5);

    const woodMat = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const metalMat = createToonMaterial({ color: 0x64748b, desaturate: 0.1 });
    const brassMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.08 });
    const glassMat = createToonMaterial({ color: 0xe2e8f0, desaturate: 0.02 });

    // Tabletop
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 2.4), woodMat);
    tableTop.position.set(0, 0.95, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    addInkOutline(tableTop, 0.035);
    benchGroup.add(tableTop);

    // Table Legs
    for (const [lx, lz] of [[-0.45, -1.0], [0.45, -1.0], [-0.45, 1.0], [0.45, 1.0]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), woodMat);
      leg.position.set(lx, 0.45, lz);
      leg.castShadow = true;
      addInkOutline(leg, 0.025);
      benchGroup.add(leg);
    }

    // Heavy Metal Vise on workbench corner
    const vise = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 0.30), metalMat);
    vise.position.set(0.35, 1.10, 0.95);
    vise.castShadow = true;
    addInkOutline(vise, 0.025);
    benchGroup.add(vise);

    // Rolled out Blueprints
    const planMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), planMat);
    plan.rotation.x = -Math.PI / 2;
    plan.position.set(0.0, 1.005, -0.2);
    benchGroup.add(plan);

    // Oil Can
    const oilCan = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 12), brassMat);
    oilCan.position.set(-0.25, 1.09, -0.7);
    oilCan.castShadow = true;
    addInkOutline(oilCan, 0.02);
    benchGroup.add(oilCan);

    // Jars of Screws
    for (const [jx, jz] of [[-0.2, 0.4], [-0.08, 0.52]]) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10), glassMat);
      jar.position.set(jx, 1.07, jz);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 10), metalMat);
      cap.position.set(jx, 1.15, jz);
      benchGroup.add(jar, cap);
    }

    // Half-built wooden toy (Toy Airplane)
    const toyGroup = new THREE.Group();
    toyGroup.position.set(0.1, 1.05, 0.2);
    const toyBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), woodMat);
    const toyWings = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.32), woodMat);
    toyWings.position.y = 0.03;
    toyGroup.add(toyBody, toyWings);
    addInkOutline(toyBody, 0.015);
    benchGroup.add(toyGroup);

    // Delivered Wrench Prop on Workbench (visible when set on bench)
    const wrenchMesh = new THREE.Group();
    wrenchMesh.position.set(-0.1, 1.01, 0.55);
    wrenchMesh.rotation.y = -0.35;
    wrenchMesh.visible = false;
    const wrenchHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.35), metalMat);
    const wrenchHead = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 12), metalMat);
    wrenchHead.position.set(0, 0, 0.17);
    wrenchMesh.add(wrenchHandle, wrenchHead);
    addInkOutline(wrenchHandle, 0.02);
    benchGroup.add(wrenchMesh);
    this.wrenchProp = wrenchMesh;

    this.group.add(benchGroup);

    // Pegboard on Back Wall (X = -7.92)
    const pegGroup = new THREE.Group();
    const pegBoardMat = createToonMaterial({ color: 0xa16207, desaturate: 0.15 });
    const pegboard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 2.5), pegBoardMat);
    pegboard.position.set(-7.92, 2.0, 7.5);
    addInkOutline(pegboard, 0.03);
    pegGroup.add(pegboard);

    // Tools hanging on pegboard
    const toolMat = createToonMaterial({ color: 0x475569, desaturate: 0.1 });
    const handleMat = createToonMaterial({ color: 0xef4444, desaturate: 0.08 });

    // Hammer
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.18), toolMat);
    hammerHead.position.set(-7.88, 2.2, 7.0);
    const hammerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 8), handleMat);
    hammerHandle.position.set(-7.88, 2.06, 7.0);
    pegGroup.add(hammerHead, hammerHandle);

    // Hand Saw
    const sawBlade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.12), toolMat);
    sawBlade.position.set(-7.88, 1.95, 7.8);
    const sawHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.12), woodMat);
    sawHandle.position.set(-7.88, 2.15, 7.8);
    pegGroup.add(sawBlade, sawHandle);

    // Wrench & Pliers
    const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.06), toolMat);
    wrench.position.set(-7.88, 2.1, 8.3);
    pegGroup.add(wrench);

    this.group.add(pegGroup);
  }

  // SIDE FURNITURE, SHELVES, TOOL CABINET, BOXES, BICYCLE WHEEL & RADIO
  private buildSideFurnitureAndProps() {
    const sideGroup = new THREE.Group();
    const woodMat = createToonMaterial({ color: 0x78350f, desaturate: 0.12 });
    const metalCabinetMat = createToonMaterial({ color: 0xb91c1c, desaturate: 0.1 }); // Red tool chest
    const metalMat = createToonMaterial({ color: 0x475569, desaturate: 0.1 });

    // 1. Tool Cabinet along North Wall (Z = 4.7)
    const toolCabinet = new THREE.Group();
    toolCabinet.position.set(-3.2, 0, 5.2);

    const cabinetBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.6), metalCabinetMat);
    cabinetBody.position.y = 0.55;
    cabinetBody.castShadow = true;
    addInkOutline(cabinetBody, 0.03);
    toolCabinet.add(cabinetBody);

    // Cabinet drawers
    for (let dy = 0.25; dy <= 0.95; dy += 0.22) {
      const drawerLine = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.02), metalMat);
      drawerLine.position.set(0, dy, 0.31);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.03), metalMat);
      handle.position.set(0, dy + 0.05, 0.32);
      toolCabinet.add(drawerLine, handle);
    }
    sideGroup.add(toolCabinet);

    // 2. Second Shelving Unit along North Wall (Z = 4.7)
    const northShelfGroup = new THREE.Group();
    northShelfGroup.position.set(-5.2, 0, 5.1);

    for (let sy = 0.4; sy <= 2.2; sy += 0.6) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.5), woodMat);
      shelf.position.y = sy;
      shelf.castShadow = true;
      addInkOutline(shelf, 0.025);
      northShelfGroup.add(shelf);
    }
    for (const sx of [-0.65, 0.65]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.48), woodMat);
      leg.position.set(sx, 1.1, 0);
      northShelfGroup.add(leg);
    }

    // Old Radio on shelf (Y = 1.05)
    const radioMat = createToonMaterial({ color: 0x92400e, desaturate: 0.08 });
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.18), radioMat);
    radio.position.set(-0.2, 1.16, 0);
    radio.castShadow = true;
    addInkOutline(radio, 0.02);

    const dialMat = createToonMaterial({ color: 0xfef08a });
    const dial1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), dialMat);
    dial1.rotation.x = Math.PI / 2;
    dial1.position.set(-0.28, 1.14, 0.1);
    const dial2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), dialMat);
    dial2.rotation.x = Math.PI / 2;
    dial2.position.set(-0.12, 1.14, 0.1);
    northShelfGroup.add(radio, dial1, dial2);

    // Bicycle Wheel on floor leaning against shelf
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0.3, 0.45, 0.2);
    wheelGroup.rotation.y = 0.2;
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.03, 8, 24), metalMat);
    tire.castShadow = true;
    addInkOutline(tire, 0.02);
    wheelGroup.add(tire);
    northShelfGroup.add(wheelGroup);

    sideGroup.add(northShelfGroup);

    // 3. Cardboard Boxes Stacked in Corner (Southwest: X = -7.2, Z = 9.8)
    const boxGroup = new THREE.Group();
    boxGroup.position.set(-7.1, 0, 9.8);

    const cardboardMat = createToonMaterial({ color: 0xd97706, desaturate: 0.2 });
    const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), cardboardMat);
    box1.position.set(0, 0.25, 0);
    box1.castShadow = true;
    addInkOutline(box1, 0.025);

    const box2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), cardboardMat);
    box2.position.set(0.05, 0.725, -0.05);
    box2.rotation.y = 0.15;
    box2.castShadow = true;
    addInkOutline(box2, 0.025);

    const box3 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), cardboardMat);
    box3.position.set(-0.4, 0.20, 0.2);
    box3.castShadow = true;
    addInkOutline(box3, 0.025);

    boxGroup.add(box1, box2, box3);
    sideGroup.add(boxGroup);

    // 4. Craft Storage Shelves along South Wall (Z = 10.5)
    const southShelfGroup = new THREE.Group();
    southShelfGroup.position.set(-4.5, 0, 10.1);

    for (let sy = 0.5; sy <= 1.9; sy += 0.7) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.45), woodMat);
      shelf.position.y = sy;
      shelf.castShadow = true;
      addInkOutline(shelf, 0.025);
      southShelfGroup.add(shelf);
    }

    sideGroup.add(southShelfGroup);
    this.group.add(sideGroup);
  }

  // LARGE CENTRAL WORK TABLE & STOOL
  private buildCentralWorkTableAndStool() {
    const tableGroup = new THREE.Group();
    tableGroup.position.set(-4.8, 0, 7.5);

    const darkWoodMat = createToonMaterial({ color: 0x582f0e, desaturate: 0.1 });
    const stoolWoodMat = createToonMaterial({ color: 0x9a3412, desaturate: 0.08 });

    // Tabletop (1.4 x 1.8, height = 0.9)
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.8), darkWoodMat);
    tableTop.position.set(0, 0.90, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    addInkOutline(tableTop, 0.035);
    tableGroup.add(tableTop);

    // Table Legs
    for (const [lx, lz] of [[-0.6, -0.8], [0.6, -0.8], [-0.6, 0.8], [0.6, 0.8]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.86, 0.1), darkWoodMat);
      leg.position.set(lx, 0.43, lz);
      leg.castShadow = true;
      addInkOutline(leg, 0.025);
      tableGroup.add(leg);
    }
    this.group.add(tableGroup);

    // Workshop Stool (tucked near central work table)
    const stoolGroup = new THREE.Group();
    stoolGroup.position.set(-4.8, 0, 6.2);

    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 16), stoolWoodMat);
    seat.position.y = 0.65;
    seat.castShadow = true;
    addInkOutline(seat, 0.025);

    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), stoolWoodMat);
      leg.position.set(Math.cos(angle) * 0.18, 0.31, Math.sin(angle) * 0.18);
      leg.rotation.z = -Math.cos(angle) * 0.1;
      leg.rotation.x = Math.sin(angle) * 0.1;
      leg.castShadow = true;
      stoolGroup.add(leg);
    }
    stoolGroup.add(seat);
    this.group.add(stoolGroup);
  }

  // RESERVED STORY SPOTS (Marked with explicit IDs in code)
  private buildStorySpots() {
    // 1. workshop_key_spot: Small board on back wall near workbench at kid height (Y = 1.15) with empty hook
    this.keySpotGroup = new THREE.Group();
    this.keySpotGroup.name = 'workshop_key_spot';
    this.keySpotGroup.position.set(-7.92, 1.15, 9.1);

    const woodMat = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const hookMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.05 }); // Brass empty hook

    const hookBoard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.22), woodMat);
    addInkOutline(hookBoard, 0.015);

    const emptyHook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), hookMat);
    emptyHook.rotation.y = Math.PI / 2;
    emptyHook.position.set(0.02, -0.02, 0);

    this.keySpotGroup.add(hookBoard, emptyHook);
    this.group.add(this.keySpotGroup);

    // 2. workshop_dad_spot: Empty standing area near central work table where Dad will stand
    this.dadSpotGroup = new THREE.Group();
    this.dadSpotGroup.name = 'workshop_dad_spot';
    this.dadSpotGroup.position.set(-4.0, 0, 7.5);
    this.group.add(this.dadSpotGroup);
  }

  // SINGLE EMISSIVE FIXTURE (No extra point lights added)
  private buildLightingFixture() {
    const fixtureGroup = new THREE.Group();
    fixtureGroup.position.set(-4.9, 3.15, 7.6);

    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8),
      createToonMaterial({ color: 0x1e293b })
    );
    wire.position.y = 0.15;

    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.28, 0.18, 12),
      createToonMaterial({ color: 0x475569, desaturate: 0.05 })
    );
    shade.position.y = 0.02;

    const emissiveBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    emissiveBulb.position.y = -0.06;

    fixtureGroup.add(wire, shade, emissiveBulb);
    this.group.add(fixtureGroup);
  }

  // COLLIDERS FOR WORKSHOP (Matching new bounds X=[-8.0, -1.8], Z=[4.7, 10.5])
  private buildColliders() {
    this.colliders = [
      // Outer Walls
      { id: 'ws_wall_back', name: 'Workshop Back Wall', minX: -8.1, maxX: -7.9, minZ: 4.7, maxZ: 10.5, height: 3.2 },
      { id: 'ws_wall_north', name: 'Workshop North Wall', minX: -8.0, maxX: -1.8, minZ: 4.6, maxZ: 4.8, height: 3.2 },
      { id: 'ws_wall_south', name: 'Workshop South Wall', minX: -8.0, maxX: -1.8, minZ: 10.4, maxZ: 10.6, height: 3.2 },
      { id: 'ws_wall_front_n', name: 'Workshop Front North Wall', minX: -1.9, maxX: -1.7, minZ: 4.7, maxZ: 6.85, height: 3.2 },
      { id: 'ws_wall_front_s', name: 'Workshop Front South Wall', minX: -1.9, maxX: -1.7, minZ: 8.15, maxZ: 10.5, height: 3.2 },

      // Back Wall Workbench
      { id: 'ws_workbench', name: 'Dad Workbench', minX: -7.9, maxX: -6.7, minZ: 6.2, maxZ: 8.8, height: 1.1 },

      // Central Work Table
      { id: 'ws_central_table', name: 'Central Work Table', minX: -5.6, maxX: -4.0, minZ: 6.5, maxZ: 8.5, height: 1.0 },

      // Workshop Stool
      { id: 'ws_stool', name: 'Workshop Stool', minX: -5.1, maxX: -4.5, minZ: 5.9, maxZ: 6.5, height: 0.7 },

      // Cardboard Boxes
      { id: 'ws_boxes', name: 'Cardboard Boxes', minX: -7.6, maxX: -6.6, minZ: 9.3, maxZ: 10.3, height: 1.2 },

      // Tool Cabinet & North Shelving
      { id: 'ws_tool_cabinet', name: 'Tool Cabinet', minX: -3.8, maxX: -2.6, minZ: 4.7, maxZ: 5.6, height: 1.2 },
      { id: 'ws_north_shelves', name: 'North Shelving Unit', minX: -6.0, maxX: -4.4, minZ: 4.7, maxZ: 5.5, height: 2.2 },
    ];
  }
}
