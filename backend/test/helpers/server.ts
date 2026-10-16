import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app";
import type { Services } from "../../src/routes";

export interface ApiResponse {
  status: number;
  body: unknown;
  text: string;
}

export interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

export interface TestServer {
  baseUrl: string;
  request(path: string, options?: RequestOptions): Promise<ApiResponse>;
  close(): Promise<void>;
}

export async function startServer(services: Services): Promise<TestServer> {
  const server: Server = createApp(services).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    baseUrl,
    async request(path, { method = "GET", token, body } = {}) {
      const headers: Record<string, string> = {};
      if (token) headers.authorization = `Bearer ${token}`;
      if (body !== undefined) headers["content-type"] = "application/json";

      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      return { status: res.status, text, body: text ? (JSON.parse(text) as unknown) : null };
    },
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

// Reads `error.code` from the API error envelope.
export function errorCode(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const { error } = body as { error: { code?: unknown } };
  return error.code;
}
