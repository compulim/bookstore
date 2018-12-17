import { createClient } from 'redis';
import hasResolved from 'has-resolved';

import createPromiseQueue from './utils/createPromiseQueue';
import createPubSubUsingRedis from './createPubSubUsingRedis';

describe('Integration tests with Redis', async () => {
  let publishRedis, subscribeRedis;
  let evenPublish, evenSubscribe, oddPublish, oddSubscribe;

  beforeEach(async () => {
    publishRedis = createClient();
    subscribeRedis = createClient();

    await Promise.all([
      new Promise(resolve => publishRedis.on('ready', resolve)),
      new Promise(resolve => subscribeRedis.on('ready', resolve))
    ]);

    const evenPubSub = createPubSubUsingRedis(publishRedis, subscribeRedis, 'even');
    const oddPubSub = createPubSubUsingRedis(publishRedis, subscribeRedis, 'odd');

    evenPublish = evenPubSub.publish;
    evenSubscribe = evenPubSub.subscribe;
    oddPublish = oddPubSub.publish;
    oddSubscribe = oddPubSub.subscribe;
  });

  afterEach(() => {
    publishRedis.quit();
    subscribeRedis.unsubscribe();
    subscribeRedis.quit();
  });

  test('Happy path: 1 subscriber and 1 publish', async () => {
    const subscribeQueue = createPromiseQueue();

    await oddSubscribe(subscribeQueue.push);
    await oddPublish(1);

    await expect(subscribeQueue.shift()).resolves.toBe(1);
  });

  test('Happy path: 1 subscriber and 2 publishes', async () => {
    const subscribeQueue = createPromiseQueue();

    await oddSubscribe(subscribeQueue.push);
    await oddPublish(1);
    await oddPublish(3);

    await expect(subscribeQueue.shift()).resolves.toBe(1);
    await expect(subscribeQueue.shift()).resolves.toBe(3);
  });

  test('Happy path: 2 subscribers and 2 publishes', async () => {
    const evenSubscribeQueue = createPromiseQueue();
    const oddSubscribeQueue = createPromiseQueue();
    const oddUnsubscribe = await oddSubscribe(oddSubscribeQueue.push);

    await evenSubscribe(evenSubscribeQueue.push);

    await oddPublish(1);
    await evenPublish(2);

    await expect(oddSubscribeQueue.shift()).resolves.toBe(1);
    await expect(evenSubscribeQueue.shift()).resolves.toBe(2);

    await oddUnsubscribe();

    await oddPublish(3);
    await evenPublish(4);

    await expect(evenSubscribeQueue.shift()).resolves.toBe(4);
    await expect(hasResolved(oddSubscribeQueue.shift())).resolves.toBeFalsy();
  });

  test('Happy path: Unsubscribe before publish', async () => {
    const subscribeQueue = createPromiseQueue();
    const oddUnsubscribe = await oddSubscribe(subscribeQueue.push);

    await oddUnsubscribe();
    await oddPublish(1);

    await expect(hasResolved(subscribeQueue.shift())).resolves.toBeFalsy();
  });

  test('Happy path: 0 subscribers and 1 publishes', async () => {
    oddPublish(1);
  });

  test('Happy path: 2 subscribers of same channel and 3 publishes', async () => {
    const subscribe1Queue = createPromiseQueue();
    const subscribe2Queue = createPromiseQueue();

    const oddUnsubscribe1 = await oddSubscribe(subscribe1Queue.push);
    const oddUnsubscribe2 = await oddSubscribe(subscribe2Queue.push);

    await oddPublish(1);

    await expect(subscribe1Queue.shift()).resolves.toBe(1);
    await expect(subscribe2Queue.shift()).resolves.toBe(1);

    await oddUnsubscribe1();
    await oddPublish(3);

    await expect(hasResolved(subscribe1Queue.shift())).resolves.toBeFalsy();
    await expect(subscribe2Queue.shift()).resolves.toBe(3);

    await oddUnsubscribe2();
    await oddPublish(5);

    await expect(hasResolved(subscribe1Queue.shift())).resolves.toBeFalsy();
    await expect(hasResolved(subscribe2Queue.shift())).resolves.toBeFalsy();
  });
});

describe('Integration tests with mock', async () => {
  let evenPublish, evenSubscribe, oddPublish, oddSubscribe;
  let messageListeners;
  let subscribedChannels;

  beforeEach(() => {
    messageListeners = [];
    subscribedChannels = new Set();

    const redisPublish = {
      publish: jest.fn(async (channel, payload, callback) => {
        expect(typeof channel).toBe('string');
        expect(typeof payload).toBe('string');

        subscribedChannels.has(channel) && messageListeners.forEach(callback => callback(channel, payload));
        callback();
      })
    };

    const redisSubscribe = {
      on: jest.fn((event, handler) => {
        expect(event).toBe('message');
        messageListeners.push(handler);
      }),
      removeListener: jest.fn((event, handler) => {
        expect(event).toBe('message');
        expect(messageListeners.includes(handler));

        messageListeners = messageListeners.filter(h => h !== handler);
      }),
      subscribe: jest.fn((...channels) => {
        const callback = typeof channels[channels.length - 1] === 'function' ? channels.pop() : null;

        channels.forEach(channel => subscribedChannels.add(channel));
        callback && callback();
      }),
      unsubscribe: jest.fn((...channels) => {
        const callback = typeof channels[channels.length - 1] === 'function' ? channels.pop() : null;

        channels.forEach(channel => subscribedChannels.delete(channel));
        callback && callback();
      })
    };

    const evenPubSub = createPubSubUsingRedis(redisPublish, redisSubscribe, 'even');
    const oddPubSub = createPubSubUsingRedis(redisPublish, redisSubscribe, 'odd');

    evenPublish = evenPubSub.publish;
    evenSubscribe = evenPubSub.subscribe;
    oddPublish = oddPubSub.publish;
    oddSubscribe = oddPubSub.subscribe;
  });

  test('Happy path: 1 subscriber and 1 publish', async () => {
    const subscribeCallback = jest.fn();
    const oddUnsubscribe = await oddSubscribe(subscribeCallback);

    expect(messageListeners).toHaveProperty('length', 1);
    expect(Array.from(subscribedChannels)).toEqual(['odd']);
    expect(subscribeCallback).not.toHaveBeenCalled();

    await oddPublish(1);

    expect(subscribeCallback).toHaveBeenCalledTimes(1);
    expect(subscribeCallback).toHaveBeenCalledWith(1);

    await oddUnsubscribe();

    expect(messageListeners).toHaveProperty('length', 0);
    expect(Array.from(subscribedChannels)).toEqual([]);

    await oddPublish(3);

    expect(subscribeCallback).toHaveBeenCalledTimes(1);
  });

  test('Happy path: 1 subscriber and 2 publishes', async () => {
    const subscribeCallback = jest.fn();
    const oddUnsubscribe = await oddSubscribe(subscribeCallback);

    expect(messageListeners).toHaveProperty('length', 1);
    expect(Array.from(subscribedChannels)).toEqual(['odd']);
    expect(subscribeCallback).not.toHaveBeenCalled();

    await oddPublish(1);

    expect(subscribeCallback).toHaveBeenCalledTimes(1);
    expect(subscribeCallback).toHaveBeenCalledWith(1);

    await oddPublish(3);

    expect(subscribeCallback).toHaveBeenCalledTimes(2);
    expect(subscribeCallback).toHaveBeenCalledWith(3);

    await oddUnsubscribe();

    expect(messageListeners).toHaveProperty('length', 0);
    expect(Array.from(subscribedChannels)).toEqual([]);

    await oddPublish(5);

    expect(subscribeCallback).toHaveBeenCalledTimes(2);
  });

  test('Happy path: 2 subscribers and 2 publishes', async () => {
    const evenSubscribeCallback = jest.fn();
    const evenUnsubscribe = await evenSubscribe(evenSubscribeCallback);
    const oddSubscribeCallback = jest.fn();
    const oddUnsubscribe = await oddSubscribe(oddSubscribeCallback);

    expect(messageListeners).toHaveProperty('length', 2);
    expect(Array.from(subscribedChannels)).toEqual(['even', 'odd']);

    await oddPublish(1);

    expect(oddSubscribeCallback).toHaveBeenCalledTimes(1);
    expect(oddSubscribeCallback).toHaveBeenCalledWith(1);

    expect(evenSubscribeCallback).toHaveBeenCalledTimes(0);

    await evenPublish(2);

    expect(oddSubscribeCallback).toHaveBeenCalledTimes(1);

    expect(evenSubscribeCallback).toHaveBeenCalledTimes(1);
    expect(evenSubscribeCallback).toHaveBeenCalledWith(2);

    await oddUnsubscribe();

    expect(messageListeners).toHaveProperty('length', 1);
    expect(Array.from(subscribedChannels)).toEqual(['even']);

    await oddPublish(3);
    await evenPublish(4);

    expect(oddSubscribeCallback).toHaveBeenCalledTimes(1);

    expect(evenSubscribeCallback).toHaveBeenCalledTimes(2);
    expect(evenSubscribeCallback).toHaveBeenCalledWith(4);

    await evenUnsubscribe();

    expect(messageListeners).toHaveProperty('length', 0);
    expect(Array.from(subscribedChannels)).toEqual([]);
  });

  test('Happy path: Unsubscribe before publish', async () => {
    const subscribeCallback = jest.fn();
    const oddUnsubscribe = await oddSubscribe(subscribeCallback);

    expect(messageListeners).toHaveProperty('length', 1);
    expect(Array.from(subscribedChannels)).toEqual(['odd']);

    await oddUnsubscribe();

    expect(messageListeners).toHaveProperty('length', 0);
    expect(Array.from(subscribedChannels)).toEqual([]);

    await oddPublish(1);

    expect(subscribeCallback).not.toHaveBeenCalled();
  });

  test('Happy path: 0 subscribers and 1 publishes', async () => {
    expect(messageListeners).toHaveProperty('length', 0);
    expect(Array.from(subscribedChannels)).toEqual([]);

    await oddPublish(1);
  });

  test('Happy path: 2 subscribers of same channel and 3 publishes', async () => {
    const subscribe1Callback = jest.fn();
    const subscribe2Callback = jest.fn();
    const oddUnsubscribe1 = await oddSubscribe(subscribe1Callback);
    const oddUnsubscribe2 = await oddSubscribe(subscribe2Callback);

    expect(messageListeners).toHaveProperty('length', 2);
    expect(Array.from(subscribedChannels)).toEqual(['odd']);
    expect(subscribe1Callback).not.toHaveBeenCalled();
    expect(subscribe2Callback).not.toHaveBeenCalled();

    await oddPublish(1);

    expect(subscribe1Callback).toHaveBeenCalledTimes(1);
    expect(subscribe1Callback).toHaveBeenCalledWith(1);
    expect(subscribe2Callback).toHaveBeenCalledTimes(1);
    expect(subscribe2Callback).toHaveBeenCalledWith(1);

    await oddUnsubscribe1();

    expect(messageListeners).toHaveProperty('length', 1);
    expect(Array.from(subscribedChannels)).toEqual(['odd']);

    await oddPublish(3);

    expect(subscribe1Callback).toHaveBeenCalledTimes(1);
    expect(subscribe2Callback).toHaveBeenCalledTimes(2);
    expect(subscribe2Callback).toHaveBeenCalledWith(3);

    await oddUnsubscribe2();

    expect(messageListeners).toHaveProperty('length', 0);
    expect(Array.from(subscribedChannels)).toEqual([]);

    await oddPublish(5);

    expect(subscribe1Callback).toHaveBeenCalledTimes(1);
    expect(subscribe2Callback).toHaveBeenCalledTimes(2);
  });
});
