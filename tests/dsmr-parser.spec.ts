import { promises as fs } from 'node:fs';
import { before, describe, it } from 'node:test';
import { DSMRParser, getMbusDevice } from '../src';
import assert from 'node:assert';
import { readTelegramFromFiles } from './test-utils';

describe('DSMR Parser', async () => {
  const files = await fs.readdir('./tests/telegrams');
  const testCases = [...new Set(files.map((file) => file.replace('.txt', '').replace('.json', '')))];

  before(() => {
    // Check that all test cases have corresponding input and output files
    // and that no other files are present in the directory
    for (const file of testCases) {
      if (!files.includes(`${file}.txt`)) {
        throw new Error(`Missing input file for test case ${file}`);
      }

      if (!files.includes(`${file}.json`)) {
        throw new Error(`Missing output file for test case ${file}`);
      }
    }
  });
  
  for (const testCase of testCases) {
    it(`Parses ${testCase}`, async () => {
      const [input, output] = await Promise.all([
        fs.readFile(`./tests/telegrams/${testCase}.txt`, 'utf-8'),
        fs.readFile(`./tests/telegrams/${testCase}.json`, 'utf-8'),
      ]);

      const expectedOutput = JSON.parse(output);

      const parsed = DSMRParser({
        telegram: input,
        newLineChars: '\n',
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
});