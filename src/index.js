import updateIn from 'simple-update-in';

import createPubSubUsingRedis from './createPubSubUsingRedis';
import createStorageUsingAzureStorage from './createStorageUsingAzureStorage';

export default async function (summarizer, facility) {
  let subscribeAllPromise;
  let subscriptions = [];
  let unsubscribeAll;

  const create = async (id, data) => {
    const summary = await summarizer(data);

    await facility.create(id, data, summary);

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
    if (unsubscribeAll) {
      await unsubscribeAll();
      unsubscribeAll = null;
    }

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
    return await facility.list();
  };

  const subscribe = async listener => {
    if (!subscribeAllPromise) {
      subscribeAllPromise = facility.subscribe(({ id, summary }) => {
        subscriptions.forEach(subscription => subscription({ id, summary }));
      }).then(fn => unsubscribeAll = fn);
    }

    await subscribeAllPromise;

    subscriptions.push(listener);

    return async () => {
      const index = subscriptions.indexOf(listener);

      if (~index) {
        subscriptions = [...subscriptions];
        subscriptions.splice(index, 1);

        if (!subscriptions.length && unsubscribeAll) {
          await unsubscribeAll();
          unsubscribeAll = null;
        }
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
