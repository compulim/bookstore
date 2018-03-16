jest.mock('azure-storage-fs', () => {
  return {
    blob: (blobService, container) => ({
      promise: {
        readdir: async () => Object.keys(blobService.files).sort(),
        readFile: async (name, options = {}) => {
          const { data } = blobService.files[name] || {};

          if (data) {
            return options.encoding ? data.toString(options.encoding) : data;
          } else {
            throw new Error('not found');
          }
        },
        setMetadata: async (name, metadata) => {
          blobService.files[name].metadata = metadata;
        },
        stat: async (name, options) => ({
            ...(options.metadata ? { metadata: blobService.files[name].metadata } : {})
        }),
        unlink: async (name) => {
          delete blobService.files[name];
        },
        writeFile: async (name, data, options = {}) => {
          blobService.files[name] = {
            data: typeof data === 'string' ? new Buffer(data) : data,
            metadata: options.metadata || {}
          };
        },
      }
    })
  };
});

function mapMap(map, mapper) {
  return Object.keys(map).reduce((nextMap, key) => ({
    ...nextMap,
    [key]: mapper.call(map, map[key], key)
  }), {});
}

class MockBlobService {
  constructor() {
    this.createContainerIfNotExists = jest.fn().mockImplementation((container, callback) => callback());
  }

  get files() { return this._files; }
  set files(value) { this._files = value; }

  getFiles() {
    return mapMap(this.files, file => ({
      ...file,
      data: file.data.toString()
    }));
  }

  listBlobsSegmentedWithPrefix(container, prefix = '', currentToken, options, callback) {
    callback(null, {
      entries: Object.keys(this.files).reduce((entries, name) => {
        if (
          name.startsWith(prefix)
          && (!options.delimiter || name.substr(prefix.length).split(options.delimiter).length === 1)
        ) {
          entries.push({ metadata: this.files[name].metadata, name });
        }

        return entries;
      }, [])
    });
  }
}

export const blobService = new MockBlobService();
