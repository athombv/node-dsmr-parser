/* eslint-disable no-console */
/** This script is used to parse a DSMR telegram from a file. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { DSMR, DSMRError } from '../src/index.js';

const filePath = process.argv[2];

if (filePath === undefined) {
  console.error('Please provide a file path as argument');
  process.exit(1);
}

const decryptionKey = process.argv[3];

const resolvedPath = path.resolve(process.cwd(), filePath);

let file = await fs.readFile(resolvedPath);
const fileString = file.toString('utf-8');

const isHexFile = /^[0-9a-fA-F\s]+$/.test(fileString);

if (isHexFile) {
  file = Buffer.from(fileString.replace(/\s/g, ''), 'hex');
}

const passthrough = new PassThrough();

// Stream is not necessary for this script, but it allows to detect encryption in the frame.
DSMR.createStreamParser({
  stream: passthrough,
  newLineChars: isHexFile ? '\r\n' : '\n', // Use CRLF for hex files as thats what used by meters
  decryptionKey,
  detectEncryption: true,
  fullFrameRequiredWithinMs: 1,
  callback: (error, result) => {
    if (error instanceof DSMRError) {
      console.error(error.message);
      console.log(error.rawTelegram?.toString('hex'));
    } else if (error) {
      console.error(error);
    } else if (result?.crc?.valid === false) {
      console.log('CRC validation failed');
      console.log(result);
    } else {
      console.log(result);
    }

    process.exit(0);
  },
});

passthrough.write(file);
