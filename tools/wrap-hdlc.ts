/* eslint-disable no-console */
/** Wraps a hex-encoded binary file in a HDLC frame. */
import path from 'node:path';
import { readHexFile, wrapHdlcFrame, writeHexFile } from '../tests/test-utils.js';

const srcPath = process.argv[2];
const dstPath = process.argv[3];

if (srcPath === undefined || dstPath === undefined) {
  console.error('Please provide a file path as argument.');
  console.log('Usage:');
  console.log('npm run tool:wrap-hdlc <src-path> <dst-path>');
  process.exit(1);
}

const srcPathResolved = path.resolve(process.cwd(), srcPath);
const dstPathResolved = path.resolve(process.cwd(), dstPath);

const srcFile = await readHexFile(srcPathResolved);

const hdlcFrame = wrapHdlcFrame(srcFile);

const hexString = await writeHexFile(dstPathResolved, hdlcFrame);
console.log('File written to', dstPathResolved);
console.log('File size:', hdlcFrame.length);
console.log('File content:');
console.log(hexString);
