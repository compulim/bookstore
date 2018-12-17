```
 _                 _        _
| |__   ___   ___ | | _____| |_ ___  _ __ ___
| '_ \ / _ \ / _ \| |/ / __| __/ _ \| '__/ _ \
| |_) | (_) | (_) |   <\__ \ || (_) | | |  __/
|_.__/ \___/ \___/|_|\_\___/\__\___/|_|  \___|

```

<!-- The ASCII art is generated using http://www.patorjk.com/software/taag/#p=display&f=Ogre&t=bookstore -->

A small data framework for collaborative list editing using Azure Blob Storage and Redis.

<a href="https://badge.fury.io/js/bookstore"><img alt="npm version" src="https://badge.fury.io/js/bookstore.svg" /></a>
<a href="https://travis-ci.org/compulim/bookstore"><img alt="Build Status" src="https://travis-ci.org/compulim/bookstore.svg?branch=master" /></a>
<a href="https://coveralls.io/github/compulim/bookstore?branch=master"><img src="https://coveralls.io/repos/github/compulim/bookstore/badge.svg?branch=master" alt="Coverage Status" /></a>

# What is different than traditional CRUD + cache?

- Content and summary
   - Summary is computed from content, via a summarizer function
   - Summary are broadcasted via Redis to other nodes, content are not broadcasted
   - List will fetch all summaries, but not content
   - List is cheap, `O(1)`
   - Nodes will keep summaries in memory
- Update is done thru lock-update-unlock pattern with updater function
   - Updater function can be programmed as optimistic or pessimistic concurrency
   - We believe this model makes concurrency issues a little bit easier to handle

# How to use

For production build, `npm install bookstore`. For development build, `npm install bookstore@master`.

For peer dependencies, you will also need `npm install azure-storage@2 redis`.

```js
const { createBlobService } = require('azure-storage');
const { createClient } = require('redis');
const updateIn = require('simple-update-in');
const createBook, { createPubSubUsingRedis, createStorageUsingAzureStorage } = require('bookstore');

const blobService = createBlobService(
  process.env.AZURE_STORAGE_ACCOUNT,
  process.env.AZURE_STORAGE_ACCESS_KEY
);

const publishRedis = createClient();
const subscribeRedis = publishRedis.duplicate();

const book = createBook(
  ({ x, y }) => ({ sum: x + y }),
  {
    ...createPubSubUsingRedis(publishRedis, subscribeRedis, 'blob-container-name'),
    ...createStorageUsingAzureStorage(blobService, 'blob-container-name')
  }
);

await book.create('page-0', { x: 1, y: 2 });

// Listing summary of all pages
// { 'page-0': {
//   summary: { sum: 3 }
// } }
await book.list();

// Getting the content of the page
// { x: 1, y: 2 }
await book.get('page-0');

// Update a page
// We use `simple-update-in` and updater function for handling concurrency
await book.update('page-0', content => updateIn(content, ['x'], () => 3));

// "change" event emitted when update broadcast on Redis
// Only summaries are sent over Redis
book.on('change', id => {
  console.log(id); // 'page-0'
});

// Listing summary of all pages again, with new changes
// { 'page-0': {
//   summary: { sum: 5 }
// } }
await book.list();

// Delete a page
await book.del('page-0');
```

## Peer requirements

Instead of using Blob via Azure Storage and Pub-sub via Redis, you can also use other services as long as they met the requirements:

- Storage
   - `create(id, content, summary)`: Create a new blob with content and summary
   - `del(id)`: Delete a blob
   - `get(id)`: Read a blob content
   - `list()`: List all blob summaries, without reading the actual content
   - `update(id, updater)`: Update an existing blob via an updater function, using lock to prevent dirty read
      - `updater: (content, summary) => ({ content, summary })`
- Pub-sub
   - `publish(content)`: Publish to a predefined topic
   - `subscribe(callback: content => void): () => void`: Subscribe to a predefined topic via callback, will return a function for unsubscribe

# Contributions

Like us? [Star](https://github.com/compulim/bookstore/stargazers) us.

Want to make it better? [File](https://github.com/compulim/bookstore/issues) us an issue.

Don't like something you see? [Submit](https://github.com/compulim/bookstore/pulls) a pull request.
