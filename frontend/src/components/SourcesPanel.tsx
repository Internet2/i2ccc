import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { Source } from '../types';
import SourceBadgePill from './SourceBadgePill';

interface SourcesPanelProps {
  sources: Source[];
  isOpen: boolean;
  onClose: () => void;
}

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function SourcesPanel({ sources, isOpen, onClose }: SourcesPanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll on mobile while the overlay is up.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isOpen) return;
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (!isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const count = sources.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${count} ${count === 1 ? 'source' : 'sources'}`}
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-50 flex flex-col bg-[var(--color-surface)] transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } lg:static lg:inset-auto lg:h-full lg:w-96 lg:translate-x-0 lg:border-l lg:border-[var(--color-border)] lg:bg-[var(--color-background)] lg:transition-none`}
    >
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 lg:px-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {count} {count === 1 ? 'source' : 'sources'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sources panel"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-black/5 hover:text-[var(--color-text-primary)] dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-highlight)]/40"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <ol className="flex-1 list-none space-y-2 overflow-y-auto p-3 lg:p-4">
        {sources.map((source) => (
          <li key={source.n}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:border-[var(--color-highlight)]/30 hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-highlight)]/40"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 inline-flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-muted)] px-1 text-[0.6875rem] font-semibold text-[var(--color-text-secondary)] group-hover:bg-[var(--color-highlight)]/15 group-hover:text-[var(--color-highlight)]"
                  aria-hidden="true"
                >
                  {source.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-highlight)]">
                      {source.title}
                    </p>
                    <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)] group-hover:text-[var(--color-highlight)]" />
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">
                    {getHostname(source.url)}
                  </p>
                  <div className="mt-2">
                    <SourceBadgePill badge={source.badge} />
                  </div>
                </div>
              </div>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
