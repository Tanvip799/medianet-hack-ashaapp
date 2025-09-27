// babel.config.js

module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      // This is the single, correct preset for Expo SDK 50+ and NativeWind v4+
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      // 'react-native-reanimated/plugin' should be the last plugin.
      'react-native-reanimated/plugin',
    ],
  };
};