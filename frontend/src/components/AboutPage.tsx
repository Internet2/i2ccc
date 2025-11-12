import { ArrowLeft } from 'lucide-react';
import { exampleQuestions } from '../data/exampleQuestions';
import { aboutPageContent } from '../data/aboutPageContent';

interface AboutPageProps {
  onQuestionSelect: (question: string) => void;
  onBackToChat: () => void;
}

export default function AboutPage({ onQuestionSelect, onBackToChat }: AboutPageProps) {
  const featuredQuestions = aboutPageContent.sections.featuredQuestions.questionIds
    .map((id) => exampleQuestions.find((question) => question.id === id)?.question)
    .filter((question): question is string => Boolean(question));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-8 p-6 text-[var(--color-text-primary)]">
        {/* Back to Chat Button */}
        <button
          onClick={onBackToChat}
          className="mb-6 flex items-center gap-2 text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{aboutPageContent.backToChat}</span>
        </button>

        {/* What This Assistant Does */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            {aboutPageContent.sections.whatThisAssistantDoes.title}
          </h2>
          <div className="prose max-w-none prose-headings:text-[var(--color-text-primary)] prose-p:text-[var(--color-text-secondary)] prose-strong:text-[var(--color-text-primary)]">
            <p>
              {aboutPageContent.sections.whatThisAssistantDoes.content.paragraph1}
              <br /><br />
              {aboutPageContent.sections.whatThisAssistantDoes.content.paragraph2}
            </p>
          </div>
        </section>

        {/* Background */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            {aboutPageContent.sections.background.title}
          </h2>
          <div className="prose max-w-none prose-headings:text-[var(--color-text-primary)] prose-p:text-[var(--color-text-secondary)] prose-strong:text-[var(--color-text-primary)]">
            <p>
              {aboutPageContent.sections.background.content.paragraph1}
              <br /><br />
              {aboutPageContent.sections.background.content.paragraph2}
            </p>
            <ul className="mt-4 space-y-2 list-disc list-inside text-[var(--color-text-secondary)]">
              {aboutPageContent.sections.background.content.teamMembers.map((member, index) => (
                <li key={index}><strong>{member.name}</strong>, {member.role}</li>
              ))}
            </ul>
            <p className="mt-4">
              {aboutPageContent.sections.background.content.repositoryLabel}{' '}
              <a
                href={aboutPageContent.sections.background.content.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
              >
                {aboutPageContent.sections.background.content.repositoryText}
              </a>
            </p>
          </div>
        </section>

        {/* Example Questions */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            {aboutPageContent.sections.featuredQuestions.title}
          </h2>
          <p className="mb-6 text-[var(--color-text-secondary)]">
            {aboutPageContent.sections.featuredQuestions.description}
          </p>
          <div className="grid gap-4">
            {featuredQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => onQuestionSelect(question)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-all hover:border-[var(--color-highlight)] hover:shadow-md"
              >
                <span>{question}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Resources and Links */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            {aboutPageContent.sections.resourcesAndLinks.title}
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-lg font-semibold">{aboutPageContent.sections.resourcesAndLinks.cloudCommunityCalendars.title}</h3>
              <ul className="space-y-2">
                {aboutPageContent.sections.resourcesAndLinks.cloudCommunityCalendars.links.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-3 text-lg font-semibold">{aboutPageContent.sections.resourcesAndLinks.netPlusCloudPrograms.title}</h3>
              <ul className="space-y-2">
                {aboutPageContent.sections.resourcesAndLinks.netPlusCloudPrograms.links.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Contact and Support */}
        <section className="pb-8">
          <h2 className="mb-4 text-2xl font-bold">
            {aboutPageContent.sections.contactAndSupport.title}
          </h2>
          <div className="rounded-lg bg-[var(--color-surface-muted)] p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">{aboutPageContent.sections.contactAndSupport.cicpMembership.title}</h3>
                <p className="text-[var(--color-text-secondary)]">
                  {aboutPageContent.sections.contactAndSupport.cicpMembership.name}<br />
                  <a href={`mailto:${aboutPageContent.sections.contactAndSupport.cicpMembership.email}`} className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    {aboutPageContent.sections.contactAndSupport.cicpMembership.email}
                  </a>
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{aboutPageContent.sections.contactAndSupport.chatbotFeedback.title}</h3>
                <p className="text-[var(--color-text-secondary)]">
                  {aboutPageContent.sections.contactAndSupport.chatbotFeedback.description}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}