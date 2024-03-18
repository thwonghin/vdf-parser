import fs from 'node:fs';
import type stream from 'node:stream';

import {
    ControlType,
    TokenType,
    Tokenizer,
    type TokenResponse,
    type ControlResponse,
} from './tokenizer';
import { assertNever } from './utils';

export type VdfParsedKeyValue = {
    keys: string[];
    value: string;
};

export type VdfParserOptions = {
    disableEscape?: boolean;
    useLatestValue?: boolean;
    verbose?: boolean;
    debugBufferSize?: number;
};

export type VdfKeyValueMap = {
    [K: string]: string | VdfKeyValueMap;
};

export class VdfParserError extends Error {}

export class VdfParser {
    public readonly result: VdfKeyValueMap = {};

    private readonly keyStack: string[] = [];
    private readonly tokenizer: Tokenizer;

    constructor(private readonly options: VdfParserOptions = {}) {
        this.tokenizer = new Tokenizer(options);
    }

    /**
     * Parse a file and return an object
     * @example
     * ```
     * import { VdfParser } from '@hinw/vdf-parser';
     *
     * // file content: "key" { "nested_key" "value" }"
     * const filePath = 'input/sample.vdf';
     * const parser = new VdfParser();
     * const result = await parser.parseFile(filePath);
     *
     * // assert.assertEqual(result, { key: { nested_key: 'value' } });
     *
     * ```
     *
     * @param {string} filePath The path to the VDF file
     * @returns {VdfKeyValueMap} The parsed object
     */
    public async parseFile(filePath: string) {
        return this.parseStream(
            fs.createReadStream(filePath, { encoding: 'utf-8' }),
        );
    }

    /**
     * Parse a read stream and return an object
     * @example
     * ```
     * import { VdfParser } from '@hinw/vdf-parser';
     *
     * const readStream = stream.Readable.from(`"key" { "nested_key" "value" }"`);
     * const parser = new VdfParser();
     * const result = await parser.parseStream(readStream)
     *
     * // assert.assertEqual(result, { key: { nested_key: 'value' } });
     *
     * ```
     *
     * @param {stream.Readable} readStream The read stream contains the VDF content
     * @returns {VdfKeyValueMap} The parsed object
     */
    public async parseStream(
        readStream: stream.Readable,
    ): Promise<VdfKeyValueMap> {
        readStream.setEncoding('utf-8');
        for await (const chunk of readStream) {
            this.ingestText(chunk as string, true);
        }

        this.ingestChar('\n');
        this.flush();
        return this.result;
    }

    /**
     * Parse a text and return an object
     * @example
     * ```
     * import { VdfParser } from '@hinw/vdf-parser';
     *
     * const text = `"key" { "nested_key" "value" }"`;
     * const parser = new VdfParser();
     * const result = parser.parseText(text)
     *
     * // assert.assertEqual(result, { key: { nested_key: 'value' } });
     *
     * ```
     *
     * @param {string} text The VDF text content
     * @returns {VdfKeyValueMap} The parsed object
     */
    public parseText(
        text: string,
        skipAppendingNewline?: boolean,
    ): VdfKeyValueMap {
        this.ingestText(text, skipAppendingNewline);
        return this.result;
    }

    /**
     * Parse a file and return an async generator for the key value paris
     * @example
     * import { VdfParser } from '@hinw/vdf-parser';
     * // file content: "key" { "nested_key" "value" }"
     * const filePath = 'input/sample.vdf';
     *
     * const parser = new VdfParser();
     * const keyValuePairsIterator = parser.iterateKeyValuesFromFile(filePath);
     *
     * for await (const pair of keyValuePairsIterator) {
     *     // assert.assertEqual(pair, { keys: ['key', 'nested_key'], value: 'value' });
     * }
     *
     * // Or convert the generator as stream
     * import stream
     * const keyValuePairStream = stream.Readable.from(keyValuePairsIterator)
     *
     * @param {string} filePath The path to the VDF file
     * @returns {AsyncGenerator<VdfParsedKeyValue>} The async generator producing the key value pair
     */
    public async *iterateKeyValuesFromFile(
        filePath: string,
    ): AsyncGenerator<VdfParsedKeyValue> {
        yield* this.iterateKeyValuesFromReadStream(
            fs.createReadStream(filePath, { encoding: 'utf-8' }),
        );
    }

    /**
     * Parse a read stream and return an async generator for the key value paris
     * @example
     * import { VdfParser } from '@hinw/vdf-parser';
     *
     * const readStream = stream.Readable.from(`"key" { "nested_key" "value" }"`);
     * const parser = new VdfParser();
     * const keyValuePairsIterator = parser.iterateKeyValuesFromFile(filePath);
     *
     * for await (const pair of keyValuePairsIterator) {
     *     // assert.assertEqual(pair, { keys: ['key', 'nested_key'], value: 'value' });
     * }
     *
     * // Or convert the generator as stream
     * import stream
     * const keyValuePairStream = stream.Readable.from(keyValuePairsIterator)
     *
     * @param {stream.Readable} readStream The read stream contains the VDF content
     * @returns {AsyncGenerator<VdfParsedKeyValue>} The async generator producing the key value pair
     */
    public async *iterateKeyValuesFromReadStream(
        readStream: stream.Readable,
    ): AsyncGenerator<VdfParsedKeyValue> {
        readStream.setEncoding('utf-8');
        for await (const chunk of readStream) {
            for (const c of chunk) {
                yield* this.iterateKeyValues(c as string);
            }
        }

        yield* this.iterateKeyValues('\n');
        yield* this.flushTokenizer();
    }

    private ingestChar(char: string) {
        for (const pair of this.iterateKeyValues(char)) {
            this.buildKvMap(pair);
        }
    }

    private ingestText(text: string, skipAppendingNewline?: boolean) {
        for (const char of text) {
            this.ingestChar(char);
        }

        if (!skipAppendingNewline) {
            this.ingestChar('\n');
        }
    }

    private flush() {
        for (const pair of this.flushTokenizer()) {
            this.buildKvMap(pair);
        }
    }

    private *iterateKeyValues(char: string) {
        if ([...char].length !== 1) {
            throw new VdfParserError(
                'Should ingest 1 character each time. Use `ingestText` for multiple characters',
            );
        }

        for (const response of this.tokenizer.ingestChar(char)) {
            yield* this.parseTokenResponse(response);
        }
    }

    private *flushTokenizer() {
        for (const response of this.tokenizer.flush()) {
            yield* this.parseTokenResponse(response);
        }
    }

    private *parseTokenResponse(response: TokenResponse | ControlResponse) {
        if ('tokenType' in response) {
            switch (response.tokenType) {
                case TokenType.KEY:
                    this.keyStack.push(response.token);
                    break;
                case TokenType.VALUE:
                    yield {
                        keys: [...this.keyStack],
                        value: response.token,
                    };
                    this.keyStack.pop();
                    break;
                default:
                    assertNever(response.tokenType);
            }
        }

        if ('controlType' in response) {
            switch (response.controlType) {
                case ControlType.START_NESTED:
                    // Nothing need to be done
                    break;
                case ControlType.END_NESTED:
                    this.keyStack.pop();
                    break;
                default:
                    assertNever(response.controlType);
            }
        }
    }

    private buildKvMap(pair: VdfParsedKeyValue) {
        const lastKey = pair.keys.pop();
        if (!lastKey) {
            throw new VdfParserError('Empty key encountered');
        }

        let traversed: VdfKeyValueMap = this.result;
        let key;

        while ((key = pair.keys.shift())) {
            const tempTraversed = traversed[key];

            if (tempTraversed === undefined) {
                const newKvMap = {};
                traversed[key] = newKvMap;
                traversed = newKvMap;
            } else if (typeof tempTraversed === 'string') {
                if (this.options.useLatestValue) {
                    const newKvMap = {};
                    traversed[key] = newKvMap;
                    traversed = newKvMap;
                } else {
                    return;
                }
            } else {
                traversed = tempTraversed;
            }
        }

        if (traversed[lastKey] === undefined || this.options.useLatestValue) {
            traversed[lastKey] = pair.value;
        }
    }
}
