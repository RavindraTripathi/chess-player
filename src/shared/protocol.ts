export type TimeControlId = '3+2' | '5+0' | '10+0' | 'unlimited';

export interface TimeControlSpec {
  id: TimeControlId;
  label: string;
  initialMs: number;
  incrementMs: number;
  category: string;
}

export const TIME_CONTROLS: Record<TimeControlId, TimeControlSpec> = {
  '3+2': {
    id: '3+2',
    label: '3+2 Blitz',
    initialMs: 3 * 60 * 1000,
    incrementMs: 2 * 1000,
    category: 'Blitz',
  },
  '5+0': {
    id: '5+0',
    label: '5+0 Blitz',
    initialMs: 5 * 60 * 1000,
    incrementMs: 0,
    category: 'Blitz',
  },
  '10+0': {
    id: '10+0',
    label: '10+0 Rapid',
    initialMs: 10 * 60 * 1000,
    incrementMs: 0,
    category: 'Rapid',
  },
  unlimited: {
    id: 'unlimited',
    label: 'Untimed',
    initialMs: 0,
    incrementMs: 0,
    category: 'Casual',
  },
};

export type SkinId = 'staunton' | 'carrara' | 'imperial' | 'crystal' | 'obsidian';

export type PlayerColor = 'w' | 'b';

export type GameStatus =
  | 'waiting'
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'timeout'
  | 'abandoned';

export interface MoveRecord {
  ply: number;
  san: string;
  from: string;
  to: string;
  color: PlayerColor;
  piece: string;
  captured?: string;
  promotion?: string;
  fen: string;
}

export interface PlayerSlot {
  id: string;
  name: string;
  connected: boolean;
  skinId: SkinId;
}

export interface GameRoomState {
  roomId: string;
  code: string;
  isPrivate: boolean;
  timeControl: TimeControlId;
  fen: string;
  turn: PlayerColor;
  status: GameStatus;
  winner: PlayerColor | 'draw' | null;
  endReason: string | null;
  white: PlayerSlot | null;
  black: PlayerSlot | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number | null;
  lastMove: { from: string; to: string } | null;
  inCheck: boolean;
  moves: MoveRecord[];
  drawOfferFrom: PlayerColor | null;
  rematchVotes: PlayerColor[];
}

export interface ChatMessage {
  id: string;
  channel: 'lobby' | 'match';
  roomId?: string;
  senderId: string;
  senderName: string;
  senderColor?: PlayerColor | 'spectator';
  text: string;
  timestamp: number;
}

export interface LobbyPresence {
  onlineCount: number;
  queuedByControl: Record<TimeControlId, number>;
  activeGamesCount: number;
}

export type ClientToServerMessage =
  | { type: 'auth:hello'; playerId: string; name: string; skinId: SkinId }
  | { type: 'profile:update'; name?: string; skinId?: SkinId }
  | { type: 'matchmaking:join'; timeControl: TimeControlId }
  | { type: 'matchmaking:leave' }
  | { type: 'room:create'; timeControl: TimeControlId; preferredColor?: PlayerColor | 'random' }
  | { type: 'room:join'; code: string }
  | { type: 'room:leave'; roomId: string }
  | { type: 'game:move'; roomId: string; from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }
  | { type: 'game:resign'; roomId: string }
  | { type: 'game:draw_offer'; roomId: string }
  | { type: 'game:draw_respond'; roomId: string; accept: boolean }
  | { type: 'game:rematch'; roomId: string }
  | { type: 'chat:send'; channel: 'lobby' | 'match'; roomId?: string; text: string };

export type ServerToClientMessage =
  | {
      type: 'session:welcome';
      playerId: string;
      name: string;
      lobby: LobbyPresence;
      lobbyChat: ChatMessage[];
      activeRoom: GameRoomState | null;
      yourColor: PlayerColor | 'spectator' | null;
    }
  | { type: 'lobby:presence'; lobby: LobbyPresence }
  | { type: 'matchmaking:queued'; timeControl: TimeControlId }
  | { type: 'matchmaking:cancelled' }
  | { type: 'room:joined'; room: GameRoomState; yourColor: PlayerColor | 'spectator'; chat: ChatMessage[] }
  | { type: 'room:state'; room: GameRoomState }
  | { type: 'room:left' }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'error:notice'; message: string };
