import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { api } from '../api/client';
import { Button } from './ui/Button';

interface AIChatPanelProps {
  sessionId: string;
  defaultMode?: 'quick' | 'standard' | 'max';
}

interface ChatMessage {
  role: 'user' | 'system';
  content: string;
  timestamp: string;
  filesChanged?: string[];
}

export function AIChatPanel({ sessionId, defaultMode }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'quick' | 'standard' | 'max'>(defaultMode || 'quick');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const result = await api.chatMessage(sessionId, trimmed, mode);
      const systemMsg: ChatMessage = {
        role: 'system',
        content: result.output || 'Done.',
        timestamp: new Date().toISOString(),
        filesChanged: result.files_changed,
      };
      setMessages(prev => [...prev, systemMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: 'system',
        content: `Error: ${err instanceof Error ? err.message : 'Request failed'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 terminal-scroll">
        {messages.length === 0 && (
          <div className="text-xs text-muted text-center py-8">
            Send a message to iterate on your project.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-primary/10 text-ink'
                  : 'bg-hover text-ink'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.filesChanged && msg.filesChanged.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <span className="text-xs text-muted font-semibold uppercase">Files changed:</span>
                  <ul className="mt-1 space-y-0.5">
                    {msg.filesChanged.map((f, j) => (
                      <li key={j} className="text-xs font-mono text-muted">{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-hover text-ink rounded-lg px-3 py-2 text-xs">
              Building<span className="animate-pulse">...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-2 flex-shrink-0">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-2">
          {(['quick', 'standard', 'max'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-btn transition-colors capitalize ${
                mode === m ? 'bg-primary text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {/* Input + send */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask AI to modify your project..."
            className="flex-1 px-3 py-1.5 text-xs bg-card border border-border rounded-btn outline-none focus:border-primary transition-colors"
            disabled={sending}
          />
          <Button
            size="sm"
            icon={Send}
            onClick={handleSend}
            disabled={sending || !input.trim()}
            aria-label="Send message"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
