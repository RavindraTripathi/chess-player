import { Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, MoveRecord } from '../shared/protocol';

interface SideDrawerProps {
  activeTab: 'chat' | 'moves' | null;
  onChangeTab: (tab: 'chat' | 'moves' | null) => void;
  playerId: string;
  hasMatch: boolean;
  matchChat: ChatMessage[];
  lobbyChat: ChatMessage[];
  moves: MoveRecord[];
  onSendChat: (channel: 'match' | 'lobby', text: string) => void;
}

const QUICK_PHRASES = ['Good luck!', 'Nice move', 'Well played', 'Good game'];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function SideDrawer({
  activeTab,
  onChangeTab,
  playerId,
  hasMatch,
  matchChat,
  lobbyChat,
  moves,
  onSendChat,
}: SideDrawerProps) {
  const [chatChannel, setChatChannel] = useState<'match' | 'lobby'>(hasMatch ? 'match' : 'lobby');
  const [draft, setDraft] = useState('');
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setChatChannel(hasMatch ? 'match' : 'lobby');
  }, [hasMatch]);

  const messages = chatChannel === 'match' && hasMatch ? matchChat : lobbyChat;

  useEffect(() => {
    if (activeTab === 'chat') {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeTab]);

  if (!activeTab) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendChat(chatChannel === 'match' && hasMatch ? 'match' : 'lobby', draft);
    setDraft('');
  };

  // Pair moves into classical chess notation rows: [ply1, ply2]
  const moveRows: Array<{ moveNumber: number; white?: MoveRecord; black?: MoveRecord }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    moveRows.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  return (
    <aside className="fixed top-5 right-5 bottom-24 z-25 flex w-[min(340px,90vw)] flex-col overflow-hidden rounded-xl border border-white/12 bg-[#12151b]/95 shadow-2xl">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-1 rounded-lg bg-[#191d25] p-1">
          <button
            type="button"
            onClick={() => onChangeTab('chat')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-[#c8a25a] text-[#111215]'
                : 'text-[#b4aea2] hover:text-[#f3efe6]'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('moves')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'moves'
                ? 'bg-[#c8a25a] text-[#111215]'
                : 'text-[#b4aea2] hover:text-[#f3efe6]'
            }`}
          >
            Moves ({moves.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => onChangeTab(null)}
          aria-label="Close drawer"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9e978c] hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {activeTab === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {hasMatch && (
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2 text-xs">
              <button
                type="button"
                onClick={() => setChatChannel('match')}
                className={`font-medium cursor-pointer ${
                  chatChannel === 'match' ? 'text-[#e5be73]' : 'text-[#8c867c] hover:text-[#d6d0c4]'
                }`}
              >
                Match Chat
              </button>
              <span aria-hidden="true" className="text-[#4a4740]">·</span>
              <button
                type="button"
                onClick={() => setChatChannel('lobby')}
                className={`font-medium cursor-pointer ${
                  chatChannel === 'lobby' ? 'text-[#e5be73]' : 'text-[#8c867c] hover:text-[#d6d0c4]'
                }`}
              >
                Global Lobby
              </button>
            </div>
          )}

          {/* Messages Feed */}
          <div className="chess-scroll flex-1 space-y-2.5 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#7c776e]">
                No messages yet. Say hello to start the conversation.
              </div>
            ) : (
              messages.map((m) => {
                const isSystem = m.senderId === 'system';
                const isSelf = m.senderId === playerId;
                if (isSystem) {
                  return (
                    <div key={m.id} className="py-1 text-center text-xs text-[#9c968b]">
                      {m.text}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                    <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-[#8c867c]">
                      <span className="font-medium text-[#c5bfb3]">{isSelf ? 'You' : m.senderName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatTime(m.timestamp)}</span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] leading-snug break-words ${
                        isSelf
                          ? 'bg-[#c8a25a]/20 text-[#f6f2e9] border border-[#c8a25a]/30'
                          : 'bg-[#1b1f27] text-[#e3ddd0] border border-white/8'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={feedEndRef} />
          </div>

          {/* Quick Emotes / Tactical Phrases */}
          <div className="flex flex-wrap gap-1.5 border-t border-white/8 px-3 py-2">
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => onSendChat(chatChannel === 'match' && hasMatch ? 'match' : 'lobby', phrase)}
                className="rounded-md border border-white/10 bg-[#181b22] px-2 py-1 text-[11px] font-medium text-[#c5bfb3] hover:border-white/25 hover:text-white cursor-pointer"
              >
                {phrase}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 p-3">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={280}
              placeholder={chatChannel === 'match' && hasMatch ? 'Message opponent...' : 'Message global lobby...'}
              className="min-w-0 flex-1 rounded-lg border border-white/12 bg-[#0e1015] px-3 py-2 text-xs text-[#f3efe6] placeholder-[#6e6a61] focus:border-[#c8a25a] focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send message"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c8a25a] text-[#111215] hover:bg-[#d6b36f] cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="chess-scroll flex-1 overflow-y-auto px-4 py-3">
          {moveRows.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#7c776e]">
              No moves played yet. Select any White piece to begin.
            </div>
          ) : (
            <div className="space-y-1 font-mono text-xs tabular-nums">
              {moveRows.map((row) => (
                <div
                  key={row.moveNumber}
                  className="grid grid-cols-[40px_1fr_1fr] items-center rounded-md px-2 py-1.5 odd:bg-white/[0.03]"
                >
                  <span className="text-[#7c776e]">{row.moveNumber}.</span>
                  <span className="font-medium text-[#f3efe6]">{row.white?.san ?? ''}</span>
                  <span className="font-medium text-[#c5bfb3]">{row.black?.san ?? ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
