import { promises as fs } from "fs";
import path from "path";
import type { ZodSchema, ZodTypeDef } from "zod";

import { getEnv } from "@/lib/schemas/env";

export class FileStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    const env = getEnv();
    this.baseDir = path.resolve(baseDir ?? env.DATA_DIR);
  }

  resolve(...segments: string[]): string {
    return path.join(this.baseDir, ...segments);
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async readJson<TOutput, TInput = TOutput>(
    relativePath: string,
    schema: ZodSchema<TOutput, ZodTypeDef, TInput>,
  ): Promise<TOutput> {
    const fullPath = this.resolve(relativePath);
    const raw = await fs.readFile(fullPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const result = schema.safeParse(parsed);

    if (!result.success) {
      throw new Error(
        `Invalid data in ${relativePath}: ${result.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    return result.data;
  }

  async writeJson<T>(relativePath: string, data: T): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await this.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async appendJsonLine<T>(relativePath: string, entry: T): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await this.ensureDir(path.dirname(fullPath));
    const line = `${JSON.stringify(entry)}\n`;
    await fs.appendFile(fullPath, line, "utf-8");
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(relativeDir: string): Promise<string[]> {
    const fullPath = this.resolve(relativeDir);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      return [];
    }
  }
}

let storeInstance: FileStore | null = null;

export function getFileStore(): FileStore {
  if (!storeInstance) {
    storeInstance = new FileStore();
  }
  return storeInstance;
}
