/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { TEST_AAD, TEST_DECRYPTION_KEY, writeHexFile } from '../tests/test-utils.js';
import { decryptDlmsFrame } from '../src/protocols/encryption.js';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (inputPath === undefined || outputPath === undefined) {
  console.error('Please provide an input and output path.');
  console.log('Usage:');
  console.log(
    'npm run tool:decrypt-telegram <input path> <output path> [<decryption-key>] [<aad>]',
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

console.log(`Using decryption key: ${decryptionKey}`);
console.log(`Using AAD: ${aad}`);

const resolvedPath = path.resolve(process.cwd(), inputPath);
let file = await fs.readFile(resolvedPath);
const fileString = file.toString('utf-8');
const isHexFile = /^[0-9a-fA-F\s]+$/.test(fileString);

if (isHexFile) {
  file = Buffer.from(fileString.replace(/\s/g, ''), 'hex');
}

const { header, footer, content, error } = decryptDlmsFrame({
  data: file,
  key: Buffer.from(decryptionKey, 'hex'),
  additionalAuthenticatedData: Buffer.from(aad, 'hex'),
});

const resolvedOutputPath = path.resolve(process.cwd(), outputPath);

// await fs.writeFile(resolvedOutputPath, content, 'binary');
await writeHexFile(resolvedOutputPath, content);

console.log('Telegram decrypted');
console.log('Header fields:');
console.log('  - System title:', header.systemTitle.toString('hex'));
console.log('  - Frame counter:', header.frameCounter.toString('hex'));
console.log('  - Security type:', '0x' + header.securityType.toString(16));
console.log('  - Content length:', header.contentLength);
console.log('Footer fields:');
console.log('  - GCM Tag:', footer.gcmTag.toString('hex'));
console.log();
console.log('Decryption error:', error ? error.message : 'none');
console.log(`Decrypted telegram written to ${resolvedOutputPath}`);
