import type { Metadata } from 'next';
import { PageShell } from '@/components/PageShell';
import { CONTACT_EMAIL, PRIVACY_EMAIL, PRIVACY_PATH, SUPPORT_PATH } from '@/lib/site';

const TITLE = 'Support';
const DESCRIPTION = 'Get help with Worn: who to email about the app, your account, your photos and your data.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SUPPORT_PATH },
  openGraph: { type: 'website', siteName: 'Worn', title: `${TITLE} | Worn`, description: DESCRIPTION, url: SUPPORT_PATH },
  twitter: { card: 'summary_large_image', title: `${TITLE} | Worn`, description: DESCRIPTION },
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-worn-rule bg-worn-surface p-6 shadow-card sm:p-8">
      <h2 className="font-display text-display-m text-worn-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-body-l text-worn-ink-soft">{children}</div>
    </section>
  );
}

function Mail({ address, subject }: { address: string; subject?: string }) {
  const href = `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
  return (
    <a href={href} className="break-all font-semibold text-worn-gold-deep underline underline-offset-2 hover:text-worn-ink">
      {address}
    </a>
  );
}

export default function SupportPage() {
  return (
    <PageShell>
      <div className="section py-12 sm:py-20">
        <div className="mx-auto max-w-[760px]">
          <p className="ornament w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">Support</p>
          <h1 className="mt-5 text-balance font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-tight text-worn-ink">
            How can we help?
          </h1>
          <p className="mt-5 max-w-[56ch] text-body-l text-worn-ink-soft">
            Email us. Write from the email address you use with Worn, so we can find your account.
          </p>

          <div className="mt-10 grid gap-5">
            <Card title="Questions, problems, feedback">
              <p>
                Something not working in the app, a question about coins, a haul or a render, or an idea: email{' '}
                <Mail address={CONTACT_EMAIL} subject="Worn support" />.
              </p>
            </Card>

            <Card title="Your photos and avatar">
              <p>
                You can delete the photos you uploaded and your avatar any time in the app: open{' '}
                <strong className="text-worn-ink">Profile</strong> and tap{' '}
                <strong className="text-worn-ink">Delete my photos</strong>.
              </p>
            </Card>

            <Card title="Your data and your account">
              <p>
                To ask for a copy of your data, or for your account and its data to be deleted, email{' '}
                <Mail address={PRIVACY_EMAIL} subject="Worn data request" /> from the address you sign in with.
              </p>
              <p>
                How we handle your data is in the{' '}
                <a href={PRIVACY_PATH} className="font-semibold text-worn-gold-deep underline underline-offset-2 hover:text-worn-ink">
                  privacy policy
                </a>
                .
              </p>
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
