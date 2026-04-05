import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  project: ['src/**/*.{ts,tsx}'],
  ignoreBinaries: ['playwright', 'wait-on'],
};

export default config;
