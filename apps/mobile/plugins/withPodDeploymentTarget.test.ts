import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { addPodDeploymentFloor } = createRequire(import.meta.url)('./withPodDeploymentTarget') as {
  addPodDeploymentFloor: (contents: string) => string;
};

const PODFILE = `  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`;

describe('withPodDeploymentTarget', () => {
  it('raises pod deployment targets right after react_native_post_install', () => {
    const out = addPodDeploymentFloor(PODFILE);
    const call = out.indexOf(':ccache_enabled => ccache_enabled?(podfile_properties),\n    )');
    const floor = out.indexOf("floor = podfile_properties['ios.deploymentTarget'] || '16.4'");
    expect(call).toBeGreaterThan(-1);
    expect(floor).toBeGreaterThan(call);
    expect(out.indexOf('  end\nend')).toBeGreaterThan(floor);
    expect(out).toContain("c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor if");
  });

  it('adds the block once when prebuild runs again', () => {
    const once = addPodDeploymentFloor(PODFILE);
    expect(addPodDeploymentFloor(once)).toBe(once);
  });

  it('fails loudly when the Podfile has no react_native_post_install', () => {
    expect(() => addPodDeploymentFloor('target "WORN" do\nend\n')).toThrow(/react_native_post_install/);
  });
});
