import * as THREE from 'three';
import { InteractionNode } from '../types/game';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { BoxCollider2D } from '../utils/collision';

const CRAYON_DRAWINGS_PATH = '/src/assets/images/crayon_space_drawings_1790936022898.jpg';

// Helper to generate child-like crayon drawing textures for pinned wall art
function createCrayonDrawingTexture(type: 'spaceship' | 'robot' | 'planet' | 'battle'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Warm pulp paper background
    ctx.fillStyle = '#fcf8ec';
    ctx.fillRect(0, 0, 512, 384);

    // Subtle paper edge sketch
    ctx.strokeStyle = '#e5dcc7';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 496, 368);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'spaceship') {
      // Golden stars
      ctx.fillStyle = '#f59e0b';
      for (const [sx, sy] of [[60, 60], [120, 90], [420, 80], [450, 180], [380, 50], [90, 200]]) {
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Blue rocket hull
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

      // Red nose cone
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(256, 35);
      ctx.lineTo(290, 95);
      ctx.lineTo(222, 95);
      ctx.closePath();
      ctx.fill();

      // Rocket fins
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(192, 210);
      ctx.lineTo(130, 260);
      ctx.lineTo(192, 250);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(320, 210);
      ctx.lineTo(382, 260);
      ctx.lineTo(320, 250);
      ctx.fill();

      // Porthole with smiley face
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(256, 155, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Fire thruster
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(210, 250);
      ctx.lineTo(256, 335);
      ctx.lineTo(302, 250);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(225, 250);
      ctx.lineTo(256, 305);
      ctx.lineTo(287, 250);
      ctx.fill();

      // Child handwriting title
      ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('STARSHIP ZANE', 170, 365);
    } else if (type === 'robot') {
      // Robot body
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(190, 135, 132, 115);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(206, 60, 100, 68);

      // Glowing yellow robot eyes
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(236, 92, 12, 0, Math.PI * 2);
      ctx.arc(276, 92, 12, 0, Math.PI * 2);
      ctx.fill();

      // Antenna
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(256, 60);
      ctx.lineTo(256, 28);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(256, 22, 9, 0, Math.PI * 2);
      ctx.fill();

      // Arms
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(190, 155);
      ctx.lineTo(120, 185);
      ctx.moveTo(322, 155);
      ctx.lineTo(392, 185);
      ctx.stroke();

      // Blaster spark
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(395, 185);
      ctx.lineTo(465, 168);
      ctx.stroke();

      // Legs
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(226, 250);
      ctx.lineTo(226, 320);
      ctx.moveTo(286, 250);
      ctx.lineTo(286, 320);
      ctx.stroke();

      ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('COSMIC DEFENDER', 150, 365);
    } else if (type === 'planet') {
      // Golden Saturn-like ringed planet
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(256, 175, 80, 0, Math.PI * 2);
      ctx.fill();

      // Craters
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(225, 145, 16, 0, Math.PI * 2);
      ctx.arc(280, 205, 20, 0, Math.PI * 2);
      ctx.arc(245, 185, 10, 0, Math.PI * 2);
      ctx.fill();

      // Sky-blue cosmic ring
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.ellipse(256, 175, 145, 36, -0.28, 0, Math.PI * 2);
      ctx.stroke();

      // Purple moon
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(105, 95, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('SECTOR 9 ORBIT', 165, 365);
    } else {
      // Space Battle dogfight
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(380, 80);
      ctx.lineTo(445, 115);
      ctx.lineTo(380, 150);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(140, 100);
      ctx.lineTo(75, 75);
      ctx.lineTo(75, 125);
      ctx.closePath();
      ctx.fill();

      // Laser beams
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(145, 100);
      ctx.lineTo(370, 95);
      ctx.moveTo(145, 105);
      ctx.lineTo(370, 135);
      ctx.stroke();

      // Comic explosion burst
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(380, 115, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(380, 115, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.fillText('SPACE BATTLE!', 175, 365);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class BedroomScene {
  public group: THREE.Group;
  public interactionNodes: InteractionNode[] = [];
  public cabinetDoorLeft!: THREE.Group;
  public cabinetDoorRight!: THREE.Group;
  public isCabinetOpen: boolean = false;
  private cabinetOpenProgress: number = 0;

  // Window sunny dust motes
  private dustParticles!: THREE.Points;

  // 3-Layer Sunny Window Backdrop
  public farLayer!: THREE.Group;
  public midLayer!: THREE.Group;
  public foregroundLayer!: THREE.Group;

  // 2D Ground Plane Box Colliders
  public colliders: BoxCollider2D[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.buildRoom();
    this.buildBed();
    this.buildCabinet();
    this.buildBookshelf();
    this.buildDeskWithCrayons();
    this.buildWindowAndSunnyDay();
    this.buildDrawingsAndPosters();
    this.buildScatteredKidToysAndBoxes();
    this.setupLighting();
    this.setupInteractionNodes();
    this.buildColliders();
  }

  // WARM, NATURAL COLOR PALETTE: Warm Oak Wood, Soft Vanilla Walls, Sunny Highlights
  private buildRoom() {
    // Floor: Warm natural honey oak hardwood planks with rich contrast
    const floorMat = createToonMaterial({ color: 0xa86e38, desaturate: 0.08 });
    // Walls: Warm cozy morning beige painted drywall
    const wallMat = createToonMaterial({ color: 0xded0bb, desaturate: 0.08 });
    // Trims & Baseboards: Soft warm ivory beige
    const trimMat = createToonMaterial({ color: 0xe0d4c3, desaturate: 0.06 });

    const floorGeo = new THREE.PlaneGeometry(9, 9);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Warm daylight sun patch cast on the wooden floor near the window
    const sunPatchMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    });
    const sunPatch = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), sunPatchMat);
    sunPatch.rotation.x = -Math.PI / 2;
    sunPatch.position.set(0.3, 0.005, -2.2);
    this.group.add(sunPatch);

    // Back Wall with Doorway opening (Door side: Z = +4.5, opening X: [-0.65, 0.65])
    const backWallLeft = new THREE.Mesh(new THREE.BoxGeometry(3.85, 4, 0.2), wallMat);
    backWallLeft.position.set(-2.575, 2, 4.5);

    const backWallRight = new THREE.Mesh(new THREE.BoxGeometry(3.85, 4, 0.2), wallMat);
    backWallRight.position.set(2.575, 2, 4.5);

    const backWallTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.2), wallMat);
    backWallTop.position.set(0, 3.25, 4.5);

    this.group.add(backWallLeft, backWallRight, backWallTop);

    // Front Wall with Window opening (Z = -4.5)
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.2), wallMat);
    frontWallLeft.position.set(-3, 2, -4.5);

    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.2), wallMat);
    frontWallRight.position.set(3, 2, -4.5);

    const frontWallTop = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.2), wallMat);
    frontWallTop.position.set(0, 3.5, -4.5);

    const frontWallBottom = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.2), wallMat);
    frontWallBottom.position.set(0, 0.5, -4.5);

    this.group.add(frontWallLeft, frontWallRight, frontWallTop, frontWallBottom);

    // Left Wall (Cabinet & Bookshelf side: X = -4.5)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 9), wallMat);
    leftWall.position.set(-4.5, 2, 0);
    this.group.add(leftWall);

    // Right Wall (Desk side: X = +4.5)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 9), wallMat);
    rightWall.position.set(4.5, 2, 0);
    this.group.add(rightWall);

    // Ceiling in soft warm beige-cream
    const ceilingMat = createToonMaterial({ color: 0xe6d7c5, desaturate: 0.06 });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4;
    this.group.add(ceiling);

    // Baseboards in clean white with ink outline (leaving doorway opening X: [-0.65, 0.65] clear)
    const bbBackLeft = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.15, 0.05), trimMat);
    bbBackLeft.position.set(-2.575, 0.075, 4.4);
    addInkOutline(bbBackLeft, 0.025);

    const bbBackRight = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.15, 0.05), trimMat);
    bbBackRight.position.set(2.575, 0.075, 4.4);
    addInkOutline(bbBackRight, 0.025);

    this.group.add(bbBackLeft, bbBackRight);

    const bbLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 9), trimMat);
    bbLeft.position.set(-4.4, 0.075, 0);
    addInkOutline(bbLeft, 0.025);
    this.group.add(bbLeft);

    const bbRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 9), trimMat);
    bbRight.position.set(4.4, 0.075, 0);
    addInkOutline(bbRight, 0.025);
    this.group.add(bbRight);
  }

  // CENTER: Cozy twin bed with warm wood frame, cheerful blue/yellow bedspread, and stylized toy rocket
  private buildBed() {
    const bedGroup = new THREE.Group();
    bedGroup.position.set(0, 0, -0.6);

    const woodFrameMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.12 }); // Warm golden pine wood with contrast
    const mattressMat = createToonMaterial({ color: 0xf5f0e6, desaturate: 0.05 }); // Soft cream mattress
    const quiltMat = createToonMaterial({ color: 0x2563eb, desaturate: 0.08 }); // Rich royal/sky blue quilt
    const blanketFoldMat = createToonMaterial({ color: 0x1d4ed8, desaturate: 0.08 }); // Deep blue quilt fold
    const pillowMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.08 }); // Sunny amber-yellow soft pillow
    const sheetAccentMat = createToonMaterial({ color: 0xfef3c7, desaturate: 0.06 }); // Warm cream sheet fold

    // Wooden bed frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 3.4), woodFrameMat);
    frame.position.y = 0.25;
    frame.castShadow = true;
    frame.receiveShadow = true;
    addInkOutline(frame, 0.035);
    bedGroup.add(frame);

    // Slatted Headboard
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 0.15), woodFrameMat);
    headboard.position.set(0, 0.8, -1.65);
    headboard.castShadow = true;
    headboard.receiveShadow = true;
    addInkOutline(headboard, 0.035);
    bedGroup.add(headboard);

    // Mattress
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.3, 3.2), mattressMat);
    mattress.position.set(0, 0.5, 0);
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    addInkOutline(mattress, 0.03);
    bedGroup.add(mattress);

    // Cheerful Sky Blue Quilt
    const quilt = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.24, 2.2), quiltMat);
    quilt.position.set(0, 0.65, 0.45);
    quilt.castShadow = true;
    quilt.receiveShadow = true;
    addInkOutline(quilt, 0.035);
    bedGroup.add(quilt);

    // Folded top sheet in warm cream
    const sheetFold = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.08, 0.35), sheetAccentMat);
    sheetFold.position.set(0, 0.72, -0.65);
    addInkOutline(sheetFold, 0.03);
    bedGroup.add(sheetFold);

    // Cozy rumpled blanket folds
    for (let i = 0; i < 5; i++) {
      const fold = new THREE.Mesh(new THREE.ConeGeometry(0.18 + Math.random() * 0.1, 0.12, 5), blanketFoldMat);
      fold.position.set((Math.random() - 0.5) * 1.4, 0.77, 0.1 + (Math.random() - 0.5) * 1.5);
      fold.rotation.z = (Math.random() - 0.5) * 0.4;
      fold.castShadow = true;
      addInkOutline(fold, 0.03);
      bedGroup.add(fold);
    }

    // Sunny Yellow Fluffy Pillow
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.7), pillowMat);
    pillow.position.set(0, 0.74, -1.1);
    pillow.rotation.x = 0.12;
    pillow.castShadow = true;
    addInkOutline(pillow, 0.035);
    bedGroup.add(pillow);

    // STYLIZED CHUNKY TOY ROCKET SHIP on the bed
    const rocketGroup = new THREE.Group();
    rocketGroup.position.set(0.65, 0.88, 0.2);
    rocketGroup.rotation.x = Math.PI / 2;
    rocketGroup.rotation.z = 0.45;

    const rocketBodyMat = createToonMaterial({ color: 0xef4444, desaturate: 0.08 }); // Bright red
    const rocketNoseMat = createToonMaterial({ color: 0xfacc15, desaturate: 0.08 }); // Yellow tip
    const rocketFinMat = createToonMaterial({ color: 0x3b82f6, desaturate: 0.08 }); // Blue fins
    const rocketGlassMat = createToonMaterial({ color: 0x38bdf8, desaturate: 0.05 }); // Porthole glass

    // Rocket fuselage
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.28, 12), rocketBodyMat);
    addInkOutline(fuselage, 0.03);
    rocketGroup.add(fuselage);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 12), rocketNoseMat);
    nose.position.y = 0.21;
    addInkOutline(nose, 0.03);
    rocketGroup.add(nose);

    // Porthole window
    const portHole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), rocketGlassMat);
    portHole.position.set(0, 0.05, 0.08);
    portHole.rotation.x = Math.PI / 2;
    addInkOutline(portHole, 0.025);
    rocketGroup.add(portHole);

    // Fins (3 triangular fins)
    for (let f = 0; f < 3; f++) {
      const angle = (f * Math.PI * 2) / 3;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.09), rocketFinMat);
      fin.position.set(Math.sin(angle) * 0.1, -0.1, Math.cos(angle) * 0.1);
      fin.rotation.y = angle;
      addInkOutline(fin, 0.03);
      rocketGroup.add(fin);
    }

    rocketGroup.castShadow = true;
    bedGroup.add(rocketGroup);

    // Cheerful round bedroom area rug under bed in warm golden-cream with sky-blue border
    const rugMat = createToonMaterial({ color: 0xfef08a, desaturate: 0.1 });
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.015, 0.4);
    rug.receiveShadow = true;
    addInkOutline(rug, 0.02);

    const rugBorderMat = createToonMaterial({ color: 0x38bdf8, desaturate: 0.08 });
    const rugBorder = new THREE.Mesh(new THREE.RingGeometry(2.15, 2.3, 32), rugBorderMat);
    rugBorder.rotation.x = -Math.PI / 2;
    rugBorder.position.set(0, 0.018, 0.4);
    bedGroup.add(rug, rugBorder);

    this.group.add(bedGroup);
  }

  // LEFT: Warm wooden wardrobe / cabinet with comic books and school supplies
  private buildCabinet() {
    const cabinetGroup = new THREE.Group();
    cabinetGroup.position.set(-3.7, 0, 0.8);

    const woodDarkMat = createToonMaterial({ color: 0x78350f, desaturate: 0.12 }); // Rich warm cedar brown wood
    const woodShelfMat = createToonMaterial({ color: 0x9a3412, desaturate: 0.12 });
    const metalHandleMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.1 }); // Warm polished brass

    const cabinetBox = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.4, 1.8), woodDarkMat);
    cabinetBox.position.set(0, 1.2, 0);
    cabinetBox.castShadow = true;
    cabinetBox.receiveShadow = true;
    addInkOutline(cabinetBox, 0.035);
    cabinetGroup.add(cabinetBox);

    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 2.1, 1.65),
      createToonMaterial({ color: 0x78350f, desaturate: 0.15 })
    );
    inner.position.set(0.08, 1.2, 0);
    cabinetGroup.add(inner);

    for (let y = 0.5; y <= 1.8; y += 0.55) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 1.62), woodShelfMat);
      shelf.position.set(0.08, y, 0);
      addInkOutline(shelf, 0.025);
      cabinetGroup.add(shelf);
    }

    // Kid's comic books and storybooks on shelves
    const bookColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6];
    for (let c = 0; c < 7; c++) {
      const bookMat = createToonMaterial({ color: bookColors[c % bookColors.length], desaturate: 0.1 });
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.28), bookMat);
      book.position.set(0.1, 0.6 + c * 0.045, -0.35 + (c % 2) * 0.02);
      addInkOutline(book, 0.025);
      cabinetGroup.add(book);
    }

    // Left Door
    this.cabinetDoorLeft = new THREE.Group();
    this.cabinetDoorLeft.position.set(0.48, 1.2, -0.82);
    const doorLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.8), woodDarkMat);
    doorLMesh.position.set(0, 0, 0.4);
    doorLMesh.castShadow = true;
    addInkOutline(doorLMesh, 0.035);
    this.cabinetDoorLeft.add(doorLMesh);

    const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 8), metalHandleMat);
    handleL.position.set(0.04, 0, 0.72);
    addInkOutline(handleL, 0.03);
    this.cabinetDoorLeft.add(handleL);
    cabinetGroup.add(this.cabinetDoorLeft);

    // Right Door
    this.cabinetDoorRight = new THREE.Group();
    this.cabinetDoorRight.position.set(0.48, 1.2, 0.82);
    const doorRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.8), woodDarkMat);
    doorRMesh.position.set(0, 0, -0.4);
    doorRMesh.castShadow = true;
    addInkOutline(doorRMesh, 0.035);
    this.cabinetDoorRight.add(doorRMesh);

    const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 8), metalHandleMat);
    handleR.position.set(0.04, 0, -0.72);
    addInkOutline(handleR, 0.03);
    this.cabinetDoorRight.add(handleR);
    cabinetGroup.add(this.cabinetDoorRight);

    this.group.add(cabinetGroup);
  }

  // LEFT CORNER: Wooden Bookshelf with kids' adventure books, comic binders, and toy dinosaur
  private buildBookshelf() {
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-3.7, 0, -2.5);

    const woodMat = createToonMaterial({ color: 0x854d0e, desaturate: 0.12 });
    const woodShelfMat = createToonMaterial({ color: 0x9a3412, desaturate: 0.12 });

    // Side panels
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.0, 0.05), woodMat);
    sideL.position.set(0, 1.0, -0.75);
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.0, 0.05), woodMat);
    sideR.position.set(0, 1.0, 0.75);
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 1.5), woodMat);
    backPanel.position.set(-0.28, 1.0, 0);

    addInkOutline(sideL, 0.03);
    addInkOutline(sideR, 0.03);
    addInkOutline(backPanel, 0.025);
    shelfGroup.add(sideL, sideR, backPanel);

    // Shelves (Bottom, Tier 1, Tier 2, Top)
    for (let s = 0; s <= 3; s++) {
      const shelfY = 0.1 + s * 0.6;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 1.48), woodShelfMat);
      shelf.position.set(0, shelfY, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      addInkOutline(shelf, 0.03);
      shelfGroup.add(shelf);
    }

    // Row of standing books on Tier 1
    const bookColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0x06b6d4, 0xf97316];
    for (let b = 0; b < 10; b++) {
      const bHeight = 0.35 + (b % 3) * 0.06;
      const bDepth = 0.28;
      const bMat = createToonMaterial({ color: bookColors[b % bookColors.length], desaturate: 0.08 });
      const book = new THREE.Mesh(new THREE.BoxGeometry(bDepth, bHeight, 0.055), bMat);
      book.position.set(0, 0.7 + bHeight / 2, -0.6 + b * 0.075);
      if (b === 8) book.rotation.x = 0.25; // Leaning book!
      book.castShadow = true;
      addInkOutline(book, 0.025);
      shelfGroup.add(book);
    }

    // Row of adventure & comic binders on Tier 2
    for (let c = 0; c < 6; c++) {
      const bMat = createToonMaterial({ color: bookColors[(c + 2) % bookColors.length], desaturate: 0.08 });
      const binder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.09), bMat);
      binder.position.set(0, 1.3 + 0.21, -0.55 + c * 0.11);
      binder.castShadow = true;
      addInkOutline(binder, 0.025);
      shelfGroup.add(binder);
    }

    // Toy green dinosaur / trophy on top of bookshelf
    const dinoGroup = new THREE.Group();
    dinoGroup.position.set(0, 2.05, 0.2);
    const dinoMat = createToonMaterial({ color: 0x16a34a, desaturate: 0.08 });
    const dinoBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.26), dinoMat);
    dinoBody.position.y = 0.1;
    const dinoHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), dinoMat);
    dinoHead.position.set(0, 0.22, 0.12);
    const dinoTail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), dinoMat);
    dinoTail.position.set(0, 0.08, -0.2);
    dinoTail.rotation.x = -Math.PI / 3;
    addInkOutline(dinoBody, 0.025);
    addInkOutline(dinoHead, 0.025);
    addInkOutline(dinoTail, 0.025);
    dinoGroup.add(dinoBody, dinoHead, dinoTail);
    shelfGroup.add(dinoGroup);

    this.group.add(shelfGroup);
  }

  // RIGHT: Messy study desk with crayons, pencil pot, drawing paper, notebooks, toy robot & warm lamp
  private buildDeskWithCrayons() {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(3.6, 0, -0.5);

    const deskTopMat = createToonMaterial({ color: 0xb47e48, desaturate: 0.1 }); // Natural warm pine wood with contrast
    const deskLegMat = createToonMaterial({ color: 0x78350f, desaturate: 0.12 });

    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 2.6), deskTopMat);
    tableTop.position.set(0, 1.0, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    addInkOutline(tableTop, 0.035);
    deskGroup.add(tableTop);

    const legPositions: [number, number][] = [
      [-0.45, -1.1],
      [0.45, -1.1],
      [-0.45, 1.1],
      [0.45, 1.1],
    ];
    legPositions.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), deskLegMat);
      leg.position.set(lx, 0.5, lz);
      leg.castShadow = true;
      addInkOutline(leg, 0.03);
      deskGroup.add(leg);
    });

    // Desktop Monitor in clean warm gray with cartoon wallpaper
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.45, 0.45),
      createToonMaterial({ color: 0xf1f5f9, desaturate: 0.05 })
    );
    monitor.position.set(-0.15, 1.28, -0.6);
    monitor.rotation.y = 0.25;
    monitor.castShadow = true;
    addInkOutline(monitor, 0.035);
    deskGroup.add(monitor);

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.3),
      createToonMaterial({ color: 0x38bdf8, desaturate: 0.05 })
    );
    screenMesh.position.set(-0.15 + 0.23, 1.28, -0.6);
    screenMesh.rotation.y = -Math.PI / 2 + 0.25;
    addInkOutline(screenMesh, 0.025);
    deskGroup.add(screenMesh);

    // CRAYON HOLDER CAN WITH COLORFUL CRAYONS
    const cupMat = createToonMaterial({ color: 0x3b82f6, desaturate: 0.08 });
    const crayonCup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.14, 12), cupMat);
    crayonCup.position.set(-0.25, 1.11, 0.35);
    crayonCup.castShadow = true;
    addInkOutline(crayonCup, 0.025);
    deskGroup.add(crayonCup);

    const crayonColors = [0xef4444, 0x3b82f6, 0xfacc15, 0x10b981, 0x8b5cf6, 0xf97316];
    for (let k = 0; k < 6; k++) {
      const crMat = createToonMaterial({ color: crayonColors[k], desaturate: 0.05 });
      const crayon = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 6), crMat);
      const cAngle = (k * Math.PI * 2) / 6;
      crayon.position.set(-0.25 + Math.sin(cAngle) * 0.025, 1.16, 0.35 + Math.cos(cAngle) * 0.025);
      crayon.rotation.x = (Math.random() - 0.5) * 0.25;
      crayon.rotation.z = (Math.random() - 0.5) * 0.25;
      addInkOutline(crayon, 0.02);
      deskGroup.add(crayon);
    }

    // Loose crayons lying scattered on the desk
    for (let l = 0; l < 3; l++) {
      const crMat = createToonMaterial({ color: crayonColors[(l + 3) % crayonColors.length], desaturate: 0.05 });
      const looseCrayon = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), crMat);
      looseCrayon.position.set(-0.05 + l * 0.08, 1.05, 0.3 + (l % 2) * 0.06);
      looseCrayon.rotation.z = Math.PI / 2;
      looseCrayon.rotation.y = (Math.random() - 0.5) * 0.8;
      looseCrayon.castShadow = true;
      addInkOutline(looseCrayon, 0.02);
      deskGroup.add(looseCrayon);
    }

    // Loose sheet of drawing paper on desk with spaceship sketch
    const paperMat = new THREE.MeshBasicMaterial({ map: createCrayonDrawingTexture('spaceship') });
    const deskDrawing = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), paperMat);
    deskDrawing.rotation.x = -Math.PI / 2;
    deskDrawing.rotation.z = 0.18;
    deskDrawing.position.set(0.08, 1.045, -0.05);
    addInkOutline(deskDrawing, 0.02);
    deskGroup.add(deskDrawing);

    // School notebooks stacked
    const notebookColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b];
    for (let i = 0; i < 3; i++) {
      const nb = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.02, 0.36),
        createToonMaterial({ color: notebookColors[i % 4], desaturate: 0.08 })
      );
      nb.position.set(-0.15 + (Math.random() - 0.5) * 0.05, 1.05 + i * 0.022, -0.05 + (Math.random() - 0.5) * 0.05);
      nb.rotation.y = (Math.random() - 0.5) * 0.25;
      nb.castShadow = true;
      addInkOutline(nb, 0.025);
      deskGroup.add(nb);
    }

    // Cheerful Toy Robot in primary blue & red
    const robotGroup = new THREE.Group();
    robotGroup.position.set(0.05, 1.05, 0.7);
    const botMat = createToonMaterial({ color: 0x3b82f6, desaturate: 0.08 });
    const botHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), botMat);
    botHead.position.y = 0.28;
    addInkOutline(botHead, 0.03);
    const botBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.2, 0.14),
      createToonMaterial({ color: 0xef4444, desaturate: 0.08 })
    );
    botBody.position.y = 0.14;
    addInkOutline(botBody, 0.03);
    const botAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.1),
      createToonMaterial({ color: 0xfacc15, desaturate: 0.08 })
    );
    botAntenna.position.y = 0.38;
    addInkOutline(botAntenna, 0.025);
    robotGroup.add(botHead, botBody, botAntenna);
    deskGroup.add(robotGroup);

    // Cozy Desk Lamp with sunny yellow lampshade
    const lampMat = createToonMaterial({ color: 0xfacc15, desaturate: 0.08 });
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12), lampMat);
    lampBase.position.set(-0.35, 1.02, 0.9);
    addInkOutline(lampBase, 0.025);

    const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4), lampMat);
    lampPole.position.set(-0.35, 1.22, 0.9);
    lampPole.rotation.z = -0.2;
    addInkOutline(lampPole, 0.025);

    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.15, 12, 1, true), lampMat);
    lampShade.position.set(-0.25, 1.4, 0.9);
    lampShade.rotation.z = -Math.PI / 4;
    addInkOutline(lampShade, 0.03);
    deskGroup.add(lampBase, lampPole, lampShade);

    // Cozy warm 2700K incandescent lamp glow
    const deskLampLight = new THREE.PointLight(0xffd166, 1.0, 12.0, 2);
    deskLampLight.position.set(-0.25, 1.35, 0.85);
    deskGroup.add(deskLampLight);

    // Cheerful Kid's Desk Chair in Royal Blue
    const chairGroup = new THREE.Group();
    chairGroup.position.set(-0.7, 0, 0);
    const chairMat = createToonMaterial({ color: 0x2563eb, desaturate: 0.08 });
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), chairMat);
    chairSeat.position.y = 0.6;
    addInkOutline(chairSeat, 0.03);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.05), chairMat);
    chairBack.position.set(0, 0.9, -0.23);
    addInkOutline(chairBack, 0.03);
    const chairLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.6),
      createToonMaterial({ color: 0x64748b, desaturate: 0.15 })
    );
    chairLeg.position.y = 0.3;
    addInkOutline(chairLeg, 0.03);
    chairGroup.add(chairSeat, chairBack, chairLeg);
    chairGroup.rotation.y = 0.4;
    deskGroup.add(chairGroup);

    this.group.add(deskGroup);
  }

  // FRONT: Sunny window with bright daylight, rolling green hills, blue sky, and gentle white clouds
  private buildWindowAndSunnyDay() {
    const windowGroup = new THREE.Group();
    windowGroup.position.set(0, 2.0, -4.4);

    const frameMat = createToonMaterial({ color: 0xffffff, desaturate: 0.05 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transmission: 0.9,
      opacity: 0.25,
      transparent: true,
      roughness: 0.1,
      ior: 1.45,
    });

    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 0.15), frameMat);
    frameTop.position.y = 1.0;
    addInkOutline(frameTop, 0.03);

    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 0.15), frameMat);
    frameBottom.position.y = -1.0;
    addInkOutline(frameBottom, 0.03);

    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.15), frameMat);
    frameL.position.x = -1.45;
    addInkOutline(frameL, 0.03);

    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.15), frameMat);
    frameR.position.x = 1.45;
    addInkOutline(frameR, 0.03);

    const frameMid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 0.15), frameMat);
    addInkOutline(frameMid, 0.025);

    const frameCross = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 0.15), frameMat);
    frameCross.position.y = 0.2;
    addInkOutline(frameCross, 0.025);

    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.95), glassMat);

    windowGroup.add(frameTop, frameBottom, frameL, frameR, frameMid, frameCross, glassPane);
    this.group.add(windowGroup);

    // ==============================================================
    // SUNNY DAYTIME PARALLAX BACKDROP (Far Sky, Mid Hills, Near Trees)
    // ==============================================================
    // LAYER 1: FAR SKY & WARM SUN (Z = -16.0)
    this.farLayer = new THREE.Group();
    this.farLayer.position.set(0, 2.2, -16.0);

    const skyMat = createToonMaterial({ color: 0x7dd3fc, desaturate: 0.05 });
    const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), skyMat);
    this.farLayer.add(skyMesh);

    // Bright Golden Sun
    const sunMat = createToonMaterial({ color: 0xfde047, desaturate: 0.05 });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), sunMat);
    sun.position.set(-5.5, 4.5, 0.1);
    addInkOutline(sun, 0.03);
    this.farLayer.add(sun);

    // Soft white fluffy clouds
    const cloudMat = createToonMaterial({ color: 0xffffff, desaturate: 0.02 });
    const createCloud = (cx: number, cy: number, scale: number) => {
      const cg = new THREE.Group();
      cg.position.set(cx, cy, 0.2);
      cg.scale.setScalar(scale);
      const c1 = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), cloudMat);
      const c2 = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), cloudMat);
      c2.position.set(1.2, 0.2, 0);
      const c3 = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), cloudMat);
      c3.position.set(2.4, -0.1, 0);
      addInkOutline(c1, 0.025);
      addInkOutline(c2, 0.025);
      addInkOutline(c3, 0.025);
      cg.add(c1, c2, c3);
      return cg;
    };

    this.farLayer.add(createCloud(-2, 5.5, 1.1));
    this.farLayer.add(createCloud(7, 4.2, 0.9));
    this.farLayer.add(createCloud(-10, 3.8, 1.2));
    this.group.add(this.farLayer);

    // LAYER 2: MID LAYER (Rolling Green Hills, Z = -11.0)
    this.midLayer = new THREE.Group();
    this.midLayer.position.set(0, 1.8, -11.0);

    const hillMat1 = createToonMaterial({ color: 0x86efac, desaturate: 0.08 });
    const hillMat2 = createToonMaterial({ color: 0x4ade80, desaturate: 0.08 });

    const createHill = (width: number, height: number, x: number, y: number, mat: THREE.Material) => {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, 0);
      shape.quadraticCurveTo(0, height * 1.3, width / 2, 0);
      shape.closePath();
      const geom = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, 0.1);
      addInkOutline(mesh, 0.03);
      return mesh;
    };

    this.midLayer.add(createHill(24, 6.5, -6, -4, hillMat1));
    this.midLayer.add(createHill(26, 7.2, 8, -4, hillMat2));
    this.midLayer.add(createHill(18, 5.0, 0, -4, hillMat1));
    this.group.add(this.midLayer);

    // LAYER 3: FOREGROUND (Lush Neighborhood Trees, Z = -6.8)
    this.foregroundLayer = new THREE.Group();
    this.foregroundLayer.position.set(0, 1.2, -6.8);

    const treeFoliageMat = createToonMaterial({ color: 0x22c55e, desaturate: 0.08 });
    const treeTrunkMat = createToonMaterial({ color: 0x78350f, desaturate: 0.15 });

    const createTree = (tx: number, ty: number, tScale: number) => {
      const tree = new THREE.Group();
      tree.position.set(tx, ty, 0);
      tree.scale.setScalar(tScale);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.5, 8), treeTrunkMat);
      trunk.position.y = 1.0;
      addInkOutline(trunk, 0.03);
      tree.add(trunk);

      const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), treeFoliageMat);
      foliage.position.y = 2.4;
      addInkOutline(foliage, 0.035);
      tree.add(foliage);

      return tree;
    };

    this.foregroundLayer.add(createTree(-3.5, -0.6, 1.2));
    this.foregroundLayer.add(createTree(3.8, -0.4, 1.3));
    this.group.add(this.foregroundLayer);

    // Warm golden sunlight dust motes drifting across the sunbeam
    const dustCount = 45;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 4;
      dustPos[i * 3 + 1] = 0.5 + Math.random() * 2.5;
      dustPos[i * 3 + 2] = -4 + Math.random() * 4;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.035,
      transparent: true,
      opacity: 0.7,
    });
    this.dustParticles = new THREE.Points(dustGeo, dustMat);
    this.group.add(this.dustParticles);
  }

  public updateParallax(cameraPos: THREE.Vector3) {
    if (this.farLayer) {
      this.farLayer.position.x = -cameraPos.x * 0.04;
      this.farLayer.position.y = 2.2 + (cameraPos.y - 2.0) * 0.03;
    }
    if (this.midLayer) {
      this.midLayer.position.x = -cameraPos.x * 0.09;
      this.midLayer.position.y = 1.8 + (cameraPos.y - 2.0) * 0.07;
    }
    if (this.foregroundLayer) {
      this.foregroundLayer.position.x = -cameraPos.x * 0.18;
      this.foregroundLayer.position.y = 1.2 + (cameraPos.y - 2.0) * 0.14;
    }
  }

  // WALLS: Kid's drawings pinned on the wall with pushpins hinting at the imagination world (spaceships, robots, alien planets)
  private buildDrawingsAndPosters() {
    // Helper to create pinned paper with pushpin / masking tape
    const createPinnedDrawing = (
      type: 'spaceship' | 'robot' | 'planet' | 'battle',
      width: number,
      height: number,
      pos: [number, number, number],
      rotY: number
    ) => {
      const g = new THREE.Group();
      g.position.set(...pos);
      g.rotation.y = rotY;

      const paperMat = new THREE.MeshBasicMaterial({
        map: createCrayonDrawingTexture(type),
        side: THREE.DoubleSide,
      });
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(width, height), paperMat);
      addInkOutline(paper, 0.025);
      g.add(paper);

      // Masking tape pieces on top corners
      const tapeMat = createToonMaterial({ color: 0xfef08a, desaturate: 0.12 });
      const tapeL = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), tapeMat);
      tapeL.position.set(-width / 2 + 0.06, height / 2 - 0.02, 0.005);
      tapeL.rotation.z = -0.25;

      const tapeR = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), tapeMat);
      tapeR.position.set(width / 2 - 0.06, height / 2 - 0.02, 0.005);
      tapeR.rotation.z = 0.25;

      g.add(tapeL, tapeR);
      return g;
    };

    // 1. Left Wall Drawings: Starship & Alien Planet (Near Cabinet)
    this.group.add(createPinnedDrawing('spaceship', 1.3, 0.95, [-4.38, 2.35, -1.5], Math.PI / 2));
    this.group.add(createPinnedDrawing('planet', 1.0, 0.75, [-4.38, 2.3, 0.1], Math.PI / 2));

    // 2. Right Wall Drawings: Cosmic Defender Robot & Space Battle (Above Study Desk)
    this.group.add(createPinnedDrawing('robot', 1.25, 0.92, [4.38, 2.4, -0.6], -Math.PI / 2));
    this.group.add(createPinnedDrawing('battle', 1.1, 0.8, [4.38, 2.3, 0.9], -Math.PI / 2));

    // 3. Back Wall Drawing: Starship Zane sketch near door
    this.group.add(createPinnedDrawing('spaceship', 0.9, 0.68, [2.0, 2.2, 4.38], Math.PI));

    // Also load the real asset texture if available as the centerpiece inspect drawing
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(CRAYON_DRAWINGS_PATH, (crayonTex) => {
      crayonTex.colorSpace = THREE.SRGBColorSpace;
      crayonTex.generateMipmaps = true;
      crayonTex.minFilter = THREE.LinearMipmapLinearFilter;
      crayonTex.magFilter = THREE.LinearFilter;
      crayonTex.wrapS = THREE.RepeatWrapping;
      crayonTex.wrapT = THREE.RepeatWrapping;
      const centerDraw = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.95),
        new THREE.MeshBasicMaterial({ map: crayonTex })
      );
      centerDraw.position.set(-4.37, 2.35, -1.5);
      centerDraw.rotation.y = Math.PI / 2;
      addInkOutline(centerDraw, 0.025);
      this.group.add(centerDraw);
    });
  }

  // Scattered Kid Toys, Cardboard Box Fort, Toy Sports Ball, Toy Car, and Toy Blocks
  // Placed neatly along borders and corners to keep movement lanes wide and easily traversable!
  private buildScatteredKidToysAndBoxes() {
    const toysGroup = new THREE.Group();

    // 1. CARDBOARD BOX PLAY FORT in left corner (X = -2.2, Z = 2.5)
    const boxGroup = new THREE.Group();
    boxGroup.position.set(-2.2, 0, 2.5);
    boxGroup.rotation.y = 0.25;

    const cardboardMat = createToonMaterial({ color: 0xd4a373, desaturate: 0.12 });
    const boxMain = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.65), cardboardMat);
    boxMain.position.y = 0.25;
    boxMain.castShadow = true;
    boxMain.receiveShadow = true;
    addInkOutline(boxMain, 0.03);
    boxGroup.add(boxMain);

    // Open top flaps
    const flapMat = createToonMaterial({ color: 0xc89664, desaturate: 0.12 });
    const flapL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.65), flapMat);
    flapL.position.set(-0.38, 0.55, 0);
    flapL.rotation.z = -0.6;
    addInkOutline(flapL, 0.025);

    const flapR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.65), flapMat);
    flapR.position.set(0.38, 0.55, 0);
    flapR.rotation.z = 0.6;
    addInkOutline(flapR, 0.025);

    // Crayon label "STARSHIP 1" on side of cardboard box
    const labelMat = createToonMaterial({ color: 0xfef9e7, desaturate: 0.05 });
    const boxLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.18), labelMat);
    boxLabel.position.set(0, 0.25, 0.33);
    addInkOutline(boxLabel, 0.02);
    boxGroup.add(flapL, flapR, boxLabel);
    toysGroup.add(boxGroup);

    // 2. TOY SPORTS BALL (Basketball / Soccer) in right corner (X = 2.2, Z = 2.5)
    const ballMat = createToonMaterial({ color: 0xf97316, desaturate: 0.08 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), ballMat);
    ball.position.set(2.2, 0.18, 2.5);
    ball.castShadow = true;
    addInkOutline(ball, 0.03);

    // Ball black seam rings
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.181, 0.008, 8, 24), ringMat);
    seam.position.set(2.2, 0.18, 2.5);
    seam.rotation.x = Math.PI / 4;
    toysGroup.add(ball, seam);

    // 3. TOY RACING CAR near cardboard box
    const carGroup = new THREE.Group();
    carGroup.position.set(-1.4, 0.06, 2.2);
    carGroup.rotation.y = -0.5;

    const carMat = createToonMaterial({ color: 0xef4444, desaturate: 0.08 });
    const carBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.45), carMat);
    carBody.position.y = 0.05;
    addInkOutline(carBody, 0.025);

    const carCabin = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.07, 0.2),
      createToonMaterial({ color: 0x38bdf8, desaturate: 0.05 })
    );
    carCabin.position.set(0, 0.11, -0.04);
    addInkOutline(carCabin, 0.025);

    // Wheels
    const wheelMat = createToonMaterial({ color: 0x1e293b, desaturate: 0.1 });
    const wheelOffsets: [number, number][] = [
      [-0.12, -0.12],
      [0.12, -0.12],
      [-0.12, 0.12],
      [0.12, 0.12],
    ];
    wheelOffsets.forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10), wheelMat);
      wheel.position.set(wx, 0.04, wz);
      wheel.rotation.z = Math.PI / 2;
      addInkOutline(wheel, 0.02);
      carGroup.add(wheel);
    });

    carGroup.add(carBody, carCabin);
    carGroup.castShadow = true;
    toysGroup.add(carGroup);

    // 4. COLORFUL TOY BUILDING BLOCKS in clusters near corners and bedside (Leaves main center path clear!)
    const blockColors = [0xef4444, 0x3b82f6, 0xfacc15, 0x10b981];
    const blockPositions: [number, number, number][] = [
      [-1.8, 0.04, 1.8],
      [-1.7, 0.04, 1.95],
      [-1.9, 0.04, 2.1],
      [-1.75, 0.1, 1.88], // Stacked block!
      [1.6, 0.04, 2.2],
      [1.8, 0.04, 2.1],
      [2.5, 0.04, 1.6],
      [2.6, 0.04, 1.45],
      [-2.4, 0.04, -2.0],
      [-2.2, 0.04, -2.15],
    ];

    blockPositions.forEach(([bx, by, bz], idx) => {
      const col = blockColors[idx % blockColors.length];
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.08, 0.14),
        createToonMaterial({ color: col, desaturate: 0.08 })
      );
      block.position.set(bx, by, bz);
      block.rotation.y = (idx * 0.7) % Math.PI;
      block.castShadow = true;
      addInkOutline(block, 0.025);
      toysGroup.add(block);
    });

    // 5. Kid's sneakers in red and white near door corner
    const sneakerMat = createToonMaterial({ color: 0xef4444, desaturate: 0.08 });
    const shoe1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.28), sneakerMat);
    shoe1.position.set(1.2, 0.055, 3.5);
    shoe1.rotation.y = 0.5;
    addInkOutline(shoe1, 0.03);

    const shoe2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.28), sneakerMat);
    shoe2.position.set(1.5, 0.055, 3.3);
    shoe2.rotation.y = -0.7;
    addInkOutline(shoe2, 0.03);
    toysGroup.add(shoe1, shoe2);

    this.group.add(toysGroup);
  }

  // BEDROOM LOCAL ACCENT LIGHTING
  private setupLighting() {
    // Ceiling light fixture in warm white with soft local accent light
    const ceilingFixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16),
      createToonMaterial({ color: 0xffffff, desaturate: 0.05 })
    );
    ceilingFixture.position.set(0, 3.9, 0);

    const ceilingBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    ceilingBulb.position.set(0, 3.82, 0);

    const ceilingLight = new THREE.PointLight(0xfff0db, 0.6, 12.0, 2);
    ceilingLight.position.set(0, 3.7, 0);

    this.group.add(ceilingFixture, ceilingBulb, ceilingLight);
  }

  private setupInteractionNodes() {
    this.interactionNodes = [
      {
        id: 'bedroom_drawings',
        name: 'Space Battle Drawings',
        position: [-4.2, 2.1, -1.5],
        promptKey: 'E',
        promptVerb: 'View',
        interactRadius: 2.2,
        description: 'Crayon space drawings of rockets, stars, and adventures taped on the wall.',
      },
      {
        id: 'bedroom_cabinet',
        name: 'Wooden Cabinet',
        position: [-3.4, 1.2, 0.8],
        promptKey: 'E',
        promptVerb: 'Open',
        interactRadius: 2.4,
        description: 'Tall wooden cabinet holding school books, binders, and comic books.',
      },
      {
        id: 'bedroom_window',
        name: 'Sunny Window',
        position: [0, 1.8, -4.0],
        promptKey: 'E',
        promptVerb: 'Look',
        interactRadius: 2.5,
        description: 'Looking outside at the bright sunny day, green rolling hills, and blue skies.',
      },
    ];
  }

  public toggleCabinet(): boolean {
    this.isCabinetOpen = !this.isCabinetOpen;
    return this.isCabinetOpen;
  }

  public update(delta: number) {
    const targetCabinetAngle = this.isCabinetOpen ? Math.PI * 0.75 : 0;
    this.cabinetOpenProgress = THREE.MathUtils.lerp(this.cabinetOpenProgress, targetCabinetAngle, delta * 5);
    if (this.cabinetDoorLeft && this.cabinetDoorRight) {
      this.cabinetDoorLeft.rotation.y = -this.cabinetOpenProgress;
      this.cabinetDoorRight.rotation.y = this.cabinetOpenProgress;
    }

    if (this.dustParticles) {
      const pos = this.dustParticles.geometry.attributes.position.array as Float32Array;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= delta * 0.08;
        if (pos[i] < 0.2) pos[i] = 2.8;
      }
      this.dustParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  // Build static 2D ground plane colliders (built ONCE on load, not per-frame)
  private buildColliders() {
    this.colliders = [
      // Outer Room Walls
      { id: 'bedroom_wall_front', name: 'Front Window Wall', minX: -4.5, maxX: 4.5, minZ: -4.6, maxZ: -4.35, height: 3.5 },
      { id: 'bedroom_wall_left', name: 'Left Wall', minX: -4.6, maxX: -4.35, minZ: -4.5, maxZ: 4.5, height: 3.5 },
      { id: 'bedroom_wall_right', name: 'Right Wall', minX: 4.35, maxX: 4.6, minZ: -4.5, maxZ: 4.5, height: 3.5 },
      { id: 'bedroom_wall_back_left', name: 'Back Wall Left', minX: -4.5, maxX: -0.75, minZ: 4.35, maxZ: 4.6, height: 3.5 },
      { id: 'bedroom_wall_back_right', name: 'Back Wall Right', minX: 0.75, maxX: 4.5, minZ: 4.35, maxZ: 4.6, height: 3.5 },

      // Large Solid Furniture
      // Bed (Center X=0, Z=-0.6)
      { id: 'bedroom_bed', name: 'Twin Bed', minX: -1.15, maxX: 1.15, minZ: -2.35, maxZ: 1.15, height: 1.0 },
      // Wardrobe Cabinet (Center X=-3.7, Z=0.8)
      { id: 'bedroom_cabinet_body', name: 'Wooden Wardrobe', minX: -4.35, maxX: -3.15, minZ: -0.15, maxZ: 1.75, height: 2.4 },
      // Bookshelf (Center X=-3.7, Z=-2.5)
      { id: 'bedroom_bookshelf_body', name: 'Bookshelf Unit', minX: -4.1, maxX: -3.3, minZ: -3.3, maxZ: -1.7, height: 2.0 },
      // Study Desk & Chair (Center X=3.6, Z=-0.5)
      { id: 'bedroom_desk_body', name: 'Study Desk', minX: 2.95, maxX: 4.35, minZ: -1.85, maxZ: 0.85, height: 1.2 },
      // Cardboard Play Fort (Center X=-2.2, Z=2.5)
      { id: 'bedroom_box_fort', name: 'Cardboard Box Fort', minX: -2.65, maxX: -1.75, minZ: 2.1, maxZ: 2.9, height: 0.6 },
    ];
  }
}
