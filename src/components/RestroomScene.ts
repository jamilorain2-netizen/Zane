import * as THREE from 'three';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { BoxCollider2D } from '../utils/collision';

export class RestroomScene {
  public group: THREE.Group;
  public colliders: BoxCollider2D[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.buildRoom();
    this.buildVanityAndSink();
    this.buildToiletAndTowels();
    this.buildLighting();
    this.buildColliders();
  }

  private buildRoom() {
    // Floor: Clean light ceramic tile floor
    const floorMat = createToonMaterial({ color: 0xe2e8f0, desaturate: 0.05 });
    const wallMat = createToonMaterial({ color: 0x93c5fd, desaturate: 0.1 }); // Soft pastel sky blue tiles
    const ceilingMat = createToonMaterial({ color: 0xe6d7c5, desaturate: 0.06 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.5), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 22.0);
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.5), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.8, 22.0);
    this.group.add(ceiling);

    // Back Wall (Z = 24.25)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.8, 0.2), wallMat);
    backWall.position.set(0, 1.9, 24.25);
    this.group.add(backWall);

    // Left Wall (X = -2.0)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 4.5), wallMat);
    leftWall.position.set(-2.0, 1.9, 22.0);
    this.group.add(leftWall);

    // Right Wall (X = 2.0)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 4.5), wallMat);
    rightWall.position.set(2.0, 1.9, 22.0);
    this.group.add(rightWall);

    // Front Wall with Doorway Opening (Z = 19.75, X = [-0.65, 0.65])
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.8, 0.2), wallMat);
    frontWallLeft.position.set(-1.325, 1.9, 19.75);

    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.8, 0.2), wallMat);
    frontWallRight.position.set(1.325, 1.9, 19.75);

    const frontWallTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.2), wallMat);
    frontWallTop.position.set(0, 3.15, 19.75);

    this.group.add(frontWallLeft, frontWallRight, frontWallTop);
  }

  private buildVanityAndSink() {
    const vanityGroup = new THREE.Group();
    vanityGroup.position.set(-1.2, 0, 22.0);

    const cabinetMat = createToonMaterial({ color: 0x3b82f6, desaturate: 0.08 });
    const sinkMat = createToonMaterial({ color: 0xffffff, desaturate: 0.05 });
    const mirrorMat = createToonMaterial({ color: 0x38bdf8, desaturate: 0.05 });

    // Vanity Cabinet
    const vanity = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 1.2), cabinetMat);
    vanity.position.set(0, 0.425, 0);
    vanity.castShadow = true;
    addInkOutline(vanity, 0.03);
    vanityGroup.add(vanity);

    // Sink Basin
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.9), sinkMat);
    sink.position.set(0, 0.86, 0);
    addInkOutline(sink, 0.025);
    vanityGroup.add(sink);

    // Faucet
    const faucet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8),
      createToonMaterial({ color: 0x94a3b8, desaturate: 0.05 })
    );
    faucet.position.set(-0.25, 0.98, 0);
    vanityGroup.add(faucet);

    // Wall Mirror
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.9), mirrorMat);
    mirror.position.set(-0.38, 1.8, 0);
    mirror.rotation.y = Math.PI / 2;
    addInkOutline(mirror, 0.025);
    vanityGroup.add(mirror);

    this.group.add(vanityGroup);
  }

  private buildToiletAndTowels() {
    const bathGroup = new THREE.Group();
    bathGroup.position.set(1.2, 0, 23.2);

    const ceramicMat = createToonMaterial({ color: 0xffffff, desaturate: 0.05 });

    // Toilet Bowl
    const bowl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 0.6), ceramicMat);
    bowl.position.set(0, 0.21, 0);
    bowl.castShadow = true;
    addInkOutline(bowl, 0.03);
    bathGroup.add(bowl);

    // Toilet Tank
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.28), ceramicMat);
    tank.position.set(0, 0.65, 0.25);
    tank.castShadow = true;
    addInkOutline(tank, 0.03);
    bathGroup.add(tank);

    // Fluffy Blue Bath Mat
    const matMat = createToonMaterial({ color: 0x0284c7, desaturate: 0.08 });
    const bathMat = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), matMat);
    bathMat.rotation.x = -Math.PI / 2;
    bathMat.position.set(0, 0.01, -0.6);
    addInkOutline(bathMat, 0.02);
    bathGroup.add(bathMat);

    // Towel Rack on Right Wall (X = 1.9)
    const rackMat = createToonMaterial({ color: 0xf59e0b, desaturate: 0.1 });
    const towelMat = createToonMaterial({ color: 0xfde047, desaturate: 0.08 });

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 8), rackMat);
    bar.position.set(1.88, 1.4, 21.5);
    bar.rotation.x = Math.PI / 2;
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.45), towelMat);
    towel.position.set(1.86, 1.2, 21.5);
    addInkOutline(towel, 0.02);
    this.group.add(bar, towel);

    this.group.add(bathGroup);
  }

  private buildLighting() {
    const light = new THREE.PointLight(0xfff3e0, 1.0, 12.0, 2);
    light.position.set(0, 3.2, 22.0);
    light.castShadow = true;
    this.group.add(light);

    const fixture = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    fixture.position.set(0, 3.65, 22.0);
    this.group.add(fixture);
  }

  private buildColliders() {
    this.colliders = [
      // Restroom Walls
      { id: 'rr_wall_back', name: 'Restroom Back Wall', minX: -2.0, maxX: 2.0, minZ: 24.15, maxZ: 24.35, height: 3.8 },
      { id: 'rr_wall_left', name: 'Restroom Left Wall', minX: -2.1, maxX: -1.9, minZ: 19.75, maxZ: 24.25, height: 3.8 },
      { id: 'rr_wall_right', name: 'Restroom Right Wall', minX: 1.9, maxX: 2.1, minZ: 19.75, maxZ: 24.25, height: 3.8 },
      { id: 'rr_wall_front_l', name: 'Restroom Front Left Wall', minX: -2.0, maxX: -0.65, minZ: 19.65, maxZ: 19.85, height: 3.8 },
      { id: 'rr_wall_front_r', name: 'Restroom Front Right Wall', minX: 0.65, maxX: 2.0, minZ: 19.65, maxZ: 19.85, height: 3.8 },
      // Vanity & Toilet
      { id: 'rr_vanity', name: 'Vanity Counter', minX: -1.6, maxX: -0.8, minZ: 21.4, maxZ: 22.6, height: 0.9 },
      { id: 'rr_toilet', name: 'Toilet', minX: 0.9, maxX: 1.5, minZ: 22.8, maxZ: 23.6, height: 0.7 },
    ];
  }
}
