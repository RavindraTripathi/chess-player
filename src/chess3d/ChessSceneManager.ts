import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Chess, type Square } from 'chess.js';
import { CHESS_SKINS, type ChessSkin, type PieceFinishSpec, type SquareFinishSpec } from './skins';
import { getPiecePartSpecs, type PieceTypeKey } from './pieceGeometries';
import {
  createBoardCoordTexture,
  createBrushedMetalTexture,
  createMarbleTexture,
  createRadialShadowTexture,
  createWoodGrainTexture,
} from './textures';
import type { PlayerColor, SkinId } from '../shared/protocol';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const BOARD_TOP_Y = 0.16;
const SQUARE_SIZE = 1.0;

// Pre-allocated math helpers (zero GC inside render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

export type CameraPreset = 'player' | 'top' | 'showcase';

export interface SceneCallbacks {
  onSquareClick: (square: Square) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

interface PieceEntity {
  id: string;
  color: PlayerColor;
  type: PieceTypeKey;
  square: Square | null; // null if captured
  group: THREE.Group;
  targetPos: THREE.Vector3;
  startPos: THREE.Vector3;
  animTime: number;
  animDuration: number;
  isAnimating: boolean;
  hoverLift: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

function detectSoftwareGl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export function squareToWorld(sq: Square, target = new THREE.Vector3()): THREE.Vector3 {
  const fileIdx = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const rankNum = Number(sq[1]); // 1..8
  const x = (fileIdx - 3.5) * SQUARE_SIZE;
  const z = (4.5 - rankNum) * SQUARE_SIZE; // rank 1 at +3.5 (bottom for White), rank 8 at -3.5
  return target.set(x, BOARD_TOP_Y, z);
}

export class ChessSceneManager {
  private container: HTMLElement;
  private callbacks: SceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();

  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;

  private tableMesh!: THREE.Mesh;
  private plinthMesh!: THREE.Mesh;
  private coordPlateMesh!: THREE.Mesh;
  private trimMeshes: THREE.Mesh[] = [];
  private lightSquareMeshes: THREE.Mesh[] = [];
  private darkSquareMeshes: THREE.Mesh[] = [];
  private squareHitboxes: THREE.Mesh[] = [];

  private hoverRing!: THREE.Mesh;
  private selectedRing!: THREE.Mesh;
  private lastFromHighlight!: THREE.Mesh;
  private lastToHighlight!: THREE.Mesh;
  private checkRing!: THREE.Mesh;
  private legalMoveMarkers: THREE.Group;

  private piecesGroup = new THREE.Group();
  private piecesBySquare = new Map<Square, PieceEntity>();
  private capturedWhite: PieceEntity[] = [];
  private capturedBlack: PieceEntity[] = [];
  private allPieces: PieceEntity[] = [];
  private nextPieceUid = 1;

  private particlesGroup = new THREE.Group();
  private particles: Particle[] = [];
  private particleGeo = new THREE.SphereGeometry(0.035, 8, 8);
  private particleMat = new THREE.MeshStandardMaterial({
    color: 0xe8c474,
    roughness: 0.25,
    metalness: 0.85,
    emissive: 0x705015,
    emissiveIntensity: 0.5,
  });

  // Materials swapped dynamically by skin
  private whiteBodyMat!: THREE.MeshPhysicalMaterial;
  private blackBodyMat!: THREE.MeshPhysicalMaterial;
  private whiteAccentMat!: THREE.MeshStandardMaterial;
  private blackAccentMat!: THREE.MeshStandardMaterial;
  private feltMat!: THREE.MeshStandardMaterial;
  private lightSqMat!: THREE.MeshPhysicalMaterial;
  private darkSqMat!: THREE.MeshPhysicalMaterial;
  private coordMat!: THREE.MeshStandardMaterial;
  private plinthMat!: THREE.MeshStandardMaterial;
  private trimMat!: THREE.MeshStandardMaterial;
  private tableMat!: THREE.MeshStandardMaterial;
  private activeTextures: THREE.Texture[] = [];

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private lastHoverCheck = 0;
  private hoveredSquare: Square | null = null;
  private selectedSquare: Square | null = null;

  private orientation: PlayerColor = 'w';
  private showcaseMode = true;
  private cameraTargetGoal: THREE.Vector3 | null = null;
  private cameraPosGoal: THREE.Vector3 | null = null;
  private activeSkinId: SkinId = 'staunton';

  private frameId = 0;
  private disposed = false;

  constructor(container: HTMLElement, initialSkin: SkinId, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.activeSkinId = initialSkin;
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    this.camera.position.set(0, 8.6, 9.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 5.4;
    this.controls.maxDistance = 18.0;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.controls.enablePan = false;
    this.controls.target.set(0, 0.3, 0);
    this.controls.addEventListener('start', () => {
      // Never fight manual user camera drag
      this.cameraPosGoal = null;
      this.cameraTargetGoal = null;
    });

    this.legalMoveMarkers = new THREE.Group();
    this.scene.add(this.legalMoveMarkers);
    this.scene.add(this.piecesGroup);
    this.scene.add(this.particlesGroup);

    this.initMaterials();
    this.buildLighting();
    this.buildEnvironmentAndBoard();
    this.buildIndicators();
    this.applySkin(initialSkin);
    this.syncFen(new Chess().fen(), null, false, false);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.tick();
  }

  private initMaterials(): void {
    this.whiteBodyMat = new THREE.MeshPhysicalMaterial({ color: 0xecdab5, roughness: 0.35 });
    this.blackBodyMat = new THREE.MeshPhysicalMaterial({ color: 0x342218, roughness: 0.35 });
    this.whiteAccentMat = new THREE.MeshStandardMaterial({ color: 0xd4af66, roughness: 0.22, metalness: 0.88 });
    this.blackAccentMat = new THREE.MeshStandardMaterial({ color: 0xc8a25a, roughness: 0.22, metalness: 0.88 });
    this.feltMat = new THREE.MeshStandardMaterial({ color: 0x1d4d3a, roughness: 0.94, metalness: 0.0 });

    this.lightSqMat = new THREE.MeshPhysicalMaterial({ color: 0xdfc9a2, roughness: 0.4 });
    this.darkSqMat = new THREE.MeshPhysicalMaterial({ color: 0x4b3123, roughness: 0.45 });
    this.coordMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.08 });
    this.plinthMat = new THREE.MeshStandardMaterial({ color: 0x241811, roughness: 0.55, metalness: 0.12 });
    this.trimMat = new THREE.MeshStandardMaterial({ color: 0xc8a25a, roughness: 0.25, metalness: 0.9 });
    this.tableMat = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.88, metalness: 0.06 });
  }

  private buildLighting(): void {
    this.hemiLight = new THREE.HemisphereLight(0xbfd4f2, 0x2b2018, 0.72);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff2dc, 2.2);
    this.keyLight.position.set(6.5, 11.5, 6.0);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 28;
    const d = 6.2;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0xa3c2f5, 0.75);
    this.rimLight.position.set(-7.0, 5.5, -6.5);
    this.scene.add(this.rimLight);
  }

  private buildEnvironmentAndBoard(): void {
    // Studio table top (y = -0.42)
    const tableGeo = new THREE.CylinderGeometry(24, 24, 0.4, 64);
    this.tableMesh = new THREE.Mesh(tableGeo, this.tableMat);
    this.tableMesh.position.set(0, -0.62, 0);
    this.tableMesh.receiveShadow = true;
    this.scene.add(this.tableMesh);

    // Contact shadow plane directly under board plinth (y = -0.415)
    const shadowTex = createRadialShadowTexture();
    const contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(13.8, 13.8),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.78,
      })
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = -0.415;
    this.scene.add(contactPlane);

    // Multi-tier sculpted board plinth
    const plinthGeo = new THREE.BoxGeometry(9.6, 0.42, 9.6);
    this.plinthMesh = new THREE.Mesh(plinthGeo, this.plinthMat);
    this.plinthMesh.position.set(0, -0.21, 0);
    this.plinthMesh.castShadow = true;
    this.plinthMesh.receiveShadow = true;
    this.scene.add(this.plinthMesh);

    // Coordinate surround plate (sits at y = 0..0.14)
    const coordGeo = new THREE.BoxGeometry(9.2, 0.14, 9.2);
    this.coordPlateMesh = new THREE.Mesh(coordGeo, this.coordMat);
    this.coordPlateMesh.position.set(0, 0.07, 0);
    this.coordPlateMesh.receiveShadow = true;
    this.coordPlateMesh.castShadow = true;
    this.scene.add(this.coordPlateMesh);

    // Metallic corner brackets (4 corner accents)
    const bracketGeo = new THREE.BoxGeometry(0.45, 0.17, 0.45);
    const cornerOffsets: Array<[number, number]> = [
      [-4.62, -4.62],
      [4.62, -4.62],
      [-4.62, 4.62],
      [4.62, 4.62],
    ];
    for (const [cx, cz] of cornerOffsets) {
      const m = new THREE.Mesh(bracketGeo, this.trimMat);
      m.position.set(cx, 0.085, cz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.trimMeshes.push(m);
      this.scene.add(m);
    }

    // 64 beveled individual square tiles + dedicated layer-1 invisible hitboxes
    const tileGeo = new THREE.BoxGeometry(0.975, 0.04, 0.975);
    const hitboxGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

    for (let rank = 1; rank <= 8; rank++) {
      for (let f = 0; f < 8; f++) {
        const sq = `${FILES[f]}${rank}` as Square;
        const isLight = (f + rank) % 2 === 1;
        const pos = squareToWorld(sq, new THREE.Vector3());

        const tile = new THREE.Mesh(tileGeo, isLight ? this.lightSqMat : this.darkSqMat);
        tile.position.set(pos.x, BOARD_TOP_Y - 0.02, pos.z);
        tile.receiveShadow = true;
        if (isLight) this.lightSquareMeshes.push(tile);
        else this.darkSquareMeshes.push(tile);
        this.scene.add(tile);

        const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
        hitbox.rotation.x = -Math.PI / 2;
        hitbox.position.set(pos.x, BOARD_TOP_Y + 0.005, pos.z);
        hitbox.layers.set(1);
        hitbox.userData.square = sq;
        this.squareHitboxes.push(hitbox);
        this.scene.add(hitbox);
      }
    }

    this.raycaster.layers.set(1);
  }

  private buildIndicators(): void {
    const ringGeo = new THREE.RingGeometry(0.36, 0.44, 32);
    ringGeo.rotateX(-Math.PI / 2);

    this.hoverRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.hoverRing.position.y = BOARD_TOP_Y + 0.008;
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    this.selectedRing = new THREE.Mesh(
      new THREE.RingGeometry(0.33, 0.45, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe5b963, transparent: true, opacity: 0.9, depthWrite: false })
    );
    this.selectedRing.position.y = BOARD_TOP_Y + 0.011;
    this.selectedRing.visible = false;
    this.scene.add(this.selectedRing);

    const sqHighlightGeo = new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2);
    const lastMoveMat = new THREE.MeshBasicMaterial({
      color: 0xe5b963,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.lastFromHighlight = new THREE.Mesh(sqHighlightGeo, lastMoveMat);
    this.lastFromHighlight.position.y = BOARD_TOP_Y + 0.004;
    this.lastFromHighlight.visible = false;
    this.scene.add(this.lastFromHighlight);

    this.lastToHighlight = new THREE.Mesh(sqHighlightGeo, lastMoveMat);
    this.lastToHighlight.position.y = BOARD_TOP_Y + 0.004;
    this.lastToHighlight.visible = false;
    this.scene.add(this.lastToHighlight);

    this.checkRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.47, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.92, depthWrite: false })
    );
    this.checkRing.position.y = BOARD_TOP_Y + 0.012;
    this.checkRing.visible = false;
    this.scene.add(this.checkRing);
  }

  private clearActiveTextures(): void {
    for (const tex of this.activeTextures) {
      tex.dispose();
    }
    this.activeTextures = [];
  }

  private applyPieceFinish(
    bodyMat: THREE.MeshPhysicalMaterial,
    accentMat: THREE.MeshStandardMaterial,
    spec: PieceFinishSpec,
    seed: number,
    maxAniso: number
  ): void {
    bodyMat.color.set(spec.color);
    bodyMat.roughness = spec.roughness;
    bodyMat.metalness = spec.metalness;
    bodyMat.clearcoat = spec.clearcoat ?? 0;
    bodyMat.clearcoatRoughness = spec.clearcoatRoughness ?? 0.2;
    bodyMat.anisotropy = spec.anisotropy ?? 0;

    if (spec.textureKind === 'crystal') {
      bodyMat.transmission = this.isSoftwareGl ? 0 : (spec.transmission ?? 0.85);
      bodyMat.transparent = this.isSoftwareGl;
      bodyMat.opacity = this.isSoftwareGl ? (spec.opacityFallback ?? 0.52) : 1.0;
      bodyMat.ior = spec.ior ?? 1.55;
      bodyMat.thickness = spec.thickness ?? 1.0;
      bodyMat.attenuationColor.set(spec.attenuationColor ?? '#ffffff');
      bodyMat.attenuationDistance = 1.2;
      bodyMat.map = null;
    } else {
      bodyMat.transmission = 0;
      bodyMat.transparent = false;
      bodyMat.opacity = 1.0;
      if (spec.textureKind === 'wood') {
        const tex = createWoodGrainTexture(spec.color, spec.grainColor ?? spec.color, seed, maxAniso);
        this.activeTextures.push(tex);
        bodyMat.map = tex;
      } else if (spec.textureKind === 'marble') {
        const tex = createMarbleTexture(spec.color, spec.grainColor ?? '#888', spec.accentColor, seed, maxAniso);
        this.activeTextures.push(tex);
        bodyMat.map = tex;
      } else if (spec.textureKind === 'metal') {
        const tex = createBrushedMetalTexture(spec.color, spec.grainColor ?? spec.color, seed, maxAniso);
        this.activeTextures.push(tex);
        bodyMat.map = tex;
      } else {
        bodyMat.map = null;
      }
    }
    bodyMat.needsUpdate = true;

    accentMat.color.set(spec.accentColor);
    accentMat.roughness = spec.accentRoughness;
    accentMat.metalness = spec.accentMetalness;
    accentMat.needsUpdate = true;
  }

  private applySquareFinish(
    mat: THREE.MeshPhysicalMaterial,
    spec: SquareFinishSpec,
    seed: number,
    maxAniso: number
  ): void {
    mat.color.set(spec.color);
    mat.roughness = spec.roughness;
    mat.metalness = spec.metalness;
    mat.clearcoat = spec.clearcoat ?? 0;
    if (spec.textureKind === 'wood') {
      const tex = createWoodGrainTexture(spec.color, spec.grainColor, seed, maxAniso);
      this.activeTextures.push(tex);
      mat.map = tex;
    } else if (spec.textureKind === 'marble') {
      const tex = createMarbleTexture(spec.color, spec.grainColor, '#ffffff', seed, maxAniso);
      this.activeTextures.push(tex);
      mat.map = tex;
    } else if (spec.textureKind === 'metal') {
      const tex = createBrushedMetalTexture(spec.color, spec.grainColor, seed, maxAniso);
      this.activeTextures.push(tex);
      mat.map = tex;
    } else {
      mat.map = null;
    }
    mat.needsUpdate = true;
  }

  public applySkin(skinId: SkinId): void {
    this.activeSkinId = skinId;
    const skin: ChessSkin = CHESS_SKINS[skinId] ?? CHESS_SKINS.staunton;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    this.clearActiveTextures();

    this.scene.background = new THREE.Color(skin.bgHex);
    this.scene.fog = new THREE.FogExp2(skin.fogHex, 0.028);

    this.keyLight.color.set(skin.keyLightColor);
    this.hemiLight.color.set(skin.hemiSkyColor);
    this.hemiLight.groundColor.set(skin.hemiGroundColor);

    this.tableMat.color.set(skin.tableColor);
    this.plinthMat.color.set(skin.plinthColor);
    this.trimMat.color.set(skin.trimColor);
    this.feltMat.color.set(skin.whitePiece.feltColor);

    const coordTex = createBoardCoordTexture(skin.coordBgColor, skin.coordTextColor, skin.trimColor, maxAniso);
    this.activeTextures.push(coordTex);
    this.coordMat.map = coordTex;
    this.coordMat.needsUpdate = true;

    this.applySquareFinish(this.lightSqMat, skin.lightSquare, 101, maxAniso);
    this.applySquareFinish(this.darkSqMat, skin.darkSquare, 202, maxAniso);

    this.applyPieceFinish(this.whiteBodyMat, this.whiteAccentMat, skin.whitePiece, 303, maxAniso);
    this.applyPieceFinish(this.blackBodyMat, this.blackAccentMat, skin.blackPiece, 404, maxAniso);

    (this.selectedRing.material as THREE.MeshBasicMaterial).color.set(skin.highlightColor);
    (this.lastFromHighlight.material as THREE.MeshBasicMaterial).color.set(skin.highlightColor);
    (this.lastToHighlight.material as THREE.MeshBasicMaterial).color.set(skin.highlightColor);
  }

  private createPieceEntity(color: PlayerColor, type: PieceTypeKey, square: Square): PieceEntity {
    const group = new THREE.Group();
    const parts = getPiecePartSpecs(type);
    const bodyMat = color === 'w' ? this.whiteBodyMat : this.blackBodyMat;
    const accentMat = color === 'w' ? this.whiteAccentMat : this.blackAccentMat;

    for (const p of parts) {
      const mat = p.role === 'body' ? bodyMat : p.role === 'accent' ? accentMat : this.feltMat;
      const mesh = new THREE.Mesh(p.geometry, mat);
      if (p.position) mesh.position.set(p.position[0], p.position[1], p.position[2]);
      if (p.rotation) mesh.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Black pieces face +Z (toward White); White knights/pieces face -Z (toward Black)
    if (color === 'b') {
      group.rotation.y = Math.PI;
    }

    const pos = squareToWorld(square, new THREE.Vector3());
    group.position.copy(pos);
    this.piecesGroup.add(group);

    const entity: PieceEntity = {
      id: `piece_${this.nextPieceUid++}`,
      color,
      type,
      square,
      group,
      targetPos: pos.clone(),
      startPos: pos.clone(),
      animTime: 0,
      animDuration: 0.34,
      isAnimating: false,
      hoverLift: 0,
    };
    this.allPieces.push(entity);
    return entity;
  }

  private spawnCaptureBurst(worldPos: THREE.Vector3): void {
    const count = this.isSoftwareGl ? 6 : 14;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.particleMat);
      mesh.position.set(worldPos.x, worldPos.y + 0.35, worldPos.z);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.1 + Math.random() * 1.6;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        1.8 + Math.random() * 1.8,
        Math.sin(angle) * speed
      );
      this.particlesGroup.add(mesh);
      this.particles.push({ mesh, vel, life: 0, maxLife: 0.45 + Math.random() * 0.25 });
    }
  }

  private layoutCapturedPieces(): void {
    // White's captured pieces sit neatly on the left flank (-X), Black's on the right (+X)
    const placeTray = (list: PieceEntity[], sideSign: number) => {
      list.forEach((p, idx) => {
        const col = Math.floor(idx / 8);
        const row = idx % 8;
        const x = sideSign * (5.45 + col * 0.72);
        const z = (row - 3.5) * 0.88 * (sideSign < 0 ? 1 : -1);
        p.startPos.copy(p.group.position);
        p.targetPos.set(x, -0.415, z); // sit on studio table beside board
        p.animTime = 0;
        p.animDuration = 0.42;
        p.isAnimating = true;
        p.group.scale.setScalar(0.84);
      });
    };
    placeTray(this.capturedWhite, -1);
    placeTray(this.capturedBlack, 1);
  }

  public syncFen(
    fen: string,
    lastMove: { from: string; to: string } | null,
    inCheck: boolean,
    animate = true
  ): void {
    const chess = new Chess(fen);
    const board = chess.board(); // 8x8 from rank 8 down to rank 1

    const desiredBySquare = new Map<Square, { color: PlayerColor; type: PieceTypeKey }>();
    let kingInCheckSquare: Square | null = null;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        const sq = `${FILES[c]}${8 - r}` as Square;
        desiredBySquare.set(sq, { color: cell.color, type: cell.type as PieceTypeKey });
        if (inCheck && cell.type === 'k' && cell.color === chess.turn()) {
          kingInCheckSquare = sq;
        }
      }
    }

    // Check if full reset is needed (e.g. starting position or rematch)
    const totalActivePieces = this.piecesBySquare.size + this.capturedWhite.length + this.capturedBlack.length;
    if (!animate || totalActivePieces === 0 || chess.history().length === 0 && desiredBySquare.size === 32 && this.capturedWhite.length + this.capturedBlack.length > 0) {
      // Rebuild cleanly
      for (const p of this.allPieces) {
        this.piecesGroup.remove(p.group);
      }
      this.allPieces = [];
      this.piecesBySquare.clear();
      this.capturedWhite = [];
      this.capturedBlack = [];

      for (const [sq, spec] of desiredBySquare.entries()) {
        const entity = this.createPieceEntity(spec.color, spec.type, sq);
        this.piecesBySquare.set(sq, entity);
      }
    } else {
      // Reconcile differences smoothly
      // 1. Find squares whose piece disappeared or changed
      const missingSquares: Square[] = [];
      const matchingExisting = new Set<Square>();

      for (const [sq, entity] of this.piecesBySquare.entries()) {
        const want = desiredBySquare.get(sq);
        if (want && want.color === entity.color && want.type === entity.type) {
          matchingExisting.add(sq);
        } else {
          missingSquares.push(sq);
        }
      }

      // Squares that need a piece placed onto them
      const neededSquares: Array<{ sq: Square; color: PlayerColor; type: PieceTypeKey }> = [];
      for (const [sq, want] of desiredBySquare.entries()) {
        if (!matchingExisting.has(sq)) {
          neededSquares.push({ sq, ...want });
        }
      }

      // First: capture any opponent piece sitting on `lastMove.to` or any removed pieces not reused
      const displacedEntities: PieceEntity[] = [];
      for (const sq of missingSquares) {
        const ent = this.piecesBySquare.get(sq)!;
        this.piecesBySquare.delete(sq);
        displacedEntities.push(ent);
      }

      // Match displaced entities to neededSquares (prioritize lastMove.from -> lastMove.to)
      const remainingNeeded: typeof neededSquares = [];
      for (const need of neededSquares) {
        let matchedIdx = -1;
        if (lastMove && need.sq === lastMove.to) {
          matchedIdx = displacedEntities.findIndex(
            (e) => e.square === lastMove.from && e.color === need.color
          );
        }
        if (matchedIdx === -1) {
          matchedIdx = displacedEntities.findIndex(
            (e) => e.color === need.color && e.type === need.type
          );
        }
        if (matchedIdx === -1) {
          // Promotion case (pawn moved to back rank)
          matchedIdx = displacedEntities.findIndex((e) => e.color === need.color);
        }

        if (matchedIdx !== -1) {
          const mover = displacedEntities.splice(matchedIdx, 1)[0];
          // If type changed (promotion), rebuild mesh parts cleanly
          if (mover.type !== need.type) {
            this.piecesGroup.remove(mover.group);
            const idxAll = this.allPieces.indexOf(mover);
            if (idxAll !== -1) this.allPieces.splice(idxAll, 1);
            const promoted = this.createPieceEntity(need.color, need.type, need.sq);
            if (lastMove) {
              squareToWorld(lastMove.from as Square, promoted.startPos);
              promoted.group.position.copy(promoted.startPos);
              promoted.isAnimating = true;
              promoted.animTime = 0;
            }
            this.piecesBySquare.set(need.sq, promoted);
          } else {
            mover.square = need.sq;
            mover.startPos.copy(mover.group.position);
            squareToWorld(need.sq, mover.targetPos);
            mover.animTime = 0;
            mover.animDuration = 0.34;
            mover.isAnimating = true;
            this.piecesBySquare.set(need.sq, mover);
          }
        } else {
          remainingNeeded.push(need);
        }
      }

      // Any leftover displaced entities were captured!
      for (const cap of displacedEntities) {
        cap.square = null;
        this.spawnCaptureBurst(cap.group.position);
        if (cap.color === 'w') this.capturedWhite.push(cap);
        else this.capturedBlack.push(cap);
      }
      if (displacedEntities.length > 0) {
        this.layoutCapturedPieces();
      }

      for (const need of remainingNeeded) {
        const created = this.createPieceEntity(need.color, need.type, need.sq);
        this.piecesBySquare.set(need.sq, created);
      }
    }

    // Update last move square highlights
    if (lastMove) {
      squareToWorld(lastMove.from as Square, _vec3A);
      this.lastFromHighlight.position.set(_vec3A.x, BOARD_TOP_Y + 0.004, _vec3A.z);
      this.lastFromHighlight.visible = true;

      squareToWorld(lastMove.to as Square, _vec3B);
      this.lastToHighlight.position.set(_vec3B.x, BOARD_TOP_Y + 0.004, _vec3B.z);
      this.lastToHighlight.visible = true;
    } else {
      this.lastFromHighlight.visible = false;
      this.lastToHighlight.visible = false;
    }

    // Check indicator
    if (kingInCheckSquare) {
      squareToWorld(kingInCheckSquare, _vec3A);
      this.checkRing.position.set(_vec3A.x, BOARD_TOP_Y + 0.012, _vec3A.z);
      this.checkRing.visible = true;
    } else {
      this.checkRing.visible = false;
    }
  }

  public setSelectionAndHints(selected: Square | null, legalTargets: Array<{ to: Square; isCapture: boolean }>): void {
    this.selectedSquare = selected;

    if (selected) {
      squareToWorld(selected, _vec3A);
      this.selectedRing.position.set(_vec3A.x, BOARD_TOP_Y + 0.011, _vec3A.z);
      this.selectedRing.visible = true;
    } else {
      this.selectedRing.visible = false;
    }

    // Clear previous legal move markers
    while (this.legalMoveMarkers.children.length > 0) {
      const child = this.legalMoveMarkers.children[0] as THREE.Mesh;
      this.legalMoveMarkers.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    const highlightHex = CHESS_SKINS[this.activeSkinId]?.highlightColor ?? '#e5b963';
    for (const target of legalTargets) {
      squareToWorld(target.to, _vec3A);
      if (target.isCapture) {
        const geo = new THREE.RingGeometry(0.32, 0.43, 28).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xef5350,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(_vec3A.x, BOARD_TOP_Y + 0.012, _vec3A.z);
        this.legalMoveMarkers.add(mesh);
      } else {
        const geo = new THREE.CircleGeometry(0.145, 24).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
          color: highlightHex,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(_vec3A.x, BOARD_TOP_Y + 0.012, _vec3A.z);
        this.legalMoveMarkers.add(mesh);
      }
    }
  }

  public setOrientation(color: PlayerColor, moveCamera = true): void {
    this.orientation = color;
    if (moveCamera) {
      this.setCameraPreset('player');
    }
  }

  public setShowcaseMode(enabled: boolean): void {
    this.showcaseMode = enabled;
    if (!enabled) {
      this.setCameraPreset('player');
    } else {
      this.cameraPosGoal = new THREE.Vector3(6.8, 6.2, 8.6);
      this.cameraTargetGoal = new THREE.Vector3(0, 0.4, 0);
    }
  }

  public setCameraPreset(preset: CameraPreset): void {
    const sign = this.orientation === 'w' ? 1 : -1;
    if (preset === 'player') {
      this.cameraPosGoal = new THREE.Vector3(0, 8.2, 8.8 * sign);
      this.cameraTargetGoal = new THREE.Vector3(0, 0.2, 0);
    } else if (preset === 'top') {
      this.cameraPosGoal = new THREE.Vector3(0, 12.2, 0.65 * sign);
      this.cameraTargetGoal = new THREE.Vector3(0, 0.15, 0);
    } else {
      this.cameraPosGoal = new THREE.Vector3(6.8 * sign, 6.4, 7.2 * sign);
      this.cameraTargetGoal = new THREE.Vector3(0, 0.35, 0);
    }
  }

  public flipCameraView(): void {
    this.orientation = this.orientation === 'w' ? 'b' : 'w';
    this.setCameraPreset('player');
  }

  private updatePointerFromEvent(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.showcaseMode) return;
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 36) return; // Ignore orbit drag releases

    this.updatePointerFromEvent(e.clientX, e.clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.squareHitboxes, false);
    if (hits.length > 0) {
      const sq = hits[0].object.userData.square as Square | undefined;
      if (sq) {
        this.callbacks.onSquareClick(sq);
      }
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.showcaseMode) {
      this.hoverRing.visible = false;
      this.hoveredSquare = null;
      return;
    }
    const now = performance.now();
    if (now - this.lastHoverCheck < 45) return;
    this.lastHoverCheck = now;

    this.updatePointerFromEvent(e.clientX, e.clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.squareHitboxes, false);
    if (hits.length > 0) {
      const sq = hits[0].object.userData.square as Square | undefined;
      if (sq) {
        this.hoveredSquare = sq;
        squareToWorld(sq, _vec3A);
        this.hoverRing.position.set(_vec3A.x, BOARD_TOP_Y + 0.008, _vec3A.z);
        this.hoverRing.visible = true;
        this.renderer.domElement.style.cursor = this.piecesBySquare.has(sq) || this.selectedSquare ? 'pointer' : 'grab';
        return;
      }
    }
    this.hoveredSquare = null;
    this.hoverRing.visible = false;
    this.renderer.domElement.style.cursor = 'grab';
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private handleContextRestored = (): void => {
    this.callbacks.onContextRestored?.();
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('webglcontextlost', this.handleContextLost);
    dom.addEventListener('webglcontextrestored', this.handleContextRestored);
    window.addEventListener('resize', this.handleResize);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    // Showcase idle orbit when on Title Screen
    if (this.showcaseMode && !this.cameraPosGoal) {
      const t = this.clock.getElapsedTime() * 0.14;
      this.camera.position.x = Math.sin(t) * 9.8;
      this.camera.position.z = Math.cos(t) * 9.8;
      this.camera.position.y = 6.2 + Math.sin(t * 0.7) * 0.6;
      this.controls.target.set(0, 0.4, 0);
    }

    // Damped camera preset transitions
    if (this.cameraPosGoal && this.cameraTargetGoal) {
      const lambda = 7.0;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.cameraPosGoal.x, lambda, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.cameraPosGoal.y, lambda, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.cameraPosGoal.z, lambda, dt);
      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.cameraTargetGoal.x, lambda, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.cameraTargetGoal.y, lambda, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.cameraTargetGoal.z, lambda, dt);

      if (this.camera.position.distanceTo(this.cameraPosGoal) < 0.04) {
        this.camera.position.copy(this.cameraPosGoal);
        this.controls.target.copy(this.cameraTargetGoal);
        this.cameraPosGoal = null;
        this.cameraTargetGoal = null;
      }
    }

    // Piece parabolic lift-glide animations & selection lift
    for (const p of this.allPieces) {
      if (p.isAnimating) {
        p.animTime += dt;
        const progress = Math.min(1, p.animTime / p.animDuration);
        // Smooth ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        p.group.position.lerpVectors(p.startPos, p.targetPos, ease);
        // Arc height
        const arc = Math.sin(progress * Math.PI) * 0.65;
        p.group.position.y += arc;
        if (progress >= 1) {
          p.group.position.copy(p.targetPos);
          p.isAnimating = false;
        }
      } else if (p.square !== null) {
        const wantLift =
          p.square === this.selectedSquare
            ? 0.22
            : p.square === this.hoveredSquare && !this.showcaseMode
              ? 0.05
              : 0;
        p.hoverLift = THREE.MathUtils.damp(p.hoverLift, wantLift, 14, dt);
        p.group.position.y = BOARD_TOP_Y + p.hoverLift;
      }
    }

    // Update capture particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        this.particlesGroup.remove(pt.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      pt.vel.y -= 8.5 * dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      const scale = Math.max(0.01, 1 - pt.life / pt.maxLife);
      pt.mesh.scale.setScalar(scale);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('pointermove', this.handlePointerMove);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    dom.removeEventListener('webglcontextrestored', this.handleContextRestored);
    window.removeEventListener('resize', this.handleResize);

    this.clearActiveTextures();
    this.controls.dispose();
    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
