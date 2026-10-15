import * as THREE from 'three';
import { InteractionNode } from '../types/game';
import { BoxCollider2D } from '../utils/collision';
import { createToonMaterial, addInkOutline } from '../utils/toonShader';
import { createFresnelRimMaterial } from '../utils/cyberAtmosphere';

export interface HouseDoorOptions {
  id: string;
  name: string;
  position: THREE.Vector3; // World position of door hinge pivot
  rotationY?: number; // Base Y rotation angle when closed (radians)
  width?: number; // Default 1.3
  height?: number; // Default 2.5
  thickness?: number; // Default 0.08
  swingAngle?: number; // Base opening angle magnitude (default ~1.745 rad = 100 deg)
  isLocked?: boolean;
  lockedMessage?: string;
  targetRoomId?: string;
  targetRoomGroup?: THREE.Group;
  doorColor?: number;
  handleColor?: number;
  frameColor?: number;
  customLabelText?: string;
  [key: string]: any;
}

export class HouseDoor {
  public id: string;
  public name: string;
  public position: THREE.Vector3;
  public baseRotationY: number;
  public width: number;
  public height: number;
  public thickness: number;
  public baseSwingMagnitude: number;
  public currentSwingAngle: number;
  public isLocked: boolean;
  public lockedMessage: string;
  public targetRoomId: string;
  public targetRoomGroup: THREE.Group;
  public config: any;

  public pivotGroup: THREE.Group;
  public frameGroup: THREE.Group;
  public group: THREE.Group;
  public doorMesh: THREE.Object3D;
  public isOpen: boolean = false;
  public animProgress: number = 0; // 0 = closed, 1 = fully open
  public cyberFresnelMat: THREE.ShaderMaterial | null = null;
  public cyberEdgesGroup: THREE.Group | null = null;

  private colliderBox: BoxCollider2D;
  public interactionNode: InteractionNode;

  public getInteractionNode(_playerPos?: any): InteractionNode {
    return this.interactionNode;
  }

  constructor(options: HouseDoorOptions) {
    this.config = options;
    this.id = options.id;
    this.name = options.name;
    this.position = options.position.clone();
    this.baseRotationY = options.rotationY || 0;
    this.width = options.width || 1.3;
    this.height = options.height || 2.5;
    this.thickness = options.thickness || 0.08;
    // Default 100 degrees = ~1.74533 radians
    this.baseSwingMagnitude = options.swingAngle !== undefined ? Math.abs(options.swingAngle) : 1.74533;
    this.currentSwingAngle = -this.baseSwingMagnitude;
    this.isLocked = options.isLocked || false;
    this.lockedMessage = options.lockedMessage || 'The door is locked.';
    this.targetRoomId = options.targetRoomId || '';
    this.targetRoomGroup = options.targetRoomGroup || new THREE.Group();

    // 1. Hinge pivot group placed exactly at hinge edge
    this.pivotGroup = new THREE.Group();
    this.pivotGroup.position.copy(this.position);
    this.pivotGroup.rotation.y = this.baseRotationY;
    this.group = this.pivotGroup;

    // 2. Door Frame Group wrapping around the doorway opening (both sides)
    this.frameGroup = new THREE.Group();
    this.frameGroup.position.copy(this.position);
    this.frameGroup.rotation.y = this.baseRotationY;
    this.buildDoorFrame(options.frameColor || 0xffffff);

    // 3. Door leaf mesh inside pivot group with DoubleSide materials
    const doorMat = createToonMaterial({
      color: options.doorColor || 0xa16207,
      desaturate: 0.1,
      side: THREE.DoubleSide,
    });
    const handleMat = createToonMaterial({
      color: options.handleColor || 0xf59e0b,
      desaturate: 0.1,
      side: THREE.DoubleSide,
    });

    const doorGroup = new THREE.Group();
    const doorLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(this.width, this.height, this.thickness),
      doorMat
    );
    // Align left edge of leaf with hinge pivot at X = 0
    doorLeaf.position.set(this.width / 2, this.height / 2, 0);
    doorLeaf.castShadow = true;
    doorLeaf.receiveShadow = true;
    addInkOutline(doorLeaf, 0.035);
    doorGroup.add(doorLeaf);

    // Dual handles for inside & outside visibility
    const handleFront = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.18, 0.12),
      handleMat
    );
    handleFront.position.set(this.width - 0.12, this.height / 2, 0);
    addInkOutline(handleFront, 0.025);
    doorGroup.add(handleFront);

    this.doorMesh = doorGroup;
    this.pivotGroup.add(this.doorMesh);

    // 4. Closed collider box
    this.colliderBox = this.calculateCollider();

    // 5. Floating interaction label position
    const labelLocal = new THREE.Vector3(this.width / 2, 1.2, 0);
    labelLocal.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.baseRotationY);
    const labelWorld = this.position.clone().add(labelLocal);

    this.interactionNode = {
      id: this.id,
      name: options.customLabelText || this.name,
      position: [labelWorld.x, labelWorld.y, labelWorld.z],
      promptKey: 'E',
      promptVerb: 'Open',
      description: this.isLocked ? `Locked ${this.name}` : `Press E to open ${this.name}.`,
      interactRadius: options.interactRadius !== undefined ? options.interactRadius : 2.8,
    };
  }

  /**
   * Builds a 3D door frame wrapping around the opening with depth 0.22m
   */
  private buildDoorFrame(color: number) {
    const frameMat = createToonMaterial({
      color,
      desaturate: 0.05,
      side: THREE.DoubleSide,
    });
    const depth = 0.22; // Depth wrapping wall thickness
    const frameWidth = 0.07;

    // Left Jamb
    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, this.height + 0.08, depth), frameMat);
    leftJamb.position.set(-frameWidth / 2, (this.height + 0.08) / 2, 0);
    addInkOutline(leftJamb, 0.03);

    // Right Jamb
    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, this.height + 0.08, depth), frameMat);
    rightJamb.position.set(this.width + frameWidth / 2, (this.height + 0.08) / 2, 0);
    addInkOutline(rightJamb, 0.03);

    // Top Header
    const topHeader = new THREE.Mesh(new THREE.BoxGeometry(this.width + frameWidth * 2, frameWidth, depth), frameMat);
    topHeader.position.set(this.width / 2, this.height + frameWidth / 2, 0);
    addInkOutline(topHeader, 0.03);

    this.frameGroup.add(leftJamb, rightJamb, topHeader);

    // Glowing Cyber Emissive Edges & Fresnel Rim for Space Station Door Frames
    const cyberEdges = new THREE.Group();
    cyberEdges.visible = false;
    const edgeColor = this.id === 'bedroom_door' || this.id === 'basement_door' ? 0x06b6d4 : 0xf97316;
    const edgeMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.9,
    });

    const frameEdgeGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(this.width + frameWidth * 2 + 0.02, this.height + frameWidth + 0.04, depth + 0.02)
    );
    const lineMesh = new THREE.LineSegments(frameEdgeGeo, edgeMat);
    lineMesh.position.set(this.width / 2, (this.height + frameWidth) / 2, 0);
    cyberEdges.add(lineMesh);
    this.cyberEdgesGroup = cyberEdges;
    this.frameGroup.add(cyberEdges);

    // Fresnel Rim Material Overlay for Door Frame
    this.cyberFresnelMat = createFresnelRimMaterial(edgeColor, 2.6);
    const fresnelFrameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.width + frameWidth * 2 + 0.01, this.height + frameWidth + 0.02, depth + 0.01),
      this.cyberFresnelMat
    );
    fresnelFrameMesh.position.set(this.width / 2, (this.height + frameWidth) / 2, 0);
    this.frameGroup.add(fresnelFrameMesh);
  }

  public setCyberProgress(progress: number) {
    if (this.cyberEdgesGroup) {
      this.cyberEdgesGroup.visible = progress > 0.05;
    }
    if (this.cyberFresnelMat && this.cyberFresnelMat.uniforms.uProgress) {
      this.cyberFresnelMat.uniforms.uProgress.value = progress;
    }
  }

  private calculateCollider(): BoxCollider2D {
    const p1 = new THREE.Vector3(0, 0, -this.thickness / 2 - 0.05);
    const p2 = new THREE.Vector3(this.width, 0, this.thickness / 2 + 0.05);
    p1.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.baseRotationY).add(this.position);
    p2.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.baseRotationY).add(this.position);

    const minX = Math.min(p1.x, p2.x) - 0.15;
    const maxX = Math.max(p1.x, p2.x) + 0.15;
    const minZ = Math.min(p1.z, p2.z) - 0.15;
    const maxZ = Math.max(p1.z, p2.z) + 0.15;

    return {
      id: `${this.id}_collider`,
      name: `${this.name} Closed Door`,
      minX,
      maxX,
      minZ,
      maxZ,
      height: this.height,
    };
  }

  /**
   * Calculates swing direction so door opens AWAY from the player
   */
  public determineSwingDirection(playerPos: THREE.Vector3) {
    const doorNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.baseRotationY);
    const toPlayer = playerPos.clone().sub(this.position);
    const dot = toPlayer.dot(doorNormal);

    // If player is on front side (dot > 0), swing negative angle away from player.
    // If player is on back side (dot <= 0), swing positive angle away from player.
    this.currentSwingAngle = dot > 0 ? -this.baseSwingMagnitude : this.baseSwingMagnitude;
  }

  public setLocked(locked: boolean, message?: string) {
    this.isLocked = locked;
    if (message) this.lockedMessage = message;
    if (this.isLocked) {
      this.interactionNode.promptVerb = 'Check';
      this.interactionNode.description = `Locked: ${this.lockedMessage}`;
    } else {
      this.interactionNode.promptVerb = this.isOpen ? 'Close' : 'Open';
      this.interactionNode.description = this.isOpen
        ? `Press E to close ${this.name}.`
        : `Press E to open ${this.name}.`;
    }
  }

  public toggle(playerPos?: THREE.Vector3): { success: boolean; isLocked: boolean; isOpen: boolean; message?: string } {
    if (this.isLocked) {
      return { success: false, isLocked: true, isOpen: false, message: this.lockedMessage };
    }

    this.isOpen = !this.isOpen;
    if (this.isOpen && playerPos) {
      this.determineSwingDirection(playerPos);
    }
    this.interactionNode.promptVerb = this.isOpen ? 'Close' : 'Open';
    if (this.isOpen) {
      this.targetRoomGroup.visible = true;
      this.interactionNode.description = `Press E to close ${this.name}.`;
    } else {
      this.interactionNode.description = `Press E to open ${this.name}.`;
      if (this.animProgress <= 0) {
        this.targetRoomGroup.visible = false;
      }
    }

    return { success: true, isLocked: false, isOpen: this.isOpen };
  }

  public open(playerPos?: THREE.Vector3) {
    if (this.isLocked) return;
    this.isOpen = true;
    if (playerPos) {
      this.determineSwingDirection(playerPos);
    }
    this.targetRoomGroup.visible = true;
    this.interactionNode.promptVerb = 'Close';
    this.interactionNode.description = `Press E to close ${this.name}.`;
  }

  public close() {
    this.isOpen = false;
    this.animProgress = 0;
    this.pivotGroup.rotation.y = this.baseRotationY;
    this.targetRoomGroup.visible = false;
    this.interactionNode.promptVerb = 'Open';
    this.interactionNode.description = `Press E to open ${this.name}.`;
  }

  /**
   * Advances swing animation every frame in main loop over 0.5s with cubic easing
   */
  public update(delta: number) {
    const targetProgress = this.isOpen ? 1.0 : 0.0;
    if (Math.abs(this.animProgress - targetProgress) > 0.0001) {
      if (this.animProgress < targetProgress) {
        this.animProgress = Math.min(targetProgress, this.animProgress + delta / 0.5);
      } else {
        this.animProgress = Math.max(targetProgress, this.animProgress - delta / 0.5);
      }

      // Smooth ease-in-out cubic easing
      const ease = this.animProgress < 0.5
        ? 4 * this.animProgress * this.animProgress * this.animProgress
        : 1 - Math.pow(-2 * this.animProgress + 2, 3) / 2;

      this.pivotGroup.rotation.y = this.baseRotationY + this.currentSwingAngle * ease;

      // Hide target room group once closing animation finishes
      if (!this.isOpen && this.animProgress <= 0) {
        this.targetRoomGroup.visible = false;
      }
    } else if (!this.isOpen && this.animProgress <= 0) {
      this.targetRoomGroup.visible = false;
    }
  }

  /**
   * Returns active collider when closed, or null when open.
   */
  public getCollider(): BoxCollider2D | null {
    return this.isOpen ? null : this.colliderBox;
  }
}

export { HouseDoor as InteractiveDoor };
