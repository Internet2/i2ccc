import type { SourceBadge } from '../types';

interface SourceBadgePillProps {
  badge: SourceBadge;
}

const LABELS: Record<SourceBadge, string> = {
  public: 'Public',
  cicp_subscriber_only: 'CICP Subscriber Only',
};

export default function SourceBadgePill({ badge }: SourceBadgePillProps) {
  const isPublic = badge === 'public';
  const classes = isPublic
    ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)]'
    : 'bg-[var(--color-highlight)]/15 text-[var(--color-highlight)] border-[var(--color-highlight)]/30';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-[0.625rem] font-medium leading-tight tracking-wide ${classes}`}
    >
      {LABELS[badge]}
    </span>
  );
}
