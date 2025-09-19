import { getDlmsObisCode } from '../dlms-datatype.js';
import { isEqualObisCode, parseObisCodeFromString } from '../obis-code.js';
import { makeIskraDlmsPayload } from './BaseIskraList.js';

const iskraListObisCode = parseObisCodeFromString('0-6:25.9.0.255').obisCode;

/**
 * Some ISKRA meters have a cosem object that says it contains 12 values. However, it only contains
 * 8 values in most cases. There is no descriptor or anything in the data, so we just assume that
 * the first value is a fixed obis code, and the values that follow are values for the specific obis
 * codes above.
 */
export const DlmsPayloadIskraList = makeIskraDlmsPayload('IskraList', {
  ignore1: {
    type: 'buffer',
    test: (value) => {
      const testCode = getDlmsObisCode(value);

      if (testCode === null || iskraListObisCode === null) return false;

      return isEqualObisCode(testCode, iskraListObisCode);
    },
  },
  ignore2: 'ignore',
  ignore3: 'ignore',
  ignore4: 'ignore',
  '1-0:1.8.0': 'number',
  '1-0:2.8.0': 'number',
  '1-0:3.8.0': 'number',
  '1-0:4.8.0': 'number',
  '1-0:1.7.0': 'number',
  '1-0:2.7.0': 'number',
  ignore5: 'ignore',
  ignore6: 'ignore',
});
