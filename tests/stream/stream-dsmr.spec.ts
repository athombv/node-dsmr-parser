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
} from './../test-utils.js';
import {
  StartOfFrameNotFoundError,
  SmartMeterTimeoutError,
  SmartMeterDecryptionError,
  SmartMeterParserResult,
  UnencryptedDSMRStreamParser,
  EncryptedDSMRStreamParser,
} from '../../src/index.js';
import {
  ENCRYPTED_DLMS_HEADER_LEN,
  ENCRYPTED_DLMS_TELEGRAM_SOF,
} from '../../src/protocols/encryption.js';

const assertDecryptedFrameValid = ({
  actual,
  expected,
  aadValid,
}: {
  actual: unknown;
  expected: object;
  aadValid: boolean;
}) => {
  const parsed = actual as SmartMeterParserResult;
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
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );

      const chunks = chunkString(input, 10);

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new UnencryptedDSMRStreamParser({ stream, callback });

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
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );
      const { input: input2, output: output2 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr/dsmr-4.0-spec-example',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new UnencryptedDSMRStreamParser({ stream, callback });

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

      const instance = new UnencryptedDSMRStreamParser({ stream, callback });

      const data = 'invalid telegram xxx yyy';
      // Make sure the telegram is at least ENCRYPTED_DSMR_HEADER_LEN long to
      // allow encrypted frames to be detected.
      assert.ok(data.length >= ENCRYPTED_DLMS_HEADER_LEN);
      stream.write(data);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof StartOfFrameNotFoundError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);
    });

    it("Doesn't throw error after receiving null character", async () => {
      // Note: some meters send a null character (\0) at the end of the telegram. This should be ignored.
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new UnencryptedDSMRStreamParser({ stream, callback });
      stream.write(input + '\0');
      stream.end();
      instance.destroy();

      assert.deepStrictEqual(callback.mock.calls.length, 1);
      assert.deepStrictEqual(callback.mock.calls[0].arguments[0], null);

      // Need to manually add \0 to the output
      // @ts-expect-error output is not typed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      output.dsmr.raw += '\0';
      assert.deepStrictEqual(callback.mock.calls[0].arguments[1], output);
    });

    it('Throws an error if a full frame is not received in time', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = new UnencryptedDSMRStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
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
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterTimeoutError);
      assert.equal(instance.currentSize(), 0);

      // Writing more data should trigger the sof error again.
      stream.write('Invalid Data');
      // And not trigger a timeout.
      context.mock.timers.tick(fullFrameRequiredWithinMs);

      assert.equal(callback.mock.calls.length, 2);
      assert.ok(callback.mock.calls[1].arguments[0] instanceof StartOfFrameNotFoundError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Throws an error if a full frame is not received in time 2', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = new UnencryptedDSMRStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
      });

      stream.write('/'); // Start by writing the start of the telegram

      context.mock.timers.tick(fullFrameRequiredWithinMs);

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterTimeoutError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Parses when the CRC line is missing', async (context) => {
      context.mock.timers.enable();

      const { input, output } = await readTelegramFromFiles(
        'tests/telegrams/dsmr/iskra-mt-382-no-crc',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new UnencryptedDSMRStreamParser({
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
        'tests/telegrams/dsmr/iskra-mt-382-no-crc',
        true,
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new UnencryptedDSMRStreamParser({
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

      const { input, output } = await readTelegramFromFiles(
        'tests/telegrams/dsmr/iskra-mt-382-no-crc',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new UnencryptedDSMRStreamParser({
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
        'tests/telegrams/dsmr/iskra-mt-382-no-crc-with-text-message',
      );

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new UnencryptedDSMRStreamParser({
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
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });
      const chunks = chunkBuffer(encrypted, 10);

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new EncryptedDSMRStreamParser({
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
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );
      const { input: input2, output: output2 } = await readTelegramFromFiles(
        './tests/telegrams/dsmr/dsmr-4.0-spec-example',
      );

      const encrypted1 = encryptFrame({ frame: input1, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });
      const encrypted2 = encryptFrame({ frame: input2, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const stream = new PassThrough();
      const callback = mock.fn();

      const instance = new EncryptedDSMRStreamParser({
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

      const instance = new EncryptedDSMRStreamParser({
        stream,
        callback,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      stream.write('invalid telegram');

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof StartOfFrameNotFoundError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);
    });

    it('Throws an error if a full frame is not received in time', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = new EncryptedDSMRStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      const frame = encryptFrame({ frame: '', key: TEST_DECRYPTION_KEY, aad: TEST_AAD });
      const header = frame.subarray(0, ENCRYPTED_DLMS_HEADER_LEN);

      stream.write(header); // Write the header, but not the rest of the frame.

      context.mock.timers.tick(fullFrameRequiredWithinMs);

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterTimeoutError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Throws an error if a full frame is not received in time 2', async (context) => {
      context.mock.timers.enable();

      const stream = new PassThrough();
      const callback = mock.fn();

      const fullFrameRequiredWithinMs = 5000;

      const instance = new EncryptedDSMRStreamParser({
        stream,
        callback,
        fullFrameRequiredWithinMs,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      stream.write(Buffer.from([ENCRYPTED_DLMS_TELEGRAM_SOF])); // Start by writing the start of the telegram

      context.mock.timers.tick(fullFrameRequiredWithinMs);

      // Here it should have timed out and called the callback with an error.
      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterTimeoutError);
      assert.equal(instance.currentSize(), 0);

      instance.destroy();
    });

    it('Throws an error if key is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr/dsmr-5.0-spec-example');
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const instance = new EncryptedDSMRStreamParser({
        stream,
        callback,
        decryptionKey: Buffer.from('invalid-key12345', 'ascii'),
        additionalAuthenticatedData: TEST_AAD,
      });

      stream.write(encrypted);

      stream.end();
      instance.destroy();

      assert.equal(callback.mock.calls.length, 1);
      assert.ok(callback.mock.calls[0].arguments[0] instanceof SmartMeterDecryptionError);
      assert.equal(callback.mock.calls[0].arguments[1], undefined);
    });

    it('Parses when AAD is invalid', async () => {
      const stream = new PassThrough();
      const callback = mock.fn();
      const { input, output } = await readTelegramFromFiles(
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const instance = new EncryptedDSMRStreamParser({
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
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );
      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const instance = new EncryptedDSMRStreamParser({
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
