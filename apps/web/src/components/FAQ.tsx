import { Plus } from 'lucide-react';

/** The questions people ask before they install. Also emitted as FAQPage structured data on `/`. */
export const FAQS = [
  {
    q: 'Is Worn free?',
    a: 'Yes. It’s free to download, you start with 500 coins, and you earn more every day from streaks, referrals and cashback. Coin packs are there if you want more, but you never have to buy one.',
  },
  {
    q: 'Do I spend real money on the clothes?',
    a: 'No. Everything in Worn Play is priced in coins, and your card is never charged for a haul.',
  },
  {
    q: 'Do I actually get the clothes?',
    a: 'No parcel arrives. Your haul is delivered as photos of you wearing it. If you fall for a piece, every listing links to the store that sells it, and buying it through Worn earns you 25 coins back.',
  },
  {
    q: 'What happens to my photo?',
    a: 'It’s used to make your avatar, so try-ons and reveals look like you. You can delete your photos and avatar any time from your profile.',
  },
  {
    q: 'When can I get it?',
    a: 'Worn is coming to iPhone and Android. Join the list and we’ll email your invite when early access opens.',
  },
  {
    q: 'What is Worn Closet?',
    a: 'The next part of Worn, for the clothes you already own: plan the week’s outfits, track cost per wear, and find the refunds, gift cards and resale money sitting in your wardrobe.',
    link: { href: '/closet', label: 'See Worn Closet' },
  },
] as const;

export function FAQ() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="section-py bg-worn-paper">
      <div className="section grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="ornament w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
            Questions
          </p>
          <h2
            id="faq-title"
            className="mt-5 font-display text-[clamp(34px,4.6vw,60px)] leading-[1.04] tracking-tight text-worn-ink"
          >
            The things people <em className="grad-text">ask first.</em>
          </h2>
        </div>
        <div className="border-t border-worn-rule">
          {FAQS.map((item, i) => (
            <details key={item.q} open={i === 0} className="group border-b border-worn-rule py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-display text-[clamp(20px,2vw,24px)] leading-snug text-worn-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-worn-gold [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus
                  aria-hidden="true"
                  className="mt-1 h-5 w-5 shrink-0 text-worn-gold-deep transition-transform duration-300 group-open:rotate-45"
                />
              </summary>
              <p className="mt-3 max-w-[60ch] text-body-l text-worn-ink-soft">
                {item.a}
                {'link' in item ? (
                  <>
                    {' '}
                    <a href={item.link.href} className="font-semibold text-worn-gold-deep underline-offset-4 hover:underline">
                      {item.link.label} →
                    </a>
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
