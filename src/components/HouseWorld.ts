import * as THREE from 'three';
import { InteractionNode } from '../types/game';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { BoxCollider2D } from '../utils/collision';
import { HouseDoor } from './HouseDoor';

// Helper to generate child-like crayon drawing textures for pinned wall art
function createCrayonDrawingTexture(type: 'spaceship' | 'robot' | 'planet' | 'battle'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fcf8ec';
    ctx.fillRect(0, 0, 512, 384);
    ctx.strokeStyle = '#e5dcc7';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 496, 368);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'spaceship') {
      ctx.fillStyle = '#f59e0b';
      for (const [sx, sy] of [[60, 60], [120, 90], [420, 80], [450, 180], [380, 50], [90, 200]]) {
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(256, 55);
      ctx.lineTo(320, 250);
      ctx.lineTo(192, 250);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(256, 35);
      ctx.lineTo(290, 95);
      ctx.lineTo(222, 95);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(256, 155, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(210, 250);
      ctx.lineTo(256, 335);
      ctx.lineTo(302, 250);
      ctx.fill();

      ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('STARSHIP ZANE', 170, 365);
    } else if (type === 'robot') {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(190, 135, 132, 115);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(206, 60, 100, 68);

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(236, 92, 12, 0, Math.PI * 2);
      ctx.arc(276, 92, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(256, 60);
      ctx.lineTo(256, 28);
      ctx.stroke();

      ctx.font = 'bold 20px "Comic Sans MS", cursive';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('DEFENDER UNIT-07', 155, 330);
    } else {
      ctx.fillStyle = '#8b5cf6';
      ctx.beginPath();
      ctx.arc(256, 192, 70, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(256, 192, 110, 25, -Math.PI / 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 20px "Comic Sans MS", cursive';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('OUTER SECTOR 9', 160, 340);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type HouseRoomId = 'bedroom' | 'hallway' | 'kitchen' | 'living_room' | 'workshop' | 'restroom' | 'basement';

export class HouseWorld {
  public group: THREE.Group;

  // Individual room groups for dynamic culling and shadow control
  public rooms: Record<HouseRoomId, THREE.Group>;
  public roomLights: Record<HouseRoomId, THREE.Light[]>;

  // Room colliders
  public roomColliders: Record<HouseRoomId, BoxCollider2D[]>;

  // Room interaction nodes (non-door)
  public roomInteractionNodes: Record<HouseRoomId, InteractionNode[]>;

  // Unified Door System
  public doors: Record<string, HouseDoor>;

  // Sunlight and ambient light
  public sunLight!: THREE.DirectionalLight;
  public ambientLight!: THREE.AmbientLight;

  constructor() {
    this.group = new THREE.Group();
    this.rooms = {
      bedroom: new THREE.Group(),
      hallway: new THREE.Group(),
      kitchen: new THREE.Group(),
      living_room: new THREE.Group(),
      workshop: new THREE.Group(),
      restroom: new THREE.Group(),
      basement: new THREE.Group(),
    };
    this.roomLights = {
      bedroom: [],
      hallway: [],
      kitchen: [],
      living_room: [],
      workshop: [],
      restroom: [],
      basement: [],
    };
    this.roomColliders = {
      bedroom: [],
      hallway: [],
      kitchen: [],
      living_room: [],
      workshop: [],
      restroom: [],
      basement: [],
    };
    this.roomInteractionNodes = {
      bedroom: [],
      hallway: [],
      kitchen: [],
      living_room: [],
      workshop: [],
      restroom: [],
      basement: [],
    };
    this.doors = {};

    // Add room groups to world root
    (Object.keys(this.rooms) as HouseRoomId[]).forEach((id) => {
      this.group.add(this.rooms[id]);
    });

    // Build each room in unified coordinate space
    this.buildDoors();
    this.buildBedroom();
    this.buildHallway();
    this.buildKitchen();
    this.buildLivingRoom();
    this.buildWorkshop();
    this.buildRestroom();
    this.buildBasement();
    this.setupLighting();
  }

  // =========================================================================
  // 1. REUSABLE DOOR SYSTEM INSTANCES
  // =========================================================================
  private buildDoors() {
    // A. Bedroom Door (connects Bedroom Z < 0 and Hallway Z > 0)
    const bedroomDoor = new HouseDoor({
      id: 'bedroom_door',
      name: 'Bedroom Door',
      roomA: 'bedroom',
      roomB: 'hallway',
      position: new THREE.Vector3(0, 0, 0),
      width: 1.3,
      height: 2.5,
      facingAxis: 'z',
      hingeSide: 'min', // hinge at X = -0.65
      swingSign: 1, // swings into hallway or bedroom
      isLocked: false,
      doorColor: 0xa16207,
    });
    this.doors['bedroom_door'] = bedroomDoor;
    this.group.add(bedroomDoor.group);

    // B. Workshop door removed (open archway entrance)

    // C. Basement Door (on right hallway wall at X = 1.8, Z = 3.5)
    const basementDoor = new HouseDoor({
      id: 'basement_door',
      name: 'Basement Door',
      roomA: 'hallway',
      roomB: 'basement',
      position: new THREE.Vector3(1.8, 0, 3.5),
      width: 1.3,
      height: 2.6,
      facingAxis: 'x',
      hingeSide: 'min', // hinge at Z = 2.85
      swingSign: 1, // swings into basement (X > 1.8)
      isLocked: true, // locked with latch
      lockedSpeaker: 'Zane',
      lockedText: '“The basement door is locked with a latch. That’s where Dad keeps the holiday decorations and camping gear.”',
      lockedVoice: 'zane',
      doorColor: 0x92400e,
    });
    this.doors['basement_door'] = basementDoor;
    this.group.add(basementDoor.group);

    // D. Restroom Door (at end of hallway at Z = 15.0, X = 0)
    const restroomDoor = new HouseDoor({
      id: 'restroom_door',
      name: 'Restroom Door',
      roomA: 'hallway',
      roomB: 'restroom',
      position: new THREE.Vector3(0, 0, 15.0),
      width: 1.3,
      height: 2.5,
      facingAxis: 'z',
      hingeSide: 'min', // hinge at X = -0.65
      swingSign: 1, // swings into restroom (Z > 15.0)
      isLocked: false,
      doorColor: 0xf8fafc, // clean white bathroom door
    });
    this.doors['restroom_door'] = restroomDoor;
    this.group.add(restroomDoor.group);
  }

  // =========================================================================
  // 2. ROOM: ZANE'S BEDROOM (Z: -9.0 to 0.0, X: -4.5 to 4.5)
  // =========================================================================
  private buildBedroom() {
    const grp = this.rooms.bedroom;

    const floorMat = createToonMaterial({ color: 0xa86e38, desaturate: 0.08 });
    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });
    const ceilingMat = createToonMaterial({ color: 0xe6d7c5, desaturate: 0.06 });

    // Floor: 9x9 centered at Z = -4.5
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -4.5);
    floor.receiveShadow = true;
    grp.add(floor);

    // Sunny patch on bedroom floor
    const sunPatchMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    });
    const sunPatch = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), sunPatchMat);
    sunPatch.rotation.x = -Math.PI / 2;
    sunPatch.position.set(0.3, 0.005, -6.7);
    grp.add(sunPatch);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.8, -4.5);
    grp.add(ceiling);

    // Back Window Wall (Z = -9.0)
    const backWallL = new THREE.Mesh(new THREE.BoxGeometry(3, 3.8, 0.2), wallMat);
    backWallL.position.set(-3, 1.9, -9.0);
    backWallL.receiveShadow = true;
    const backWallR = new THREE.Mesh(new THREE.BoxGeometry(3, 3.8, 0.2), wallMat);
    backWallR.position.set(3, 1.9, -9.0);
    backWallR.receiveShadow = true;
    const backWallTop = new THREE.Mesh(new THREE.BoxGeometry(3, 1.0, 0.2), wallMat);
    backWallTop.position.set(0, 3.3, -9.0);
    const backWallBottom = new THREE.Mesh(new THREE.BoxGeometry(3, 1.0, 0.2), wallMat);
    backWallBottom.position.set(0, 0.5, -9.0);
    grp.add(backWallL, backWallR, backWallTop, backWallBottom);

    // Left Wall (X = -4.5, Z: -9.0 to 0)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 9), wallMat);
    leftWall.position.set(-4.5, 1.9, -4.5);
    leftWall.receiveShadow = true;
    grp.add(leftWall);

    // Right Wall (X = 4.5, Z: -9.0 to 0)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 9), wallMat);
    rightWall.position.set(4.5, 1.9, -4.5);
    rightWall.receiveShadow = true;
    grp.add(rightWall);

    // Front Wall with Doorway at Z = 0
    // Left side: X from -4.5 to -0.65 (width 3.85, center -2.575)
    const frontWallL = new THREE.Mesh(new THREE.BoxGeometry(3.85, 3.8, 0.2), wallMat);
    frontWallL.position.set(-2.575, 1.9, 0);
    frontWallL.receiveShadow = true;

    // Right side: X from 0.65 to 4.5 (width 3.85, center 2.575)
    const frontWallR = new THREE.Mesh(new THREE.BoxGeometry(3.85, 3.8, 0.2), wallMat);
    frontWallR.position.set(2.575, 1.9, 0);
    frontWallR.receiveShadow = true;

    // Header over doorway: X from -0.65 to 0.65 (width 1.3), Y from 2.5 to 3.8 (height 1.3)
    const frontWallHeader = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.2), wallMat);
    frontWallHeader.position.set(0, 3.15, 0);
    frontWallHeader.receiveShadow = true;

    grp.add(frontWallL, frontWallR, frontWallHeader);

    // --- PROPS ---
    // 1. Bed (Warm sunny yellow quilt and oak wooden frame)
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-2.7, 0, -6.5);
    const bedFrameMat = createToonMaterial({ color: 0x92400e, desaturate: 0.12 });
    const quiltMat = createToonMaterial({ color: 0xfacc15, desaturate: 0.08 });
    const pillowMat = createToonMaterial({ color: 0xffffff, desaturate: 0.05 });

    const bedBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 3.2), bedFrameMat);
    bedBase.position.y = 0.225;
    bedBase.castShadow = true;
    bedBase.receiveShadow = true;
    addInkOutline(bedBase, 0.035);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.4, 0.2), bedFrameMat);
    headboard.position.set(0, 0.7, -1.5);
    headboard.castShadow = true;
    addInkOutline(headboard, 0.035);

    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 2.9), quiltMat);
    mattress.position.set(0, 0.5, 0.05);
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    addInkOutline(mattress, 0.035);

    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.65), pillowMat);
    pillow.position.set(0, 0.72, -1.0);
    pillow.castShadow = true;
    addInkOutline(pillow, 0.03);

    bedGroup.add(bedBase, headboard, mattress, pillow);
    grp.add(bedGroup);

    // 2. Desk with Crayons & Paper
    const deskGroup = new THREE.Group();
    deskGroup.position.set(2.4, 0, -6.7);
    const deskMat = createToonMaterial({ color: 0xa16207, desaturate: 0.12 });
    const paperMat = createToonMaterial({ color: 0xfcf8ec, desaturate: 0.05 });

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.4), deskMat);
    deskTop.position.y = 0.85;
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    addInkOutline(deskTop, 0.035);

    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), deskMat);
    leg1.position.set(-1.05, 0.425, -0.55);
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), deskMat);
    leg2.position.set(1.05, 0.425, -0.55);
    const leg3 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), deskMat);
    leg3.position.set(-1.05, 0.425, 0.55);
    const leg4 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), deskMat);
    leg4.position.set(1.05, 0.425, 0.55);
    deskGroup.add(deskTop, leg1, leg2, leg3, leg4);

    // Drawing paper on desk
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), paperMat);
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.08;
    paper.position.set(-0.2, 0.91, 0.1);
    addInkOutline(paper, 0.025);
    deskGroup.add(paper);

    // Crayon cup with colorful crayons
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.07, 0.16, 12),
      createToonMaterial({ color: 0xef4444, desaturate: 0.08 })
    );
    cup.position.set(0.8, 0.98, -0.3);
    addInkOutline(cup, 0.025);
    deskGroup.add(cup);

    const crayonColors = [0x3b82f6, 0xfacc15, 0x10b981, 0xf97316];
    for (let c = 0; c < 4; c++) {
      const cr = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6),
        createToonMaterial({ color: crayonColors[c], desaturate: 0.05 })
      );
      cr.position.set(0.78 + (c % 2) * 0.03, 1.04, -0.3 + (c > 1 ? 0.03 : -0.03));
      cr.rotation.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25);
      deskGroup.add(cr);
    }
    grp.add(deskGroup);

    // 3. Bookshelf
    const bookshelfGroup = new THREE.Group();
    bookshelfGroup.position.set(-3.8, 0, -4.0);
    const shelfMat = createToonMaterial({ color: 0x92400e, desaturate: 0.12 });
    const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 1.8), shelfMat);
    shelfBody.position.y = 1.2;
    shelfBody.castShadow = true;
    shelfBody.receiveShadow = true;
    addInkOutline(shelfBody, 0.035);
    bookshelfGroup.add(shelfBody);

    // Colorful book spines
    const bookColors = [0xef4444, 0x3b82f6, 0x10b981, 0xfacc15, 0x8b5cf6];
    for (let b = 0; b < 12; b++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.35, 0.08),
        createToonMaterial({ color: bookColors[b % bookColors.length], desaturate: 0.08 })
      );
      const shelfY = 0.5 + Math.floor(b / 4) * 0.65;
      book.position.set(0.18, shelfY, -0.55 + (b % 4) * 0.32);
      addInkOutline(book, 0.02);
      bookshelfGroup.add(book);
    }
    grp.add(bookshelfGroup);

    // 4. Toy Cabinet
    const cabinetGroup = new THREE.Group();
    cabinetGroup.position.set(3.6, 0, -1.7);
    const cabinetMat = createToonMaterial({ color: 0xb45309, desaturate: 0.12 });
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 2.0), cabinetMat);
    cabBody.position.y = 0.9;
    cabBody.castShadow = true;
    cabBody.receiveShadow = true;
    addInkOutline(cabBody, 0.035);
    cabinetGroup.add(cabBody);
    grp.add(cabinetGroup);

    // 5. Wall Crayon Drawings
    const createDrawingMesh = (type: 'spaceship' | 'robot' | 'planet', pos: [number, number, number], rotY: number) => {
      const dg = new THREE.Group();
      dg.position.set(...pos);
      dg.rotation.y = rotY;
      const pMat = new THREE.MeshBasicMaterial({ map: createCrayonDrawingTexture(type), side: THREE.DoubleSide });
      const pMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.05), pMat);
      addInkOutline(pMesh, 0.025);
      dg.add(pMesh);
      grp.add(dg);
    };

    createDrawingMesh('spaceship', [1.2, 2.1, -8.88], 0);
    createDrawingMesh('robot', [-4.38, 2.2, -6.5], Math.PI / 2);
    createDrawingMesh('planet', [-4.38, 2.2, -2.5], Math.PI / 2);

    // 6. Window Outside Scenery
    const windowFrameMat = createToonMaterial({ color: 0xffffff, desaturate: 0.05 });
    const winGroup = new THREE.Group();
    winGroup.position.set(0, 1.9, -9.0);

    const wFrameT = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.1), windowFrameMat);
    wFrameT.position.y = 0.9;
    const wFrameB = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.1), windowFrameMat);
    wFrameB.position.y = -0.9;
    const wFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.1), windowFrameMat);
    wFrameL.position.x = -1.15;
    const wFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.1), windowFrameMat);
    wFrameR.position.x = 1.15;
    const wCross = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.08), windowFrameMat);
    const wCrossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.08), windowFrameMat);
    winGroup.add(wFrameT, wFrameB, wFrameL, wFrameR, wCross, wCrossV);

    // Outside Sunny Vista Plane
    const outsideSkyMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
    const outsideSky = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), outsideSkyMat);
    outsideSky.position.set(0, 1.0, -1.5);
    winGroup.add(outsideSky);

    // Green tree outside
    const treeTrunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 2.5, 8),
      createToonMaterial({ color: 0x78350f, desaturate: 0.1 })
    );
    treeTrunk.position.set(1.5, 0.3, -1.3);
    const treeLeaves = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 8, 8),
      createToonMaterial({ color: 0x22c55e, desaturate: 0.08 })
    );
    treeLeaves.position.set(1.5, 1.8, -1.3);
    winGroup.add(treeTrunk, treeLeaves);
    grp.add(winGroup);

    // Bedroom Interaction Nodes
    this.roomInteractionNodes.bedroom = [
      {
        id: 'bedroom_drawings',
        name: 'Crayon Drawings',
        position: [1.2, 1.5, -6.8],
        promptKey: 'E',
        promptVerb: 'Look',
        interactRadius: 2.2,
        description: 'Vivid crayon drawings of Starship Zane dodging asteroids and laser fire.',
      },
      {
        id: 'bedroom_window',
        name: 'Sunny Window',
        position: [0, 1.6, -8.5],
        promptKey: 'E',
        promptVerb: 'Look Outside',
        interactRadius: 2.2,
        description: 'Warm morning sunlight streaming through the window into Zane’s room.',
      },
      {
        id: 'bedroom_cabinet',
        name: 'Toy Cabinet',
        position: [3.4, 1.2, -1.7],
        promptKey: 'E',
        promptVerb: 'Open',
        interactRadius: 2.0,
        description: 'Zane’s wooden toy cabinet packed with spaceship models and building blocks.',
      },
      {
        id: 'bedroom_bookshelf',
        name: 'Adventure Bookshelf',
        position: [-3.5, 1.2, -4.0],
        promptKey: 'E',
        promptVerb: 'Look',
        interactRadius: 2.0,
        description: 'Shelves lined with colorful space comic books and adventure novels.',
      },
    ];

    // Bedroom Colliders
    this.roomColliders.bedroom = [
      // Outer walls
      { id: 'b_wall_back', name: 'Bedroom Back Wall', minX: -4.5, maxX: 4.5, minZ: -9.15, maxZ: -8.85, height: 3.8 },
      { id: 'b_wall_left', name: 'Bedroom Left Wall', minX: -4.65, maxX: -4.35, minZ: -9.0, maxZ: 0, height: 3.8 },
      { id: 'b_wall_right', name: 'Bedroom Right Wall', minX: 4.35, maxX: 4.65, minZ: -9.0, maxZ: 0, height: 3.8 },
      { id: 'b_wall_front_l', name: 'Bedroom Front Wall Left', minX: -4.5, maxX: -0.65, minZ: -0.15, maxZ: 0.15, height: 3.8 },
      { id: 'b_wall_front_r', name: 'Bedroom Front Wall Right', minX: 0.65, maxX: 4.5, minZ: -0.15, maxZ: 0.15, height: 3.8 },

      // Furniture
      { id: 'b_bed', name: 'Bed', minX: -3.9, maxX: -1.5, minZ: -8.2, maxZ: -4.8, height: 1.4 },
      { id: 'b_desk', name: 'Study Desk', minX: 1.1, maxX: 3.7, minZ: -7.5, maxZ: -5.9, height: 1.0 },
      { id: 'b_shelf', name: 'Bookshelf', minX: -4.35, maxX: -3.25, minZ: -5.0, maxZ: -3.0, height: 2.4 },
      { id: 'b_cab', name: 'Toy Cabinet', minX: 3.0, maxX: 4.35, minZ: -2.8, maxZ: -0.6, height: 1.8 },
    ];
  }

  // =========================================================================
  // 3. ROOM: CENTRAL HALLWAY (Z: 0.0 to 15.0, X: -1.8 to 1.8)
  // =========================================================================
  private buildHallway() {
    const grp = this.rooms.hallway;

    const floorMat = createToonMaterial({ color: 0xa86e38, desaturate: 0.08 });
    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });
    const ceilingMat = createToonMaterial({ color: 0xe6d7c5, desaturate: 0.06 });

    // Floor: width 3.6, length 15 (Z: 0 to 15)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 15), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 7.5);
    floor.receiveShadow = true;
    grp.add(floor);

    // Runner rug
    const rugMat = createToonMaterial({ color: 0x1e3a8a, desaturate: 0.1 });
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 13.5), rugMat);
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0, 0.012, 7.5);
    runner.receiveShadow = true;
    addInkOutline(runner, 0.02);
    grp.add(runner);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 15), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.8, 7.5);
    grp.add(ceiling);

    // Left walls:
    // Left Wall 1: Z from 0.0 to 2.85
    const leftWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 2.85), wallMat);
    leftWall1.position.set(-1.8, 1.9, 1.425);
    leftWall1.receiveShadow = true;

    // Header over Workshop Door (X = -1.8, Z: 2.85 to 4.15, Y: 2.6 to 3.8)
    const leftDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.3), wallMat);
    leftDoorHeader.position.set(-1.8, 3.2, 3.5);

    // Left Wall 2: Z from 4.15 to 5.25
    const leftWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 1.1), wallMat);
    leftWall2.position.set(-1.8, 1.9, 4.7);
    leftWall2.receiveShadow = true;

    // Archway Header over Kitchen Opening (X = -1.8, Z: 5.25 to 11.65, Y: 3.2 to 3.8)
    const kitchenArch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 6.4), wallMat);
    kitchenArch.position.set(-1.8, 3.5, 8.45);

    // Left Wall 3: Z from 11.65 to 15.0
    const leftWall3 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 3.35), wallMat);
    leftWall3.position.set(-1.8, 1.9, 13.325);
    leftWall3.receiveShadow = true;

    grp.add(leftWall1, leftDoorHeader, leftWall2, kitchenArch, leftWall3);

    // Right walls:
    // Right Wall 1: Z from 0.0 to 2.85
    const rightWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 2.85), wallMat);
    rightWall1.position.set(1.8, 1.9, 1.425);
    rightWall1.receiveShadow = true;

    // Header over Basement Door (X = 1.8, Z: 2.85 to 4.15, Y: 2.6 to 3.8)
    const rightDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.3), wallMat);
    rightDoorHeader.position.set(1.8, 3.2, 3.5);

    // Right Wall 2: Z from 4.15 to 5.25
    const rightWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 1.1), wallMat);
    rightWall2.position.set(1.8, 1.9, 4.7);
    rightWall2.receiveShadow = true;

    // Archway Header over Living Room Opening (X = 1.8, Z: 5.25 to 11.65, Y: 3.2 to 3.8)
    const livingArch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 6.4), wallMat);
    livingArch.position.set(1.8, 3.5, 8.45);

    // Right Wall 3: Z from 11.65 to 15.0
    const rightWall3 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 3.35), wallMat);
    rightWall3.position.set(1.8, 1.9, 13.325);
    rightWall3.receiveShadow = true;

    grp.add(rightWall1, rightDoorHeader, rightWall2, livingArch, rightWall3);

    // Restroom Wall at Z = 15.0 (with doorway from -0.65 to 0.65)
    const restWallL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.8, 0.2), wallMat);
    restWallL.position.set(-1.225, 1.9, 15.0);
    restWallL.receiveShadow = true;

    const restWallR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.8, 0.2), wallMat);
    restWallR.position.set(1.225, 1.9, 15.0);
    restWallR.receiveShadow = true;

    const restWallHeader = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.2), wallMat);
    restWallHeader.position.set(0, 3.15, 15.0);
    restWallHeader.receiveShadow = true;

    grp.add(restWallL, restWallR, restWallHeader);

    // Hallway ceiling dome lights
    for (let z = 3; z <= 13; z += 4.5) {
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
      grp.add(fixture, bulb);
    }

    // Hallway Colliders
    this.roomColliders.hallway = [
      // Left walls
      { id: 'h_left_1', name: 'Hall Left 1', minX: -1.95, maxX: -1.65, minZ: 0.0, maxZ: 2.85, height: 3.8 },
      { id: 'h_left_2', name: 'Hall Left 2', minX: -1.95, maxX: -1.65, minZ: 4.15, maxZ: 5.25, height: 3.8 },
      { id: 'h_left_3', name: 'Hall Left 3', minX: -1.95, maxX: -1.65, minZ: 11.65, maxZ: 15.0, height: 3.8 },

      // Right walls
      { id: 'h_right_1', name: 'Hall Right 1', minX: 1.65, maxX: 1.95, minZ: 0.0, maxZ: 2.85, height: 3.8 },
      { id: 'h_right_2', name: 'Hall Right 2', minX: 1.65, maxX: 1.95, minZ: 4.15, maxZ: 5.25, height: 3.8 },
      { id: 'h_right_3', name: 'Hall Right 3', minX: 1.65, maxX: 1.95, minZ: 11.65, maxZ: 15.0, height: 3.8 },

      // Restroom door flanking walls
      { id: 'h_rest_l', name: 'Restroom Wall L', minX: -1.95, maxX: -0.65, minZ: 14.85, maxZ: 15.15, height: 3.8 },
      { id: 'h_rest_r', name: 'Restroom Wall R', minX: 0.65, maxX: 1.95, minZ: 14.85, maxZ: 15.15, height: 3.8 },
    ];
  }

  // =========================================================================
  // 4. ROOM: FAMILY KITCHEN (X: -8.85 to -1.8, Z: 5.25 to 11.75)
  // =========================================================================
  private buildKitchen() {
    const grp = this.rooms.kitchen;
    const floorMat = createToonMaterial({ color: 0xc4905d, desaturate: 0.08 });
    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });

    // Floor: width 7.05, length 6.5
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.05, 6.5), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-5.325, 0, 8.5);
    floor.receiveShadow = true;
    grp.add(floor);

    // Walls
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 6.5), wallMat);
    wallLeft.position.set(-8.85, 1.9, 8.5);
    wallLeft.receiveShadow = true;

    const wallFar = new THREE.Mesh(new THREE.BoxGeometry(7.05, 3.8, 0.2), wallMat);
    wallFar.position.set(-5.325, 1.9, 11.75);
    wallFar.receiveShadow = true;

    const wallNear = new THREE.Mesh(new THREE.BoxGeometry(7.05, 3.8, 0.2), wallMat);
    wallNear.position.set(-5.325, 1.9, 5.25);
    wallNear.receiveShadow = true;

    grp.add(wallLeft, wallFar, wallNear);

    // Counter
    const counterMat = createToonMaterial({ color: 0xf5ebe1, desaturate: 0.05 });
    const counterBaseMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.12 });

    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 4.0), counterBaseMat);
    counter.position.set(-8.0, 0.425, 8.5);
    counter.castShadow = true;
    counter.receiveShadow = true;
    addInkOutline(counter, 0.035);

    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 4.1), counterMat);
    counterTop.position.set(-8.0, 0.89, 8.5);
    counterTop.castShadow = true;
    addInkOutline(counterTop, 0.03);
    grp.add(counter, counterTop);

    // Refrigerator
    const fridgeMat = createToonMaterial({ color: 0xf8fafc, desaturate: 0.05 });
    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.1), fridgeMat);
    fridge.position.set(-7.9, 1.1, 6.0);
    fridge.castShadow = true;
    fridge.receiveShadow = true;
    addInkOutline(fridge, 0.035);
    grp.add(fridge);

    // Fruit Bowl & Apples
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.15, 0.12, 12),
      createToonMaterial({ color: 0xffffff, desaturate: 0.05 })
    );
    bowl.position.set(-8.0, 0.98, 8.5);
    addInkOutline(bowl, 0.025);

    const appleMat = createToonMaterial({ color: 0xef4444, desaturate: 0.08 });
    const apple1 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), appleMat);
    apple1.position.set(-8.0, 1.06, 8.5);
    const apple2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), appleMat);
    apple2.position.set(-7.95, 1.06, 8.56);
    grp.add(bowl, apple1, apple2);

    // Toaster
    const toaster = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.2, 0.35),
      createToonMaterial({ color: 0xe2e8f0, desaturate: 0.05 })
    );
    toaster.position.set(-8.0, 1.02, 9.4);
    addInkOutline(toaster, 0.025);
    grp.add(toaster);

    // Helper function to create brown beer bottle mesh
    const makeHWBeerBottle = (isFront: boolean = false) => {
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

    // Tall Wall Shelf above Refrigerator Area (about 2.4 units high)
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-7.9, 2.4, 6.0);

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

    for (let i = 0; i < 5; i++) {
      const b = makeHWBeerBottle(false);
      b.position.set(-0.44 + i * 0.22, 0.03, -0.08);
      shelfGroup.add(b);
    }
    const frontBottleHW = makeHWBeerBottle(true);
    frontBottleHW.position.set(0.0, 0.03, 0.12);
    shelfGroup.add(frontBottleHW);

    grp.add(shelfGroup);

    // Pushed-in Wooden Chair near Refrigerator (tagged quest_chair)
    const questChairHW = new THREE.Group();
    questChairHW.name = 'quest_chair';
    questChairHW.userData = { tag: 'quest_chair', id: 'quest_chair' };
    questChairHW.position.set(-7.25, 0, 6.1);
    questChairHW.rotation.y = -Math.PI / 6;

    const qChairMatHW = createToonMaterial({ color: 0x78350f, desaturate: 0.1 });
    const qSeatHW = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), qChairMatHW);
    qSeatHW.position.y = 0.42;
    qSeatHW.name = 'quest_chair';
    qSeatHW.userData = { tag: 'quest_chair', id: 'quest_chair' };
    qSeatHW.castShadow = true;
    addInkOutline(qSeatHW, 0.02);

    const qBackHW = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.04), qChairMatHW);
    qBackHW.position.set(0, 0.65, -0.19);
    qBackHW.name = 'quest_chair';
    qBackHW.userData = { tag: 'quest_chair', id: 'quest_chair' };
    qBackHW.castShadow = true;
    addInkOutline(qBackHW, 0.02);

    for (const lx of [-0.18, 0.18]) {
      for (const lz of [-0.18, 0.18]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.40, 0.04), qChairMatHW);
        leg.position.set(lx, 0.20, lz);
        leg.name = 'quest_chair';
        leg.userData = { tag: 'quest_chair', id: 'quest_chair' };
        questChairHW.add(leg);
      }
    }
    questChairHW.add(qSeatHW, qBackHW);
    grp.add(questChairHW);

    // Empty bottles on counter
    const eb1 = makeHWBeerBottle(false);
    eb1.position.set(-8.0, 0.93, 8.2);
    const eb2 = makeHWBeerBottle(false);
    eb2.position.set(-8.1, 0.93, 8.8);
    const eb3 = makeHWBeerBottle(false);
    eb3.position.set(-7.9, 0.97, 9.1);
    eb3.rotation.z = Math.PI / 2;
    grp.add(eb1, eb2, eb3);

    // Bottle cap on floor
    const bCapHW = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.01, 12),
      createToonMaterial({ color: 0xd97706 })
    );
    bCapHW.position.set(-7.5, 0.005, 6.6);
    addInkOutline(bCapHW, 0.01);
    grp.add(bCapHW);

    // Kitchen Interaction Node
    this.roomInteractionNodes.kitchen = [
      {
        id: 'house_kitchen',
        name: 'Kitchen Counter',
        position: [-6.8, 1.2, 8.5],
        promptKey: 'E',
        promptVerb: 'Look',
        interactRadius: 2.6,
        description: 'Clean kitchen counter with fresh fruit and toaster.',
      },
    ];

    // Kitchen Colliders
    this.roomColliders.kitchen = [
      { id: 'k_wall_left', name: 'Kitchen Left Wall', minX: -8.95, maxX: -8.75, minZ: 5.25, maxZ: 11.75, height: 3.8 },
      { id: 'k_wall_far', name: 'Kitchen Far Wall', minX: -8.85, maxX: -1.8, minZ: 11.65, maxZ: 11.85, height: 3.8 },
      { id: 'k_wall_near', name: 'Kitchen Near Wall', minX: -8.85, maxX: -1.8, minZ: 5.15, maxZ: 5.35, height: 3.8 },
      { id: 'k_counter', name: 'Kitchen Counter', minX: -8.6, maxX: -7.4, minZ: 6.5, maxZ: 10.5, height: 1.1 },
      { id: 'k_fridge', name: 'Refrigerator', minX: -8.5, maxX: -7.3, minZ: 5.4, maxZ: 6.6, height: 2.2 },
      { id: 'k_beer_shelf', name: 'Wall Beer Shelf', minX: -8.5, maxX: -7.3, minZ: 5.8, maxZ: 6.2, height: 2.5 },
      { id: 'k_quest_chair', name: 'Kitchen Wooden Chair', minX: -7.5, maxX: -7.0, minZ: 5.8, maxZ: 6.4, height: 0.9 },
    ];
  }

  // =========================================================================
  // 5. ROOM: COZY LIVING ROOM (X: 1.8 to 8.85, Z: 5.25 to 11.75)
  // =========================================================================
  private buildLivingRoom() {
    const grp = this.rooms.living_room;
    const floorMat = createToonMaterial({ color: 0xd4a373, desaturate: 0.1 });
    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.05, 6.5), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(5.325, 0, 8.5);
    floor.receiveShadow = true;
    grp.add(floor);

    // Cream living room rug
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 4.5),
      createToonMaterial({ color: 0xfef3c7, desaturate: 0.08 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(5.5, 0.015, 8.5);
    rug.receiveShadow = true;
    addInkOutline(rug, 0.02);
    grp.add(rug);

    // Walls
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 6.5), wallMat);
    wallRight.position.set(8.85, 1.9, 8.5);
    wallRight.receiveShadow = true;

    const wallFar = new THREE.Mesh(new THREE.BoxGeometry(7.05, 3.8, 0.2), wallMat);
    wallFar.position.set(5.325, 1.9, 11.75);
    wallFar.receiveShadow = true;

    const wallNear = new THREE.Mesh(new THREE.BoxGeometry(7.05, 3.8, 0.2), wallMat);
    wallNear.position.set(5.325, 1.9, 5.25);
    wallNear.receiveShadow = true;

    grp.add(wallRight, wallFar, wallNear);

    // Sofa
    const sofaGroup = new THREE.Group();
    sofaGroup.position.set(6.8, 0, 8.5);
    sofaGroup.rotation.y = -Math.PI / 2;

    const sofaMat = createToonMaterial({ color: 0x2563eb, desaturate: 0.08 });
    const cushionMat = createToonMaterial({ color: 0xfacc15, desaturate: 0.08 });

    const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.9), sofaMat);
    sofaBase.position.y = 0.25;
    sofaBase.castShadow = true;
    addInkOutline(sofaBase, 0.035);

    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.25), sofaMat);
    sofaBack.position.set(0, 0.7, -0.35);
    sofaBack.castShadow = true;
    addInkOutline(sofaBack, 0.035);

    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.12), cushionMat);
    c1.position.set(-0.8, 0.55, -0.2);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.12), cushionMat);
    c2.position.set(0.8, 0.55, -0.2);
    sofaGroup.add(sofaBase, sofaBack, c1, c2);
    grp.add(sofaGroup);

    // Coffee table
    const tableMat = createToonMaterial({ color: 0xa16207, desaturate: 0.12 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.8), tableMat);
    table.position.set(5.4, 0.18, 8.5);
    table.castShadow = true;
    addInkOutline(table, 0.035);
    grp.add(table);

    // TV Credenza and Screen
    const tvGroup = new THREE.Group();
    tvGroup.position.set(3.6, 0, 8.5);

    const credenza = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 2.2), tableMat);
    credenza.position.y = 0.35;
    addInkOutline(credenza, 0.035);

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
    tvGroup.add(credenza, tvScreen, tvPicture);
    grp.add(tvGroup);

    // Living Room Interaction Node
    this.roomInteractionNodes.living_room = [
      {
        id: 'house_tv',
        name: 'Living Room TV',
        position: [4.2, 1.4, 8.5],
        promptKey: 'E',
        promptVerb: 'Watch TV',
        interactRadius: 2.8,
        description: 'Cozy living room television showing morning cartoons and neighborhood news.',
      },
    ];

    // Living Room Colliders
    this.roomColliders.living_room = [
      { id: 'lr_wall_right', name: 'Living Room Right Wall', minX: 8.75, maxX: 8.95, minZ: 5.25, maxZ: 11.75, height: 3.8 },
      { id: 'lr_wall_far', name: 'Living Room Far Wall', minX: 1.8, maxX: 8.85, minZ: 11.65, maxZ: 11.85, height: 3.8 },
      { id: 'lr_wall_near', name: 'Living Room Near Wall', minX: 1.8, maxX: 8.85, minZ: 5.15, maxZ: 5.35, height: 3.8 },
      { id: 'lr_sofa', name: 'Living Room Sofa', minX: 6.4, maxX: 7.6, minZ: 7.1, maxZ: 9.9, height: 1.1 },
      { id: 'lr_table', name: 'Coffee Table', minX: 4.6, maxX: 6.2, minZ: 8.0, maxZ: 9.0, height: 0.6 },
      { id: 'lr_credenza', name: 'TV Credenza', minX: 3.2, maxX: 4.1, minZ: 7.3, maxZ: 9.7, height: 1.5 },
    ];
  }

  // =========================================================================
  // 6. ROOM: DAD'S WORKSHOP (X: -6.0 to -1.8, Z: 0.5 to 4.8)
  // =========================================================================
  private buildWorkshop() {
    const grp = this.rooms.workshop;
    const floorMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.12 });
    const wallMat = createToonMaterial({ color: 0xd6c7b2, desaturate: 0.08 });
    const benchWoodMat = createToonMaterial({ color: 0xa16207, desaturate: 0.12 });
    const metalMat = createToonMaterial({ color: 0x94a3b8, desaturate: 0.08 });

    // Floor: width 4.2 (X: -6.0 to -1.8), length 4.3 (Z: 0.5 to 4.8)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.3), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-3.9, 0, 2.65);
    floor.receiveShadow = true;
    grp.add(floor);

    // Walls
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 4.3), wallMat);
    wallLeft.position.set(-6.0, 1.9, 2.65);
    wallLeft.receiveShadow = true;

    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.8, 0.2), wallMat);
    wallBack.position.set(-3.9, 1.9, 0.5);
    wallBack.receiveShadow = true;

    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.8, 0.2), wallMat);
    wallFront.position.set(-3.9, 1.9, 4.8);
    wallFront.receiveShadow = true;

    // Right wall parts flanking the workshop doorway (which is at Z = 3.5, width 1.3)
    const wallRight1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 2.35), wallMat);
    wallRight1.position.set(-1.8, 1.9, 1.675);

    const wallRight2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 0.65), wallMat);
    wallRight2.position.set(-1.8, 1.9, 4.475);

    grp.add(wallLeft, wallBack, wallFront, wallRight1, wallRight2);

    // Warm overhead hanging work pendant lamp
    const pendantCord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 1.2, 8),
      createToonMaterial({ color: 0x1e293b, desaturate: 0.1 })
    );
    pendantCord.position.set(-4.2, 3.2, 2.65);

    const pendantShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.25, 12, 1, true),
      createToonMaterial({ color: 0x22c55e, desaturate: 0.1 }) // vintage green enamel workshop shade
    );
    pendantShade.position.set(-4.2, 2.5, 2.65);

    const pendantBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    pendantBulb.position.set(-4.2, 2.45, 2.65);

    const workLight = new THREE.PointLight(0xffd166, 1.6, 7.0);
    workLight.position.set(-4.2, 2.4, 2.65);
    workLight.castShadow = true;
    grp.add(pendantCord, pendantShade, pendantBulb, workLight);
    this.roomLights.workshop.push(workLight);

    // Sturdy Wooden Workbench along the far wall
    const benchGroup = new THREE.Group();
    benchGroup.position.set(-5.3, 0, 2.65);

    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.6), benchWoodMat);
    benchTop.position.y = 0.94;
    benchTop.castShadow = true;
    benchTop.receiveShadow = true;
    addInkOutline(benchTop, 0.035);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.94, 0.14), benchWoodMat);
    legL.position.set(0.35, 0.47, -1.1);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.94, 0.14), benchWoodMat);
    legR.position.set(0.35, 0.47, 1.1);
    const legBL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.94, 0.14), benchWoodMat);
    legBL.position.set(-0.35, 0.47, -1.1);
    const legBR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.94, 0.14), benchWoodMat);
    legBR.position.set(-0.35, 0.47, 1.1);

    benchGroup.add(benchTop, legL, legR, legBL, legBR);

    // Bench Vise on corner
    const vise = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.25), metalMat);
    vise.position.set(0.3, 1.08, 1.05);
    addInkOutline(vise, 0.025);
    benchGroup.add(vise);

    // Hand tools on bench (hammer & wrench)
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.06), metalMat);
    hammerHead.position.set(0.1, 1.03, -0.4);
    const hammerHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8),
      createToonMaterial({ color: 0x92400e, desaturate: 0.1 })
    );
    hammerHandle.rotation.x = Math.PI / 2;
    hammerHandle.position.set(0.1, 1.02, -0.22);
    benchGroup.add(hammerHead, hammerHandle);

    grp.add(benchGroup);

    // Wooden wall shelves with paint cans & project jars
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 2.2), benchWoodMat);
    shelf.position.set(-3.5, 2.1, 0.7);
    addInkOutline(shelf, 0.03);
    grp.add(shelf);

    const canColors = [0x3b82f6, 0xef4444, 0xfacc15, 0x10b981];
    for (let c = 0; c < 4; c++) {
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12),
        createToonMaterial({ color: canColors[c], desaturate: 0.08 })
      );
      can.position.set(-3.5, 2.23, -0.2 + c * 0.4);
      addInkOutline(can, 0.02);
      grp.add(can);
    }

    // Wood scraps crate on floor
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      createToonMaterial({ color: 0xa16207, desaturate: 0.12 })
    );
    crate.position.set(-3.2, 0.25, 4.1);
    addInkOutline(crate, 0.03);
    grp.add(crate);

    // Workshop Interaction Node
    this.roomInteractionNodes.workshop = [
      {
        id: 'workshop_workbench',
        name: "Dad's Workbench",
        position: [-4.6, 1.2, 2.65],
        promptKey: 'E',
        promptVerb: 'Inspect',
        interactRadius: 2.2,
        description: 'Dad’s sturdy timber workbench with vise, tools, and blueprints for his carpentry projects.',
      },
    ];

    // Workshop Colliders
    this.roomColliders.workshop = [
      { id: 'w_wall_left', name: 'Workshop Left Wall', minX: -6.15, maxX: -5.85, minZ: 0.5, maxZ: 4.8, height: 3.8 },
      { id: 'w_wall_back', name: 'Workshop Back Wall', minX: -6.0, maxX: -1.8, minZ: 0.35, maxZ: 0.65, height: 3.8 },
      { id: 'w_wall_front', name: 'Workshop Front Wall', minX: -6.0, maxX: -1.8, minZ: 4.65, maxZ: 4.95, height: 3.8 },
      { id: 'w_wall_right_1', name: 'Workshop Right Wall 1', minX: -1.95, maxX: -1.65, minZ: 0.5, maxZ: 2.85, height: 3.8 },
      { id: 'w_wall_right_2', name: 'Workshop Right Wall 2', minX: -1.95, maxX: -1.65, minZ: 4.15, maxZ: 4.8, height: 3.8 },
      { id: 'w_bench', name: 'Workbench', minX: -5.9, maxX: -4.7, minZ: 1.2, maxZ: 4.1, height: 1.2 },
      { id: 'w_crate', name: 'Scraps Crate', minX: -3.6, maxX: -2.8, minZ: 3.7, maxZ: 4.5, height: 0.6 },
    ];
  }

  // =========================================================================
  // 7. ROOM: FAMILY RESTROOM (X: -2.0 to 2.0, Z: 15.0 to 19.5)
  // =========================================================================
  private buildRestroom() {
    const grp = this.rooms.restroom;
    const tileMat = createToonMaterial({ color: 0xf1f5f9, desaturate: 0.05 });
    const wallTileMat = createToonMaterial({ color: 0xe2e8f0, desaturate: 0.06 });
    const porcelainMat = createToonMaterial({ color: 0xffffff, desaturate: 0.02 });
    const chromeMat = createToonMaterial({ color: 0x94a3b8, desaturate: 0.05 });

    // Floor: width 4.0 (X: -2.0 to 2.0), length 4.5 (Z: 15.0 to 19.5)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.5), tileMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 17.25);
    floor.receiveShadow = true;
    grp.add(floor);

    // Walls
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 4.5), wallTileMat);
    wallLeft.position.set(-2.0, 1.9, 17.25);
    wallLeft.receiveShadow = true;

    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 4.5), wallTileMat);
    wallRight.position.set(2.0, 1.9, 17.25);
    wallRight.receiveShadow = true;

    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.8, 0.2), wallTileMat);
    wallBack.position.set(0, 1.9, 19.5);
    wallBack.receiveShadow = true;

    grp.add(wallLeft, wallRight, wallBack);

    // Soft warm bathroom ceiling light
    const vanityLight = new THREE.PointLight(0xffeedd, 1.4, 6.0);
    vanityLight.position.set(0, 3.2, 17.25);
    vanityLight.castShadow = true;
    grp.add(vanityLight);
    this.roomLights.restroom.push(vanityLight);

    // Porcelain Vanity Sink with Mirror
    const vanityGroup = new THREE.Group();
    vanityGroup.position.set(-1.3, 0, 17.25);

    const vanityBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.85, 1.1),
      createToonMaterial({ color: 0x0284c7, desaturate: 0.08 }) // marine blue vanity cabinet
    );
    vanityBase.position.y = 0.425;
    addInkOutline(vanityBase, 0.035);

    const sinkTop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 1.15), porcelainMat);
    sinkTop.position.y = 0.9;
    sinkTop.castShadow = true;
    addInkOutline(sinkTop, 0.03);

    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), chromeMat);
    faucet.position.set(-0.25, 1.04, 0);
    addInkOutline(faucet, 0.02);

    // Framed Mirror on wall
    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.2),
      createToonMaterial({ color: 0xbae6fd, desaturate: 0.05 })
    );
    mirror.position.set(0.38, 1.7, 0);
    mirror.rotation.y = Math.PI / 2;
    addInkOutline(mirror, 0.025);

    vanityGroup.add(vanityBase, sinkTop, faucet, mirror);
    grp.add(vanityGroup);

    // Bathtub / Shower along back wall
    const tubGroup = new THREE.Group();
    tubGroup.position.set(0, 0, 18.8);

    const tub = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.65, 1.1), porcelainMat);
    tub.position.y = 0.325;
    tub.castShadow = true;
    addInkOutline(tub, 0.035);

    const showerCurtain = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.5),
      createToonMaterial({ color: 0x7dd3fc, desaturate: 0.08 })
    );
    showerCurtain.position.set(0, 1.9, -0.45);
    addInkOutline(showerCurtain, 0.025);

    tubGroup.add(tub, showerCurtain);
    grp.add(tubGroup);

    // Porcelain Toilet
    const toiletGroup = new THREE.Group();
    toiletGroup.position.set(1.3, 0, 17.25);

    const toiletBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.65), porcelainMat);
    toiletBase.position.y = 0.225;
    addInkOutline(toiletBase, 0.03);

    const toiletTank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.6), porcelainMat);
    toiletTank.position.set(0.2, 0.65, 0);
    addInkOutline(toiletTank, 0.03);

    toiletGroup.add(toiletBase, toiletTank);
    grp.add(toiletGroup);

    // Restroom Interaction Node
    this.roomInteractionNodes.restroom = [
      {
        id: 'restroom_vanity',
        name: 'Bathroom Vanity',
        position: [-0.9, 1.2, 17.25],
        promptKey: 'E',
        promptVerb: 'Inspect',
        interactRadius: 2.0,
        description: 'Clean porcelain vanity sink and brightly lit mirror.',
      },
    ];

    // Restroom Colliders
    this.roomColliders.restroom = [
      { id: 'r_wall_left', name: 'Restroom Left Wall', minX: -2.15, maxX: -1.85, minZ: 15.0, maxZ: 19.5, height: 3.8 },
      { id: 'r_wall_right', name: 'Restroom Right Wall', minX: 1.85, maxX: 2.15, minZ: 15.0, maxZ: 19.5, height: 3.8 },
      { id: 'r_wall_back', name: 'Restroom Back Wall', minX: -2.0, maxX: 2.0, minZ: 19.35, maxZ: 19.65, height: 3.8 },
      { id: 'r_vanity', name: 'Sink Vanity', minX: -1.9, maxX: -0.8, minZ: 16.6, maxZ: 17.9, height: 1.0 },
      { id: 'r_tub', name: 'Bathtub', minX: -1.8, maxX: 1.8, minZ: 18.2, maxZ: 19.4, height: 1.2 },
      { id: 'r_toilet', name: 'Toilet', minX: 0.9, maxX: 1.8, minZ: 16.8, maxZ: 17.7, height: 0.9 },
    ];
  }

  // =========================================================================
  // 8. ROOM: BASEMENT & STAIRS (X: 1.8 to 6.2, Z: 0.5 to 4.8)
  // =========================================================================
  private buildBasement() {
    const grp = this.rooms.basement;
    const stoneFloorMat = createToonMaterial({ color: 0x78716c, desaturate: 0.1 });
    const stoneWallMat = createToonMaterial({ color: 0xa8a29e, desaturate: 0.1 });
    const woodMat = createToonMaterial({ color: 0x92400e, desaturate: 0.12 });
    const boxMat = createToonMaterial({ color: 0xd97706, desaturate: 0.12 });

    // Floor: width 4.4 (X: 1.8 to 6.2), length 4.3 (Z: 0.5 to 4.8)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.3), stoneFloorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(4.0, -0.6, 2.65);
    floor.receiveShadow = true;
    grp.add(floor);

    // Walls
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.4, 4.3), stoneWallMat);
    wallRight.position.set(6.2, 1.6, 2.65);
    wallRight.receiveShadow = true;

    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 0.2), stoneWallMat);
    wallBack.position.set(4.0, 1.6, 0.5);
    wallBack.receiveShadow = true;

    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 0.2), stoneWallMat);
    wallFront.position.set(4.0, 1.6, 4.8);
    wallFront.receiveShadow = true;

    // Left wall parts flanking basement doorway (Z = 3.5, width 1.3)
    const wallLeft1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.4, 2.35), stoneWallMat);
    wallLeft1.position.set(1.8, 1.6, 1.675);

    const wallLeft2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.4, 0.65), stoneWallMat);
    wallLeft2.position.set(1.8, 1.6, 4.475);

    grp.add(wallRight, wallBack, wallFront, wallLeft1, wallLeft2);

    // Wooden stairs descending into basement from doorway
    for (let s = 0; s < 5; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 1.1), woodMat);
      step.position.set(2.05 + s * 0.35, -s * 0.12, 3.5);
      step.castShadow = true;
      step.receiveShadow = true;
      addInkOutline(step, 0.025);
      grp.add(step);
    }

    // Hanging bare bulb fixture
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    bulb.position.set(4.2, 2.2, 2.65);

    const baseLight = new THREE.PointLight(0xf59e0b, 1.4, 6.5);
    baseLight.position.set(4.2, 2.1, 2.65);
    baseLight.castShadow = true;
    grp.add(bulb, baseLight);
    this.roomLights.basement.push(baseLight);

    // Wooden storage shelving racks with camping gear & holiday boxes
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 2.8), woodMat);
    rack.position.set(5.5, 0.5, 2.5);
    rack.castShadow = true;
    addInkOutline(rack, 0.035);
    grp.add(rack);

    // Cardboard boxes labeled Holiday / Camping
    for (let bx = 0; bx < 3; bx++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.65), boxMat);
      box.position.set(5.4, 0.35 + bx * 0.52, 1.8 + bx * 0.5);
      box.castShadow = true;
      addInkOutline(box, 0.03);
      grp.add(box);
    }

    // Antique camping lantern on shelf
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.26, 8),
      createToonMaterial({ color: 0x166534, desaturate: 0.1 })
    );
    lantern.position.set(5.4, 1.75, 3.2);
    addInkOutline(lantern, 0.025);
    grp.add(lantern);

    // Basement Interaction Node
    this.roomInteractionNodes.basement = [
      {
        id: 'basement_storage',
        name: 'Camping & Holiday Gear',
        position: [4.6, 0.8, 2.65],
        promptKey: 'E',
        promptVerb: 'Inspect',
        interactRadius: 2.2,
        description: 'Tidily stacked boxes of holiday lights, vintage camping gear, and spare parts.',
      },
    ];

    // Basement Colliders
    this.roomColliders.basement = [
      { id: 'bs_wall_right', name: 'Basement Right Wall', minX: 6.05, maxX: 6.35, minZ: 0.5, maxZ: 4.8, height: 3.8 },
      { id: 'bs_wall_back', name: 'Basement Back Wall', minX: 1.8, maxX: 6.2, minZ: 0.35, maxZ: 0.65, height: 3.8 },
      { id: 'bs_wall_front', name: 'Basement Front Wall', minX: 1.8, maxX: 6.2, minZ: 4.65, maxZ: 4.95, height: 3.8 },
      { id: 'bs_wall_left_1', name: 'Basement Left Wall 1', minX: 1.65, maxX: 1.95, minZ: 0.5, maxZ: 2.85, height: 3.8 },
      { id: 'bs_wall_left_2', name: 'Basement Left Wall 2', minX: 1.65, maxX: 1.95, minZ: 4.15, maxZ: 4.8, height: 3.8 },
      { id: 'bs_rack', name: 'Storage Shelves', minX: 5.0, maxX: 6.0, minZ: 1.0, maxZ: 4.0, height: 2.2 },
    ];
  }

  // =========================================================================
  // 9. LIGHTING SETUP
  // =========================================================================
  private setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xffedd5, 0.78);
    this.group.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffe8ba, 1.7);
    this.sunLight.position.set(6.0, 7.5, 3.0);
    this.sunLight.target.position.set(0, 1.0, 5.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 35;
    this.sunLight.shadow.camera.left = -12;
    this.sunLight.shadow.camera.right = 12;
    this.sunLight.shadow.camera.top = 12;
    this.sunLight.shadow.camera.bottom = -12;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.radius = 2.0;

    this.group.add(this.sunLight);
    this.group.add(this.sunLight.target);
  }

  // =========================================================================
  // 10. SPATIAL PARTITIONING & DYNAMIC OCCLUSION CULLING
  // =========================================================================
  public getCurrentRoomId(playerPos: THREE.Vector3): HouseRoomId {
    const { x, z } = playerPos;

    if (z < 0) {
      return 'bedroom';
    }
    if (z > 15.0) {
      return 'restroom';
    }

    if (x < -1.8) {
      if (z <= 4.8) return 'workshop';
      return 'kitchen';
    }
    if (x > 1.8) {
      if (z <= 4.8) return 'basement';
      return 'living_room';
    }

    return 'hallway';
  }

  /**
   * Updates room visibility and shadow performance:
   * "render only the current room and rooms behind open doors within about 6 units.
   * Hide everything else, and disable shadows for rooms that are only seen through a doorway."
   */
  public updateVisibilityAndPerformance(playerPos: THREE.Vector3) {
    const currentRoom = this.getCurrentRoomId(playerPos);
    const visibleRooms = new Set<HouseRoomId>([currentRoom]);
    const doorwaySeenRooms = new Set<HouseRoomId>();

    // Hallway, Kitchen, Living Room have open family archways (no solid door leaf):
    // They are mutually visible within 6 units
    if (currentRoom === 'hallway') {
      if (playerPos.z >= 3.5 && playerPos.z <= 13.5) {
        visibleRooms.add('kitchen');
        visibleRooms.add('living_room');
      }
    } else if (currentRoom === 'kitchen' || currentRoom === 'living_room') {
      visibleRooms.add('hallway');
      if (Math.abs(playerPos.x) < 3.5) {
        if (currentRoom === 'kitchen') visibleRooms.add('living_room');
        else visibleRooms.add('kitchen');
      }
    }

    // Check all open doors
    Object.values(this.doors).forEach((door) => {
      if (door.isOpen) {
        const dist = playerPos.distanceTo(door.config.position);
        if (dist <= 6.5) {
          const roomA = door.config.roomA as HouseRoomId;
          const roomB = door.config.roomB as HouseRoomId;

          if (visibleRooms.has(roomA) && !visibleRooms.has(roomB)) {
            visibleRooms.add(roomB);
            doorwaySeenRooms.add(roomB);
          } else if (visibleRooms.has(roomB) && !visibleRooms.has(roomA)) {
            visibleRooms.add(roomA);
            doorwaySeenRooms.add(roomA);
          }
        }
      }
    });

    // Apply visibility and optimize shadows
    (Object.keys(this.rooms) as HouseRoomId[]).forEach((roomId) => {
      const isVisible = visibleRooms.has(roomId);
      this.rooms[roomId].visible = isVisible;

      // Disable point lights / dynamic shadows for rooms that are only seen through a doorway
      const isDoorwayOnly = doorwaySeenRooms.has(roomId);
      this.roomLights[roomId].forEach((light) => {
        light.visible = isVisible;
        if (light instanceof THREE.PointLight) {
          light.castShadow = !isDoorwayOnly;
        }
      });
    });
  }

  // =========================================================================
  // 11. ACTIVE COLLIDERS
  // =========================================================================
  public getActiveColliders(playerPos: THREE.Vector3): BoxCollider2D[] {
    const currentRoom = this.getCurrentRoomId(playerPos);
    const activeRooms = new Set<HouseRoomId>([currentRoom]);

    // Include colliders of rooms behind open doors within ~6 units
    Object.values(this.doors).forEach((door) => {
      if (door.isOpen) {
        const dist = playerPos.distanceTo(door.config.position);
        if (dist <= 6.5) {
          activeRooms.add(door.config.roomA as HouseRoomId);
          activeRooms.add(door.config.roomB as HouseRoomId);
        }
      }
    });

    // Between Hallway and Kitchen / Living Room (open archways)
    if (currentRoom === 'hallway' && playerPos.z >= 4.5 && playerPos.z <= 12.5) {
      activeRooms.add('kitchen');
      activeRooms.add('living_room');
    } else if (currentRoom === 'kitchen' || currentRoom === 'living_room') {
      activeRooms.add('hallway');
    }

    const colliders: BoxCollider2D[] = [];

    // Room wall & furniture colliders
    activeRooms.forEach((rId) => {
      colliders.push(...this.roomColliders[rId]);
    });

    // Solid door obstacle colliders (only for closed doors!)
    Object.values(this.doors).forEach((door) => {
      const col = door.getCollider();
      if (col) {
        colliders.push(col);
      }
    });

    return colliders;
  }

  // =========================================================================
  // 12. ACTIVE INTERACTION NODES
  // =========================================================================
  public getActiveInteractionNodes(playerPos: THREE.Vector3): InteractionNode[] {
    const currentRoom = this.getCurrentRoomId(playerPos);
    const nodes: InteractionNode[] = [];

    // Current room props
    nodes.push(...this.roomInteractionNodes[currentRoom]);

    // Connected doors (can be interacted with from either side if close)
    Object.values(this.doors).forEach((door) => {
      const dist = playerPos.distanceTo(door.config.position);
      if (dist <= 3.2) {
        nodes.push(door.getInteractionNode(playerPos));
      }
    });

    // If standing in open passage between hallway and kitchen/living room, include nearby nodes
    if (currentRoom === 'hallway') {
      if (playerPos.z >= 6.0 && playerPos.z <= 11.0) {
        nodes.push(...this.roomInteractionNodes.living_room);
        nodes.push(...this.roomInteractionNodes.kitchen);
      }
    } else if (currentRoom === 'kitchen') {
      if (playerPos.x > -4.0) {
        nodes.push(...this.roomInteractionNodes.hallway);
      }
    } else if (currentRoom === 'living_room') {
      if (playerPos.x < 4.0) {
        nodes.push(...this.roomInteractionNodes.hallway);
      }
    }

    return nodes;
  }

  // =========================================================================
  // 13. SEAMLESS CAMERA BOUNDS CLAMPING
  // =========================================================================
  public clampCameraBounds(desiredPos: THREE.Vector3, playerPos: THREE.Vector3): THREE.Vector3 {
    const clamped = desiredPos.clone();
    const currentRoom = this.getCurrentRoomId(playerPos);

    // Default bounds per room
    let minX = -1.2, maxX = 1.2;
    let minZ = 0.5, maxZ = 14.3;
    let minY = 0.6, maxY = 3.5;

    switch (currentRoom) {
      case 'bedroom':
        minX = -3.7; maxX = 3.7;
        minZ = -8.2; maxZ = -0.6;
        break;
      case 'hallway':
        minX = -1.2; maxX = 1.2;
        minZ = 0.6; maxZ = 14.3;
        break;
      case 'kitchen':
        minX = -7.8; maxX = -1.5;
        minZ = 5.8; maxZ = 11.2;
        break;
      case 'living_room':
        minX = 1.5; maxX = 7.8;
        minZ = 5.8; maxZ = 11.2;
        break;
      case 'workshop':
        minX = -5.4; maxX = -2.1;
        minZ = 1.0; maxZ = 4.3;
        break;
      case 'restroom':
        minX = -1.4; maxX = 1.4;
        minZ = 15.5; maxZ = 18.8;
        break;
      case 'basement':
        minX = 2.1; maxX = 5.6;
        minZ = 1.0; maxZ = 4.3;
        break;
    }

    // Expand bounds across doorways when an adjacent door is open and player is near it:
    // A. Bedroom <-> Hallway (Door at Z = 0)
    if (this.doors['bedroom_door']?.isOpen) {
      if (Math.abs(playerPos.z) < 3.2 && Math.abs(playerPos.x) < 2.0) {
        minZ = -8.2;
        maxZ = 14.3;
        minX = Math.min(minX, -1.8);
        maxX = Math.max(maxX, 1.8);
      }
    }

    // B. Hallway <-> Restroom (Door at Z = 15.0)
    if (this.doors['restroom_door']?.isOpen) {
      if (Math.abs(playerPos.z - 15.0) < 3.2) {
        minZ = Math.min(minZ, 12.0);
        maxZ = 18.8;
        minX = Math.min(minX, -1.4);
        maxX = Math.max(maxX, 1.4);
      }
    }

    // C. Hallway <-> Workshop (open archway)
    if (playerPos.z >= 1.5 && playerPos.z <= 4.8) {
      if (playerPos.x < 1.2) {
        minX = -5.4;
        maxX = Math.max(maxX, 1.2);
        minZ = Math.min(minZ, 1.0);
        maxZ = Math.max(maxZ, 4.5);
      }
    }

    // D. Hallway <-> Basement (Door at X = 1.8, Z = 3.5)
    if (this.doors['basement_door']?.isOpen) {
      if (Math.abs(playerPos.x - 1.8) < 2.8 && playerPos.z >= 1.5 && playerPos.z <= 4.8) {
        minX = -1.2;
        maxX = 5.6;
        minZ = 1.0;
        maxZ = 4.5;
      }
    }

    // E. Hallway <-> Kitchen (open archway)
    if (playerPos.z >= 5.0 && playerPos.z <= 12.0) {
      if (playerPos.x < 1.0) {
        minX = -7.8;
        maxX = Math.max(maxX, 1.2);
      }
    }

    // F. Hallway <-> Living Room (open archway)
    if (playerPos.z >= 5.0 && playerPos.z <= 12.0) {
      if (playerPos.x > -1.0) {
        minX = Math.min(minX, -1.2);
        maxX = 7.8;
      }
    }

    clamped.x = THREE.MathUtils.clamp(clamped.x, minX, maxX);
    clamped.y = THREE.MathUtils.clamp(clamped.y, minY, maxY);
    clamped.z = THREE.MathUtils.clamp(clamped.z, minZ, maxZ);

    return clamped;
  }

  // =========================================================================
  // 14. FRAME UPDATE
  // =========================================================================
  public update(delta: number, playerPos: THREE.Vector3) {
    // Update door swing animations
    Object.values(this.doors).forEach((door) => {
      door.update(delta);
    });

    // Update dynamic room visibility and performance culling
    this.updateVisibilityAndPerformance(playerPos);
  }
}
