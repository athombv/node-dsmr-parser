/**
 * COSEM (Companion Specification for Energy Metering) defines (among other things) a way of
 * identifying properties of smart meters using OBIS codes. These codes are used to identify the
 * type of data being transmitted, and are used in the P1 port of smart meters.
 */

import { SmartMeterParserResult } from '../index.js';
import {
  isEqualObisCode,
  ObisCode,
  ObisCodeString,
  ObisCodeWildcard,
  parseObisCodeWithWildcards,
} from './obis-code.js';

type ParameterTypes = 'number' | 'string' | 'raw' | 'octet_string';

export type DlmsCosemParameters = {
  useDefaultScalar?: boolean;
};

export type DsmrCosemParameters = {
  line: string; // The current line being parsed
  lines: string[]; // All lines in the telegram
  lineNumber: number; // The current line number
};

type BaseCallback<T extends object> = (
  opts: {
    result: SmartMeterParserResult;
    obisCode: ObisCode;
    dlms?: DlmsCosemParameters;
    dsmr?: DsmrCosemParameters;
  } & T,
) => void;

type CallbackString = BaseCallback<{
  valueString: string;
}>;

type CallbackNumber = BaseCallback<{
  valueNumber: number;
  valueString: string;
  unit: string | null;
}>;

type CallbackRaw = BaseCallback<{
  valueString: string;
}>;

type CallbackOctetString = BaseCallback<{
  valueBuffer: Buffer;
}>;

type Callback<T extends ParameterTypes> = T extends 'number'
  ? CallbackNumber
  : T extends 'string'
    ? CallbackString
    : T extends 'raw'
      ? CallbackRaw
      : T extends 'octet_string'
        ? CallbackOctetString
        : never;

class CosemLibraryInternal {
  lib: (
    | {
        obisCode: ObisCodeWildcard;
        parameterType: 'string';
        callback: Callback<'string'>;
      }
    | {
        obisCode: ObisCodeWildcard;
        parameterType: 'number';
        callback: Callback<'number'>;
      }
    | {
        obisCode: ObisCodeWildcard;
        parameterType: 'raw';
        callback: Callback<'raw'>;
      }
    | {
        obisCode: ObisCodeWildcard;
        parameterType: 'octet_string';
        callback: Callback<'octet_string'>;
      }
  )[] = [];

  addStringParser(identifier: ObisCodeString, callback: CallbackString) {
    const { obisCode } = parseObisCodeWithWildcards(identifier);

    if (!obisCode) throw new Error(`Invalid OBIS identifier: ${identifier}`);

    this.lib.push({
      parameterType: 'string',
      obisCode,
      callback,
    });
    return this;
  }

  addNumberParser(identifier: ObisCodeString, callback: CallbackNumber) {
    const { obisCode } = parseObisCodeWithWildcards(identifier);
    if (!obisCode) throw new Error(`Invalid OBIS identifier: ${identifier}`);
    this.lib.push({
      parameterType: 'number',
      obisCode,
      callback,
    });
    return this;
  }

  addRawParser(identifier: ObisCodeString, callback: CallbackRaw) {
    const { obisCode } = parseObisCodeWithWildcards(identifier);

    if (!obisCode) throw new Error(`Invalid OBIS identifier: ${identifier}`);

    this.lib.push({
      parameterType: 'raw',
      obisCode,
      callback,
    });

    return this;
  }

  addOctetStringParser(identifier: ObisCodeString, callback: CallbackOctetString) {
    const { obisCode } = parseObisCodeWithWildcards(identifier);

    if (!obisCode) throw new Error(`Invalid OBIS identifier: ${identifier}`);

    this.lib.push({
      parameterType: 'octet_string',
      obisCode,
      callback,
    });

    return this;
  }

  getParser(obisCode: ObisCode) {
    return this.lib.find((item) => isEqualObisCode(item.obisCode, obisCode));
  }
}

const parseTimeStamp = (value: string): Date | string => {
  // YYMMDDhhmmssX used in DSMR P1 telegrams
  // X = 'W' for winter time, 'S' for summer time
  const match = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([WS]?)$/.exec(value);
  if (match) {
    const year = parseInt(match[1], 10) + 2000; // DSMR uses YY, so we add 2000
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6], 10);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  return value;
};

export const CosemLibrary = new CosemLibraryInternal()
  .addNumberParser('1-3:0.2.8', ({ valueNumber, result }) => {
    result.metadata.dsmrVersion = valueNumber / 10;
  })
  .addStringParser('0-0:1.0.0', ({ valueString, result }) => {
    result.metadata.timestamp = parseTimeStamp(valueString);
  })
  .addOctetStringParser('0-0:42.0.0', ({ valueBuffer, result }) => {
    result.cosem.id = valueBuffer.toString('utf-8');
  })
  .addStringParser('0-0:96.1.1', ({ valueString, result }) => {
    result.metadata.equipmentId = valueString;
  })
  .addOctetStringParser('0-0:96.1.2', ({ valueBuffer, result }) => {
    result.metadata.serialNumber = valueBuffer.toString('utf-8');
  })
  .addNumberParser('1-*:1.8.*', ({ valueNumber, unit, obisCode, result }) => {
    const tariff = obisCode.processing;

    if (unit?.toLowerCase() === 'kwh') {
      valueNumber *= 1000;
    }

    if (tariff === 0) {
      result.electricity.total = result.electricity.total ?? {};
      result.electricity.total.received = valueNumber;
    } else {
      result.electricity.tariffs = result.electricity.tariffs ?? {};
      result.electricity.tariffs[tariff] = result.electricity.tariffs[tariff] ?? {};
      result.electricity.tariffs[tariff].received = valueNumber;
    }
  })
  .addNumberParser('1-*:2.8.*', ({ valueNumber, unit, obisCode, result }) => {
    const tariff = obisCode.processing;

    if (unit?.toLowerCase() === 'kwh') {
      valueNumber *= 1000;
    }

    if (tariff === 0) {
      result.electricity.total = result.electricity.total ?? {};
      result.electricity.total.returned = valueNumber;
    } else {
      result.electricity.tariffs = result.electricity.tariffs ?? {};
      result.electricity.tariffs[tariff] = result.electricity.tariffs[tariff] ?? {};
      result.electricity.tariffs[tariff].returned = valueNumber;
    }
  })
  .addNumberParser('0-0:96.14.0', ({ valueNumber, result }) => {
    result.electricity.currentTariff = valueNumber;
  })
  .addNumberParser('1-*:1.7.0', ({ valueNumber, unit, result }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReceivedTotal = valueNumber;
  })
  .addNumberParser('1-*:2.7.0', ({ valueNumber, unit, result }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReturnedTotal = valueNumber;
  })
  .addNumberParser('0-0:96.7.21', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.powerFailures = valueNumber;
  })
  .addNumberParser('0-0:96.7.9', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.longPowerFailures = valueNumber;
  })
  .addNumberParser('1-*:32.32.0', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
    result.metadata.events.voltageSags.l1 = valueNumber;
  })
  .addNumberParser('1-*:52.32.0', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
    result.metadata.events.voltageSags.l2 = valueNumber;
  })
  .addNumberParser('1-*:72.32.0', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
    result.metadata.events.voltageSags.l3 = valueNumber;
  })
  .addNumberParser('1-*:32.36.0', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
    result.metadata.events.voltageSwells.l1 = valueNumber;
  })
  .addNumberParser('1-*:52.36.0', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
    result.metadata.events.voltageSwells.l2 = valueNumber;
  })
  .addNumberParser('1-*:72.36.0', ({ valueNumber, result }) => {
    result.metadata.events = result.metadata.events ?? {};
    result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
    result.metadata.events.voltageSwells.l3 = valueNumber;
  })
  .addStringParser('0-0:96.13.0', ({ valueString, result }) => {
    result.metadata.textMessage = valueString;
  })
  .addNumberParser('0-0:96.13.1', ({ valueNumber, result }) => {
    result.metadata.numericMessage = valueNumber;
  })
  .addNumberParser('1-*:32.7.0', ({ valueNumber, result, dlms }) => {
    // The currents for DLMS (in BasicList/DescribedList) mode are in dV to
    // give more precision without using floats.
    if (dlms?.useDefaultScalar) {
      valueNumber /= 10;
    }

    result.electricity.voltage = result.electricity.voltage ?? {};
    result.electricity.voltage.l1 = valueNumber;
  })
  .addNumberParser('1-*:52.7.0', ({ valueNumber, result, dlms }) => {
    if (dlms?.useDefaultScalar) {
      valueNumber /= 10;
    }
    result.electricity.voltage = result.electricity.voltage ?? {};
    result.electricity.voltage.l2 = valueNumber;
  })
  .addNumberParser('1-*:72.7.0', ({ valueNumber, result, dlms }) => {
    if (dlms?.useDefaultScalar) {
      valueNumber /= 10;
    }

    result.electricity.voltage = result.electricity.voltage ?? {};
    result.electricity.voltage.l3 = valueNumber;
  })
  .addNumberParser('1-*:31.7.0', ({ valueNumber, result, dlms }) => {
    // The currents for DLMS (in BasicList/DescribedList) mode are in 10 mA to
    // give more precision without using floats.
    if (dlms?.useDefaultScalar) {
      valueNumber /= 100;
    }

    result.electricity.current = result.electricity.current ?? {};
    result.electricity.current.l1 = valueNumber;
  })
  .addNumberParser('1-*:51.7.0', ({ valueNumber, result, dlms }) => {
    if (dlms?.useDefaultScalar) {
      valueNumber /= 100;
    }

    result.electricity.current = result.electricity.current ?? {};
    result.electricity.current.l2 = valueNumber;
  })
  .addNumberParser('1-*:71.7.0', ({ valueNumber, result, dlms }) => {
    if (dlms?.useDefaultScalar) {
      valueNumber /= 100;
    }

    result.electricity.current = result.electricity.current ?? {};
    result.electricity.current.l3 = valueNumber;
  })
  .addNumberParser('1-*:21.7.0', ({ valueNumber, result, unit }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReceived = result.electricity.powerReceived ?? {};
    result.electricity.powerReceived.l1 = valueNumber;
  })
  .addNumberParser('1-*:41.7.0', ({ valueNumber, result, unit }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReceived = result.electricity.powerReceived ?? {};
    result.electricity.powerReceived.l2 = valueNumber;
  })
  .addNumberParser('1-*:61.7.0', ({ valueNumber, result, unit }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReceived = result.electricity.powerReceived ?? {};
    result.electricity.powerReceived.l3 = valueNumber;
  })
  .addNumberParser('1-*:22.7.0', ({ valueNumber, result, unit }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReturned = result.electricity.powerReturned ?? {};
    result.electricity.powerReturned.l1 = valueNumber;
  })
  .addNumberParser('1-*:42.7.0', ({ valueNumber, result, unit }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReturned = result.electricity.powerReturned ?? {};
    result.electricity.powerReturned.l2 = valueNumber;
  })
  .addNumberParser('1-*:62.7.0', ({ valueNumber, result, unit }) => {
    if (unit?.toLowerCase() === 'kw') {
      valueNumber *= 1000;
    }

    result.electricity.powerReturned = result.electricity.powerReturned ?? {};
    result.electricity.powerReturned.l3 = valueNumber;
  })
  .addNumberParser('0-*:24.1.0', ({ valueNumber, result, obisCode }) => {
    const busId = obisCode.channel;
    const typeId = valueNumber;

    result.mBus[busId] = result.mBus[busId] ?? {};
    result.mBus[busId].deviceType = typeId;
  })
  .addStringParser('0-*:96.1.0', ({ valueString, result, obisCode }) => {
    const busId = obisCode.channel;
    result.mBus[busId] = result.mBus[busId] ?? {};
    result.mBus[busId].equipmentId = valueString;
  })
  .addRawParser('0-*:24.2.*', ({ valueString, result, obisCode }) => {
    // Result is something like (101209112500W)(12785.123*m3)
    const match = /^\(([^)]+)\)\(([\d.]+)\*(\w+)?\)/.exec(valueString);

    if (!match) {
      return;
    }

    const busId = obisCode.channel;
    const timestamp = match[1];
    const mbusValue = parseFloat(match[2]);
    const unit = match[3];

    result.mBus[busId] = result.mBus[busId] ?? {};
    result.mBus[busId].timestamp = parseTimeStamp(timestamp);
    result.mBus[busId].value = mbusValue;
    result.mBus[busId].unit = unit;
  })
  // Gas report for DSMR 3 meters.
  // This is a bit off an odd one, as it's a two line parser.
  // 0-1:24.3.0(090212160000)(00)(60)(1)(0-1:24.2.1)(m3)
  // (00000.000)
  .addRawParser('0-*:24.3.0', ({ valueString, result, obisCode, dsmr }) => {
    // This parser is not valid for DLMS (since it doesn't have the concept of line numbers).
    if (!dsmr) return;
    // Result is something like (090212160000)(00)(60)(1)(0-1:24.2.1)(m3)
    const match = /^\((\w+)\)\((\d+)\)\((\d+)\)\((\d)\)\((0-\d:24\.2\.1)\)\((\w+)\)/.exec(
      valueString,
    );

    if (!match) {
      return;
    }

    const nextLine = dsmr.lines[dsmr.lineNumber + 1];

    if (!nextLine) {
      return;
    }

    const nextLineMatch = /^\(([\d.]+)\)/.exec(nextLine);

    if (!nextLineMatch) {
      return;
    }

    const busId = obisCode.channel;
    const timestamp = match[1];
    const recordingPeriodMinutes = parseInt(match[3], 10);
    const unit = match[6];
    const mbusValue = parseFloat(nextLineMatch[1]);

    result.mBus[busId] = result.mBus[busId] ?? {};
    result.mBus[busId].timestamp = parseTimeStamp(timestamp);
    result.mBus[busId].value = mbusValue;
    result.mBus[busId].unit = unit;
    result.mBus[busId].recordingPeriodMinutes = recordingPeriodMinutes;
  });
