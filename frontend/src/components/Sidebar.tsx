import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Info, PanelLeft, Trash } from 'lucide-react';
import internet2Black from '../assets/internet2-black.png';
import internet2White from '../assets/internet2-white.png';
import { useChatHistory } from '../hooks/useChatHistory';
import type { PageType } from '../types';

interface SidebarProps {
  isOpen: boolean;
  currentPage: PageType;
  onNewChat: () => void;
  onPageChange: (page: PageType) => void;
  onSessionChange: (sessionId: string) => void;
  currentSessionId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({
  isOpen,
  currentPage,
  onNewChat,
  onPageChange,
  onSessionChange,
  currentSessionId,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { sessions, deleteSession } = useChatHistory();
  const [isLogoInteracted, setIsLogoInteracted] = useState(false);
  const [sessionPendingDeletion, setSessionPendingDeletion] = useState<{
    id: string;
    title: string;
    fullTitle: string;
  } | null>(null);

  useEffect(() => {
    if (!isCollapsed) {
      setIsLogoInteracted(false);
    }
  }, [isCollapsed]);

  const handleLogoInteractStart = () => {
    if (isCollapsed) {
      setIsLogoInteracted(true);
    }
  };

  const handleLogoInteractEnd = () => {
    if (isCollapsed) {
      setIsLogoInteracted(false);
    }
  };

  const handleLogoKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!isCollapsed) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onToggleCollapse();
    }
  };

  const shouldHideLogo = isCollapsed && isLogoInteracted;

  const formatSessionTitle = (title: string) => {
    return title.length > 20 ? title.substring(0, 20) + '...' : title;
  };

  const handleConfirmDeletion = () => {
    if (!sessionPendingDeletion) {
      return;
    }

    const { id } = sessionPendingDeletion;
    const isDeletingActiveSession = id === currentSessionId;

    deleteSession(id);
    setSessionPendingDeletion(null);

    if (isDeletingActiveSession) {
      onNewChat();
    }
  };

  const labelVisibilityClass = isCollapsed
    ? 'pointer-events-none w-0 opacity-0'
    : 'w-auto opacity-100 delay-150';

  const sectionPaddingClass = 'px-4 pt-6 pb-4';

  const navContainerClass = `flex flex-col gap-4 px-4 pb-4 pt-4 transition-all duration-300 ${
    isCollapsed ? 'items-start' : ''
  }`;

  const toggleButtonClass =
    'flex-shrink-0 h-10 w-10 rounded-md p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]';

  const logoToggleButtonClass = `absolute inset-0 flex items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-highlight)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] ${
    isLogoInteracted
      ? 'pointer-events-auto opacity-100 scale-95'
      : 'pointer-events-none opacity-0 scale-95'
  }`;

  const newChatButtonClass = isCollapsed
    ? 'flex w-9 items-center justify-center self-start rounded-md bg-[var(--color-highlight)] px-2.5 py-2.5 text-white transition-all duration-300 ease-in-out hover:bg-[var(--color-highlight-soft)]'
    : 'flex w-full items-center gap-3 rounded-md bg-[var(--color-highlight)] px-3 py-2.5 text-white transition-all duration-300 ease-in-out hover:bg-[var(--color-highlight-soft)]';

  const aboutButtonBase = `flex items-center rounded-md p-2 transition-colors ${
    currentPage === 'about'
      ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-primary)]'
      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]'
  }`;

  const aboutButtonClass = isCollapsed
    ? `${aboutButtonBase} h-10 w-10 justify-center self-start`
    : `${aboutButtonBase} w-full gap-3`;

  return (
    <>
      <aside
      className={`
        fixed lg:relative z-50 h-full transform transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'w-20' : 'w-64'}
        flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm
      `}
    >
      {/* Header */}
      <div className={sectionPaddingClass}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden transition-all duration-300">
            <span
              className="relative flex flex-shrink-0 items-center"
              onMouseEnter={handleLogoInteractStart}
              onMouseLeave={handleLogoInteractEnd}
              onFocus={handleLogoInteractStart}
              onBlur={handleLogoInteractEnd}
              onKeyDown={handleLogoKeyDown}
              tabIndex={isCollapsed ? 0 : -1}
            >
              <img
                src={internet2Black}
                alt="Internet2 logo"
                className={`flex-shrink-0 w-auto transition-all duration-200 ${
                  isCollapsed ? 'h-8' : 'h-10'
                } dark:hidden ${shouldHideLogo ? 'opacity-0' : 'opacity-100'}`}
              />
              <img
                src={internet2White}
                alt="Internet2 logo"
                className={`hidden flex-shrink-0 w-auto transition-all duration-200 ${
                  isCollapsed ? 'h-8' : 'h-8'
                } dark:block ${shouldHideLogo ? 'opacity-0' : 'opacity-100'}`}
              />
              {isCollapsed && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className={logoToggleButtonClass}
                  aria-label="Expand sidebar"
                  onMouseEnter={handleLogoInteractStart}
                  onMouseLeave={handleLogoInteractEnd}
                  onFocus={handleLogoInteractStart}
                  onBlur={handleLogoInteractEnd}
                >
                  <PanelLeft className="h-5 w-5 rotate-180" />
                </button>
              )}
            </span>
            <span
              className={`text-l font-bold transition-all duration-200 ${labelVisibilityClass} whitespace-nowrap`}
            >
            </span>
          </div>
          {!isCollapsed && (
            <button
              onClick={onToggleCollapse}
              className={toggleButtonClass}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeft className="h-5 w-5 transition-transform duration-200" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col">
        <div className={navContainerClass}>
          <button onClick={onNewChat} className={newChatButtonClass}>
            <Plus className="h-5 w-5 flex-shrink-0" />
            <span
              className={`overflow-hidden text-sm font-medium transition-all duration-200 ${labelVisibilityClass} whitespace-nowrap`}
            >
              New Chat
            </span>
          </button>

          {sessions.length > 0 && (
            <div
              className={`w-full overflow-hidden transition-all duration-300 ${
                isCollapsed
                  ? 'pointer-events-none max-h-0 opacity-0'
                  : 'mt-6 max-h-full opacity-100'
              }`}
            >
              <h3 className="mb-2 px-3 text-sm font-medium text-[var(--color-text-secondary)]">
                Recent
              </h3>
              <div className="space-y-1">
                {sessions.map((session) => {
                  const isActive = session.id === currentSessionId;

                  const truncatedTitle = formatSessionTitle(session.title);

                  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    setSessionPendingDeletion({
                      id: session.id,
                      title: truncatedTitle,
                      fullTitle: session.title,
                    });
                  };

                  return (
                    <div
                      key={session.id}
                      className={`
                        group flex w-full items-center gap-3 rounded-md pl-3 pr-2 py-2 transition-colors
                        ${isActive
                          ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)] focus-within:bg-[var(--color-surface-muted)] focus-within:text-[var(--color-text-primary)]'}
                      `}
                    >
                      <button
                        type="button"
                        onClick={() => onSessionChange(session.id)}
                        className="flex-1 truncate text-left text-sm text-current focus:outline-none"
                        title={session.title}
                      >
                        {truncatedTitle}
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className="flex flex-shrink-0 items-center justify-center rounded-md p-1 text-[var(--color-text-secondary)] opacity-0 transition-all duration-200 hover:bg-[var(--color-surface-muted)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-highlight)] group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label={`Delete chat ${session.title}`}
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1" />
      </div>

      {/* About Button at Bottom */}
      <div className="border-t border-[var(--color-border)] p-2">
        <button onClick={() => onPageChange('about')} className={aboutButtonClass}>
          <Info className="h-5 w-5 flex-shrink-0" />
          <span
            className={`overflow-hidden text-sm transition-all duration-200 ${labelVisibilityClass} whitespace-nowrap`}
          >
            About
          </span>
        </button>
      </div>
    </aside>
      {typeof document !== 'undefined' &&
        sessionPendingDeletion &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-session-title"
            aria-describedby="delete-session-description"
          >
            <div className="w-full max-w-sm rounded-lg bg-[var(--color-surface)] p-6 shadow-lg">
              <h2 id="delete-session-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
                Delete chat?
              </h2>
              <p
                id="delete-session-description"
                className="mt-2 text-sm text-[var(--color-text-secondary)]"
              >
                Are you sure you want to delete "{sessionPendingDeletion.title}"? This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSessionPendingDeletion(null)}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeletion}
                  className="rounded-md border border-[var(--color-destructive-tint)] bg-[var(--color-destructive)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-destructive-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}