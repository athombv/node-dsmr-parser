import { isDlmsStructureLike, ParsedDlmsData } from '../dlms-datatype.js';
import { ObisCode, parseObisCodeFromString } from '../obis-code.js';
import { makeDlmsPayload, parseDlmsCosem } from './dlms-payload.js';

type AllowedType = 'string' | 'number' | 'buffer' | 'ignore';

type IskraObisConfig = {
  obisCode: ObisCode | null;
  type: AllowedType;
  convert?: (value: ParsedDlmsData) => string | number | Buffer | null;
  test?: (value: ParsedDlmsData) => boolean;
};

const runTest = (value: ParsedDlmsData, config: IskraObisConfig) => {
  if (config.type === 'ignore') return true;
  if (value.type === 'missing') return true;

  if (typeof config === 'object' && config.test) {
    return config.test(value);
  }

  if (config.type === 'buffer') return Buffer.isBuffer(value.value);

  return typeof value.value === config.type;
};

const runConvert = (value: ParsedDlmsData, config: IskraObisConfig) => {
  if (typeof config === 'object' && config.convert) {
    return config.convert(value);
  }

  if (config.type === 'string' && typeof value.value === 'string') {
    return value.value;
  }

  if (config.type === 'number' && typeof value.value === 'number') {
    return value.value;
  }

  if (config.type === 'buffer' && Buffer.isBuffer(value.value)) {
    return value.value;
  }

  return null;
};

export const makeIskraDlmsPayload = (
  name: string,
  config: Record<string, AllowedType | Omit<IskraObisConfig, 'obisCode'>>,
) => {
  const obisConfigs: IskraObisConfig[] = Object.entries(config).map(([str, config]) => ({
    obisCode: str.startsWith('ignore') ? null : parseObisCodeFromString(str).obisCode,
    type: typeof config === 'string' ? config : config.type,
    convert: typeof config === 'object' && config.convert ? config.convert : undefined,
    test: typeof config === 'object' && config.test ? config.test : undefined,
  }));

  return makeDlmsPayload(name, {
    detector(dlms) {
      if (!isDlmsStructureLike(dlms)) {
        return false;
      }

      if (dlms.value.length !== obisConfigs.length) {
        return false;
      }

      for (let index = 0; index < obisConfigs.length; index++) {
        const item = dlms.value[index];

        if (!runTest(item, obisConfigs[index])) {
          return false;
        }
      }

      return true;
    },
    parser(dlms, result) {
      if (!isDlmsStructureLike(dlms)) {
        return false;
      }

      for (let index = 0; index < obisConfigs.length; index++) {
        const { obisCode } = obisConfigs[index];

        const value = dlms.value[index];

        if (!obisCode) {
          continue;
        }

        const converted = runConvert(value, obisConfigs[index]);

        parseDlmsCosem({
          result,
          obisCode,
          value: converted,
          unit: null,
          dlms: { useDefaultScalar: true },
        });
      }
    },
  });
};
