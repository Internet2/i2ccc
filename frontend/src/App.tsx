import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AboutPage from './components/AboutPage';
import LoginPage from './components/LoginPage';
import type { PageType } from './types';
import ThemeToggle from './components/ThemeToggle';
import './index.css';

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => 
    crypto.randomUUID()
  );
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const storedTheme = localStorage.getItem('i2-theme');
    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  // Authentication check
  const isAuthenticated = typeof document !== 'undefined'
    ? document.cookie.split(';').some(cookie => cookie.trim().startsWith('auth-session='))
    : false;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    localStorage.setItem('i2-theme', theme);
  }, [theme]);

  const handleNewChat = () => {
    setCurrentSessionId(crypto.randomUUID());
    setPendingQuestion(null);
    setCurrentPage('chat');
    setSidebarOpen(false); // Close sidebar on mobile after action
  };

  const handleAboutQuestionSelect = (question: string) => {
    setPendingQuestion(question);
    setCurrentPage('chat');
    setSidebarOpen(false);
  };

  const handlePageChange = (page: PageType) => {
    setCurrentPage(page);
    setSidebarOpen(false); // Close sidebar on mobile after navigation
  };

  const handleSidebarToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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
    <div className="flex h-screen bg-[var(--color-background)] text-[var(--color-text-primary)] transition-colors duration-300">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        currentPage={currentPage}
        onNewChat={handleNewChat}
        onPageChange={handlePageChange}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleSidebarCollapse}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0 bg-[var(--color-background)] transition-colors duration-300">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-text-primary)] shadow-sm lg:hidden">
          <button
            onClick={handleSidebarToggle}
            className="rounded-md p-2 transition-colors hover:bg-[var(--color-surface-muted)]"
            aria-label="Toggle sidebar"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">
            Internet2 Cloud Assistant
          </h1>
          <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
        </header>

        {/* Desktop theme toggle */}
        <div className="sticky top-0 z-10 hidden items-center justify-end px-6 pt-4 lg:flex">
          <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          {currentPage === 'chat' ? (
            <ChatArea 
              sessionId={currentSessionId}
              onQuestionSelect={(question) => {
                setCurrentPage('chat');
                if (question) {
                  setPendingQuestion(null);
                }
              }}
              initialQuestion={pendingQuestion}
              onInitialQuestionHandled={() => setPendingQuestion(null)}
            />
          ) : (
            <div className="h-full animate-fadeIn">
              <AboutPage
                onQuestionSelect={handleAboutQuestionSelect}
                onBackToChat={() => setCurrentPage('chat')}
              />
            </div>
          )}
        </main>
      </div>

      {/* Toast notifications */}
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
  );
}

export default App;
