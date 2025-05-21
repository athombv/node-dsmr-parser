import assert from 'node:assert';
import { PassThrough } from 'node:stream';
import { describe, it, mock } from 'node:test';
import { chunkBuffer, readHexFile, readTelegramFromFiles } from './../test-utils.js';
import { StreamDetectType } from '../../src/stream/stream-detect-type.js';

describe('Stream: Detect Type', () => {
  it('Detects unencrypted DSMR telegrams', async () => {
    const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr/dsmr-5.0-spec-example');
    const stream = new PassThrough();
    const callback = mock.fn();

    const detector = new StreamDetectType({ stream, callback });

    stream.write(input);
    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);
    assert.deepStrictEqual(callback.mock.calls[0].arguments[0], {
      mode: 'dsmr',
      encrypted: false,
      data: Buffer.from(input),
    });
  });

  it('Detects unencrypted DSMR telegrams (chunks)', async () => {
    const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr/dsmr-5.0-spec-example');
    const stream = new PassThrough();
    const callback = mock.fn();

    const chunks = chunkBuffer(Buffer.from(input), 1);
    const detector = new StreamDetectType({ stream, callback });

    for (const chunk of chunks) {
      stream.write(chunk);
    }

    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);

    const arg0 = callback.mock.calls[0].arguments[0] as {
      mode: string;
      encrypted: boolean;
      data: Buffer;
    };
    assert.equal(arg0.mode, 'dsmr');
    assert.equal(arg0.encrypted, false);
    assert.ok(Buffer.isBuffer(arg0.data));
  });

  it('Detects encrypted DSMR telegrams', async () => {
    const input = await readHexFile(
      './tests/telegrams/dsmr/encrypted/dsmr-luxembourgh-spec-example-with-aad.txt',
    );
    const stream = new PassThrough();
    const callback = mock.fn();

    const detector = new StreamDetectType({ stream, callback });

    stream.write(input);
    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);
    assert.deepStrictEqual(callback.mock.calls[0].arguments[0], {
      mode: 'dsmr',
      encrypted: true,
      data: input,
    });
  });

  it('Detects encrypted DSMR telegrams (chunks)', async () => {
    const input = await readHexFile(
      './tests/telegrams/dsmr/encrypted/dsmr-luxembourgh-spec-example-with-aad.txt',
    );
    const stream = new PassThrough();
    const callback = mock.fn();

    const chunks = chunkBuffer(input, 1);
    const detector = new StreamDetectType({ stream, callback });

    for (const chunk of chunks) {
      stream.write(chunk);
    }

    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);

    const arg0 = callback.mock.calls[0].arguments[0] as {
      mode: string;
      encrypted: boolean;
      data: Buffer;
    };
    assert.equal(arg0.mode, 'dsmr');
    assert.equal(arg0.encrypted, true);
    assert.ok(Buffer.isBuffer(arg0.data));
  });

  it('Detects unencrypted DLMS telegrams', async () => {
    const input = await readHexFile('./tests/telegrams/dlms/aidon-example-1.txt');
    const stream = new PassThrough();
    const callback = mock.fn();

    const detector = new StreamDetectType({ stream, callback });

    stream.write(input);
    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);
    assert.deepStrictEqual(callback.mock.calls[0].arguments[0], {
      mode: 'dlms',
      encrypted: false,
      data: input,
    });
  });

  it('Detects unencrypted DLMS telegrams (chunks)', async () => {
    const input = await readHexFile('./tests/telegrams/dlms/aidon-example-1.txt');
    const stream = new PassThrough();
    const callback = mock.fn();

    const chunks = chunkBuffer(input, 1);
    const detector = new StreamDetectType({ stream, callback });

    for (const chunk of chunks) {
      stream.write(chunk);
    }

    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);

    const arg0 = callback.mock.calls[0].arguments[0] as {
      mode: string;
      encrypted: boolean;
      data: Buffer;
    };
    assert.equal(arg0.mode, 'dlms');
    assert.equal(arg0.encrypted, false);
    assert.ok(Buffer.isBuffer(arg0.data));
  });

  it('Detects encrypted DLMS telegrams', async () => {
    const input = await readHexFile('./tests/telegrams/dlms/radiusel-example.txt');
    const stream = new PassThrough();
    const callback = mock.fn();

    const detector = new StreamDetectType({ stream, callback });

    stream.write(input);
    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);
    assert.deepStrictEqual(callback.mock.calls[0].arguments[0], {
      mode: 'dlms',
      encrypted: true,
      data: input,
    });
  });

  it('Detects encrypted DLMS telegrams (chunks)', async () => {
    const input = await readHexFile('./tests/telegrams/dlms/radiusel-example.txt');
    const stream = new PassThrough();
    const callback = mock.fn();

    const chunks = chunkBuffer(input, 1);
    const detector = new StreamDetectType({ stream, callback });

    for (const chunk of chunks) {
      stream.write(chunk);
    }

    stream.end();
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 1);

    const arg0 = callback.mock.calls[0].arguments[0] as {
      mode: string;
      encrypted: boolean;
      data: Buffer;
    };
    assert.equal(arg0.mode, 'dlms');
    assert.equal(arg0.encrypted, true);
    assert.ok(Buffer.isBuffer(arg0.data));
  });

  it('Clears random data', async () => {
    const input = Buffer.from('this is not a telegram');
    const stream = new PassThrough();
    const callback = mock.fn();

    const detector = new StreamDetectType({ stream, callback });

    stream.write(input);
    stream.end();

    assert.equal(detector.currentSize(), 0);
    detector.destroy();

    assert.deepStrictEqual(callback.mock.calls.length, 0);
  });

  describe('Handles invalid HDLC headers', () => {
    const test = (input: Buffer, expectedCalls: number) => {
      it(input.toString('hex'), async () => {
        const stream = new PassThrough();
        const callback = mock.fn();

        const detector = new StreamDetectType({ stream, callback });

        stream.write(input);
        stream.end();
        detector.destroy();

        assert.deepStrictEqual(callback.mock.calls.length, expectedCalls);
      });
    };

    // This is a valid HDLC header
    test(Buffer.from('7EA0E22B2113239AE6E700000000', 'hex'), 1);

    // These are not (note that some bytes can be 0x00, and still result in a valid header)
    test(Buffer.from('00A0E22B2113239AE6E700000000', 'hex'), 0);
    test(Buffer.from('7E00E22B2113239AE6E700000000', 'hex'), 0);
    test(Buffer.from('7EA0E2002113239AE6E700000000', 'hex'), 0);
    test(Buffer.from('7EA0E22B0013239AE6E700000000', 'hex'), 0);
    test(Buffer.from('7EA0E22B2113239A00E700000000', 'hex'), 0);
    test(Buffer.from('7EA0E22B2113239AE60000000000', 'hex'), 0);
  });
});
