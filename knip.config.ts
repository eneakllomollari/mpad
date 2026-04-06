import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  project: ['src/**/*.{ts,tsx}'],
  ignoreBinaries: ['playwright', 'wait-on'],
  ignore: ['src/global.d.ts'],
};

export default config;
