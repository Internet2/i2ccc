import { useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { chatInputContent } from '../data/chatInputContent';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSendMessage, disabled = false }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={chatInputContent.placeholder}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 pr-11 lg:p-4 lg:pr-12 text-sm lg:text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-highlight)]"
          rows={3}
          disabled={disabled}
        />
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || disabled}
          className={`absolute bottom-4 lg:bottom-5 right-3 lg:right-4 rounded-md p-1.5 lg:p-2 transition-colors ${
            message.trim() && !disabled
              ? 'bg-[var(--color-highlight)] text-white hover:bg-[var(--color-highlight-soft)]'
              : 'cursor-not-allowed bg-[var(--color-border)] text-[var(--color-text-muted)]'
          }`}
          aria-label={chatInputContent.sendButtonLabel}
        >
          <Send className="w-4 h-4 lg:w-5 lg:h-5" />
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] lg:text-xs text-center text-[var(--color-text-secondary)]">
        {chatInputContent.disclaimer}
      </p>
    </div>
  );
}