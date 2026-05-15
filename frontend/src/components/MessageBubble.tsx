import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
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
import type { Message, Source } from '../types';
import CitationChip from './CitationChip';
import SourcesPill from './SourcesPill';
import { remarkCitations, parseCitationGroupHref } from '../utils/remarkCitations';

interface MessageBubbleProps {
  message: Message;
  onFeedback: (messageId: string, rating: 'thumbs_up' | 'thumbs_down', feedbackText?: string) => void;
  isFirstUserMessage?: boolean;
  onOpenSources?: (messageId: string, sources: Source[]) => void;
  isSourcesOpen?: boolean;
}

const FEEDBACK_REASONS = [
  { id: 'inaccurate', label: 'Inaccurate or incorrect', Icon: AlertCircle },
  { id: 'outdated', label: 'Outdated information', Icon: Clock },
  { id: 'broken_source', label: 'Source link broken', Icon: Link2Off },
  { id: 'unsupported_by_sources', label: "Sources don't support the answer", Icon: Search },
  { id: 'off_topic', label: "Didn't answer my question", Icon: Ban },
  { id: 'other', label: 'Other issue', Icon: HelpCircle },
] as const;

export default function MessageBubble({
  message,
  onFeedback,
  isFirstUserMessage = false,
  onOpenSources,
  isSourcesOpen = false,
}: MessageBubbleProps) {
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [showReasonMenu, setShowReasonMenu] = useState(false);
  const reasonMenuRef = useRef<HTMLDivElement | null>(null);

  const sourceMap = useMemo(() => {
    const map = new Map<number, Source>();
    for (const source of message.sources ?? []) {
      map.set(source.n, source);
    }
    return map;
  }, [message.sources]);

  const validCitationNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const source of message.sources ?? []) {
      set.add(source.n);
    }
    return set;
  }, [message.sources]);

  const remarkPluginList = useMemo(
    () => [remarkGfm, [remarkCitations, { validNumbers: validCitationNumbers }]] as const,
    [validCitationNumbers],
  );

  const sourceCount = message.sources?.length ?? 0;

  // After the message commits to the DOM, tag one Public and one CICP
  // citation chip with `data-tour` attributes so the onboarding tour can
  // anchor steps to them. We pick the chip whose vertical center is closest
  // to the geometric middle of the response container — that way, when
  // driver.js scrolls the chip into view, there's roughly equal text above
  // and below it. The hover card (which prefers `side="top"`) gets room
  // above, and the tour popover (`side: "bottom"`) gets room below — they
  // stack cleanly instead of fighting over the same axis.
  //
  // Doing this in an effect (not during render) keeps the render pure —
  // required because React 18 StrictMode double-invokes function components
  // and any closure-captured mutation produces flaky results.
  const responseBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = responseBodyRef.current;
    if (!root) return;
    // Clear stale markers in case streaming added more chips since the last
    // run — otherwise multiple chips can end up with the same `data-tour`.
    root
      .querySelectorAll('[data-tour="citation-public"], [data-tour="citation-cicp"]')
      .forEach((el) => el.removeAttribute('data-tour'));
    const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label*="citation"]'));
    const publicChips = chips.filter((c) => (c.getAttribute('aria-label') ?? '').startsWith('Public'));
    const cicpChips = chips.filter((c) => (c.getAttribute('aria-label') ?? '').startsWith('CICP'));
    const rootRect = root.getBoundingClientRect();
    const rootCenterY = rootRect.top + rootRect.height / 2;
    const distFromCenter = (chip: HTMLButtonElement) => {
      const r = chip.getBoundingClientRect();
      return Math.abs(r.top + r.height / 2 - rootCenterY);
    };
    const pickClosestToCenter = (group: HTMLButtonElement[]) =>
      group.length === 0
        ? null
        : group.reduce((best, cur) => (distFromCenter(cur) < distFromCenter(best) ? cur : best));
    pickClosestToCenter(publicChips)?.setAttribute('data-tour', 'citation-public');
    pickClosestToCenter(cicpChips)?.setAttribute('data-tour', 'citation-cicp');
  });

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
        <div className="max-w-xs lg:max-w-md animate-user-bubble-enter">
          <div className="message-bubble-user px-4 py-3 rounded-xl text-[0.9375rem] leading-relaxed tracking-[-0.01em]">
            <p>{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div ref={responseBodyRef} data-tour="response-body" className="max-w-none lg:max-w-3xl animate-chatbot-bubble-enter">
        <div className="px-4 py-3">
          <div className="max-w-none text-[var(--color-text-primary)]">
            <ReactMarkdown
              remarkPlugins={remarkPluginList as never}
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
                a: ({ children, href }) => {
                  const groupNumbers = parseCitationGroupHref(href);
                  if (groupNumbers !== null) {
                    const groupSources = groupNumbers
                      .map((n) => sourceMap.get(n))
                      .filter((s): s is Source => Boolean(s));

                    if (groupSources.length === 0) return null;

                    const publicSources = groupSources.filter((s) => s.badge === 'public');
                    const cicpSources = groupSources.filter((s) => s.badge === 'cicp_subscriber_only');

                    const openSidebar = () => {
                      if (message.sources && message.sources.length > 0) {
                        onOpenSources?.(message.id, message.sources);
                      }
                    };

                    return (
                      <span className="ml-1.5 inline-flex items-baseline gap-1 align-baseline">
                        {publicSources.length > 0 && (
                          <CitationChip sources={publicSources} onChipClick={openSidebar} />
                        )}
                        {cicpSources.length > 0 && (
                          <CitationChip sources={cicpSources} onChipClick={openSidebar} />
                        )}
                      </span>
                    );
                  }
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline transition-colors duration-200 text-[var(--color-highlight)] hover:text-[var(--color-highlight-soft)]"
                    >
                      {children}
                    </a>
                  );
                },
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
        
        {/* Action row: copy / feedback / sources */}
        <div className="mt-0 flex items-center gap-1.5 pl-4">
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

          {sourceCount > 0 && message.sources && (
            <div data-tour-interactive className="ml-1">
              <SourcesPill
                count={sourceCount}
                isOpen={isSourcesOpen}
                onClick={() => onOpenSources?.(message.id, message.sources!)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}