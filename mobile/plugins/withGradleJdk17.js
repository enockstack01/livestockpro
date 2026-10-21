const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/* Pins the Gradle daemon to Java 17, the version Expo documents for Android
   builds. Without this file, Android Studio's sync writes its own
   gradle/gradle-daemon-jvm.properties asking for Java 25 (its bundled JDK).
   On Windows, Java 25 prints a "restricted method" warning when prefab runs
   in the C++ configure step, and the Android Gradle plugin treats that output
   as a failure, so builds stop. No toolchain URLs: Gradle uses an installed
   or already provisioned JDK 17 rather than downloading one. */
const CONTENT = [
  '# Written by plugins/withGradleJdk17.js: build Android with Java 17.',
  'toolchainVersion=17',
  ''
].join('\n');

module.exports = function withGradleJdk17(config) {
  return withDangerousMod(config, ['android', (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'gradle');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'gradle-daemon-jvm.properties'), CONTENT);
    return cfg;
  }]);
};
