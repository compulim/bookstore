jest.useFakeTimers();

import { config } from 'dotenv';
import { createBlobService } from 'azure-storage';
import { createClient as createRedisClient } from 'redis';
import { promisify } from 'util';
import createDeferred from 'p-defer';
import updateIn, { updateInAsync } from 'simple-update-in';
import createPromiseQueue from './utils/createPromiseQueue';

import
  createBook,
  {
    createPubSubUsingRedis,
    createStorageUsingAzureStorage
  }
from './index';

config();

let blobService;
let container;
let facility;
let publishRedis;
let subscribeRedis;

function createRedisClientWithReady() {
  return new Promise(resolve => {
    const client = createRedisClient();

    client.on('ready', () => resolve(client));
  });
}

function quitRedis(redis) {
  return new Promise(resolve => {
    redis.on('end', resolve);
    redis.quit();
  });
}

beforeEach(async () => {
  blobService = createBlobService(
    process.env.AZURE_STORAGE_ACCOUNT,
    process.env.AZURE_STORAGE_ACCESS_KEY
  );

  container = `${ process.env.AZURE_STORAGE_CONTAINER_PREFIX }${ Math.random().toString(36).substr(2, 5) }`;

  await promisify(blobService.createContainer.bind(blobService))(container, { publicAccessLevel: 'blob' });

  publishRedis = await createRedisClientWithReady();
  subscribeRedis = await createRedisClientWithReady();

  facility = {
    ...createPubSubUsingRedis(
      publishRedis,
      subscribeRedis,
      container
    ),
    ...createStorageUsingAzureStorage(blobService, container)
  };
});

afterEach(async () => {
  await promisify(blobService.deleteContainerIfExists.bind(blobService))(container);
  await quitRedis(publishRedis);
  await quitRedis(subscribeRedis);
});

test('Setup without issues', () => {});

test('Create two items with different summarizer', async () => {
  const book = createBook(
    ({ x, y }, id) => id === 'sum' ? { sum: x + y } : { multiply: x * y },
    facility
  );

  try {
    const bookChangeQueue = createPromiseQueue();

    await book.subscribe(bookChangeQueue.push);
    await book.create('sum', { x: 1, y: 2 });

    expect(book.get('sum')).resolves.toEqual({ x: 1, y: 2 });
    expect(await bookChangeQueue.shift()).resolves.toEqual({ id: 'sum', summary: { sum: 3 } });

    expect(book.list()).resolves.toEqual({
      sum: { sum: 3 }
    });

    await book.create('multiply', { x: 1, y: 2 });

    expect(book.get('multiply')).resolves.toEqual({ x: 1, y: 2 });
    expect(await bookChangeQueue.shift()).resolves.toEqual({ id: 'multiply', summary: { multiply: 2 } });

    expect(book.list()).resolves.toEqual({
      multiply: { multiply: 2 },
      sum: { sum: 3 }
    });
  } catch (err) {
    await book.end();
  }
});
