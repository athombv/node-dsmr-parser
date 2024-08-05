import { describe, it } from 'node:test';
import { DSMRParser, getMbusDevice } from '../src';
import assert from 'node:assert';
import { getAllTestTelegramTestCases, readTelegramFromFiles } from './test-utils';

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
});