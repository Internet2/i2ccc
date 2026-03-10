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
      <div className="glass-input flex items-end gap-3 rounded-xl px-4 py-3">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={chatInputContent.placeholder}
          className="w-full resize-none bg-transparent text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none leading-relaxed tracking-[-0.01em]"
          rows={2}
          disabled={disabled}
          style={{ maxHeight: '160px', overflowY: 'auto' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full mb-0.5 transition-all duration-200 ${
            canSend
              ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-black shadow-[0_1px_3px_rgba(0,0,0,0.15)] hover:scale-105 active:scale-95'
              : 'bg-[rgba(0,0,0,0.07)] dark:bg-[rgba(255,255,255,0.08)] text-[var(--color-text-muted)] cursor-not-allowed'
          }`}
          aria-label={chatInputContent.sendButtonLabel}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[10px] lg:text-[11px] text-center text-[var(--color-text-muted)] tracking-[-0.005em]">
        {chatInputContent.disclaimer}
      </p>
    </div>
  );
}
