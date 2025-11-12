import { exampleQuestions } from '../data/exampleQuestions';
import { welcomeScreenContent } from '../data/welcomeScreenContent';

interface WelcomeScreenProps {
  onQuestionSelect: (question: string) => void;
}

export default function WelcomeScreen({ onQuestionSelect }: WelcomeScreenProps) {
  const featuredQuestions = welcomeScreenContent.featuredQuestionIds
    .map((id) => exampleQuestions.find((question) => question.id === id)?.question)
    .filter((question): question is string => Boolean(question));

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="mx-auto w-full max-w-2xl space-y-8 text-center text-[var(--color-text-primary)] animate-fadeIn">
        {/* Welcome Message */}
        <div>
          <h1 className="mb-4 text-3xl font-bold">
            {welcomeScreenContent.title.line1}<br />{welcomeScreenContent.title.line2}
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            {welcomeScreenContent.subtitle}
          </p>
        </div>

        {/* Featured Question Cards */}
        <div className="grid w-full gap-4">
          {featuredQuestions.map((question, index) => (
            <button
              key={index}
              onClick={() => onQuestionSelect(question)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left text-[var(--color-text-primary)] shadow-sm transition-all hover:border-[var(--color-highlight)] hover:shadow-md"
            >
              <span className="font-medium">{question}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}