import type { SkinId } from '../shared/protocol';

export interface PieceFinishSpec {
  color: string;
  grainColor?: string;
  textureKind: 'wood' | 'marble' | 'metal' | 'crystal' | 'ceramic';
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  anisotropy?: number;
  transmission?: number;
  ior?: number;
  thickness?: number;
  attenuationColor?: string;
  opacityFallback?: number;
  accentColor: string;
  accentRoughness: number;
  accentMetalness: number;
  feltColor: string;
}

export interface SquareFinishSpec {
  color: string;
  grainColor: string;
  textureKind: 'wood' | 'marble' | 'metal' | 'ceramic';
  roughness: number;
  metalness: number;
  clearcoat?: number;
}

export interface ChessSkin {
  id: SkinId;
  name: string;
  subtitle: string;
  swatchWhite: string;
  swatchBlack: string;
  swatchAccent: string;
  bgHex: string;
  fogHex: string;
  tableColor: string;
  plinthColor: string;
  trimColor: string;
  coordBgColor: string;
  coordTextColor: string;
  lightSquare: SquareFinishSpec;
  darkSquare: SquareFinishSpec;
  whitePiece: PieceFinishSpec;
  blackPiece: PieceFinishSpec;
  keyLightColor: string;
  hemiSkyColor: string;
  hemiGroundColor: string;
  highlightColor: string;
}

export const CHESS_SKINS: Record<SkinId, ChessSkin> = {
  staunton: {
    id: 'staunton',
    name: 'Royal Staunton',
    subtitle: 'Boxwood & Hand-Rubbed Walnut',
    swatchWhite: '#e6d3ad',
    swatchBlack: '#3d281c',
    swatchAccent: '#c8a25a',
    bgHex: '#0d0f13',
    fogHex: '#0d0f13',
    tableColor: '#14171d',
    plinthColor: '#241811',
    trimColor: '#c8a25a',
    coordBgColor: '#2d1e15',
    coordTextColor: '#d9be8b',
    lightSquare: {
      color: '#dfc9a2',
      grainColor: '#bfa276',
      textureKind: 'wood',
      roughness: 0.42,
      metalness: 0.04,
      clearcoat: 0.25,
    },
    darkSquare: {
      color: '#4b3123',
      grainColor: '#28180f',
      textureKind: 'wood',
      roughness: 0.46,
      metalness: 0.04,
      clearcoat: 0.25,
    },
    whitePiece: {
      color: '#ecdab5',
      grainColor: '#cfb583',
      textureKind: 'wood',
      roughness: 0.34,
      metalness: 0.02,
      clearcoat: 0.35,
      accentColor: '#d4af66',
      accentRoughness: 0.22,
      accentMetalness: 0.88,
      feltColor: '#1d4d3a',
    },
    blackPiece: {
      color: '#342218',
      grainColor: '#180e08',
      textureKind: 'wood',
      roughness: 0.36,
      metalness: 0.04,
      clearcoat: 0.35,
      accentColor: '#c8a25a',
      accentRoughness: 0.22,
      accentMetalness: 0.88,
      feltColor: '#1d4d3a',
    },
    keyLightColor: '#fff2dc',
    hemiSkyColor: '#bfd4f2',
    hemiGroundColor: '#2b2018',
    highlightColor: '#e5b963',
  },

  carrara: {
    id: 'carrara',
    name: 'Carrara & Nero',
    subtitle: 'Polished Italian Marble',
    swatchWhite: '#f1f0ec',
    swatchBlack: '#1c1e22',
    swatchAccent: '#d6bc8b',
    bgHex: '#0d1016',
    fogHex: '#0d1016',
    tableColor: '#13171f',
    plinthColor: '#1a1d24',
    trimColor: '#d6bc8b',
    coordBgColor: '#1f232c',
    coordTextColor: '#dcd5c6',
    lightSquare: {
      color: '#ecebe6',
      grainColor: '#9da3ad',
      textureKind: 'marble',
      roughness: 0.16,
      metalness: 0.02,
      clearcoat: 0.85,
    },
    darkSquare: {
      color: '#202329',
      grainColor: '#5c626d',
      textureKind: 'marble',
      roughness: 0.18,
      metalness: 0.04,
      clearcoat: 0.85,
    },
    whitePiece: {
      color: '#f3f2ed',
      grainColor: '#a6acb5',
      textureKind: 'marble',
      roughness: 0.15,
      metalness: 0.02,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      accentColor: '#d6bc8b',
      accentRoughness: 0.2,
      accentMetalness: 0.9,
      feltColor: '#232832',
    },
    blackPiece: {
      color: '#1b1d22',
      grainColor: '#59606b',
      textureKind: 'marble',
      roughness: 0.17,
      metalness: 0.04,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      accentColor: '#d6bc8b',
      accentRoughness: 0.2,
      accentMetalness: 0.9,
      feltColor: '#232832',
    },
    keyLightColor: '#fff9f0',
    hemiSkyColor: '#cde0ff',
    hemiGroundColor: '#1d222b',
    highlightColor: '#e6c687',
  },

  imperial: {
    id: 'imperial',
    name: 'Imperial Brass',
    subtitle: 'Anisotropic Gold & Smoked Bronze',
    swatchWhite: '#d8b268',
    swatchBlack: '#4a3d35',
    swatchAccent: '#f0d28c',
    bgHex: '#0a0b0e',
    fogHex: '#0a0b0e',
    tableColor: '#121318',
    plinthColor: '#191a20',
    trimColor: '#cfa558',
    coordBgColor: '#181a20',
    coordTextColor: '#d9b56e',
    lightSquare: {
      color: '#bfc4cc',
      grainColor: '#989fa8',
      textureKind: 'metal',
      roughness: 0.32,
      metalness: 0.72,
      clearcoat: 0.2,
    },
    darkSquare: {
      color: '#252830',
      grainColor: '#17191f',
      textureKind: 'metal',
      roughness: 0.38,
      metalness: 0.68,
      clearcoat: 0.2,
    },
    whitePiece: {
      color: '#e0ba6c',
      grainColor: '#b89143',
      textureKind: 'metal',
      roughness: 0.2,
      metalness: 0.94,
      anisotropy: 0.85,
      accentColor: '#f5dfb0',
      accentRoughness: 0.45,
      accentMetalness: 0.35,
      feltColor: '#181a1f',
    },
    blackPiece: {
      color: '#4e423a',
      grainColor: '#2b231e',
      textureKind: 'metal',
      roughness: 0.24,
      metalness: 0.9,
      anisotropy: 0.8,
      accentColor: '#cfa558',
      accentRoughness: 0.48,
      accentMetalness: 0.35,
      feltColor: '#181a1f',
    },
    keyLightColor: '#ffefd4',
    hemiSkyColor: '#adc8f5',
    hemiGroundColor: '#1e1b18',
    highlightColor: '#f2c86b',
  },

  crystal: {
    id: 'crystal',
    name: 'Arctic Crystal',
    subtitle: 'Optical Quartz & Cobalt Sapphire',
    swatchWhite: '#dcecf7',
    swatchBlack: '#2b5599',
    swatchAccent: '#90c7f5',
    bgHex: '#090e17',
    fogHex: '#090e17',
    tableColor: '#0e1522',
    plinthColor: '#141d2e',
    trimColor: '#a6b8cf',
    coordBgColor: '#162033',
    coordTextColor: '#bdd1eb',
    lightSquare: {
      color: '#d4dfec',
      grainColor: '#b0c2d6',
      textureKind: 'marble',
      roughness: 0.2,
      metalness: 0.08,
      clearcoat: 0.85,
    },
    darkSquare: {
      color: '#20324d',
      grainColor: '#132033',
      textureKind: 'marble',
      roughness: 0.22,
      metalness: 0.14,
      clearcoat: 0.85,
    },
    whitePiece: {
      color: '#e8f4fc',
      textureKind: 'crystal',
      roughness: 0.06,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transmission: 0.88,
      ior: 1.54,
      thickness: 0.9,
      attenuationColor: '#d9efff',
      opacityFallback: 0.46,
      accentColor: '#d8e3f0',
      accentRoughness: 0.18,
      accentMetalness: 0.92,
      feltColor: '#162438',
    },
    blackPiece: {
      color: '#2a62b8',
      textureKind: 'crystal',
      roughness: 0.08,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transmission: 0.84,
      ior: 1.58,
      thickness: 1.1,
      attenuationColor: '#1b4794',
      opacityFallback: 0.58,
      accentColor: '#9ec0e6',
      accentRoughness: 0.18,
      accentMetalness: 0.92,
      feltColor: '#162438',
    },
    keyLightColor: '#f2f7ff',
    hemiSkyColor: '#99c4ff',
    hemiGroundColor: '#101a2b',
    highlightColor: '#6bb6ff',
  },

  obsidian: {
    id: 'obsidian',
    name: 'Basalt & Amber',
    subtitle: 'Matte Ceramic & Burnished Copper',
    swatchWhite: '#dfd9ce',
    swatchBlack: '#222428',
    swatchAccent: '#d97b3e',
    bgHex: '#0b0c0e',
    fogHex: '#0b0c0e',
    tableColor: '#111317',
    plinthColor: '#17191d',
    trimColor: '#c9743c',
    coordBgColor: '#191b20',
    coordTextColor: '#d6a47e',
    lightSquare: {
      color: '#d4cec2',
      grainColor: '#bcb4a5',
      textureKind: 'ceramic',
      roughness: 0.62,
      metalness: 0.02,
      clearcoat: 0.1,
    },
    darkSquare: {
      color: '#25282e',
      grainColor: '#1a1c21',
      textureKind: 'ceramic',
      roughness: 0.68,
      metalness: 0.04,
      clearcoat: 0.1,
    },
    whitePiece: {
      color: '#e3ddd0',
      textureKind: 'ceramic',
      roughness: 0.52,
      metalness: 0.02,
      accentColor: '#d97b3e',
      accentRoughness: 0.22,
      accentMetalness: 0.9,
      feltColor: '#191b1f',
    },
    blackPiece: {
      color: '#24272c',
      textureKind: 'ceramic',
      roughness: 0.55,
      metalness: 0.05,
      accentColor: '#d97b3e',
      accentRoughness: 0.22,
      accentMetalness: 0.9,
      feltColor: '#191b1f',
    },
    keyLightColor: '#ffeede',
    hemiSkyColor: '#b3c6e0',
    hemiGroundColor: '#1f1916',
    highlightColor: '#e68c4c',
  },
};

export const SKIN_LIST: ChessSkin[] = Object.values(CHESS_SKINS);
