/* eslint-disable no-console */
import path from 'node:path';
import { inspect } from 'node:util';

import {
  decodeHdlcFooter,
  decodeHdlcHeader,
  decodeLlcHeader,
  HDLC_FOOTER_LENGTH,
} from '../src/protocols/hdlc.js';
import { bufferToHexString, numToHex, readHexFile } from '../tests/test-utils.js';
import { decodeDLMSContent, decodeDlmsObis } from '../src/protocols/dlms.js';
import { isDlmsStructureLike, ParsedDlmsData } from '../src/protocols/dlms-datatype.js';

const filePath = process.argv[2];

if (filePath === undefined) {
  console.error('Please provide a file path as argument.');
  console.log('Usage:');
  console.log('npm run tool:parse-hdlc <file-path>');
  process.exit(1);
}

const decryptionKey = process.argv[3];
const aad = process.argv[4];

const resolvedPath = path.resolve(process.cwd(), filePath);

const file = await readHexFile(resolvedPath);

const header = decodeHdlcHeader(file);
console.log('Header:');
console.log(` - Format Type: ${numToHex(header.formatType)}`);
console.log(` - Segmentation: ${header.segmentation}`);
console.log(` - Length: ${header.frameLength}`);
console.log(` - Checksum: ${numToHex(header.crc)} (valid: ${header.crcValid})`);
console.log(` - Control byte: ${numToHex(header.controlByte)}`);
console.log();

// Entire frame including SOF and EOF
const frame = file.subarray(0, header.frameLength + 2);
const frameContent = frame.subarray(header.consumedBytes);

const llc = decodeLlcHeader(frameContent);
console.log('LLC Header:');
console.log(` - Destination: ${numToHex(llc.destination)}`);
console.log(` - Source: ${numToHex(llc.source)}`);
console.log(` - Quality: ${numToHex(llc.quality)}`);
console.log();

const content = frame.subarray(
  header.consumedBytes + llc.consumedBytes,
  frame.length - HDLC_FOOTER_LENGTH,
);
console.log('Content Raw:');
console.log(bufferToHexString(content));

const dlmsDataTypeToList = (object: ParsedDlmsData, prefix: string) => {
  let result = '';
  if (isDlmsStructureLike(object)) {
    result += `${prefix}- ${object.type}:\n`;

    for (const item of object.value) {
      result += dlmsDataTypeToList(item, `${prefix}  `);
    }
  } else if (Buffer.isBuffer(object.value)) {
    result += `${prefix}- ${object.type}: ${object.value.toString('hex')}\n`;
  } else {
    result += `${prefix}- ${object.type}: ${inspect(object.value)}\n`;
  }

  return result;
};

const objectToList = (object: object, prefix: string) => {
  let result = '';
  for (const [key, value] of Object.entries(object)) {
    if (Buffer.isBuffer(value)) {
      result += `${prefix}- ${key}: ${value.toString('hex')}\n`;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result += `${prefix}- ${key}:\n`;
      result += objectToList(value as object, `${prefix}  `);
    } else {
      result += `${prefix}- ${key}: ${String(value)}\n`;
    }
  }
  return result;
};

const dlmsContent = decodeDLMSContent({
  frame: content,
  decryptionKey: decryptionKey ? Buffer.from(decryptionKey, 'hex') : undefined,
  additionalAuthenticatedData: aad ? Buffer.from(aad, 'hex') : undefined,
});
console.log('Content DLMS:');
console.log(` - Invoke ID: ${numToHex(dlmsContent.invokeId, 8)}`);
console.log(` - Timestamp: ${dlmsContent.timestamp.toString('hex')}`);
console.log(` - DLMS Data:`);
console.log(dlmsDataTypeToList(dlmsContent.data, '  '));

const energyContent = decodeDlmsObis(dlmsContent);
delete energyContent.hdlc;

console.log('Content Parsed:');
if (energyContent.dlms?.unknownObjects) {
  console.log('Unknown Objects:');
  console.log(objectToList(energyContent.dlms?.unknownObjects, '  '));
  console.log('Parsed Objects:');
}
delete energyContent.dlms;
console.log(objectToList(energyContent, '  '));

const footer = decodeHdlcFooter(frame);
console.log('Footer:');
console.log(` - CRC: ${numToHex(footer.crc)} (valid: ${footer.crcValid})`);
