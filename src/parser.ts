import fs from 'node:fs';
import stream from 'node:stream';

import {
    ControlType,
    TokenType,
    Tokenizer,
    type TokenResponse,
    type ControlResponse,
} from './tokenizer';
import { assertNever } from './utils';

export type VdfParsedKeyValue = {
    keyParts: string[];
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
export class VdfParserInvalidParamsError extends VdfParserError {}

export class VdfParser extends stream.Transform {
    private keyStack: string[] = [];
    private readonly tokenizer: Tokenizer;

    constructor(private readonly options: VdfParserOptions = {}) {
        super({
            objectMode: true,
        });

        this.tokenizer = new Tokenizer(options);
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
        const result = {};
        this.reset();

        readStream.setEncoding('utf-8');

        return new Promise((resolve, reject) => {
            readStream
                ?.pipe(this)
                .on('data', (pair: VdfParsedKeyValue) => {
                    this.appendPair(pair, result);
                })
                .on('end', () => {
                    resolve(result);
                })
                .on('error', (err: Error) => {
                    reject(err);
                });
        });
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
     * Parse a text and return an object
     * @example
     * ```
     * import { VdfParser } from '@hinw/vdf-parser';
     *
     * const text = `"key" { "nested_key" "value" }"`;
     * const parser = new VdfParser();
     * const result = await parser.parseText(text)
     *
     * // assert.assertEqual(result, { key: { nested_key: 'value' } });
     *
     * ```
     *
     * @param {string} text The VDF text content
     * @returns {VdfKeyValueMap} The parsed object
     */
    public async parseText(text: string): Promise<VdfKeyValueMap> {
        return this.parseStream(stream.Readable.from(text));
    }

    /**
     * More manual way to parse the object that takes *async* iterable of key values.
     * @example
     * ```
     * import { VdfParser } from '@hinw/vdf-parser';
     *
     * // file content: "key" { "nested_key" "value" }"
     * const filePath = 'input/sample.vdf';
     * const readStream = fs.createReadStream(filePath)
     * const parser = new VdfParser();
     *
     * // Note that we can pipe the stream to the parser
     * // Produces { keyParts: ['key', 'nested_key'], value: 'value' }
     * const keyValuesStream = readStream.pipe(parser)
     * const result = await parser.condenseParisAsync(keyValueStream)
     *
     * // assert.assertEqual(result, { key: { nested_key: 'value' } });
     * ```
     * @param {AsyncIterable<VdfParsedKeyValue>} pairs An async iterable that produces key value pairs { keyParts: string[]; value: string }
     * @returns {VdfKeyValueMap} The parsed object
     */
    public async condensePairsAsync(
        pairs: AsyncIterable<VdfParsedKeyValue>,
    ): Promise<VdfKeyValueMap> {
        const result = {};
        this.reset();

        for await (const pair of pairs) {
            this.appendPair(pair, result);
        }

        return result;
    }

    /**
     * More manual way to parse the object that takes iterable of key values.
     * @example
     * ```
     * import { VdfParser } from '@hinw/vdf-parser';
     *
     * const parser = new VdfParser();
     * const result = await parser.condensePairs([{ keyParts: ['key', 'nested_key'], value: 'value' }])
     *
     * // assert.assertEqual(result, { key: { nested_key: 'value' } });
     * ```
     * @param {Iterable<VdfParsedKeyValue>} pairs An iterable that produces key value pairs { keyParts: string[]; value: string }
     * @returns {VdfKeyValueMap} The parsed object
     */
    public condensePairs(pairs: Iterable<VdfParsedKeyValue>): VdfKeyValueMap {
        const result = {};
        this.reset();

        for (const pair of pairs) {
            this.appendPair(pair, result);
        }

        return result;
    }

    /**
     * Reset the internal states of this instance so this can be reused for next parsing
     */
    public reset() {
        this.keyStack = [];
    }

    override _transform(
        chunk: string,
        encoding: BufferEncoding,
        callback: stream.TransformCallback,
    ): void {
        for (const char of chunk.toString()) {
            this.ingestChar(char);
        }

        callback();
    }

    override _flush(callback: stream.TransformCallback): void {
        this.ingestChar('\n');
        this.flushTokenizer();

        this.reset();
        callback();
    }

    private appendPair(pair: VdfParsedKeyValue, result: VdfKeyValueMap) {
        const lastKey = pair.keyParts.pop();
        if (!lastKey) {
            throw new VdfParserError('Empty key encountered');
        }

        let traversed: VdfKeyValueMap = result;
        let key;

        while ((key = pair.keyParts.shift())) {
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

    private ingestChar(char: string) {
        for (const response of this.tokenizer.ingestChar(char)) {
            this.parseTokenResponse(response);
        }
    }

    private flushTokenizer() {
        for (const response of this.tokenizer.flush()) {
            this.parseTokenResponse(response);
        }
    }

    private parseTokenResponse(response: TokenResponse | ControlResponse) {
        if ('tokenType' in response) {
            switch (response.tokenType) {
                case TokenType.KEY:
                    this.keyStack.push(response.token);
                    break;
                case TokenType.VALUE:
                    this.push({
                        keyParts: [...this.keyStack],
                        value: response.token,
                    });
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
}
