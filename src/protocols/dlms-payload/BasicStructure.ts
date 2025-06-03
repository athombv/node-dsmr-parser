import {
  isDlmsStructureLike,
  isDlmsObisCode,
  getDlmsNumberValue,
  getDlmsObisCode,
  isParsedDlmsDataType,
  ParsedDlmsData,
} from '../dlms-datatype.js';
import { ObisCode } from '../obis-code.js';
import { addUnknownDlmsObject, makeDlmsPayload, parseDlmsCosem } from './dlms-payload.js';

export const DLMS_UNITS = {
  [27]: 'W',
  [28]: 'VA',
  [29]: 'var',
  [30]: 'Wh',
  [31]: 'VAh',
  [32]: 'varh',
  [33]: 'A',
  [34]: 'C',
  [35]: 'V',
} as const;

/**
 * Cosem structure is an array/structure with 3 elements:
 *
 * 1. OBIS code (octet string)
 * 2. Value (something else)
 * 3. Unit (structure with 2 elements)
 *
 *    - Scalar
 *    - Enum
 */
export const parseDlmsCosemStructure = (object: ParsedDlmsData) => {
  if (!isParsedDlmsDataType('structure', object) && !isParsedDlmsDataType('array', object)) {
    return null;
  }

  if (object.value.length !== 3 && object.value.length !== 2) {
    return null;
  }

  let obisCode: ObisCode | null = null;
  let value: string | number | null = null;
  let unit: string | null = null;
  let scalar = 1;

  for (const item of object.value) {
    // This assumes that the first octet_string is the OBIS code.
    if (!obisCode) {
      const newObisCode = getDlmsObisCode(item);

      if (newObisCode) {
        obisCode = newObisCode;
        continue;
      }
    }

    if (isDlmsStructureLike(item)) {
      if (item.value.length !== 2) continue;

      // This is the enum, it should contain the scalar value and the unit
      for (const subItem of item.value) {
        if (isParsedDlmsDataType('enum', subItem)) {
          unit = DLMS_UNITS[subItem.value as keyof typeof DLMS_UNITS] ?? String(subItem.value);
        } else {
          const numberValue = getDlmsNumberValue(subItem);

          if (numberValue !== null) {
            scalar = numberValue;
          }
        }
      }
      continue;
    }

    if (isParsedDlmsDataType('string', item)) {
      value = item.value;
      continue;
    }

    if (isParsedDlmsDataType('octet_string', item)) {
      value = item.value.toString('hex');
      continue;
    }

    const numberValue = getDlmsNumberValue(item);

    if (numberValue === null) continue;

    value = numberValue;
  }

  if (typeof value === 'number' && scalar) {
    value = Math.pow(10, scalar) * value;
  }

  if (obisCode === null || value === null) {
    return null;
  }

  return {
    obisCode,
    value,
    unit,
  };
};

/**
 * Used by Aidon etc.
 *
 * DLMS structure is like this:
 *
 * - Array
 * - Structure
 *
 *   - Octet_string (obis code)
 *   - Value (can be anything)
 *   - Structure (optional, unit and scalar)
 *
 *       - Int8 (scalar)
 *       - Enum (unit)
 */
export const DlmsPayloadBasicStructure = makeDlmsPayload('BasicStructure', {
  detector: (dlms) => {
    // Outer array and/or structure
    if (!isDlmsStructureLike(dlms)) {
      return false;
    }

    for (const item of dlms.value) {
      // Single Cosem item
      if (!isDlmsStructureLike(item)) {
        return false;
      }

      if (item.value.length !== 3 && item.value.length !== 2) {
        return false;
      }

      if (!isDlmsObisCode(item.value[0])) {
        return false;
      }
    }

    return true;
  },
  parser: (dlms, result) => {
    if (!isDlmsStructureLike(dlms)) {
      return;
    }

    for (const item of dlms.value) {
      const cosemStructure = parseDlmsCosemStructure(item);

      if (!cosemStructure) {
        addUnknownDlmsObject(item, result);
        continue;
      }

      parseDlmsCosem({
        obisCode: cosemStructure.obisCode,
        value: cosemStructure.value,
        unit: cosemStructure.unit,
        dlms: {
          useDefaultScalar: false,
        },
        result,
      });
    }
  },
});
