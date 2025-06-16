/**
 * DLMS (Device Language Message Specification) is a protocol used for communication with smart
 * meters.
 *
 * We only support a specific subset of the DLMS protocol, which is used on the P1 port of smart
 * meters. The entire protocol is much more complex and supports a wide range of message types.
 *
 * We support the following message types:
 *
 * - Data Notification (0x0f)
 * - Encrypted Message (0xdb) with Data Notification messages inside.
 *
 * The contents of the DLMS Data Notification message is defined as follows:
 *
 * - Invoke id (4 bytes)
 * - Timestamp (variable length)
 * - Data
 *
 * The data is a DLMS structure, which uses a TLV-like encoding format. This format is implemented
 * in {@link DlmsDataTypes}.
 *
 * You can find an online tool that can decode DLMS messages here:
 * https://www.gurux.fi/GuruxDLMSTranslator
 */

import { decryptDlmsFrame, ENCRYPTED_DLMS_TELEGRAM_SOF } from '../protocols/encryption.js';
import { SmartMeterDecryptionRequired, SmartMeterUnknownMessageTypeError } from '../util/errors.js';
import { DlmsDataTypes, getDlmsObjectCount } from './dlms-datatype.js';
import { DlmsPayloads } from './dlms-payload/dlms-payloads.js';
import { HdlcParserResult } from './hdlc.js';

export const DLMS_DATA_NOTIFICATION_SOF = 0x0f;

export const decodeDlmsObis = (
  dlms: ReturnType<typeof decodeDLMSContent>,
  result: HdlcParserResult,
) => {
  const payloadType = DlmsPayloads.parse(dlms.data, result);

  result.dlms.payloadType = payloadType;
};

export const decodeDLMSContent = ({
  frame,
  decryptionKey,
  additionalAuthenticatedData,
}: {
  frame: Buffer;
  decryptionKey?: Buffer;
  additionalAuthenticatedData?: Buffer;
}) => {
  let index = 0;
  const msgTypePeek = frame.readUint8(index);
  let decryptionError: Error | undefined;

  if (msgTypePeek === ENCRYPTED_DLMS_TELEGRAM_SOF) {
    if (!decryptionKey) {
      throw new SmartMeterDecryptionRequired();
    }

    // Encrypted telegram
    const { content, error } = decryptDlmsFrame({
      data: frame,
      key: decryptionKey,
      additionalAuthenticatedData,
    });

    decryptionError = error;
    frame = content;
  }

  try {
    const msgType = frame.readUint8(index++);

    if (msgType !== DLMS_DATA_NOTIFICATION_SOF) {
      throw new SmartMeterUnknownMessageTypeError(`Invalid message type 0x${msgType.toString(16)}`);
    }

    const invokeId = frame.readUint32BE(index);
    index += 4;

    const { objectCount: timeLength, newIndex } = getDlmsObjectCount(frame, index);
    index = newIndex;

    const timestamp =
      timeLength === 0x00 ? Buffer.alloc(0) : frame.subarray(index, index + timeLength);

    index += timeLength;

    const { value, type } = DlmsDataTypes.parse(frame, index);

    return {
      invokeId,
      timestamp,
      data: { value, type },
      decryptionError,
    };
  } catch (error) {
    // If we're unable to parse the data and we have a decryption error,
    // the error is probably in the decryption.
    if (decryptionError) {
      throw decryptionError;
    }

    throw error;
  }
};
