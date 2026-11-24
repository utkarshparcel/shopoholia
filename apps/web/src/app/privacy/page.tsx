import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { PageShell } from '@/components/PageShell';
import { headings, parseMarkdown, plainText, renderMarkdown } from '@/lib/markdown';
import { PRIVACY_PATH } from '@/lib/site';

/*
 * The policy is docs/legal/PRIVACY_POLICY_DRAFT.md, read and rendered when the site is built (the page
 * is static), so a change to that file reaches /privacy with the next deploy and nobody keeps a copy
 * in step. Its wording, placeholders and draft notice are published as they are.
 */
const SOURCE = join(process.cwd(), '../../docs/legal/PRIVACY_POLICY_DRAFT.md');
const BLOCKS = parseMarkdown(readFileSync(SOURCE, 'utf8'));
const HEADINGS = headings(BLOCKS);
const SECTIONS = HEADINGS.filter((h) => h.level === 2);

const TITLE = 'Privacy policy';
const DESCRIPTION = `${HEADINGS.find((h) => h.level === 1)?.text ?? 'Worn privacy policy'}: what Worn collects, why, how long it keeps it, who it shares it with, and your rights.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PRIVACY_PATH },
  openGraph: { type: 'article', siteName: 'Worn', title: `${TITLE} | Worn`, description: DESCRIPTION, url: PRIVACY_PATH },
  twitter: { card: 'summary_large_image', title: `${TITLE} | Worn`, description: DESCRIPTION },
};

export default function PrivacyPage() {
  const hasTitle = BLOCKS[0]?.kind === 'heading' && BLOCKS[0].level === 1;
  const title = hasTitle ? BLOCKS[0]! : null;
  const rest = hasTitle ? BLOCKS.slice(1) : BLOCKS;
  // the draft notice and dates, then the contents list, then the sections
  const firstSection = rest.findIndex((b) => b.kind === 'heading' && b.level === 2);
  const intro = firstSection < 0 ? rest : rest.slice(0, firstSection);
  const body = firstSection < 0 ? [] : rest.slice(firstSection);
  return (
    <PageShell>
      <article className="section py-12 sm:py-20">
        <div className="mx-auto max-w-[760px]">
          <p className="ornament w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">Privacy</p>
          <div className="mt-5">{title ? renderMarkdown([title], 'title') : <h1 className="sr-only">{TITLE}</h1>}</div>
          <div className="mt-8 space-y-5 text-body-l text-worn-ink-soft">{renderMarkdown(intro, 'intro')}</div>

          {SECTIONS.length > 2 ? (
            <nav aria-label="On this page" className="mt-10 rounded-card border border-worn-rule bg-worn-surface p-5">
              <p className="font-mono text-micro uppercase tracking-[0.2em] text-worn-muted">On this page</p>
              <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-body sm:grid-cols-2">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-worn-ink-soft underline-offset-2 hover:text-worn-ink hover:underline">
                      {plainText(s.text)}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div className="mt-10 space-y-5 text-body-l text-worn-ink-soft">{renderMarkdown(body)}</div>
        </div>
      </article>
    </PageShell>
  );
}
