import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import ChatArea from './components/ChatArea';
import AboutPage from './components/AboutPage';
import LoginPage from './components/LoginPage';
import StarfieldCanvas from './components/StarfieldCanvas';
import './index.css';

function App() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [currentSessionId] = useState<string>(() => crypto.randomUUID());
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const storedTheme = localStorage.getItem('i2-theme');
    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'dark';
  });

  // Authentication check - TEMPORARILY DISABLED
  const isAuthenticated = true;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    localStorage.setItem('i2-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!aboutOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAboutOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [aboutOpen]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleAboutQuestionSelect = (question: string) => {
    setPendingQuestion(question);
    setAboutOpen(false);
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <LoginPage
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
    );
  }

  return (
    <>
      {theme === 'dark' && <StarfieldCanvas />}
      <div className="relative flex flex-col h-screen text-[var(--color-text-primary)] transition-colors duration-300" style={{ zIndex: 1 }}>
      <Navbar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <main className="flex-1 overflow-hidden">
        <ChatArea
          sessionId={currentSessionId}
          onQuestionSelect={() => {}}
          initialQuestion={pendingQuestion}
          onInitialQuestionHandled={() => setPendingQuestion(null)}
        />
      </main>

      {/* About modal */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="bg-[var(--color-surface)] rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AboutPage
              onQuestionSelect={handleAboutQuestionSelect}
              onClose={() => setAboutOpen(false)}
            />
          </div>
        </div>
      )}

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: theme === 'dark'
              ? 'var(--color-surface)'
              : 'var(--color-highlight)',
            color: theme === 'dark'
              ? 'var(--color-text-primary)'
              : '#ffffff',
          },
        }}
      />
      </div>
    </>
  );
}

export default App;
