/**
 * W083–W088 Play⇄Closet bridge polish acceptance.
 */
import { describe, expect, it } from 'vitest';

import {
  BUDGET_NUDGE_SOFT_FOOTER,
  closetBudgetSoftGateCopy,
  matchStoreCreditHint,
  prebuyFitPanelSections,
  replaceTwinSheetRows,
  TRACK_BUY_VAULT_HREF,
  TRACK_BUY_WARDROBE_HREF,
  trackBuySuccessCopy,
  WASTE_RESTYLE_CTA_LABEL,
  WASTE_RESTYLE_PLAY_HREF,
  wasteRestyleCta,
} from './bridgeWow';

describe('W083 track-buy success sheet', () => {
  it('offers vault + wardrobe links for new and idempotent tracks', () => {
    const created = trackBuySuccessCopy({ created: true, wardrobeCount: 2 });
    expect(created.title).toMatch(/Saved/i);
    expect(created.body).toMatch(/2 wardrobe/);
    expect(created.vaultLabel).toBe('Open Vault');
    expect(created.wardrobeLabel).toBe('Open wardrobe');
    expect(TRACK_BUY_VAULT_HREF).toBe('/(closet)/vault');
    expect(TRACK_BUY_WARDROBE_HREF).toBe('/(closet)/wardrobe');

    const again = trackBuySuccessCopy({ created: false });
    expect(again.title).toMatch(/Already/i);
    expect(again.body).toMatch(/already tracked/i);
  });
});

describe('W084 prebuy fit panel polish', () => {
  it('formats overlap / gap / budget as readable soft sections', () => {
    const panel = prebuyFitPanelSections({
      score: 72,
      summary: 'Looks similar to 1 piece(s) you already own.',
      overlaps: [{ candidateTitle: 'Blue tee', wardrobeLabel: 'Navy tee', score: 88 }],
      gaps: [{ budgetCategory: 'FOOTWEAR', message: 'Thin FOOTWEAR shelf' }],
      budgetNudges: [
        { exceeded: true, category: 'APPAREL', message: 'Heads-up on APPAREL' },
        { exceeded: false, category: 'GENERAL', message: 'ok' },
      ],
    });
    expect(panel.scoreLabel).toBe('Fit score 72/100');
    expect(panel.softNote).toMatch(/Soft check only/);
    expect(panel.overlapLines[0]).toMatch(/^Overlap ·/);
    expect(panel.gapLines[0]).toMatch(/^Gap ·/);
    expect(panel.budgetLines).toHaveLength(1);
    expect(panel.budgetLines[0]).toMatch(/^Budget ·/);
  });
});

describe('W085 budget nudge soft footer', () => {
  it('never shame-blocks checkout', () => {
    expect(BUDGET_NUDGE_SOFT_FOOTER.toLowerCase()).toMatch(/still check out/);
    expect(BUDGET_NUDGE_SOFT_FOOTER.toLowerCase()).not.toMatch(/cannot|blocked|must/);
  });
});

describe('W086 replace-twin sheet', () => {
  it('maps candidates to shoppable CTAs', () => {
    const rows = replaceTwinSheetRows([
      {
        listingId: 'l1',
        title: 'Twin tee',
        score: 90,
        affiliateUrl: 'https://myntra.com/x',
        platform: 'myntra',
      },
      {
        listingId: 'l2',
        title: 'No link',
        score: 10,
        affiliateUrl: null,
        platform: 'other',
      },
    ]);
    expect(rows[0]?.shoppable).toBe(true);
    expect(rows[0]?.ctaLabel).toMatch(/Shop twin/);
    expect(rows[1]?.shoppable).toBe(false);
  });
});

describe('W087 waste restyle CTA', () => {
  it('routes explicitly to Play feed — not a Closet blend', () => {
    const cta = wasteRestyleCta();
    expect(cta.label).toBe(WASTE_RESTYLE_CTA_LABEL);
    expect(cta.href).toBe(WASTE_RESTYLE_PLAY_HREF);
    expect(cta.href).toMatch(/\(tabs\)\/feed/);
    expect(cta.href).not.toMatch(/closet/);
    expect(cta.hint.toLowerCase()).toMatch(/play/);
  });
});

describe('W088 pay-with-credit soft hint', () => {
  it('matches active store credit merchant to cart titles; never auto-charges', () => {
    const hint = matchStoreCreditHint(
      [
        {
          kind: 'STORE_CREDIT',
          merchant: 'Myntra',
          status: 'ACTIVE',
          balanceCacheMinor: 50_000,
          currency: 'INR',
        },
        {
          kind: 'GIFT_CARD',
          merchant: 'Amazon',
          status: 'ACTIVE',
          balanceCacheMinor: 1_000,
        },
      ],
      ['Myntra Blue Kurta', 'Casual jeans'],
    );
    expect(hint).not.toBeNull();
    expect(hint!.merchant).toBe('Myntra');
    expect(hint!.message).toMatch(/Pay with store credit/i);
    expect(hint!.softNote.toLowerCase()).toMatch(/never auto-charge/);
    expect(hint!.vaultHref).toBe('/(closet)/vault');
  });

  it('returns null when no merchant matches or balance is zero', () => {
    expect(
      matchStoreCreditHint(
        [{ kind: 'STORE_CREDIT', merchant: 'Myntra', status: 'ACTIVE', balanceCacheMinor: 0 }],
        ['Myntra tee'],
      ),
    ).toBeNull();
    expect(
      matchStoreCreditHint(
        [
          {
            kind: 'STORE_CREDIT',
            merchant: 'Nykaa',
            status: 'ACTIVE',
            balanceCacheMinor: 9_000,
          },
        ],
        ['Unrelated tee'],
      ),
    ).toBeNull();
  });
});

describe('U047 Closet budget soft gate', () => {
  it('offers Continue / Cut spend and never hard-blocks', () => {
    expect(closetBudgetSoftGateCopy({ exceeded: false })).toBeNull();
    const gate = closetBudgetSoftGateCopy({
      exceeded: true,
      category: 'APPAREL',
    });
    expect(gate?.continueLabel).toBe('Continue');
    expect(gate?.cutSpendLabel).toBe('Cut spend');
    expect(gate?.cutSpendHref).toBe('/(closet)/accountant');
    expect(gate?.hardBlock).toBe(false);
    expect(BUDGET_NUDGE_SOFT_FOOTER).toMatch(/heads-up/i);
  });
});
