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
              <br /><br />
              Please note: this assistant does not currently save users' chat histories. If you
              want to keep a specific answer, you can copy any chatbot response using the
              square button shown below each bot response. Persistent chats are planned for a future release.
            </p>
          </div>
        </section>

        {/* Background */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            Background
          </h2>
          <div className="prose max-w-none prose-headings:text-[var(--color-text-primary)] prose-p:text-[var(--color-text-secondary)] prose-strong:text-[var(--color-text-primary)]">
            <p>
              Internet2 approached the AWS Cloud Innovation Center at CalPoly to help build
              an assistant for the research and education cloud community. This tool helps
              answer questions related to past activities and presentations, making it easier
              for higher education institutions to access collective knowledge and best practices.
              <br /><br />
              We extend our sincere thanks to the AWS Cloud Innovation Center team at CalPoly
              for their collaboration with Internet2 in bringing this project to life:
            </p>
            <ul className="mt-4 space-y-2 list-disc list-inside text-[var(--color-text-secondary)]">
              <li><strong>Darren Kraker</strong>, Sr Solutions Architect</li>
              <li><strong>Nick Riley</strong>, Jr SDE</li>
              <li><strong>Kartik Malunjkar</strong>, Software Development Engineer Intern</li>
            </ul>
            <p className="mt-4">
              View the original repository:{' '}
              <a
                href="https://github.com/cal-poly-dxhub/internet2-chatbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
              >
                github.com/cal-poly-dxhub/internet2-chatbot
              </a>
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
              <h3 className="mb-3 text-lg font-semibold">Cloud Community Calendars</h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://spaces.at.internet2.edu/spaces/cicp/pages/289113857/Cloud+Infrastructure+Community+Program+Calendar"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                  >
                    CICP Calendar
                  </a>
                </li>
                <li>
                  <a
                    href="https://spaces.at.internet2.edu/pages/viewpage.action?pageId=94274248&spaceKey=CA&title=Higher%2BEd%2BCloud%2BCommunity"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                  >
                    CCCG Calendar
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-3 text-lg font-semibold">NET+ Cloud Programs</h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://internet2.edu/services/amazon-web-services/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                  >
                    NET+ AWS Homepage
                  </a>
                </li>
                <li>
                  <a
                    href="https://internet2.edu/services/google-cloud-platform/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-highlight)] transition-colors hover:text-[var(--color-highlight-soft)]"
                  >
                    NET+ GCP Homepage
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