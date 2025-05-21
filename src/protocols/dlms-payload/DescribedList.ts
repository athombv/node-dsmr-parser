import { getDlmsObisCode, isDlmsStructureLike } from '../dlms-datatype.js';
import { makeDlmsPayload, parseDlmsCosem } from './dlms-payload.js';

export const DlmsPayloadDescribedList = makeDlmsPayload('DescribedList', {
  detector(dlms) {
    if (!isDlmsStructureLike(dlms)) {
      return false;
    }

    const firstItem = dlms.value[0];

    if (!isDlmsStructureLike(firstItem)) {
      return false;
    }

    if (firstItem.value.length !== dlms.value.length) {
      return false;
    }

    return true;
  },
  parser(dlms, result) {
    if (!isDlmsStructureLike(dlms)) {
      return;
    }

    const descriptorList = dlms.value[0];

    if (!isDlmsStructureLike(descriptorList)) return;

    for (const [index, descriptor] of descriptorList.value.entries()) {
      if (!isDlmsStructureLike(descriptor)) {
        // TODO: Add unknown object.
        continue;
      }

      const obisRaw = descriptor.value[1];

      if (!obisRaw) {
        continue;
      }

      const obisCode = getDlmsObisCode(obisRaw);

      if (!obisCode) {
        continue;
      }

      const valueRaw = dlms.value[index + 1];

      if (!valueRaw) {
        continue;
      }

      if (typeof valueRaw.value !== 'string' && typeof valueRaw.value !== 'number') {
        continue;
      }

      parseDlmsCosem({
        obisCode,
        value: valueRaw.value,
        unit: null,
        dlms: {
          useDefaultScalar: true,
        },
        result,
      });
    }
  },
});
