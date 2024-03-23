import { test, expect } from 'bun:test';

import {
    TokenType,
    Tokenizer,
    TokenizerCloseBracketAfterKeyError,
    TokenizerEscapeOutsideQuote,
    TokenizerOpenBracketAfterValueError,
    TokenizerTooManyBracketsError,
} from '../src/tokenizer';

function* ingestText(tokenizer: Tokenizer, text: string) {
    for (const char of text) {
        yield* tokenizer.ingestChar(char);
    }

    yield* tokenizer.ingestChar('\n');
    yield* tokenizer.flush();
}

test('should parse one line correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `key value`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse one line with with quotes correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `"key" "value"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse with no space correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `key"value"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse no space for two quoted tokens correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `"key""value"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse multiple tokens with no space correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `key"value""key2"value2`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key2',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value2',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse multiple line with with quotes correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `"key" "value"\r\n\r\nanother_key     "another_value"
    `;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'another_key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'another_value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse having new line with quotes correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `"key" "value\nnext_line"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value\nnext_line',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse backward slash without escape correctly', () => {
    const tokenizer = new Tokenizer({ disableEscape: true });
    const input = `\\key "first_line\\nsecond_line"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: '\\key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'first_line\\nsecond_line',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should escape correctly', () => {
    const tokenizer = new Tokenizer();
    const input = `"\\nke\\ty" "v\\"al\\\\ue"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: '\\nke\\ty',
            tokenType: TokenType.KEY,
        },
        {
            value: 'v"al\\ue',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should not throw when the character is unsupported to escape', () => {
    const tokenizer = new Tokenizer();
    const input = `"key\\e"`;
    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key\\e',
            tokenType: TokenType.KEY,
        },
    ]);
});

test('should ignore comment', () => {
    const tokenizer = new Tokenizer();
    const input = `key value//comment
    // another comment \\ {} "test"
    key2 value2
    key3 // comment in the middle of key and value
    value3
    `;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key2',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value2',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value3',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should handle empty nest levels', () => {
    const tokenizer = new Tokenizer();
    const input = `key {}`;
    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
    ]);
});

test('should nest multiple levels', () => {
    const tokenizer = new Tokenizer();
    const input = `key{key2{key3 value3}
    }
    key4 value4
    key5 {
        "key{6}" "value{6}"
        "key7" {
            key8 "value8"
        }
        key9 "value9"
    }
    `;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key2',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value3',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key4',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value4',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key5',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key{6}',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value{6}',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key7',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key8',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value8',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key9',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value9',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
    ]);
});

test('should handle all happy cases with escape', () => {
    const tokenizer = new Tokenizer();
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

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'ke"y2',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            value: 'val\\ue3',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key4',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value4',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key5',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key\\n{6}',
            tokenType: TokenType.KEY,
        },
        {
            value: 'val\\tue{6}',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key7',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key8',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value8',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key9',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value9',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
    ]);
});

test('should handle all happy cases without escape', () => {
    const tokenizer = new Tokenizer({ disableEscape: true });
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

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            value: 'key',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'ke\\y2',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            value: 'val\\\\ue3',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key4',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value4',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key5',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key\\n{6}',
            tokenType: TokenType.KEY,
        },
        {
            value: 'val\\tue{6}',
            tokenType: TokenType.VALUE,
        },
        {
            value: 'key7',
            tokenType: TokenType.KEY,
        },
        {
            value: '{',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key8',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value8',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
        {
            value: 'key9',
            tokenType: TokenType.KEY,
        },
        {
            value: 'value9',
            tokenType: TokenType.VALUE,
        },
        {
            value: '}',
            tokenType: TokenType.NEST,
        },
    ]);
});

test('should handle unicode', () => {
    const tokenizer = new Tokenizer();
    const input = `你好 世界test`;

    const result = [...ingestText(tokenizer, input)];

    expect(result).toEqual([
        {
            value: '你好',
            tokenType: TokenType.KEY,
        },
        {
            value: '世界test',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should throw with misplaced open bracket after non quoted value', () => {
    const tokenizer = new Tokenizer();
    const input = `"key"value{`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error instanceof TokenizerOpenBracketAfterValueError).toBeTrue();
});

test('should throw with misplaced open bracket after quoted value', () => {
    const tokenizer = new Tokenizer();
    const input = `"key""value"{`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error instanceof TokenizerOpenBracketAfterValueError).toBeTrue();
});

test('should throw with misplaced close bracket after non quoted key', () => {
    const tokenizer = new Tokenizer();
    const input = `key}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error instanceof TokenizerCloseBracketAfterKeyError).toBeTrue();
});

test('should throw with misplaced close bracket after quoted key', () => {
    const tokenizer = new Tokenizer();
    const input = `"key"}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error instanceof TokenizerCloseBracketAfterKeyError).toBeTrue();
});

test('should throw when ending too many nest levels', () => {
    const tokenizer = new Tokenizer();
    const input = `"key"{}}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error instanceof TokenizerTooManyBracketsError).toBeTrue();
});

test('should throw when the escape after quote', () => {
    const tokenizer = new Tokenizer();
    const input = `key\\"{}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error instanceof TokenizerEscapeOutsideQuote).toBeTrue();
});
