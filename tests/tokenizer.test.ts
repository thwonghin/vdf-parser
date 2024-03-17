import { test, expect } from 'bun:test';

import {
    ControlType,
    TokenType,
    Tokenizer,
    TokenizerCloseBracketAfterKeyError,
    TokenizerEscapeOutsideQuote,
    TokenizerOpenBracketAfterValueError,
    TokenizerTooManyBracketsError,
    TokenizerUnsupportedEscapeSequenceError,
} from '../src/tokenizer';

function* ingestText(tokenizer: Tokenizer, text: string) {
    for (const char of text) {
        yield* tokenizer.ingestChar(char);
    }

    yield* tokenizer.ingestChar('\n');
    yield* tokenizer.flush();
}

test('should parse one line correctly', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `key value`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse one line with with quotes correctly', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `"key" "value"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse with no space correctly', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `key"value"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse no space for two quoted tokens correctly', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `"key""value"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse multiple tokens with no space correctly', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `key"value""key2"value2`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key2',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value2',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse multiple line with with quotes correctly', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `"key" "value"\r\n\r\nanother_key     "another_value"
    `;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'another_key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'another_value',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should parse backward slash without escape correctly', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `\\key "val\\ue"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: '\\key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'val\\ue',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should escape correctly', () => {
    const tokenizer = new Tokenizer({ escape: true });
    const input = `"\\nke\\ty" "v\\"al\\\\ue"`;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: '\\nke\\ty',
            tokenType: TokenType.KEY,
        },
        {
            token: 'v"al\\ue',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should ignore comment', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `key value//comment
    // another comment \\ {} "test"
    key2 value2
    key3 // comment in the middle of key and value
    value3
    `;

    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key2',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value2',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value3',
            tokenType: TokenType.VALUE,
        },
    ]);
});

test('should handle empty nest levels', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `key {}`;
    const tokens = [...ingestText(tokenizer, input)];
    expect(tokens).toEqual([
        {
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            controlType: ControlType.END_NESTED,
        },
    ]);
});

test('should nest multiple levels', () => {
    const tokenizer = new Tokenizer({ escape: false });
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
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key2',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value3',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            token: 'key4',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value4',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key5',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key{6}',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value{6}',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key7',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key8',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value8',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            token: 'key9',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value9',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
    ]);
});

test('should handle all happy cases with escape', () => {
    const tokenizer = new Tokenizer({ escape: true });
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
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'ke"y2',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            token: 'val\\ue3',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            token: 'key4',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value4',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key5',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key\\n{6}',
            tokenType: TokenType.KEY,
        },
        {
            token: 'val\\tue{6}',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key7',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key8',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value8',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            token: 'key9',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value9',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
    ]);
});

test('should handle all happy cases without escape', () => {
    const tokenizer = new Tokenizer({ escape: false });
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
            token: 'key',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'ke\\y2',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key3',
            tokenType: TokenType.KEY,
        },
        {
            token: 'val\\\\ue3',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            token: 'key4',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value4',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key5',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key\\n{6}',
            tokenType: TokenType.KEY,
        },
        {
            token: 'val\\tue{6}',
            tokenType: TokenType.VALUE,
        },
        {
            token: 'key7',
            tokenType: TokenType.KEY,
        },
        {
            controlType: ControlType.START_NESTED,
        },
        {
            token: 'key8',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value8',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
        {
            token: 'key9',
            tokenType: TokenType.KEY,
        },
        {
            token: 'value9',
            tokenType: TokenType.VALUE,
        },
        {
            controlType: ControlType.END_NESTED,
        },
    ]);
});

test('should throw with misplaced open bracket after non quoted value', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `"key"value{`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error).toEqual(new TokenizerOpenBracketAfterValueError());
});

test('should throw with misplaced open bracket after quoted value', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `"key""value"{`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error).toEqual(new TokenizerOpenBracketAfterValueError());
});

test('should throw with misplaced close bracket after non quoted key', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `key}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error).toEqual(new TokenizerCloseBracketAfterKeyError());
});

test('should throw with misplaced close bracket after quoted key', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `"key"}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error).toEqual(new TokenizerCloseBracketAfterKeyError());
});

test('should throw when ending too many nest levels', () => {
    const tokenizer = new Tokenizer({ escape: false });
    const input = `"key"{}}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error).toEqual(new TokenizerTooManyBracketsError());
});

test('should throw when the character is unsupported to escape', () => {
    const tokenizer = new Tokenizer({ escape: true });
    const input = `"key\\e"{}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error).toEqual(new TokenizerUnsupportedEscapeSequenceError('\\e'));
});

test('should throw when the escape after quote', () => {
    const tokenizer = new Tokenizer({ escape: true });
    const input = `key\\"{}`;
    let error = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const tokens = [...ingestText(tokenizer, input)];
    } catch (err) {
        error = err;
    }

    expect(error).toEqual(new TokenizerEscapeOutsideQuote());
});
