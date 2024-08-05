import { describe, it, mock} from 'node:test';
import { chunkBuffer, chunkString, encryptFrame, readTelegramFromFiles } from './test-utils';
import { PassThrough } from 'stream';
import { DSMRStreamParser } from '../src';
import assert from 'assert';

describe('DSMRStreamParser', () => {
  describe('Unencrypted', () => {
    it('Parses a chunked unencrypted telegram', async () => {
      const { input, output } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');

      const chunks = chunkString(input, 10);

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const removeListener = DSMRStreamParser(stream, {}, callbackMock);

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      removeListener();
      assert.deepStrictEqual(callbackMock.mock.calls.length, 1);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output);
    });

    it('Parses two unencrypted telegrams', async () => {
      const { input: input1, output: output1 } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
      const { input: input2, output: output2 } = await readTelegramFromFiles('./tests/telegrams/dsmr-4.0-spec-example');

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const removeListener = DSMRStreamParser(stream, {}, callbackMock);

      stream.write(input1 + input2)

      stream.end();
      removeListener();

      assert.deepStrictEqual(callbackMock.mock.calls.length, 2);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output1);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[1], output2);
    });

    it('Parses a chunked encrypted telegram', async () => {
      const { input, output } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
      const decryptionKey = '0123456789ABCDEF';
      const encrypted = encryptFrame({ frame: input, key: decryptionKey });
      const chunks = chunkBuffer(encrypted, 10);
      
      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const removeListener = DSMRStreamParser(stream, { decryptionKey }, callbackMock);

      for (const chunk of chunks) {
        stream.write(chunk);
      }

      stream.end();
      removeListener();
      assert.deepStrictEqual(callbackMock.mock.calls.length, 1);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output);
    });

    it('Parses two encrypted telegrams', async () => {
      const { input: input1, output: output1 } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
      const { input: input2, output: output2 } = await readTelegramFromFiles('./tests/telegrams/dsmr-4.0-spec-example');

      const decryptionKey = '0123456789ABCDEF';
      const encrypted1 = encryptFrame({ frame: input1, key: decryptionKey });
      const encrypted2 = encryptFrame({ frame: input2, key: decryptionKey });

      const stream = new PassThrough();
      const callbackMock = mock.fn();

      const removeListener = DSMRStreamParser(stream, { decryptionKey }, callbackMock);

      stream.write(Buffer.concat([encrypted1, encrypted2]));

      stream.end();
      removeListener();

      assert.deepStrictEqual(callbackMock.mock.calls.length, 2);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[0].arguments[1], output1);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[0], null);
      assert.deepStrictEqual(callbackMock.mock.calls[1].arguments[1], output2);
    });
  });
})