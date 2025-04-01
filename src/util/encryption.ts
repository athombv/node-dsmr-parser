import * as crypto from 'node:crypto';
import { DSMRDecodeError, DSMRDecryptionError } from './errors.js';

/**
 * For now this is specific to the luxembourg's smart metering system. (E-Meter P1 Specification)
 * They wrap a DSMR telegram in a custom frame with the following format:
 *
 * | Byte   | Description          | Example                             |
 * | ------ | -------------------- | ----------------------------------- |
 * | 0      | SOF                  | DB (fixed)                          |
 * | 1      | System Title Length  | 08 (fixed)                          |
 * | 2-9    | System Title         | 00 11 22 33 44 55 66 77             |
 * | 10     | Content Length Start | 82 (fixed)                          |
 * | 11-12  | Length of the frame  | 00 11                               |
 * | 13     | SOF Frame Counter    | 30 (fixed)                          |
 * | 14-17  | Frame Counter        | 00 11 22 33                         |
 * | 18-n   | Frame                | <Encrypted DSMR frame>              |
 * | n-n+12 | GCM Tag              | 00 11 22 33 44 55 66 77 88 99 AA BB |
 *
 * The encrypted DSMR frame is encrypted using AES-128-GCM, and the user can request the encryption
 * key from the utility company. The IV is the concatenation of the system title and the frame
 * counter.
 *
 * Length of frame is 17 (header length) + length of the encrypted DSMR frame. GCM tag length is
 * excluded.
 */

export const ENCRYPTED_DSMR_TELEGRAM_SOF = 0xdb; // DLMS_COMMAND_GENERAL_GLO_CIPHERING
export const ENCRYPTED_DSMR_CONTENT_LENGTH_START = 0x82; // DLMS type for uint16_t (Big Endian)
export const ENCRYPTED_DSMR_SECURITY_TYPE = 0x30; // DLMS_SECURITY_AUTHENTICATION_ENCRYPTION
export const ENCRYPTED_DSMR_SYSTEM_TITLE_LEN = 8;
export const ENCRYPTED_DSMR_GCM_TAG_LEN = 12;
export const ENCRYPTED_DSMR_HEADER_LEN = 18;
export const ENCRYPTION_DEFAULT_AAD = Buffer.from('00112233445566778899aabbccddeeff', 'hex');

/**
 * @param data A buffer that starts with the header (bytes 0-16) of the E-Meter P1 frame
 * @returns Decoded header
 */
export const decodeHeader = (data: Buffer) => {
  if (data.length < ENCRYPTED_DSMR_HEADER_LEN) {
    throw new DSMRDecodeError('Invalid header length');
  }

  let index = 0;

  const sof = data[index++];
  if (sof !== ENCRYPTED_DSMR_TELEGRAM_SOF) {
    throw new DSMRDecodeError(`Invalid telegram sof 0x${sof.toString(16)}`);
  }

  const systemTitleLen = data[index++];
  if (systemTitleLen !== ENCRYPTED_DSMR_SYSTEM_TITLE_LEN) {
    throw new DSMRDecodeError(`Invalid system title length 0x${systemTitleLen.toString(16)}`);
  }

  const systemTitle = data.subarray(index, index + ENCRYPTED_DSMR_SYSTEM_TITLE_LEN);
  index += ENCRYPTED_DSMR_SYSTEM_TITLE_LEN;

  const contentLengthStart = data[index++];
  if (contentLengthStart !== ENCRYPTED_DSMR_CONTENT_LENGTH_START) {
    throw new DSMRDecodeError(
      `Invalid content length start byte 0x${contentLengthStart.toString(16)}`,
    );
  }

  // The entire header is 18 bytes long, but for some reason the content length uses 17 as
  // length for the header. Maybe they don't include the SOF byte?
  const contentLength = data.readUInt16BE(index) + 1 - ENCRYPTED_DSMR_HEADER_LEN;
  index += 2;

  const securityType = data[index++];
  if (securityType !== ENCRYPTED_DSMR_SECURITY_TYPE) {
    throw new DSMRDecodeError(`Invalid frame counter 0x${securityType.toString(16)}`);
  }

  const frameCounter = data.subarray(index, index + 4);
  index += 4;

  return {
    systemTitle,
    frameCounter,
    securityType,
    contentLength,
  };
};

/**
 * @param data A buffer that ends with the footer (bytes n-12 to n) of the E-Meter P1 frame
 * @returns Decoded footer
 */
export const decodeFooter = (data: Buffer, header: ReturnType<typeof decodeHeader>) => {
  if (data.length < ENCRYPTED_DSMR_GCM_TAG_LEN) {
    throw new DSMRDecodeError('Invalid footer length');
  }

  return {
    gcmTag: data.subarray(
      ENCRYPTED_DSMR_HEADER_LEN + header.contentLength,
      ENCRYPTED_DSMR_HEADER_LEN + header.contentLength + ENCRYPTED_DSMR_GCM_TAG_LEN,
    ),
  };
};

/** Decrypts the contents of an encrypted DSMR frame. */
export const decryptFrameContents = ({
  data,
  header,
  footer,
  key,
  encoding,
  additionalAuthenticatedData,
}: {
  /** The encrypted DSMR frame */
  data: Buffer;
  /** The decoded header (use {@link decodeHeader}) */
  header: ReturnType<typeof decodeHeader>;
  /** The decoded footer (use {@link decodeFooter}) */
  footer: ReturnType<typeof decodeFooter>;
  /** The encryption key */
  key: Buffer;
  encoding: BufferEncoding;
  /** Optional additional authenticated data (AAD) to be used in the decryption. */
  additionalAuthenticatedData?: Buffer;
}) => {
  if (data.length !== header.contentLength) {
    throw new Error(`Invalid frame length got ${data.length} expected ${header.contentLength}`);
  }

  if (additionalAuthenticatedData?.length == 16) {
    additionalAuthenticatedData = Buffer.concat([Buffer.from([0x30]), additionalAuthenticatedData]);
  }

  const iv = Buffer.concat([header.systemTitle, header.frameCounter]);

  // Wrap in try-catch to throw a DSMRDecryptionError instead of a generic error.
  try {
    const cipher = crypto.createDecipheriv('aes-128-gcm', key, iv, {
      authTagLength: ENCRYPTED_DSMR_GCM_TAG_LEN,
    });
    cipher.setAutoPadding(false);
    cipher.setAuthTag(footer.gcmTag);

    if (additionalAuthenticatedData) {
      cipher.setAAD(additionalAuthenticatedData);
    }

    return cipher.update(data, undefined, encoding) + cipher.final(encoding);
  } catch (error) {
    throw new DSMRDecryptionError(error);
  }
};

/** Decrypts a full encrypted DSMR frame */
export const decryptFrame = ({
  data,
  key,
  encoding,
  additionalAuthenticatedData,
}: {
  data: Buffer;
  key: Buffer;
  additionalAuthenticatedData?: Buffer;
  encoding: BufferEncoding;
}) => {
  const header = decodeHeader(data);
  const footer = decodeFooter(data, header);
  const content = data.subarray(
    ENCRYPTED_DSMR_HEADER_LEN,
    ENCRYPTED_DSMR_HEADER_LEN + header.contentLength,
  );
  const decryptedContent = decryptFrameContents({
    data: content,
    header,
    footer,
    key,
    additionalAuthenticatedData,
    encoding,
  });

  return {
    header,
    footer,
    content: decryptedContent,
  };
};
