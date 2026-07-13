export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

export interface RpcClientOptions {
  timeoutMs?: number;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: readonly unknown[];
}

interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function validateEndpointUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid JSON-RPC endpoint URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `JSON-RPC endpoint must use HTTP or HTTPS, got: ${parsed.protocol}`,
    );
  }

  return parsed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRpcError(errorValue: unknown): JsonRpcErrorBody {
  if (!isPlainObject(errorValue)) {
    throw new Error(
      "JSON-RPC response contains a malformed error envelope: error must be a non-null object",
    );
  }

  const { code, message, data } = errorValue;

  if (typeof code !== "number" || !Number.isFinite(code)) {
    throw new Error(
      "JSON-RPC response contains a malformed error envelope: error.code must be a finite number",
    );
  }

  if (typeof message !== "string") {
    throw new Error(
      "JSON-RPC response contains a malformed error envelope: error.message must be a string",
    );
  }

  return data === undefined ? { code, message } : { code, message, data };
}

export class RpcClient {
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private nextId = 1;

  constructor(endpointUrl: string, options?: RpcClientOptions) {
    this.endpoint = validateEndpointUrl(endpointUrl);
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request<T>(
    method: string,
    params: readonly unknown[] = [],
  ): Promise<T> {
    const id = this.nextId++;
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `JSON-RPC HTTP request failed with status ${response.status} ${response.statusText}`,
        );
      }

      let payload: unknown;
      try {
        // The abort signal also covers body consumption, so a server that
        // stalls after sending headers still hits the timeout below.
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted) {
          throw error;
        }
        throw new Error("JSON-RPC response is not valid JSON");
      }

      if (!isPlainObject(payload)) {
        throw new Error("JSON-RPC response must be a JSON object");
      }

      const rpcResponse = payload as JsonRpcResponse;

      if (rpcResponse.jsonrpc !== "2.0") {
        throw new Error(
          "JSON-RPC response has invalid or missing jsonrpc version",
        );
      }

      if (rpcResponse.id !== id) {
        throw new Error(
          `JSON-RPC response id mismatch: expected ${id}, got ${String(rpcResponse.id)}`,
        );
      }

      if ("error" in rpcResponse && rpcResponse.error !== undefined) {
        const rpcError = parseJsonRpcError(rpcResponse.error);
        throw new RpcError(rpcError.code, rpcError.message, rpcError.data);
      }

      if (!("result" in rpcResponse)) {
        throw new Error("JSON-RPC response has neither result nor error");
      }

      return rpcResponse.result as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`JSON-RPC request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
