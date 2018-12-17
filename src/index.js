import updateIn from 'simple-update-in';

import createPubSubUsingRedis from './createPubSubUsingRedis';
import createStorageUsingAzureStorage from './createStorageUsingAzureStorage';

export default async function (summarizer, facility, options = { cacheValidity: 10000 }) {
  let cached = {};
  let lastRefresh = 0;
  let subscriptions = [];

  const unsubscribe = await facility.subscribe(({ action, id, summary }) => {
    try {
      if (options.cacheValidity > 0) {
        switch (action) {
          case 'create':
          case 'update':
            cached = updateIn(cached, [id], () => summary);

            break;

          case 'delete':
            cached = updateIn(cached, [id]);

            break;
        }
      }

      subscriptions.forEach(subscription => subscription({ id, summary }));
    } catch (err) {
      console.error(err);
    }
  });

  const create = async (id, data) => {
    const summary = await summarizer(data);

    await facility.create(id, data, summary);

    if (options.cacheValidity > 0) {
      cached[id] = { ...cached[id], summary };
    }

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
  };

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
  };

  const list = async () => {
    let list;

    if (options.cacheValidity > 0 && Date.now() - lastRefresh <= options.cacheValidity) {
      list = cached;
    }

    if (!list) {
      list = await facility.list();

      if (options.cacheValidity > 0) {
        cached = list;
        lastRefresh = Date.now();
      }
    }

    return list;
  };

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
  };

  return {
    create,
    del,
    end,
    get,
    list,
    subscribe,
    update
  };
}

export {
  createPubSubUsingRedis,
  createStorageUsingAzureStorage
}
