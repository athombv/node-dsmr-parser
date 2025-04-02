import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readHexFile, readTelegramFromFiles, TEST_AAD, TEST_DECRYPTION_KEY } from './test-utils.js';
import { decryptFrame } from '../src/util/encryption.js';
import { DSMRDecryptionError } from '../src/index.js';
import { DEFAULT_FRAME_ENCODING } from '../src/util/frame-validation.js';
import { DSMRParser } from '../src/parsers/dsmr.js';

describe('Encryption', async () => {
  const { input, output } = await readTelegramFromFiles(
    './tests/telegrams/dsmr-luxembourgh-spec-example',
  );
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
    assert.equal(decrypted.error, undefined);
  });

  it('Can decrypt a message (without AAD)', async () => {
    const decrypted = decryptFrame({
      data: encryptedWithoutAad,
      key: TEST_DECRYPTION_KEY,
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.deepStrictEqual(decrypted.content.toString(), input);
    assert.equal(decrypted.error, undefined);
  });

  it('Can decrypt a message (with invalid AAD)', async () => {
    const decrypted = decryptFrame({
      data: encryptedWithAad,
      key: TEST_DECRYPTION_KEY,
      additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.deepStrictEqual(decrypted.content.toString(), input);
    assert.equal(decrypted.error?.constructor, DSMRDecryptionError);
  });

  it('Returns error on invalid key', () => {
    const { error } = decryptFrame({
      data: encryptedWithAad,
      key: Buffer.from('invalid-key12345', 'ascii'),
      additionalAuthenticatedData: TEST_AAD,
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.equal(error?.constructor, DSMRDecryptionError);
  });

  it('Returns error on invalid AAD', () => {
    const { content, error } = decryptFrame({
      data: encryptedWithAad,
      key: TEST_DECRYPTION_KEY,
      additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.equal(error?.constructor, DSMRDecryptionError);

    const parsed = DSMRParser({ telegram: content });

    assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), output);
  });

  it('Returns error on invalid key and AAD', () => {
    const { error } = decryptFrame({
      data: encryptedWithAad,
      key: Buffer.from('invalid-key12345', 'ascii'),
      additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.equal(error?.constructor, DSMRDecryptionError);
  });
});
