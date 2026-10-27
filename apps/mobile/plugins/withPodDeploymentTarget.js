const { withPodfile } = require('expo/config-plugins');

const MARK = '# worn: pod deployment target floor';

// Xcode 26+ refuses pods that still declare iOS < 15 (Sentry, AsyncStorage
// resources). Raise every pod target to the app's own deployment target.
function addPodDeploymentFloor(contents) {
  if (contents.includes(MARK)) return contents;
  const postInstall = /(react_native_post_install\([\s\S]*?\n\s*\))/;
  if (!postInstall.test(contents)) {
    throw new Error('withPodDeploymentTarget: react_native_post_install(...) not found in the Podfile');
  }
  return contents.replace(
    postInstall,
    `$1
    ${MARK}
    floor = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < floor.to_f
      end
    end`,
  );
}

function withPodDeploymentTarget(config) {
  return withPodfile(config, (cfg) => {
    cfg.modResults.contents = addPodDeploymentFloor(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withPodDeploymentTarget;
module.exports.addPodDeploymentFloor = addPodDeploymentFloor;
