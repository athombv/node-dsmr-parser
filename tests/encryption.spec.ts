import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readHexFile, readTelegramFromFiles, TEST_AAD, TEST_DECRYPTION_KEY } from './test-utils.js';
import { decryptFrame } from '../src/util/encryption.js';
import { DSMRDecryptionError } from '../src/index.js';
import { DEFAULT_FRAME_ENCODING } from '../src/util/frame-validation.js';

describe('Encryption', async () => {
  const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr-luxembourgh-spec-example');
  const encryptedWithAad = await readHexFile(
    './tests/telegrams/encrypted/dsmr-luxembourgh-spec-example-with-aad.txt',
  );
  const encryptedWithoutAad = await readHexFile(
    './tests/telegrams/encrypted/dsmr-luxembourgh-spec-example-without-aad.txt',
  );

  // This is not a real test, but at least it shows that the decryption works.
  // Ideally we add some real encrypted telegrams to the test suite.
  it('Can decrypt a message (with AAD)', async () => {
    const decrypted = decryptFrame({
      data: encryptedWithAad,
      key: TEST_DECRYPTION_KEY,
      additionalAuthenticatedData: TEST_AAD,
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.deepStrictEqual(decrypted.content.toString(), input);
  });

  it('Can decrypt a message (without AAD)', async () => {
    const decrypted = decryptFrame({
      data: encryptedWithoutAad,
      key: TEST_DECRYPTION_KEY,
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.deepStrictEqual(decrypted.content.toString(), input);
  });

  it('Throws error on invalid key', () => {
    assert.throws(() => {
      decryptFrame({
        data: encryptedWithAad,
        key: Buffer.from('invalid-key12345', 'ascii'),
        additionalAuthenticatedData: TEST_AAD,
        encoding: DEFAULT_FRAME_ENCODING,
      });
    }, DSMRDecryptionError);
  });

  it('Throws error on invalid AAD', () => {
    assert.throws(() => {
      decryptFrame({
        data: encryptedWithAad,
        key: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
        encoding: DEFAULT_FRAME_ENCODING,
      });
    }, DSMRDecryptionError);
  });

  it('Throws error on invalid key and AAD', () => {
    assert.throws(() => {
      decryptFrame({
        data: encryptedWithAad,
        key: Buffer.from('invalid-key12345', 'ascii'),
        additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
        encoding: DEFAULT_FRAME_ENCODING,
      });
    }, DSMRDecryptionError);
  });
});
