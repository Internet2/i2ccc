import { Info } from 'lucide-react';
import internet2Black from '../assets/internet2-black.png';
import internet2White from '../assets/internet2-white.png';
import ThemeToggle from './ThemeToggle';

interface NavbarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenAbout: () => void;
}

export default function Navbar({ theme, onToggleTheme, onOpenAbout }: NavbarProps) {
  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-[var(--color-background)] text-[var(--color-text-primary)] transition-colors duration-300">
      <a href="/">
        <img
          src={internet2Black}
          alt="Internet2"
          className="h-10 w-32 object-contain object-left dark:hidden"
        />
        <img
          src={internet2White}
          alt="Internet2"
          className="hidden h-10 w-32 object-contain object-left dark:block"
        />
      </a>

      <div className="flex items-center gap-3">
        <button
          onClick={onOpenAbout}
          className="flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-highlight)]"
        >
          <Info className="h-4 w-4" />
          <span>About</span>
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </nav>
  );
}
