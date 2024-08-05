/**
 * This script is used to parse a DSMR telegram from a file.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DSMRParser } from '../src/index.js';

const filePath = process.argv[2];

if (filePath === undefined) {
  console.error('Please provide a file path as argument');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), filePath);

const file = await fs.readFile(resolvedPath, 'utf-8');

const parsed = DSMRParser({ telegram: file, newLineChars: '\r\n' });

console.log(JSON.stringify(parsed, null, 2));

if (parsed.crc?.valid === false) {
  console.log();
  console.error('CRC validation failed');
  process.exit(1);
}
