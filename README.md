# vdf-parser

A parser for Valve's KeyValue text file format (VDF) https://developer.valvesoftware.com/wiki/KeyValues

## Interfaces

### Parse a file

```ts
import { VdfParser } from '@hinw/vdf-parser';

// file content: "key" { "nested_key" "value" }"
const filePath = 'input/sample.vdf';

const parser = new VdfParser();
const result = await parser.parseFile(filePath);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

### Parse a read stream

```ts
import stream from 'node:stream';
import { VdfParser } from '@hinw/vdf-parser';

const readStream = stream.Readable.from(`"key" { "nested_key" "value" }"`);
const parser = new VdfParser();
const result = await parser.parseStream(readStream);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

### Parse a string

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }"`;
const parser = new VdfParser();
const result = parser.parseText(input);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

## Options

### Enable escape string

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"\"quoted key\"" "value"`;
const parser = new VdfParser({ escape: true });
const result = parser.parseText(input);

// assert.assertEqual(result, { '"quoted key"': 'value' });
```

### Handling duplicate keys

By default, the parser will use the earliest seen value for duplicated keys

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }" "key" "value"`;
const parser = new VdfParser();
const result = parser.parseText(input);

// assert.assertEqual(result, { key: { nested_key: 'value' } });
```

However, you can set `useLatestValue` option to use the latest seen value

```ts
import { VdfParser } from '@hinw/vdf-parser';

const input = `"key" { "nested_key" "value" }" "key" "value"`;
const parser = new VdfParser({ useLatestValue: true });
const result = parser.parseText(input);

// assert.assertEqual(result, { 'key': 'value' });
```
