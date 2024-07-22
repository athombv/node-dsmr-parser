import { promises as fs } from 'node:fs';
import { before, describe, it } from 'node:test';
import { DSMRParser } from '../src';
import assert from 'node:assert';

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
    it(`Should parse ${testCase}`, async () => {
      const [input, output] = await Promise.all([
        fs.readFile(`./tests/telegrams/${testCase}.txt`, 'utf-8'),
        fs.readFile(`./tests/telegrams/${testCase}.json`, 'utf-8'),
      ]);

      const expectedOutput = JSON.parse(output);

      const parsed = DSMRParser({ telegram: input, newlineChars: 'lf' });

      console.log(JSON.stringify(parsed, null, 2));

      assert.deepStrictEqual(parsed, expectedOutput);
    });
  }
});