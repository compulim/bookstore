import { blob } from 'azure-storage-fs';
import { posix } from 'path';

import onErrorResumeNext from './onErrorResumeNext';
import promisify from './promisify';
import removeKey from './removeKey';

const JSON_CONTENT_SETTINGS_OPTIONS = {
  contentSettings: {
    contentType: 'application/json'
  }
};

export default function bookshelf(blobService, container, prefix = '') {
  function coverBlob(id) {
    return `${ prefix }${ id }.json`;
  }

  function chapterBlob(id, sectionName) {
    return posix.join(`${ prefix }${ id }`, `${ sectionName }.json`);
  }
  async function createBlobFS() {
    await promisify(blobService.createContainerIfNotExists, blobService)(container);

    return {
      ...blob(
        blobService,
        container
      ).promise,
      blobService,
      container
    };
  }

  async function createBook(id, cover, chapters) {
    const fs = await createBlobFS();

    try {
      await Promise.all(Object.keys(chapters).map(chapterName => {
        return fs.writeFile(
          chapterBlob(id, chapterName),
          JSON.stringify(chapters[chapterName]),
          JSON_CONTENT_SETTINGS_OPTIONS
        );
      }));

      await fs.writeFile(coverBlob(id), '', { metadata: { ...cover, __id: id } });
    } catch (err) {
      await onErrorResumeNext(() => Promise.all(
        Object.keys(chapters).map(chapterName => fs.unlink(chapterBlob(id, chapterName)))
      ));

      throw err;
    }

    return { ...chapters, cover, id };
  }

  async function readBookCover(fs, id) {
    const { metadata } = await fs.stat(coverBlob(id), { metadata: true });

    return removeKey(metadata, '__id');
  }

  async function updateBookCover(id, updater) {
    const fs = await createBlobFS();
    const cover = await readBookCover(fs, id);
    const nextCover = updater(cover);

    await fs.setMetadata(coverBlob(id), { ...nextCover, __id: id });

    return { id, cover: nextCover };
  }

  async function listBook() {
    const fs = await createBlobFS();
    const { entries } = await promisify(fs.blobService.listBlobsSegmentedWithPrefix, fs.blobService)(fs.container, prefix, null, { delimiter: '/', include: 'metadata' });

    return entries.reduce((books, entry) => ({
      ...books,
      [entry.metadata.__id]: {
        id: entry.metadata.__id,
        cover: removeKey(entry.metadata, '__id')
      }
    }), {});
  }

  async function deleteBook(id) {
    const fs = await createBlobFS();
    const { entries } = await promisify(fs.blobService.listBlobsSegmentedWithPrefix, fs.blobService)(fs.container, `${ prefix }${ id }/`, null, { delimiter: '/' });

    await fs.unlink(coverBlob(id));
    await Promise.all(entries.map(({ name }) => fs.unlink(name)));
  }

  async function readChapter(id, chapterName) {
    const fs = await createBlobFS();

    return JSON.parse(await fs.readFile(chapterBlob(id, chapterName), { encoding: 'utf8' }));
  }

  async function updateChapter(id, chapterName, updater) {
    const fs = await createBlobFS();
    const cover = await readBookCover(fs, id);
    const chapter = await readChapter(id, chapterName);
    const { chapter: nextChapter, cover: nextCover } = updater({ chapter, cover });

    await fs.writeFile(chapterBlob(id, chapterName), JSON.stringify(nextChapter), JSON_CONTENT_SETTINGS_OPTIONS);

    if (nextCover) {
      try {
        await fs.setMetadata(coverBlob(id), { ...nextCover, __id: id });
      } catch (err) {
        await onErrorResumeNext(() => fs.writeFile(chapterBlob(id, chapterName), JSON.stringify(chapter), JSON_CONTENT_SETTINGS_OPTIONS));
        throw err;
      }
    }

    return {
      [chapterName]: nextChapter,
      id,
      cover: nextCover || cover
    };
  }

  return {
    createBook,
    updateBookCover,
    listBook,
    deleteBook,
    readChapter,
    updateChapter
  };
}
