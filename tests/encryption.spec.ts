import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encryptFrame, readTelegramFromFiles } from './test-utils';
import { decodeFooter, decodeHeader, decryptFrame, ENCRYPTED_DSMR_HEADER_LEN } from '../src/util/encryption';

describe('Encryption', async () => {
  const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
  
  // This is not a real test, but at least it shows that the decryption works.
  // Ideally we add some real encrypted telegrams to the test suite.
  it('Can decrypt a message', () => {
    const decryptionKey = '0123456789ABCDEF';
    const encrypted = encryptFrame({ frame: input, key: decryptionKey });
    const header = decodeHeader(encrypted);
    const footer = decodeFooter(encrypted, header);

    const decrypted = decryptFrame({
      data: encrypted.subarray(ENCRYPTED_DSMR_HEADER_LEN, header.contentLength),
      header,
      footer,
      key: decryptionKey,
    });

    assert.deepStrictEqual(decrypted.toString(), input);
  });
});