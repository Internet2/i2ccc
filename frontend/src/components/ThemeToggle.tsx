import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={label}
      className="theme-toggle"
    >
      <span className="sr-only">Toggle dark mode</span>
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="relative hidden sm:inline-block">
        <span className="invisible select-none" aria-hidden="true">Light mode</span>
        <span className="absolute inset-0 flex items-center justify-center">{isDark ? 'Light mode' : 'Dark mode'}</span>
      </span>
    </button>
  );
}
