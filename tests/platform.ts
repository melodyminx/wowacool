import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params);
  }

  private args(): SQLInputValue[] {
    return this.params.map((value) => (value === undefined ? null : value) as SQLInputValue);
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args()) as T | undefined;
    return row ? { ...row } : null;
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    const results = this.db.prepare(this.sql).all(...this.args()) as T[];
    return { results: results.map((row) => ({ ...row })), success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number }; results: [] }> {
    const info = this.db.prepare(this.sql).run(...this.args());
    return {
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
      results: [],
    };
  }
}

class D1Shim {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  async batch(statements: Statement[]) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

class R2Shim {
  private readonly objects = new Map<string, { data: Uint8Array; httpMetadata?: { contentType?: string; contentDisposition?: string } }>();

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { httpMetadata?: { contentType?: string; contentDisposition?: string } },
  ): Promise<void> {
    this.objects.set(key, { data: await toBytes(value), httpMetadata: options?.httpMetadata });
  }

  async get(key: string) {
    const found = this.objects.get(key);
    if (!found) return null;
    const data = found.data;
    return {
      key,
      httpMetadata: found.httpMetadata,
      body: new Blob([bytesOf(data)]).stream(),
      async arrayBuffer() {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      },
      async text() {
        return new TextDecoder().decode(data);
      },
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

function bytesOf(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new ArrayBuffer(data.byteLength);
  const view = new Uint8Array(copy);
  view.set(data);
  return view;
}

async function toBytes(value: ArrayBuffer | ArrayBufferView | string | Blob): Promise<Uint8Array> {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(await value.arrayBuffer());
}

export function createTestEnv(extra: Record<string, unknown> = {}): Env {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(fileURLToPath(new URL("../schema/d1.sql", import.meta.url)), "utf8"));
  const db = new D1Shim(sqlite);
  const bucket = new R2Shim();
  return {
    IMAGE_PROVIDER: "mock",
    PHASE: "2",
    OPENROUTER_PREFERRED_MODEL: "liquid/lfm-3-1.7b:free",
    DB: db as unknown as D1Database,
    ASSETS: bucket as unknown as R2Bucket,
    ...extra,
  } as Env;
}
