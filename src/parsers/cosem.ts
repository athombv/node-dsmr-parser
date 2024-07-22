import { DSMRParserOptions, DSMRParserResult } from '../index.js';

export type COSEMDecoder = {
  regex: RegExp;
  parser: (regexResult: RegExpExecArray, result: DSMRParserResult, options: DSMRParserOptions) => any;
};

export const COSEM_PARSERS: COSEMDecoder[] = [
  {
    regex: /^1-3:0\.2\.8\((\d+)\)/,
    parser: (regexResult, result) => {
      const parsed = parseInt(regexResult[1], 10) / 10;
      result.metadata.dsmrVersion = parsed;
    }
  },
  {
    regex: /^0-0:1\.0\.0\((\w+)\)/,
    parser: (regexResult, result) => {
      result.metadata.timestamp = regexResult[1]; // TODO: Parse to date object
    },
  },
  {
    regex: /^0-0:96\.1\.1\((\w+)\)/,
    parser: (regexResult, result) => {
      result.metadata.equipmentId = regexResult[1];
    },
  },
  {
    regex: /^1-0:1\.8\.1\((\d+(\.\d+)?)\*kWh\)/,
    parser: (regexResult, result) => {
      result.electricity.tariff1 = result.electricity.tariff1 ?? {};
      result.electricity.tariff1.received = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:1\.8\.2\((\d+(\.\d+)?)\*kWh\)/,
    parser: (regexResult, result) => {
      result.electricity.tariff2 = result.electricity.tariff2 ?? {};
      result.electricity.tariff2.received = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:2\.8\.1\((\d+(\.\d+)?)\*kWh\)/,
    parser: (regexResult, result) => {
      result.electricity.tariff1 = result.electricity.tariff1 ?? {};
      result.electricity.tariff1.returned = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:2\.8\.2\((\d+(\.\d+)?)\*kWh\)/,
    parser: (regexResult, result) => {
      result.electricity.tariff2 = result.electricity.tariff2 ?? {};
      result.electricity.tariff2.returned = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^0-0:96\.14\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      result.electricity.currentTariff = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^1-0:1\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReturnedTotal = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:2\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReceivedTotal = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^0-0:96\.7\.21\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.powerFailures = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^0-0:96\.7\.9\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.longPowerFailures = parseInt(regexResult[1], 10);
    }
  },
  // 1-0:99.97.0
  {
    regex: /^1-0:32\.32\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
      result.metadata.events.voltageSags.l1 = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^1-0:52\.32\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
      result.metadata.events.voltageSags.l2 = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^1-0:72\.32\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSags = result.metadata.events.voltageSags ?? {};
      result.metadata.events.voltageSags.l3 = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^1-0:32\.36\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
      result.metadata.events.voltageSwells.l1 = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^1-0:52\.36\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
      result.metadata.events.voltageSwells.l2 = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^1-0:72\.36\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      result.metadata.events = result.metadata.events ?? {};
      result.metadata.events.voltageSwells = result.metadata.events.voltageSwells ?? {};
      result.metadata.events.voltageSwells.l3 = parseInt(regexResult[1], 10);
    }
  },
  {
    regex: /^0-0:96\.13\.0\((.+)\)/,
    parser: (regexResult, result) => {
      result.metadata.textMessage = regexResult[1];
    }
  },
  {
    regex: /^1-0:32\.7\.0\((\d+(\.\d+)?)\*V\)/,
    parser: (regexResult, result) => {
      result.electricity.voltage = result.electricity.voltage ?? {};
      result.electricity.voltage.l1 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:52\.7\.0\((\d+(\.\d+)?)\*V\)/,
    parser: (regexResult, result) => {
      result.electricity.voltage = result.electricity.voltage ?? {};
      result.electricity.voltage.l2 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:72\.7\.0\((\d+(\.\d+)?)\*V\)/,
    parser: (regexResult, result) => {
      result.electricity.voltage = result.electricity.voltage ?? {};
      result.electricity.voltage.l3 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:31\.7\.0\((\d+(\.\d+)?)\*A\)/,
    parser: (regexResult, result) => {
      result.electricity.current = result.electricity.current ?? {};
      result.electricity.current.l1 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:51\.7\.0\((\d+(\.\d+)?)\*A\)/,
    parser: (regexResult, result) => {
      result.electricity.current = result.electricity.current ?? {};
      result.electricity.current.l2 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:71\.7\.0\((\d+(\.\d+)?)\*A\)/,
    parser: (regexResult, result) => {
      result.electricity.current = result.electricity.current ?? {};
      result.electricity.current.l3 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:21\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReturned = result.electricity.powerReturned ?? {};
      result.electricity.powerReturned.l1 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:41\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReturned = result.electricity.powerReturned ?? {};
      result.electricity.powerReturned.l2 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:61\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReturned = result.electricity.powerReturned ?? {};
      result.electricity.powerReturned.l3 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:22\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReceived = result.electricity.powerReceived ?? {};
      result.electricity.powerReceived.l1 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:42\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReceived = result.electricity.powerReceived ?? {};
      result.electricity.powerReceived.l2 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^1-0:62\.7\.0\((\d+(\.\d+)?)\*kW\)/,
    parser: (regexResult, result) => {
      result.electricity.powerReceived = result.electricity.powerReceived ?? {};
      result.electricity.powerReceived.l3 = parseFloat(regexResult[1]);
    }
  },
  {
    regex: /^0-(\d):24\.1\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      const busId = parseInt(regexResult[1], 10);
      const typeId = parseInt(regexResult[2], 10);
      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].deviceType = typeId;
    },
  },
  {
    regex: /^0-(\d):96\.1\.0\((\d+)\)/,
    parser: (regexResult, result) => {
      const busId = parseInt(regexResult[1], 10);
      const equipmentId = regexResult[2];
      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].equipmentId = equipmentId;
    },
  },
  // {
  //   regex: /^0-\d:24\.2\.1\((\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d+)\*m3\)/,
  //   parser: (regexResult, result) => {
  //     const year = `20${regexResult[1]}`;
  //     const dateTime = new Date(`${year}-${regexResult[2]}-${regexResult[3]}T${regexResult[4]}:${regexResult[5]}:${regexResult[6]}Z`);
  //     result.mBus.valueTimestamp = dateTime.toISOString();
  //     result.mBus.value = parseFloat(regexResult[7]);
  //   }
  // },
  {
    regex: /^0-(\d):24\.2\.1\((\w+)\)\((\d+(\.\d+)?)\*(\w+)\)/,
    parser: (regexResult, result) => {
      console.log(regexResult)
      const busId = parseInt(regexResult[1], 10);
      const timestamp = regexResult[2];
      const value = parseFloat(regexResult[3]);
      const unit = regexResult[5];
      result.mBus[busId] = result.mBus[busId] ?? {};
      result.mBus[busId].timestamp = timestamp;
      result.mBus[busId].value = value;
      result.mBus[busId].unit = unit;
    }
  },
] as const;