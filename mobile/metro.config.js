const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Let Metro resolve the small cross-client `shared/` package (also imported
// by client/, the web app) that lives outside this project root.
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../shared')];
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
