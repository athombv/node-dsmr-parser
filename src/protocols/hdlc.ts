/**
 * HDLC frame format:
 *
 * | Bytes | Description         | Description                                                           |
 * | ----- | ------------------- | --------------------------------------------------------------------- |
 * | 1     | SOF                 | 0x7E (fixed)                                                          |
 * | 2     | Format & Length     | See "Format & Length"                                                 |
 * | 1-4   | Destination Address | See "Addresses"                                                       |
 * | 1-4   | Source Address      | See "Addresses"                                                       |
 * | 1     | Control             | See "Control Byte"                                                    |
 * | 2     | Header Checksum     | CRC-16/IBM-SDLC of the header bytes (excluding SOF)                   |
 * | n     | Frame               | Frame contents                                                        |
 * | 2     | Frame Checksum      | CRC-16/IBM-SDLC of the entire frame (including header, excluding SOF) |
 * | 1     | EOF                 | 0x7E (fixed)                                                          |
 *
 * Format & Length: 0bTTTT_SLLL_LLLL_LLLL
 *
 * | Bits | Description  | Description                                                                |
 * | ---- | ------------ | -------------------------------------------------------------------------- |
 * | T    | Frame type   | This implementation only supports frame type 0xA, which is fixed for dlms. |
 * | S    | Segmentation | When 1, the contents are split over multiple HDLC frames.                  |
 * | L    | Frame length | The length of the frame in bytes, excluding SOF/EOF.                       |
 *
 * Addresses: Addresses can be 1-4 bytes long, if the LSB is 1, the address is complete. If it is 0,
 * the next byte is part of the address. The LSB of each byte is not part of the address.
 *
 * Control Byte:
 *
 * | Frame Type  | 0    | 1    | 2    | 3   | 4    | 5    | 6    | 7   |
 * | ----------- | ---- | ---- | ---- | --- | ---- | ---- | ---- | --- |
 * | Information | N(R) | N(R) | N(R) | P/F | N(S) | N(S) | N(S) | 0   |
 * | Supervisory | N(R) | N(R) | N(R) | P/F | N(S) | N(S) | 0    | 1   |
 * | Unnumbered  | N(R) | N(R) | N(R) | P/F | N(S) | N(S) | 1    | 1   |
 *
 * - N(R): Receive sequence number
 * - N(S): Send sequence number
 * - P/F: Poll/Final bit
 *
 * We only support unnumbered information frames (0b000P_0011), because we're relying on the meter
 * to send unsolicited messages.
 *
 * The first three bytes in the frame, are an LLC header which in the the frames we're interested in
 * always is: 0xe6, 0xe7, 0x00. The LLC header is not part of the HDLC frame, but is part of the
 * frame contents. If the frame is segmented, the LLC header is only present in the first frame.
 *
 * You can find example HDLC frames in the documentation of Aidon's and Kamstrup's meters:
 *
 * - https://aidon.com/wp-content/uploads/2023/06/AIDONFD_RJ45_HAN_Interface_EN.pdf
 * - https://kamstrup.com/-/media/kamstrup/downloads/technical-documentation/hdlc-telegrams.pdf
 *
 * These are included in the test suite of this library as well (see {@link tests/telegrams/dlms})
 */

import { BaseParserResult } from '../util/base-result.js';
import { calculateCrc16IbmSdlc } from '../util/crc.js';
import { SmartMeterError, SmartMeterUnknownMessageTypeError } from '../util/errors.js';

export type HdlcParserResult = BaseParserResult & {
  hdlc: {
    raw: string;
    header: {
      destinationAddress: number;
      sourceAddress: number;
      crc?: {
        value: number;
        valid: boolean;
      };
    };
    crc?: {
      value: number;
      valid: boolean;
    };
  };
  dlms: {
    invokeId: number;
    timestamp: string; // TODO make this a date object
    unknownObjects: string[];
    payloadType: string;
  };
};

export const HDLC_TELEGRAM_SOF_EOF = 0x7e;
export const HDLC_FORMAT_START = 0xa; // HDLC format type 3
export const HDLC_HEADER_LENGTH = 14;
export const HDLC_FOOTER_LENGTH = 3;
export const HDLC_LLC_HEADER_LENGTH = 3;
export const HDLC_LLC_DESTINATION = 0xe6;
export const HDLC_LLC_SOURCE = 0xe7;
export const HDLC_LLC_QUALITY = 0x00;

const decodeHdlcAddress = (data: Buffer, index: number) => {
  let i;
  let address = 0;

  for (i = 0; i < 4; i++) {
    const byte = data.readUint8(index + i);

    address = (address << 7) + ((byte & 0xfe) >> 1);

    if ((byte & 0b1) === 1) {
      break;
    }
  }

  return { address, consumedBytes: i + 1 };
};

export const decodeHdlcHeader = (data: Buffer) => {
  if (data.length < HDLC_HEADER_LENGTH) {
    throw new SmartMeterError('Invalid header length');
  }

  let index = 0;

  const sof = data.readUint8(index++);

  if (sof !== HDLC_TELEGRAM_SOF_EOF) {
    throw new SmartMeterError(`Invalid telegram sof 0x${sof.toString(16)}`);
  }

  const format = data.readUint8(index++);
  const formatType = (format >> 4) & 0b1111;
  // TODO: Is this bit "Segmentation supported", or "This frame is segmented"?
  // The control bit also has a final bit, maybe that is used to indicate the end of a segmented frame?
  const segmentation = (format & 0x08) !== 0;

  if (formatType !== HDLC_FORMAT_START) {
    throw new SmartMeterError(`Invalid format type 0x${formatType.toString(16)}`);
  }

  const frameLength = ((format & 0x07) << 8) + data.readUint8(index++);

  const { address: destinationAddress, consumedBytes: destinationAddressBytes } = decodeHdlcAddress(
    data,
    index,
  );
  index += destinationAddressBytes;

  const { address: sourceAddress, consumedBytes: sourceAddressBytes } = decodeHdlcAddress(
    data,
    index,
  );
  index += sourceAddressBytes;

  const controlByte = data.readUint8(index++);

  const calculatedCrc = calculateCrc16IbmSdlc(data.subarray(1, index));

  const crc = data.readUint16LE(index);
  index += 2;

  return {
    formatType,
    segmentation,
    frameLength,
    destinationAddress,
    sourceAddress,
    controlByte,
    crc,
    crcValid: crc === calculatedCrc,
    consumedBytes: index,
  };
};

export const decodeLlcHeader = (frameContent: Buffer) => {
  if (frameContent.length < HDLC_LLC_HEADER_LENGTH) {
    throw new SmartMeterError('Invalid LLC header length');
  }

  const destination = frameContent.readUint8(0);
  const source = frameContent.readUint8(1);
  const quality = frameContent.readUint8(2);

  if (destination !== HDLC_LLC_DESTINATION) {
    throw new SmartMeterUnknownMessageTypeError(
      `Invalid LLC destination address 0x${destination.toString(16)}`,
    );
  }
  if (source !== HDLC_LLC_SOURCE) {
    throw new SmartMeterUnknownMessageTypeError(
      `Invalid LLC source address 0x${source.toString(16)}`,
    );
  }
  if (quality !== HDLC_LLC_QUALITY) {
    throw new SmartMeterUnknownMessageTypeError(`Invalid LLC quality 0x${quality.toString(16)}`);
  }

  return { destination, source, quality, consumedBytes: 3 };
};

export const decodeHdlcFooter = (frame: Buffer) => {
  if (frame[frame.length - 1] !== HDLC_TELEGRAM_SOF_EOF) {
    throw new SmartMeterError(`Invalid footer eof 0x${frame[frame.length].toString(16)}`);
  }

  const crc = frame.readUint16LE(frame.length - HDLC_FOOTER_LENGTH);
  const calculatedCrc = calculateCrc16IbmSdlc(frame.subarray(1, -HDLC_FOOTER_LENGTH));

  return {
    crc,
    crcValid: calculatedCrc === crc,
  };
};
