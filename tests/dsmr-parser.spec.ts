import { describe, it } from 'node:test';
import { DSMRParser, getMbusDevice } from '../src/index.js';
import assert from 'node:assert';
import { encryptFrame, getAllTestTelegramTestCases, readTelegramFromFiles } from './test-utils.js';

describe('DSMR Parser', async () => {
  const testCases = await getAllTestTelegramTestCases();
  
  for (const testCase of testCases) {
    it(`Parses ${testCase}`, async () => {
      const { input, output: expectedOutput } = await readTelegramFromFiles(`./tests/telegrams/${testCase}`);

      const parsed = DSMRParser({
        telegram: input,
      });

      assert.deepStrictEqual(parsed, expectedOutput);
    });

    it(`Parses ${testCase} with decryption`, async () => {
      const { input, output: expectedOutput } = await readTelegramFromFiles(`./tests/telegrams/${testCase}`);

      const key = '0123456789ABCDEF';
      const encrypted = encryptFrame({ frame: input, key });

      const parsed = DSMRParser({
        telegram: encrypted,
        decryptionKey: key,
      });

      assert.deepStrictEqual(parsed, expectedOutput);
    });
  }

  it('Gets m-bus data', async () => {
    const { input } = await readTelegramFromFiles('./tests/telegrams/dsmr-5.0-spec-example');

    const parsed = DSMRParser({ telegram: input });

    const mbusData = getMbusDevice('gas', parsed);
    
    assert.equal(mbusData?.deviceType, 0x03);
    assert.equal(mbusData?.unit, 'm3');
  });

  it('Throws error on invalid telegram', () => {
    const input = "Hello, world! I'm not a valid telegram.";

    assert.throws(() => {
      DSMRParser({ telegram: input });
    });
  });

  it('Decodes using \\n characters', async () => {
    // Note: use this file specifically because it doesn't have a CRC. The CRC is calculated using \r\n characters in
    // the other files, thus the assert would fail.
    const { input, output } = await readTelegramFromFiles('./tests/telegrams/dsmr-3.0-spec-example', false);

    const parsed = DSMRParser({
      telegram: input,
      newLineChars: '\n',
    });

    assert.deepStrictEqual(parsed, output);
  })
});