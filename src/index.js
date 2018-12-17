import { EventEmitter } from 'events';
import updateIn from 'simple-update-in';

import createPubSubUsingRedis from './createPubSubUsingRedis';
import createStorageUsingAzureStorage from './createStorageUsingAzureStorage';

const SUMMARY_VALIDITY = 10000;

class Bookstore extends EventEmitter {
  constructor(
    summarizer,
    {
      publish,
      storage,
      subscribe
    }
  ) {
    super();

    this._cached = {};

    this.publish = publish;
    this.storage = storage;
    this.subscribe = subscribe;
    this.summarizer = summarizer;

    this._ready = this.subscribe(this.handleMessage.bind(this)).then(unsubscribe => this.unsubscribe = unsubscribe);

    this._lastRefresh = 0;
  }

  async create(id, data) {
    const summary = await this.summarizer(data);

    await this.storage.create(id, data, summary);

    this._cached[id] = { ...this._cached[id], summary };

    await this.publish({
      action: 'create',
      id,
      summary
    });
  }

  async del(id) {
    await this._ready;
    await this.storage.del(id);

    await this.publish({
      action: 'delete',
      id
    });
  }

  async end() {
    await this._ready;
    await this.unsubscribe();
  }

  async fetch(id) {
    await this._ready;

    try {
      const { content } = await this.storage.read(id);

      return content;
    } catch (err) {
      if (err.code === 'BlobNotFound') {
        return;
      } else {
        throw err;
      }
    }
  }

  handleMessage({ action, id, summary }) {
    try {
      switch (action) {
        case 'create':
        case 'update':
          this._cached = updateIn(this._cached, [id, 'from'], () => 'redis');
          this._cached = updateIn(this._cached, [id, 'summary'], () => summary);

          this.emit('change', { id });

          break;

        case 'delete':
          this._cached = updateIn(this._cached, [id]);

          this.emit('change', { id });

          break;
      }
    } catch (err) {
      console.error(err);
    }
  }

  async list() {
    await this._ready;

    if (Date.now() - this._lastRefresh > SUMMARY_VALIDITY) {
      await this.refresh();
    }

    return this._cached;
  }

  async refresh() {
    await this._ready;

    const summaries = await this.storage.listSummaries();
    const nextCached = {};

    Object.keys(summaries).forEach(id => {
      const summary = summaries[id];

      nextCached[id] = {
        ...this._cached[id],
        from: 'blob',
        summary
      };
    });

    this._cached = nextCached;
    this._lastRefresh = Date.now();
  }

  async update(id, updater) {
    await this._ready;

    let nextSummary;

    await this.storage.update(id, async content => {
      const nextContent = await updater(content);

      nextSummary = await this.summarizer(nextContent);

      return {
        content: nextContent,
        summary: nextSummary
      };
    });

    await this.publish({
      action: 'update',
      id,
      summary: nextSummary
    });
  }
}

export default function (
  summarizer,
  {
    publish,
    storage,
    subscribe
  }
) {
  return new Bookstore(
    summarizer,
    {
      publish,
      storage,
      subscribe
    }
  );
}

export {
  createPubSubUsingRedis,
  createStorageUsingAzureStorage
}
