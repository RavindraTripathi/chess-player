import type { LobbyPresence, SkinId } from '../shared/protocol';
import { SKIN_LIST } from '../chess3d/skins';

interface TitleScreenProps {
  playerName: string;
  activeSkin: SkinId;
  lobby: LobbyPresence;
  connected: boolean;
  onSelectSkin: (skin: SkinId) => void;
  onQuickPlay: () => void;
  onOpenLobby: () => void;
  onPlaySolo: () => void;
}

export function TitleScreen({
  playerName,
  activeSkin,
  lobby,
  connected,
  onSelectSkin,
  onQuickPlay,
  onOpenLobby,
  onPlaySolo,
}: TitleScreenProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10">
      {/* Subtle left atmospheric gradient scrim for crisp serif legibility without blurring WebGL */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-0 w-full max-w-2xl bg-gradient-to-r from-[#0b0d10]/90 via-[#0b0d10]/55 to-transparent"
      />

      {/* Top metadata line (unboxed, clean typographic separators) */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs tracking-wide text-[#c5bfb3]">
          <span className="font-medium text-[#f3efe6]">{playerName}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {connected ? `${lobby.onlineCount} online` : 'Connecting'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{lobby.activeGamesCount} active matches</span>
        </div>
      </div>

      {/* Left-side editorial lockup leaving 65%+ viewport open to showcase the live 3D board */}
      <div className="pointer-events-auto relative z-10 my-auto max-w-md space-y-6">
        <div className="space-y-3">
          {/* Bespoke inline SVG crown/king emblem + title lockup */}
          <div className="flex items-center gap-3.5">
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[#c8a25a]"
            >
              <path
                d="M20 4V11M16.5 7.5H23.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 16C12 12.686 15.582 11 20 11C24.418 11 28 12.686 28 16C28 19.5 25.5 22.5 24.5 27H15.5C14.5 22.5 12 19.5 12 16Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path
                d="M12 31.5H28M10.5 35H29.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-medium tracking-[0.22em] text-[#c8a25a] uppercase">
              Three-Dimensional Arena
            </span>
          </div>

          <h1
            className="font-display text-5xl font-semibold leading-[1.02] tracking-tight text-[#f6f2e9] md:text-6xl"
            style={{ textWrap: 'balance' }}
          >
            Sovereign Chess
          </h1>

          <p className="max-w-sm text-sm leading-relaxed text-[#b9b3a7]">
            Real-time multiplayer chess sculpted in physical wood, marble, brushed brass, and optical crystal.
          </p>
        </div>

        {/* Primary & Secondary Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onQuickPlay}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#c8a25a] px-6 py-2.5 text-sm font-semibold text-[#111215] transition-transform duration-150 hover:bg-[#d6b36f] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8a25a] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Find Online Match
          </button>

          <button
            type="button"
            onClick={onOpenLobby}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 bg-[#15181e]/95 px-5 py-2.5 text-sm font-medium text-[#f3efe6] transition-colors duration-150 hover:border-white/30 hover:bg-[#1c2028] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Private Room
          </button>

          <button
            type="button"
            onClick={onPlaySolo}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-[#c5bfb3] transition-colors duration-150 hover:border-white/25 hover:text-[#f3efe6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Solo vs Engine
          </button>
        </div>

        {/* Live 3D Skin Showcase Selector */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center gap-2 text-xs text-[#9c968b]">
            <span>Board Finish</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#e3ddd0]">
              {SKIN_LIST.find((s) => s.id === activeSkin)?.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SKIN_LIST.map((skin) => {
              const selected = skin.id === activeSkin;
              return (
                <button
                  key={skin.id}
                  type="button"
                  onClick={() => onSelectSkin(skin.id)}
                  title={`${skin.name} — ${skin.subtitle}`}
                  aria-label={`Select ${skin.name} skin`}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    selected
                      ? 'border-[#c8a25a] bg-[#1b1f26] text-[#f6f2e9]'
                      : 'border-white/10 bg-[#12151a]/90 text-[#b4aea2] hover:border-white/25 hover:text-[#f3efe6]'
                  }`}
                >
                  <span className="flex items-center -space-x-1">
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/40"
                      style={{ backgroundColor: skin.swatchWhite }}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-white/20"
                      style={{ backgroundColor: skin.swatchBlack }}
                    />
                  </span>
                  <span>{skin.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="relative z-10 flex items-center justify-between text-xs text-[#8f897e]">
        <span>Enter Play Online · Drag Orbit · Scroll Zoom · Click Piece to Move</span>
      </div>
    </div>
  );
}
