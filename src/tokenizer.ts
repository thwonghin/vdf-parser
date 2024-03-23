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
const WHITE_SPACE = ' ';
const TAB_SPACE = '\t';
const BOM = String.fromCharCode(65279);
const NEW_LINE_CHAR = '\n';
const CARRIAGE_RETURN_CHAR = '\r';
const BRACKET_OPEN = '{';
const BRACKET_CLOSE = '}';
const COMMENT_START = '//';

const DEFAULT_DEBUG_BUFFER_SIZE = 20;

export enum TokenType {
    KEY,
    VALUE,
    NEST,
}

export enum NestDirection {
    START = '{',
    END = '}',
}

export type TokenResponse = { tokenType: TokenType; value: string };

export type TokenizerOption = {
    disableEscape?: boolean;
    verbose?: boolean;
    debugBufferSize?: number;
};

export class TokenizerError extends Error {
    constructor(message: string, line: number, column: number, near: string) {
        super(
            `At line ${line}:${column}${near ? ` near ${near}` : ''}: ${message}`,
        );
    }
}
export class TokenizerTooManyBracketsError extends TokenizerError {
    constructor(line: number, column: number, near: string) {
        super('Too many closing brackets.', line, column, near);
    }
}
export class TokenizerOpenBracketAfterValueError extends TokenizerError {
    constructor(line: number, column: number, near: string) {
        super('Unexpected open bracket after value.', line, column, near);
    }
}
export class TokenizerCloseBracketAfterKeyError extends TokenizerError {
    constructor(line: number, column: number, near: string) {
        super('Unexpected close bracket after key.', line, column, near);
    }
}
export class TokenizerNoCharacterToEscapeError extends TokenizerError {
    constructor(line: number, column: number, near: string) {
        super('No character to escape.', line, column, near);
    }
}
export class TokenizerUnsupportedEscapeSequenceError extends TokenizerError {
    constructor(sequence: string, line: number, column: number, near: string) {
        super(`Unsupported escape sequence: ${sequence}.`, line, column, near);
    }
}
export class TokenizerEscapeOutsideQuote extends TokenizerError {
    constructor(line: number, column: number, near: string) {
        super('Cannot escape outside of quoted key/value.', line, column, near);
    }
}

// https://developer.valvesoftware.com/wiki/KeyValues#About_KeyValues_Text_File_Format
export class Tokenizer {
    private state: TokenizerState = TokenizerState.AFTER_VALUE;
    private readonly tokenParts: string[] = [];
    private nestedLevel = 0;
    private buffer: string | null = null;
    private currentLineNumber = 0;
    private currentPosition = 0;
    private readonly debugBuffer: string[] = [];

    constructor(private readonly options: TokenizerOption = {}) {}

    public *ingestChar(char: string): Generator<TokenResponse> {
        if (this.buffer === null) {
            this.buffer = char;
            return;
        }

        yield* this.parseCharacter(this.buffer, char);
        if (this.buffer !== null) {
            this.buffer = char;
        }

        this.storeDebugBuffer(char);
    }

    public *flush(): Generator<TokenResponse> {
        yield* this.ingestChar(NEW_LINE_CHAR);
        if (this.buffer !== null) {
            yield* this.parseCharacter(this.buffer, undefined);
            this.buffer = null;
        }
    }

    private storeDebugBuffer(char: string) {
        if (!this.options.verbose) {
            return;
        }

        this.debugBuffer.push(char);
        this.debugBuffer.splice(
            0,
            this.debugBuffer.length -
                (this.options.debugBufferSize ?? DEFAULT_DEBUG_BUFFER_SIZE),
        );
    }

    private *parseCharacter(
        char: string,
        lookahead: string | undefined,
    ): Generator<TokenResponse> {
        switch (char) {
            case CARRIAGE_RETURN_CHAR:
            case BOM:
                // Ignore. Do nothing
                break;
            case NEW_LINE_CHAR:
                yield* this.handleNewLine(char);
                break;
            case WHITE_SPACE:
            case TAB_SPACE:
                yield* this.handleWhitespace(char);
                break;
            case QUOTE:
                yield* this.handleQuote();
                break;
            case BRACKET_OPEN:
                yield* this.handleBracketOpen(char);
                break;
            case BRACKET_CLOSE:
                yield* this.handleBracketClose(char);
                break;
            case ESCAPE:
                if (this.options.disableEscape) {
                    this.handleNormalCharacter(char);
                } else {
                    this.handleEscape(char, lookahead);
                    this.buffer = null;
                }

                break;
            case COMMENT_START[0]:
                if ([char, lookahead].join('') === COMMENT_START) {
                    yield* this.handleComment();
                    this.buffer = null;
                } else {
                    this.handleNormalCharacter(char);
                }

                break;
            default:
                this.handleNormalCharacter(char);
        }

        if (this.options.verbose) {
            console.log(
                `Parsed ${this.currentLineNumber}:${this.currentPosition} ${char === NEW_LINE_CHAR ? 'new_line' : char} ${char.charCodeAt(0)}, State: ${this.state}`,
            );
        }
    }

    private *handleNewLine(char: string) {
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
                this.state = TokenizerState.AFTER_KEY;
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                this.state = TokenizerState.AFTER_VALUE;
                break;
            default:
                assertNever(this.state);
        }

        this.currentLineNumber++;
        this.currentPosition = 0;
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

        this.currentPosition++;
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

        this.currentPosition++;
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
                yield this.emitNest(NestDirection.START);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                throw new TokenizerOpenBracketAfterValueError(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            case TokenizerState.AFTER_KEY:
                yield this.emitNest(NestDirection.START);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.AFTER_VALUE:
                throw new TokenizerOpenBracketAfterValueError(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            case TokenizerState.COMMENT_AFTER_KEY:
                // Do nothing
                break;
            case TokenizerState.COMMENT_AFTER_VALUE:
                // Do nothing
                break;
            default:
                assertNever(this.state);
        }

        this.currentPosition++;
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
                throw new TokenizerCloseBracketAfterKeyError(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                yield this.emitToken(TokenType.VALUE);
                yield this.emitNest(NestDirection.END);
                this.state = TokenizerState.AFTER_VALUE;
                break;
            case TokenizerState.AFTER_KEY:
                throw new TokenizerCloseBracketAfterKeyError(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            case TokenizerState.AFTER_VALUE:
                yield this.emitNest(NestDirection.END);
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

        this.currentPosition++;
    }

    private handleEscape(char: string, lookAhead: string | undefined) {
        if (
            this.state === TokenizerState.COMMENT_AFTER_KEY ||
            this.state === TokenizerState.COMMENT_AFTER_VALUE
        ) {
            this.currentPosition++;
            // Do nothing
            return;
        }

        if (lookAhead === '' || lookAhead === undefined) {
            throw new TokenizerNoCharacterToEscapeError(
                this.currentLineNumber,
                this.currentPosition,
                this.debugBuffer.join(''),
            );
        }

        const charWithLookAhead = [char, lookAhead].join('');

        const keepSlash =
            ESCAPE_SEQUENCES__KEEP_SLASH.includes(charWithLookAhead);
        const removeSlash =
            ESCAPE_SEQUENCES__NO_SLASH.includes(charWithLookAhead);

        if (keepSlash === removeSlash) {
            // Unsupported slash sequence - handle like normal
            this.handleNormalCharacter(char);
            this.handleNormalCharacter(lookAhead);
            this.currentPosition += 2;
            return;
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
                throw new TokenizerEscapeOutsideQuote(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            case TokenizerState.IN_VALUE_WITHOUT_QUOTE:
                throw new TokenizerEscapeOutsideQuote(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            case TokenizerState.AFTER_KEY:
                throw new TokenizerEscapeOutsideQuote(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            case TokenizerState.AFTER_VALUE:
                throw new TokenizerEscapeOutsideQuote(
                    this.currentLineNumber,
                    this.currentPosition,
                    this.debugBuffer.join(''),
                );
            default:
                assertNever(this.state);
        }

        this.currentPosition += 2;
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

        this.currentPosition++;
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

        this.currentPosition++;
    }

    private emitToken(tokenType: TokenType): TokenResponse {
        const result = { tokenType, value: this.tokenParts.join('') };
        this.tokenParts.splice(0);
        return result;
    }

    private emitNest(nestDirection: NestDirection) {
        switch (nestDirection) {
            case NestDirection.START:
                this.nestedLevel++;
                break;
            case NestDirection.END:
                this.nestedLevel--;
                if (this.nestedLevel < 0) {
                    throw new TokenizerTooManyBracketsError(
                        this.currentLineNumber,
                        this.currentPosition,
                        this.debugBuffer.join(''),
                    );
                }

                break;
            default:
                assertNever(nestDirection);
        }

        return { tokenType: TokenType.NEST, value: nestDirection };
    }
}
