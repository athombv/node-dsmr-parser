import assert from 'node:assert';
import { describe, it } from 'node:test';
import { isAsciiFrame, isEncryptedFrame, DSMRFrameValid } from '../src/util/frame-validation.js';
import { encryptFrame, getAllTestTelegramTestCases, readTelegramFromFiles } from './test-utils.js';

describe('Frame validation', () => {
  it('Detects ascii buffer', () => {
    const buffer = Buffer.from('Hello, world!', 'utf-8');
    const isAscii = isAsciiFrame(buffer);

    assert.ok(isAscii);
  });

  it('Detects non-ascii buffer', () => {
    const buffer = Buffer.from('Hello, 🌍!', 'utf-8');
    const isAscii = isAsciiFrame(buffer);

    assert.ok(!isAscii);
  });

  it('Detects invalid encrypted frame', () => {
    const buffer = Buffer.from([0xDB, 0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08 ]);
    const isEncrypted = isEncryptedFrame(buffer);

    assert.ok(!isEncrypted);
  });

  it('Detects valid encrypted frame', () => {
    const buffer = encryptFrame({
      frame: 'Hello, world!',
      key: '1234567890123456',
    });
    const isEncrypted = isEncryptedFrame(buffer);

    assert.ok(isEncrypted);
  });

  it('Detects encrypted frame', () => {
    const buffer = encryptFrame({
      frame: 'Hello, world!',
      key: '1234567890123456',
    });
    const { valid, encrypted } = DSMRFrameValid(buffer);

    assert.ok(valid);
    assert.ok(encrypted);
  });

  describe('Detects ascii frames', async () => {
    const cases = await getAllTestTelegramTestCases();

    for (const testCase of cases) {
      it(`Detects unencrypted frame in ${testCase}`, async () => {
        const { input } = await readTelegramFromFiles(`./tests/telegrams/${testCase}`);

        const { valid, encrypted } = DSMRFrameValid(Buffer.from(input, 'utf-8'));

        assert.ok(valid);
        assert.equal(encrypted, false);
      });
    }
  });
});