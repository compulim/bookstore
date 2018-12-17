jest.useFakeTimers();

import { config } from 'dotenv';
import { createBlobService } from 'azure-storage';
import { createClient as createRedisClient } from 'redis';
import updateIn, { updateInAsync } from 'simple-update-in';

import
  createBook,
  {
    createPubSubUsingRedis,
    createStorageUsingAzureStorage
  }
from './index';

import createDeferred from 'p-defer';
import createPromisifiedBlobService from './PromisifiedBlobService';

config();

let blobService;
let book1, book2;
let container;
let promisifiedBlobService;
let publishRedis;
let storage;
let subscribeRedis;

beforeEach(async () => {
  await Promise.all([
    new Promise(resolve => {
      blobService = createBlobService(
        process.env.AZURE_STORAGE_ACCOUNT,
        process.env.AZURE_STORAGE_ACCESS_KEY
      );

      container = `${ process.env.AZURE_STORAGE_CONTAINER_PREFIX }${ Math.random().toString(36).substr(2, 5) }`;
      promisifiedBlobService = createPromisifiedBlobService(blobService);

      storage = createStorageUsingAzureStorage(blobService, container);
      storage.on('ready', () => resolve());

      // await promisifiedBlobService.createContainerIfNotExists(
      //   container,
      //   { publicAccessLevel: 'blob' },
      // );
    }),
    new Promise(resolve => {
      publishRedis = createRedisClient();
      publishRedis.on('ready', () => resolve());
    }),
    new Promise(resolve => {
      subscribeRedis = createRedisClient();
      subscribeRedis.on('ready', () => resolve());
    })
  ]);

  const { publish, subscribe } = createPubSubUsingRedis(publishRedis, subscribeRedis, 'multiplex');

  book1 = createBook(
    ({ x, y }) => ({ sum: x + y }),
    { publish, storage, subscribe }
  );

  book2 = createBook(
    ({ x, y }) => ({ sum: x + y }),
    { publish, storage, subscribe }
  );
});

afterEach(async () => {
  book1.end();
  book2.end();

  await Promise.all([
    await (async () => {
      return await promisifiedBlobService.deleteContainerIfExists(container);
    })(),
    publishRedis && new Promise(resolve => {
      publishRedis.on('end', () => resolve());
      publishRedis.quit();
    }),
    subscribeRedis && new Promise(resolve => {
      subscribeRedis.on('end', () => resolve());
      subscribeRedis.quit();
    })
  ]);
});

test('Setup without issues', () => {});

test('Create an item', async () => {
  const id = 'create-an-item';
  const book1ChangeHook = jest.fn();
  const book1ChangePromise = new Promise(resolve => {
    book1.on('change', (...args) => {
      book1ChangeHook(...args);
      resolve();
    });
  });
  const book2ChangePromise = new Promise(resolve => book1.on('change', resolve));

  await book2.refresh();
  await book1.create(id, { x: 1, y: 2 });

  expect(book1.fetch(id)).resolves.toEqual({ x: 1, y: 2 });

  await book1ChangePromise;

  expect(book1ChangeHook).toHaveBeenCalledTimes(1);
  expect(book1ChangeHook).toHaveBeenCalledWith({ id });
  expect(book1.list()).resolves.toEqual({
    [id]: {
      from: 'blob',
      summary: { sum: 3 }
    }
  });

  await book2ChangePromise;

  expect(book2.list()).resolves.toEqual({
    [id]: {
      from: 'redis',
      summary: { sum: 3 }
    }
  });

  await book2.refresh();

  expect(book2.list()).resolves.toEqual({
    [id]: {
      from: 'blob',
      summary: { sum: 3 }
    }
  });
});

test('Update an item', async () => {
  const id = 'update-an-item';

  await book1.create(id, { x: 1, y: 2 });
  await book2.refresh();
  await book1.update(id, content => updateIn(content, ['x'], () => 3));
  await expect(book1.fetch(id)).resolves.toEqual({ x: 3, y: 2 });
  await expect(book1.list()).resolves.toEqual({
    [id]: {
      from: 'blob',
      summary: { sum: 5 }
    }
  });

  await expect(book2.list()).resolves.toEqual({
    [id]: {
      from: 'redis',
      summary: { sum: 5 }
    }
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
  await book2.refresh();

  await expect(book1.fetch(id)).resolves.toEqual({ x: 1, y: 2 });

  deferred.resolve();

  await updatePromise;
  await expect(book1.fetch(id)).resolves.toEqual({ x: 3, y: 2 });

  await expect(book2.list()).resolves.toEqual({
    [id]: {
      from: 'redis',
      summary: { sum: 5 }
    }
  });
});

test('Delete an item', async () => {
  const id = 'delete-an-item';

  await book1.create(id, { x: 1, y: 2 });
  await book2.refresh();

  await expect(book2.list()).resolves.toEqual({
    [id]: {
      from: 'blob',
      summary: { sum: 3 }
    }
  });

  await book1.del(id);

  await expect(book1.fetch(id)).resolves.toBeFalsy();
  await expect(book1.list()).resolves.toEqual({});
  await expect(book2.list()).resolves.toEqual({});

  await book2.refresh();

  await expect(book2.list()).resolves.toEqual({});
});

test('Fetching non-existent item', async () => {
  expect(book1.fetch('non-existent')).resolves.toBeFalsy();
});
