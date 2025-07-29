import { ParsedDlmsData } from '../dlms-datatype.js';
import { HdlcParserResult } from '../hdlc.js';
import { DlmsPayloadBasicList } from './BasicList.js';
import { DlmsPayloadBasicStructure } from './BasicStructure.js';
import { DlmsPayloadDescribedList } from './DescribedList.js';
import type { makeDlmsPayload } from './dlms-payload.js';
import { DlmsPayloadIskraList } from './IskraList.js';

class DlmsPayloadsInternal {
  payloadDecoders: ReturnType<typeof makeDlmsPayload>[] = [];

  addPayload(payloadHandler: ReturnType<typeof makeDlmsPayload>) {
    this.payloadDecoders.push(payloadHandler);
    return this;
  }

  parse(dlms: ParsedDlmsData, result: HdlcParserResult) {
    for (const payload of this.payloadDecoders) {
      if (payload.detector(dlms)) {
        payload.parser(dlms, result);
        return payload.name;
      }
    }

    throw new Error('No matching DLMS payload found');
  }
}

export const DlmsPayloads = new DlmsPayloadsInternal()
  .addPayload(DlmsPayloadBasicList)
  .addPayload(DlmsPayloadBasicStructure)
  .addPayload(DlmsPayloadDescribedList)
  .addPayload(DlmsPayloadIskraList);
