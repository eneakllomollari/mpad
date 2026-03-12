import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  project: ['src/**/*.{ts,tsx}'],
  ignoreDependencies: [
    '@tauri-apps/cli',
  ],
  ignoreBinaries: ['scripts/install.sh'],
};

export default config;
