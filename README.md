# DSMR Parser

This module can parse Dutch Smart Meter Requirements (DSMR) messages, and return their contents as JavaScript Objects.

## Installation

```bash
$ npm i @athombv/dsmr-parser
```

## Example

```javascript
import { DSMRParser } from '@athombv/dsmr-parser';

try {
  const result = DSMRParser.parse({
    telegram: `/Ene5\T211 ESMR 5.0
      1-3:0.2.8(50)
      0-0:1.0.0(240220170958W)
      0-0:96.1.1(4530303632303030303134353236323233)
      1-0:1.8.1(000565.971*kWh)
      1-0:1.8.2(000694. 269*kWh)
      1-0:2.8.1(000006.754*kWh)
      1-0:2.8.2(000007. 849*kWh)
      0-0:96.14.0(0002)
      1-0:1.7.0000.723*kW)
      1-0:2.7.0000.000*kW)
      0-0:96.7.21(00010)
      0-0:96.7.9(00003)
      1-0:99.97.0(0)(0-0:96.7.19)
      1-0:32.32.0(00001)
      1-0:52.32.0(00001)
      1-0:72.32.0(00001)
      1-0:32.36.0(00000)
      1-0:52.36.0(00000)
      1-0:72.36.0(00000)
      0-0:96.13.00
      1-0: 32.7.0(226.0*V)
      1-0:52.7.0（225.0*V）
      1-0:72.7.0（226.0*V）
      1-0:31.7.0(003*A)
      1-0:51.7.0(000*A)
      1-0:71.7.0(000*A)
      1-0:21.7.000.654*kW)
      1-0:41.7.0(00.069*kW)
      1-0:61.7.0(00.000*kW)
      1-0:42.1.0000.000"kW)
      1-0:42.7.0(00. 000*kW)
      1-0:62.7.0000.000*kW)
      0-1:24.1.0(003)
      0-1:96.1.0(4730303732303033393634343938373139)
      0-1:24.2.1(240220171000W)(06362.120*m3)
      !B788`,
    decryptionKey: '...', // Only for Luxembourgh
  });

  console.log('Result:', result); // TODO: Add to this README
} catch(err) {
  console.error(`Error Parsing DSMR Telegram: ${err.message}`);
}
```