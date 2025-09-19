import { makeIskraDlmsPayload } from './BaseIskraList.js';

export const DlmsPayloadECEList2 = makeIskraDlmsPayload('ECEList2', {
  '0-0:42.0.0': 'buffer',
  '0-0:96.1.3': 'buffer',
  '0-0:96.3.10': 'number',
  '0-0:96.14.0': {
    type: 'buffer',
    convert: ({ value }) => (Buffer.isBuffer(value) ? value.readUint16BE(0) : null),
  },
  '1-0:1.8.0': 'number',
  '1-0:1.8.1': 'number',
  '1-0:1.8.2': 'number',
  '1-0:2.8.0': 'number',
  '1-0:2.8.1': 'number',
  '1-0:2.8.2': 'number',
  '1-0:3.8.0': 'number',
  '1-0:4.8.0': 'number',
});
