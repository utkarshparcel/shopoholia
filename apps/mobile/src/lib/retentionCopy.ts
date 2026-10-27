/**
 * Human retention schedule copy (W079-RETENTION-HUMAN-COPY).
 * Mirrors apps/api DEFAULT_RETENTION_SCHEDULE — EMAIL 7d / SMS 14d / RECEIPT 30d.
 */

export type RetentionKind = 'EMAIL' | 'SMS' | 'RECEIPT';

/** Defaults aligned with TRUST-RETENTION / retention.ts. */
export const DEFAULT_RETENTION_DAYS: Record<RetentionKind, number> = {
  EMAIL: 7,
  SMS: 14,
  RECEIPT: 30,
};

export const RETENTION_COPY_TITLE = 'How long we keep raw receipts';

const KIND_LABEL: Record<RetentionKind, string> = {
  EMAIL: 'Email receipts',
  SMS: 'Order texts (SMS)',
  RECEIPT: 'Photo receipts you upload',
};

export type RetentionHumanLine = {
  kind: RetentionKind;
  days: number;
  /** Plain-language sentence for the consent / privacy UI. */
  sentence: string;
};

export function retentionSentence(kind: RetentionKind, days: number): string {
  const label = KIND_LABEL[kind];
  if (days === 1) {
    return `${label}: we delete the raw copy 1 day after we finish reading it.`;
  }
  return `${label}: we delete the raw copy ${days} days after we finish reading it.`;
}

export function getRetentionHumanLines(
  schedule: Record<RetentionKind, number> = DEFAULT_RETENTION_DAYS,
): RetentionHumanLine[] {
  return (Object.keys(DEFAULT_RETENTION_DAYS) as RetentionKind[]).map((kind) => {
    const days = schedule[kind] ?? DEFAULT_RETENTION_DAYS[kind];
    return { kind, days, sentence: retentionSentence(kind, days) };
  });
}

export function getRetentionHumanCopy(
  schedule: Record<RetentionKind, number> = DEFAULT_RETENTION_DAYS,
): { title: string; lines: RetentionHumanLine[]; footnote: string } {
  return {
    title: RETENTION_COPY_TITLE,
    lines: getRetentionHumanLines(schedule),
    footnote:
      'Parsed Vault summaries stay until you export or delete your account. We never keep raw inbox blobs longer than this schedule.',
  };
}
