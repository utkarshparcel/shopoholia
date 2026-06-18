export type StorageObject = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface StorageClient {
  put(object: StorageObject): Promise<{ key: string }>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}

export function createMockStorage(baseUrl = "https://r2.mock.worn.test"): StorageClient {
  const objects = new Map<string, StorageObject>();

  return {
    async put(object) {
      objects.set(object.key, object);
      return { key: object.key };
    },
    async getSignedUrl(key) {
      if (!objects.has(key)) {
        throw new Error(`Object not found: ${key}`);
      }
      return `${baseUrl}/${key}?sig=mock`;
    },
    async delete(key) {
      objects.delete(key);
    },
    async deleteMany(keys) {
      for (const key of keys) objects.delete(key);
    },
  };
}
