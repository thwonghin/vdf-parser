import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import { test, expect, describe } from 'bun:test';

import { VdfParser } from '../src/parser';
import { TokenizerError } from '../src/tokenizer';

const FIXTURE_OBJ_RESULT = {
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
        key9: 'Фула (𞤊𞤵𞤤𞤬𞤵𞤤𞤣𞤫)',
        你好: '世界',
    },
};

const FIXTURE_PAIRS_RESULT = [
    {
        keyParts: ['key', 'ke"y2', 'key3'],
        value: 'val\\ue3',
    },
    {
        keyParts: ['key4', 'none'],
        value: 'none',
    },
    {
        keyParts: ['key4'],
        value: 'value4',
    },
    {
        keyParts: ['key5', 'key\\n{6}'],
        value: 'val\\tue{6}',
    },
    {
        keyParts: ['key5', 'key7', 'key8'],
        value: 'value8',
    },
    {
        keyParts: ['key5', 'key7', 'key8', 'key9'],
        value: 'value9',
    },
    {
        keyParts: ['key5', 'key9'],
        value: 'Фула (𞤊𞤵𞤤𞤬𞤵𞤤𞤣𞤫)',
    },
    {
        keyParts: ['key5', '你好'],
        value: '世界',
    },
];

describe('parseText', () => {
    test('should parse correctly with escape', async () => {
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
        const result = await parser.parseText(input);

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

    test('should parse correctly without escape', async () => {
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
        const result = await parser.parseText(input);

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

    test('should parse correctly with latest value', async () => {
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
        const result = await parser.parseText(input);

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

    test('should parse correctly without using latest value', async () => {
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
        const result = await parser.parseText(input);

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

    test('should throw tokenizer error if malformed', async () => {
        const input = `key {}}`;

        const parser = new VdfParser();
        let error;
        try {
            await parser.parseText(input);
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

        expect(result).toEqual(FIXTURE_OBJ_RESULT);
    });
});

describe('condensePairsAsync', () => {
    test('should return result correctly', async () => {
        const parser = new VdfParser();

        const readStream = fs.createReadStream(
            path.join(__dirname, 'fixtures', 'sample.vdf'),
            { encoding: 'utf-8' },
        );

        const result = await parser.condensePairsAsync(readStream.pipe(parser));

        expect(result).toEqual(FIXTURE_OBJ_RESULT);
    });
});

describe('condensePairs', () => {
    test('should return result correctly', async () => {
        const parser = new VdfParser();

        const readStream = fs.createReadStream(
            path.join(__dirname, 'fixtures', 'sample.vdf'),
            { encoding: 'utf-8' },
        );

        const paris = await Array.fromAsync(readStream.pipe(parser));

        const result = parser.condensePairs(paris);

        expect(result).toEqual(FIXTURE_OBJ_RESULT);
    });
});

describe('stream pipe', () => {
    test('should return key value pairs correctly', async () => {
        const parser = new VdfParser();

        const readStream = fs.createReadStream(
            path.join(__dirname, 'fixtures', 'sample.vdf'),
            { encoding: 'utf-8' },
        );

        const result = await Array.fromAsync(readStream.pipe(parser));

        expect(result).toEqual(FIXTURE_PAIRS_RESULT);
    });
});
