import { DSMRParserOptions } from '../index.js';
import { DEFAULT_FRAME_ENCODING } from './frame-validation.js';

/**
 * Calculate the CRC16 value of a buffer.
 * This will use the polynomial: x16+x15+x2+1 (IBM)
 */
export const calculateCrc16 = (data: Buffer) => {
  let crc = 0;

  for (const byte of data) {
    crc ^= byte;

    for (let i = 0; i < 8; i++) {
      if ((crc & 0x0001) !== 0) {
        // 0xA001 is the reversed polynomial used for this CRC.
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }

  return crc;
}

/**
 * CRC is a CRC16 value calculated over the preceding characters in the data message (from “/” to “!” using the polynomial: x16+x15+x2+1). CRC16 uses no XOR in, no XOR out and is computed with least significant bit first. The value is represented as 4 hexadecimal charac- ters (MSB first).
 * @param telegram 
 * @param enteredCrc 
 * @returns 
 */
export const isCrcValid = (telegram: string, enteredCrc: number) => {
  // Because the CRC is always calculated over the telegram that is using
  // crlf as newline characters, we need to replace the newline characters
  // in the telegram with crlf before calculating the CRC.
  telegram = telegram.replace(/\r?\n/g, '\r\n');
  
  // Strip the CRC from the telegram
  const crcSplit = `\r\n!`;
  const telegramParts = telegram.split(crcSplit);
  const strippedTelegram = telegramParts[0] + crcSplit;

  const calculatedCrc = calculateCrc16(Buffer.from(strippedTelegram, DEFAULT_FRAME_ENCODING));

  return calculatedCrc === enteredCrc;
};