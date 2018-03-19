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

  function chapterBlob(id, chapterName) {
    return posix.join(`${ prefix }${ id }`, `chapter/${ chapterName }.json`);
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
          JSON_CONTENT_SETTINGS_OPTIONS,
        );
      }));

      await fs.writeFile(coverBlob(id), '', { metadata: { ...cover, __chapters: Object.keys(chapters), __id: id } });
    } catch (err) {
      await onErrorResumeNext(() => Promise.all(
        Object.keys(chapters).map(chapterName => fs.unlink(chapterBlob(id, chapterName)))
      ));

      throw err;
    }

    return { ...chapters, chapters: Object.keys(chapters), cover, id };
  }

  async function readBookMetadata(fs, id) {
    const { metadata } = await fs.stat(coverBlob(id), { metadata: true });

    return metadata;
  }

  async function readBookCover(fs, id) {
    const metadata = await readBookMetadata(fs, id);

    return removeKey(metadata, '__chapters', '__id');
  }

  async function readBook(id) {
    const fs = await createBlobFS();
    const metadata = await readBookMetadata(fs, id);
    const chaptersArray = await Promise.all(metadata.__chapters.map(chapter => readChapter(id, chapter)));
    const chapters = metadata.__chapters.reduce((chapters, name, index) => ({
      ...chapters,
      [name]: chaptersArray[index]
    }), {});

    return {
      chapters: metadata.__chapters,
      cover: removeKey(metadata, '__chapters', '__id'),
      id,
      ...chapters
    };
  }

  async function updateBookCover(id, updater) {
    const fs = await createBlobFS();
    const metadata = await readBookMetadata(fs, id);
    const chapters = metadata.__chapters;
    const nextCover = updater(removeKey(metadata, '__chapters', '__id'));

    await fs.setMetadata(coverBlob(id), { ...nextCover, __chapters: chapters, __id: id });

    return { id, chapters, cover: nextCover };
  }

  async function listBook() {
    const fs = await createBlobFS();
    const { entries } = await promisify(fs.blobService.listBlobsSegmentedWithPrefix, fs.blobService)(fs.container, prefix, null, { delimiter: '/', include: 'metadata' });

    return entries.reduce((books, entry) => ({
      ...books,
      [entry.metadata.__id]: {
        id: entry.metadata.__id,
        chapters: entry.metadata.__chapters,
        cover: removeKey(entry.metadata, '__chapters', '__id')
      }
    }), {});
  }

  async function deleteBook(id) {
    const fs = await createBlobFS();
    const { entries } = await promisify(fs.blobService.listBlobsSegmentedWithPrefix, fs.blobService)(fs.container, `${ prefix }${ id }/`, null, {});

    await fs.unlink(coverBlob(id));
    await Promise.all(entries.map(({ name }) => fs.unlink(name)));
  }

  async function readChapter(id, chapterName) {
    const fs = await createBlobFS();

    return JSON.parse(await fs.readFile(chapterBlob(id, chapterName), { encoding: 'utf8' }));
  }

  async function updateChapter(id, chapterName, updater) {
    const fs = await createBlobFS();
    const metadata = await readBookMetadata(fs, id);
    const chapters = metadata.__chapters;
    const cover = removeKey(metadata, '__chapters', '__id');
    const chapter = await readChapter(id, chapterName);
    const { chapter: nextChapter, cover: nextCover } = updater({ chapter, cover });

    await fs.writeFile(chapterBlob(id, chapterName), JSON.stringify(nextChapter), JSON_CONTENT_SETTINGS_OPTIONS);

    if (nextCover) {
      try {
        await fs.setMetadata(coverBlob(id), { ...nextCover, __chapters: chapters, __id: id });
      } catch (err) {
        await onErrorResumeNext(() => fs.writeFile(chapterBlob(id, chapterName), JSON.stringify(chapter), JSON_CONTENT_SETTINGS_OPTIONS));
        throw err;
      }
    }

    return {
      [chapterName]: nextChapter,
      chapters,
      id,
      cover: nextCover || cover
    };
  }

  return {
    createBook,
    deleteBook,
    listBook,
    readBook,
    readChapter,
    updateBookCover,
    updateChapter
  };
}
