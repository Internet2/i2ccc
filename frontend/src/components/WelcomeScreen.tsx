import { exampleQuestions } from '../data/exampleQuestions';
import { welcomeScreenContent } from '../data/welcomeScreenContent';

interface WelcomeScreenProps {
  onQuestionSelect: (question: string) => void;
}

export default function WelcomeScreen({ onQuestionSelect }: WelcomeScreenProps) {
  const featuredQuestions = welcomeScreenContent.featuredQuestionIds
    .map((id) => exampleQuestions.find((question) => question.id === id)?.question)
    .filter((question): question is string => Boolean(question));

  const getDelayClass = (index: number) => {
    const delays = ['animate-fadeInUp-delay-1', 'animate-fadeInUp-delay-2', 'animate-fadeInUp-delay-3'];
    return delays[index] || '';
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="mx-auto w-full max-w-2xl space-y-8 lg:space-y-10 text-center px-4">
        {/* Welcome heading */}
        <div className="animate-fadeInUp space-y-3">
          <h1 className="text-[28px] lg:text-[40px] font-bold leading-[1.07] tracking-[-0.025em] text-[var(--color-text-primary)]">
            {welcomeScreenContent.title.line1}<br />{welcomeScreenContent.title.line2}
          </h1>
          <p className="text-[15px] lg:text-[17px] text-[var(--color-text-secondary)] leading-relaxed tracking-[-0.01em] max-w-lg mx-auto">
            {welcomeScreenContent.subtitle}
          </p>
        </div>

        {/* Featured question cards */}
        <div className="grid w-full gap-3">
          {featuredQuestions.map((question, index) => (
            <button
              key={index}
              onClick={() => onQuestionSelect(question)}
              className={`glass-card rounded-xl p-4 text-left w-full ${getDelayClass(index)}`}
            >
              <span className="relative z-10 text-[13px] lg:text-[15px] font-medium leading-snug tracking-[-0.01em] text-[var(--color-text-primary)]">
                {question}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
