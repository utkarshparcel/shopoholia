'use client';

import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/site';

type List = 'play' | 'closet';
type Field = 'name' | 'email' | 'phone';
type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done' }
  // `field`: the input the message is about. `mail`: end the message with a mailto link to
  // CONTACT_EMAIL, the way round a failed sign-up.
  | { kind: 'error'; message: string; field?: Field; mail?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* Digits with the usual separators; 7 to 15 digits covers real numbers (E.164 tops out at 15). */
const PHONE = /^\+?[\d\s().-]+$/;
const phoneOk = (value: string) => {
  const digits = value.replace(/\D/g, '').length;
  return PHONE.test(value) && digits >= 7 && digits <= 15;
};

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

const FIELD =
  'min-h-[44px] w-full min-w-0 rounded-pill border border-worn-paper/15 bg-worn-paper/10 px-4 text-[15px] text-worn-paper placeholder:text-worn-paper/50 transition-colors focus:border-worn-gold focus:outline-none aria-[invalid=true]:border-worn-gold';

/**
 * Early-access sign-up for the dark CTA sections: name, email and phone, posted to /api/join, where
 * the site's Worker (apps/web/worker) emails the details to the founders' inbox.
 */
export function WaitlistForm({ list }: { list: List }) {
  const id = useId();
  const copy = COPY[list];
  const [state, setState] = useState<State>({ kind: 'idle' });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? '').trim();
    const name = value('name');
    const email = value('email');
    const phone = value('phone');
    const reject = (field: Field, message: string) => {
      setState({ kind: 'error', field, message });
      (form.elements.namedItem(field) as HTMLInputElement | null)?.focus();
    };
    if (!name) return reject('name', 'Tell us your name.');
    if (!EMAIL.test(email)) return reject('email', 'Enter an email address like name@example.com.');
    if (!phoneOk(phone)) return reject('phone', 'Enter a phone number with its country code, like +91 98765 43210.');
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          list,
          page: window.location.pathname,
          referrer: document.referrer,
          website: value('website'),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (body.error === 'rate_limited') {
        setState({ kind: 'error', message: 'Too many sign-ups from here just now. Try again in a minute.' });
        return;
      }
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
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

  const invalid = (field: Field) => state.kind === 'error' && state.field === field;

  return (
    <form
      onSubmit={submit}
      onChange={() => state.kind === 'error' && setState({ kind: 'idle' })}
      noValidate
      className="w-full max-w-[480px]"
    >
      <div className="grid gap-2 rounded-[28px] border border-worn-paper/20 bg-worn-paper/10 p-2 backdrop-blur sm:grid-cols-2">
        <label htmlFor={`${id}-name`} className="sr-only">
          Your name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Your name"
          aria-invalid={invalid('name')}
          aria-describedby={`${id}-note`}
          className={FIELD}
        />
        <label htmlFor={`${id}-phone`} className="sr-only">
          Phone number, with country code
        </label>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="Phone, with country code"
          aria-invalid={invalid('phone')}
          aria-describedby={`${id}-note`}
          className={FIELD}
        />
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          aria-invalid={invalid('email')}
          aria-describedby={`${id}-note`}
          className={`${FIELD} sm:col-span-2`}
        />
        {/* Bots fill every field; people never see this one. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button
          type="submit"
          disabled={state.kind === 'sending'}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-pill bg-worn-paper px-6 text-[15px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold disabled:opacity-70 sm:col-span-2"
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
