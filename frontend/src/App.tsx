import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import ChatArea from './components/ChatArea';
import AboutPage from './components/AboutPage';
import PrivacyNotice from './components/PrivacyNotice';
import StarfieldCanvas from './components/StarfieldCanvas';
import { useAuth } from './hooks/useAuth';
import './index.css';

function App() {
  const { isAuthenticated, isLoading, authError } = useAuth();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(
    () => localStorage.getItem('i2-privacy-acknowledged') === 'true'
  );
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

  const handleAcknowledgePrivacy = () => {
    localStorage.setItem('i2-privacy-acknowledged', 'true');
    setPrivacyAcknowledged(true);
  };

  const handleAboutQuestionSelect = (question: string) => {
    setPendingQuestion(question);
    setAboutOpen(false);
  };


  if (isLoading) {
    return (
      <>
        {theme === 'dark' && <StarfieldCanvas />}
        <div className="relative flex items-center justify-center h-screen text-[var(--color-text-secondary)]" style={{ zIndex: 1 }}>
          <p className="text-sm animate-pulse">Authenticating...</p>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {theme === 'dark' && <StarfieldCanvas />}
        {authError && (
          <div className="relative flex flex-col items-center justify-center h-screen gap-4 text-[var(--color-text-secondary)]" style={{ zIndex: 1 }}>
            <p className="text-sm">Authentication failed: {authError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm rounded-lg bg-[var(--color-highlight)] text-white hover:opacity-90"
            >
              Try again
            </button>
          </div>
        )}
      </>
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

      {/* Privacy notice modal — shown once on first visit */}
      {!privacyAcknowledged && (
        <PrivacyNotice onAcknowledge={handleAcknowledgePrivacy} />
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
