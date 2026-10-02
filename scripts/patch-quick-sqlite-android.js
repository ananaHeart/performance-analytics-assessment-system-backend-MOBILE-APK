const fs = require('fs');
const path = require('path');

const cmakePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-quick-sqlite',
  'android',
  'CMakeLists.txt',
);

if (!fs.existsSync(cmakePath)) {
  console.warn('[postinstall] react-native-quick-sqlite is not installed; skipping Android patch.');
  process.exit(0);
}

let cmake = fs.readFileSync(cmakePath, 'utf8');
const requiredOptions = [
  '-Wl,--hash-style=both',
  '-Wl,-z,max-page-size=16384',
  '-Wl,-z,common-page-size=16384',
];
const missingOptions = requiredOptions.filter(option => !cmake.includes(option));

if (missingOptions.length === 0) {
  console.log('[postinstall] Quick SQLite Android linker settings are already compatible.');
  process.exit(0);
}

const marker = 'find_package(ReactAndroid REQUIRED CONFIG)';
if (!cmake.includes(marker)) {
  throw new Error('[postinstall] Quick SQLite CMake layout changed; linker patch was not applied.');
}

const optionLines = missingOptions.map(option => `  ${option}`).join('\n');
const linkerPatch = [
  '# MobileAssessmentApp: keep the legacy SQLite module loadable on 16 KB Android devices.',
  'target_link_options(',
  '  ${CMAKE_PROJECT_NAME}',
  '  PRIVATE',
  optionLines,
  ')',
  '',
].join('\n');

cmake = cmake.replace(marker, `${linkerPatch}${marker}`);
fs.writeFileSync(cmakePath, cmake, 'utf8');
console.log(`[postinstall] Added Quick SQLite linker options: ${missingOptions.join(', ')}`);
