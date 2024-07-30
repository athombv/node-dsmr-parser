import crypto from 'node:crypto';

/**
 * For now this is specific to the luxembourg's smart metering system. (E-Meter P1 Specification)
 * They wrap a DSMR telegram in a custom frame with the following format:
 * 
 * | Byte   | Description         | Example                             |
 * |--------|---------------------|-------------------------------------|
 * | 0      | SOF                 | DB (fixed)                          |
 * | 1      | System Title Length | 08 (fixed)                          |
 * | 2-9    | System Title        | 00 11 22 33 44 55 66 77             |
 * | 10-11  | Length of the frame | 00 11                               |
 * | 12     | SOF Frame Counter   | 30                                  |
 * | 13-16  | Frame Counter       | 00 11 22 33                         |
 * | 17-n   | Frame               | <Encrypted DSMR frame>              |
 * | n-n+12 | GCM Tag             | 00 11 22 33 44 55 66 77 88 99 AA BB |
 * 
 * The encrypted DSMR frame is encrypted using AES-128-GCM, and the user can request
 * the encryption key from the utility company. The IV is the concatenation of the system title
 * and the frame counter.
 * 
 * Length of frame is 17 (header length) + length of the encrypted DSMR frame. GCM tag length is excluded.
 */

export const ENCRYPTED_DSMR_TELEGRAM_SOF = 0xDB;
export const ENCRYPTED_DSMR_SYSTEM_TITLE_LEN = 8;
export const ENCRYPTED_DSMR_GCM_TAG_LEN = 12;
export const ENCRYPTED_DSMR_HEADER_LEN = 17;

/**
 * @param data A buffer that starts with the header (bytes 0-16) of the E-Meter P1 frame
 * @returns Decoded header
 */
export const decodeHeader = (data: Buffer) => {
  if (data.length < ENCRYPTED_DSMR_HEADER_LEN) {
    throw new Error('Invalid header length');
  }

  let index = 0;

  if (data[index++] !== ENCRYPTED_DSMR_TELEGRAM_SOF) {
    throw new Error('Invalid telegram sof');
  }

  if (data[index++] !== ENCRYPTED_DSMR_SYSTEM_TITLE_LEN) {
    throw new Error('Invalid system title length');
  }

  const systemTitle = data.subarray(index, index + ENCRYPTED_DSMR_SYSTEM_TITLE_LEN);
  index += ENCRYPTED_DSMR_SYSTEM_TITLE_LEN;
  const contentLength = data.readUInt16LE(index);
  index += 2;

  // According to the documentation, this should be 0x30, but it often is not.
  const sofFrameCounter = data[index++]; 

  const frameCounter = data.subarray(index, index + 4);
  index += 4;

  return {
    systemTitle,
    frameCounter,
    sofFrameCounter,
    contentLength,
  };
};

/**
 * @param data A buffer that ends with the footer (bytes n-12 to n) of the E-Meter P1 frame
 * @returns Decoded footer
 */
export const decodeFooter = (data: Buffer, header: ReturnType<typeof decodeHeader>) => {
  if (data.length < ENCRYPTED_DSMR_GCM_TAG_LEN) {
    throw new Error('Invalid footer length');
  }

  return {
    gcmTag: data.subarray(header.contentLength, header.contentLength + ENCRYPTED_DSMR_GCM_TAG_LEN),
  };
};

/**
 * Decrypts an encrypted DSMR frame
 */
export const decryptFrame = ({
  data,
  header,
  footer,
  key,
}: {
  /** The encrypted DSMR frame */
  data: Buffer;
  /** The decoded header (use {@link decodeHeader}) */
  header: ReturnType<typeof decodeHeader>;
  /** The decoded footer (use {@link decodeFooter}) */
  footer: ReturnType<typeof decodeFooter>;
  /** The encryption key */
  key: string;
}) => {
  if (data.length !== (header.contentLength - ENCRYPTED_DSMR_HEADER_LEN)) {
    throw new Error(`Invalid frame length got ${data.length} expected ${header.contentLength - ENCRYPTED_DSMR_HEADER_LEN}`);
  }
  
  const iv = Buffer.concat([header.systemTitle, header.frameCounter]);
  const cipher = crypto.createDecipheriv('aes-128-gcm', key, iv, {
    authTagLength: ENCRYPTED_DSMR_GCM_TAG_LEN,
  });
  cipher.setAuthTag(footer.gcmTag);
  
  return cipher.update(data, undefined, 'ascii') + cipher.final('ascii');
}

