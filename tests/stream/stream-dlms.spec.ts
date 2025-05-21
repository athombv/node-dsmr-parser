import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import {
  chunkBuffer,
  readDlmsTelegramFromFiles,
  readHexFile,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
} from '../test-utils.js';
import { PassThrough } from 'stream';
import {
  DlmsStreamParser,
  SmartMeterDecryptionError,
  SmartMeterTimeoutError,
  StartOfFrameNotFoundError,
} from '../../src/index.js';
import {
  HDLC_HEADER_LENGTH,
  HDLC_TELEGRAM_SOF_EOF,
  HdlcParserResult,
} from '../../src/protocols/hdlc.js';

describe('Stream DLMS', () => {
  const testDlmsStreamParser = (input: Buffer) => {
    const stream = new PassThrough();
    const callback = mock.fn();

    const instance = new DlmsStreamParser({
      stream,
      callback,
    });

    stream.write(input);
    stream.end();
    instance.destroy();

    return callback.mock.calls;
  };

  describe('Unencrypted', () => {
    it('Parses a chunked unencrypted telegram', async () => {
      const { input, output } = await readDlmsTelegramFromFiles(
        './tests/telegrams/dlms/aidon-example-2',
      );

      const chunks = chunkBuffer(input, 10);
      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new DlmsStreamParser({
        stream,
        callback,
      });

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(
        callback.mock.calls[0].arguments[1],
        JSON.parse(JSON.stringify(output)),
      );
    });

    it('Parses two unencrypted telegrams', async () => {
      const { input: input1, output: output1 } = await readDlmsTelegramFromFiles(
        './tests/telegrams/dlms/aidon-example-1',
      );
      const { input: input2, output: output2 } = await readDlmsTelegramFromFiles(
        './tests/telegrams/dlms/aidon-example-2',
      );

      const calls = testDlmsStreamParser(Buffer.concat([input1, input2]));

      assert.deepStrictEqual(calls.length, 2);
      assert.deepStrictEqual(calls[0].arguments[0], null);
      assert.deepStrictEqual(calls[0].arguments[1], output1);
      assert.deepStrictEqual(calls[1].arguments[0], null);
      assert.deepStrictEqual(calls[1].arguments[1], output2);
    });

    it('Throws error when telegram is invalid', async () => {
      const data = 'invalid telegram xxx yyy';
      assert.ok(data.length > HDLC_HEADER_LENGTH);

      const calls = testDlmsStreamParser(Buffer.from(data));

      assert.equal(calls.length, 1);
      assert.ok(calls[0].arguments[0] instanceof StartOfFrameNotFoundError);
      assert.equal(calls[0].arguments[1], undefined);
    });

    it('Throws error if a full frame is not received in time', async (context) => {
      const { input } = await readDlmsTelegramFromFiles('./tests/telegrams/dlms/aidon-example-2');

      context.mock.timers.enable();

      const fullFrameRequiredWithinMs = 5000;

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new DlmsStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
      });

      const numberOfChunks = 5;
      const chunkSize = 5;

      // Start sending small bits of data, but it should't be enough to complete the frame.
      for (let i = 0; i < numberOfChunks; i++) {
        const chunk = input.subarray(i * chunkSize, (i + 1) * chunkSize);
        stream.write(chunk);
        assert.equal(callback.mock.calls.length, 0);

        context.mock.timers.tick(fullFrameRequiredWithinMs / numberOfChunks);
      }

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterTimeoutError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);

      // Writing invalid data should now throw an error.
      stream.write('invalid data');

      // And not trigger a timeout.
      context.mock.timers.tick(fullFrameRequiredWithinMs);

      assert.equal(callback.mock.calls.length, 2);
      assert.ok(callback.mock.calls[1].arguments[0] instanceof StartOfFrameNotFoundError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Throws error if a full frame is not received in time 2', async (context) => {
      context.mock.timers.enable();

      const fullFrameRequiredWithinMs = 5000;

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new DlmsStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
      });

      stream.write(Buffer.from([HDLC_TELEGRAM_SOF_EOF])); // Start by writing the start of the telegram

      context.mock.timers.tick(fullFrameRequiredWithinMs);

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterTimeoutError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });
  });

  describe('Encrypted', () => {
    it('Throws an error if key is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const input = await readHexFile(
        './tests/telegrams/dlms/encrypted/aidon-example-2-with-aad.txt',
      );

      const instance = new DlmsStreamParser({
        stream,
        callback,
        decryptionKey: Buffer.from('invalid-key12345', 'ascii'),
        additionalAuthenticatedData: TEST_AAD,
      });

      stream.write(input);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterDecryptionError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);
    });

    it('Parses when AAD is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const input = await readHexFile(
        './tests/telegrams/dlms/encrypted/aidon-example-2-with-aad.txt',
      );

      const instance = new DlmsStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: Buffer.from('invalid-key12345', 'ascii'),
      });

      stream.write(input);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      const result = callback.mock.calls[0].arguments[1] as HdlcParserResult;

      assert.equal(result.additionalAuthenticatedDataValid, false);
    });

    it('Parses when AAD is missing', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const input = await readHexFile(
        './tests/telegrams/dlms/encrypted/aidon-example-2-with-aad.txt',
      );

      const instance = new DlmsStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: undefined,
      });

      stream.write(input);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);

      const result = callback.mock.calls[0].arguments[1] as HdlcParserResult;
      assert.equal(result.additionalAuthenticatedDataValid, false);
    });
  });
});
