import assert from 'node:assert';
import { PassThrough } from 'node:stream';
import { describe, it, mock } from 'node:test';
import {
  chunkBuffer,
  chunkString,
  encryptFrame,
  readTelegramFromFiles,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
} from './test-utils.js';
import {
  DSMRStartOfFrameNotFoundError,
  DSMR,
  DSMRDecryptionRequired,
  DSMRDecodeError,
  DSMRTimeoutError,
  DSMRDecryptionError,
  DSMRParserResult,
  DSMRParserError,
} from '../src/index.js';
import { ENCRYPTED_DSMR_HEADER_LEN, ENCRYPTED_DSMR_TELEGRAM_SOF } from '../src/util/encryption.js';

const assertDecryptedFrameValid = ({
  actual,
  expected,
  aadValid,
}: {
  actual: unknown;
  expected: object;
  aadValid: boolean;
}) => {
  const parsed = actual as DSMRParserResult;
  assert.equal(parsed.additionalAuthenticatedDataValid, aadValid);

  // Note: this field is not in the output, because the output was not created with encryption enabled.
  // Thus, it is deleted here.
  delete parsed.additionalAuthenticatedDataValid;

  assert.deepStrictEqual(parsed, expected);
};

describe('DSMRStreamParser', () => {
  describe('Unencrypted', () => {
    it('Parses a chunked unencrypted telegram', async () => {
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );

      const chunks = chunkString(input, 10);

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({ stream, callback });

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      instance.destroy();
      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output);
    });

    it('Parses two unencrypted telegrams', async () => {
      const { input: input1, output: output1 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const { input: input2, output: output2 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-4.0-spec-example',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({ stream, callback });

      stream.write(input1 + input2);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 2);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output1);
      assert.deepStrictEqual(callback.mock.calls[1].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[1].arguments[1], output2);
    });

    it('Throws error when telegram is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({ stream, callback });

      const data = 'invalid telegram xxx yyy';
      // Make sure the telegram is at least ENCRYPTED_DSMR_HEADER_LEN long to
      // allow encrypted frames to be detected.
      assert.ok(data.length >= ENCRYPTED_DSMR_HEADER_LEN);
      stream.write(data);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRStartOfFrameNotFoundError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);
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
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        newLineChars: '\n',
      });
      stream.write(input);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output);
    });

    it("Doesn't throw error after receiving null character", async () => {
      // Note: some meters send a null character (\0) at the end of the telegram. This should be ignored.
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({ stream, callback });
      stream.write(input + '\0');
      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], {
        ...output,
        // @ts-expect-error output is not typed
        raw: output.raw + '\0',
      });
    });

    it('Throws an error if a full frame is not received in time', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
        detectEncryption: false,
      });

      stream.write('/'); // Start by writing the start of the telegram

      // Then follow-up with invalid data.
      // After a sof has been received, it should time out after the configured time.
      const numberOfChunks = 5;
      for (let i = 0; i < numberOfChunks; i++) {
        stream.write('Invalid Data');
        assert.equal(callback.mock.calls.length, 0); // No callback should have been called yet.

        context.mock.timers.tick(fullFrameRequiredWithinMs / numberOfChunks);
      }

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRTimeoutError);
      assert.equal(instance.currentSize(), 0);

      // Writing more data should trigger the sof error again.
      stream.write('Invalid Data');
      // And not trigger a timeout.
      context.mock.timers.tick(fullFrameRequiredWithinMs);

      assert.equal(callback.mock.calls.length, 2);
      assert.ok(callback.mock.calls[1].arguments[0] instanceof DSMRStartOfFrameNotFoundError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Throws an error if a full frame is not received in time 2', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
        detectEncryption: false,
      });

      stream.write('/'); // Start by writing the start of the telegram

      context.mock.timers.tick(fullFrameRequiredWithinMs);

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRTimeoutError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Parses when the CRC line is missing', async (context) => {
      context.mock.timers.enable();

      const { input, output } = await readTelegramFromFiles('tests/telegrams/iskra-mt-382-no-crc');

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs: 1000,
      });

      stream.write(input);

      context.mock.timers.tick(1000);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output);
    });

    it('Immediately parses when CRC is missing and a 2nd telegram is received', async (context) => {
      context.mock.timers.enable();

      const { input, output } = await readTelegramFromFiles(
        'tests/telegrams/iskra-mt-382-no-crc',
        true,
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs: 1000,
      });

      stream.write(input);
      stream.write(input);

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output);

      context.mock.timers.tick(1000);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 2);
      assert.deepStrictEqual(callback.mock.calls[1].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[1].arguments[1], output);
    });

    it('Immediately parses when CRC is missing and a three telegrams are received', async (context) => {
      context.mock.timers.enable();

      const { input, output } = await readTelegramFromFiles('tests/telegrams/iskra-mt-382-no-crc');

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs: 1000,
      });

      stream.write(input);
      stream.write(input);
      stream.write(input);

      assert.deepStrictEqual(callback.mock.calls.length, 2);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output);
      assert.deepStrictEqual(callback.mock.calls[1].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[1].arguments[1], output);

      context.mock.timers.tick(1000);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 3);
      assert.deepStrictEqual(callback.mock.calls[2].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[2].arguments[1], output);
    });

    it('Handles text messages', async (context) => {
      context.mock.timers.enable();

      const { input, output } = await readTelegramFromFiles(
        'tests/telegrams/iskra-mt-382-no-crc-with-text-message',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs: 1000,
      });

      stream.write(input);

      context.mock.timers.tick(1000);

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output);

      stream.end();
      instance.destroy();
    });
  });

  describe('Encrypted', () => {
    it('Parses a chunked encrypted telegram', async () => {
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });
      const chunks = chunkBuffer(encrypted, 10);

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      instance.destroy();
      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assertDecryptedFrameValid({
        actual: callback.mock.calls[0].arguments[1],
        expected: output,
        aadValid: true,
      });
    });

    it('Parses two encrypted telegrams', async () => {
      const { input: input1, output: output1 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const { input: input2, output: output2 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-4.0-spec-example',
      );

      const encrypted1 = encryptFrame({ frame: input1, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });
      const encrypted2 = encryptFrame({ frame: input2, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      stream.write(Buffer.concat([encrypted1, encrypted2]));

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 2);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assertDecryptedFrameValid({
        actual: callback.mock.calls[0].arguments[1],
        expected: output1,
        aadValid: true,
      });
      assert.deepStrictEqual(callback.mock.calls[1].arguments[0], null);
      assertDecryptedFrameValid({
        actual: callback.mock.calls[1].arguments[1],
        expected: output2,
        aadValid: true,
      });
    });

    it('Throws error when telegram is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      stream.write('invalid telegram');

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRStartOfFrameNotFoundError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);
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

      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        newLineChars: '\n',
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });
      stream.write(encrypted);

      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assertDecryptedFrameValid({
        actual: callback.mock.calls[0].arguments[1],
        expected: output,
        aadValid: true,
      });
    });

    it('Detects an encrypted frame in non-encrypted mode', async () => {
      const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });
      const chunks = chunkBuffer(encrypted, 1);

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        detectEncryption: true,
        additionalAuthenticatedData: TEST_AAD,
      });

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      instance.destroy();

      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRDecryptionRequired);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], undefined);

      // If the encrypted data contains a start of frame in the final chunks, there could be remaining
      // data left in the buffer, because it is waiting until it has enough data to detect the header of
      // the encrypted frame.
      assert.ok(instance.currentSize() < 2 * ENCRYPTED_DSMR_HEADER_LEN);

      // Because everything is coming in as small chunks, it will be calling the callback multiple times.
      // Each time it should be a DSMRStartOfFrameNotFoundError error, because only after the first chunks
      // it should be able to detect that it is an encrypted frame.
      for (let index = 1; index < callback.mock.calls.length; index++) {
        const error = callback.mock.calls[index].arguments[0] as unknown;
        assert.ok(
          (error instanceof DSMRDecodeError && !(error instanceof DSMRDecryptionRequired)) ||
            error instanceof DSMRParserError,
        );
        assert.deepStrictEqual(callback.mock.calls[index].arguments[1], undefined);
      }
    });

    // Make sure that if the first chunk does not contain the
    // full header, it will can still detect the encrypted frame when
    it('Detects non-aligned encrypted frame', async () => {
      const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
      const originalEncrypted = encryptFrame({
        frame: input,
        key: TEST_DECRYPTION_KEY,
        aad: TEST_AAD,
      });

      const prefix = Buffer.from(
        [...new Array<number>(ENCRYPTED_DSMR_HEADER_LEN - 1)].map(() => 0x00),
      );

      const encrypted = Buffer.concat([prefix, originalEncrypted]);
      const chunks = chunkBuffer(encrypted, ENCRYPTED_DSMR_HEADER_LEN);

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        detectEncryption: true,
        additionalAuthenticatedData: TEST_AAD,
      });

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      instance.destroy();

      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRDecryptionRequired);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], undefined);

      // If the encrypted data contains a start of frame in the final chunks, there could be remaining
      // data left in the buffer, because it is waiting until it has enough data to detect the header of
      // the encrypted frame.
      assert.ok(instance.currentSize() < 2 * ENCRYPTED_DSMR_HEADER_LEN);

      // Because everything is coming in as small chunks, it will be calling the callback multiple times.
      // Each time it should be a kind of DSMRDecodeError error, because only after the first chunks
      // it should be able to detect that it is an encrypted frame.
      for (let index = 1; index < callback.mock.calls.length; index++) {
        const error = callback.mock.calls[index].arguments[0] as unknown;
        assert.ok(error instanceof DSMRDecodeError && !(error instanceof DSMRDecryptionRequired));
        assert.deepStrictEqual(callback.mock.calls[index].arguments[1], undefined);
      }
    });

    it('Throws an error if a full frame is not received in time', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      const frame = encryptFrame({ frame: '', key: TEST_DECRYPTION_KEY, aad: TEST_AAD });
      const header = frame.subarray(0, ENCRYPTED_DSMR_HEADER_LEN);

      stream.write(header); // Write the header, but not the rest of the frame.

      context.mock.timers.tick(fullFrameRequiredWithinMs);

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRTimeoutError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Throws an error if a full frame is not received in time 2', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
        detectEncryption: false,
      });

      stream.write(Buffer.from([ENCRYPTED_DSMR_TELEGRAM_SOF])); // Start by writing the start of the telegram

      context.mock.timers.tick(fullFrameRequiredWithinMs);

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRTimeoutError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Throws an error if key is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        decryptionKey: Buffer.from('invalid-key12345', 'ascii'),
        additionalAuthenticatedData: TEST_AAD,
      });

      stream.write(encrypted);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof DSMRDecryptionError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);
    });

    it('Parses when AAD is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: Buffer.from('invalid-key12345', 'ascii'),
      });

      stream.write(encrypted);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assertDecryptedFrameValid({
        actual: callback.mock.calls[0].arguments[1],
        expected: output,
        aadValid: false,
      });
    });

    it('Parses when AAD is missing', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr-5.0-spec-example',
      );
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const instance = DSMR.createStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: undefined,
      });

      stream.write(encrypted);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);
      assertDecryptedFrameValid({
        actual: callback.mock.calls[0].arguments[1],
        expected: output,
        aadValid: false,
      });
    });
  });
});
