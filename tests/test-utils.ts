import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import {
  ENCRYPTED_DSMR_GCM_TAG_LEN,
  ENCRYPTED_DSMR_HEADER_LEN,
  ENCRYPTED_DSMR_CONTENT_LENGTH_START,
  ENCRYPTED_DSMR_SYSTEM_TITLE_LEN,
  ENCRYPTED_DSMR_TELEGRAM_SOF,
} from '../src/util/encryption.js';

export const TEST_DECRYPTION_KEY = Buffer.from('0123456789abcdef01234567890abcdef', 'hex');
export const TEST_AAD = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');

export const getAllTestTelegramTestCases = async () => {
  const files = await fs.readdir('./tests/telegrams');
  return files.filter((file) => file.endsWith('.txt')).map((file) => file.replace('.txt', ''));
};

export const readTelegramFromFiles = async (path: string, replaceNewLines = true) => {
  const input = await fs.readFile(`${path}.txt`);
  const output = await fs.readFile(`${path}.json`);

  return {
    input: replaceNewLines ? input.toString().replace(/\r?\n/g, '\r\n') : input.toString(),
    output: JSON.parse(output.toString()) as object,
  };
};

export const readHexFile = async (path: string) => {
  const file = await fs.readFile(path, 'utf-8');

  return Buffer.from(file.replace(/\s/g, ''), 'hex');
};

export const chunkString = (str: string, chunkSize: number) => {
  const chunks: string[] = [];

  for (let i = 0; i < str.length; i += chunkSize) {
    chunks.push(str.slice(i, i + chunkSize));
  }

  return chunks;
};

export const chunkBuffer = (buffer: Buffer, chunkSize: number) => {
  const chunks: Buffer[] = [];

  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.subarray(i, i + chunkSize));
  }

  return chunks;
};

export const bufferToHexString = (buffer: Buffer) => {
  let hexString = '';

  for (let i = 0; i < buffer.length; i += 16) {
    hexString += buffer.subarray(i, i + 16).toString('hex') + '\n';
  }

  return hexString;
};

export const encryptFrame = ({
  frame,
  key,
  aad,
  systemTitle,
  frameCounter,
}: {
  frame: string;
  key: Buffer;
  aad?: Buffer;
  systemTitle?: Buffer;
  frameCounter?: Buffer;
}) => {
  systemTitle ??= Buffer.from('systitle', 'ascii');
  // Note: for reproducing the same frame, the frame counter is always the same.
  // Real meters will change this every frame.
  frameCounter ??= Buffer.from('11223344', 'hex');

  const iv = Buffer.concat([systemTitle, frameCounter]);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv, {
    authTagLength: ENCRYPTED_DSMR_GCM_TAG_LEN,
  });

  if (aad?.length == 16) {
    aad = Buffer.concat([Buffer.from([0x30]), aad]);
  }

  if (aad) {
    cipher.setAAD(aad);
  }

  const encryptedFrame = Buffer.concat([cipher.update(frame), cipher.final()]);
  const gcmTag = cipher.getAuthTag();

  const result = Buffer.alloc(
    ENCRYPTED_DSMR_HEADER_LEN + encryptedFrame.length + ENCRYPTED_DSMR_GCM_TAG_LEN,
  );

  let index = 0;
  result.writeUint8(ENCRYPTED_DSMR_TELEGRAM_SOF, index++);
  result.writeUint8(ENCRYPTED_DSMR_SYSTEM_TITLE_LEN, index++);
  systemTitle.copy(result, index);
  index += ENCRYPTED_DSMR_SYSTEM_TITLE_LEN;
  result.writeUInt8(ENCRYPTED_DSMR_CONTENT_LENGTH_START, index++);
  result.writeUint16BE(encryptedFrame.length + ENCRYPTED_DSMR_HEADER_LEN - 1, index);
  index += 2;
  result.writeUInt8(0x30, index++);
  frameCounter.copy(result, index);
  index += 4;
  encryptedFrame.copy(result, index);
  index += encryptedFrame.length;
  gcmTag.copy(result, index);

  return result;
};
