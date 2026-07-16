'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  isError?: boolean;
}

interface SupportResponse {
  message?: string;
  error?: string;
}

const STORAGE_KEY = 'injpass_support_chat_v2';

const INTRO_MESSAGE: ChatMessage = {
  id: 'intro',
  role: 'assistant',
  content:
    'I am Eric. Ask me about INJ Pass, Injective, DeFi strategy, or what to do next.',
};

const SHORTCUT_POOL = [
  'What is INJ Pass?',
  'Why Injective?',
  'Wallet security basics',
  'Explain AgentOS',
  'DeFi strategy',
  'Bear market playbook',
  'Passkeys vs seed phrases',
  'How to start safely?',
  'What should I build?',
  'RWA on Injective',
  'Finance L1 thesis',
  'Avoid wallet mistakes',
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function pickShortcuts(): string[] {
  return [...SHORTCUT_POOL]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
}

function SendIcon({ className = 'text-white' }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m6.75 10.25 5.25-5.25 5.25 5.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.1 7.1A7 7 0 1 1 6 15.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 3.8v3.5h3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7l10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SupportAvatar({ isLight }: { isLight: boolean }) {
  return (
    <div
      className={`relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border shadow-sm ${
        isLight
          ? 'border-black/10 bg-white'
          : 'border-white/12 bg-white/[0.06]'
      }`}
      aria-hidden="true"
    >
      <Image
        src="/Eric.png"
        alt="Eric avatar"
        fill
        sizes="96px"
        quality={100}
        className="scale-[1.8] object-cover object-center [object-position:center_32%]"
      />
    </div>
  );
}

function SupportHeaderAvatar({ isLight }: { isLight: boolean }) {
  return (
    <div
      className={`relative mr-3 h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border shadow-sm ${
        isLight
          ? 'border-black/10 bg-white'
          : 'border-white/12 bg-white/[0.06]'
      }`}
      aria-hidden="true"
    >
      <Image
        src="/Eric.png"
        alt="Eric avatar"
        fill
        sizes="96px"
        quality={100}
        className="scale-[1.45] object-cover object-center [object-position:center_30%]"
      />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Eric is thinking">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-160ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-80ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

function readStoredMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [INTRO_MESSAGE];
    }

    const parsed = JSON.parse(raw) as ChatMessage[];
    const messages = Array.isArray(parsed)
      ? parsed.filter((message) => (
          message
          && (message.role === 'user' || message.role === 'assistant')
          && typeof message.content === 'string'
          && message.content.trim()
        ))
      : [];

    return messages.length > 0 ? messages : [INTRO_MESSAGE];
  } catch {
    return [INTRO_MESSAGE];
  }
}

export default function SupportChat() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE]);
  const [shortcuts, setShortcuts] = useState<string[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [hideForEmbeddedSurface, setHideForEmbeddedSurface] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const usesSidebarLauncher = pathname === '/' || pathname === '/welcome' || pathname === '/dashboard';

  useEffect(() => {
    setMessages(readStoredMessages());
    setShortcuts(pickShortcuts());
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    let isFramed = false;

    try {
      isFramed = window.self !== window.top;
    } catch {
      isFramed = true;
    }

    const isEmbedParam = new URLSearchParams(window.location.search).get('embed') === '1';
    setHideForEmbeddedSurface(Boolean(pathname?.startsWith('/embed')) || isEmbedParam || isFramed);
  }, [pathname]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-24)));
  }, [hasHydrated, messages]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    scrollRef.current?.scrollIntoView({ block: 'end' });
    inputRef.current?.focus();
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleOpenFromSidebar = () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsClosing(false);
      setIsOpen(true);
    };
    window.addEventListener('injpass:open-support', handleOpenFromSidebar);
    return () => window.removeEventListener('injpass:open-support', handleOpenFromSidebar);
  }, []);

  if (hideForEmbeddedSurface) {
    return null;
  }

  const openChat = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setIsClosing(false);
    setIsOpen(true);
  };

  const closeChat = () => {
    setIsClosing(true);

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 240);
  };

  const resetChat = () => {
    setMessages([{ ...INTRO_MESSAGE, id: `intro-${uid()}` }]);
    setShortcuts(pickShortcuts());
    setDraft('');
  };

  const sendMessage = async (overrideContent?: string) => {
    const content = (overrideContent ?? draft).trim();
    if (!content || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content,
    };
    const nextMessages = [...messages, userMessage];
    const assistantMessage: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
    };

    setMessages([...nextMessages, assistantMessage]);
    setDraft('');
    setShortcuts([]);
    setIsSending(true);

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as SupportResponse;
        throw new Error(data.error || 'Support is temporarily unavailable.');
      }

      if (!response.body) {
        throw new Error('Support is temporarily unavailable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          streamedContent += decoder.decode(value, { stream: true });
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: streamedContent }
                : message
            )
          );
        }

        const finalChunk = decoder.decode();
        if (finalChunk) {
          streamedContent += finalChunk;
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: streamedContent }
                : message
            )
          );
        }
      } finally {
        reader.releaseLock();
      }

      if (!streamedContent.trim()) {
        throw new Error('Support returned an empty response.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Support is temporarily unavailable.';
      setMessages((currentMessages) => {
        const hasAssistantPlaceholder = currentMessages.some((item) => item.id === assistantMessage.id);

        if (!hasAssistantPlaceholder) {
          return [
            ...nextMessages,
            {
              ...assistantMessage,
              content: message,
              isError: true,
            },
          ];
        }

        return currentMessages.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: message, isError: true }
            : item
        );
      });
    } finally {
      setIsSending(false);
    }
  };

  const panelClass = isLight
    ? 'border-black/8 bg-white/94 text-[#1d1d1f] shadow-[0_24px_90px_rgba(0,0,0,0.14)]'
    : 'border-white/10 bg-[#111113]/94 text-white shadow-[0_24px_90px_rgba(0,0,0,0.5)]';

  const headerClass = isLight
    ? 'border-black/8 bg-white/86'
    : 'border-white/10 bg-white/[0.04]';

  const mutedTextClass = isLight ? 'text-black/48' : 'text-white/48';

  return (
    <>
      {isOpen ? (
        <section
          className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-3 right-3 z-[70] flex h-[min(36rem,calc(100vh-7rem))] origin-bottom-right flex-col overflow-hidden rounded-[1.35rem] border backdrop-blur-xl transition-[opacity,transform,filter] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:left-auto sm:right-5 sm:w-[25rem] ${
            isClosing
              ? 'pointer-events-none translate-y-3 scale-[0.985] opacity-0 blur-[2px]'
              : 'translate-y-0 scale-100 opacity-100 blur-0'
          } ${panelClass}`}
          aria-label="Eric support chat"
        >
          <header className={`flex items-center justify-between border-b px-4 py-3 ${headerClass}`}>
            <div className="flex min-w-0 items-center">
              <SupportHeaderAvatar isLight={isLight} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">Eric</h2>
                <p className={`truncate text-xs ${mutedTextClass}`}>Speclist in AgentOS</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={resetChat}
                className={`rounded-full p-2 transition-colors ${
                  isLight ? 'text-black/46 hover:bg-black/5 hover:text-black' : 'text-white/46 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Start a new support chat"
                title="New chat"
              >
                <ResetIcon />
              </button>
              <button
                type="button"
                onClick={closeChat}
                className={`rounded-full p-2 transition-colors ${
                  isLight ? 'text-black/46 hover:bg-black/5 hover:text-black' : 'text-white/46 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Close support chat"
                title="Close"
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const isPendingAssistant = message.role === 'assistant' && !message.content && !message.isError;
              const bubbleClass = isUser
                ? isLight
                  ? 'ml-auto bg-black text-white'
                  : 'ml-auto bg-white text-black shadow-[0_8px_18px_rgba(0,0,0,0.16)]'
                : message.isError
                  ? isLight
                    ? 'mr-auto border border-red-200 bg-red-50 text-red-700'
                    : 'mr-auto border border-red-400/25 bg-red-500/10 text-red-200'
                  : isLight
                    ? 'mr-auto border border-black/8 bg-[#f6f6f2] text-black'
                    : 'mr-auto border border-white/10 bg-white/[0.06] text-white';

              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser ? <SupportAvatar isLight={isLight} /> : null}
                  <div
                    className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm leading-6 ${bubbleClass}`}
                  >
                    {isPendingAssistant ? (
                      <TypingDots />
                    ) : (
                      <p className={`whitespace-pre-wrap break-words ${isUser && !isLight ? 'text-white' : ''}`}>{message.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {shortcuts.length > 0 && messages.length === 1 ? (
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((shortcut) => (
                  <button
                    key={shortcut}
                    type="button"
                    onClick={() => void sendMessage(shortcut)}
                    disabled={isSending}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                    isLight
                        ? 'border-black/10 bg-white text-black/62 hover:bg-black/5 hover:text-black'
                        : 'border-white/10 bg-white/[0.04] text-white/62 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {shortcut}
                  </button>
                ))}
              </div>
            ) : null}

            <div ref={scrollRef} />
          </div>

          <form
            className={`border-t p-3 ${isLight ? 'border-black/8 bg-white/86' : 'border-white/10 bg-black/20'}`}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div
              className={`flex items-end gap-2 rounded-2xl border px-2 py-2 ${
                isLight
                  ? 'border-black/8 bg-white'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                placeholder="Ask Eric..."
                className={`max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none ${
                  isLight ? 'text-black placeholder:text-black/38' : 'text-white placeholder:text-white/38'
                }`}
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={!draft.trim() || isSending}
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border shadow-[0_10px_22px_rgba(0,0,0,0.16)] transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                  isLight
                    ? 'border-black bg-black text-white hover:bg-black/82'
                    : 'border-white bg-white text-black hover:bg-white/86'
                }`}
                aria-label="Send support message"
                title="Send"
              >
                <SendIcon className={isLight ? 'text-white' : 'text-black'} />
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!usesSidebarLauncher && <button
        type="button"
        onClick={isOpen ? closeChat : openChat}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-5 z-[80] inline-flex h-12 origin-bottom-right items-center justify-center rounded-full border px-5 text-sm font-semibold shadow-2xl transition-[opacity,transform,border-color,background-color,box-shadow] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${
          isLight
            ? 'border-black bg-black text-white shadow-[0_18px_46px_rgba(0,0,0,0.18)] hover:bg-black/82 hover:shadow-[0_22px_54px_rgba(0,0,0,0.24)]'
            : 'border-white/14 bg-white text-black shadow-[0_18px_46px_rgba(0,0,0,0.48)] hover:bg-white/88 hover:shadow-[0_22px_54px_rgba(0,0,0,0.58)]'
        }`}
        aria-label={isOpen ? 'Close Eric support' : 'Open Eric support'}
        title={isOpen ? 'Close support' : 'Open support'}
      >
        <span>Support</span>
      </button>}
    </>
  );
}
