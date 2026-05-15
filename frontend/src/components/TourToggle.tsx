import { GraduationCap } from 'lucide-react';
import { useOnboarding } from '../hooks/useOnboarding';

const LABEL_BY_STATUS: Record<string, string> = {
  pending: 'Start tour',
  'in-progress': 'End tour',
  completed: 'Replay tour',
  skipped: 'Replay tour',
};

export default function TourToggle() {
  const { isActive, status, skip, restart } = useOnboarding();
  const label = LABEL_BY_STATUS[status] ?? 'Tour';

  const handleClick = () => {
    if (isActive) {
      skip();
    } else {
      restart();
    }
  };

  return (
    <button
      type="button"
      data-tour="tour-toggle"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={isActive}
      className="nav-btn relative"
    >
      <GraduationCap className="h-3.5 w-3.5" />
      <span>Tour</span>
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--color-highlight)] ring-2 ring-[var(--color-background)]"
        />
      )}
    </button>
  );
}
