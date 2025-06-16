# DSMR Parser

[![Test](https://github.com/athombv/node-dsmr-parser/actions/workflows/test.yml/badge.svg)](https://github.com/athombv/node-dsmr-parser/actions/workflows/test.yml)
[![Build](https://github.com/athombv/node-dsmr-parser/actions/workflows/build.yml/badge.svg)](https://github.com/athombv/node-dsmr-parser/actions/workflows/build.yml)

This module can parse Smart Meter P1 messages, and return their contents as JavaScript Objects.

This module supports the following protocols:

- DSMR (Dutch Smart Meter Requirements)
  - Or derivatives of DSMR. Such as:
    - ESMR (European Smart Meter Requirements)
    - eMUCS P1 (Belgian Smart Meters)
    - E Meter P1 (Luxembourg's Smart Meters)
- DLMS/COSEM:
  - Using HDLC as transport layer
  - Can be used by Smart Meters in the Nordics

## Installation

```bash
$ npm i @athombv/dsmr-parser
```

## Examples

To learn how to parse a data frames from a Smart Meter, please checkout the examples in the [`examples`](./examples/) directory.

### Detecting the user protocol

If you don't know which protocol is used by your Smart Meter, it is possible to detect which protocol is used.
An example of how to do this is located in [`examples/discover-protocol.js`](./examples/discover-protocol.js).

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
   - Replace `<mode>` with either `dsmr` or `dlms` to use either the DSMR or DLMS/COSEM protocol.

```sh
node examples/homey-energy-dongle-usb.js <mode>
```

If the data from your meter is encrypted, you'll need to provide the decryption key and the specific serial port to connect to. For example:

```sh
node examples/homey-energy-dongle-usb.js dsmr /dev/tty.usbmodem101 1234567890123456
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
   - `mode` must be either `dsmr` or `dlms` to use either the DSMR or DLMS/COSEM protocol.

```sh
node examples/homey-energy-dongle-ws.js <mode> <ip> <decryption key (optional)>
```
