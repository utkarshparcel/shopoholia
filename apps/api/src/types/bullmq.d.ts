declare module "bullmq" {
  export class Queue {
    constructor(
      name: string,
      opts?: {
        connection?: string | unknown;
        defaultJobOptions?: { attempts?: number; backoff?: { type: "exponential" | "fixed"; delay: number } };
      },
    );
    add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
    on(event: "error", listener: (err: Error) => void): this;
    close(): Promise<void>;
  }
}
