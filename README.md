# DSMR Parser

[![Test](https://github.com/athombv/node-dsmr-parser/actions/workflows/test.yml/badge.svg)](https://github.com/athombv/node-dsmr-parser/actions/workflows/test.yml)
[![Build](https://github.com/athombv/node-dsmr-parser/actions/workflows/build.yml/badge.svg)](https://github.com/athombv/node-dsmr-parser/actions/workflows/build.yml)

This module can parse Dutch Smart Meter Requirements (DSMR) messages, and return their contents as JavaScript Objects.

## Installation

```bash
$ npm i @athombv/dsmr-parser
```

## Examples

### Parsing a DSMR frame

```javascript
import { DSMR } from '@athombv/dsmr-parser';

try {
  const result = DSMR.parse({
    telegram: `/ISk5\2MT382-1000

1-3:0.2.8(50)
0-0:1.0.0(101209113020W)
0-0:96.1.1(4B384547303034303436333935353037)
1-0:1.8.1(123456.789*kWh)
1-0:1.8.2(123456.789*kWh)
1-0:2.8.1(123456.789*kWh)
1-0:2.8.2(123456.789*kWh)
0-0:96.14.0(0002)
1-0:1.7.0(01.193*kW)
1-0:2.7.0(00.000*kW)
0-0:96.7.21(00004)
0-0:96.7.9(00002)
1-0:99.97.0(2)(0-0:96.7.19)(101208152415W)(0000000240*s)(101208151004W)(0000000301*s)
1-0:32.32.0(00002)
1-0:52.32.0(00001)
1-0:72.32.0(00000)
1-0:32.36.0(00000)
1-0:52.36.0(00003)
1-0:72.36.0(00000)
0-0:96.13.0(303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F)
1-0:32.7.0(220.1*V)
1-0:52.7.0(220.2*V)
1-0:72.7.0(220.3*V)
1-0:31.7.0(001*A)
1-0:51.7.0(002*A)
1-0:71.7.0(003*A)
1-0:21.7.0(01.111*kW)
1-0:41.7.0(02.222*kW)
1-0:61.7.0(03.333*kW)
1-0:22.7.0(04.444*kW)
1-0:42.7.0(05.555*kW)
1-0:62.7.0(06.666*kW)
0-1:24.1.0(003)
0-1:96.1.0(3232323241424344313233343536373839)
0-1:24.2.1(101209112500W)(12785.123*m3)
!EF2F
`,
    decryptionKey: '...', // Only for Luxembourg
  });

  console.log('Result:', result);
} catch (err) {
  console.error(`Error Parsing DSMR Telegram: ${err.message}`);
}
```

Will result in the following log:

```log
Result: {
  header: { identifier: '\\2MT382-1000r', xxx: 'ISk', z: '5' },
  metadata: {
    dsmrVersion: 5,
    timestamp: '101209113020W',
    equipmentId: '4B384547303034303436333935353037',
    events: {
      powerFailures: 4,
      longPowerFailures: 2,
      voltageSags: { l1: 2, l2: 1, l3: 0 },
      voltageSwells: { l1: 0, l2: 3, l3: 0 }
    },
    unknownLines: [
      '1-0:99.97.0(2)(0-0:96.7.19)(101208152415W)(0000000240*s)(101208151004W)(0000000301*s)'
    ],
    textMessage: '303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F303132333435363738393A3B3C3D3E3F'
  },
  electricity: {
    tariff1: { received: 123456.789, returned: 123456.789 },
    tariff2: { received: 123456.789, returned: 123456.789 },
    currentTariff: 2,
    powerReturnedTotal: 1.193,
    powerReceivedTotal: 0,
    voltage: { l1: 220.1, l2: 220.2, l3: 220.3 },
    current: { l1: 1, l2: 2, l3: 3 },
    powerReturned: { l1: 1.111, l2: 2.222, l3: 3.333 },
    powerReceived: { l1: 4.444, l2: 5.555, l3: 6.666 }
  },
  mBus: {
    '1': {
      deviceType: 3,
      equipmentId: '3232323241424344313233343536373839',
      timestamp: '101209112500W',
      value: 12785.123,
      unit: 'm3'
    }
  },
  crc: { value: 61231, valid: false }
}
```

### Connecting Homey Energy Dongle using USB

When you connect a PC to Homey Energy Dongle, you can read the raw data from the meter from Homey Energy Dongle's USB port. An example
script of how to do this is located in [`examples/homey-energy-dongle-usb.js`](./examples/homey-energy-dongle-usb.js). To run this example you need to:

1. Have NodeJS and git installed on your system
2. Open a terminal window
3. Clone this repository

```sh
git clone https://github.com/athombv/node-dsmr-parser
```

4. Install the dependencies and build the project

```sh
cd node-dsmr-parser
npm ci
npm run build
```

5. Connect Homey Energy Dongle to a Smart Meter
6. Connect the USB-C port of Homey Energy Dongle to your PC
7. Run the example script:

```sh
node examples/homey-energy-dongle-usb.js
```

If the data from your meter is encrypted, you'll need to provide the decryption key and the specific serial port to connect to. For example:

```sh
node examples/homey-energy-dongle-usb.js /dev/tty.usbmodem101 1234567890123456
```

### Connection Homey Energy Dongle using WebSocket

Homey Energy Dongle has a Local WebSocket API. An example script of how to use this Local API is located in [`examples/homey-energy-dongle-ws.js`](./examples/homey-energy-dongle-ws.js).
To run this example, you need to:

1. Have NodeJS and git installed on your system
2. Open a terminal window
3. Clone this repository

```sh
git clone https://github.com/athombv/node-dsmr-parser
```

4. Install the dependencies and build the project

```sh
cd node-dsmr-parser
npm ci
npm run build
```

5. Connect Homey Energy Dongle to a Smart Meter
6. Set up Homey Energy Dongle in the Homey app
7. Enable the Local API in Homey Energy Dongle's settings in Homey
   - You can also find Homey Energy Dongle's IP address here
8. Run the example script:

```sh
node examples/homey-energy-dongle-ws.js <ip> <decryption key (optional)>
```
