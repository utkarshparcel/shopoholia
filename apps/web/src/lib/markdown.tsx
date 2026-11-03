import type { ReactNode } from 'react';

/**
 * A small Markdown renderer for the legal pages, which are published from the Markdown files in
 * docs/legal at build time. It covers what those files use: headings, paragraphs, block quotes,
 * bullet and numbered lists, tables, rules, and inline code, bold, italics, links and hard line
 * breaks. Anything else renders as plain text, never as HTML.
 *
 * Links into the repo (relative paths such as ../TRUST_DPDP_GDPR.md) don't exist on the web, so they
 * render as their text; an email address in backticks becomes a mailto link.
 */

export type Heading = { level: number; text: string; id: string };

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' };

const EMAIL = /^[^\s@`]+@[^\s@`]+\.[a-z]{2,}$/i;

export function slugify(text: string): string {
  return plainText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The text of inline Markdown without its markers (for ids, titles and the contents list). */
export function plainText(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .trim();
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

const isTableRule = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const listItem = (line: string) => /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      blocks.push({ kind: 'heading', level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) inner.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', blocks: parseMarkdown(inner.join('\n')) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) rows.push(cells(lines[i++]!));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    const first = listItem(line);
    if (first) {
      const ordered = !first[1];
      const items: string[] = [];
      while (i < lines.length) {
        const m = listItem(lines[i]!);
        if (m && Boolean(m[2]) === ordered) {
          items.push(m[3]!);
          i++;
        } else if (items.length && lines[i]!.trim() && /^\s{2,}\S/.test(lines[i]!)) {
          items[items.length - 1] += ` ${lines[i++]!.trim()}`; // a wrapped item
        } else break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,6})\s/.test(lines[i]!) &&
      !/^\s*>/.test(lines[i]!) &&
      !listItem(lines[i]!) &&
      !(lines[i]!.includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1]!))
    )
      para.push(lines[i++]!);
    blocks.push({ kind: 'paragraph', lines: para });
  }
  return blocks;
}

export function headings(blocks: Block[]): Heading[] {
  return blocks.flatMap((b) =>
    b.kind === 'heading' ? [{ level: b.level, text: plainText(b.text), id: slugify(b.text) }] : [],
  );
}

/* ── inline ─────────────────────────────────────────────── */

const linkClass = 'font-medium text-worn-gold-deep underline underline-offset-2 hover:text-worn-ink';

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  // code first (its contents are literal), then links, bold, italics
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[5]) out.push(m[5]); // an italic match starts with the plain character before its `*`
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) {
      out.push(
        EMAIL.test(m[1]) ? (
          <a key={k} href={`mailto:${m[1]}`} className={linkClass}>
            {m[1]}
          </a>
        ) : (
          <code key={k} className="rounded-sm bg-worn-warm px-1.5 py-0.5 font-mono text-[0.86em] text-worn-ink [overflow-wrap:anywhere]">
            {m[1]}
          </code>
        ),
      );
    } else if (m[2] !== undefined) {
      const href = m[3]!;
      const external = /^https?:\/\//i.test(href);
      if (external || /^mailto:/i.test(href) || href.startsWith('#') || href.startsWith('/')) {
        out.push(
          <a key={k} href={href} className={linkClass} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {inline(m[2], k)}
          </a>,
        );
      } else {
        out.push(<span key={k}>{inline(m[2], k)}</span>); // a file in the repo: its name, no link
      }
    } else if (m[4] !== undefined) {
      out.push(
        <strong key={k} className="font-semibold text-worn-ink">
          {inline(m[4], k)}
        </strong>,
      );
    } else {
      out.push(<em key={k}>{inline(m[6]!, k)}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraph lines: a line ending in two spaces (or a backslash) breaks; others join with a space. */
function lines(ls: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  ls.forEach((l, i) => {
    const hard = / {2,}$|\\$/.test(l);
    out.push(...inline(l.replace(/ {2,}$|\\$/, '').trim(), `${key}-${i}`));
    if (i < ls.length - 1) out.push(hard ? <br key={`${key}-br-${i}`} /> : ' ');
  });
  return out;
}

/* ── blocks ─────────────────────────────────────────────── */

const HEADING_CLASS: Record<number, string> = {
  1: 'text-balance font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-tight text-worn-ink',
  2: 'scroll-mt-6 border-t border-worn-rule pt-10 font-display text-display-m text-worn-ink sm:text-[28px]',
  3: 'scroll-mt-6 font-display text-title text-worn-ink sm:text-[21px]',
};

export function renderMarkdown(blocks: Block[], key = 'b'): ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}-${i}`;
    switch (b.kind) {
      case 'heading': {
        const Tag = `h${Math.min(b.level, 6)}` as 'h1';
        return (
          <Tag key={k} id={b.level > 1 ? slugify(b.text) : undefined} className={HEADING_CLASS[b.level] ?? HEADING_CLASS[3]}>
            {inline(b.text, k)}
          </Tag>
        );
      }
      case 'paragraph':
        return <p key={k}>{lines(b.lines, k)}</p>;
      case 'rule':
        return <hr key={k} className="border-worn-rule" />;
      case 'quote':
        return (
          <div key={k} role="note" className="space-y-2 rounded-card border border-worn-gold/50 bg-worn-gold-tint p-5 text-body text-worn-ink-soft">
            {renderMarkdown(b.blocks, k)}
          </div>
        );
      case 'list': {
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={k} className={`${b.ordered ? 'list-decimal' : 'list-disc'} space-y-2 pl-5 marker:text-worn-gold-deep`}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `${k}-${j}`)}</li>
            ))}
          </Tag>
        );
      }
      case 'table':
        return (
          <div key={k} className="overflow-x-auto rounded-card border border-worn-rule bg-worn-surface">
            <table className="w-full border-collapse text-left text-body">
              <thead className="bg-worn-warm/60">
                <tr>
                  {b.head.map((h, j) => (
                    <th key={j} scope="col" className="px-4 py-3 font-mono text-micro uppercase tracking-[0.14em] text-worn-muted">
                      {inline(h, `${k}-h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-t border-worn-rule align-top">
                    {r.map((c, x) =>
                      x === 0 ? (
                        <th key={x} scope="row" className="px-4 py-3 font-semibold text-worn-ink">
                          {inline(c, `${k}-${j}-${x}`)}
                        </th>
                      ) : (
                        <td key={x} className="px-4 py-3 text-worn-ink-soft">
                          {inline(c, `${k}-${j}-${x}`)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}
