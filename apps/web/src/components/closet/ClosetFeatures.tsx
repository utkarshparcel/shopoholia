'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Sunrise,
  ScanFace,
  CalendarDays,
  Users,
  Inbox,
  Tags,
  Layers,
  ClipboardList,
  Coins,
  Flame,
  ChartPie,
  Trophy,
  Gift,
  ShieldCheck,
  Banknote,
  Receipt,
  Calculator,
  Wallet,
  Landmark,
  FileDown,
  Store,
  ArrowLeftRight,
  PackageOpen,
  Ruler,
  Scissors,
  Eye,
  Signature,
  HardDriveDownload,
} from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

type FeatureCard = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

type ClosetSection = {
  id: string;
  kicker: string;
  pain: string;
  titlePre: string;
  titleGrad: string;
  titlePost?: string;
  blurb?: string;
  tone: 'paper' | 'warm';
  cards: FeatureCard[];
  catches?: string[];
  chips?: string[];
};

const SECTIONS: ClosetSection[] = [
  {
    id: 'today',
    kicker: 'Today · Dress, decided',
    pain: 'It’s 8:02 and nothing in here goes together.',
    titlePre: 'Your morning, minus the',
    titleGrad: 'mirror standoff.',
    tone: 'paper',
    blurb:
      'Every morning, Today hands you an outfit before you ask. Try it on your own avatar, plan the week, and let friends break the tie.',
    cards: [
      {
        icon: Sunrise,
        title: 'Morning outfit, decided',
        copy: 'Worn picks an outfit from your actual closet, with weather, calendar and laundry state included. One notification, zero drawers turned upside down.',
      },
      {
        icon: ScanFace,
        title: 'Avatar try-on',
        copy: 'Try-on renders show the pick on you, from your own measurements, before you get dressed.',
      },
      {
        icon: CalendarDays,
        title: 'Week planner',
        copy: 'Lay out Tuesday’s offsite, Thursday’s dinner and the weekend trip on one screen. Less thinking, more wearing.',
      },
      {
        icon: Users,
        title: 'Friend polls',
        copy: 'Can’t choose between the green and the blue? Send both to your poll circle and get a verdict in minutes.',
      },
    ],
  },
  {
    id: 'wardrobe',
    kicker: 'Wardrobe · Autopilot, on',
    pain: 'Two hundred pieces. Twenty in rotation. No idea what’s in the back.',
    titlePre: 'A closet that',
    titleGrad: 'files itself.',
    tone: 'warm',
    blurb:
      'Worn does the cataloguing you never got around to, from every order email and receipt to every photo dump and care label.',
    cards: [
      {
        icon: Inbox,
        title: 'One-tap imports',
        copy: 'Purchases arrive from your order emails and receipts, matched to the right product. One tap and they’re in your wardrobe with brand, price, size and materials.',
      },
      {
        icon: Tags,
        title: 'Photo-dump triage',
        copy: 'Drop a messy camera roll. AI tags colour, category, season and feel, and files each piece where it belongs. Lend and borrow entries get tracked too, so nothing walks off.',
      },
      {
        icon: Layers,
        title: 'Capsules & rotations',
        copy: 'Build capsules, set laundry rules, and let the seasonal swap move summer out and winter in automatically.',
      },
      {
        icon: ClipboardList,
        title: 'Care, handled',
        copy: 'Care-label OCR files the instructions, raises dry-clean tickets, and nudges your shoe and bag rotation so nothing sits moulded in a dust bag.',
      },
    ],
  },
  {
    id: 'worth',
    kicker: 'Wear & Worth · The honest maths',
    pain: 'That dress cost a fortune and has been worn once.',
    titlePre: 'Every piece, priced',
    titleGrad: 'by proof.',
    tone: 'paper',
    blurb:
      'Retail price tells you what something cost. Worn tells you what it earns: wears logged, streaks kept, and waste called out.',
    cards: [
      {
        icon: Coins,
        title: 'Cost-per-wear, live',
        copy: 'A coat worn 48 times costs a fraction of its tag per wear, and the number drops every time you dress. Watch it fall on everything you own.',
      },
      {
        icon: Flame,
        title: 'Wear streaks, in coins',
        copy: 'Keep a rewearing streak going and Worn pays you in gold coins. Small ritual, real dopamine, cheaper wardrobe.',
      },
      {
        icon: ChartPie,
        title: 'Waste tracker',
        copy: 'The never-worn section totals every dollar of dead stock hanging unworn. Worn keeps the score so you stop repeating it.',
      },
      {
        icon: Trophy,
        title: 'Rewear challenges',
        copy: '30 days, 30 pieces, nothing new. Rewear and declutter challenges with friends keep the pressure fun and the tally honest.',
      },
    ],
  },
  {
    id: 'vault',
    kicker: 'Vault · Found money',
    pain: 'A gift card expiring somewhere, a warranty with no receipt, a refund that never came.',
    titlePre: 'Money you forgot is',
    titleGrad: 'found money.',
    tone: 'warm',
    blurb:
      'Gift cards expiring, warranties lapsing, refunds drifting. The Vault tracks every claim your closet is owed and chases it before the deadline.',
    cards: [
      {
        icon: Gift,
        title: 'Gift-card vault',
        copy: 'Every card with its balance in one place, and expiry rescue that gets a card spent before it zeroes out.',
      },
      {
        icon: ShieldCheck,
        title: 'Warranty claims, filed',
        copy: 'Purchases with warranty rights surface with their deadlines and claim nudges, before the window closes.',
      },
      {
        icon: Banknote,
        title: 'Refund ledger',
        copy: 'Each return with its ETA, and refund chasing that flags the merchant when the number goes quiet.',
      },
      {
        icon: Receipt,
        title: 'Receipts vault',
        copy: 'Every receipt, searchable and export-ready. The paper trail a claim, resale or return ever needs.',
      },
    ],
    catches: [
      'Gift cards before they expire',
      'Warranties with the receipt attached',
      'Refunds that never landed',
      'Every receipt, searchable',
    ],
  },
  {
    id: 'accountant',
    kicker: 'Accountant · Books, balanced',
    pain: 'No idea what the closet costs a month, or what it’s worth.',
    titlePre: 'Your closet runs a',
    titleGrad: 'P&L.',
    tone: 'paper',
    blurb:
      'Worn books your wardrobe like an asset: spend, wear, returns and residual value, with a soft hand at checkout and a clean export at tax time.',
    cards: [
      {
        icon: Calculator,
        title: 'Closet P&L',
        copy: 'One ledger of what you bought, what you actually wore, what you returned and what your closet is worth today.',
      },
      {
        icon: Wallet,
        title: 'Budgets with a soft gate',
        copy: 'Set a monthly line. As you near it, checkout triggers a gentle pause and your own wardrobe becomes the first recommendation.',
      },
      {
        icon: Landmark,
        title: '"EMI don’t miss"',
        copy: 'Instalments tracked with due dates and small nudges, so a splurge never turns into a late fee.',
      },
      {
        icon: FileDown,
        title: 'Tax-ready export',
        copy: 'Seasonal ROI, resale gains and care spend rolled into one clean, exportable pack for whoever does your taxes.',
      },
    ],
  },
  {
    id: 'market',
    kicker: 'Market & Gifts · Out with grace',
    pain: 'A pile to sell, donate or swap that never leaves the floor.',
    titlePre: 'Sold, swapped or',
    titleGrad: 'wrapped as a gift.',
    tone: 'warm',
    blurb:
      'When a piece stops earning wears, Worn routes it to its next owner, with pricing, pickup and wrapping handled.',
    cards: [
      {
        icon: Store,
        title: 'Sell, donate, barter',
        copy: 'Price suggestions from live comps, one listing to every channel, and pickup booking straight from the app.',
      },
      {
        icon: ArrowLeftRight,
        title: 'Swap circles',
        copy: 'Trade pieces with people your size. Invite codes bring your friends in; sizes and taste match the rest.',
      },
      {
        icon: PackageOpen,
        title: 'Gift recipients',
        copy: 'Save their sizes, taste, wishlist and festival dates, and never gift a candle to a person who wanted boots.',
      },
    ],
  },
  {
    id: 'fit',
    kicker: 'Fit · Nothing sits wrong',
    pain: 'L in one brand, M in another, and the tailor has the only measurements.',
    titlePre: 'Buy the size that',
    titleGrad: 'actually fits.',
    tone: 'paper',
    blurb:
      'Fit failures are the quietest form of waste. Worn sizes first, commits second.',
    cards: [
      {
        icon: Ruler,
        title: 'Measurement profiles',
        copy: 'Your measurements, per person in the household, kept current. Every product checked against them at checkout.',
      },
      {
        icon: Scissors,
        title: 'Tailoring, tracked',
        copy: 'Alteration orders with status and pickup dates tracked like a package, from hem to final press.',
      },
      {
        icon: Eye,
        title: 'Fit preview',
        copy: 'See the drape, length and looseness on your avatar before you commit. Returns avoided, not processed.',
      },
    ],
  },
  {
    id: 'privacy',
    kicker: 'Privacy & Household · Yours, on record',
    pain: 'A closet is personal. So is who gets to see it.',
    titlePre: 'One closet per home,',
    titleGrad: 'one ledger per soul.',
    tone: 'warm',
    blurb:
      'A wardrobe app reads a lot of email. Worn earns that access in the open: explicit consent, shared but auditable space, and an exit with no baggage.',
    cards: [
      {
        icon: Users,
        title: 'Household vault, shared',
        copy: 'Family items, sizes and hand-me-downs in one shared space, with clear lines between mine, yours and ours.',
      },
      {
        icon: Signature,
        title: 'Consent, explicitly given',
        copy: 'Every email or SMS source is connected with a dated, explicit consent entry. Revocable at any time, logged forever.',
      },
      {
        icon: HardDriveDownload,
        title: 'Export, audit, delete',
        copy: 'Download everything, read the access log, or trigger a hard delete. Departure is a feature, not a maze.',
      },
    ],
    chips: ['Consent ledger', 'Export anytime', 'Hard delete'],
  },
];

export function ClosetFeatures() {
  const reduced = useReducedMotion();

  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  return (
    <div>
      {SECTIONS.map(
        (s: ClosetSection) => (
          <section
            key={`section-${s.id}`}
            id={s.id}
            className={
              s.tone === 'warm'
                ? 'scroll-mt-24 border-y border-worn-rule bg-worn-warm'
                : 'scroll-mt-24 bg-worn-paper'
            }
          >
            <div className="section section-py">
              {/* Heading: pain first, then the fix */}
              <motion.div
                key={`head-${s.id}`}
                {...a}
                variants={rise}
                custom={0}
              >
                <p className="ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">
                  {s.kicker}
                </p>

                <p className="mt-7 font-mono text-micro uppercase tracking-[0.28em] text-worn-muted">
                  The pain
                </p>
                <p className="mt-2 max-w-[34ch] font-display italic text-[clamp(22px,2.8vw,34px)] leading-[1.2] tracking-[-0.01em] text-worn-ink-soft text-balance">
                  {s.pain}
                </p>

                <p className="mt-7 font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">
                  The fix
                </p>
                <h2 className="mt-3 max-w-[22ch] font-display text-[clamp(32px,4.5vw,56px)] leading-[1.04] tracking-[-0.015em] text-worn-ink text-balance">
                  {s.titlePre} <em className="grad-text font-display">{s.titleGrad}</em>
                  {s.titlePost ? ` ${s.titlePost}` : ''}
                </h2>
                {s.blurb ? (
                  <p className="mt-4 max-w-[58ch] text-body-l text-worn-muted">{s.blurb}</p>
                ) : null}
              </motion.div>

              {/* Cards */}
              <div
                className={`mt-10 grid gap-4 sm:gap-6 ${
                  s.cards.length === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'
                }`}
              >
                {s.cards.map(
                  (card: FeatureCard, i: number) => {
                    const Icon = card.icon;
                    return (
                      <motion.article
                        key={`${s.id}-card-${i}`}
                        {...a}
                        variants={rise}
                        custom={0.08 + i * 0.08}
                        className="rounded-2xl border border-worn-rule bg-worn-surface p-5 transition-shadow duration-300 hover:shadow-pop sm:p-6"
                      >
                        <div className="flex items-center gap-3.5 sm:block">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-worn-gold-tint">
                            <Icon className="h-5 w-5 text-worn-gold-deep" aria-hidden="true" />
                          </div>
                          <h3 className="text-title font-medium text-worn-ink sm:mt-5">{card.title}</h3>
                        </div>
                        <p className="mt-3 text-body text-worn-muted sm:mt-2.5">{card.copy}</p>
                      </motion.article>
                    );
                  },
                )}
              </div>

              {/* Vault: what it catches */}
              {s.catches ? (
                <div className="mt-10">
                  <p className="font-mono text-micro uppercase tracking-[0.28em] text-worn-muted">
                    What the Vault catches
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-worn-rule bg-worn-rule lg:grid-cols-4">
                    {s.catches.map(
                      (item: string, i: number) => (
                        <div key={`vault-catch-${i}`} className="bg-worn-surface p-6 text-center sm:p-8">
                          <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-gold-deep">
                            {String(i + 1).padStart(2, '0')}
                          </p>
                          <p className="mt-3 font-display text-[clamp(20px,2vw,26px)] leading-[1.15] text-worn-ink text-balance">
                            {item}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}

              {/* Privacy chips */}
              {s.chips ? (
                <motion.div
                  key={`chips-${s.id}`}
                  {...a}
                  variants={rise}
                  custom={0.2}
                  className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
                >
                  {s.chips.map(
                    (chip: string, i: number) => (
                      <span
                        key={`chip-${i}-${chip}`}
                        className="rounded-pill border border-worn-rule bg-worn-surface px-3.5 py-1.5 font-mono text-micro uppercase tracking-[0.16em] text-worn-muted"
                      >
                        {chip}
                      </span>
                    ),
                  )}
                </motion.div>
              ) : null}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
