import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { GameRoomState, PlayerColor } from '../shared/protocol';

interface MatchHudProps {
  mode: 'online' | 'solo';
  room: GameRoomState | null;
  soloState?: {
    fen: string;
    turn: PlayerColor;
    inCheck: boolean;
    playerColor: PlayerColor;
    thinking: boolean;
  };
  yourColor: PlayerColor | 'spectator' | null;
  liveWhiteMs: number;
  liveBlackMs: number;
  onRespondDraw?: (accept: boolean) => void;
  onCancelQueue?: () => void;
  queuedLabel?: string | null;
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MatchHud({
  mode,
  room,
  soloState,
  yourColor,
  liveWhiteMs,
  liveBlackMs,
  onRespondDraw,
  onCancelQueue,
  queuedLabel,
}: MatchHudProps) {
  const [copied, setCopied] = useState(false);

  if (queuedLabel) {
    return (
      <div className="pointer-events-none fixed top-5 left-5 z-20 flex items-center gap-4">
        <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-white/10 bg-[#12151b]/95 px-4 py-3 text-sm">
          <div>
            <div className="font-medium text-[#f3efe6]">Searching for opponent</div>
            <div className="text-xs text-[#9e978c]">{queuedLabel} queue</div>
          </div>
          {onCancelQueue && (
            <button
              type="button"
              onClick={onCancelQueue}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-[#e3ddd0] hover:border-white/30 hover:bg-white/5 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'solo' && soloState) {
    const isYourTurn = soloState.turn === soloState.playerColor;
    return (
      <div className="pointer-events-none fixed top-5 left-5 right-5 z-20 flex items-start justify-between gap-4">
        <div className="pointer-events-auto rounded-xl border border-white/10 bg-[#12151b]/95 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm font-medium text-[#f3efe6]">
            <span>Solo Practice vs Engine</span>
            <span aria-hidden="true" className="text-[#6f6a61]">·</span>
            <span className={isYourTurn ? 'text-[#c8a25a]' : 'text-[#9e978c]'}>
              {soloState.thinking
                ? 'Engine thinking'
                : isYourTurn
                  ? 'Your turn (White)'
                  : 'Engine turn (Black)'}
            </span>
          </div>
          {soloState.inCheck && (
            <div className="mt-1 text-xs font-medium text-[#f87171]">Check on the board</div>
          )}
        </div>
      </div>
    );
  }

  if (!room) return null;

  const isTimed = room.timeControl !== 'unlimited';
  const topColor: PlayerColor = yourColor === 'b' ? 'w' : 'b';
  const bottomColor: PlayerColor = yourColor === 'b' ? 'b' : 'w';

  const topSlot = topColor === 'w' ? room.white : room.black;
  const bottomSlot = bottomColor === 'w' ? room.white : room.black;
  const topTime = topColor === 'w' ? liveWhiteMs : liveBlackMs;
  const bottomTime = bottomColor === 'w' ? liveWhiteMs : liveBlackMs;

  const copyInvite = async () => {
    const url = `${window.location.origin}?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="pointer-events-none fixed top-5 left-5 right-5 z-20 flex flex-wrap items-start justify-between gap-3">
      {/* Compact Player & Clock Cluster (top-left) */}
      <div className="pointer-events-auto flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#12151b]/95 px-4 py-2.5">
          {/* Top / Opponent */}
          <div className="flex items-center gap-2.5">
            <span
              className={`h-3 w-3 rounded-sm border ${
                topColor === 'w' ? 'border-white/40 bg-[#ebe4d5]' : 'border-white/25 bg-[#1e2128]'
              }`}
            />
            <span className="max-w-[140px] truncate text-sm font-medium text-[#f3efe6]">
              {topSlot ? topSlot.name : 'Waiting for opponent'}
            </span>
            {topSlot && !topSlot.connected && (
              <span className="text-xs text-[#f59e0b]">Disconnected</span>
            )}
            {isTimed && (
              <span
                className={`ml-1 font-mono text-sm font-semibold tabular-nums ${
                  room.status === 'active' && room.turn === topColor
                    ? 'text-[#c8a25a]'
                    : 'text-[#8c867c]'
                }`}
              >
                {formatClock(topTime)}
              </span>
            )}
          </div>

          <span aria-hidden="true" className="text-xs text-[#59554d]">vs</span>

          {/* Bottom / Self */}
          <div className="flex items-center gap-2.5">
            <span
              className={`h-3 w-3 rounded-sm border ${
                bottomColor === 'w' ? 'border-white/40 bg-[#ebe4d5]' : 'border-white/25 bg-[#1e2128]'
              }`}
            />
            <span className="max-w-[140px] truncate text-sm font-medium text-[#f3efe6]">
              {bottomSlot ? bottomSlot.name : 'Waiting'}
            </span>
            {isTimed && (
              <span
                className={`ml-1 font-mono text-sm font-semibold tabular-nums ${
                  room.status === 'active' && room.turn === bottomColor
                    ? 'text-[#c8a25a]'
                    : 'text-[#8c867c]'
                }`}
              >
                {formatClock(bottomTime)}
              </span>
            )}
          </div>

          <span aria-hidden="true" className="text-[#59554d]">·</span>

          <span className="text-xs font-medium text-[#c5bfb3]">
            {room.status === 'waiting'
              ? 'Waiting'
              : room.status !== 'active'
                ? room.endReason || 'Game Over'
                : room.turn === yourColor
                  ? 'Your Turn'
                  : yourColor === 'spectator'
                    ? `${room.turn === 'w' ? 'White' : 'Black'} to Move`
                    : 'Opponent Turn'}
            {room.inCheck && room.status === 'active' ? ' · Check' : ''}
          </span>
        </div>

        {/* Waiting Room Invite Code */}
        {room.status === 'waiting' && (
          <div className="flex items-center gap-3 rounded-xl border border-[#c8a25a]/40 bg-[#15181f]/95 px-4 py-2.5 text-xs">
            <span className="text-[#b9b3a7]">Room Code:</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-[#e5be73] tabular-nums">
              {room.code}
            </span>
            <button
              type="button"
              onClick={copyInvite}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#f3efe6] hover:bg-white/10 cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#34d399]" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied Link' : 'Copy Invite'}</span>
            </button>
          </div>
        )}

        {/* Incoming Draw Offer Banner */}
        {room.status === 'active' &&
          room.drawOfferFrom &&
          room.drawOfferFrom !== yourColor &&
          yourColor !== 'spectator' &&
          onRespondDraw && (
            <div className="flex items-center gap-3 rounded-xl border border-[#c8a25a]/50 bg-[#171a22]/95 px-4 py-2.5 text-xs">
              <span className="text-[#f3efe6]">Opponent offered a draw</span>
              <button
                type="button"
                onClick={() => onRespondDraw(true)}
                className="rounded-md bg-[#c8a25a] px-2.5 py-1 font-semibold text-[#111215] hover:bg-[#d6b36f] cursor-pointer"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => onRespondDraw(false)}
                className="rounded-md border border-white/15 px-2.5 py-1 font-medium text-[#c5bfb3] hover:bg-white/5 cursor-pointer"
              >
                Decline
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
