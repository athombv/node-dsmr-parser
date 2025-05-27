/* eslint-disable no-console */
/** Wraps a hex-encoded binary file in a HDLC frame. */
import path from 'node:path';
import { chunkBuffer, readHexFile, wrapHdlcFrame, writeHexFile } from '../tests/test-utils.js';

const srcPath = process.argv[2];
const dstPath = process.argv[3];

if (srcPath === undefined || dstPath === undefined) {
  console.error('Please provide a file path as argument.');
  console.log('Usage:');
  console.log('npm run tool:wrap-hdlc <src-path> <dst-path> [<number of segments>]');
  process.exit(1);
}

const srcPathResolved = path.resolve(process.cwd(), srcPath);
const dstPathResolved = path.resolve(process.cwd(), dstPath);
const numberOfSegments = parseInt(process.argv[4], 10) || 1;

const srcFile = await readHexFile(srcPathResolved);

const chunks = chunkBuffer(srcFile, Math.ceil(srcFile.length / numberOfSegments));

const hdlcFrames = chunks.map((chunk, index) => wrapHdlcFrame(chunk, index < chunks.length - 1));
const allData = Buffer.concat(hdlcFrames);

const hexString = await writeHexFile(dstPathResolved, allData);
console.log('File written to', dstPathResolved);
console.log('File size:', allData.length);
console.log('File content:');
console.log(hexString);
