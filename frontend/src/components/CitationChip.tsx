import { useState } from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { Source, SourceBadge } from '../types';
import SourceBadgePill from './SourceBadgePill';

interface CitationChipProps {
  sources: Source[];
  onChipClick?: () => void;
}

const BADGE_CHIP_LABELS: Record<SourceBadge, string> = {
  public: 'Public',
  cicp_subscriber_only: 'CICP',
};

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function CitationChip({ sources, onChipClick }: CitationChipProps) {
  const [page, setPage] = useState(0);

  if (sources.length === 0) return null;

  const badge = sources[0].badge;
  const label = BADGE_CHIP_LABELS[badge];
  const extraCount = sources.length - 1;
  const current = sources[Math.min(page, sources.length - 1)];

  const isPublic = badge === 'public';
  const chipColor = isPublic
    ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-secondary)]/40'
    : 'bg-[var(--color-highlight)]/15 text-[var(--color-highlight)] border-[var(--color-highlight)]/30 hover:border-[var(--color-highlight)]/60';

  const goPrev = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPage((p) => (p - 1 + sources.length) % sources.length);
  };
  const goNext = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPage((p) => (p + 1) % sources.length);
  };

  return (
    <HoverCard.Root openDelay={120} closeDelay={120}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          onClick={onChipClick}
          aria-label={`${label} citation${extraCount > 0 ? ` plus ${extraCount} more` : ''}`}
          className={`not-prose inline-flex items-center gap-1 rounded-md border px-1.5 py-[3px] text-[0.6875rem] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-highlight)]/40 ${chipColor}`}
        >
          <span>{label}</span>
          {extraCount > 0 && <span className="opacity-70">+{extraCount}</span>}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          sideOffset={6}
          className="citation-popover z-50 w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
        >
          {sources.length > 1 && (
            <div className="mb-2 flex items-center justify-between text-[var(--color-text-secondary)]">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous source"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs">
                {Math.min(page, sources.length - 1) + 1} / {sources.length}
              </span>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next source"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="block rounded-md p-1 transition-colors hover:bg-[var(--color-surface-muted)]"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-3 text-sm font-medium text-[var(--color-text-primary)]">
                  {current.title}
                </span>
                <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)]" />
              </div>
              <div className="truncate text-xs text-[var(--color-text-secondary)]">
                {getHostname(current.url)}
              </div>
              <div className="mt-0.5">
                <SourceBadgePill badge={current.badge} />
              </div>
            </div>
          </a>
          <HoverCard.Arrow className="fill-[var(--color-surface)]" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
