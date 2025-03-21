import { DSMRParserOptions, DSMRParserResult } from '../index.js';

export type COSEMDecoder = {
  regex: RegExp;
  parser: (opts: {
    regexResult: RegExpExecArray;
    result: DSMRParserResult;
    options: DSMRParserOptions;
    line: string;
    lines: string[];
    lineNumber: number;
  }) => void;
};

export const COSEM_PARSERS: COSEMDecoder[] = [
  {
    regex: /^1-3:0\.2\.8\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      const parsed = parseInt(regexResult[1], 10) / 10;
      result.metadata.dsmrVersion = parsed;
    },
  },
  {
    regex: /^0-0:1\.0\.0\((\w+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.timestamp = regexResult[1]; // TODO: Parse to date object
    },
  },
  {
    regex: /^0-0:96\.1\.1\((\w+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.equipmentId = regexResult[1] ?? '';
    },
  },
  {
    regex: /^1-(\d):1\.8\.(\d+)\((\d+(\.\d+)?)\*kWh\)/,
    parser: ({ regexResult, result }) => {
      const tariff = parseInt(regexResult[2], 10);

      if (tariff === 0) {
        // This is the total received electricity
        result.electricity.total = result.electricity.total ?? {};
        result.electricity.total.received = parseFloat(regexResult[3]);
      } else {
        // This is a specific tariff
        result.electricity.tariffs = result.electricity.tariffs ?? {};
        result.electricity.tariffs[tariff] = result.electricity.tariffs[tariff] ?? {};
        result.electricity.tariffs[tariff].received = parseFloat(regexResult[3]);
      }
    },
  },
  {
    regex: /^1-(\d):2\.8\.(\d+)\((\d+(\.\d+)?)\*kWh\)/,
    parser: ({ regexResult, result }) => {
      const tariff = parseInt(regexResult[2], 10);

      if (tariff === 0) {
        // This is the total received electricity
        result.electricity.total = result.electricity.total ?? {};
        result.electricity.total.returned = parseFloat(regexResult[3]);
      } else {
        // This is a specific tariff
        result.electricity.tariffs = result.electricity.tariffs ?? {};
        result.electricity.tariffs[tariff] = result.electricity.tariffs[tariff] ?? {};
        result.electricity.tariffs[tariff].returned = parseFloat(regexResult[3]);
      }
    },
  },
  {
    regex: /^0-0:96\.14\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.currentTariff = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^1-(\d):1\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReceivedTotal = parseFloat(regexResult[2]);
    },
  },
  {
    regex: /^1-(\d):2\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReturnedTotal = parseFloat(regexResult[2]);
    },
  },
  {
    regex: /^0-0:96\.7\.21\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.powerFailures = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^0-0:96\.7\.9\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.longPowerFailures = parseInt(regexResult[1], 10);
    },
  },
  // 1-0:99.97.0
  {
    regex: /^1-0:32\.32\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
      result.metadata.events.voltageSags.l1 = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^1-0:52\.32\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
      result.metadata.events.voltageSags.l2 = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^1-0:72\.32\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
      result.metadata.events.voltageSags.l3 = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^1-0:32\.36\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
      result.metadata.events.voltageSwells.l1 = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^1-0:52\.36\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
      result.metadata.events.voltageSwells.l2 = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^1-0:72\.36\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
      result.metadata.events.voltageSwells.l3 = parseInt(regexResult[1], 10);
    },
  },
  {
    regex: /^0-0:96\.13\.0\((.+)?\)/,
    parser: ({ regexResult, result }) => {
      result.metadata.textMessage = regexResult[1] ?? '';
    },
  },
  {
    regex: /^0-0:96\.13\.1\((\d)?\)/,
    parser: ({ regexResult, result }) => {
      const numericMessage = parseInt(regexResult[1], 10);
      result.metadata.numericMessage = Number.isNaN(numericMessage) ? 0 : numericMessage;
    },
  },
  {
    regex: /^1-0:32\.7\.0\((\d+(\.\d+)?)\*V\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.voltage = result.electricity.voltage ?? {};
      result.electricity.voltage.l1 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:52\.7\.0\((\d+(\.\d+)?)\*V\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.voltage = result.electricity.voltage ?? {};
      result.electricity.voltage.l2 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:72\.7\.0\((\d+(\.\d+)?)\*V\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.voltage = result.electricity.voltage ?? {};
      result.electricity.voltage.l3 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:31\.7\.0\((\d+(\.\d+)?)\*A\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.current = result.electricity.current ?? {};
      result.electricity.current.l1 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:51\.7\.0\((\d+(\.\d+)?)\*A\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.current = result.electricity.current ?? {};
      result.electricity.current.l2 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:71\.7\.0\((\d+(\.\d+)?)\*A\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.current = result.electricity.current ?? {};
      result.electricity.current.l3 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:21\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReceived = result.electricity.powerReceived ?? {};
      result.electricity.powerReceived.l1 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:41\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReceived = result.electricity.powerReceived ?? {};
      result.electricity.powerReceived.l2 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:61\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReceived = result.electricity.powerReceived ?? {};
      result.electricity.powerReceived.l3 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:22\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReturned = result.electricity.powerReturned ?? {};
      result.electricity.powerReturned.l1 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:42\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReturned = result.electricity.powerReturned ?? {};
      result.electricity.powerReturned.l2 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^1-0:62\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: ({ regexResult, result }) => {
      result.electricity.powerReturned = result.electricity.powerReturned ?? {};
      result.electricity.powerReturned.l3 = parseFloat(regexResult[1]);
    },
  },
  {
    regex: /^0-(\d):24\.1\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      const busId = parseInt(regexResult[1], 10);
      const typeId = parseInt(regexResult[2], 10);
      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].deviceType = typeId;
    },
  },
  {
    regex: /^0-(\d):96\.1\.0\((\d+)\)/,
    parser: ({ regexResult, result }) => {
      const busId = parseInt(regexResult[1], 10);
      const equipmentId = regexResult[2];
      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].equipmentId = equipmentId;
    },
  },
  // {
  //   regex: /^0-\d:24\.2\.1\((\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d+)\*m3\)/,
  //   parser: ({ regexResult, result }) => {
  //     const year = `20${regexResult[1]}`;
  //     const dateTime = new Date(`${year}-${regexResult[2]}-${regexResult[3]}T${regexResult[4]}:${regexResult[5]}:${regexResult[6]}Z`);
  //     result.mBus.valueTimestamp = dateTime.toISOString();
  //     result.mBus.value = parseFloat(regexResult[7]);
  //   }
  // },
  {
    regex: /^0-(\d):24\.2\.1\((\w+)\)\((\d+(\.\d+)?)\*?(\w+)?\)/,
    parser: ({ regexResult, result }) => {
      const busId = parseInt(regexResult[1], 10);
      const timestamp = regexResult[2];
      const value = parseFloat(regexResult[3]);
      const unit = regexResult[5];
      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].timestamp = timestamp;
      result.mBus[busId].value = value;
      result.mBus[busId].unit = unit;
    },
  },
  // This is the gas/water data for Belgium/eMUCS meters
  {
    regex: /^0-(\d):24\.2\.3\((\w+)\)\((\d+(\.\d+)?)\*(\w+)\)/,
    parser: ({ regexResult, result }) => {
      const busId = parseInt(regexResult[1], 10);
      const timestamp = regexResult[2];
      const value = parseFloat(regexResult[3]);
      const unit = regexResult[5];
      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].timestamp = timestamp;
      result.mBus[busId].value = value;
      result.mBus[busId].unit = unit;
    },
  },
  // Gas report for DSMR 3 meters.
  // This is a bit off an odd one, as it's a two line parser.
  // 0-1:24.3.0(090212160000)(00)(60)(1)(0-1:24.2.1)(m3)
  // (00000.000)
  {
    regex: /^0-(\d):24\.3\.0\((\w+)\)\((\d+)\)\((\d+)\)\((\d)\)\((0-\d:24\.2\.1)\)\((\w+)\)/,
    parser({ regexResult, result, lines, lineNumber }) {
      const busId = parseInt(regexResult[1], 10);
      const timestamp = regexResult[2];
      const recordingPeriodMinutes = parseInt(regexResult[4], 10);
      const unit = regexResult[7];
      const nextLine = lines[lineNumber + 1];

      if (!nextLine) {
        return;
      }

      const valueRegex = /\((\d+(\.\d+)?)\)/;
      const valueMatch = valueRegex.exec(nextLine);

      if (!valueMatch) {
        return;
      }

      const value = parseFloat(valueMatch[1]);

      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].timestamp = timestamp;
      result.mBus[busId].value = value;
      result.mBus[busId].unit = unit;
      result.mBus[busId].value = value;
      result.mBus[busId].recordingPeriodMinutes = recordingPeriodMinutes;
    },
  },
] as const;
