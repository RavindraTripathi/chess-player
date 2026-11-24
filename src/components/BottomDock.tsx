import {
  ChevronDown,
  ChevronUp,
  Eye,
  Flag,
  Handshake,
  History,
  LogOut,
  MessageSquare,
  Palette,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import { SKIN_LIST } from '../chess3d/skins';
import type { CameraPreset } from '../chess3d/ChessSceneManager';
import type { SkinId } from '../shared/protocol';

interface BottomDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeSkin: SkinId;
  onSelectSkin: (skin: SkinId) => void;
  muted: boolean;
  onToggleMute: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onFlipBoard: () => void;
  activeDrawer: 'chat' | 'moves' | null;
  onToggleDrawer: (drawer: 'chat' | 'moves') => void;
  unreadChat: number;
  canMatchActions: boolean;
  drawOfferedBySelf: boolean;
  onOfferDraw?: () => void;
  onResign?: () => void;
  onExitToMenu: () => void;
  showChatButton: boolean;
}

export function BottomDock({
  collapsed,
  onToggleCollapse,
  activeSkin,
  onSelectSkin,
  muted,
  onToggleMute,
  onCameraPreset,
  onFlipBoard,
  activeDrawer,
  onToggleDrawer,
  unreadChat,
  canMatchActions,
  drawOfferedBySelf,
  onOfferDraw,
  onResign,
  onExitToMenu,
  showChatButton,
}: BottomDockProps) {
  const [skinsOpen, setSkinsOpen] = useState(false);

  return (
    <div
      className={`pointer-events-none fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%-30px)]' : 'translate-y-0'
      }`}
    >
      {/* Skin Vault Popover above dock */}
      {!collapsed && skinsOpen && (
        <div className="pointer-events-auto mb-2 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#12151b]/95 p-2.5 shadow-2xl">
          {SKIN_LIST.map((skin) => {
            const isSelected = skin.id === activeSkin;
            return (
              <button
                key={skin.id}
                type="button"
                onClick={() => {
                  onSelectSkin(skin.id);
                  setSkinsOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'border-[#c8a25a] bg-[#1d2129] text-[#f6f2e9]'
                    : 'border-white/10 bg-[#161920] text-[#b4aea2] hover:border-white/25 hover:text-[#f3efe6]'
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
      )}

      {/* Collapse / Expand tab */}
      <button
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}
        className="pointer-events-auto flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/12 bg-[#12151b]/95 px-3 py-1 text-[11px] font-medium text-[#b4aea2] hover:text-[#f3efe6] cursor-pointer whitespace-nowrap"
      >
        {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <span>{collapsed ? 'Controls' : 'Hide'}</span>
      </button>

      {/* Main Consolidated Bottom Dock */}
      <div className="pointer-events-auto flex max-w-[94vw] items-center gap-1.5 overflow-x-auto rounded-xl border border-white/12 bg-[#12151b]/95 px-3 py-2 shadow-2xl">
        {/* Camera Presets */}
        <button
          type="button"
          onClick={() => onCameraPreset('player')}
          title="Player Camera"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[#d6d0c4] hover:bg-white/8 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          <Eye className="h-3.5 w-3.5 text-[#c8a25a]" />
          <span>View</span>
        </button>

        <button
          type="button"
          onClick={() => onCameraPreset('top')}
          title="Top-Down View"
          className="inline-flex h-9 items-center rounded-lg px-2.5 text-xs font-medium text-[#b4aea2] hover:bg-white/8 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          <span>Top</span>
        </button>

        <button
          type="button"
          onClick={onFlipBoard}
          title="Flip Board"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[#b4aea2] hover:bg-white/8 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>Flip</span>
        </button>

        <div aria-hidden="true" className="mx-1 h-5 w-px bg-white/10 shrink-0" />

        {/* Custom Skins Trigger */}
        <button
          type="button"
          onClick={() => setSkinsOpen((v) => !v)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            skinsOpen
              ? 'bg-[#c8a25a]/20 text-[#e8c682]'
              : 'text-[#d6d0c4] hover:bg-white/8 hover:text-white'
          }`}
        >
          <Palette className="h-3.5 w-3.5 text-[#c8a25a]" />
          <span>Skins</span>
        </button>

        {/* Audio Mute */}
        <button
          type="button"
          onClick={onToggleMute}
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
          aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#b4aea2] hover:bg-white/8 hover:text-white cursor-pointer shrink-0"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        <div aria-hidden="true" className="mx-1 h-5 w-px bg-white/10 shrink-0" />

        {/* Move Notation Drawer */}
        <button
          type="button"
          onClick={() => onToggleDrawer('moves')}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeDrawer === 'moves'
              ? 'bg-[#c8a25a] text-[#111215]'
              : 'text-[#d6d0c4] hover:bg-white/8 hover:text-white'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Moves</span>
        </button>

        {/* Chat Drawer */}
        {showChatButton && (
          <button
            type="button"
            onClick={() => onToggleDrawer('chat')}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeDrawer === 'chat'
                ? 'bg-[#c8a25a] text-[#111215]'
                : 'text-[#d6d0c4] hover:bg-white/8 hover:text-white'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Chat</span>
            {unreadChat > 0 && activeDrawer !== 'chat' && (
              <span className="font-mono text-[11px] font-semibold text-[#e5be73] tabular-nums">
                ({unreadChat})
              </span>
            )}
          </button>
        )}

        {/* Match Actions */}
        {canMatchActions && (
          <>
            <div aria-hidden="true" className="mx-1 h-5 w-px bg-white/10 shrink-0" />
            {onOfferDraw && (
              <button
                type="button"
                disabled={drawOfferedBySelf}
                onClick={onOfferDraw}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[#b4aea2] hover:bg-white/8 hover:text-white disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Handshake className="h-3.5 w-3.5" />
                <span>{drawOfferedBySelf ? 'Draw Sent' : 'Draw'}</span>
              </button>
            )}
            {onResign && (
              <button
                type="button"
                onClick={onResign}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[#fca5a5] hover:bg-[#ef4444]/15 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Flag className="h-3.5 w-3.5" />
                <span>Resign</span>
              </button>
            )}
          </>
        )}

        <div aria-hidden="true" className="mx-1 h-5 w-px bg-white/10 shrink-0" />

        <button
          type="button"
          onClick={onExitToMenu}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[#b4aea2] hover:bg-white/8 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Menu</span>
        </button>
      </div>
    </div>
  );
}
