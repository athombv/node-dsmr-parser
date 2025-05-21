/* eslint-disable no-console */
import path from 'node:path';
import { inspect } from 'node:util';

import { bufferToHexString, numToHex, readHexFile } from '../tests/test-utils.js';
import { decodeDLMSContent, decodeDlmsObis } from '../src/protocols/dlms.js';
import { isDlmsStructureLike, ParsedDlmsData } from '../src/protocols/dlms-datatype.js';
import { obisCodeToString, parseObisCodeFromBuffer } from '../src/protocols/obis-code.js';

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
console.log('Content Raw:');
console.log(bufferToHexString(file));

const dlmsDataTypeToList = (object: ParsedDlmsData, prefix: string) => {
  let result = '';
  if (isDlmsStructureLike(object)) {
    result += `${prefix}- ${object.type}:\n`;

    for (const item of object.value) {
      result += dlmsDataTypeToList(item, `${prefix}  `);
    }
  } else if (Buffer.isBuffer(object.value)) {
    const { obisCode } = parseObisCodeFromBuffer(object.value);
    let obisCodeString = '';

    if (obisCode) {
      obisCodeString = ` (${obisCodeToString(obisCode)})`;
    }

    result += `${prefix}- ${object.type}: ${object.value.toString('hex')}${obisCodeString}\n`;
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
  frame: file,
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
