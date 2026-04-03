import { useRef, useState, useEffect } from 'react';
import { privacyNoticeContent } from '../data/privacyNoticeContent';

interface PrivacyNoticeProps {
  onAcknowledge: () => void;
}

export default function PrivacyNotice({ onAcknowledge }: PrivacyNoticeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // If content doesn't overflow, enable the button immediately
    if (el.scrollHeight <= el.clientHeight + 1) {
      setHasScrolledToBottom(true);
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        setHasScrolledToBottom(true);
      }
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--color-surface)] rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl animate-fadeInUp">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {privacyNoticeContent.title}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {privacyNoticeContent.subtitle} &middot; Effective {privacyNoticeContent.effectiveDate}
          </p>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-[0.8125rem] leading-relaxed text-[var(--color-text-secondary)]"
        >
          {/* Intro */}
          <p>
            {privacyNoticeContent.intro.split('Internet2 Website Privacy Statement').map((part, i) =>
              i === 0 ? (
                <span key={i}>
                  {part}
                  <a
                    href={privacyNoticeContent.websitePrivacyStatementUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-highlight)] hover:underline"
                  >
                    Internet2 Website Privacy Statement
                  </a>
                </span>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>

          <p>{privacyNoticeContent.introDescription}</p>

          <p className="italic text-[var(--color-text-muted)]">
            {privacyNoticeContent.introNote}
          </p>

          {/* Sections */}
          {privacyNoticeContent.sections.map((section, index) => (
            <div key={index}>
              <h3 className="text-[0.875rem] font-semibold text-[var(--color-text-primary)] mb-2">
                {section.title}
              </h3>
              <p>{section.content}</p>

              {/* Subsections (for "Information We Collect") */}
              {'subsections' in section && section.subsections?.map((sub, subIdx) => (
                <div key={subIdx} className="mt-3">
                  <h4 className="text-[0.8125rem] font-medium text-[var(--color-text-primary)] mb-1">
                    {sub.title}
                  </h4>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    {sub.items.map((item, itemIdx) => (
                      <li key={itemIdx}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Simple items list */}
              {'items' in section && !('subsections' in section) && section.items && (
                <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                  {section.items.map((item, itemIdx) => (
                    <li key={itemIdx}>{item}</li>
                  ))}
                </ul>
              )}

              {/* Note callout */}
              {'note' in section && section.note && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border-soft)] text-[0.75rem] text-[var(--color-text-muted)]">
                  <strong>Note:</strong> {section.note}
                </div>
              )}

              {/* Additional content paragraph */}
              {'additionalContent' in section && section.additionalContent && (
                <p className="mt-2">{section.additionalContent}</p>
              )}

              {/* Footer */}
              {'footer' in section && section.footer && (
                <p className="mt-2">{section.footer}</p>
              )}
            </div>
          ))}

          {/* Questions */}
          <div>
            <h3 className="text-[0.875rem] font-semibold text-[var(--color-text-primary)] mb-2">
              Questions?
            </h3>
            <p>
              {privacyNoticeContent.questions.text}{' '}
              <a
                href={`mailto:${privacyNoticeContent.questions.email}`}
                className="text-[var(--color-highlight)] hover:underline"
              >
                {privacyNoticeContent.questions.email}
              </a>.
            </p>
          </div>

          <p className="italic text-[var(--color-text-muted)]">
            {privacyNoticeContent.closing}
          </p>
        </div>

        {/* Footer with acknowledge button */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-4">
          {!hasScrolledToBottom && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Please scroll through the notice to continue
            </p>
          )}
          <div className="ml-auto">
            <button
              onClick={onAcknowledge}
              disabled={!hasScrolledToBottom}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
                hasScrolledToBottom
                  ? 'bg-white text-black border border-[var(--color-border)] hover:bg-neutral-200 cursor-pointer'
                  : 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] cursor-not-allowed'
              }`}
            >
              {privacyNoticeContent.acknowledgeButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
