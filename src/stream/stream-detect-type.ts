import { isAscii } from 'node:buffer';
import { Readable } from 'node:stream';

import {
  decodeEncryptionHeader,
  ENCRYPTED_DLMS_HEADER_LEN,
  ENCRYPTED_DLMS_TELEGRAM_SOF,
} from '../protocols/encryption.js';
import {
  decodeHdlcHeader,
  decodeLlcHeader,
  HDLC_HEADER_LENGTH,
  HDLC_LLC_HEADER_LENGTH,
  HDLC_TELEGRAM_SOF_EOF,
} from '../protocols/hdlc.js';
import { CR, DSMR_SOF, LF } from '../protocols/dsmr.js';
import { SmartMeterStreamParser } from './stream.js';

type StreamDetectTypeCallback = (result: {
  mode: 'dsmr' | 'dlms';
  encrypted: boolean;
  /** Note that the frame might not start at the beginning of the buffer. */
  data: Buffer;
}) => void;

/** This class detects the type of stream (DSMR or DLMS) and whether it is encrypted or not. */
export class SmartMeterDetectTypeStream implements SmartMeterStreamParser {
  public readonly startOfFrameByte = DSMR_SOF;

  private boundOnData: SmartMeterDetectTypeStream['onData'];
  private telegram = Buffer.alloc(0);

  constructor(
    private options: {
      stream: Readable;
      callback: StreamDetectTypeCallback;
    },
  ) {
    this.boundOnData = this.onData.bind(this);
    options.stream.addListener('data', this.boundOnData);
  }

  private onData(data: Buffer) {
    this.telegram = Buffer.concat([this.telegram, data]);

    const { hasFoundDsmr, canClearDsmr } = this.onDataCheckDSMR();

    if (hasFoundDsmr) {
      this.options.callback({
        mode: 'dsmr',
        encrypted: false,
        data: this.telegram,
      });
      this.clear();
      return;
    }

    // Note: It is important to check for DLMS before checking for encrypted DSMR,
    // as the encryption headers are the same for both encrypted DSMR and DLMS.
    const { hasFoundDlms, encryptedDlms, canClearDlms } = this.onDataCheckDLMS();

    if (hasFoundDlms) {
      this.options.callback({
        mode: 'dlms',
        encrypted: encryptedDlms ?? false,
        data: this.telegram,
      });
      this.clear();
      return;
    }

    const { hasFoundEncryptedDsmr, canClearEncryptedDsmr } = this.onDataCheckEncryptedDSMR();

    if (hasFoundEncryptedDsmr) {
      this.options.callback({
        mode: 'dsmr',
        encrypted: true,
        data: this.telegram,
      });
      this.clear();
      return;
    }

    // If all three checks are not finding valid telegrams, and they are not
    // waiting for more data, we can clear the telegram buffer.
    if (canClearDsmr && canClearDlms && canClearEncryptedDsmr) {
      this.clear();
    }
  }

  private onDataCheckDSMR() {
    // If the telegram is not ascii, it cannot be a DSMR telegram.
    // IsAscii is guaranteed to be false for DLMS/encrypted telegrams, as they have SOFs that are not
    // in the ascii range.
    if (!isAscii(this.telegram)) {
      return {
        hasFoundDsmr: false,
        canClearDsmr: true,
      };
    }

    const sofIndex = this.telegram.indexOf(DSMR_SOF);
    if (sofIndex === -1) {
      return {
        hasFoundDsmr: false,
        canClearDsmr: true,
      };
    }

    const carriageReturnIndex = this.telegram.indexOf(CR, sofIndex + 1);

    if (carriageReturnIndex === -1) {
      return {
        hasFoundDsmr: false,
        canClearDsmr: false,
      };
    }

    const minimumTelegramLength = carriageReturnIndex + 1;
    if (this.telegram.length <= minimumTelegramLength) {
      return {
        hasFoundDsmr: false,
        canClearDsmr: false,
      };
    }

    const newLineCheck = this.telegram[carriageReturnIndex + 1];

    // If we haven't found a new line, we can clear the telegram buffer as
    // it is not a valid DSMR telegram.
    return {
      hasFoundDsmr: newLineCheck === LF,
      canClearDsmr: true,
    };
  }

  private onDataCheckDLMS() {
    const sofIndex = this.telegram.indexOf(HDLC_TELEGRAM_SOF_EOF);

    if (sofIndex === -1) {
      return {
        hasFoundDlms: false,
        canClearDlms: true,
      };
    }

    const minimumTelegramLength = sofIndex + HDLC_HEADER_LENGTH;

    if (this.telegram.length < minimumTelegramLength) {
      return {
        hasFoundDlms: false,
        canClearDlms: false,
      };
    }

    try {
      const header = decodeHdlcHeader(this.telegram.subarray(sofIndex, this.telegram.length));
      decodeLlcHeader(this.telegram.subarray(sofIndex + header.consumedBytes));

      const contentStart = this.telegram.readUint8(
        sofIndex + header.consumedBytes + HDLC_LLC_HEADER_LENGTH,
      );

      return {
        hasFoundDlms: true,
        canClearDlms: true,
        encryptedDlms: contentStart === ENCRYPTED_DLMS_TELEGRAM_SOF,
      };
    } catch (_error) {
      return { hasFoundDlms: false };
    }
  }

  private onDataCheckEncryptedDSMR() {
    const sofIndex = this.telegram.indexOf(ENCRYPTED_DLMS_TELEGRAM_SOF);

    if (sofIndex === -1) {
      return {
        hasFoundEncryptedDsmr: false,
        canClearEncryptedDsmr: true,
      };
    }

    const minimumTelegramLength = sofIndex + ENCRYPTED_DLMS_HEADER_LEN;

    if (this.telegram.length < minimumTelegramLength) {
      return {
        hasFoundEncryptedDsmr: false,
        canClearEncryptedDsmr: false,
      };
    }

    try {
      // Frame is encrypted when the header can be successfully decoded.
      decodeEncryptionHeader(this.telegram.subarray(sofIndex));

      return {
        hasFoundEncryptedDsmr: true,
        canClearEncryptedDsmr: true,
      };
    } catch (_error) {
      return {
        hasFoundEncryptedDsmr: false,
        canClearEncryptedDsmr: false,
      };
    }
  }

  destroy() {
    this.clear();
    this.options.stream.removeListener('data', this.boundOnData);
  }

  clear() {
    this.telegram = Buffer.alloc(0);
  }

  currentSize() {
    return this.telegram.length;
  }
}
