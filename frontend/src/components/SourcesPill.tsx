import { BookOpen } from 'lucide-react';

interface SourcesPillProps {
  count: number;
  isOpen?: boolean;
  onClick: () => void;
}

export default function SourcesPill({ count, isOpen = false, onClick }: SourcesPillProps) {
  if (count <= 0) return null;

  return (
    <button
      type="button"
      data-tour="sources-pill"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-label={`Show ${count} ${count === 1 ? 'source' : 'sources'}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-highlight)]/40 ${
        isOpen
          ? 'border-[var(--color-highlight)]/40 bg-[var(--color-highlight)]/15 text-[var(--color-highlight)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] hover:border-[var(--color-highlight)]/30 hover:text-[var(--color-text-primary)]'
      }`}
    >
      <BookOpen className="h-3.5 w-3.5" />
      <span>
        {count} {count === 1 ? 'source' : 'sources'}
      </span>
    </button>
  );
}
