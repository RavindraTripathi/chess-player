import type { GameRoomState, PlayerColor } from '../shared/protocol';

interface PromotionModalProps {
  open: boolean;
  color: PlayerColor;
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

const PROMO_PIECES: Array<{ id: 'q' | 'r' | 'b' | 'n'; label: string; symbolW: string; symbolB: string }> = [
  { id: 'q', label: 'Queen', symbolW: '♕', symbolB: '♛' },
  { id: 'r', label: 'Rook', symbolW: '♖', symbolB: '♜' },
  { id: 'b', label: 'Bishop', symbolW: '♗', symbolB: '♝' },
  { id: 'n', label: 'Knight', symbolW: '♘', symbolB: '♞' },
];

export function PromotionModal({ open, color, onSelect, onCancel }: PromotionModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-2xl border border-white/12 bg-[#12151b] p-5 shadow-2xl">
        <h3 className="font-display text-xl font-semibold text-[#f6f2e9]">Promote Pawn</h3>
        <p className="mt-1 text-xs text-[#9e978c]">Choose the piece to promote into.</p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {PROMO_PIECES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className="flex flex-col items-center justify-center rounded-xl border border-white/12 bg-[#181c24] py-3 text-center hover:border-[#c8a25a] hover:bg-[#1f242f] cursor-pointer"
            >
              <span className="text-2xl leading-none text-[#f3efe6]">
                {color === 'w' ? p.symbolW : p.symbolB}
              </span>
              <span className="mt-1.5 text-[11px] font-medium text-[#c5bfb3]">{p.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-lg border border-white/10 py-2 text-xs text-[#9e978c] hover:text-white cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface GameOverModalProps {
  open: boolean;
  mode: 'online' | 'solo';
  room: GameRoomState | null;
  yourColor: PlayerColor | 'spectator' | null;
  soloOutcome?: { title: string; subtitle: string } | null;
  onRematch: () => void;
  onFindNewMatch: () => void;
  onCloseToInspect: () => void;
}

export function GameOverModal({
  open,
  mode,
  room,
  yourColor,
  soloOutcome,
  onRematch,
  onFindNewMatch,
  onCloseToInspect,
}: GameOverModalProps) {
  if (!open) return null;

  let title = 'Match Concluded';
  let subtitle = '';
  let rematchVoted = false;
  let opponentVoted = false;

  if (mode === 'solo' && soloOutcome) {
    title = soloOutcome.title;
    subtitle = soloOutcome.subtitle;
  } else if (room) {
    if (room.winner === 'draw') {
      title = 'Draw';
    } else if (yourColor === 'w' || yourColor === 'b') {
      title = room.winner === yourColor ? 'Victory' : 'Defeat';
    } else {
      title = room.winner === 'w' ? 'White Wins' : 'Black Wins';
    }
    subtitle = room.endReason ?? 'Game ended';
    if (yourColor === 'w' || yourColor === 'b') {
      rematchVoted = room.rematchVotes.includes(yourColor);
      opponentVoted = room.rematchVotes.includes(yourColor === 'w' ? 'b' : 'w');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#12151b] p-6 text-center shadow-2xl">
        <div className="text-xs font-medium tracking-[0.18em] text-[#c8a25a] uppercase">
          {mode === 'solo' ? 'Solo Practice' : 'Online Match'}
        </div>
        <h2 className="mt-2 font-display text-4xl font-semibold text-[#f6f2e9]">{title}</h2>
        <p className="mt-1.5 text-sm text-[#b4aea2]">{subtitle}</p>

        <div className="mt-6 flex flex-col gap-2.5">
          {(mode === 'solo' || yourColor === 'w' || yourColor === 'b') && (
            <button
              type="button"
              disabled={rematchVoted}
              onClick={onRematch}
              className="w-full rounded-lg bg-[#c8a25a] px-4 py-2.5 text-sm font-semibold text-[#111215] hover:bg-[#d6b36f] disabled:opacity-65 cursor-pointer"
            >
              {rematchVoted
                ? 'Rematch Requested (Waiting...)'
                : opponentVoted
                  ? 'Accept Rematch'
                  : mode === 'solo'
                    ? 'Play Again'
                    : 'Request Rematch'}
            </button>
          )}

          <button
            type="button"
            onClick={onFindNewMatch}
            className="w-full rounded-lg border border-white/15 bg-[#181c24] px-4 py-2.5 text-sm font-medium text-[#f3efe6] hover:bg-[#1f242e] cursor-pointer"
          >
            {mode === 'solo' ? 'Find Online Match' : 'New Match'}
          </button>

          <button
            type="button"
            onClick={onCloseToInspect}
            className="w-full rounded-lg py-2 text-xs font-medium text-[#9e978c] hover:text-white cursor-pointer"
          >
            Inspect 3D Board
          </button>
        </div>
      </div>
    </div>
  );
}
