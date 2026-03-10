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
    <nav className="navbar-glass flex items-center justify-between px-6 py-3 text-[var(--color-text-primary)]">
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

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenAbout}
          className="nav-btn"
        >
          <Info className="h-3.5 w-3.5" />
          <span>About</span>
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </nav>
  );
}
