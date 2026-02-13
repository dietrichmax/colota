const path = require("path")
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config")

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

// Monorepo root (two levels up from apps/mobile)
const monorepoRoot = path.resolve(__dirname, "../..")

const config = {
  // Watch the entire monorepo for changes
  watchFolders: [monorepoRoot],

  resolver: {
    // npm workspaces hoists deps to root node_modules
    nodeModulesPaths: [path.resolve(monorepoRoot, "node_modules"), path.resolve(__dirname, "node_modules")]
  }
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
