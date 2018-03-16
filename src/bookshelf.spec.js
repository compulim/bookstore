import { blobService } from './bookshelf.mock';
import mockFS from 'azure-storage-fs';
import Bookshelf from './bookshelf';

let bookshelf;
let createBookResult;

beforeEach(async () => {
  blobService.files = {};
  blobService.createContainerIfNotExists.mock.calls = [];

  bookshelf = Bookshelf(blobService, 'user-1', 'travel/');

  createBookResult = await bookshelf.createBook(
    '1',
    {
      name: 'Japan'
    },
    {
      members: ['user-2', 'user-3'],
      poi: ['SkyTree']
    }
  );

  expect(blobService.createContainerIfNotExists).toHaveBeenCalledTimes(1);
  expect(blobService.createContainerIfNotExists.mock.calls[0][0]).toBe('user-1');
});

test('create book', async () => {
  expect(createBookResult).toMatchSnapshot();
  expect(blobService.getFiles()).toMatchSnapshot();
});

test('update book cover', async () => {
  const result = await bookshelf.updateBookCover('1', cover => ({
    ...cover,
    owner: 'John Doe'
  }));

  expect(result).toMatchSnapshot();
  expect(blobService.getFiles()).toMatchSnapshot();
});

test('list book', async () => {
  await bookshelf.createBook('2', { name: 'Taipei' }, {});

  const result = await bookshelf.listBook();

  expect(result).toMatchSnapshot();
});

test('delete book', async () => {
  expect(blobService.getFiles()).toMatchSnapshot();

  await bookshelf.deleteBook('1');

  expect(blobService.getFiles()).toMatchSnapshot();
});

test('read chapter', async () => {
  const chapter = await bookshelf.readChapter('1', 'poi');

  expect(chapter).toMatchSnapshot();
});

test('update chapter with cover', async () => {
  const updateResult = await bookshelf.updateChapter('1', 'poi', ({ chapter, cover }) => {
    expect(cover).toMatchSnapshot();
    expect(chapter).toMatchSnapshot();

    return {
      chapter: [...chapter, 'Asakusa'],
      cover: { ...cover, owner: 'John Doe' }
    };
  });

  expect(updateResult).toMatchSnapshot();
  expect(blobService.getFiles()).toMatchSnapshot();
});

test('update chapter without cover', async () => {
  const updateResult = await bookshelf.updateChapter('1', 'poi', ({ chapter }) => {
    expect(chapter).toMatchSnapshot();

    return { chapter: [...chapter, 'Asakusa'] };
  });

  expect(updateResult).toMatchSnapshot();
  expect(blobService.getFiles()).toMatchSnapshot();
});
