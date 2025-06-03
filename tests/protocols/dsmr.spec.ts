import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DSMR } from '../../src/index.js';
import {
  encryptFrame,
  getAllDSMRTestTelegramTestCases,
  readDsmrTelegramFromFiles,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
} from './../test-utils.js';
import { isDsmrCrcValid, parseDsmr } from '../../src/protocols/dsmr.js';

describe('DSMR', async () => {
  const testCases = await getAllDSMRTestTelegramTestCases();

  for (const testCase of testCases) {
    it(`Parses ${testCase}`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const parsed = parseDsmr({ telegram: input });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });

    it(`Parses ${testCase} with decryption (valid AAD)`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const parsed = parseDsmr({
        telegram: encrypted,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });

    it(`Parses ${testCase} with decryption (missing AAD)`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const parsed = parseDsmr({
        telegram: encrypted,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: undefined,
      });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });

    it(`Parses ${testCase} with decryption (invalid AAD)`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const parsed = parseDsmr({
        telegram: encrypted,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
      });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });
  }

  it('Gets m-bus data', async () => {
    const { input } = await readDsmrTelegramFromFiles(
      './tests/telegrams/dsmr/dsmr-5.0-spec-example',
    );

    const parsed = parseDsmr({ telegram: input });

    const mbusData = DSMR.getMbusDevice('gas', parsed);

    assert.equal(mbusData?.deviceType, 0x03);
    assert.equal(mbusData?.unit, 'm3');
  });

  it('Throws error on invalid telegram', () => {
    const input = "Hello, world! I'm not a valid telegram.";

    assert.throws(() => {
      parseDsmr({ telegram: input });
    });
  });

  describe('CRC Validation', () => {
    it('Marks valid CRCs as valid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isDsmrCrcValid({
        telegram: invalid,
        crc: 0x25b5,
      });
      assert.equal(isValid, true);
    });

    it('Marks invalid CRCs as invalid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isDsmrCrcValid({
        telegram: invalid,
        crc: 0x25b5 + 1,
      });
      assert.equal(isValid, false);
    });
  });
});
