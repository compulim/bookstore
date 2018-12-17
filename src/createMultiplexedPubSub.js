import updateIn from 'simple-update-in';

export default function (publish, subscribe, multiplexChannelName = 'multiplex') {
  let channelCallbacks = {};
  let multiplexUnsubscribe;

  return {
    publish: async (topic, payload) => await publish(multiplexChannelName, { topic, payload }),
    subscribe: async (topic, callback) => {
      (channelCallbacks[topic] || (channelCallbacks[topic] = [])).push(callback);

      if (!multiplexUnsubscribe) {
        multiplexUnsubscribe = await subscribe(multiplexChannelName, ({ topic, payload }) => {
          (channelCallbacks[topic] || []).forEach(client => client(payload));
        });
      }

      return async () => {
        channelCallbacks = updateIn(channelCallbacks, [topic], callbacks => {
          const nextCallbacks = callbacks.filter(cb => cb !== callback);

          if (nextCallbacks.length) {
            return nextCallbacks;
          }
        });

        if (!Object.keys(channelCallbacks).length) {
          await multiplexUnsubscribe();
          multiplexUnsubscribe = null;
        }
      };
    }
  };
}
