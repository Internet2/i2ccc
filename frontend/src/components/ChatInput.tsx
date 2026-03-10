import { useState, useRef, type KeyboardEvent, type ChangeEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { chatInputContent } from '../data/chatInputContent';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSendMessage, disabled = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = !!message.trim() && !disabled;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 focus-within:ring-2 focus-within:ring-[var(--color-loading)] focus-within:border-transparent transition-shadow">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={chatInputContent.placeholder}
          className="w-full resize-none bg-transparent text-sm lg:text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none leading-relaxed"
          rows={3}
          disabled={disabled}
          style={{ maxHeight: '160px', overflowY: 'auto' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-colors mb-0.5 ${
            canSend
              ? 'bg-[var(--color-loading)] text-white hover:bg-[var(--color-text-secondary)]'
              : 'bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed'
          }`}
          aria-label={chatInputContent.sendButtonLabel}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] lg:text-xs text-center text-[var(--color-text-secondary)]">
        {chatInputContent.disclaimer}
      </p>
    </div>
  );
}
