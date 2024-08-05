import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encryptFrame, readTelegramFromFiles } from './test-utils';
import { decodeFooter, decodeHeader, decryptFrame, decryptFrameContents, ENCRYPTED_DSMR_HEADER_LEN } from '../src/util/encryption';
import { DSMRDecryptionError } from '../src';
import { DEFAULT_FRAME_ENCODING } from '../src/util/frame-validation';

describe('Encryption', async () => {
  const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');
  
  // This is not a real test, but at least it shows that the decryption works.
  // Ideally we add some real encrypted telegrams to the test suite.
  it('Can decrypt a message', () => {
    const decryptionKey = '0123456789ABCDEF';
    const encrypted = encryptFrame({ frame: input, key: decryptionKey });

    const decrypted = decryptFrame({
      data: encrypted,
      key: decryptionKey,
      encoding: DEFAULT_FRAME_ENCODING,
    });

    assert.deepStrictEqual(decrypted.toString(), input);
  });

  it('Throws error on invalid key', () => {
    const decryptionKey = '0123456789ABCDEF';
    const encrypted = encryptFrame({ frame: input, key: decryptionKey });

    assert.throws(() => {
      decryptFrame({
        data: encrypted,
        key: 'ABCDEF123467890',
        encoding: DEFAULT_FRAME_ENCODING,
      });
    }, DSMRDecryptionError);
  });
});