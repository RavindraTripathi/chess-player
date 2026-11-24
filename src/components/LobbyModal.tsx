import { Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { TIME_CONTROLS, type LobbyPresence, type TimeControlId } from '../shared/protocol';

interface LobbyModalProps {
  open: boolean;
  playerName: string;
  connected: boolean;
  lobby: LobbyPresence;
  queuedControl: TimeControlId | null;
  onClose: () => void;
  onUpdateName: (name: string) => void;
  onJoinMatchmaking: (tc: TimeControlId) => void;
  onCancelMatchmaking: () => void;
  onCreatePrivateRoom: (tc: TimeControlId) => void;
  onJoinRoomByCode: (code: string) => void;
  onStartSolo: () => void;
}

const TIME_ORDER: TimeControlId[] = ['3+2', '5+0', '10+0', 'unlimited'];

export function LobbyModal({
  open,
  playerName,
  connected,
  lobby,
  queuedControl,
  onClose,
  onUpdateName,
  onJoinMatchmaking,
  onCancelMatchmaking,
  onCreatePrivateRoom,
  onJoinRoomByCode,
  onStartSolo,
}: LobbyModalProps) {
  const [nameInput, setNameInput] = useState(playerName);
  const [selectedTime, setSelectedTime] = useState<TimeControlId>('5+0');
  const [roomCode, setRoomCode] = useState('');

  if (!open) return null;

  const commitName = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length >= 2 && trimmed !== playerName) {
      onUpdateName(trimmed);
    }
  };

  const handleJoinCode = (e: FormEvent) => {
    e.preventDefault();
    commitName();
    if (roomCode.trim().length >= 4) {
      onJoinRoomByCode(roomCode.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/12 bg-[#12151b] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#f6f2e9]">
              Multiplayer Lobby
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-[#9e978c]">
              <Users className="h-3.5 w-3.5 text-[#c8a25a]" />
              <span className="tabular-nums">
                {connected ? `${lobby.onlineCount} players online` : 'Connecting to server...'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{lobby.activeGamesCount} active games</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close lobby"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9e978c] hover:bg-white/8 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Player Display Name */}
          <div className="space-y-1.5">
            <label htmlFor="player-name-input" className="block text-xs font-medium text-[#b9b3a7]">
              Player Name
            </label>
            <input
              id="player-name-input"
              type="text"
              maxLength={22}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitName}
              className="w-full rounded-lg border border-white/12 bg-[#0c0e13] px-3.5 py-2 text-sm text-[#f3efe6] focus:border-[#c8a25a] focus:outline-none"
            />
          </div>

          {/* Time Control Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#b9b3a7]">
              <span className="font-medium">Time Control</span>
              <span className="text-[#8c867c]">Live matchmaking queue</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIME_ORDER.map((tcId) => {
                const spec = TIME_CONTROLS[tcId];
                const active = selectedTime === tcId;
                const qCount = lobby.queuedByControl[tcId] ?? 0;
                return (
                  <button
                    key={tcId}
                    type="button"
                    onClick={() => setSelectedTime(tcId)}
                    className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#c8a25a] bg-[#1d2129] text-[#f6f2e9]'
                        : 'border-white/10 bg-[#161920] text-[#b4aea2] hover:border-white/25'
                    }`}
                  >
                    <span className="text-xs font-semibold">{spec.label}</span>
                    <span className="mt-0.5 text-[11px] text-[#8c867c] tabular-nums">
                      {qCount > 0 ? `${qCount} in queue` : spec.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Matchmaking Action */}
          {queuedControl ? (
            <div className="flex items-center justify-between rounded-xl border border-[#c8a25a]/45 bg-[#1b1f26] px-4 py-3">
              <div>
                <div className="text-sm font-medium text-[#f3efe6]">
                  Queued for {TIME_CONTROLS[queuedControl].label}
                </div>
                <div className="text-xs text-[#9e978c]">
                  Waiting for a matching player to connect...
                </div>
              </div>
              <button
                type="button"
                onClick={onCancelMatchmaking}
                className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium text-[#f3efe6] hover:bg-white/8 cursor-pointer"
              >
                Leave Queue
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!connected}
              onClick={() => {
                commitName();
                onJoinMatchmaking(selectedTime);
              }}
              className="w-full rounded-lg bg-[#c8a25a] px-4 py-3 text-sm font-semibold text-[#111215] transition-colors hover:bg-[#d6b36f] disabled:opacity-50 cursor-pointer"
            >
              Find Online Opponent ({TIME_CONTROLS[selectedTime].label})
            </button>
          )}

          {/* Private Room Create & Join */}
          <div className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={!connected}
              onClick={() => {
                commitName();
                onCreatePrivateRoom(selectedTime);
              }}
              className="rounded-lg border border-white/15 bg-[#171a22] px-4 py-2.5 text-xs font-semibold text-[#f3efe6] hover:border-white/30 hover:bg-[#1e222c] disabled:opacity-50 cursor-pointer"
            >
              Create Private Room
            </button>

            <form onSubmit={handleJoinCode} className="flex items-center gap-2">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="Room Code"
                className="min-w-0 flex-1 rounded-lg border border-white/12 bg-[#0c0e13] px-3 py-2 font-mono text-xs tracking-wider text-[#f3efe6] uppercase placeholder-[#6e6a61] focus:border-[#c8a25a] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!connected || roomCode.trim().length < 4}
                className="rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-xs font-semibold text-[#f3efe6] hover:bg-white/14 disabled:opacity-45 cursor-pointer"
              >
                Join
              </button>
            </form>
          </div>

          <div className="flex items-center justify-between border-t border-white/8 pt-3 text-xs text-[#8c867c]">
            <span>Open a second tab to test live 2-player matchmaking</span>
            <button
              type="button"
              onClick={() => {
                commitName();
                onStartSolo();
              }}
              className="font-medium text-[#c8a25a] hover:underline cursor-pointer"
            >
              Solo vs Engine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
