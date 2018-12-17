import { promisify } from 'util';

export default function (publishRedis, subscribeRedis, topic) {
  let refCount = 0;
  const redisPublish = promisify(publishRedis.publish.bind(publishRedis));
  const redisSubscribe = promisify(subscribeRedis.subscribe.bind(subscribeRedis));
  const redisUnsubscribe = promisify(subscribeRedis.unsubscribe.bind(subscribeRedis));

  return {
    publish: async payload => await redisPublish(topic, JSON.stringify(payload)),
    subscribe: async callback => {
      const handler = (channel, json) => {
        channel === topic && callback(JSON.parse(json));
      };

      await redisSubscribe(topic);

      subscribeRedis.on('message', handler);
      refCount++;

      let unsubscribed;

      return async () => {
        if (!unsubscribed) {
          unsubscribed = true;
          subscribeRedis.removeListener('message', handler);

          if (--refCount < 1) {
            await redisUnsubscribe(topic);
          }
        }
      };
    }
  };
}
