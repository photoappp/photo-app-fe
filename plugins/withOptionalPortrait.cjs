const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, mod => {
    const { manifest } = mod.modResults;
    const name = 'android.hardware.screen.portrait';
    const features = manifest['uses-feature'] ?? [];
    const current = features.find(feature => feature.$['android:name'] === name);
    manifest['uses-feature'] = [
      ...features.filter(feature => feature.$['android:name'] !== name),
      { ...current, $: { ...current?.$, 'android:name': name, 'android:required': 'false' } },
    ];
    return mod;
  });
};
