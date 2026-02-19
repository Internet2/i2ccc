import { useEffect, useRef, useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { useChat } from '../hooks/useChat';
import { LOADING_MESSAGES } from '../data/loadingMessages';

const LOADING_MESSAGE_CHANGE_INTERVAL_MS = 3000;
const LOADING_MESSAGE_FADE_DURATION_MS = 250;
const LOADING_MESSAGE_APPEAR_DELAY_MS = 20;

const pickRandomLoadingMessage = (previous?: string): string => {
  const messages = [...LOADING_MESSAGES];
  const totalMessages = messages.length;

  if (totalMessages === 0) {
    return '';
  }

  if (totalMessages === 1) {
    return messages[0];
  }

  let candidate = previous;

  while (!candidate || candidate === previous) {
    const randomIndex = Math.floor(Math.random() * totalMessages);
    candidate = messages[randomIndex];
  }

  return candidate;
};

interface ChatAreaProps {
  sessionId: string;
  onQuestionSelect: (question: string) => void;
  initialQuestion?: string | null;
  onInitialQuestionHandled?: () => void;
}

export default function ChatArea({
  sessionId,
  onQuestionSelect,
  initialQuestion,
  onInitialQuestionHandled,
}: ChatAreaProps) {
  const { messages, isLoading, error, sendQuery, submitFeedback } = useChat(sessionId);
  const processedInitialQuestion = useRef<string | null>(null);
  const initialLoadingMessage = pickRandomLoadingMessage();
  const [loadingMessage, setLoadingMessage] = useState(initialLoadingMessage);
  const [isLoadingMessageVisible, setIsLoadingMessageVisible] = useState(false);
  const loadingMessageRef = useRef(initialLoadingMessage);
  const messageIntervalRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const visibilityTimeoutRef = useRef<number | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);

  const handleSendMessage = async (query: string) => {
    await sendQuery(query);
  };

  const handleFeedback = (messageId: string, rating: 'thumbs_up' | 'thumbs_down', feedbackText?: string) => {
    submitFeedback(messageId, rating, feedbackText);
  };

  const handleQuestionSelect = (question: string) => {
    onQuestionSelect(question);
    sendQuery(question);
  };

  // Run any initial question passed from parent (e.g., About page selections)
  useEffect(() => {
    if (!initialQuestion) {
      processedInitialQuestion.current = null;
      return;
    }

    if (processedInitialQuestion.current === initialQuestion) {
      return;
    }

    processedInitialQuestion.current = initialQuestion;
    sendQuery(initialQuestion);
    onInitialQuestionHandled?.();
  }, [initialQuestion, sendQuery, onInitialQuestionHandled]);

  useEffect(() => {
    const clearTimers = () => {
      if (messageIntervalRef.current !== null) {
        window.clearInterval(messageIntervalRef.current);
        messageIntervalRef.current = null;
      }

      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }

      if (visibilityTimeoutRef.current !== null) {
        window.clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
    };

    if (!isLoading) {
      clearTimers();
      setIsLoadingMessageVisible(false);
      return;
    }

    setIsLoadingMessageVisible(false);

    const showNewMessage = (previous?: string) => {
      const nextMessage = pickRandomLoadingMessage(previous);
      loadingMessageRef.current = nextMessage;
      setLoadingMessage(nextMessage);

      visibilityTimeoutRef.current = window.setTimeout(() => {
        setIsLoadingMessageVisible(true);
      }, LOADING_MESSAGE_APPEAR_DELAY_MS);
    };

    showNewMessage(loadingMessageRef.current);

    messageIntervalRef.current = window.setInterval(() => {
      setIsLoadingMessageVisible(false);

      fadeTimeoutRef.current = window.setTimeout(() => {
        showNewMessage(loadingMessageRef.current);
      }, LOADING_MESSAGE_FADE_DURATION_MS);
    }, LOADING_MESSAGE_CHANGE_INTERVAL_MS);

    return () => {
      clearTimers();
    };
  }, [isLoading]);

  useEffect(() => {
    if (messages.length === 0) {
      previousMessageCountRef.current = 0;
      return;
    }

    const hasNewMessage = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    if (!hasNewMessage) {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    const shouldScroll = latestMessage.role === 'user' || latestMessage.role === 'assistant';

    if (!shouldScroll) {
      return;
    }

    window.requestAnimationFrame(() => {
      const lastMessageElement = messagesEndRef.current?.previousElementSibling;

      if (lastMessageElement instanceof HTMLElement) {
        lastMessageElement.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        return;
      }

      if (messageListRef.current) {
        messageListRef.current.scrollTo({
          top: messageListRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Chat messages area */}
      <div
        ref={messageListRef}
        className={`flex-1 p-4 ${messages.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`}
      >
        {messages.length === 0 ? (
          <WelcomeScreen onQuestionSelect={handleQuestionSelect} />
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {messages.map((message, index) => {
              // Find if this is the first user message
              const isFirstUserMessage = message.role === 'user' && 
                !messages.slice(0, index).some(m => m.role === 'user');
              
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onFeedback={handleFeedback}
                  isFirstUserMessage={isFirstUserMessage}
                />
              );
            })}
            
            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="max-w-xs rounded-2xl bg-[var(--color-surface-muted)] p-4 transition-all duration-300 ease-in-out"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center space-x-3 transition-all duration-300 ease-in-out">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-text-muted)]"></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-text-muted)]" style={{ animationDelay: '0.1s' }}></div>
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-text-muted)]" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span
                      className={`transform text-sm font-medium text-[var(--color-text-secondary)] transition-all duration-300 ease-in-out ${
                        isLoadingMessageVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                      }`}
                    >
                      {loadingMessage}...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
  <div className="mx-4 mb-4 rounded-md border border-[var(--color-error)] bg-[var(--color-surface-muted)] p-3">
          <p className="text-sm text-[var(--color-error)]">{error}</p>
        </div>
      )}

      {/* Chat input */}
      <div className="p-4">
        <div className="mx-auto max-w-4xl">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}