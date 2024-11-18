import assert from 'assert';
import { PassThrough } from 'node:stream';
import { describe, it, mock } from 'node:test';
import { chunkBuffer, chunkString, encryptFrame, readTelegramFromFiles } from './test-utils.js';
import { DSMRStartOfFrameNotFoundError, DSMR } from '../src/index.js';

describe('DSMRStreamParser', () => {
  describe('Unencrypted', () => {
    it('Parses a chunked unencrypted telegram', async () => {
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );

      const chunks = chunkString(input, 10);

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(stream, {}, callbackMock);

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      instance.destroy();
      assert.deepStrictEqual(callbackMock.mock.calls.length, 1);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output);
    });

    it('Parses two unencrypted telegrams', async () => {
      const { input: input1, output: output1 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const { input: input2, output: output2 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-4.0-spec-example',
      );

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(stream, {}, callbackMock);

      stream.write(input1 + input2);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callbackMock.mock.calls.length, 2);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output1);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[1], output2);
    });

    it('Throws error when telegram is invalid', async () => {
      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(stream, {}, callbackMock);

      stream.write('invalid telegram');

      stream.end();
      instance.destroy();

      assert.equal(callbackMock.mock.calls.length, 1);
      assert.ok(callbackMock.mock.calls[0].arguments[0] instanceof DSMRStartOfFrameNotFoundError);
      assert.equal(callbackMock.mock.calls[0].arguments[1], undefined);
    });

    it('Parses a telegram with a different newline character', async () => {
      // Note: use this file specifically because it doesn't have a CRC. The CRC is calculated using \r\n characters in
      // the other files, thus the assert would fail.
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-3.0-spec-example',
        false,
      );

      // Need to manually replace \r\n with \n because the expected output is using \r\n
      // @ts-expect-error output is not typed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      output.raw = output.raw.replace(/\r\n/g, '\n');

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(stream, { newLineChars: '\n' }, callbackMock);
      stream.write(input);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callbackMock.mock.calls.length, 1);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output);
    });

    it("Doesn't throw error after receiving null character", async () => {
      // Note: some meters send a null character (\0) at the end of the telegram. This should be ignored.
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(stream, {}, callbackMock);
      stream.write(input + '\0');
      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callbackMock.mock.calls.length, 1);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], {
        ...output,
        // @ts-expect-error output is not typed
        raw: output.raw + '\0',
      });
    });
  });

  describe('Encrypted', () => {
    it('Parses a chunked encrypted telegram', async () => {
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const decryptionKey = '0123456789ABCDEF';
      const encrypted = encryptFrame({ frame: input, key: decryptionKey });
      const chunks = chunkBuffer(encrypted, 10);

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(stream, { decryptionKey }, callbackMock);

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      instance.destroy();
      assert.deepStrictEqual(callbackMock.mock.calls.length, 1);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output);
    });

    it('Parses two encrypted telegrams', async () => {
      const { input: input1, output: output1 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const { input: input2, output: output2 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-4.0-spec-example',
      );

      const decryptionKey = '0123456789ABCDEF';
      const encrypted1 = encryptFrame({ frame: input1, key: decryptionKey });
      const encrypted2 = encryptFrame({ frame: input2, key: decryptionKey });

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(stream, { decryptionKey }, callbackMock);

      stream.write(Buffer.concat([encrypted1, encrypted2]));

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callbackMock.mock.calls.length, 2);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output1);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[1], output2);
    });

    it('Throws error when telegram is invalid', async () => {
      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(
        stream,
        { decryptionKey: '0123456789ABCDEF' },
        callbackMock,
      );

      stream.write('invalid telegram');

      stream.end();
      instance.destroy();

      assert.equal(callbackMock.mock.calls.length, 1);
      assert.ok(callbackMock.mock.calls[0].arguments[0] instanceof DSMRStartOfFrameNotFoundError);
      assert.equal(callbackMock.mock.calls[0].arguments[1], undefined);
    });

    it('Parses a telegram with a different newline character', async () => {
      // Note: use this file specifically because it doesn't have a CRC. The CRC is calculated using \r\n characters in
      // the other files, thus the assert would fail.
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-3.0-spec-example',
        false,
      );

      // Need to manually replace \r\n with \n because the expected output is using \r\n
      // @ts-expect-error output is not typed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      output.raw = output.raw.replace(/\r\n/g, '\n');

      const decryptionKey = '0123456789ABCDEF';
      const encrypted = encryptFrame({ frame: input, key: decryptionKey });

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const instance = DSMR.parseFromStream(
        stream,
        { newLineChars: '\n', decryptionKey },
        callbackMock,
      );
      stream.write(encrypted);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callbackMock.mock.calls.length, 1);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output);
    });
  });
});
