/* eslint-disable no-console */
/** This script is used to parse a DSMR telegram from a file. */
import { promises as fs } from 'node:fs';
import { inspect } from 'node:util';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { DSMR, DSMRDecryptionError, DSMRError } from '../src/index.js';

const filePath = process.argv[2];

if (filePath === undefined) {
  console.error('Please provide a file path as argument.');
  console.log('Usage:');
  console.log('npm run tool:parse-telegram <file-path> [<decryption-key>] [<aad>]');
  process.exit(1);
}

const decryptionKey = process.argv[3];
const aad = process.argv[4];

const resolvedPath = path.resolve(process.cwd(), filePath);

let file = await fs.readFile(resolvedPath);
const fileString = file.toString('utf-8');

const isHexFile = /^[0-9a-fA-F\s]+$/.test(fileString);

if (isHexFile) {
  file = Buffer.from(fileString.replace(/\s/g, ''), 'hex');

  console.log('Hex file detected');
  console.log({ file: file.toString() });
}

const passthrough = new PassThrough();

// Stream is not necessary for this script, but it allows to detect encryption in the frame.
DSMR.createStreamParser({
  stream: passthrough,
  newLineChars: isHexFile ? '\r\n' : '\n', // Use CRLF for hex files as thats what used by meters
  decryptionKey: decryptionKey ? Buffer.from(decryptionKey, 'hex') : undefined,
  additionalAuthenticatedData: aad ? Buffer.from(aad, 'hex') : undefined,
  detectEncryption: true,
  fullFrameRequiredWithinMs: 100,
  callback: (error, result) => {
    const inspected = inspect(result, {
      depth: null, // Infinite depth
      colors: true,
    });

    if (error instanceof DSMRDecryptionError) {
      console.error('Decryption error:', error.message);
      console.error('Original error:', error.cause);
      console.log('Telegram:', error.rawTelegram?.toString('hex'));
    } else if (error instanceof DSMRError) {
      console.error(error.message);
      console.log(error.rawTelegram?.toString('hex'));
    } else if (error) {
      console.error(error);
    } else if (result?.crc?.valid === false) {
      console.log('CRC validation failed');
      console.log(inspected);
    } else {
      console.log(inspected);
    }

    process.exit(0);
  },
});

passthrough.write(file);
