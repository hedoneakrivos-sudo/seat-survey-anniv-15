import { useState } from 'react';
import { Button } from './ui';

interface Props {
  title: string;
  text: string;
  url: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}

/** Pakai Web Share API di HP, fallback salin link di desktop */
export function ShareButton({ title, text, url, label = 'Ajak teman', variant = 'secondary', className }: Props) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Salin link ini:', url);
    }
  };

  return (
    <Button variant={variant} onClick={share} className={className}>
      <span aria-hidden>🔗</span>
      <span aria-live="polite">{copied ? 'Link tersalin!' : label}</span>
    </Button>
  );
}
