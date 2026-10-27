import { describe, expect, it } from 'vitest';

import {
  assertsNoReadSmsMarketing,
  buildIosForwardAddress,
  getIosForwardWizardSteps,
  iosForwardWizardJoinedCopy,
  nextIosForwardStep,
  previousIosForwardStep,
} from './iosForwardWizard';

describe('iosForwardWizard (W011)', () => {
  it('exposes three steps: address → mail rule → test ping', () => {
    const steps = getIosForwardWizardSteps('fwd@example.com');
    expect(steps).toHaveLength(3);
    expect(steps[0]?.step).toBe(1);
    expect(steps[0]?.body).toContain('fwd@example.com');
    expect(steps[0]?.title).toMatch(/forward address/i);
    expect(steps[1]?.title).toMatch(/mail|messages|rule/i);
    expect(steps[2]?.title).toMatch(/test ping/i);
  });

  it('advances and retreats the stepper', () => {
    expect(nextIosForwardStep(1)).toBe(2);
    expect(nextIosForwardStep(2)).toBe(3);
    expect(nextIosForwardStep(3)).toBeNull();
    expect(previousIosForwardStep(3)).toBe(2);
    expect(previousIosForwardStep(2)).toBe(1);
    expect(previousIosForwardStep(1)).toBeNull();
  });

  it('never markets READ_SMS', () => {
    const joined = iosForwardWizardJoinedCopy('a@b.co');
    expect(assertsNoReadSmsMarketing(joined)).toBe(true);
    expect(joined).not.toMatch(/READ_SMS/i);
    expect(joined).toMatch(/forward/i);
    expect(joined).toMatch(/cannot read SMS|apps cannot read SMS/i);
  });

  it('builds a plus-address when userKey is provided', () => {
    const addr = buildIosForwardAddress({
      baseAddress: 'forward@inbox.shopoholia.app',
      userKey: 'user-abc-123',
    });
    expect(addr).toBe('forward+userabc123@inbox.shopoholia.app');
    expect(buildIosForwardAddress({ baseAddress: 'forward@inbox.shopoholia.app' })).toBe(
      'forward@inbox.shopoholia.app',
    );
  });
});
