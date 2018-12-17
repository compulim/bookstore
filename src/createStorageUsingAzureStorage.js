import { EventEmitter } from 'events';
import PromisifiedBlobService from './PromisifiedBlobService';

const METADATA_SUMMARY_NAME = 'summary';

// function reduceMap(map, reducer, initialValue) {
//   return Object.keys(map).reduce((accumulator, currentKey) => reducer.call(map, accumulator, map[currentKey], currentKey), initialValue || map);
// }

// function mapMap(map, mapper) {
//   return reduceMap(map, (accumulator, currentValue, currentKey) => {
//     accumulator[currentKey] = mapper.call(map, currentValue, currentKey);

//     return accumulator;
//   }, {});
// }

class Storage extends EventEmitter {
  constructor(blobService, container) {
    super();

    this.blobService = blobService;
    this.container = container;
    this.promisifiedBlobService = new PromisifiedBlobService(blobService);

    (async () => {
      await this.promisifiedBlobService.createContainerIfNotExists(this.container, { publicAccessLevel: 'blob' });
      this.emit('ready');
    })()
  }

  async create(blob, content, summary) {
    await this.promisifiedBlobService.createBlockBlobFromText(
      this.container,
      blob,
      JSON.stringify(content),
      {
        metadata: {
          [METADATA_SUMMARY_NAME]: JSON.stringify(summary)
        }
      }
    );
  }

  async del(blob) {
    await this.promisifiedBlobService.deleteBlob(
      this.container,
      blob
    );
  }

  async listSummaries() {
    const { entries } = await this.promisifiedBlobService.listBlobsSegmented(
      this.container,
      null,
      { include: 'metadata' }
    );

    return entries.reduce(
      (
        result,
        { metadata: { [METADATA_SUMMARY_NAME]: summary }, name }
      ) => ({
        ...result,
        [name]: JSON.parse(summary)
      }),
      {}
    );
  }

  async _lock(blob) {
    const { id } = await this.promisifiedBlobService.acquireLease(
      this.container,
      blob,
      {}
    );

    return id;
  }

  async read(blob) {
    const {
      metadata: { [METADATA_SUMMARY_NAME]: summaryJSON },
      text: contentJSON
    } = await this.promisifiedBlobService.getBlobToText(
      this.container,
      blob,
      {}
    );

    return {
      content: JSON.parse(contentJSON),
      summary: JSON.parse(summaryJSON)
    };
  }

  async _unlock(blob, lockToken) {
    await this.promisifiedBlobService.releaseLease(
      this.container,
      blob,
      lockToken
    );
  }

  async update(blob, updater) {
    const lockToken = await this._lock(blob);

    try {
      const { content, summary } = await this.read(blob);
      const { content: nextContent, summary: nextSummary } = await updater(content, summary);

      await this.promisifiedBlobService.createBlockBlobFromText(
        this.container,
        blob,
        JSON.stringify(nextContent),
        {
          leaseId: lockToken,
          metadata: {
            [METADATA_SUMMARY_NAME]: JSON.stringify(nextSummary)
          }
        }
      );
    } finally {
      await this._unlock(blob, lockToken);
    }
  }
}

export default function (blobService, container) {
  return new Storage(blobService, container);
}
