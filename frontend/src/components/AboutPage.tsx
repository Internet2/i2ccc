import { ExternalLink, Info, X } from 'lucide-react';
import { exampleQuestions } from '../data/exampleQuestions';
import { aboutPageContent } from '../data/aboutPageContent';

interface AboutPageProps {
  onQuestionSelect: (question: string) => void;
  onClose: () => void;
}

export default function AboutPage({ onQuestionSelect, onClose }: AboutPageProps) {
  const featuredQuestions = aboutPageContent.sections.featuredQuestions.questionIds
    .map((id) => exampleQuestions.find((question) => question.id === id)?.question)
    .filter((question): question is string => Boolean(question));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky header */}
      <div className="relative border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-4xl items-center px-6 py-4 sm:px-10 sm:py-6">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">About</h1>
        </div>
        <button
          onClick={onClose}
          className="absolute right-6 top-1/2 -translate-y-1/2 rounded-md p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-10 px-6 py-8 text-[var(--color-text-primary)] sm:px-10">
          {/* Hero */}
          <section className="space-y-6">
            <h2 className="text-center text-xl font-semibold italic leading-relaxed">
              {aboutPageContent.sections.whatThisAssistantDoes.tagline}
            </h2>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              {aboutPageContent.sections.whatThisAssistantDoes.content.description.map((segment, index) =>
                typeof segment === 'string' ? (
                  segment
                ) : (
                  <a
                    key={index}
                    href={segment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                  >
                    {segment.text}
                  </a>
                )
              )}
            </p>
            <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-text-secondary)]" />
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {aboutPageContent.sections.whatThisAssistantDoes.content.privacyNote}
              </p>
            </div>
          </section>

          {/* Background */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold">
              {aboutPageContent.sections.background.title}
            </h2>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              {aboutPageContent.sections.background.content.paragraph}
            </p>
            <div className="space-y-1 text-sm text-[var(--color-text-secondary)]">
              <p>
                {aboutPageContent.sections.background.content.sourceRepo.label}{' '}
                <a
                  href={aboutPageContent.sections.background.content.sourceRepo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                >
                  {aboutPageContent.sections.background.content.sourceRepo.text}
                </a>
              </p>
              <p>
                {aboutPageContent.sections.background.content.originalRepo.label}{' '}
                <a
                  href={aboutPageContent.sections.background.content.originalRepo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                >
                  {aboutPageContent.sections.background.content.originalRepo.text}
                </a>
              </p>
            </div>
          </section>

          {/* Featured Questions */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold">
              {aboutPageContent.sections.featuredQuestions.title}
            </h2>
            <div className="grid gap-3">
              {featuredQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => onQuestionSelect(question)}
                  className="glass-card rounded-xl p-4 text-left w-full"
                >
                  <span className="relative z-10 text-[0.8125rem] lg:text-[0.9375rem] font-medium leading-snug tracking-[-0.01em] text-[var(--color-text-primary)]">
                    {question}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Resources and Links */}
          <section className="space-y-6">
            <h2 className="text-2xl font-bold">
              {aboutPageContent.sections.resourcesAndLinks.title}
            </h2>
            <div className="space-y-6">
              <ResourceGroup
                title={aboutPageContent.sections.resourcesAndLinks.cloudCommunityCalendars.title}
                links={aboutPageContent.sections.resourcesAndLinks.cloudCommunityCalendars.links}
              />
              <ResourceGroup
                title={aboutPageContent.sections.resourcesAndLinks.netPlusCloudPrograms.title}
                links={aboutPageContent.sections.resourcesAndLinks.netPlusCloudPrograms.links}
              />
            </div>
          </section>

          {/* Contact and Support */}
          <section className="space-y-6 pb-2">
            <h2 className="text-2xl font-bold">
              {aboutPageContent.sections.contactAndSupport.title}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-[var(--color-surface-muted)] p-5">
                <h3 className="mb-2 font-semibold">
                  {aboutPageContent.sections.contactAndSupport.cicpMembership.title}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {aboutPageContent.sections.contactAndSupport.cicpMembership.name}
                  <br />
                  <a
                    href={`mailto:${aboutPageContent.sections.contactAndSupport.cicpMembership.email}`}
                    className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                  >
                    {aboutPageContent.sections.contactAndSupport.cicpMembership.email}
                  </a>
                </p>
              </div>
              <div className="rounded-lg bg-[var(--color-surface-muted)] p-5">
                <h3 className="mb-2 font-semibold">
                  {aboutPageContent.sections.contactAndSupport.chatbotFeedback.title}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {aboutPageContent.sections.contactAndSupport.chatbotFeedback.description}
                </p>
                <a
                  href={aboutPageContent.sections.contactAndSupport.chatbotFeedback.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                >
                  {aboutPageContent.sections.contactAndSupport.chatbotFeedback.linkText}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

interface ResourceLink {
  text: string;
  description: string;
  url: string;
}

function ResourceGroup({
  title,
  links,
}: {
  title: string;
  links: readonly ResourceLink[];
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {title}
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {links.map((link, index) => (
          <a
            key={index}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card group block rounded-xl p-4"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {link.text}
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-highlight)]" />
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {link.description}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}