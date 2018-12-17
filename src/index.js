import updateIn from 'simple-update-in';

import createPubSubUsingRedis from './createPubSubUsingRedis';
import createStorageUsingAzureStorage from './createStorageUsingAzureStorage';

const SUMMARY_VALIDITY = 10000;

export default async function (summarizer, facility) {
  let cached = {};
  let lastRefresh = 0;
  let subscriptions = [];

  const unsubscribe = await facility.subscribe(({ action, id, summary }) => {
    try {
      switch (action) {
        case 'create':
        case 'update':
          cached = updateIn(cached, [id, 'from'], () => 'redis');
          cached = updateIn(cached, [id, 'summary'], () => summary);

          break;

        case 'delete':
          cached = updateIn(cached, [id]);

          break;
      }

      subscriptions.forEach(subscription => subscription({ id }));
    } catch (err) {
      console.error(err);
    }
  });

  const create = async (id, data) => {
    const summary = await summarizer(data);

    await facility.create(id, data, summary);

    cached[id] = { ...cached[id], summary };

    await facility.publish({
      action: 'create',
      id,
      summary
    });
  };

  const del = async id => {
    await facility.del(id);

    await facility.publish({
      action: 'delete',
      id
    });
  }

  const end = async () => {
    await unsubscribe();

    cached = {};
    subscriptions = [];
  };

  const get = async id => {
    try {
      const { content } = await facility.get(id);

      return content;
    } catch (err) {
      if (err.code === 'BlobNotFound') {
        return;
      } else {
        throw err;
      }
    }
  }

  const list = async () => {
    if (Date.now() - lastRefresh > SUMMARY_VALIDITY) {
      await refresh();
    }

    return cached;
  }

  const refresh = async () => {
    const summaries = await facility.list();
    const nextCached = {};

    Object.keys(summaries).forEach(id => {
      const summary = summaries[id];

      nextCached[id] = {
        ...cached[id],
        from: 'blob',
        summary
      };
    });

    cached = nextCached;
    lastRefresh = Date.now();
  }

  const subscribe = listener => {
    subscriptions.push(listener);

    return () => {
      const index = subscriptions.indexOf(listener);

      if (~index) {
        subscriptions = [...subscriptions];
        subscriptions.splice(index, 1);
      }
    };
  };

  const update = async (id, updater) => {
    let prevSummary;
    let nextSummary;

    await facility.update(id, async (content, summary) => {
      const nextContent = await updater(content);

      prevSummary = summary;
      nextSummary = nextContent === content ? summary : await summarizer(nextContent);

      return {
        content: nextContent,
        summary: nextSummary
      };
    });

    // TODO: Use a deep equality function instead of JSON.stringify
    if (JSON.stringify(prevSummary) !== JSON.stringify(nextSummary)) {
      await facility.publish({
        action: 'update',
        id,
        summary: nextSummary
      });
    }
  }

  return {
    create,
    del,
    end,
    get,
    list,
    refresh,
    subscribe,
    update
  };
}

export {
  createPubSubUsingRedis,
  createStorageUsingAzureStorage
}
