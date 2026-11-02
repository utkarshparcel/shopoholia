'use client';

import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Mail } from 'lucide-react';
import { CONTACT_EMAIL, WAITLIST_URL } from '@/lib/site';

type List = 'play' | 'closet';
type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done' }
  // `mail`: end the message with a mailto link to CONTACT_EMAIL, the way round a failed sign-up
  | { kind: 'error'; message: string; mail?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const COPY: Record<List, { button: string; subject: string; done: string }> = {
  play: {
    button: 'Request early access',
    subject: 'Worn Play early access',
    done: 'You’re on the list. We’ll email you when your invite is ready.',
  },
  closet: {
    button: 'Join the Closet list',
    subject: 'Worn Closet early access',
    done: 'You’re on the Closet list. You’ll hear first when it opens.',
  },
};

/**
 * Early-access sign-up for the dark CTA sections. Sign-ups go to a Google Sheet through an Apps Script
 * web app; until NEXT_PUBLIC_WAITLIST_URL is set it stays the old email button.
 */
export function WaitlistForm({ list }: { list: List }) {
  const id = useId();
  const copy = COPY[list];
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  if (!WAITLIST_URL) {
    return (
      <a
        href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(copy.subject)}`}
        className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-worn-paper px-7 text-[15px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
      >
        <Mail className="h-4 w-4" aria-hidden="true" /> {copy.button}
      </a>
    );
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setState({ kind: 'error', message: 'Enter an email address like name@example.com.' });
      return;
    }
    setState({ kind: 'sending' });
    try {
      // A plain form post: no preflight, and Apps Script answers it with CORS headers.
      const body = new URLSearchParams({
        email: value,
        list,
        page: window.location.pathname,
        referrer: document.referrer,
        website: String(new FormData(e.currentTarget).get('website') ?? ''),
      });
      const res = await fetch(WAITLIST_URL, { method: 'POST', body });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || 'not added');
      setState({ kind: 'done' });
    } catch {
      setState({
        kind: 'error',
        message: 'We couldn’t add you just now. Try again, or email',
        mail: true,
      });
    }
  };

  if (state.kind === 'done') {
    return (
      <p role="status" className="inline-flex items-center gap-2 rounded-pill bg-worn-paper/10 px-6 py-3 text-[15px] font-semibold text-worn-paper">
        <Check className="h-4 w-4 text-worn-gold" aria-hidden="true" /> {copy.done}
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="w-full max-w-[480px]">
      <div className="flex flex-col gap-2 rounded-[28px] border border-worn-paper/20 bg-worn-paper/10 p-1.5 backdrop-blur sm:flex-row sm:rounded-pill">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state.kind === 'error') setState({ kind: 'idle' });
          }}
          aria-invalid={state.kind === 'error'}
          aria-describedby={`${id}-note`}
          className="min-h-[44px] min-w-0 flex-1 bg-transparent px-4 text-[15px] text-worn-paper placeholder:text-worn-paper/50 focus:outline-none"
        />
        {/* Bots fill every field; people never see this one. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button
          type="submit"
          disabled={state.kind === 'sending'}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-pill bg-worn-paper px-6 text-[15px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold disabled:opacity-70"
        >
          {state.kind === 'sending' ? 'Adding you…' : copy.button}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p id={`${id}-note`} role="status" className="mt-3 min-h-[1.5em] text-center text-caption text-worn-paper/70">
        {state.kind === 'error' ? (
          <>
            {state.message}
            {state.mail ? (
              <>
                {' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(copy.subject)}`}
                  className="text-worn-gold underline underline-offset-2 hover:text-worn-paper"
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </>
            ) : null}
          </>
        ) : (
          'One email when your invite is ready. No spam.'
        )}
      </p>
    </form>
  );
}
