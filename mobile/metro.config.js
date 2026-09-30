const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Let Metro resolve the small cross-client `shared/` package (also imported
// by client/, the web app) that lives outside this project root.
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, '../shared'),
  // The web app's translation files — the mobile UI mirrors the web design,
  // so it reuses the web strings (see src/i18n/index.js) instead of copying them.
  path.resolve(__dirname, '../client/src/i18n/locales'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  ...(config.resolver.nodeModulesPaths || []),
];

// expo-sqlite's web platform loads a wasm-compiled SQLite build in a worker
// (see mobile/src/db/schema.js) — Metro doesn't treat .wasm as an asset by
// default, and the worker needs SharedArrayBuffer, which browsers only allow
// cross-origin-isolated pages to use. Native (iOS/Android) doesn't touch any
// of this — only `expo start --web` needs it.
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  return middleware(req, res, next);
};

module.exports = config;
