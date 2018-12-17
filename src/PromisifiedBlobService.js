// https://docs.microsoft.com/en-us/javascript/api/azure-storage/azurestorage.services.blob.blobservice.blobservice?view=azure-node-latest

class PromisifiedBlobService {
  constructor(blobService) {
    this.blobService = blobService;
  }

  acquireLease(container, blob, options) {
    return new Promise((resolve, reject) =>
      this.blobService.acquireLease(
        container,
        blob,
        options,
        (err, result) => err ? reject(err) : resolve(result)
      )
    );
  }

  createBlockBlobFromText(container, blob, text, options) {
    return new Promise((resolve, reject) => {
      this.blobService.createBlockBlobFromText(
        container,
        blob,
        text,
        options,
        (err, result) => err ? reject(err) : resolve(result)
      )
    });
  }

  createContainerIfNotExists(container, options) {
    return new Promise((resolve, reject) => {
      this.blobService.createContainerIfNotExists(
        container,
        options,
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
  }

  deleteBlob(container, blob) {
    return new Promise((resolve, reject) => {
      this.blobService.deleteBlob(
        container,
        blob,
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
  }

  deleteContainerIfExists(container, options) {
    return new Promise((resolve, reject) => {
      this.blobService.deleteContainerIfExists(
        container,
        options,
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
  }

  getBlobToText(container, blob, options) {
    return new Promise((resolve, reject) => {
      this.blobService.getBlobToText(
        container,
        blob,
        options,
        (err, text, response) => err ? reject(err) : resolve({ metadata: response && response.metadata, text })
      );
    });
  }

  listBlobsSegmented(container, currentToken, options) {
    return new Promise((resolve, reject) => {
      this.blobService.listBlobsSegmented(
        container,
        currentToken,
        options,
        (err, entries) => err ? reject(err) : resolve(entries)
      );
    });
  }

  releaseLease(container, blob, leaseID) {
    return new Promise((resolve, reject) => {
      this.blobService.releaseLease(
        container,
        blob,
        leaseID,
        (err, result) => err ? reject(err) : resolve(result)
      );
    });
  }

  // getBlobMetadata(container, blob) {
  //   return new Promise((resolve, reject) => {
  //     this.blobService.getBlobMetadata(
  //       container,
  //       blob,
  //       (err, { metadata }) => err ? reject(err) : resolve(metadata)
  //     );
  //   });
  // }

  // setBlobMetadata(container, blob, metadata, options) {
  //   return new Promise((resolve, reject) => {
  //     this.blobService.setBlobMetadata(
  //       container,
  //       blob,
  //       metadata,
  //       options,
  //       (err, result) => err ? reject(err) : resolve(result)
  //     );
  //   });
  // }
}

export default function (blobService) {
  return new PromisifiedBlobService(blobService);
}
