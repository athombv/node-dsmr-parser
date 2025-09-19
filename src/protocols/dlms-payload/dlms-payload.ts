import { CosemLibrary, DlmsCosemParameters } from '../cosem.js';
import { ParsedDlmsData } from '../dlms-datatype.js';
import { HdlcParserResult } from '../hdlc.js';
import { ObisCode, obisCodeToString } from '../obis-code.js';
import type { parseDlmsCosemStructure } from './BasicStructure.js';

/**
 * In DLMS, the payload can have different structures. Depending on the structure we have a
 * different method of mapping the data to an OBIS code.
 *
 * @param name The name of the payload. This is used for debugging purposes and has no additional
 *   meaning.
 * @param detector A function that detects if the payload is of this type. It should return true if
 *   the payload is of this type, and false otherwise.
 * @param parser A function that parses the payload. It should take the payload and return the
 *   parsed data.
 */
export const makeDlmsPayload = (
  name: string,
  {
    detector,
    parser,
  }: {
    detector: (dlms: ParsedDlmsData) => boolean;
    parser: (dlms: ParsedDlmsData, result: HdlcParserResult) => void;
  },
) => {
  return { name, detector, parser };
};

export const parseDlmsCosem = ({
  obisCode,
  value,
  unit,
  dlms,
  result,
}: {
  obisCode: ObisCode;
  value: unknown;
  unit: string | null;
  dlms: DlmsCosemParameters;
  result: HdlcParserResult;
}) => {
  const parser = CosemLibrary.getParser(obisCode);

  const obisCodeString = obisCodeToString(obisCode);
  const valueStr = `${Buffer.isBuffer(value) ? value.toString('hex') : String(value)}${unit ? `*${unit}` : ''}`;
  const cosemStr = `${obisCodeString}(${valueStr})`;

  if (!parser) {
    result.cosem.unknownObjects.push(cosemStr);
    return;
  }

  switch (parser.parameterType) {
    case 'number': {
      if (typeof value !== 'number') {
        result.cosem.unknownObjects.push(cosemStr);
        return;
      }

      parser.callback({
        result,
        obisCode,
        dlms,
        valueNumber: value,
        valueString: String(value),
        unit: unit,
      });

      result.cosem.knownObjects.push(cosemStr);
      break;
    }
    case 'string': {
      if (typeof value !== 'string') {
        result.cosem.unknownObjects.push(cosemStr);
        return;
      }
      parser.callback({
        result,
        obisCode,
        dlms,
        valueString: String(value),
      });

      result.cosem.knownObjects.push(cosemStr);
      break;
    }
    case 'raw': {
      if (typeof value !== 'string' && typeof value !== 'number') {
        result.cosem.unknownObjects.push(cosemStr);
        return;
      }

      parser.callback({
        result,
        obisCode,
        dlms,
        valueString: String(value),
      });

      result.cosem.knownObjects.push(cosemStr);
      break;
    }
    case 'octet_string': {
      if (!Buffer.isBuffer(value) && typeof value !== 'string') {
        result.cosem.unknownObjects.push(cosemStr);
        return;
      }

      parser.callback({
        result,
        obisCode,
        dlms,
        valueBuffer: Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf-8'),
      });
      result.cosem.knownObjects.push(cosemStr);
      break;
    }
  }
};

export const addUnknownDlmsObject = ({ value, type }: ParsedDlmsData, result: HdlcParserResult) => {
  let valueStr = '';

  if (typeof value === 'string') {
    valueStr = value;
  } else if (typeof value === 'number') {
    valueStr = String(value);
  } else if (value === null) {
    valueStr = 'null';
  } else if (Buffer.isBuffer(value)) {
    valueStr = value.toString('hex');
  } else {
    valueStr = JSON.stringify(value);
  }

  result.dlms.unknownObjects.push(`${type}: ${valueStr}`);
};

export const addUnknownDlmsCosemObject = (
  obisCode: ObisCode,
  { value }: ParsedDlmsData,
  result: HdlcParserResult,
) => {
  let valueStr = '';

  if (typeof value === 'string') {
    valueStr = value;
  } else if (typeof value === 'number') {
    valueStr = String(value);
  } else if (value === null) {
    valueStr = 'null';
  } else if (Buffer.isBuffer(value)) {
    valueStr = value.toString('hex');
  } else {
    valueStr = JSON.stringify(value);
  }

  result.dlms.unknownObjects.push(`${obisCodeToString(obisCode)}(${valueStr})`);
};

export const addUnknownDlmsStructureObject = (
  structure: ReturnType<typeof parseDlmsCosemStructure>,
  result: HdlcParserResult,
) => {
  if (!structure) return;

  let valueStr = '';

  if (typeof structure.value === 'string') {
    valueStr = structure.value;
  } else if (typeof structure.value === 'number') {
    valueStr = String(structure.value);
  } else if (structure.value === null) {
    valueStr = 'null';
  } else {
    valueStr = JSON.stringify(structure.value);
  }

  if (structure.unit) {
    valueStr += `*${structure.unit}`;
  }

  result.dlms.unknownObjects.push(`${obisCodeToString(structure.obisCode)}(${valueStr})`);
};
