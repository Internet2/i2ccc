import { useState } from 'react';
import { ThumbsUp, ThumbsDown, ExternalLink, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
  onFeedback: (messageId: string, rating: 'thumbs_up' | 'thumbs_down', feedbackText?: string) => void;
  isFirstUserMessage?: boolean;
}

export default function MessageBubble({ message, onFeedback, isFirstUserMessage = false }: MessageBubbleProps) {
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [showFeedbackText, setShowFeedbackText] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  const handleFeedback = (rating: 'thumbs_up' | 'thumbs_down') => {
    setFeedback(rating);
    onFeedback(message.id, rating);
    toast.success('Thank you for your feedback!');
    
    if (rating === 'thumbs_down') {
      setShowFeedbackText(true);
    }
  };

  const handleFeedbackSubmit = () => {
    if (feedbackText.trim()) {
      // For text feedback, we'll call with thumbs_down and include the text
      onFeedback(message.id, 'thumbs_down', feedbackText);
      toast.success('Thank you for the detailed feedback!');
      setShowFeedbackText(false);
      setFeedbackText('');
    }
  };

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      toast.error('Clipboard is not available in this environment.');
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
      toast.success('Copied message markdown to clipboard');
    } catch {
      toast.error('Failed to copy message');
    }
  };

  if (message.role === 'user') {
    return (
      <div className={`flex justify-end ${isFirstUserMessage ? 'mt-20' : ''}`}>
        <div className="max-w-xs lg:max-w-md">
          <div className="bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-[var(--color-text-primary)] px-4 py-3 rounded-lg">
            <p>{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-none lg:max-w-3xl animate-chatbot-bubble-enter">
        <div className="px-4 py-3">
          <div className="max-w-none text-[var(--color-text-primary)]">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom styling for markdown elements
                p: ({ children }) => <p className="mt-7 mb-3 first:mt-0 last:mb-0">{children}</p>,
                ul: ({ children, className, ...props }) => (
                  <ul
                    {...props}
                    className={`list-disc pl-9 mb-2 space-y-1 [&_ul]:mt-1 [&_ul]:mb-1 [&_ul]:pl-6 [&_ol]:mt-1 [&_ol]:mb-1 [&_ol]:pl-6${className ? ` ${className}` : ''}`}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children, className, ...props }) => (
                  <ol
                    {...props}
                    className={`list-decimal pl-6 mb-2 space-y-1 [&_ol]:mt-1 [&_ol]:mb-1 [&_ol]:pl-6 [&_ul]:mt-1 [&_ul]:mb-1 [&_ul]:pl-6${className ? ` ${className}` : ''}`}
                  >
                    {children}
                  </ol>
                ),
                li: ({ children, className, ...props }) => (
                  <li
                    {...props}
                    className={`leading-relaxed${className ? ` ${className}` : ''}`}
                  >
                    {children}
                  </li>
                ),
                blockquote: ({ children }) => <blockquote className="border-l-4 border-[var(--color-border)] pl-4 italic">{children}</blockquote>,
                h1: ({ children }) => <h1 className="mb-2 text-xl font-bold">{children}</h1>,
                h2: ({ children }) => <h2 className="mb-2 text-lg font-semibold">{children}</h2>,
                h3: ({ children }) => <h3 className="mb-2 text-base font-semibold">{children}</h3>,
                a: ({ children, href }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline transition-colors duration-200 text-[var(--color-highlight)] hover:text-[var(--color-highlight-soft)]"
                  >
                    {children}
                  </a>
                ),
                code: ({ children, className }) => 
                  className ? 
                    <pre className="mb-2 overflow-x-auto rounded bg-[var(--color-surface-muted)] p-2"><code>{children}</code></pre> :
                    <code className="rounded bg-[var(--color-surface-muted)] px-1 py-0.5">{children}</code>
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        
        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.sources.map((source, index) => (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded bg-[var(--color-surface-muted)] px-2 py-1 text-xs text-[var(--color-highlight)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-highlight-soft)]"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Source: {source.title}</span>
              </a>
            ))}
          </div>
        )}

        {/* Feedback Buttons */}
        <div className="mt-0 flex items-center gap-0.5 pl-4">
          <button
            onClick={handleCopy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Copy response markdown"
          >
            <Copy className="h-4 w-4" />
          </button>

          <button
            onClick={() => handleFeedback('thumbs_up')}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
              feedback === 'thumbs_up' 
                ? 'border-[var(--color-success)] bg-[var(--color-surface-muted)] text-[var(--color-success)]' 
                : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-success)]'
            }`}
            aria-label="Rate response positive"
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => handleFeedback('thumbs_down')}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
              feedback === 'thumbs_down' 
                ? 'border-[var(--color-error)] bg-[var(--color-surface-muted)] text-[var(--color-error)]' 
                : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-error)]'
            }`}
            aria-label="Rate response negative"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>

        {/* Additional feedback text input */}
        {showFeedbackText && (
          <div className="mt-3 rounded-md bg-[var(--color-surface-muted)] p-3">
            <label htmlFor={`feedback-${message.id}`} className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">
              Help us improve (optional):
            </label>
            <textarea
              id={`feedback-${message.id}`}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="What could be better about this response?"
              className="h-20 w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)]"
              rows={3}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleFeedbackSubmit}
                className="rounded-md bg-[var(--color-highlight)] px-3 py-1 text-sm text-white transition-colors hover:bg-[var(--color-highlight-soft)]"
              >
                Submit
              </button>
              <button
                onClick={() => setShowFeedbackText(false)}
                className="px-3 py-1 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}