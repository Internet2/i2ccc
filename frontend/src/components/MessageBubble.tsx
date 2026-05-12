import { useEffect, useRef, useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Copy,
  AlertCircle,
  Clock,
  Link2Off,
  Search,
  Ban,
  HelpCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
  onFeedback: (messageId: string, rating: 'thumbs_up' | 'thumbs_down', feedbackText?: string) => void;
  isFirstUserMessage?: boolean;
}

const FEEDBACK_REASONS = [
  { id: 'inaccurate', label: 'Inaccurate or incorrect', Icon: AlertCircle },
  { id: 'outdated', label: 'Outdated information', Icon: Clock },
  { id: 'broken_source', label: 'Source link broken', Icon: Link2Off },
  { id: 'unsupported_by_sources', label: "Sources don't support the answer", Icon: Search },
  { id: 'off_topic', label: "Didn't answer my question", Icon: Ban },
  { id: 'other', label: 'Other issue', Icon: HelpCircle },
] as const;

export default function MessageBubble({ message, onFeedback, isFirstUserMessage = false }: MessageBubbleProps) {
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [showReasonMenu, setShowReasonMenu] = useState(false);
  const reasonMenuRef = useRef<HTMLDivElement | null>(null);

  const handleFeedback = (rating: 'thumbs_up' | 'thumbs_down') => {
    setFeedback(rating);
    onFeedback(message.id, rating);

    if (rating === 'thumbs_down') {
      setShowReasonMenu(true);
    } else {
      toast.success('Thank you for your feedback!');
    }
  };

  const handleReasonSelect = (reasonId: string) => {
    onFeedback(message.id, 'thumbs_down', reasonId);
    toast.success('Thanks for the details!');
    setShowReasonMenu(false);
  };

  useEffect(() => {
    if (!showReasonMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (reasonMenuRef.current && !reasonMenuRef.current.contains(event.target as Node)) {
        setShowReasonMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowReasonMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showReasonMenu]);

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      toast.error('Clipboard is not available in this environment.');
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
      toast.success('Copied message markdown to clipboard');
    } catch {
      toast.error('Failed to copy message');
    }
  };

  if (message.role === 'user') {
    return (
      <div className={`flex justify-end ${isFirstUserMessage ? 'mt-20' : ''}`}>
        <div className="max-w-xs lg:max-w-md">
          <div className="message-bubble-user px-4 py-3 rounded-xl text-[0.9375rem] leading-relaxed tracking-[-0.01em]">
            <p>{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-none lg:max-w-3xl animate-chatbot-bubble-enter">
        <div className="px-4 py-3">
          <div className="max-w-none text-[var(--color-text-primary)]">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom styling for markdown elements
                p: ({ children }) => <p className="mt-7 mb-3 first:mt-0 last:mb-0">{children}</p>,
                ul: ({ children, className, ...props }) => (
                  <ul
                    {...props}
                    className={`list-disc pl-9 mb-2 space-y-1 [&_ul]:mt-1 [&_ul]:mb-1 [&_ul]:pl-6 [&_ol]:mt-1 [&_ol]:mb-1 [&_ol]:pl-6${className ? ` ${className}` : ''}`}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children, className, ...props }) => (
                  <ol
                    {...props}
                    className={`list-decimal pl-6 mb-2 space-y-1 [&_ol]:mt-1 [&_ol]:mb-1 [&_ol]:pl-6 [&_ul]:mt-1 [&_ul]:mb-1 [&_ul]:pl-6${className ? ` ${className}` : ''}`}
                  >
                    {children}
                  </ol>
                ),
                li: ({ children, className, ...props }) => (
                  <li
                    {...props}
                    className={`leading-relaxed${className ? ` ${className}` : ''}`}
                  >
                    {children}
                  </li>
                ),
                blockquote: ({ children }) => <blockquote className="border-l-4 border-[var(--color-border)] pl-4 italic">{children}</blockquote>,
                h1: ({ children }) => <h1 className="mb-2 text-xl font-bold">{children}</h1>,
                h2: ({ children }) => <h2 className="mb-2 text-lg font-semibold">{children}</h2>,
                h3: ({ children }) => <h3 className="mb-2 text-base font-semibold">{children}</h3>,
                a: ({ children, href }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline transition-colors duration-200 text-[var(--color-highlight)] hover:text-[var(--color-highlight-soft)]"
                  >
                    {children}
                  </a>
                ),
                code: ({ children, className }) => 
                  className ? 
                    <pre className="mb-2 overflow-x-auto rounded bg-[var(--color-surface-muted)] p-2"><code>{children}</code></pre> :
                    <code className="rounded bg-[var(--color-surface-muted)] px-1 py-0.5">{children}</code>
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        
        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 px-4">
            {message.sources.map((source, index) => (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-chip"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                <span>{source.title}</span>
              </a>
            ))}
          </div>
        )}

        {/* Feedback Buttons */}
        <div className="mt-0 flex items-center gap-0.5 pl-4">
          <button
            onClick={handleCopy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Copy response markdown"
          >
            <Copy className="h-4 w-4" />
          </button>

          <button
            onClick={() => handleFeedback('thumbs_up')}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors ${
              feedback === 'thumbs_up'
                ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-success)]'
            }`}
            aria-label="Rate response positive"
            aria-pressed={feedback === 'thumbs_up'}
          >
            <ThumbsUp className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => handleFeedback('thumbs_down')}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors ${
                feedback === 'thumbs_down'
                  ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-error)]'
              }`}
              aria-label="Rate response negative"
              aria-pressed={feedback === 'thumbs_down'}
              aria-haspopup="menu"
              aria-expanded={showReasonMenu}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>

            {showReasonMenu && (
              <div
                ref={reasonMenuRef}
                role="menu"
                aria-label="What went wrong with this response?"
                className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-lg"
              >
                {FEEDBACK_REASONS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    role="menuitem"
                    onClick={() => handleReasonSelect(id)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]"
                  >
                    <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}