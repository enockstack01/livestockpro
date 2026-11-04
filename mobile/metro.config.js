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

// The app's own code (src/, app/, the shared/ package) gets React Native
// through src/theme/reactNative.js, which sets Text and TextInput in the
// Carlito typeface. Libraries in node_modules, and that file and the font
// helper themselves, get React Native unchanged.
// On web, babel-preset-expo has already split the import into single
// react-native-web modules, so Text and TextInput are redirected one by one.
const theme = (f) => path.resolve(__dirname, 'src/theme', f);
const RN_WITH_CARLITO = theme('reactNative.js');
const WEB_REDIRECTS = {
  'react-native-web/dist/exports/Text': theme('carlitoWebText.js'),
  'react-native-web/dist/exports/TextInput': theme('carlitoWebTextInput.js'),
};
const FONT_HELPERS = new Set([RN_WITH_CARLITO, theme('fontsCore.js'), theme('carlitoWeb.js'), theme('carlitoWebText.js'), theme('carlitoWebTextInput.js')]);
const APP_CODE = [path.resolve(__dirname, 'src'), path.resolve(__dirname, 'app'), path.resolve(__dirname, '../shared')].map((d) => d + path.sep);
const previousResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const from = context.originModulePath || '';
  if (!FONT_HELPERS.has(from) && APP_CODE.some((d) => from.startsWith(d))) {
    if (moduleName === 'react-native') return { type: 'sourceFile', filePath: RN_WITH_CARLITO };
    if (WEB_REDIRECTS[moduleName]) return { type: 'sourceFile', filePath: WEB_REDIRECTS[moduleName] };
  }
  return previousResolve ? previousResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
