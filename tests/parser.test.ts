import path from 'node:path';
import stream from 'node:stream';

import { test, expect, describe } from 'bun:test';

import { VdfParser } from '../src/parser';
import { TokenizerError } from '../src/tokenizer';

describe('parseText', () => {
    test('should parse correctly with escape', () => {
        const input = `key{"ke\\"y2"{key3 "val\\\\ue3"}
        }
        key4 value4 // comment {} "" \\\\
        key5 {
            "key\\n{6}" "val\\tue{6}"
            "key7" {
                key8 "value8"
            }
            key9 "value9"
        }
        `;

        const parser = new VdfParser({ useLatestValue: true });
        const result = parser.parseText(input);

        expect(result).toEqual({
            key: {
                'ke"y2': {
                    key3: 'val\\ue3',
                },
            },
            key4: 'value4',
            key5: {
                'key\\n{6}': 'val\\tue{6}',
                key7: {
                    key8: 'value8',
                },
                key9: 'value9',
            },
        });
    });

    test('should parse correctly without escape', () => {
        const input = `key{"ke\\y2"{key3 "val\\\\ue3"}
        }
        key4 value4 // comment {} "" \\\\
        key5 {
            "key\\n{6}" "val\\tue{6}"
            "key7" {
                key8 "value8"
            }
            key9 "value9"
        }
        `;

        const parser = new VdfParser({
            disableEscape: true,
            useLatestValue: true,
        });
        const result = parser.parseText(input);

        expect(result).toEqual({
            key: {
                'ke\\y2': {
                    key3: 'val\\\\ue3',
                },
            },
            key4: 'value4',
            key5: {
                'key\\n{6}': 'val\\tue{6}',
                key7: {
                    key8: 'value8',
                },
                key9: 'value9',
            },
        });
    });

    test('should parse correctly with latest value', () => {
        const input = `key{"ke\\"y2"{key3 "val\\\\ue3"}
        }
        key4 {
            none none
        }
        key4 value4 // comment {} "" \\\\
        key5 {
            "key\\n{6}" "val\\tue{6}"
            "key7" {
                key8 "value8"
                key8 {   
                    key9 "value9"
                }
            }
            key9 "value9"
        }
        `;

        const parser = new VdfParser({ useLatestValue: true });
        const result = parser.parseText(input);

        expect(result).toEqual({
            key: {
                'ke"y2': {
                    key3: 'val\\ue3',
                },
            },
            key4: 'value4',
            key5: {
                'key\\n{6}': 'val\\tue{6}',
                key7: {
                    key8: {
                        key9: 'value9',
                    },
                },
                key9: 'value9',
            },
        });
    });

    test('should parse correctly without using latest value', () => {
        const input = `key{"ke\\"y2"{key3 "val\\\\ue3"}
        }
        key4 {
            none none
        }
        key4 value4 // comment {} "" \\\\
        key5 {
            "key\\n{6}" "val\\tue{6}"
            "key7" {
                key8 "value8"
                key8 {   
                    key9 "value9"
                }
            }
            key9 "value9"
        }
        `;

        const parser = new VdfParser();
        const result = parser.parseText(input);

        expect(result).toEqual({
            key: {
                'ke"y2': {
                    key3: 'val\\ue3',
                },
            },
            key4: {
                none: 'none',
            },
            key5: {
                'key\\n{6}': 'val\\tue{6}',
                key7: {
                    key8: 'value8',
                },
                key9: 'value9',
            },
        });
    });

    test('should throw tokenizer error if malformed', () => {
        const input = `key {}}`;

        const parser = new VdfParser();
        let error;
        try {
            parser.parseText(input);
        } catch (err) {
            error = err;
        }

        expect(error instanceof TokenizerError).toBeTrue();
    });
});

describe('parseStream', () => {
    test('should parse correctly', async () => {
        const input = `key{"ke\\"y2"{key3 "val\\\\ue3"}
        }
        key4 {
            none none
        }
        key4 value4 // comment {} "" \\\\
        key5 {
            "key\\n{6}" "val\\tue{6}"
            "key7" {
                key8 "value8"
                key8 {   
                    key9 "value9"
                }
            }
            key9 "value9"
        }
        `;

        const parser = new VdfParser();
        const result = await parser.parseStream(stream.Readable.from(input));

        expect(result).toEqual({
            key: {
                'ke"y2': {
                    key3: 'val\\ue3',
                },
            },
            key4: {
                none: 'none',
            },
            key5: {
                'key\\n{6}': 'val\\tue{6}',
                key7: {
                    key8: 'value8',
                },
                key9: 'value9',
            },
        });
    });
});

describe('parseFile', () => {
    test('should parse correctly', async () => {
        const parser = new VdfParser();
        const result = await parser.parseFile(
            path.join(__dirname, 'fixtures', 'sample.vdf'),
        );

        expect(result).toEqual({
            key: {
                'ke"y2': {
                    key3: 'val\\ue3',
                },
            },
            key4: {
                none: 'none',
            },
            key5: {
                'key\\n{6}': 'val\\tue{6}',
                key7: {
                    key8: 'value8',
                },
                key9: 'value9',
                你好: '世界',
            },
        });
    });
});

describe('iterateKeyValuesFromReadStream', () => {
    test('should iterate correctly', async () => {
        const input = `key{"ke\\"y2"{key3 "val\\\\ue3"}
        }
        key4 {
            none none
        }
        key4 value4 // comment {} "" \\\\
        key5 {
            "key\\n{6}" "val\\tue{6}"
            "key7" {
                key8 "value8"
                key8 {   
                    key9 "value9"
                }
            }
            key9 "value9"
        }
        `;

        const parser = new VdfParser();
        const result = await Array.fromAsync(
            parser.iterateKeyValuesFromReadStream(stream.Readable.from(input)),
        );

        expect(result).toEqual([
            {
                keys: ['key', 'ke"y2', 'key3'],
                value: 'val\\ue3',
            },
            {
                keys: ['key4', 'none'],
                value: 'none',
            },
            {
                keys: ['key4'],
                value: 'value4',
            },
            {
                keys: ['key5', 'key\\n{6}'],
                value: 'val\\tue{6}',
            },
            {
                keys: ['key5', 'key7', 'key8'],
                value: 'value8',
            },
            {
                keys: ['key5', 'key7', 'key8', 'key9'],
                value: 'value9',
            },
            {
                keys: ['key5', 'key9'],
                value: 'value9',
            },
        ]);
    });
});

describe('iterateKeyValuesFromFile', () => {
    test('should iterate correctly', async () => {
        const parser = new VdfParser();
        const result = await Array.fromAsync(
            parser.iterateKeyValuesFromFile(
                path.join(__dirname, 'fixtures', 'sample.vdf'),
            ),
        );

        expect(result).toEqual([
            {
                keys: ['key', 'ke"y2', 'key3'],
                value: 'val\\ue3',
            },
            {
                keys: ['key4', 'none'],
                value: 'none',
            },
            {
                keys: ['key4'],
                value: 'value4',
            },
            {
                keys: ['key5', 'key\\n{6}'],
                value: 'val\\tue{6}',
            },
            {
                keys: ['key5', 'key7', 'key8'],
                value: 'value8',
            },
            {
                keys: ['key5', 'key7', 'key8', 'key9'],
                value: 'value9',
            },
            {
                keys: ['key5', 'key9'],
                value: 'value9',
            },
            {
                keys: ['key5', '你好'],
                value: '世界',
            },
        ]);
    });
});
