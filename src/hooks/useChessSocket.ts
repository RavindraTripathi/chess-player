import { useCallback, useEffect, useRef, useState } from 'react';
import { chessAudio } from '../audio/chessAudio';
import type {
  ChatMessage,
  ClientToServerMessage,
  GameRoomState,
  LobbyPresence,
  PlayerColor,
  ServerToClientMessage,
  SkinId,
  TimeControlId,
} from '../shared/protocol';

function getOrCreateTabPlayerId(): string {
  try {
    const existing = sessionStorage.getItem('sovereign_player_id');
    if (existing && existing.length >= 8) return existing;
    const created =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    sessionStorage.setItem('sovereign_player_id', created);
    return created;
  } catch {
    return `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

function getOrCreateDisplayName(): string {
  try {
    const saved = sessionStorage.getItem('sovereign_player_name');
    if (saved && saved.trim().length >= 2) return saved;
    const suffix = Math.floor(100 + Math.random() * 900);
    const created = `Grandmaster ${suffix}`;
    sessionStorage.setItem('sovereign_player_name', created);
    return created;
  } catch {
    return 'Guest Player';
  }
}

export function useChessSocket(initialSkin: SkinId) {
  const [playerId] = useState<string>(() => getOrCreateTabPlayerId());
  const [playerName, setPlayerNameState] = useState<string>(() => getOrCreateDisplayName());
  const [connected, setConnected] = useState(false);
  const [lobby, setLobby] = useState<LobbyPresence>({
    onlineCount: 0,
    queuedByControl: { '3+2': 0, '5+0': 0, '10+0': 0, unlimited: 0 },
    activeGamesCount: 0,
  });
  const [queuedControl, setQueuedControl] = useState<TimeControlId | null>(null);
  const [activeRoom, setActiveRoom] = useState<GameRoomState | null>(null);
  const [yourColor, setYourColor] = useState<PlayerColor | 'spectator' | null>(null);
  const [lobbyChat, setLobbyChat] = useState<ChatMessage[]>([]);
  const [matchChat, setMatchChat] = useState<ChatMessage[]>([]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const skinRef = useRef<SkinId>(initialSkin);
  const nameRef = useRef<string>(playerName);
  const reconnectTimerRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);

  const sendRaw = useCallback((msg: ClientToServerMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    const connect = () => {
      if (unmountedRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(
          JSON.stringify({
            type: 'auth:hello',
            playerId,
            name: nameRef.current,
            skinId: skinRef.current,
          } satisfies ClientToServerMessage)
        );
      };

      ws.onmessage = (ev) => {
        let msg: ServerToClientMessage;
        try {
          msg = JSON.parse(ev.data) as ServerToClientMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'session:welcome':
            setLobby(msg.lobby);
            setLobbyChat(msg.lobbyChat);
            if (msg.activeRoom) {
              setActiveRoom(msg.activeRoom);
              setYourColor(msg.yourColor);
            }
            break;

          case 'lobby:presence':
            setLobby(msg.lobby);
            break;

          case 'matchmaking:queued':
            setQueuedControl(msg.timeControl);
            break;

          case 'matchmaking:cancelled':
            setQueuedControl(null);
            break;

          case 'room:joined':
            setQueuedControl(null);
            setActiveRoom(msg.room);
            setYourColor(msg.yourColor);
            setMatchChat(msg.chat);
            if (msg.room.status === 'active') {
              chessAudio.playMatchFound();
            }
            break;

          case 'room:state':
            setActiveRoom((prev) => {
              // Play subtle audio cues when opponent moves or game concludes
              if (prev && prev.roomId === msg.room.roomId) {
                if (msg.room.moves.length > prev.moves.length) {
                  const last = msg.room.moves[msg.room.moves.length - 1];
                  if (msg.room.status === 'checkmate') {
                    // Handled below
                  } else if (msg.room.inCheck) {
                    chessAudio.playCheck();
                  } else {
                    chessAudio.playMove(Boolean(last?.captured));
                  }
                }
                if (prev.status === 'active' && msg.room.status !== 'active') {
                  chessAudio.playGameOver(msg.room.winner === yourColor);
                }
              }
              return msg.room;
            });
            break;

          case 'room:left':
            setActiveRoom(null);
            setYourColor(null);
            setMatchChat([]);
            break;

          case 'chat:message':
            if (msg.message.channel === 'match') {
              setMatchChat((prev) => {
                if (prev.some((m) => m.id === msg.message.id)) return prev;
                if (msg.message.senderId !== playerId && msg.message.senderId !== 'system') {
                  chessAudio.playChatTick();
                }
                return [...prev.slice(-79), msg.message];
              });
            } else {
              setLobbyChat((prev) => {
                if (prev.some((m) => m.id === msg.message.id)) return prev;
                return [...prev.slice(-59), msg.message];
              });
            }
            break;

          case 'error:notice':
            setErrorNotice(msg.message);
            window.setTimeout(() => {
              setErrorNotice((curr) => (curr === msg.message ? null : curr));
            }, 3500);
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!unmountedRef.current) {
          reconnectTimerRef.current = window.setTimeout(connect, 1600);
        }
      };
    };

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [playerId]);

  const updateProfile = useCallback(
    (name: string, skinId: SkinId) => {
      const cleaned = name.trim().slice(0, 22) || 'Guest Player';
      nameRef.current = cleaned;
      skinRef.current = skinId;
      setPlayerNameState(cleaned);
      try {
        sessionStorage.setItem('sovereign_player_name', cleaned);
      } catch {
        // ignore storage errors
      }
      sendRaw({ type: 'profile:update', name: cleaned, skinId });
    },
    [sendRaw]
  );

  const updateSkin = useCallback(
    (skinId: SkinId) => {
      skinRef.current = skinId;
      sendRaw({ type: 'profile:update', skinId });
    },
    [sendRaw]
  );

  const joinMatchmaking = useCallback(
    (timeControl: TimeControlId) => {
      sendRaw({ type: 'matchmaking:join', timeControl });
    },
    [sendRaw]
  );

  const leaveMatchmaking = useCallback(() => {
    setQueuedControl(null);
    sendRaw({ type: 'matchmaking:leave' });
  }, [sendRaw]);

  const createPrivateRoom = useCallback(
    (timeControl: TimeControlId, preferredColor: PlayerColor | 'random' = 'random') => {
      sendRaw({ type: 'room:create', timeControl, preferredColor });
    },
    [sendRaw]
  );

  const joinRoomByCode = useCallback(
    (code: string) => {
      sendRaw({ type: 'room:join', code: code.trim().toUpperCase() });
    },
    [sendRaw]
  );

  const leaveRoom = useCallback(() => {
    if (!activeRoom) return;
    sendRaw({ type: 'room:leave', roomId: activeRoom.roomId });
    setActiveRoom(null);
    setYourColor(null);
    setMatchChat([]);
  }, [activeRoom, sendRaw]);

  const sendMove = useCallback(
    (roomId: string, from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
      sendRaw({ type: 'game:move', roomId, from, to, promotion });
    },
    [sendRaw]
  );

  const resign = useCallback(
    (roomId: string) => {
      sendRaw({ type: 'game:resign', roomId });
    },
    [sendRaw]
  );

  const offerDraw = useCallback(
    (roomId: string) => {
      sendRaw({ type: 'game:draw_offer', roomId });
    },
    [sendRaw]
  );

  const respondDraw = useCallback(
    (roomId: string, accept: boolean) => {
      sendRaw({ type: 'game:draw_respond', roomId, accept });
    },
    [sendRaw]
  );

  const requestRematch = useCallback(
    (roomId: string) => {
      sendRaw({ type: 'game:rematch', roomId });
    },
    [sendRaw]
  );

  const sendChat = useCallback(
    (channel: 'lobby' | 'match', text: string, roomId?: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      sendRaw({ type: 'chat:send', channel, text: cleaned, roomId });
    },
    [sendRaw]
  );

  return {
    playerId,
    playerName,
    connected,
    lobby,
    queuedControl,
    activeRoom,
    yourColor,
    lobbyChat,
    matchChat,
    errorNotice,
    updateProfile,
    updateSkin,
    joinMatchmaking,
    leaveMatchmaking,
    createPrivateRoom,
    joinRoomByCode,
    leaveRoom,
    sendMove,
    resign,
    offerDraw,
    respondDraw,
    requestRematch,
    sendChat,
  };
}
