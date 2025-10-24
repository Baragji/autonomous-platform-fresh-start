export type VfsWriteOptions = {
  contentType?: string;
  sha256?: string;
};

export type VfsFileEntry = {
  path: string;
  size: number;
  lastModified: Date;
};

export type VfsVersionEntry = {
  versionPath: string;
  timestamp: string;
  size: number;
};

export interface Vfs {
  writeFile(path: string, content: Buffer | string, options?: VfsWriteOptions): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  listFiles(prefix?: string): Promise<VfsFileEntry[]>;
  listVersions(path: string): Promise<VfsVersionEntry[]>;
}
