[![npm version](https://img.shields.io/npm/v/%40hinw%2Fvdf-parser)](https://www.npmjs.com/package/@hinw/vdf-parser) [![JSR](https://jsr.io/badges/@hinw/vdf-parser)](https://jsr.io/@hinw/vdf-parser)

# @hinw/vdf-parser

A simple parser for Valve's KeyValue text file format (VDF) https://developer.valvesoftware.com/wiki/KeyValues. Written in JavaScript (TypeScript).

Support both returning an object OR piping readable stream to the parser streaming out key-value pairs.

## Installation

Pick your favorite package manager. For example using `npm`:

```bash
npm install @hinw/vdf-parser
```

## Interfaces

### Parse as an object

#### Parse a file

```ts
import { VdfParser } from '@hinw/vdf-parser';

// file content: "key" { "nested_key" "value" }"
const filePath = 'input/sample.vdf';

const parser = new VdfParser();
const result = await parser.parseFile(filePath);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

#### Parse a read stream

```ts
import stream from 'node:stream';
import { VdfParser } from '@hinw/vdf-parser';

const readStream = stream.Readable.from(`"key" { "nested_key" "value" }"`);
const parser = new VdfParser();
const result = await parser.parseStream(readStream);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

#### Parse a string

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }"`;
const parser = new VdfParser();
const result = await parser.parseText(input);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

### Stream interface related

#### `pipe` to the parser and build the object from the stream output

```ts
import fs from 'node:fs'
import { VdfParser } from '@hinw/vdf-parser';

// file content: "key" { "nested_key" "value" }"
const filePath = 'input/sample.vdf';

const parser = new VdfParser();
const fileStream = fs.createReadStream(filePath)
const parserStream = fileStream.pipe(parser)

for await (const pair of parserStream) {
    // assert.assertEqual(pair, { keyParts: ['key', 'nested_key'], value: 'value' });
}
```

#### Condense the pairs to an object using `condensePairs` or `condensePairsAsync`

```ts
// You can build the object from the stream using async iterator interface:
const fileStream = fs.createReadStream(filePath)
const parserStream = fileStream.pipe(parser)
const result = await parser.condensePairsAsync(parserStream)

// Or you can store the pairs somewhere, and build it afterwards with normal iterator interface:
const fileStream = fs.createReadStream(filePath)
const parserStream = fileStream.pipe(parser)
const pairs = await Array.fromAsync(parserStream)
const result = parser.condensePairs(pairs)

```

## Options

### Escape sequence

By default, the parser will handle escape sequence. To disable this behavior, you can set `disableEscape` to `true`.

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"\\"quoted key\\"" "value"`;
const parser = new VdfParser({ disableEscape: true });
const result = await parser.parseText(input);

// assert.assertEqual(result, { '\\"quoted key\\"': 'value' });
```

### Handling duplicated keys

#### Separated maps

If the values of the duplicated keys are all maps, they will be merged together
```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }" "key" { "nested_key_2" "value" }"`;
const parser = new VdfParser({ useLatestValue: true });
const result = await parser.parseText(input);

// assert.assertEqual(result, { key: { nested_key: 'value', nested_key_2: 'value' } });
```

#### Map vs normal value

By default, the parser will use the earliest seen value for the duplicated keys.

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }" "key" "value"`;
const parser = new VdfParser();
const result = await parser.parseText(input);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

However, you can set `useLatestValue` to `true` to use the latest seen value instead.

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }" "key" "value"`;
const parser = new VdfParser({ useLatestValue: true });
const result = await parser.parseText(input);

// assert.assertEqual(result, { key: 'value' });
```

## Misc

### No type conversion

Since the VDF specification does not contain any type info, it would be a guess work to convert some value to a certain type. To keep this library simple, it would not provide an option to do auto type detection / conversion.
In theory if the user is interested in using the values of a VDF they should know the schema of the file well and it is the responsibiliy for the user to convert the types instead of this library doing the guess work.
