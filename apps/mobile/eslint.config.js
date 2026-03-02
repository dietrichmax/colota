const reactNativeConfig = require("@react-native/eslint-config/flat")

// Filter out the Flow override - incompatible with ESLint 9 and not needed for TypeScript
const config = reactNativeConfig.filter((entry) => !entry.plugins || !("ft-flow" in entry.plugins))

module.exports = [
  ...config,
  {
    ignores: ["*.min.js", "coverage/**", "android/app/build/**", "jest.setup.js"]
  }
]
