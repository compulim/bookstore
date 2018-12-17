import createMultiplexedPubSub from './createMultiplexedPubSub';

test('Should subscribe on first subscribe', async () => {
  const metaPublish = jest.fn();
  const metaUnsubscribe = jest.fn();
  const metaSubscribe = jest.fn(() => metaUnsubscribe);
  const firstSubscribe = jest.fn();
  const { subscribe } = createMultiplexedPubSub(metaPublish, metaSubscribe);

  expect(metaSubscribe).not.toHaveBeenCalled();

  const unsubscribe = await subscribe('first', firstSubscribe);

  expect(metaSubscribe).toHaveBeenCalled();
  expect(metaUnsubscribe).not.toHaveBeenCalled();

  await unsubscribe();

  expect(metaUnsubscribe).toHaveBeenCalledTimes(1);
});

test('Should call publish after publish', async () => {
  const metaPublish = jest.fn();
  const metaUnsubscribe = jest.fn();
  const metaSubscribe = jest.fn(() => metaUnsubscribe);
  const firstSubscribe = jest.fn();
  const { publish, subscribe } = createMultiplexedPubSub(metaPublish, metaSubscribe, 'multiplex');

  await subscribe('first', firstSubscribe);
  await publish('first', 1);

  expect(metaPublish).toHaveBeenCalledWith('multiplex', { topic: 'first', payload: 1 });
});

describe('Integration tests', () => {
  let callbacks = [];
  let publish, subscribe;

  beforeEach(() => {
    const pubSub = createMultiplexedPubSub(
      (topic, payload) => {
        expect(topic).toBe('multiplex');
        callbacks.forEach(callback => callback(payload));
      },
      (topic, callback) => {
        expect(topic).toBe('multiplex');
        callbacks = [...callbacks, callback];

        return () => {
          callbacks = callbacks.filter(cb => cb !== callback);
        };
      },
      'multiplex'
    );

    publish = pubSub.publish;
    subscribe = pubSub.subscribe;
  });

  test('Happy path: 1 subscriber and 1 publish', async () => {
    const subscribeCallback = jest.fn();
    const unsubscribe = await subscribe('odd', subscribeCallback);

    expect(callbacks).toHaveProperty('length', 1);
    expect(subscribeCallback).not.toHaveBeenCalled();

    await publish('odd', 1);

    expect(subscribeCallback).toHaveBeenCalledTimes(1);
    expect(subscribeCallback).toHaveBeenCalledWith(1);

    await unsubscribe();

    expect(callbacks).toHaveProperty('length', 0);

    await publish('odd', 3);

    expect(subscribeCallback).toHaveBeenCalledTimes(1);
  });

  test('Happy path: 1 subscriber and 2 publishes', async () => {
    const subscribeCallback = jest.fn();
    const unsubscribe = await subscribe('odd', subscribeCallback);

    expect(callbacks).toHaveProperty('length', 1);
    expect(subscribeCallback).not.toHaveBeenCalled();

    await publish('odd', 1);

    expect(subscribeCallback).toHaveBeenCalledTimes(1);
    expect(subscribeCallback).toHaveBeenCalledWith(1);

    await publish('odd', 3);

    expect(subscribeCallback).toHaveBeenCalledTimes(2);
    expect(subscribeCallback).toHaveBeenCalledWith(3);

    await unsubscribe();

    expect(callbacks).toHaveProperty('length', 0);

    await publish('odd', 5);

    expect(subscribeCallback).toHaveBeenCalledTimes(2);
  });

  test('Happy path: 2 subscribers and 2 publishes', async () => {
    const evenSubscribeCallback = jest.fn();
    const evenUnsubscribe = await subscribe('even', evenSubscribeCallback);
    const oddSubscribeCallback = jest.fn();
    const oddUnsubscribe = await subscribe('odd', oddSubscribeCallback);

    expect(callbacks).toHaveProperty('length', 1);

    await publish('odd', 1);

    expect(oddSubscribeCallback).toHaveBeenCalledTimes(1);
    expect(oddSubscribeCallback).toHaveBeenCalledWith(1);

    expect(evenSubscribeCallback).toHaveBeenCalledTimes(0);

    await publish('even', 2);

    expect(oddSubscribeCallback).toHaveBeenCalledTimes(1);

    expect(evenSubscribeCallback).toHaveBeenCalledTimes(1);
    expect(evenSubscribeCallback).toHaveBeenCalledWith(2);

    await oddUnsubscribe();

    expect(callbacks).toHaveProperty('length', 1);

    await publish('odd', 3);
    await publish('even', 4);

    expect(oddSubscribeCallback).toHaveBeenCalledTimes(1);

    expect(evenSubscribeCallback).toHaveBeenCalledTimes(2);
    expect(evenSubscribeCallback).toHaveBeenCalledWith(4);

    await evenUnsubscribe();

    expect(callbacks).toHaveProperty('length', 0);
  });

  test('Happy path: Unsubscribe before publish', async () => {
    const subscribeCallback = jest.fn();
    const unsubscribe = await subscribe('odd', subscribeCallback);

    expect(callbacks).toHaveProperty('length', 1);

    await unsubscribe();

    expect(callbacks).toHaveProperty('length', 0);

    await publish('odd', 1);

    expect(subscribeCallback).not.toHaveBeenCalled();
  });

  test('Happy path: 0 subscribers and 1 publishes', async () => {
    expect(callbacks).toHaveProperty('length', 0);

    await publish('odd', 1);
  });
});
