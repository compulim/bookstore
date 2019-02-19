jest.useFakeTimers();

import { config } from 'dotenv';
import { createBlobService } from 'azure-storage';
import { createClient as createRedisClient } from 'redis';
import { promisify } from 'util';
import createDeferred from 'p-defer';
import updateIn, { updateInAsync } from 'simple-update-in';

import
  createBook,
  {
    createPubSubUsingRedis,
    createStorageUsingAzureStorage
  }
from './index';

config();

let blobService;
let book1, book2;
let container;
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

  const facility = {
    ...createPubSubUsingRedis(
      publishRedis,
      subscribeRedis,
      container
    ),
    ...createStorageUsingAzureStorage(blobService, container)
  };

  book1 = await createBook(
    ({ x, y }) => ({ sum: x + y }),
    facility
  );

  book2 = await createBook(
    ({ x, y }) => ({ sum: x + y }),
    facility
  );
});

afterEach(async () => {
  await book1.end();
  await book2.end();

  await promisify(blobService.deleteContainerIfExists.bind(blobService))(container);
  await quitRedis(publishRedis);
  await quitRedis(subscribeRedis);
});

test('Setup without issues', () => {});

test('Create an item', async () => {
  const id = 'create-an-item';
  const book1ChangeHook = jest.fn();
  const book1ChangeDeferred = createDeferred();

  await book1.subscribe((...args) => {
    book1ChangeHook(...args);
    book1ChangeDeferred.resolve();
  });

  const book2ChangeDeferred = createDeferred();

  await book2.subscribe(book2ChangeDeferred.resolve);
  await book1.create(id, { x: 1, y: 2 });

  expect(book1.get(id)).resolves.toEqual({ x: 1, y: 2 });

  await book1ChangeDeferred.promise;

  expect(book1ChangeHook).toHaveBeenCalledTimes(1);
  expect(book1ChangeHook).toHaveBeenCalledWith({ id, summary: { sum: 3 } });
  expect(book1.list()).resolves.toEqual({
    [id]: { sum: 3 }
  });

  await book2ChangeDeferred.promise;

  expect(book2.list()).resolves.toEqual({
    [id]: { sum: 3 }
  });
});

test('Update an item', async () => {
  const id = 'update-an-item';
  const book1ChangeHook = jest.fn();
  const book1ChangeDeferred = createDeferred();

  await book1.subscribe((...args) => {
    book1ChangeHook(...args);
    book1ChangeDeferred.resolve();
  });

  await book1.create(id, { x: 1, y: 2 });
  await book1.update(id, content => updateIn(content, ['x'], () => 3));
  await book1ChangeDeferred.promise;
  await expect(book1.get(id)).resolves.toEqual({ x: 3, y: 2 });
  await expect(book1.list()).resolves.toEqual({
    [id]: { sum: 5 }
  });

  await expect(book2.list()).resolves.toEqual({
    [id]: { sum: 5 }
  });
});

test('Update an item by 2 clients simultaneously', async () => {
  const id = 'update-an-item-simultaneously';

  await book1.create(id, { x: 1, y: 2 });

  const deferred = createDeferred();
  const checkpoint = createDeferred();

  const updatePromise = book1.update(id, content => updateInAsync(content, ['x'], async () => {
    checkpoint.resolve();
    await deferred.promise;

    return 3;
  }));

  await checkpoint.promise;

  expect(book2.update(id, content => updateIn(content, ['x'], () => 0))).rejects.toBeTruthy();

  await expect(book1.get(id)).resolves.toEqual({ x: 1, y: 2 });

  deferred.resolve();

  await updatePromise;
  await expect(book1.get(id)).resolves.toEqual({ x: 3, y: 2 });

  await expect(book2.list()).resolves.toEqual({
    [id]: { sum: 5 }
  });
});

test('Update an item without summary change', async () => {
  const id = 'update-an-item-without-summary-change';
  const book1ChangeHook = jest.fn();
  const book1ChangeDeferred = createDeferred();
  let book1NumCalled = 0;
  const book2ChangeHook = jest.fn();
  const book2ChangeDeferred = createDeferred();
  let book2NumCalled = 0;

  await book1.subscribe((...args) => {
    book1ChangeHook(...args);
    ++book1NumCalled > 1 && book1ChangeDeferred.resolve();
  });

  await book2.subscribe((...args) => {
    book2ChangeHook(...args);
    ++book2NumCalled > 1 && book2ChangeDeferred.resolve();
  });

  await book1.create(id, { x: 1, y: 2 });
  await book1.update(id, content => updateIn(content, ['z'], () => 3));
  await book1ChangeDeferred.promise;
  await book2ChangeDeferred.promise;

  expect(book1ChangeHook).toHaveBeenCalledTimes(2);
  expect(book1ChangeHook).toHaveBeenLastCalledWith({ id, summary: { sum: 3 } });
  expect(book2ChangeHook).toHaveBeenCalledTimes(2);
  expect(book2ChangeHook).toHaveBeenLastCalledWith({ id, summary: { sum: 3 } });

  await expect(book1.get(id)).resolves.toEqual({ x: 1, y: 2, z: 3 });
});

test('Delete an item', async () => {
  const id = 'delete-an-item';

  await book1.create(id, { x: 1, y: 2 });

  await expect(book2.list()).resolves.toEqual({
    [id]: { sum: 3 }
  });

  await book1.del(id);

  await expect(book1.get(id)).resolves.toBeFalsy();
  await expect(book1.list()).resolves.toEqual({});
  await expect(book2.list()).resolves.toEqual({});
});

test('Getting an non-existent item', async () => {
  expect(book1.get('non-existent')).resolves.toBeFalsy();
});
