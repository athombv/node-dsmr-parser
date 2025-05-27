import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import {
  ENCRYPTED_DLMS_GCM_TAG_LEN,
  ENCRYPTED_DLMS_HEADER_LEN,
  ENCRYPTED_DLMS_SYSTEM_TITLE_LEN,
  ENCRYPTED_DLMS_TELEGRAM_SOF,
} from '../src/protocols/encryption.js';
import {
  HDLC_TELEGRAM_SOF_EOF,
  HDLC_FORMAT_START,
} from '../src/protocols/hdlc.js';
import { calculateCrc16IbmSdlc } from '../src/util/crc.js';

export const TEST_DECRYPTION_KEY = Buffer.from('0123456789abcdef01234567890abcdef', 'hex');
export const TEST_AAD = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
export const DSMR_TEST_FOLDER = './tests/telegrams/dsmr';
export const DLMS_TEST_FOLDER = './tests/telegrams/dlms';

export const getAllDSMRTestTelegramTestCases = async () => {
  const files = await fs.readdir(DSMR_TEST_FOLDER);
  return files.filter((file) => file.endsWith('.txt')).map((file) => file.replace('.txt', ''));
};

export const getAllDLMSTestTelegramTestCases = async () => {
  const files = await fs.readdir(DLMS_TEST_FOLDER);
  return files.filter((file) => file.endsWith('.txt')).map((file) => file.replace('.txt', ''));
};

export const readDsmrTelegramFromFiles = async (path: string) => {
  const input = await fs.readFile(`${path}.txt`);
  const output = await fs.readFile(`${path}.json`);

  return {
    input: input.toString().replace(/\r?\n/g, '\r\n'),
    output: JSON.parse(output.toString()) as object,
  };
};

export const readDlmsTelegramFromFiles = async (path: string) => {
  const input = await readHexFile(`${path}.txt`);
  const output = await fs.readFile(`${path}.json`);

  return {
    input,
    output: JSON.parse(output.toString()) as object,
  };
};

export const readHexFile = async (path: string) => {
  const file = await fs.readFile(path, 'utf-8');

  // Replace all comments in the file
  const cleanedFile = file.replace(/#.*$/gm, '');
  const cleanedFile2 = cleanedFile.replace(/\/\/.*$/gm, '');

  return Buffer.from(cleanedFile2.replace(/\s/g, ''), 'hex');
};

export const writeHexFile = async (path: string, data: Buffer) => {
  const hexString = bufferToHexString(data);
  await fs.writeFile(path, hexString);

  return hexString;
};

export const numToHex = (num: number, minDigits = 2) => {
  return `0x${num.toString(16).padStart(minDigits, '0')}`;
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
    hexString +=
      buffer
        .subarray(i, i + 16)
        .toString('hex')
        .match(/.{1,2}/g)
        ?.join(' ') + '\n';
  }

  return hexString;
};

export const wrapHdlcFrame = (frame: Buffer, isSegmented = false) => {
  const hdlcHeader = Buffer.from([
    HDLC_TELEGRAM_SOF_EOF, // 0: SOF
    0x00, // 1: Format type + length
    0x00, // 2: Length
    0x03, // 3: Destination address,
    0x05, // 4: Source Address,
    0x00, // 5: Control byte,
    0x00, // 6: Checksum
    0x00, // 7: Checksum,
  ]);

  const hdlcFooter = Buffer.from([
    0x00, // Checksum
    0x00, // Checksum
    HDLC_TELEGRAM_SOF_EOF,
  ]);

  // Frame length is total length - 2 (SOF and EOF)
  const frameLength = frame.length + hdlcHeader.length + hdlcFooter.length - 2;

  if (frameLength > 0x7ff) {
    throw new Error('Frame length is too long to fit in HDLC');
  }

  hdlcHeader[1] = (HDLC_FORMAT_START << 4) | ((frameLength >> 8) & 0x07);
  hdlcHeader[2] = frameLength & 0xff;

  if (isSegmented) {
    hdlcHeader[1] |= 0x08; // Set segmentation bit
  }

  // Don't include SOF in the checksum calculation
  const headerChecksum = calculateCrc16IbmSdlc(hdlcHeader.subarray(1, 6));

  hdlcHeader.writeUint16LE(headerChecksum, 6);

  const frameUntilFooter = Buffer.concat([hdlcHeader, frame]);

  // Don't include SOF in the checksum calculation
  const footerChecksum = calculateCrc16IbmSdlc(frameUntilFooter.subarray(1));

  hdlcFooter.writeUint16LE(footerChecksum, 0);

  return Buffer.concat([frameUntilFooter, hdlcFooter]);
};

export const encryptFrame = ({
  frame,
  key,
  aad,
  systemTitle,
  frameCounter,
  frameStringEncoding,
}: {
  frame: Buffer | string;
  key: Buffer;
  aad?: Buffer;
  systemTitle?: Buffer;
  frameCounter?: Buffer;
  frameStringEncoding?: BufferEncoding;
}) => {
  frame = Buffer.isBuffer(frame) ? frame : Buffer.from(frame, frameStringEncoding ?? 'utf-8');
  systemTitle ??= Buffer.from('systitle', 'ascii');
  // Note: for reproducing the same frame, the frame counter is always the same.
  // Real meters will change this every frame.
  frameCounter ??= Buffer.from('11223344', 'hex');

  const iv = Buffer.concat([systemTitle, frameCounter]);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv, {
    authTagLength: ENCRYPTED_DLMS_GCM_TAG_LEN,
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
    ENCRYPTED_DLMS_HEADER_LEN + encryptedFrame.length + ENCRYPTED_DLMS_GCM_TAG_LEN,
  );

  let index = 0;
  result.writeUint8(ENCRYPTED_DLMS_TELEGRAM_SOF, index++);
  result.writeUint8(ENCRYPTED_DLMS_SYSTEM_TITLE_LEN, index++);
  systemTitle.copy(result, index);
  index += ENCRYPTED_DLMS_SYSTEM_TITLE_LEN;
  // 0x82 is indicating that a 16 byte length follows.
  result.writeUInt8(0x82, index++);
  result.writeUint16BE(encryptedFrame.length + ENCRYPTED_DLMS_HEADER_LEN - 1, index);
  index += 2;
  result.writeUInt8(0x30, index++);
  frameCounter.copy(result, index);
  index += 4;
  encryptedFrame.copy(result, index);
  index += encryptedFrame.length;
  gcmTag.copy(result, index);

  return result;
};
