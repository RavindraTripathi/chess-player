import * as THREE from 'three';

export type PieceTypeKey = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';

export interface PiecePartSpec {
  geometry: THREE.BufferGeometry;
  role: 'body' | 'accent' | 'felt';
  position?: [number, number, number];
  rotation?: [number, number, number];
}

const partCache = new Map<PieceTypeKey, PiecePartSpec[]>();

function latheFromPairs(pairs: Array<[number, number]>, segments = 32): THREE.LatheGeometry {
  const pts = pairs.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  geo.computeTangents();
  return geo;
}

function createExtrudedKnightHead(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  // Equestrian profile in XY, centered around X=0
  s.moveTo(-0.18, 0.0);
  s.lineTo(0.18, 0.0);
  s.quadraticCurveTo(0.21, 0.18, 0.14, 0.36); // chest
  s.quadraticCurveTo(0.16, 0.45, 0.27, 0.46); // jaw/chin
  s.lineTo(0.32, 0.52); // muzzle tip
  s.quadraticCurveTo(0.28, 0.60, 0.13, 0.65); // bridge of nose
  s.lineTo(0.08, 0.78); // ear front
  s.lineTo(0.01, 0.72); // crown notch
  s.lineTo(-0.04, 0.79); // ear back
  s.quadraticCurveTo(-0.22, 0.62, -0.25, 0.32); // arched mane
  s.quadraticCurveTo(-0.25, 0.12, -0.18, 0.0);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 16,
  });
  geo.translate(0, 0, -0.08);
  // Rotate so muzzle points toward -Z (White faces Black along -Z)
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createExtrudedCross(): THREE.ExtrudeGeometry {
  const w = 0.036;
  const h = 0.16;
  const arm = 0.095;
  const yMid = 0.095;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, yMid - w);
  s.lineTo(arm, yMid - w);
  s.lineTo(arm, yMid + w);
  s.lineTo(w, yMid + w);
  s.lineTo(w, h);
  s.lineTo(-w, h);
  s.lineTo(-w, yMid + w);
  s.lineTo(-arm, yMid + w);
  s.lineTo(-arm, yMid - w);
  s.lineTo(-w, yMid - w);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.02);
  geo.computeVertexNormals();
  return geo;
}

function buildPieceParts(type: PieceTypeKey): PiecePartSpec[] {
  const parts: PiecePartSpec[] = [];

  // Shared bottom felt pad (sits flush at y = 0)
  const feltGeo = new THREE.CylinderGeometry(0.32, 0.33, 0.024, 32);
  feltGeo.translate(0, 0.012, 0);
  parts.push({ geometry: feltGeo, role: 'felt' });

  if (type === 'p') {
    const body = latheFromPairs([
      [0.32, 0.024],
      [0.32, 0.075],
      [0.27, 0.115],
      [0.285, 0.145],
      [0.21, 0.19],
      [0.14, 0.36],
      [0.11, 0.50],
      [0.17, 0.53],
      [0.11, 0.56],
      [0.08, 0.59],
      [0.0, 0.59],
    ]);
    parts.push({ geometry: body, role: 'body' });

    const collar = new THREE.TorusGeometry(0.145, 0.022, 12, 28);
    collar.rotateX(Math.PI / 2);
    parts.push({ geometry: collar, role: 'accent', position: [0, 0.535, 0] });

    const head = new THREE.SphereGeometry(0.145, 28, 20);
    parts.push({ geometry: head, role: 'body', position: [0, 0.70, 0] });
  } else if (type === 'r') {
    const body = latheFromPairs([
      [0.35, 0.024],
      [0.35, 0.085],
      [0.29, 0.13],
      [0.31, 0.165],
      [0.23, 0.22],
      [0.195, 0.52],
      [0.21, 0.64],
      [0.255, 0.70],
      [0.255, 0.78],
      [0.17, 0.78],
      [0.17, 0.73],
      [0.0, 0.73],
    ]);
    parts.push({ geometry: body, role: 'body' });

    const collar = new THREE.TorusGeometry(0.21, 0.024, 12, 28);
    collar.rotateX(Math.PI / 2);
    parts.push({ geometry: collar, role: 'accent', position: [0, 0.65, 0] });

    // 6 distinct battlements around the top parapet
    const merlonGeo = new THREE.BoxGeometry(0.095, 0.095, 0.075);
    const radius = 0.215;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push({
        geometry: merlonGeo,
        role: 'body',
        position: [Math.cos(a) * radius, 0.825, Math.sin(a) * radius],
        rotation: [0, -a, 0],
      });
    }
  } else if (type === 'n') {
    const pedestal = latheFromPairs([
      [0.35, 0.024],
      [0.35, 0.085],
      [0.29, 0.135],
      [0.305, 0.17],
      [0.23, 0.22],
      [0.215, 0.28],
      [0.0, 0.28],
    ]);
    parts.push({ geometry: pedestal, role: 'body' });

    const collar = new THREE.TorusGeometry(0.22, 0.024, 12, 28);
    collar.rotateX(Math.PI / 2);
    parts.push({ geometry: collar, role: 'accent', position: [0, 0.275, 0] });

    const head = createExtrudedKnightHead();
    parts.push({ geometry: head, role: 'body', position: [0, 0.265, 0] });

    // Subtle mane crest accent strip
    const maneGeo = new THREE.BoxGeometry(0.04, 0.34, 0.06);
    parts.push({
      geometry: maneGeo,
      role: 'accent',
      position: [0, 0.64, 0.20],
      rotation: [0.38, 0, 0],
    });
  } else if (type === 'b') {
    const body = latheFromPairs([
      [0.34, 0.024],
      [0.34, 0.08],
      [0.28, 0.125],
      [0.295, 0.16],
      [0.215, 0.21],
      [0.165, 0.45],
      [0.135, 0.65],
      [0.185, 0.69],
      [0.135, 0.72],
      [0.0, 0.72],
    ]);
    parts.push({ geometry: body, role: 'body' });

    const collar = new THREE.TorusGeometry(0.165, 0.023, 12, 28);
    collar.rotateX(Math.PI / 2);
    parts.push({ geometry: collar, role: 'accent', position: [0, 0.69, 0] });

    // Sculpted mitre dome
    const mitre = latheFromPairs([
      [0.13, 0.715],
      [0.175, 0.82],
      [0.155, 0.94],
      [0.085, 1.03],
      [0.02, 1.06],
      [0.0, 1.06],
    ]);
    parts.push({ geometry: mitre, role: 'body' });

    // Accent diagonal sash band across mitre
    const sash = new THREE.TorusGeometry(0.155, 0.015, 10, 28);
    sash.rotateX(Math.PI / 2 - 0.45);
    parts.push({ geometry: sash, role: 'accent', position: [0, 0.87, 0] });

    // Finial pearl orb
    const finial = new THREE.SphereGeometry(0.055, 20, 16);
    parts.push({ geometry: finial, role: 'accent', position: [0, 1.11, 0] });
  } else if (type === 'q') {
    const body = latheFromPairs([
      [0.37, 0.024],
      [0.37, 0.09],
      [0.31, 0.14],
      [0.33, 0.18],
      [0.24, 0.24],
      [0.18, 0.56],
      [0.155, 0.80],
      [0.225, 0.85],
      [0.17, 0.90],
      [0.22, 1.06],
      [0.16, 1.09],
      [0.0, 1.09],
    ]);
    parts.push({ geometry: body, role: 'body' });

    const collar = new THREE.TorusGeometry(0.20, 0.026, 12, 32);
    collar.rotateX(Math.PI / 2);
    parts.push({ geometry: collar, role: 'accent', position: [0, 0.85, 0] });

    // 8 coronet points with tiny pearl finials
    const spikeGeo = new THREE.ConeGeometry(0.032, 0.12, 8);
    const pearlGeo = new THREE.SphereGeometry(0.026, 12, 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 0.19;
      parts.push({
        geometry: spikeGeo,
        role: 'body',
        position: [Math.cos(a) * r, 1.13, Math.sin(a) * r],
      });
      parts.push({
        geometry: pearlGeo,
        role: 'accent',
        position: [Math.cos(a) * r, 1.20, Math.sin(a) * r],
      });
    }

    const dome = new THREE.SphereGeometry(0.14, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    parts.push({ geometry: dome, role: 'body', position: [0, 1.07, 0] });

    const crownOrb = new THREE.SphereGeometry(0.06, 20, 16);
    parts.push({ geometry: crownOrb, role: 'accent', position: [0, 1.25, 0] });
  } else {
    // King
    const body = latheFromPairs([
      [0.39, 0.024],
      [0.39, 0.095],
      [0.325, 0.145],
      [0.345, 0.19],
      [0.25, 0.25],
      [0.195, 0.60],
      [0.165, 0.88],
      [0.245, 0.93],
      [0.185, 0.98],
      [0.24, 1.18],
      [0.19, 1.22],
      [0.0, 1.22],
    ]);
    parts.push({ geometry: body, role: 'body' });

    const collar1 = new THREE.TorusGeometry(0.22, 0.028, 12, 32);
    collar1.rotateX(Math.PI / 2);
    parts.push({ geometry: collar1, role: 'accent', position: [0, 0.93, 0] });

    const collar2 = new THREE.TorusGeometry(0.22, 0.022, 12, 32);
    collar2.rotateX(Math.PI / 2);
    parts.push({ geometry: collar2, role: 'accent', position: [0, 1.19, 0] });

    const crownDome = new THREE.SphereGeometry(0.17, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.45);
    parts.push({ geometry: crownDome, role: 'body', position: [0, 1.18, 0] });

    const cross = createExtrudedCross();
    parts.push({ geometry: cross, role: 'accent', position: [0, 1.33, 0] });
  }

  return parts;
}

export function getPiecePartSpecs(type: PieceTypeKey): PiecePartSpec[] {
  let cached = partCache.get(type);
  if (!cached) {
    cached = buildPieceParts(type);
    partCache.set(type, cached);
  }
  return cached;
}
