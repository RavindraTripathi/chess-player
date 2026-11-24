import * as THREE from 'three';

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createWoodGrainTexture(
  baseHex: string,
  grainHex: string,
  seed: number,
  anisotropy: number
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(seed);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle organic wood fibers
  for (let i = 0; i < 220; i++) {
    const y = rand() * size;
    const thickness = 0.6 + rand() * 2.4;
    const alpha = 0.04 + rand() * 0.14;
    ctx.strokeStyle = grainHex;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(0, y);
    const wave = (rand() - 0.5) * 18;
    const wave2 = (rand() - 0.5) * 18;
    ctx.bezierCurveTo(size * 0.33, y + wave, size * 0.66, y + wave2, size, y + (rand() - 0.5) * 8);
    ctx.stroke();
  }

  // Fine pore speckles
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = grainHex;
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.fillRect(x, y, 2 + rand() * 6, 1);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createMarbleTexture(
  baseHex: string,
  veinHex: string,
  accentHex: string,
  seed: number,
  anisotropy: number
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(seed);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Soft cloudy mineral washes
  for (let i = 0; i < 28; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 40 + rand() * 140;
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    grad.addColorStop(0, veinHex);
    grad.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Branching veins
  for (let v = 0; v < 14; v++) {
    let x = rand() * size;
    let y = rand() * size;
    let angle = rand() * Math.PI * 2;
    ctx.strokeStyle = v % 4 === 0 ? accentHex : veinHex;
    ctx.globalAlpha = v % 4 === 0 ? 0.16 : 0.22;
    ctx.lineWidth = v % 4 === 0 ? 0.8 : 1.1 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 36; step++) {
      angle += (rand() - 0.5) * 0.65;
      x += Math.cos(angle) * 14;
      y += Math.sin(angle) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBrushedMetalTexture(
  baseHex: string,
  streakHex: string,
  seed: number,
  anisotropy: number
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(seed);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 600; i++) {
    const y = rand() * size;
    ctx.strokeStyle = streakHex;
    ctx.globalAlpha = 0.03 + rand() * 0.08;
    ctx.lineWidth = 0.5 + rand() * 1.0;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBoardCoordTexture(
  bgHex: string,
  textHex: string,
  borderHex: string,
  anisotropy: number
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle decorative inlay frame line
  const pad = 54;
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.55;
  ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);
  ctx.globalAlpha = 1;

  // Board occupies central 8/9.2 of the surround plate
  const boardSpan = size * (8 / 9.2);
  const margin = (size - boardSpan) / 2;
  const sq = boardSpan / 8;

  ctx.fillStyle = textHex;
  ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  // Bottom and top files
  for (let f = 0; f < 8; f++) {
    const x = margin + f * sq + sq / 2;
    ctx.fillText(files[f], x, size - margin / 2);
    ctx.save();
    ctx.translate(x, margin / 2);
    ctx.rotate(Math.PI);
    ctx.fillText(files[f], 0, 0);
    ctx.restore();
  }

  // Left and right ranks
  for (let r = 0; r < 8; r++) {
    const y = margin + r * sq + sq / 2;
    ctx.fillText(ranks[r], margin / 2, y);
    ctx.save();
    ctx.translate(size - margin / 2, y);
    ctx.rotate(Math.PI);
    ctx.fillText(ranks[r], 0, 0);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createRadialShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 16, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
