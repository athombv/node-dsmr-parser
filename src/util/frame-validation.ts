import { decodeHeader, ENCRYPTED_DSMR_TELEGRAM_SOF } from './encryption.js';

export const DEFAULT_FRAME_ENCODING = 'binary';

/**
 * Check if a line contains only valid ascii characters.
 * @note Need to disable `no-control-regex` rule because of the use of control characters.
 */
// eslint-disable-next-line no-control-regex
const ASCII_REGEX = /[^\x00-\x7F]/;

/**
 * Check if a line contains only valid ascii characters. If this is not the case, the line is either
 * encrypted or contains invalid characters.
 * 
 * @note Doing this check with a regex compared to a loop or using `find` is around three times faster.
 */
export const isAsciiFrame = (telegram: Buffer) => {
  return !ASCII_REGEX.test(telegram.toString('binary'));
};

/** Check if the given frame is an encrypted frame. */
export const isEncryptedFrame = (buffer: Buffer) => {
  const sofIndex = buffer.indexOf(ENCRYPTED_DSMR_TELEGRAM_SOF);

  if (sofIndex === -1) return false;

  try {
    const bufferAtHeader = buffer.subarray(sofIndex, buffer.length);
    decodeHeader(bufferAtHeader);
    return true;
  } catch (_error) {
    return false;
  }
};

/** Check if received data is a valid frame, and if it is encrypted. */
export const DSMRFrameValid = (telegram: Buffer) => {
  const ascii = isAsciiFrame(telegram);
  let encrypted = false;

  // Because sof of encrypted frame is 0xDB, the frame is not encrypted when it is valid ascii.
  if (!ascii) {
    encrypted = isEncryptedFrame(telegram);
  }

  return {
    valid: ascii || encrypted,
    encrypted: encrypted,
  };
};
