import { useEffect, useState } from 'react';
import spinners from 'unicode-animations';

const { frames, interval } = spinners.braille;

export default function PulseSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      aria-hidden="true"
      className="font-mono text-lg leading-none tracking-tight text-[var(--color-loading)] tabular-nums"
    >
      {frames[frame]}
    </span>
  );
}
