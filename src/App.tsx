import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chessAudio } from './audio/chessAudio';
import { ChessSceneManager, type CameraPreset } from './chess3d/ChessSceneManager';
import { BottomDock } from './components/BottomDock';
import { GameOverModal, PromotionModal } from './components/GameModals';
import { LobbyModal } from './components/LobbyModal';
import { MatchHud } from './components/MatchHud';
import { SideDrawer } from './components/SideDrawer';
import { TitleScreen } from './components/TitleScreen';
import { chooseBotMove } from './engine/localBot';
import { useChessSocket } from './hooks/useChessSocket';
import { TIME_CONTROLS, type MoveRecord, type PlayerColor, type SkinId } from './shared/protocol';

type AppScreen = 'title' | 'playing';
type PlayMode = 'online' | 'solo';

interface PendingPromotion {
  from: Square;
  to: Square;
  color: PlayerColor;
}

function loadSavedSkin(): SkinId {
  try {
    const val = localStorage.getItem('sovereign_skin');
    if (val === 'staunton' || val === 'carrara' || val === 'imperial' || val === 'crystal' || val === 'obsidian') {
      return val;
    }
  } catch {
    // ignore storage errors
  }
  return 'staunton';
}

export default function App() {
  const [activeSkin, setActiveSkin] = useState<SkinId>(() => loadSavedSkin());
  const [screen, setScreen] = useState<AppScreen>('title');
  const [playMode, setPlayMode] = useState<PlayMode>('online');
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'moves' | null>(null);
  const [muted, setMuted] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  // Selection & Promotion state
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  // Solo Practice vs Engine state
  const [soloFen, setSoloFen] = useState<string>(() => new Chess().fen());
  const [soloMoves, setSoloMoves] = useState<MoveRecord[]>([]);
  const [soloLastMove, setSoloLastMove] = useState<{ from: string; to: string } | null>(null);
  const [soloThinking, setSoloThinking] = useState(false);

  // Live clock display state
  const [liveWhiteMs, setLiveWhiteMs] = useState(0);
  const [liveBlackMs, setLiveBlackMs] = useState(0);

  // Unread match chat counter
  const [unreadChat, setUnreadChat] = useState(0);
  const prevMatchChatLenRef = useRef(0);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ChessSceneManager | null>(null);

  const socket = useChessSocket(activeSkin);

  // Keep latest handlers in refs so WebGL mount effect never re-runs
  const onSquareClickRef = useRef<(sq: Square) => void>(() => {});
  const autoJoinedUrlRoomRef = useRef(false);

  // Derive current authoritative board state
  const soloChess = useMemo(() => new Chess(soloFen), [soloFen]);
  const soloInCheck = useMemo(() => soloChess.inCheck(), [soloChess]);
  const soloOutcome = useMemo(() => {
    if (!soloChess.isGameOver()) return null;
    if (soloChess.isCheckmate()) {
      const winner = soloChess.turn() === 'w' ? 'b' : 'w';
      return {
        title: winner === 'w' ? 'Victory' : 'Defeat',
        subtitle: winner === 'w' ? 'Checkmate against the engine' : 'Checkmate by engine',
      };
    }
    return {
      title: 'Draw',
      subtitle: soloChess.isStalemate() ? 'Stalemate' : 'Drawn position',
    };
  }, [soloChess]);

  const currentFen =
    screen === 'title'
      ? new Chess().fen()
      : playMode === 'online'
        ? socket.activeRoom?.fen ?? new Chess().fen()
        : soloFen;

  const currentLastMove =
    screen === 'title'
      ? null
      : playMode === 'online'
        ? socket.activeRoom?.lastMove ?? null
        : soloLastMove;

  const currentInCheck =
    screen === 'title'
      ? false
      : playMode === 'online'
        ? socket.activeRoom?.inCheck ?? false
        : soloInCheck;

  const currentMoves: MoveRecord[] =
    playMode === 'online' ? socket.activeRoom?.moves ?? [] : soloMoves;

  // Handle skin selection
  const handleSelectSkin = useCallback(
    (skin: SkinId) => {
      setActiveSkin(skin);
      try {
        localStorage.setItem('sovereign_skin', skin);
      } catch {
        // ignore storage errors
      }
      sceneRef.current?.applySkin(skin);
      socket.updateSkin(skin);
    },
    [socket]
  );

  // Initialize Three.js WebGL scene once in isolated mount container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const mgr = new ChessSceneManager(mount, activeSkin, {
      onSquareClick: (sq) => onSquareClickRef.current(sq),
      onContextLost: () => setContextLost(true),
      onContextRestored: () => setContextLost(false),
    });
    sceneRef.current = mgr;

    return () => {
      mgr.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join room from ?room=CODE URL param once connected
  useEffect(() => {
    if (!socket.connected || autoJoinedUrlRoomRef.current) return;
    autoJoinedUrlRoomRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && code.trim().length >= 4) {
      socket.joinRoomByCode(code.trim());
    }
  }, [socket.connected, socket.joinRoomByCode]);

  // Transition automatically into playing screen when an online room is joined
  useEffect(() => {
    if (socket.activeRoom) {
      setPlayMode('online');
      setScreen('playing');
      setLobbyOpen(false);
      setGameOverDismissed(false);
      setSelectedSquare(null);
      if (socket.yourColor === 'w' || socket.yourColor === 'b') {
        sceneRef.current?.setOrientation(socket.yourColor, true);
      }
    }
  }, [socket.activeRoom?.roomId, socket.yourColor]);

  // Sync showcase mode on Title Screen vs Playing
  useEffect(() => {
    const mgr = sceneRef.current;
    if (!mgr) return;
    mgr.setShowcaseMode(screen === 'title');
  }, [screen]);

  // Sync FEN & board highlights to Three.js scene
  useEffect(() => {
    const mgr = sceneRef.current;
    if (!mgr) return;
    mgr.syncFen(currentFen, currentLastMove, currentInCheck, screen === 'playing');
  }, [currentFen, currentLastMove, currentInCheck, screen]);

  // Sync legal move highlights
  useEffect(() => {
    const mgr = sceneRef.current;
    if (!mgr) return;

    if (!selectedSquare || screen !== 'playing') {
      mgr.setSelectionAndHints(null, []);
      return;
    }

    const chess = new Chess(currentFen);
    const legal = chess.moves({ square: selectedSquare, verbose: true });
    mgr.setSelectionAndHints(
      selectedSquare,
      legal.map((m) => ({
        to: m.to as Square,
        isCapture: Boolean(m.captured),
      }))
    );
  }, [selectedSquare, currentFen, screen]);

  // Update unread chat badge when drawer is closed
  useEffect(() => {
    const len = socket.matchChat.length;
    if (len > prevMatchChatLenRef.current) {
      if (activeDrawer !== 'chat') {
        const latest = socket.matchChat[len - 1];
        if (latest && latest.senderId !== socket.playerId && latest.senderId !== 'system') {
          setUnreadChat((c) => c + 1);
        }
      }
    }
    prevMatchChatLenRef.current = len;
  }, [socket.matchChat, activeDrawer, socket.playerId]);

  useEffect(() => {
    if (activeDrawer === 'chat') {
      setUnreadChat(0);
    }
  }, [activeDrawer]);

  // Smooth client clock countdown synced to server room timestamps
  useEffect(() => {
    const room = socket.activeRoom;
    if (!room) return;

    const updateClocks = () => {
      if (
        room.status === 'active' &&
        room.timeControl !== 'unlimited' &&
        room.lastMoveAt !== null &&
        room.moves.length > 0
      ) {
        const elapsed = Math.max(0, Date.now() - room.lastMoveAt);
        setLiveWhiteMs(room.turn === 'w' ? Math.max(0, room.whiteTimeMs - elapsed) : room.whiteTimeMs);
        setLiveBlackMs(room.turn === 'b' ? Math.max(0, room.blackTimeMs - elapsed) : room.blackTimeMs);
      } else {
        setLiveWhiteMs(room.whiteTimeMs);
        setLiveBlackMs(room.blackTimeMs);
      }
    };

    updateClocks();
    const timer = window.setInterval(updateClocks, 200);
    return () => clearInterval(timer);
  }, [socket.activeRoom]);

  // Execute move in Online or Solo mode
  const executeMove = useCallback(
    (from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') => {
      setSelectedSquare(null);

      if (playMode === 'online') {
        if (!socket.activeRoom) return;
        const chess = new Chess(socket.activeRoom.fen);
        const test = chess.move({ from, to, promotion: promotion ?? 'q' });
        if (!test) return;
        chessAudio.playMove(Boolean(test.captured));
        socket.sendMove(socket.activeRoom.roomId, from, to, promotion);
      } else {
        const chess = new Chess(soloFen);
        const moveRes = chess.move({ from, to, promotion: promotion ?? 'q' });
        if (!moveRes) return;
        chessAudio.playMove(Boolean(moveRes.captured));
        if (chess.inCheck()) chessAudio.playCheck();
        setSoloFen(chess.fen());
        setSoloLastMove({ from: moveRes.from, to: moveRes.to });
        setSoloMoves((prev) => [
          ...prev,
          {
            ply: prev.length + 1,
            san: moveRes.san,
            from: moveRes.from,
            to: moveRes.to,
            color: moveRes.color,
            piece: moveRes.piece,
            captured: moveRes.captured,
            promotion: moveRes.promotion,
            fen: chess.fen(),
          },
        ]);
        if (chess.isGameOver()) {
          chessAudio.playGameOver(chess.turn() === 'b');
        }
      }
    },
    [playMode, socket, soloFen]
  );

  // Trigger Solo Engine reply when it's Black's turn
  useEffect(() => {
    if (screen !== 'playing' || playMode !== 'solo') return;
    const chess = new Chess(soloFen);
    if (chess.isGameOver() || chess.turn() !== 'b') return;

    setSoloThinking(true);
    const timer = window.setTimeout(() => {
      const botMove = chooseBotMove(soloFen, 2);
      if (botMove) {
        const nextChess = new Chess(soloFen);
        const res = nextChess.move(botMove);
        if (res) {
          chessAudio.playMove(Boolean(res.captured));
          if (nextChess.inCheck()) chessAudio.playCheck();
          setSoloFen(nextChess.fen());
          setSoloLastMove({ from: res.from, to: res.to });
          setSoloMoves((prev) => [
            ...prev,
            {
              ply: prev.length + 1,
              san: res.san,
              from: res.from,
              to: res.to,
              color: res.color,
              piece: res.piece,
              captured: res.captured,
              promotion: res.promotion,
              fen: nextChess.fen(),
            },
          ]);
          if (nextChess.isGameOver()) {
            chessAudio.playGameOver(false);
          }
        }
      }
      setSoloThinking(false);
    }, 380);

    return () => {
      clearTimeout(timer);
      setSoloThinking(false);
    };
  }, [screen, playMode, soloFen]);

  // Square click handler wired to 3D raycaster
  const handleSquareClick = useCallback(
    (sq: Square) => {
      if (screen !== 'playing' || pendingPromotion) return;

      const myColor: PlayerColor | null =
        playMode === 'solo'
          ? 'w'
          : socket.yourColor === 'w' || socket.yourColor === 'b'
            ? socket.yourColor
            : null;

      if (!myColor) return;
      if (playMode === 'online' && socket.activeRoom?.status !== 'active') return;

      const chess = new Chess(currentFen);
      if (chess.turn() !== myColor || chess.isGameOver()) return;

      const clickedPiece = chess.get(sq);

      if (selectedSquare) {
        if (selectedSquare === sq) {
          setSelectedSquare(null);
          return;
        }
        const legalMoves = chess.moves({ square: selectedSquare, verbose: true });
        const matched = legalMoves.filter((m) => m.to === sq);
        if (matched.length > 0) {
          // Check if pawn promotion
          if (matched.some((m) => m.promotion)) {
            setPendingPromotion({ from: selectedSquare, to: sq, color: myColor });
          } else {
            executeMove(selectedSquare, sq);
          }
          return;
        }
      }

      if (clickedPiece && clickedPiece.color === myColor) {
        setSelectedSquare(sq);
      } else {
        setSelectedSquare(null);
      }
    },
    [screen, pendingPromotion, playMode, socket.yourColor, socket.activeRoom?.status, currentFen, selectedSquare, executeMove]
  );

  useEffect(() => {
    onSquareClickRef.current = handleSquareClick;
  }, [handleSquareClick]);

  // Start Solo Practice vs Engine
  const startSoloPractice = useCallback(() => {
    if (socket.activeRoom) socket.leaveRoom();
    if (socket.queuedControl) socket.leaveMatchmaking();
    setPlayMode('solo');
    setSoloFen(new Chess().fen());
    setSoloMoves([]);
    setSoloLastMove(null);
    setSelectedSquare(null);
    setGameOverDismissed(false);
    setLobbyOpen(false);
    setScreen('playing');
    sceneRef.current?.setOrientation('w', true);
  }, [socket]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isInput) return;

      if (e.key === 'Enter' && screen === 'title' && !lobbyOpen) {
        e.preventDefault();
        setLobbyOpen(true);
      } else if ((e.key === 'h' || e.key === 'H') && screen === 'playing') {
        setDockCollapsed((v) => !v);
      } else if (e.key === 'Escape') {
        if (pendingPromotion) setPendingPromotion(null);
        else if (selectedSquare) setSelectedSquare(null);
        else if (activeDrawer) setActiveDrawer(null);
        else if (lobbyOpen) setLobbyOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, lobbyOpen, pendingPromotion, selectedSquare, activeDrawer]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      chessAudio.setMuted(next);
      return next;
    });
  }, []);

  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    sceneRef.current?.setCameraPreset(preset);
  }, []);

  const handleFlipBoard = useCallback(() => {
    sceneRef.current?.flipCameraView();
  }, []);

  const handleExitToMenu = useCallback(() => {
    if (playMode === 'online') {
      if (socket.activeRoom) socket.leaveRoom();
      if (socket.queuedControl) socket.leaveMatchmaking();
    }
    setSelectedSquare(null);
    setActiveDrawer(null);
    setScreen('title');
  }, [playMode, socket]);

  const isOnlineEnded =
    playMode === 'online' &&
    socket.activeRoom !== null &&
    socket.activeRoom.status !== 'waiting' &&
    socket.activeRoom.status !== 'active';

  const isSoloEnded = playMode === 'solo' && soloOutcome !== null;
  const showGameOverModal = screen === 'playing' && !gameOverDismissed && (isOnlineEnded || isSoloEnded);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0d10]">
      {/* Isolated WebGL Mount Container */}
      <div ref={canvasMountRef} className="fixed inset-0 h-full w-full" />

      {/* Graceful WebGL context-loss fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0d10]/95 p-6 text-center">
          <div className="max-w-sm space-y-2 rounded-xl border border-white/15 bg-[#12151b] p-6">
            <h2 className="font-display text-2xl text-[#f6f2e9]">Graphics Context Interrupted</h2>
            <p className="text-xs text-[#b4aea2]">
              Waiting for the browser WebGL graphics context to restore.
            </p>
          </div>
        </div>
      )}

      {/* Server Toast Notice */}
      {socket.errorNotice && (
        <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[#ef4444]/40 bg-[#1a1315]/95 px-4 py-2 text-xs font-medium text-[#fca5a5] shadow-xl">
          {socket.errorNotice}
        </div>
      )}

      {/* Title Screen */}
      {screen === 'title' && (
        <TitleScreen
          playerName={socket.playerName}
          activeSkin={activeSkin}
          lobby={socket.lobby}
          connected={socket.connected}
          onSelectSkin={handleSelectSkin}
          onQuickPlay={() => setLobbyOpen(true)}
          onOpenLobby={() => setLobbyOpen(true)}
          onPlaySolo={startSoloPractice}
        />
      )}

      {/* Playing HUD */}
      {screen === 'playing' && (
        <>
          <MatchHud
            mode={playMode}
            room={socket.activeRoom}
            soloState={
              playMode === 'solo'
                ? {
                    fen: soloFen,
                    turn: soloChess.turn(),
                    inCheck: soloInCheck,
                    playerColor: 'w',
                    thinking: soloThinking,
                  }
                : undefined
            }
            yourColor={socket.yourColor}
            liveWhiteMs={liveWhiteMs}
            liveBlackMs={liveBlackMs}
            queuedLabel={
              socket.queuedControl ? TIME_CONTROLS[socket.queuedControl].label : null
            }
            onCancelQueue={() => {
              socket.leaveMatchmaking();
              setScreen('title');
            }}
            onRespondDraw={(accept) => {
              if (socket.activeRoom) socket.respondDraw(socket.activeRoom.roomId, accept);
            }}
          />

          <SideDrawer
            activeTab={activeDrawer}
            onChangeTab={setActiveDrawer}
            playerId={socket.playerId}
            hasMatch={playMode === 'online' && socket.activeRoom !== null}
            matchChat={socket.matchChat}
            lobbyChat={socket.lobbyChat}
            moves={currentMoves}
            onSendChat={(channel, text) =>
              socket.sendChat(channel, text, socket.activeRoom?.roomId)
            }
          />

          <BottomDock
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((v) => !v)}
            activeSkin={activeSkin}
            onSelectSkin={handleSelectSkin}
            muted={muted}
            onToggleMute={handleToggleMute}
            onCameraPreset={handleCameraPreset}
            onFlipBoard={handleFlipBoard}
            activeDrawer={activeDrawer}
            onToggleDrawer={(d) => setActiveDrawer((curr) => (curr === d ? null : d))}
            unreadChat={unreadChat}
            canMatchActions={
              playMode === 'online' &&
              socket.activeRoom?.status === 'active' &&
              (socket.yourColor === 'w' || socket.yourColor === 'b')
            }
            drawOfferedBySelf={
              Boolean(
                socket.activeRoom?.drawOfferFrom &&
                  socket.activeRoom.drawOfferFrom === socket.yourColor
              )
            }
            onOfferDraw={() => {
              if (socket.activeRoom) socket.offerDraw(socket.activeRoom.roomId);
            }}
            onResign={() => {
              if (socket.activeRoom) socket.resign(socket.activeRoom.roomId);
            }}
            onExitToMenu={handleExitToMenu}
            showChatButton={playMode === 'online'}
          />
        </>
      )}

      {/* Multiplayer Matchmaking & Private Room Lobby Modal */}
      <LobbyModal
        open={lobbyOpen}
        playerName={socket.playerName}
        connected={socket.connected}
        lobby={socket.lobby}
        queuedControl={socket.queuedControl}
        onClose={() => setLobbyOpen(false)}
        onUpdateName={(name) => socket.updateProfile(name, activeSkin)}
        onJoinMatchmaking={(tc) => {
          socket.joinMatchmaking(tc);
          setPlayMode('online');
          setLobbyOpen(false);
          setScreen('playing');
        }}
        onCancelMatchmaking={socket.leaveMatchmaking}
        onCreatePrivateRoom={(tc) => {
          socket.createPrivateRoom(tc);
        }}
        onJoinRoomByCode={(code) => {
          socket.joinRoomByCode(code);
        }}
        onStartSolo={startSoloPractice}
      />

      {/* Pawn Promotion Picker */}
      <PromotionModal
        open={pendingPromotion !== null}
        color={pendingPromotion?.color ?? 'w'}
        onSelect={(piece) => {
          if (!pendingPromotion) return;
          const { from, to } = pendingPromotion;
          setPendingPromotion(null);
          executeMove(from, to, piece);
        }}
        onCancel={() => {
          setPendingPromotion(null);
          setSelectedSquare(null);
        }}
      />

      {/* Match Conclusion / Rematch Modal */}
      <GameOverModal
        open={showGameOverModal}
        mode={playMode}
        room={socket.activeRoom}
        yourColor={socket.yourColor}
        soloOutcome={soloOutcome}
        onRematch={() => {
          if (playMode === 'solo') {
            startSoloPractice();
          } else if (socket.activeRoom) {
            socket.requestRematch(socket.activeRoom.roomId);
          }
        }}
        onFindNewMatch={() => {
          if (playMode === 'online' && socket.activeRoom) {
            socket.leaveRoom();
          }
          setGameOverDismissed(true);
          setLobbyOpen(true);
        }}
        onCloseToInspect={() => setGameOverDismissed(true)}
      />
    </div>
  );
}
