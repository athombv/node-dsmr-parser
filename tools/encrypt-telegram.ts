/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  bufferToHexString,
  encryptFrame,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
} from '../tests/test-utils.js';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (inputPath === undefined || outputPath === undefined) {
  console.error('Please provide an input and output path.');
  console.log('Usage:');
  console.log(
    'npm run tool:encrypt-telegram <input path> <output path> [<decryption-key>] [<aad>] [<system title>] [<frame counter>]',
  );
  process.exit(1);
}

let decryptionKey = process.argv[4];
let aad = process.argv[5];

if (decryptionKey === undefined) {
  console.log('Using default decryption key');
}

if (aad === undefined) {
  console.log('Using default AAD');
}

decryptionKey ??= TEST_DECRYPTION_KEY.toString('hex');
aad ??= TEST_AAD.toString('hex');

const systemTitle =
  typeof process.argv[6] === 'string' ? Buffer.from(process.argv[6], 'hex') : undefined;
const frameCounter =
  typeof process.argv[7] === 'string' ? Buffer.from(process.argv[7], 'hex') : undefined;

const resolvedInputPath = path.resolve(process.cwd(), inputPath);
let file = await fs.readFile(resolvedInputPath);
const fileString = file.toString('utf-8');
const isHexFile = /^[0-9a-fA-F\s]+$/.test(fileString);

if (isHexFile) {
  file = Buffer.from(fileString.replace(/\s/g, ''), 'hex');
}

const encryptedFrame = encryptFrame({
  frame: file.toString('binary'),
  key: Buffer.from(decryptionKey, 'hex'),
  aad: Buffer.from(aad, 'hex'),
  systemTitle,
  frameCounter,
});

const encryptedFrameString = bufferToHexString(encryptedFrame);

const resolvedOutputPath = path.resolve(process.cwd(), outputPath);

await fs.writeFile(resolvedOutputPath, encryptedFrameString, 'utf-8');

console.log(`Encrypted telegram written to ${resolvedOutputPath}`);
