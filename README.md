# @hinw/vdf-parser

A parser for Valve's KeyValue text file format (VDF) https://developer.valvesoftware.com/wiki/KeyValues.

Support both returning an object OR returning key-value pairs from async iterator / stream.

## Installation

Pick your favorite package manager. For example using `npm`:
```
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
const result = parser.parseText(input);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

### Parse as an iterator / stream

#### Parse a file

```ts
import { VdfParser } from '@hinw/vdf-parser';

// file content: "key" { "nested_key" "value" }"
const filePath = 'input/sample.vdf';

const parser = new VdfParser();
const keyValuePairsIterator = parser.iterateKeyValuesFromFile(filePath);

for await (const pair of keyValuePairsIterator) {
    // assert.assertEqual(pair, { keys: ['key', 'nested_key'], value: 'value' });
}

// Or convert the generator as stream
import stream

const keyValuePairStream = stream.Readable.from(keyValuePairsIterator)
```

#### Parse a read stream

```ts
import { VdfParser } from '@hinw/vdf-parser';

const readStream = stream.Readable.from(`"key" { "nested_key" "value" }"`);
const parser = new VdfParser();
const keyValuePairsIterator = parser.iterateKeyValuesFromFile(filePath);

for await (const pair of keyValuePairsIterator) {
    // assert.assertEqual(pair, { keys: ['key', 'nested_key'], value: 'value' });
}

// Or convert the generator as stream
import stream

const keyValuePairStream = stream.Readable.from(keyValuePairsIterator)
```

## Options

### Escape sequence

By default, the parser will handle escape sequence. To disable this behavior, you can set `disableEscape` to `true`.

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"\\"quoted key\\"" "value"`;
const parser = new VdfParser({ disableEscape: true });
const result = parser.parseText(input);

// assert.assertEqual(result, { '\\"quoted key\\"': 'value' });
```

### Handling duplicated keys

By default, the parser will use the earliest seen value for the duplicated keys.

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }" "key" "value"`;
const parser = new VdfParser();
const result = parser.parseText(input);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

However, you can set `useLatestValue` to `true` to use the latest seen value instead.

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }" "key" "value"`;
const parser = new VdfParser({ useLatestValue: true });
const result = parser.parseText(input);

// assert.assertEqual(result, { 'key': 'value' });
```
