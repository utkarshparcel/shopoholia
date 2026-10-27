import { describe, expect, it } from 'vitest';
import {
  initialSelections,
  optionGroups,
  parseTemplateOptions,
  selectionSummary,
} from './fitOptions';

describe('fitOptions', () => {
  it('parses rich schema for pickers with preview assets', () => {
    const schema = parseTemplateOptions({
      neckline: {
        label: 'Neckline',
        options: [
          { value: 'Boat', label: 'Boat', imageKey: 'fit/neckline/boat.jpg', preview: 'preview:neckline:Boat' },
          { value: 'V', label: 'V', imageKey: 'fit/neckline/v.jpg', preview: 'preview:neckline:V' },
        ],
      },
      sleeve: ['Short', 'Full'],
    });
    expect(schema.neckline?.options[0]?.preview).toBe('preview:neckline:Boat');
    expect(schema.sleeve?.options[1]?.imageKey).toBe('fit/sleeve/full.jpg');
    expect(initialSelections(schema)).toEqual({ neckline: 'Boat', sleeve: 'Short' });
    expect(optionGroups(schema).map((g) => g.key)).toEqual(['neckline', 'sleeve']);
    expect(selectionSummary({ neckline: 'Boat', sleeve: 'Short' })).toContain('neckline: Boat');
  });
});
