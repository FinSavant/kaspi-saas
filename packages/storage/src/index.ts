import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { Storage } from '@google-cloud/storage';

export interface FileStorage {
  save(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(path: string): Promise<Uint8Array>;
  /** Удаляет файл; нет файла — не ошибка. */
  remove(path: string): Promise<void>;
}

class LocalStorage implements FileStorage {
  constructor(private readonly root: string) {}

  async save(path: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  async read(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(path)));
  }

  async remove(path: string): Promise<void> {
    await rm(this.resolve(path), { force: true });
  }

  /** Не даёт выйти за пределы папки хранилища через ../ в пути. */
  private resolve(path: string): string {
    const relative = normalize(path);
    if (relative.startsWith('..') || relative.includes(`${sep}..${sep}`)) {
      throw new Error(`Invalid storage path: ${path}`);
    }
    return join(this.root, relative);
  }
}

class GcsStorage implements FileStorage {
  private readonly storage = new Storage();

  constructor(private readonly bucket: string) {}

  async save(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.storage.bucket(this.bucket).file(path).save(Buffer.from(bytes), { contentType, resumable: false });
  }

  async read(path: string): Promise<Uint8Array> {
    const [contents] = await this.storage.bucket(this.bucket).file(path).download();
    return new Uint8Array(contents);
  }

  async remove(path: string): Promise<void> {
    await this.storage.bucket(this.bucket).file(path).delete({ ignoreNotFound: true });
  }
}

/** Cloud Storage, если задан GCS_BUCKET; иначе локальная папка. */
export function createStorage(): FileStorage {
  const bucket = process.env.GCS_BUCKET;
  return bucket ? new GcsStorage(bucket) : new LocalStorage(process.env.LOCAL_STORAGE_DIR ?? './storage');
}
