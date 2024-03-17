import stream from 'node:stream';

import { test, expect, describe } from 'bun:test';

import { Parser } from '../src/parser';
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

        const parser = new Parser({ escape: true, useLatestValue: true });
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

        const parser = new Parser({ escape: false, useLatestValue: true });
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

        const parser = new Parser({ escape: true, useLatestValue: true });
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

        const parser = new Parser({ escape: true, useLatestValue: false });
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

        const parser = new Parser({ escape: true, useLatestValue: false });
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

        const parser = new Parser({ escape: true, useLatestValue: false });
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
