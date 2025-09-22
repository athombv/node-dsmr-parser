import {
  isDlmsStructureLike,
  isParsedDlmsDataType,
  isDlmsObisCode,
  getDlmsObisCode,
} from '../dlms-datatype.js';
import { addUnknownDlmsObject, makeDlmsPayload, parseDlmsCosem } from './dlms-payload.js';

/**
 * DLMS structure is like this:
 *
 * - Array
 * - String: push list name
 * - Octet_string (obis code)
 * - Value (can be anything)
 * - Octet_string (obis code)
 * - Value (can be anything)
 * - Etc...
 */
export const DlmsPayloadBasicList = makeDlmsPayload('BasicList', {
  detector(dlms) {
    if (!isDlmsStructureLike(dlms)) {
      return false;
    }

    const pushListName = dlms.value[0];

    if (!isParsedDlmsDataType('string', pushListName)) {
      return false;
    }

    for (let i = 1; i < dlms.value.length; i += 2) {
      const obisCode = dlms.value[i];

      if (!isDlmsObisCode(obisCode)) {
        return false;
      }
    }

    return true;
  },
  parser(dlms, result) {
    if (!isDlmsStructureLike(dlms)) {
      return;
    }

    for (let i = 1; i < dlms.value.length; i += 2) {
      const obisCodeRaw = dlms.value[i];
      const valueRaw = dlms.value[i + 1];

      const obisCode = getDlmsObisCode(obisCodeRaw);

      if (!obisCode) {
        addUnknownDlmsObject(obisCodeRaw, result);
        addUnknownDlmsObject(valueRaw, result);
        continue;
      }

      parseDlmsCosem({
        result,
        obisCode,
        value: valueRaw.value,
        unit: null,
        dlms: {
          useDefaultScalar: true,
        },
      });
    }
  },
});
