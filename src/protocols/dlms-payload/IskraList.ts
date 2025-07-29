import { getDlmsObisCode, isDlmsStructureLike } from '../dlms-datatype.js';
import { isEqualObisCode, parseObisCodeFromString } from '../obis-code.js';
import { addUnknownDlmsCosemObject, makeDlmsPayload, parseDlmsCosem } from './dlms-payload.js';

const iskraListObisCode = parseObisCodeFromString('0-6:25.9.0.255').obisCode;
const obisCodes = [
  null,
  null,
  null,
  null,
  '1-0:1.8.0',
  '1-0:2.8.0',
  '1-0:3.8.0',
  '1-0:4.8.0',
  '1-0:1.7.0',
  '1-0:2.7.0',
  null,
].map((cosem) => {
  if (!cosem) return null;

  return parseObisCodeFromString(cosem).obisCode;
});

/**
 * Some ISKRA meters have a cosem object that says it contains 12 values. However, it only contains
 * 8 values in most cases. There is no descriptor or anything in the data, so we just assume that
 * the first value is a fixed obis code, and the values that follow are values for the specific obis
 * codes above.
 */
export const DlmsPayloadIskraList = makeDlmsPayload('IskraList', {
  detector(dlms) {
    if (!isDlmsStructureLike(dlms)) {
      return false;
    }

    const firstItem = dlms.value[0];

    const obisCode = getDlmsObisCode(firstItem);

    if (!obisCode || !iskraListObisCode || !isEqualObisCode(obisCode, iskraListObisCode)) {
      return false;
    }

    return dlms.value.length === 12;
  },
  parser(dlms, result) {
    if (!isDlmsStructureLike(dlms)) {
      return;
    }

    for (let i = 0; i < dlms.value.length; i++) {
      const cosemCode = obisCodes[i];

      if (!cosemCode) {
        continue;
      }

      const value = dlms.value[i];

      if (typeof value.value !== 'number') {
        addUnknownDlmsCosemObject(cosemCode, value, result);
        continue;
      }

      parseDlmsCosem({
        result,
        obisCode: cosemCode,
        value: value.value,
        unit: null,
        dlms: { useDefaultScalar: true },
      });
    }
  },
});
