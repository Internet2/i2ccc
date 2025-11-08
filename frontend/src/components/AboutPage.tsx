import { ArrowLeft } from 'lucide-react';
import { exampleQuestions } from '../data/exampleQuestions';

interface AboutPageProps {
  onQuestionSelect: (question: string) => void;
  onBackToChat: () => void;
}

export default function AboutPage({ onQuestionSelect, onBackToChat }: AboutPageProps) {
  const featuredQuestionIds = ['3', '18', '24', '27', '30'];
  const featuredQuestions = featuredQuestionIds
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
          <span>Back to Chat</span>
        </button>

        {/* What This Assistant Does */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            What This Assistant Does
          </h2>
          <div className="prose max-w-none prose-headings:text-[var(--color-text-primary)] prose-p:text-[var(--color-text-secondary)] prose-strong:text-[var(--color-text-primary)]">
            <p>
              This chatbot helps higher education institutions with cloud infrastructure questions 
              by searching through the Cloud Infrastructure Community Program (CICP) knowledge base. 
              It uses RAG (Retrieval-Augmented Generation) technology to provide accurate, 
              source-backed answers about AWS, GCP, and cloud best practices specifically for 
              higher education environments.
            </p>
          </div>
        </section>

        {/* Example Questions */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            Featured Questions
          </h2>
          <p className="mb-6 text-[var(--color-text-secondary)]">
            Click any question to start a conversation:
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
            Resources and Links
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-lg font-semibold">CICP Resources</h3>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    CICP Calendar & Events
                  </a>
                </li>
                <li>
                  <a href="#" className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    Event Recordings
                  </a>
                </li>
                <li>
                  <a href="#" className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    Community Code Repository
                  </a>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="mb-3 text-lg font-semibold">Best Practice Guides</h3>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    AWS for Higher Education
                  </a>
                </li>
                <li>
                  <a href="#" className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    GCP for Research Computing
                  </a>
                </li>
                <li>
                  <a href="#" className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    Multi-Cloud Strategy Guide
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Contact and Support */}
        <section className="pb-8">
          <h2 className="mb-4 text-2xl font-bold">
            Contact and Support
          </h2>
          <div className="rounded-lg bg-[var(--color-surface-muted)] p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">CICP Membership</h3>
                <p className="text-[var(--color-text-secondary)]">
                  Bob Flynn, Program Manager<br />
                  <a href="mailto:bflynn@internet2.edu" className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]">
                    bflynn@internet2.edu
                  </a>
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Chatbot Feedback</h3>
                <p className="text-[var(--color-text-secondary)]">
                  For bugs, suggestions, or improvements to this chatbot interface.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}