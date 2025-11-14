import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface LoginPageProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function LoginPage({ theme, onToggleTheme }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Send authentication request with password in custom header
      const response = await fetch('/api/auth', {
        method: 'GET',
        headers: {
          'X-Auth-Password': password,
        },
        credentials: 'include', // Ensure cookies are included
      });

      if (response.ok) {
        // Authentication successful - wait a moment for cookie to be set
        await new Promise(resolve => setTimeout(resolve, 100));
        // Hard reload to ensure cookie is picked up
        window.location.reload();
      } else {
        setError('Invalid password. Please try again.');
        setPassword('');
        setIsLoading(false);
      }
    } catch (err) {
      setError('Authentication failed. Please try again.');
      setPassword('');
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full items-center justify-center bg-[var(--color-background)]">
      {/* Theme Toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <div className="mx-auto w-full max-w-md space-y-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-lg">
        {/* Header */}
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-[var(--color-text-primary)]">
            Welcome
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Please enter the password to access the chatbot
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 pr-10 text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-highlight)] focus:outline-none focus:ring-1 focus:ring-[var(--color-highlight)]"
                required
                disabled={isLoading}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full rounded-lg bg-[var(--color-highlight)] px-4 py-2 font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Authenticating...' : 'Login'}
          </button>
        </form>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] pt-4 text-center text-xs text-[var(--color-text-tertiary)]">
          Protected access · Internet2 Cloud Infrastructure Community Program
        </div>
      </div>
    </div>
  );
}
