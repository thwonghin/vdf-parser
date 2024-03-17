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

export type ParsedKeyValue = {
    key: string;
    value: string;
};

export type ParserOptions = {
    escape: boolean;
    useLatestValue: boolean;
};

export type KeyValueMap = {
    [K: string]: string | KeyValueMap;
};

export class ParserError extends Error {}

export class Parser {
    public readonly result: KeyValueMap = {};

    private readonly keyStack: string[] = [];
    private readonly tokenizer: Tokenizer;

    constructor(private readonly options: ParserOptions) {
        this.tokenizer = new Tokenizer(options);
    }

    public async parseFile(filePath: string) {
        return this.parseStream(
            fs.createReadStream(filePath, { encoding: 'utf-8' }),
        );
    }

    public async parseStream(
        readStream: stream.Readable,
    ): Promise<KeyValueMap> {
        readStream.setEncoding('utf-8');
        for await (const chunk of readStream) {
            this.ingestText(chunk as string);
        }

        this.flush();
        return this.result;
    }

    public parseText(text: string): KeyValueMap {
        this.ingestText(text);
        this.flush();
        return this.result;
    }

    private ingestChar(char: string) {
        for (const pair of this.ingestIterator(char)) {
            this.buildKvMap(pair);
        }
    }

    private ingestText(text: string) {
        for (const char of text) {
            this.ingestChar(char);
        }

        this.ingestChar('\n');
    }

    private flush() {
        for (const pair of this.flushIterator()) {
            this.buildKvMap(pair);
        }
    }

    private *ingestIterator(char: string) {
        if (char.length !== 1) {
            throw new ParserError(
                'Should ingest 1 character each time. Use `ingestText` for multiple characters',
            );
        }

        for (const response of this.tokenizer.ingestChar(char)) {
            yield* this.parseTokenResponse(response);
        }
    }

    private *ingestTextIterator(text: string) {
        for (const char of text) {
            yield* this.ingestIterator(char);
        }

        yield* this.ingestIterator('\n');
    }

    private *flushIterator() {
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
                        key: this.keyStack.join('.'),
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

    private buildKvMap(pair: ParsedKeyValue) {
        const keys = pair.key.split('.');
        const lastKey = keys.pop();
        if (!lastKey) {
            throw new ParserError('Empty key encountered');
        }

        let traversed: KeyValueMap = this.result;
        let key;

        while ((key = keys.shift())) {
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
