import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Invariant 2: the pure automaton core must not depend on any game layer.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/economy/**', '**/detectors/**', '**/game/**', '**/render/**', '**/ui/**', '**/patterns/**'],
              message: 'src/core must stay independent of game, render and UI layers.',
            },
          ],
        },
      ],
    },
  },
);
