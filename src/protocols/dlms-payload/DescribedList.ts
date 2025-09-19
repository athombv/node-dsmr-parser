import { getDlmsObisCode, isDlmsStructureLike } from '../dlms-datatype.js';
import { isEqualObisCode, parseObisCodeFromString } from '../obis-code.js';
import { addUnknownDlmsObject, makeDlmsPayload, parseDlmsCosem } from './dlms-payload.js';

const descriptorListObisCode = parseObisCodeFromString('0-6:25.9.0.255').obisCode;

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

    let nextValueIndex = 1;
    for (const [index, descriptor] of descriptorList.value.entries()) {
      if (!isDlmsStructureLike(descriptor)) {
        addUnknownDlmsObject(descriptor, result);
        continue;
      }

      const obisRaw = descriptor.value[1];

      if (!obisRaw) {
        addUnknownDlmsObject(descriptor, result);
        continue;
      }

      const obisCode = getDlmsObisCode(obisRaw);

      if (!obisCode) {
        addUnknownDlmsObject(descriptor, result);
        continue;
      }

      // This item only indicates that this a descriptor list, so we skip it.
      if (
        index === 0 &&
        descriptorListObisCode &&
        isEqualObisCode(obisCode, descriptorListObisCode)
      ) {
        continue;
      }

      const valueRaw = dlms.value[nextValueIndex++];

      parseDlmsCosem({
        obisCode,
        value: valueRaw?.value,
        unit: null,
        dlms: {
          useDefaultScalar: true,
        },
        result,
      });
    }
  },
});
