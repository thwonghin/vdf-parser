import { assertNever } from './utils';

enum TokenizerState {
    IN_KEY_WITH_QUOTE,
    IN_VALUE_WITH_QUOTE,
    IN_KEY_WITHOUT_QUOTE,
    IN_VALUE_WITHOUT_QUOTE,
    AFTER_KEY,
    AFTER_VALUE,
    COMMENT_AFTER_KEY,
    COMMENT_AFTER_VALUE,
}

const ESCAPE = '\\';
const ESCAPE_SEQUENCES__KEEP_SLASH = ['\\n', '\\t'];
const ESCAPE_SEQUENCES__NO_SLASH = ['\\\\', '\\"'];
const QUOTE = '"';
const WHITE_SPACE_CHARS = [' ', '\t'];
const NEW_LINE_CHARS = ['\r', '\n'];
const BRACKET_OPEN = '{';
const BRACKET_CLOSE = '}';
const COMMENT_START = '//';

export enum TokenType {
    KEY,
    VALUE,
}

export enum ControlType {
    START_NESTED,
    END_NESTED,
}

export type TokenResponse = { tokenType: TokenType; token: string };
export type ControlResponse = { controlType: ControlType };

export type TokenizerOption = {
    escape: boolean;
};

export class TokenizerError extends Error {}
export class TokenizerTooManyBracketsError extends TokenizerError {
    public override message = 'Too many closing brackets.';
}
export class TokenizerOpenBracketAfterValueError extends TokenizerError {
    public override message = 'Unexpected open bracket after value.';
}
export class TokenizerCloseBracketAfterKeyError extends TokenizerError {
    public override message = 'Unexpected close bracket after key.';
}
export class TokenizerNoCharacterToEscapeError extends TokenizerError {
    public override message = 'No character to escape.';
}
export class TokenizerUnsupportedEscapeSequenceError extends TokenizerError {
    constructor(sequence: string) {
        super(`Unsupported escape sequence: ${sequence}.`);
    }
}
export class TokenizerEscapeOutsideQuote extends TokenizerError {
    public override message = 'Cannot escape outside of quoted key/value';
}

// https://developer.valvesoftware.com/wiki/KeyValues#About_KeyValues_Text_File_Format
export class Tokenizer {
    private state: TokenizerState = TokenizerState.AFTER_VALUE;
    private readonly tokenParts: string[] = [];
    private nestedLevel = 0;
    private buffer: string | null = null;

    constructor(private readonly options: TokenizerOption) {}

    public *consume(char: string): Generator<TokenResponse | ControlResponse> {
        if (char.length !== 1) {
            throw new TokenizerError(
                'Should consume 1 character each time. Use `consumeLine` for multiple characters',
            );
        }

        if (this.buffer === null) {
            this.buffer = char;
            return;
        }

        yield* this.parseCharacter(this.buffer, char);
        if (this.buffer !== null) {
            this.buffer = char;
        }
    }

    public *flush(): Generator<TokenResponse | ControlResponse> {
        yield* this.consume('\n');
        if (this.buffer !== null) {
            yield* this.parseCharacter(this.buffer, undefined);
            this.buffer = null;
        }
    }

    public *consumeLine(
        line: string,
    ): Generator<TokenResponse | ControlResponse> {
        for (const char of line) {
            yield* this.consume(char);
        }

        yield* this.flush();
    }

    private *parseCharacter(
        char: string,
        lookahead: string | undefined,
    ): Generator<TokenResponse | ControlResponse> {
        if (NEW_LINE_CHARS.includes(char)) {
            yield* this.handleNewLine();
        } else if (WHITE_SPACE_CHARS.includes(char)) {
            yield* this.handleWhitespace(char);
        } else if (char === QUOTE) {
            yield* this.handleQuote();
        } else if (char === BRACKET_OPEN) {
            yield* this.handleBracketOpen(char);
        } else if (char === BRACKET_CLOSE) {
            yield* this.handleBracketClose(char);
        } else if (char === ESCAPE) {
            if (this.options.escape) {
                this.handleEscape(char, lookahead);
                this.buffer = null;
            } else {
                this.handleNormalCharacter(char);
            }
        } else if ([char, lookahead].join('') === COMMENT_START) {
            yield* this.handleComment();
        } else {
            this.handleNormalCharacter(char);
        }
    }

    private *handleNewLine() {
        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                yield this.emitToken(TokenType.KEY);
                this.state = TokenizerState.AFTER_KEY;
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.KEY);
                this.state = TokenizerState.AFTER_KEY;
                break;
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.AFTER_VALUE:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_KEY:
                this.state = TokenizerState.AFTER_KEY;
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                this.state = TokenizerState.AFTER_VALUE;
                break;
            default:
                assertNever(this.state);
        }
    }

    private *handleWhitespace(char: string) {
        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.KEY);
                this.state = TokenizerState.AFTER_KEY;
                break;
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.AFTER_VALUE:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                // Do nothing
                break;
            default:
                assertNever(this.state);
        }
    }

    private *handleQuote() {
        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                yield this.emitToken(TokenType.KEY);
                this.state = TokenizerState.AFTER_KEY;
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.KEY);
                this.state = TokenizerState.AFTER_KEY;
                break;
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.AFTER_KEY:
                this.state = TokenizerState.IN_VALUE_WITH_QUOTE;
                break;
            case TokenizerState.AFTER_VALUE:
                this.state = TokenizerState.IN_KEY_WITH_QUOTE;
                break;
            case TokenizerState.COMMENT_AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                // Do nothing
                break;
            default:
                assertNever(this.state);
        }
    }

    private *handleBracketOpen(char: string) {
        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.KEY);
                yield this.emitControl(ControlType.START_NESTED);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                throw new TokenizerOpenBracketAfterValueError();
            case TokenizerState.AFTER_KEY:
                yield this.emitControl(ControlType.START_NESTED);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.AFTER_VALUE:
                throw new TokenizerOpenBracketAfterValueError();
            case TokenizerState.COMMENT_AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                // Do nothing
                break;
            default:
                assertNever(this.state);
        }
    }

    private *handleBracketClose(char: string) {
        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                throw new TokenizerCloseBracketAfterKeyError();
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                yield this.emitControl(ControlType.END_NESTED);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.AFTER_KEY:
                throw new TokenizerCloseBracketAfterKeyError();
            case TokenizerState.AFTER_VALUE:
                yield this.emitControl(ControlType.END_NESTED);
                break;
            case TokenizerState.COMMENT_AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                // Do nothing
                break;
            default:
                assertNever(this.state);
        }
    }

    private handleEscape(char: string, lookAhead: string | undefined) {
        if (
            this.state === TokenizerState.COMMENT_AFTER_KEY ||
            this.state === TokenizerState.COMMENT_AFTER_VALUE
        ) {
            // Do nothing
            return;
        }

        console.log('char', char);
        console.log('lookAhead', lookAhead);

        if (lookAhead === '' || lookAhead === undefined) {
            throw new TokenizerNoCharacterToEscapeError();
        }

        const charWithLookAhead = [char, lookAhead].join('');

        const keepSlash =
            ESCAPE_SEQUENCES__KEEP_SLASH.includes(charWithLookAhead);
        const removeSlash =
            ESCAPE_SEQUENCES__NO_SLASH.includes(charWithLookAhead);

        if (keepSlash === removeSlash) {
            throw new TokenizerUnsupportedEscapeSequenceError(
                charWithLookAhead,
            );
        }

        const charToPush = keepSlash ? charWithLookAhead : lookAhead;

        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                this.tokenParts.push(charToPush);
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                this.tokenParts.push(charToPush);
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                throw new TokenizerEscapeOutsideQuote();
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                throw new TokenizerEscapeOutsideQuote();
            case TokenizerState.AFTER_KEY:
                throw new TokenizerEscapeOutsideQuote();
            case TokenizerState.AFTER_VALUE:
                throw new TokenizerEscapeOutsideQuote();
            default:
                assertNever(this.state);
        }
    }

    private handleNormalCharacter(char: string) {
        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                this.tokenParts.push(char);
                break;
            case TokenizerState.AFTER_KEY:
                this.tokenParts.push(char);
                this.state = TokenizerState.IN_VALUE_WITHOUT_QUOTE;
                break;
            case TokenizerState.AFTER_VALUE:
                this.tokenParts.push(char);
                this.state = TokenizerState.IN_KEY_WITHOUT_QUOTE;
                break;
            case TokenizerState.COMMENT_AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                // Do nothing
                break;
            default:
                assertNever(this.state);
        }
    }

    private *handleComment() {
        switch (this.state) {
            case TokenizerState.IN_KEY_WITH_QUOTE:
                yield this.emitToken(TokenType.KEY);
                this.state = TokenizerState.COMMENT_AFTER_KEY;
                break;
            case TokenizerState.IN_VALUE_WITH_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                this.state = TokenizerState.COMMENT_AFTER_VALUE;
                break;
            case TokenizerState.IN_KEY_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.KEY);
                this.state = TokenizerState.COMMENT_AFTER_KEY;
                break;
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                this.state = TokenizerState.COMMENT_AFTER_VALUE;
                break;
            case TokenizerState.AFTER_KEY:
                this.state = TokenizerState.COMMENT_AFTER_KEY;
                break;
            case TokenizerState.AFTER_VALUE:
                this.state = TokenizerState.COMMENT_AFTER_VALUE;
                break;
            case TokenizerState.COMMENT_AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                // Do nothing
                break;
            default:
                assertNever(this.state);
        }
    }

    private emitToken(tokenType: TokenType) {
        const result = { tokenType, token: this.tokenParts.join('') };
        this.tokenParts.splice(0);
        return result;
    }

    private emitControl(controlType: ControlType) {
        switch (controlType) {
            case ControlType.START_NESTED:
                this.nestedLevel++;
                break;
            case ControlType.END_NESTED:
                this.nestedLevel--;
                if (this.nestedLevel < 0) {
                    throw new TokenizerTooManyBracketsError();
                }

                break;
            default:
                assertNever(controlType);
        }

        return { controlType };
    }
}
