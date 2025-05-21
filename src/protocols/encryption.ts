import * as crypto from 'node:crypto';
import { SmartMeterDecodeError, SmartMeterDecryptionError } from './../util/errors.js';
import { getDlmsObjectCount } from './dlms-datatype.js';

/**
 * Encrypted DSMR/DLMS frames have the following format:
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
 * The encrypted DSMR/DLMS frame is encrypted using AES-128-GCM, and the user can request the
 * encryption key from the utility company. The IV is the concatenation of the system title and the
 * frame counter.
 *
 * Length of frame is 17 (header length, excluding sof) + length of the encrypted DSMR frame. GCM
 * tag length is excluded.
 */

export const ENCRYPTED_DLMS_TELEGRAM_SOF = 0xdb; // DLMS_COMMAND_GENERAL_GLO_CIPHERING
export const ENCRYPTED_DLMS_AUTHENTICATION_ENCRYPTION_TAG = 0x30; // DLMS_SECURITY_AUTHENTICATION_ENCRYPTION
export const ENCRYPTED_DLMS_ENCRYPTION_TAG = 0x20; // DLMS_SECURITY_ENCRYPTION
export const ENCRYPTED_DLMS_SYSTEM_TITLE_LEN = 8;
export const ENCRYPTED_DLMS_GCM_TAG_LEN = 12;
export const ENCRYPTED_DLMS_HEADER_LEN = 18;
export const ENCRYPTED_DLMS_DEFAULT_AAD = Buffer.from('00112233445566778899aabbccddeeff', 'hex');

/**
 * @param data A buffer that starts with the header (bytes 0-16) of the E-Meter P1 frame
 * @returns Decoded header
 */
export const decodeEncryptionHeader = (data: Buffer) => {
  if (data.length < ENCRYPTED_DLMS_HEADER_LEN) {
    throw new SmartMeterDecodeError('Invalid header length');
  }

  let index = 0;

  const sof = data[index++];
  if (sof !== ENCRYPTED_DLMS_TELEGRAM_SOF) {
    throw new SmartMeterDecodeError(`Invalid telegram sof 0x${sof.toString(16)}`);
  }

  const systemTitleLen = data[index++];
  if (systemTitleLen !== ENCRYPTED_DLMS_SYSTEM_TITLE_LEN) {
    throw new SmartMeterDecodeError(`Invalid system title length 0x${systemTitleLen.toString(16)}`);
  }

  const systemTitle = data.subarray(index, index + ENCRYPTED_DLMS_SYSTEM_TITLE_LEN);
  index += ENCRYPTED_DLMS_SYSTEM_TITLE_LEN;

  const { objectCount: frameLength, newIndex } = getDlmsObjectCount(data, index);
  index = newIndex;

  // The entire header is 18 bytes long, but the SOF is not included in the frame length.
  const contentLength = frameLength + 1 - ENCRYPTED_DLMS_HEADER_LEN;

  const securityType = data[index++];
  if (
    securityType !== ENCRYPTED_DLMS_AUTHENTICATION_ENCRYPTION_TAG &&
    securityType !== ENCRYPTED_DLMS_ENCRYPTION_TAG
  ) {
    throw new SmartMeterDecodeError(`Invalid security type 0x${securityType.toString(16)}`);
  }

  const frameCounter = data.subarray(index, index + 4);
  index += 4;

  return {
    systemTitle,
    frameCounter,
    securityType,
    contentLength,
    consumedBytes: index,
  };
};

/**
 * @param data A buffer that ends with the footer (bytes n-12 to n) of the E-Meter P1 frame
 * @returns Decoded footer
 */
export const decodeEncryptionFooter = (
  data: Buffer,
  header: ReturnType<typeof decodeEncryptionHeader>,
) => {
  if (data.length < ENCRYPTED_DLMS_GCM_TAG_LEN) {
    throw new SmartMeterDecodeError('Invalid footer length');
  }

  return {
    gcmTag: data.subarray(
      header.consumedBytes + header.contentLength,
      header.consumedBytes + header.contentLength + ENCRYPTED_DLMS_GCM_TAG_LEN,
    ),
  };
};

/** Decrypts the contents of an encrypted DSMR frame. */
export const decryptFrameContents = ({
  data,
  header,
  footer,
  key,
  additionalAuthenticatedData,
}: {
  /** The encrypted DSMR frame */
  data: Buffer;
  /** The decoded header (use {@link decodeEncryptionHeader}) */
  header: ReturnType<typeof decodeEncryptionHeader>;
  /** The decoded footer (use {@link decodeEncryptionFooter}) */
  footer: ReturnType<typeof decodeEncryptionFooter>;
  /** The encryption key */
  key: Buffer;
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
  let cipher: crypto.DecipherGCM;
  let content = Buffer.alloc(0);

  // 1: decrypt the frame, this will only throw if the key, iv or AAD are not
  // correct due to their format. `cipher.update` will never throw, but if the key/iv/aad
  // are not valid it may return gibberish.
  try {
    cipher = crypto.createDecipheriv('aes-128-gcm', key, iv, {
      authTagLength: ENCRYPTED_DLMS_GCM_TAG_LEN,
    });
    cipher.setAutoPadding(false);
    cipher.setAuthTag(footer.gcmTag);

    if (additionalAuthenticatedData) {
      cipher.setAAD(additionalAuthenticatedData);
    }

    content = Buffer.concat([content, cipher.update(data)]);
  } catch (error) {
    return {
      content,
      error: new SmartMeterDecryptionError(error),
    };
  }

  // 2: call final on the frame. This will check the AAD/iv/key.
  // When either of these are invalid, it will throw an "Unsupported state or unable to authenticate data" error.
  // If the AAD is invalid, but the key/iv are valid the content can still be a valid DSMR frame!
  try {
    content = Buffer.concat([content, cipher.final()]);
  } catch (error) {
    return {
      content,
      error: new SmartMeterDecryptionError(error),
    };
  }

  return {
    content,
  };
};

/** Decrypts a full encrypted DLMS frame */
export const decryptDlmsFrame = ({
  data,
  key,
  additionalAuthenticatedData,
}: {
  data: Buffer;
  key: Buffer;
  additionalAuthenticatedData?: Buffer;
}) => {
  const header = decodeEncryptionHeader(data);
  const footer = decodeEncryptionFooter(data, header);
  const encryptedContent = data.subarray(
    header.consumedBytes,
    header.consumedBytes + header.contentLength,
  );
  const { content, error } = decryptFrameContents({
    data: encryptedContent,
    header,
    footer,
    key,
    additionalAuthenticatedData,
  });

  return {
    header,
    footer,
    content,
    error,
  };
};
