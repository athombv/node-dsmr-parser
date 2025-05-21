import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  readHexFile,
  readDsmrTelegramFromFiles,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
} from './../test-utils.js';
import { decryptDlmsFrame } from '../../src/protocols/encryption.js';
import { SmartMeterDecryptionError } from '../../src/index.js';
import { parseDsmr } from '../../src/protocols/dsmr.js';

describe('Encryption', async () => {
  const { input, output } = await readDsmrTelegramFromFiles(
    './tests/telegrams/dsmr/dsmr-luxembourgh-spec-example',
  );
  const encryptedWithAad = await readHexFile(
    './tests/telegrams/dsmr/encrypted/dsmr-luxembourgh-spec-example-with-aad.txt',
  );
  const encryptedWithoutAad = await readHexFile(
    './tests/telegrams/dsmr/encrypted/dsmr-luxembourgh-spec-example-without-aad.txt',
  );

  // This is not a real test, but at least it shows that the decryption works.
  // Ideally we add some real encrypted telegrams to the test suite.
  it('Can decrypt a message (with AAD)', async () => {
    const decrypted = decryptDlmsFrame({
      data: encryptedWithAad,
      key: TEST_DECRYPTION_KEY,
      additionalAuthenticatedData: TEST_AAD,
    });

    assert.deepStrictEqual(decrypted.content.toString(), input);
    assert.equal(decrypted.error, undefined);
  });

  it('Can decrypt a message (without AAD)', async () => {
    const decrypted = decryptDlmsFrame({
      data: encryptedWithoutAad,
      key: TEST_DECRYPTION_KEY,
    });

    assert.deepStrictEqual(decrypted.content.toString(), input);
    assert.equal(decrypted.error, undefined);
  });

  it('Can decrypt a message (with invalid AAD)', async () => {
    const decrypted = decryptDlmsFrame({
      data: encryptedWithAad,
      key: TEST_DECRYPTION_KEY,
      additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
    });

    assert.deepStrictEqual(decrypted.content.toString(), input);
    assert.equal(decrypted.error?.constructor, SmartMeterDecryptionError);
  });

  it('Returns error on invalid key', () => {
    const { error } = decryptDlmsFrame({
      data: encryptedWithAad,
      key: Buffer.from('invalid-key12345', 'ascii'),
      additionalAuthenticatedData: TEST_AAD,
    });

    assert.equal(error?.constructor, SmartMeterDecryptionError);
  });

  it('Returns error on invalid AAD', () => {
    const { content, error } = decryptDlmsFrame({
      data: encryptedWithAad,
      key: TEST_DECRYPTION_KEY,
      additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
    });

    assert.equal(error?.constructor, SmartMeterDecryptionError);

    const parsed = parseDsmr({ telegram: content });

    assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), output);
  });

  it('Returns error on invalid key and AAD', () => {
    const { error } = decryptDlmsFrame({
      data: encryptedWithAad,
      key: Buffer.from('invalid-key12345', 'ascii'),
      additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
    });

    assert.equal(error?.constructor, SmartMeterDecryptionError);
  });
});
