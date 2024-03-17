module.exports = {
    extends: [
        'xo',
        'xo/browser',
        'xo-typescript',
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:prettier/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    rules: {
        '@typescript-eslint/no-unused-vars': [
            'warn',
            { argsIgnorePattern: '^_' },
        ],
        'unicorn/no-array-callback-reference': 'off',
        'node/file-extension-in-import': 'off',
        '@typescript-eslint/no-implicit-any-catch': 'off',
        'object-shorthand': ['error', 'always', { avoidQuotes: true }],
        'no-await-in-loop': 'off',
        // Using 'useUnknownInCatchVariables' in tsconfig by default
        'import/order': [
            'error',
            {
                groups: [
                    'builtin',
                    'external',
                    'internal',
                    ['parent', 'sibling'],
                ],
                pathGroups: [
                    {
                        pattern: '@/**',
                        group: 'internal',
                        position: 'before',
                    },
                ],
                pathGroupsExcludedImportTypes: ['@/**'],
                'newlines-between': 'always',
                alphabetize: {
                    order: 'asc',
                    caseInsensitive: true,
                },
            },
        ],
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/ban-types': [
            'error',
            {
                extendDefaults: true,
            },
        ],
        '@typescript-eslint/switch-exhaustiveness-check': [
            'error',
            {
                allowDefaultCaseForExhaustiveSwitch: true,
            },
        ],
        'import/no-unresolved': [
            'error',
            {
                ignore: ['bun:test'],
            },
        ],
        '@typescript-eslint/prefer-for-of': 'off'
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
            },
            typescript: {
                alwaysTryTypes: true,
            },
        },
    },
};