export type BaseParserResult = {
  cosem: {
    knownObjects: string[];
    unknownObjects: string[];
  };
  metadata: {
    dsmrVersion?: number;
    timestamp?: Date | string;
    equipmentId?: string;
    events?: {
      powerFailures?: number;
      longPowerFailures?: number;
      voltageSags?: {
        l1?: number;
        l2?: number;
        l3?: number;
      };
      voltageSwells?: {
        l1?: number;
        l2?: number;
        l3?: number;
      };
    };
    textMessage?: string;
    numericMessage?: number;
  };
  electricity: {
    total?: {
      received?: number;
      returned?: number;
      reactiveReturned?: number;
      reactiveReceived?: number;
    };
    tariffs?: Partial<
      Record<
        number,
        {
          received?: number;
          returned?: number;
          reactiveReturned?: number;
          reactiveReceived?: number;
        }
      >
    >;
    currentTariff?: number;
    voltage?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    current?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    powerReturnedTotal?: number;
    powerReturned?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    powerReceivedTotal?: number;
    powerReceived?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    reactivePowerReturnedTotal?: number;
    reactivePowerReturned?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    reactivePowerReceivedTotal?: number;
    reactivePowerReceived?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
  };
  mBus: Record<
    number,
    {
      deviceType?: number;
      equipmentId?: string;
      value?: number;
      unit?: string;
      timestamp?: Date | string;
      recordingPeriodMinutes?: number; // DSMR
    }
  >;
  /** Only set when encryption is used */
  additionalAuthenticatedDataValid?: boolean;
};
