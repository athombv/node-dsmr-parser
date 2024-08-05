/**
 * This scripts reads all .txt files in the tests/telegrams folder, parses them and writes the
 * result to a .json file. Only run this script if you want to update the expected output of the
 * DSMRParser.
 */
import fs from 'fs/promises';
import { DSMR } from '../src/index.js';

const files = await fs.readdir('./tests/telegrams');
const testCases = [...new Set(files.map((file) => file.replace('.txt', '').replace('.json', '')))];

for (const file of testCases) {
  const input = await fs.readFile(`./tests/telegrams/${file}.txt`, 'utf-8');
  const parsed = DSMR.parse({ telegram: input, newLineChars: '\n' });
  const json = JSON.stringify(parsed, null, 2);
  await fs.writeFile(`./tests/telegrams/${file}.json`, json);
}
