/* eslint-disable no-console */
/** This script is used to parse a DSMR telegram from a file. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { SmartMeterDecryptionError, SmartMeterError } from '../src/index.js';
import { StreamDetectType } from '../src/stream/stream-detect-type.js';
import { DlmsStreamParser } from '../src/stream/stream-dlms.js';
import { EncryptedDSMRStreamParser } from '../src/stream/stream-encrypted-dsmr.js';
import { SmartMeterStreamCallback, SmartMeterStreamParser } from '../src/stream/stream.js';
import { UnencryptedDSMRStreamParser } from '../src/stream/stream-unencrypted-dsmr.js';

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
  console.log(file.toString());
}

const passthrough = new PassThrough();

const waitForFrameDetection = () => {
  return new Promise<{
    mode: 'dsmr' | 'dlms';
    encrypted: boolean;
    data: Buffer;
  }>((resolve) => {
    const detector = new StreamDetectType({
      stream: passthrough,
      callback: (result) => {
        detector.destroy();
        resolve(result);
      },
    });

    passthrough.write(file);
  });
};

const { mode, encrypted, data } = await waitForFrameDetection();

console.log('Detected frame:');
console.log(` - Mode: ${mode}`);
console.log(` - Encrypted: ${encrypted}`);

if (encrypted && !decryptionKey) {
  console.error('Decryption key is required for encrypted frames');
  process.exit(1);
}

const callback: SmartMeterStreamCallback = (error, result) => {
  if (error instanceof SmartMeterDecryptionError) {
    console.error('Decryption error:', error.message);
    console.error('Original error:', error.cause);
    console.log('Telegram:', error.rawTelegram?.toString('hex'));
  } else if (error instanceof SmartMeterError) {
    console.error(error.message);
    console.log(error.rawTelegram?.toString('hex'));
  } else if (error) {
    console.error(error);
  } else if (!result) {
    console.error('No result and no error');
  } else {
    let crcValid = true;
    if ('hdlc' in result) {
      crcValid = result.hdlc.crc.valid !== false;
    } else if ('dsmr' in result) {
      crcValid = result.dsmr.crc?.valid !== false;
    }

    if (!crcValid) {
      console.error('CRC validation failed');
    }
    console.dir(result, { depth: null });
  }
};

let parser: SmartMeterStreamParser;

if (mode === 'dlms' && !encrypted) {
  parser = new DlmsStreamParser({
    stream: passthrough,
    callback,
  });
} else if (mode === 'dlms' && encrypted) {
  parser = new DlmsStreamParser({
    stream: passthrough,
    callback,
    decryptionKey: Buffer.from(decryptionKey, 'hex'),
    additionalAuthenticatedData: aad ? Buffer.from(aad, 'hex') : undefined,
  });
} else if (mode === 'dsmr' && !encrypted) {
  parser = new UnencryptedDSMRStreamParser({
    stream: passthrough,
    callback,
  });
} else if (mode === 'dsmr' && encrypted) {
  parser = new EncryptedDSMRStreamParser({
    stream: passthrough,
    decryptionKey: Buffer.from(decryptionKey, 'hex'),
    additionalAuthenticatedData: aad ? Buffer.from(aad, 'hex') : undefined,
    callback,
  });
} else {
  console.error('Unknown mode');
  process.exit(1);
}

passthrough.write(data);
passthrough.end();
parser.destroy();
