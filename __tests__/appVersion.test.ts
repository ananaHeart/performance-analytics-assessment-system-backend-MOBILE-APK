import { APP_VERSION } from '../src/config/appInfo';

// This project has no Node type definitions, so type only the calls used here.
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: 'utf8') => string };
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

// The Profile tab's About card shows APP_VERSION; Android shows versionName.
// They must never drift apart.
describe('app version', () => {
  const gradle = readFileSync(join(__dirname, '..', 'android', 'app', 'build.gradle'), 'utf8');

  test('build.gradle versionName matches APP_VERSION', () => {
    const versionName = gradle.match(/^\s*versionName\s+"([^"]+)"/m)?.[1];
    expect(versionName).toBe(APP_VERSION);
  });

  test('build.gradle has a versionCode', () => {
    expect(gradle).toMatch(/^\s*versionCode\s+\d+/m);
  });
});
