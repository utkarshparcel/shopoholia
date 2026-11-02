import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import base from '../../packages/config/eslint.config.js';

/**
 * The site's lint: the monorepo's shared rules plus the Next.js (core web vitals) and React
 * hooks rules. ESLint picks this file up for apps/web only (it is the nearest config to it),
 * so no other package's lint changes.
 */
export default [
  ...base,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
