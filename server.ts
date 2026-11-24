import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import {
  TIME_CONTROLS,
  type ChatMessage,
  type ClientToServerMessage,
  type GameRoomState,
  type LobbyPresence,
  type MoveRecord,
  type PlayerColor,
  type PlayerSlot,
  type ServerToClientMessage,
  type SkinId,
  type TimeControlId,
} from './src/shared/protocol.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const VALID_SKINS = new Set<SkinId>(['staunton', 'carrara', 'imperial', 'crystal', 'obsidian']);
const VALID_TIME_CONTROLS = new Set<TimeControlId>(['3+2', '5+0', '10+0', 'unlimited']);

interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  name: string;
  skinId: SkinId;
  roomId: string | null;
  queuedTimeControl: TimeControlId | null;
  chatTimestamps: number[];
}

interface InternalRoom {
  roomId: string;
  code: string;
  isPrivate: boolean;
  timeControl: TimeControlId;
  chess: Chess;
  white: PlayerSlot | null;
  black: PlayerSlot | null;
  spectators: Set<string>;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number | null;
  lastMove: { from: string; to: string } | null;
  status: GameRoomState['status'];
  winner: GameRoomState['winner'];
  endReason: string | null;
  moves: MoveRecord[];
  drawOfferFrom: PlayerColor | null;
  rematchVotes: Set<PlayerColor>;
  chat: ChatMessage[];
  createdAt: number;
}

const clients = new Map<WebSocket, ConnectedClient>();
const playerSockets = new Map<string, WebSocket>();
const rooms = new Map<string, InternalRoom>();
const roomByCode = new Map<string, string>();
const matchmakingQueues: Record<TimeControlId, string[]> = {
  '3+2': [],
  '5+0': [],
  '10+0': [],
  unlimited: [],
};
const lobbyChat: ChatMessage[] = [];

function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Guest Player';
  const cleaned = raw.replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 22);
  return cleaned.length >= 2 ? cleaned : 'Guest Player';
}

function sanitizeChatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 280);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeSkinId(raw: unknown): SkinId {
  if (typeof raw === 'string' && VALID_SKINS.has(raw as SkinId)) {
    return raw as SkinId;
  }
  return 'staunton';
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return roomByCode.has(code) ? generateRoomCode() : code;
}

function computeLiveClocks(room: InternalRoom): { whiteTimeMs: number; blackTimeMs: number } {
  let w = room.whiteTimeMs;
  let b = room.blackTimeMs;
  if (
    room.status === 'active' &&
    room.timeControl !== 'unlimited' &&
    room.lastMoveAt !== null &&
    room.moves.length > 0
  ) {
    const elapsed = Math.max(0, Date.now() - room.lastMoveAt);
    if (room.chess.turn() === 'w') {
      w = Math.max(0, w - elapsed);
    } else {
      b = Math.max(0, b - elapsed);
    }
  }
  return { whiteTimeMs: w, blackTimeMs: b };
}

function serializeRoom(room: InternalRoom): GameRoomState {
  const clocks = computeLiveClocks(room);
  return {
    roomId: room.roomId,
    code: room.code,
    isPrivate: room.isPrivate,
    timeControl: room.timeControl,
    fen: room.chess.fen(),
    turn: room.chess.turn(),
    status: room.status,
    winner: room.winner,
    endReason: room.endReason,
    white: room.white ? { ...room.white } : null,
    black: room.black ? { ...room.black } : null,
    whiteTimeMs: clocks.whiteTimeMs,
    blackTimeMs: clocks.blackTimeMs,
    lastMoveAt: room.lastMoveAt,
    lastMove: room.lastMove,
    inCheck: room.chess.inCheck(),
    moves: room.moves,
    drawOfferFrom: room.drawOfferFrom,
    rematchVotes: Array.from(room.rematchVotes),
  };
}

function getLobbyPresence(): LobbyPresence {
  let activeGamesCount = 0;
  for (const room of rooms.values()) {
    if (room.status === 'active') activeGamesCount++;
  }
  return {
    onlineCount: playerSockets.size,
    queuedByControl: {
      '3+2': matchmakingQueues['3+2'].length,
      '5+0': matchmakingQueues['5+0'].length,
      '10+0': matchmakingQueues['10+0'].length,
      unlimited: matchmakingQueues.unlimited.length,
    },
    activeGamesCount,
  };
}

function send(ws: WebSocket | undefined, payload: ServerToClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function broadcastPresence(): void {
  const presence = getLobbyPresence();
  const payload: ServerToClientMessage = { type: 'lobby:presence', lobby: presence };
  const raw = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(raw);
    }
  }
}

function getPlayerColorInRoom(room: InternalRoom, playerId: string): PlayerColor | 'spectator' {
  if (room.white?.id === playerId) return 'w';
  if (room.black?.id === playerId) return 'b';
  return 'spectator';
}

function broadcastRoomState(room: InternalRoom): void {
  const serialized = serializeRoom(room);
  const payload: ServerToClientMessage = { type: 'room:state', room: serialized };
  const raw = JSON.stringify(payload);

  const recipientIds = new Set<string>();
  if (room.white) recipientIds.add(room.white.id);
  if (room.black) recipientIds.add(room.black.id);
  for (const specId of room.spectators) recipientIds.add(specId);

  for (const pid of recipientIds) {
    const sock = playerSockets.get(pid);
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(raw);
    }
  }
}

function broadcastRoomChat(room: InternalRoom, message: ChatMessage): void {
  const payload: ServerToClientMessage = { type: 'chat:message', message };
  const raw = JSON.stringify(payload);

  const recipientIds = new Set<string>();
  if (room.white) recipientIds.add(room.white.id);
  if (room.black) recipientIds.add(room.black.id);
  for (const specId of room.spectators) recipientIds.add(specId);

  for (const pid of recipientIds) {
    const sock = playerSockets.get(pid);
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(raw);
    }
  }
}

function removeFromQueues(playerId: string): void {
  for (const tc of VALID_TIME_CONTROLS) {
    const q = matchmakingQueues[tc];
    const idx = q.indexOf(playerId);
    if (idx !== -1) {
      q.splice(idx, 1);
    }
  }
  const sock = playerSockets.get(playerId);
  const client = sock ? clients.get(sock) : undefined;
  if (client) {
    client.queuedTimeControl = null;
  }
}

function createRoom(
  timeControl: TimeControlId,
  isPrivate: boolean,
  white: PlayerSlot | null,
  black: PlayerSlot | null
): InternalRoom {
  const spec = TIME_CONTROLS[timeControl];
  const roomId = crypto.randomUUID();
  const code = generateRoomCode();
  const room: InternalRoom = {
    roomId,
    code,
    isPrivate,
    timeControl,
    chess: new Chess(),
    white,
    black,
    spectators: new Set<string>(),
    whiteTimeMs: spec.initialMs,
    blackTimeMs: spec.initialMs,
    lastMoveAt: white && black ? Date.now() : null,
    lastMove: null,
    status: white && black ? 'active' : 'waiting',
    winner: null,
    endReason: null,
    moves: [],
    drawOfferFrom: null,
    rematchVotes: new Set<PlayerColor>(),
    chat: [],
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);
  roomByCode.set(code, roomId);
  return room;
}

function attachClientToRoom(client: ConnectedClient, room: InternalRoom, color: PlayerColor | 'spectator'): void {
  client.roomId = room.roomId;
  send(client.ws, {
    type: 'room:joined',
    room: serializeRoom(room),
    yourColor: color,
    chat: room.chat,
  });
}

function leaveCurrentRoom(client: ConnectedClient): void {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  client.roomId = null;
  if (!room) return;

  room.spectators.delete(client.playerId);

  if (room.status === 'waiting') {
    if (room.white?.id === client.playerId) room.white = null;
    if (room.black?.id === client.playerId) room.black = null;
    if (!room.white && !room.black && room.spectators.size === 0) {
      roomByCode.delete(room.code);
      rooms.delete(room.roomId);
    } else {
      broadcastRoomState(room);
    }
  } else if (room.status === 'active') {
    const color = getPlayerColorInRoom(room, client.playerId);
    if (color === 'w' || color === 'b') {
      room.status = 'resigned';
      room.winner = color === 'w' ? 'b' : 'w';
      room.endReason = `${color === 'w' ? 'White' : 'Black'} left the match`;
      broadcastRoomState(room);
    }
  } else {
    // Finished game: clean up if everyone left
    if (room.white?.id === client.playerId) room.white.connected = false;
    if (room.black?.id === client.playerId) room.black.connected = false;
    const anyConnected =
      (room.white?.connected ?? false) || (room.black?.connected ?? false) || room.spectators.size > 0;
    if (!anyConnected) {
      roomByCode.delete(room.code);
      rooms.delete(room.roomId);
    } else {
      broadcastRoomState(room);
    }
  }

  send(client.ws, { type: 'room:left' });
  broadcastPresence();
}

function tryMatchmake(timeControl: TimeControlId): void {
  const queue = matchmakingQueues[timeControl];
  // Purge disconnected players from queue
  for (let i = queue.length - 1; i >= 0; i--) {
    const sock = playerSockets.get(queue[i]);
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      queue.splice(i, 1);
    }
  }

  while (queue.length >= 2) {
    const p1Id = queue.shift()!;
    const p2Id = queue.shift()!;
    if (p1Id === p2Id) continue;

    const s1 = playerSockets.get(p1Id);
    const s2 = playerSockets.get(p2Id);
    const c1 = s1 ? clients.get(s1) : undefined;
    const c2 = s2 ? clients.get(s2) : undefined;
    if (!c1 || !c2) continue;

    c1.queuedTimeControl = null;
    c2.queuedTimeControl = null;

    // Leave any prior rooms cleanly
    if (c1.roomId) leaveCurrentRoom(c1);
    if (c2.roomId) leaveCurrentRoom(c2);

    const p1IsWhite = crypto.randomInt(0, 2) === 0;
    const whiteClient = p1IsWhite ? c1 : c2;
    const blackClient = p1IsWhite ? c2 : c1;

    const room = createRoom(
      timeControl,
      false,
      { id: whiteClient.playerId, name: whiteClient.name, connected: true, skinId: whiteClient.skinId },
      { id: blackClient.playerId, name: blackClient.name, connected: true, skinId: blackClient.skinId }
    );

    const systemGreeting: ChatMessage = {
      id: crypto.randomUUID(),
      channel: 'match',
      roomId: room.roomId,
      senderId: 'system',
      senderName: 'Arbiter',
      text: `Match paired (${TIME_CONTROLS[timeControl].label}). White: ${whiteClient.name} · Black: ${blackClient.name}`,
      timestamp: Date.now(),
    };
    room.chat.push(systemGreeting);

    attachClientToRoom(whiteClient, room, 'w');
    attachClientToRoom(blackClient, room, 'b');
    broadcastPresence();
  }
}

function finalizeChessOutcome(room: InternalRoom): void {
  if (room.chess.isCheckmate()) {
    room.status = 'checkmate';
    room.winner = room.chess.turn() === 'w' ? 'b' : 'w';
    room.endReason = 'Checkmate';
  } else if (room.chess.isStalemate()) {
    room.status = 'stalemate';
    room.winner = 'draw';
    room.endReason = 'Stalemate';
  } else if (room.chess.isThreefoldRepetition()) {
    room.status = 'draw';
    room.winner = 'draw';
    room.endReason = 'Threefold repetition';
  } else if (room.chess.isInsufficientMaterial()) {
    room.status = 'draw';
    room.winner = 'draw';
    room.endReason = 'Insufficient material';
  } else if (room.chess.isDraw()) {
    room.status = 'draw';
    room.winner = 'draw';
    room.endReason = '50-move rule';
  }
}

// Check active game clocks every 500ms
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (
      room.status === 'active' &&
      room.timeControl !== 'unlimited' &&
      room.lastMoveAt !== null &&
      room.moves.length > 0
    ) {
      const elapsed = now - room.lastMoveAt;
      if (room.chess.turn() === 'w' && room.whiteTimeMs - elapsed <= 0) {
        room.whiteTimeMs = 0;
        room.status = 'timeout';
        room.winner = 'b';
        room.endReason = 'White ran out of time';
        broadcastRoomState(room);
        broadcastPresence();
      } else if (room.chess.turn() === 'b' && room.blackTimeMs - elapsed <= 0) {
        room.blackTimeMs = 0;
        room.status = 'timeout';
        room.winner = 'w';
        room.endReason = 'Black ran out of time';
        broadcastRoomState(room);
        broadcastPresence();
      }
    }
  }
}, 500);

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, lobby: getLobbyPresence() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let client: ConnectedClient | null = null;

    ws.on('message', (rawData) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(rawData.toString()) as ClientToServerMessage;
      } catch {
        send(ws, { type: 'error:notice', message: 'Invalid message format.' });
        return;
      }

      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'auth:hello') {
        const pid =
          typeof msg.playerId === 'string' && msg.playerId.trim().length >= 8
            ? msg.playerId.trim().slice(0, 64)
            : crypto.randomUUID();
        const name = sanitizeDisplayName(msg.name);
        const skinId = sanitizeSkinId(msg.skinId);

        // If playerId already had an old socket, close/replace reference cleanly
        const prevSock = playerSockets.get(pid);
        if (prevSock && prevSock !== ws) {
          clients.delete(prevSock);
          if (prevSock.readyState === WebSocket.OPEN) {
            prevSock.close();
          }
        }

        client = {
          ws,
          playerId: pid,
          name,
          skinId,
          roomId: null,
          queuedTimeControl: null,
          chatTimestamps: [],
        };
        clients.set(ws, client);
        playerSockets.set(pid, ws);

        // Check if this player belongs to an existing room (reconnection)
        let activeRoom: InternalRoom | null = null;
        let yourColor: PlayerColor | 'spectator' | null = null;
        for (const r of rooms.values()) {
          if (r.white?.id === pid) {
            r.white.connected = true;
            r.white.name = name;
            r.white.skinId = skinId;
            activeRoom = r;
            yourColor = 'w';
            break;
          }
          if (r.black?.id === pid) {
            r.black.connected = true;
            r.black.name = name;
            r.black.skinId = skinId;
            activeRoom = r;
            yourColor = 'b';
            break;
          }
        }

        if (activeRoom) {
          client.roomId = activeRoom.roomId;
          broadcastRoomState(activeRoom);
        }

        send(ws, {
          type: 'session:welcome',
          playerId: pid,
          name,
          lobby: getLobbyPresence(),
          lobbyChat: lobbyChat.slice(-60),
          activeRoom: activeRoom ? serializeRoom(activeRoom) : null,
          yourColor,
        });
        broadcastPresence();
        return;
      }

      if (!client) {
        send(ws, { type: 'error:notice', message: 'Handshake required before sending actions.' });
        return;
      }

      switch (msg.type) {
        case 'profile:update': {
          if (msg.name !== undefined) {
            client.name = sanitizeDisplayName(msg.name);
          }
          if (msg.skinId !== undefined) {
            client.skinId = sanitizeSkinId(msg.skinId);
          }
          if (client.roomId) {
            const room = rooms.get(client.roomId);
            if (room) {
              if (room.white?.id === client.playerId) {
                room.white.name = client.name;
                room.white.skinId = client.skinId;
              }
              if (room.black?.id === client.playerId) {
                room.black.name = client.name;
                room.black.skinId = client.skinId;
              }
              broadcastRoomState(room);
            }
          }
          break;
        }

        case 'matchmaking:join': {
          if (!VALID_TIME_CONTROLS.has(msg.timeControl)) return;
          if (client.roomId) {
            leaveCurrentRoom(client);
          }
          removeFromQueues(client.playerId);
          client.queuedTimeControl = msg.timeControl;
          matchmakingQueues[msg.timeControl].push(client.playerId);
          send(ws, { type: 'matchmaking:queued', timeControl: msg.timeControl });
          tryMatchmake(msg.timeControl);
          broadcastPresence();
          break;
        }

        case 'matchmaking:leave': {
          removeFromQueues(client.playerId);
          send(ws, { type: 'matchmaking:cancelled' });
          broadcastPresence();
          break;
        }

        case 'room:create': {
          const tc = VALID_TIME_CONTROLS.has(msg.timeControl) ? msg.timeControl : '5+0';
          removeFromQueues(client.playerId);
          if (client.roomId) leaveCurrentRoom(client);

          const assignWhite =
            msg.preferredColor === 'w'
              ? true
              : msg.preferredColor === 'b'
                ? false
                : crypto.randomInt(0, 2) === 0;

          const slot: PlayerSlot = {
            id: client.playerId,
            name: client.name,
            connected: true,
            skinId: client.skinId,
          };

          const room = createRoom(tc, true, assignWhite ? slot : null, assignWhite ? null : slot);
          room.chat.push({
            id: crypto.randomUUID(),
            channel: 'match',
            roomId: room.roomId,
            senderId: 'system',
            senderName: 'Arbiter',
            text: `Private room created. Share code ${room.code} to invite an opponent.`,
            timestamp: Date.now(),
          });
          attachClientToRoom(client, room, assignWhite ? 'w' : 'b');
          broadcastPresence();
          break;
        }

        case 'room:join': {
          const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
          const targetRoomId = roomByCode.get(code);
          if (!targetRoomId) {
            send(ws, { type: 'error:notice', message: `No room found with code "${code}".` });
            return;
          }
          const room = rooms.get(targetRoomId);
          if (!room) {
            send(ws, { type: 'error:notice', message: 'Room is no longer active.' });
            return;
          }
          removeFromQueues(client.playerId);
          if (client.roomId && client.roomId !== room.roomId) {
            leaveCurrentRoom(client);
          }

          let color: PlayerColor | 'spectator' = getPlayerColorInRoom(room, client.playerId);
          if (color === 'spectator') {
            const slot: PlayerSlot = {
              id: client.playerId,
              name: client.name,
              connected: true,
              skinId: client.skinId,
            };
            if (!room.white) {
              room.white = slot;
              color = 'w';
            } else if (!room.black) {
              room.black = slot;
              color = 'b';
            } else {
              room.spectators.add(client.playerId);
              color = 'spectator';
            }
          }

          if (room.white && room.black && room.status === 'waiting') {
            room.status = 'active';
            room.lastMoveAt = Date.now();
            room.chat.push({
              id: crypto.randomUUID(),
              channel: 'match',
              roomId: room.roomId,
              senderId: 'system',
              senderName: 'Arbiter',
              text: `${client.name} joined as ${color === 'w' ? 'White' : 'Black'}. Match started!`,
              timestamp: Date.now(),
            });
          }

          attachClientToRoom(client, room, color);
          broadcastRoomState(room);
          broadcastPresence();
          break;
        }

        case 'room:leave': {
          leaveCurrentRoom(client);
          break;
        }

        case 'game:move': {
          const room = rooms.get(msg.roomId);
          if (!room || room.status !== 'active') return;
          const color = getPlayerColorInRoom(room, client.playerId);
          if (color === 'spectator' || color !== room.chess.turn()) {
            send(ws, { type: 'error:notice', message: 'Not your turn.' });
            return;
          }

          const now = Date.now();
          if (room.timeControl !== 'unlimited' && room.lastMoveAt !== null && room.moves.length > 0) {
            const elapsed = Math.max(0, now - room.lastMoveAt);
            if (color === 'w') {
              room.whiteTimeMs = Math.max(0, room.whiteTimeMs - elapsed);
              if (room.whiteTimeMs <= 0) {
                room.status = 'timeout';
                room.winner = 'b';
                room.endReason = 'White ran out of time';
                broadcastRoomState(room);
                return;
              }
            } else {
              room.blackTimeMs = Math.max(0, room.blackTimeMs - elapsed);
              if (room.blackTimeMs <= 0) {
                room.status = 'timeout';
                room.winner = 'w';
                room.endReason = 'Black ran out of time';
                broadcastRoomState(room);
                return;
              }
            }
          }

          let moveResult;
          try {
            moveResult = room.chess.move({
              from: msg.from,
              to: msg.to,
              promotion: msg.promotion || 'q',
            });
          } catch {
            send(ws, { type: 'error:notice', message: 'Illegal move.' });
            return;
          }

          if (!moveResult) {
            send(ws, { type: 'error:notice', message: 'Illegal move.' });
            return;
          }

          const spec = TIME_CONTROLS[room.timeControl];
          if (room.timeControl !== 'unlimited' && room.moves.length > 0) {
            if (color === 'w') room.whiteTimeMs += spec.incrementMs;
            else room.blackTimeMs += spec.incrementMs;
          }

          room.lastMoveAt = now;
          room.lastMove = { from: moveResult.from, to: moveResult.to };
          room.drawOfferFrom = null;
          room.moves.push({
            ply: room.moves.length + 1,
            san: moveResult.san,
            from: moveResult.from,
            to: moveResult.to,
            color: moveResult.color,
            piece: moveResult.piece,
            captured: moveResult.captured,
            promotion: moveResult.promotion,
            fen: room.chess.fen(),
          });

          finalizeChessOutcome(room);
          broadcastRoomState(room);
          if (room.status !== 'active') {
            broadcastPresence();
          }
          break;
        }

        case 'game:resign': {
          const room = rooms.get(msg.roomId);
          if (!room || room.status !== 'active') return;
          const color = getPlayerColorInRoom(room, client.playerId);
          if (color !== 'w' && color !== 'b') return;

          room.status = 'resigned';
          room.winner = color === 'w' ? 'b' : 'w';
          room.endReason = `${color === 'w' ? 'White' : 'Black'} resigned`;
          broadcastRoomState(room);
          broadcastPresence();
          break;
        }

        case 'game:draw_offer': {
          const room = rooms.get(msg.roomId);
          if (!room || room.status !== 'active') return;
          const color = getPlayerColorInRoom(room, client.playerId);
          if (color !== 'w' && color !== 'b') return;

          room.drawOfferFrom = color;
          broadcastRoomState(room);
          break;
        }

        case 'game:draw_respond': {
          const room = rooms.get(msg.roomId);
          if (!room || room.status !== 'active' || !room.drawOfferFrom) return;
          const color = getPlayerColorInRoom(room, client.playerId);
          if (color !== 'w' && color !== 'b') return;
          if (color === room.drawOfferFrom) return;

          if (msg.accept) {
            room.status = 'draw';
            room.winner = 'draw';
            room.endReason = 'Draw by mutual agreement';
            room.drawOfferFrom = null;
            broadcastRoomState(room);
            broadcastPresence();
          } else {
            room.drawOfferFrom = null;
            broadcastRoomState(room);
          }
          break;
        }

        case 'game:rematch': {
          const room = rooms.get(msg.roomId);
          if (!room || room.status === 'active' || room.status === 'waiting') return;
          const color = getPlayerColorInRoom(room, client.playerId);
          if (color !== 'w' && color !== 'b') return;

          room.rematchVotes.add(color);
          if (room.rematchVotes.has('w') && room.rematchVotes.has('b')) {
            // Swap colors and restart cleanly
            const prevWhite = room.white;
            const prevBlack = room.black;
            room.white = prevBlack;
            room.black = prevWhite;
            room.chess = new Chess();
            const spec = TIME_CONTROLS[room.timeControl];
            room.whiteTimeMs = spec.initialMs;
            room.blackTimeMs = spec.initialMs;
            room.lastMoveAt = Date.now();
            room.lastMove = null;
            room.status = 'active';
            room.winner = null;
            room.endReason = null;
            room.moves = [];
            room.drawOfferFrom = null;
            room.rematchVotes.clear();

            room.chat.push({
              id: crypto.randomUUID(),
              channel: 'match',
              roomId: room.roomId,
              senderId: 'system',
              senderName: 'Arbiter',
              text: 'Rematch accepted. Colors swapped!',
              timestamp: Date.now(),
            });

            if (room.white) {
              const wSock = playerSockets.get(room.white.id);
              if (wSock) {
                send(wSock, {
                  type: 'room:joined',
                  room: serializeRoom(room),
                  yourColor: 'w',
                  chat: room.chat,
                });
              }
            }
            if (room.black) {
              const bSock = playerSockets.get(room.black.id);
              if (bSock) {
                send(bSock, {
                  type: 'room:joined',
                  room: serializeRoom(room),
                  yourColor: 'b',
                  chat: room.chat,
                });
              }
            }
            broadcastPresence();
          } else {
            broadcastRoomState(room);
          }
          break;
        }

        case 'chat:send': {
          const text = sanitizeChatText(msg.text);
          if (!text) return;

          const now = Date.now();
          client.chatTimestamps = client.chatTimestamps.filter((ts) => now - ts < 5000);
          if (client.chatTimestamps.length >= 6) {
            send(ws, { type: 'error:notice', message: 'Sending messages too quickly.' });
            return;
          }
          client.chatTimestamps.push(now);

          if (msg.channel === 'match' && msg.roomId) {
            const room = rooms.get(msg.roomId);
            if (!room) return;
            const senderColor = getPlayerColorInRoom(room, client.playerId);
            const chatMsg: ChatMessage = {
              id: crypto.randomUUID(),
              channel: 'match',
              roomId: room.roomId,
              senderId: client.playerId,
              senderName: client.name,
              senderColor,
              text,
              timestamp: now,
            };
            room.chat.push(chatMsg);
            if (room.chat.length > 80) room.chat.shift();
            broadcastRoomChat(room, chatMsg);
          } else {
            const chatMsg: ChatMessage = {
              id: crypto.randomUUID(),
              channel: 'lobby',
              senderId: client.playerId,
              senderName: client.name,
              text,
              timestamp: now,
            };
            lobbyChat.push(chatMsg);
            if (lobbyChat.length > 60) lobbyChat.shift();
            const raw = JSON.stringify({ type: 'chat:message', message: chatMsg } satisfies ServerToClientMessage);
            for (const c of clients.values()) {
              if (c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(raw);
              }
            }
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!client) return;
      removeFromQueues(client.playerId);
      if (playerSockets.get(client.playerId) === ws) {
        playerSockets.delete(client.playerId);
      }
      clients.delete(ws);

      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room) {
          if (room.white?.id === client.playerId) room.white.connected = false;
          if (room.black?.id === client.playerId) room.black.connected = false;
          room.spectators.delete(client.playerId);
          broadcastRoomState(room);
        }
      }
      broadcastPresence();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sovereign 3D Chess server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
