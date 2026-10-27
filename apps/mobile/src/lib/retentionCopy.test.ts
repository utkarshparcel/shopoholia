import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RETENTION_DAYS,
  RETENTION_COPY_TITLE,
  getRetentionHumanCopy,
  getRetentionHumanLines,
  retentionSentence,
} from './retentionCopy';

describe('retentionCopy (W079-RETENTION-HUMAN-COPY)', () => {
  it('defaults EMAIL 7d / SMS 14d / RECEIPT 30d', () => {
    expect(DEFAULT_RETENTION_DAYS).toEqual({ EMAIL: 7, SMS: 14, RECEIPT: 30 });
    const lines = getRetentionHumanLines();
    expect(lines.map((l) => `${l.kind}:${l.days}`)).toEqual([
      'EMAIL:7',
      'SMS:14',
      'RECEIPT:30',
    ]);
  });

  it('uses plain language (not jargon codes alone)', () => {
    const copy = getRetentionHumanCopy();
    expect(copy.title).toBe(RETENTION_COPY_TITLE);
    const joined = copy.lines.map((l) => l.sentence).join(' ');
    expect(joined).toMatch(/email/i);
    expect(joined).toMatch(/sms|text/i);
    expect(joined).toMatch(/receipt/i);
    expect(joined).toMatch(/7 days/);
    expect(joined).toMatch(/14 days/);
    expect(joined).toMatch(/30 days/);
    expect(joined).not.toMatch(/TTL|INGESTION_RETENTION/);
    expect(copy.footnote).toMatch(/delete|export/i);
  });

  it('singular day wording', () => {
    expect(retentionSentence('EMAIL', 1)).toMatch(/1 day/);
  });
});
