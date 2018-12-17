import PromisifiedBlobService from './PromisifiedBlobService';

const METADATA_SUMMARY_NAME = 'summary';

export default function (blobService, container) {
  const promisifiedBlobService = new PromisifiedBlobService(blobService);

  const create = async (blob, content, summary) => {
    await promisifiedBlobService.createBlockBlobFromText(
      container,
      blob,
      JSON.stringify(content),
      {
        metadata: {
          [METADATA_SUMMARY_NAME]: JSON.stringify(summary)
        }
      }
    );
  };

  const del = async blob => {
    await promisifiedBlobService.deleteBlob(
      container,
      blob
    );
  };

  const get = async blob => {
    const {
      metadata: { [METADATA_SUMMARY_NAME]: summaryJSON },
      text: contentJSON
    } = await promisifiedBlobService.getBlobToText(
      container,
      blob,
      {}
    );

    return {
      content: JSON.parse(contentJSON),
      summary: JSON.parse(summaryJSON)
    };
  };

  const list = async () => {
    const { entries } = await promisifiedBlobService.listBlobsSegmented(
      container,
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
  };

  const lock = async blob => {
    const { id } = await promisifiedBlobService.acquireLease(
      container,
      blob,
      {}
    );

    return id;
  };

  const unlock = async (blob, lockToken) => {
    await promisifiedBlobService.releaseLease(
      container,
      blob,
      lockToken
    );
  };

  const update = async (blob, updater) => {
    const lockToken = await lock(blob);

    try {
      const { content, summary } = await get(blob);
      const { content: nextContent, summary: nextSummary } = await updater(content, summary);

      if (
        nextContent !== content
        || nextSummary !== summary
      ) {
        await promisifiedBlobService.createBlockBlobFromText(
          container,
          blob,
          JSON.stringify(nextContent),
          {
            leaseId: lockToken,
            metadata: {
              [METADATA_SUMMARY_NAME]: JSON.stringify(nextSummary)
            }
          }
        );
      }
    } finally {
      await unlock(blob, lockToken);
    }
  };

  return {
    create,
    del,
    get,
    list,
    update
  };
}
