import { useState, useCallback, useEffect, useRef } from 'react';
import { sendMessage, sendFeedback } from '../services/api';
import type { Message } from '../types';
import { chatHistoryStore } from './useChatHistory';

const deriveSessionTitle = (messages: Message[]): string => {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) {
    return 'New Chat';
  }

  const trimmed = firstUserMessage.content.trim();
  if (!trimmed) {
    return 'New Chat';
  }

  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
};

const sessionLoadingState = new Map<string, boolean>();
const sessionErrorState = new Map<string, string | null>();

export const useChat = (sessionId: string) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const stored = chatHistoryStore.getSession(sessionId);
    return stored?.messages ?? [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => sessionLoadingState.get(sessionId) ?? false);
  const [error, setError] = useState<string | null>(() => sessionErrorState.get(sessionId) ?? null);
  const activeSessionRef = useRef(sessionId);
  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const persistMessages = useCallback(
    (nextMessages: Message[]) => {
      if (nextMessages.length === 0) {
        chatHistoryStore.deleteSession(sessionId);
        return;
      }

      const lastMessage = nextMessages[nextMessages.length - 1];
      chatHistoryStore.addOrUpdateSession({
        id: sessionId,
        title: deriveSessionTitle(nextMessages),
        messages: nextMessages,
        timestamp: lastMessage.timestamp ?? Date.now(),
      });
    },
    [sessionId]
  );

  const updateSessionMessages = useCallback(
    (updater: (current: Message[]) => Message[]) => {
      const baseMessages =
        chatHistoryStore.getSession(sessionId)?.messages ??
        (activeSessionRef.current === sessionId ? messagesRef.current : []);

      const nextMessages = updater(baseMessages);
      persistMessages(nextMessages);

      if (activeSessionRef.current === sessionId) {
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
      }
    },
    [persistMessages, sessionId]
  );

  useEffect(() => {
    activeSessionRef.current = sessionId;
    const stored = chatHistoryStore.getSession(sessionId);
    const nextMessages = stored?.messages ?? [];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setIsLoading(sessionLoadingState.get(sessionId) ?? false);
    setError(sessionErrorState.get(sessionId) ?? null);
  }, [sessionId]);

  const sendQuery = useCallback(async (query: string) => {
    // Add user message immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };
    updateSessionMessages((prev) => [...prev, userMessage]);

    sessionLoadingState.set(sessionId, true);
    sessionErrorState.set(sessionId, null);

    if (activeSessionRef.current === sessionId) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await sendMessage(query, sessionId);
      
      const botMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: response.timestamp,
        sources: response.sources,
      };

      updateSessionMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to get response. Please try again.';

      sessionErrorState.set(sessionId, errorMessage);
      if (activeSessionRef.current === sessionId) {
        setError(errorMessage);
      }
      console.error('Chat error:', err);
    } finally {
      sessionLoadingState.set(sessionId, false);
      if (activeSessionRef.current === sessionId) {
        setIsLoading(false);
      }
    }
  }, [sessionId, updateSessionMessages]);

  const submitFeedback = useCallback(async (
    messageId: string, 
    rating: 'thumbs_up' | 'thumbs_down',
    feedbackText?: string
  ) => {
    try {
      // Find the message to get its timestamp
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      await sendFeedback(sessionId, message.timestamp, rating, feedbackText);
    } catch (err) {
      console.error('Feedback error:', err);
      // We could show a toast notification here for feedback errors
    }
  }, [sessionId, messages]);

  const clearChat = useCallback(() => {
    sessionLoadingState.delete(sessionId);
    sessionErrorState.delete(sessionId);

    if (activeSessionRef.current === sessionId) {
      setMessages([]);
      setIsLoading(false);
      setError(null);
    }

    chatHistoryStore.deleteSession(sessionId);
  }, [sessionId]);

  return {
    messages,
    isLoading,
    error,
    sendQuery,
    submitFeedback,
    clearChat,
  };
};