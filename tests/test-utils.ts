import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { ENCRYPTED_DSMR_GCM_TAG_LEN, ENCRYPTED_DSMR_HEADER_LEN, ENCRYPTED_DSMR_SYSTEM_TITLE_LEN, ENCRYPTED_DSMR_TELEGRAM_SOF } from '../src/util/encryption';

export const getAllTestTelegramTestCases = async () => {
  const files = await fs.readdir('./tests/telegrams');
  return [...new Set(files.map((file) => file.replace('.txt', '').replace('.json', '')))];
}

export const readTelegramFromFiles = async (path: string) => {
  const input = await fs.readFile(`${path}.txt`);
  const output = await fs.readFile(`${path}.json`);
  
  return {
    input: input.toString().replace(/\r?\n/g, '\r\n'),
    output: JSON.parse(output.toString()),
  }
}

export const chunkString = (str: string, chunkSize: number) => {
  const chunks: string[] = [];
  
  for (let i = 0; i < str.length; i += chunkSize) {
    chunks.push(str.slice(i, i + chunkSize));
  }

  return chunks;
}

export const chunkBuffer = (buffer: Buffer, chunkSize: number) => {
  const chunks: Buffer[] = [];
  
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.subarray(i, i + chunkSize));
  }

  return chunks;
}

export const encryptFrame = ({
  frame,
  key,
}: {
  frame: string;
  key: string;
}) => {
  const systemTitle = crypto.randomBytes(ENCRYPTED_DSMR_SYSTEM_TITLE_LEN);
  const frameCounter = crypto.randomBytes(4);
  const iv = Buffer.concat([systemTitle, frameCounter]);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv, {
    authTagLength: ENCRYPTED_DSMR_GCM_TAG_LEN,
  });
  const encryptedFrame = Buffer.concat([cipher.update(frame), cipher.final()]);
  const gcmTag = cipher.getAuthTag();

  const result = Buffer.alloc(ENCRYPTED_DSMR_HEADER_LEN + encryptedFrame.length + ENCRYPTED_DSMR_GCM_TAG_LEN);

  let index = 0;
  result.writeUint8(ENCRYPTED_DSMR_TELEGRAM_SOF, index++);
  result.writeUint8(ENCRYPTED_DSMR_SYSTEM_TITLE_LEN, index++)
  systemTitle.copy(result, index);
  index += ENCRYPTED_DSMR_SYSTEM_TITLE_LEN;
  result.writeUint16LE(encryptedFrame.length + ENCRYPTED_DSMR_HEADER_LEN, index);
  index += 2;
  result.writeUInt8(0x30, index++);
  frameCounter.copy(result, index);
  index += 4;
  encryptedFrame.copy(result, index);
  index += encryptedFrame.length;
  gcmTag.copy(result, index);

  return result;
}