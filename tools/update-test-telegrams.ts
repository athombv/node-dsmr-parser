/* eslint-disable no-console */
/**
 * This scripts reads all .txt files in the tests/telegrams folder, parses them and writes the
 * result to a .json file. Only run this script if you want to update the expected output of the
 * DSMRParser.
 */
import fs from 'fs/promises';
import { DSMR } from '../src/index.js';
import {
  bufferToHexString,
  encryptFrame,
  getAllTestTelegramTestCases,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
} from '../tests/test-utils.js';

const testCases = await getAllTestTelegramTestCases();

for (const file of testCases) {
  let input = await fs.readFile(`./tests/telegrams/${file}.txt`, 'utf-8');
  input = input.replace(/\r?\n/g, '\r\n');
  console.log(`Parsing ${file}.txt`);
  const parsed = DSMR.parse({ telegram: input });
  const json = JSON.stringify(parsed, null, 2);
  await fs.writeFile(`./tests/telegrams/${file}.json`, json);
}

const fileToEncrypt = 'dsmr-luxembourgh-spec-example';
console.log(`Using ${fileToEncrypt} as test case for encrypted telegrams`);

let input = await fs.readFile(`./tests/telegrams/${fileToEncrypt}.txt`, 'utf-8');
input = input.replace(/\r?\n/g, '\r\n');

const encryptedAad = encryptFrame({
  frame: input,
  key: TEST_DECRYPTION_KEY,
  aad: TEST_AAD,
});

const hexStringAad = bufferToHexString(encryptedAad);

await fs.writeFile(
  `./tests/telegrams/encrypted/${fileToEncrypt}-with-aad.txt`,
  hexStringAad,
  'utf8',
);

const encryptedWithoutAad = encryptFrame({
  frame: input,
  key: TEST_DECRYPTION_KEY,
});

const hexStringWithoutAad = bufferToHexString(encryptedWithoutAad);

await fs.writeFile(
  `./tests/telegrams/encrypted/${fileToEncrypt}-without-aad.txt`,
  hexStringWithoutAad,
  'utf8',
);
