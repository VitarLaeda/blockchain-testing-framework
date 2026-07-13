import http from "node:http";
import type { AddressInfo } from "node:net";

import { expect } from "chai";
import { epic, feature, story } from "allure-js-commons";
// @ts-expect-error run-rpc-tests.mjs has no TypeScript declaration file
import { buildNodeStartupError } from "../../scripts/run-rpc-tests.mjs";
import { RpcClient, RpcError } from "../../src/rpc/RpcClient.js";
import { step } from "../support/reporting.js";

interface Stub {
  url: string;
  close: () => Promise<void>;
}

async function startStub(handler: http.RequestListener): Promise<Stub> {
  const server = http.createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo | null;
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind JSON-RPC stub server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function jsonStub(body: unknown, status = 200): Promise<Stub> {
  return startStub((_req, res) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
}

function rawStub(payload: string, status = 200): Promise<Stub> {
  return startStub((_req, res) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(payload);
  });
}

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to reject, but it resolved");
}

describe("RpcClient URL validation", function () {
  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("RpcClient unit");
  });

  it("rejects malformed and non-HTTP endpoint URLs at construction", async function () {
    await story("constructor validates HTTP(S) endpoint URLs");

    await step("Non-URL and non-HTTP endpoints are rejected", async () => {
      expect(() => new RpcClient("not-a-url")).to.throw(
        /Invalid JSON-RPC endpoint URL/,
      );
      expect(() => new RpcClient("ftp://127.0.0.1:8545")).to.throw(
        /HTTP or HTTPS/,
      );
    });

    await step("HTTP and HTTPS endpoints are accepted", async () => {
      expect(() => new RpcClient("http://127.0.0.1:8545")).to.not.throw();
      expect(() => new RpcClient("https://example.test")).to.not.throw();
    });
  });
});

describe("RpcClient successful responses", function () {
  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("RpcClient unit");
  });

  it("returns the result field for a well-formed response", async function () {
    await story("valid JSON-RPC responses resolve with their result");

    const stub = await jsonStub({ jsonrpc: "2.0", id: 1, result: "0x7a69" });
    try {
      await step("Request resolves with the result payload", async (ctx) => {
        const client = new RpcClient(stub.url);
        const result = await client.request<string>("eth_chainId");
        await ctx.parameter("result", result);
        expect(result).to.equal("0x7a69");
      });
    } finally {
      await stub.close();
    }
  });

  it("surfaces JSON-RPC error objects as RpcError with code and data", async function () {
    await story("error envelopes become typed RpcError instances");

    const stub = await jsonStub({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: "execution reverted", data: "0xdead" },
    });
    try {
      await step(
        "Error envelope rejects with a typed RpcError",
        async (ctx) => {
          const client = new RpcClient(stub.url);
          const error = (await captureError(() =>
            client.request("eth_call"),
          )) as RpcError;

          await ctx.parameter("code", String(error.code));
          expect(error).to.be.instanceOf(RpcError);
          expect(error.code).to.equal(-32000);
          expect(error.message).to.equal("execution reverted");
          expect(error.data).to.equal("0xdead");
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("surfaces error envelopes without a data field", async function () {
    await story("RpcError omits data when the envelope has none");

    const stub = await jsonStub({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32001, message: "no data supplied" },
    });
    try {
      await step("RpcError carries code and message but no data", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("eth_call"),
        )) as RpcError;

        expect(error).to.be.instanceOf(RpcError);
        expect(error.code).to.equal(-32001);
        expect(error.message).to.equal("no data supplied");
        expect(error.data).to.equal(undefined);
      });
    } finally {
      await stub.close();
    }
  });
});

describe("RpcClient malformed responses", function () {
  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("RpcClient unit");
  });

  it("rejects non-object error envelopes without treating them as RpcError", async function () {
    await story("string error envelopes are not treated as RpcError");

    const stub = await jsonStub({ jsonrpc: "2.0", id: 1, error: "failure" });
    try {
      await step(
        "String error envelope yields a descriptive Error",
        async () => {
          const client = new RpcClient(stub.url);
          const error = (await captureError(() =>
            client.request("test_method"),
          )) as Error;

          expect(error).to.be.instanceOf(Error);
          expect(error).to.not.be.instanceOf(RpcError);
          expect(error.message).to.match(/malformed error envelope/i);
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("rejects error envelopes with a non-numeric code", async function () {
    await story("error.code must be a finite number");

    const stub = await jsonStub({
      jsonrpc: "2.0",
      id: 1,
      error: { code: "oops", message: "bad" },
    });
    try {
      await step("Non-numeric error.code is rejected", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("test_method"),
        )) as Error;

        expect(error).to.not.be.instanceOf(RpcError);
        expect(error.message).to.match(/error\.code must be a finite number/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("rejects error envelopes with a non-string message", async function () {
    await story("error.message must be a string");

    const stub = await jsonStub({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: 42 },
    });
    try {
      await step("Non-string error.message is rejected", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("test_method"),
        )) as Error;

        expect(error).to.not.be.instanceOf(RpcError);
        expect(error.message).to.match(/error\.message must be a string/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("rejects a non-2xx HTTP status", async function () {
    await story("HTTP transport failures surface the status code");

    const stub = await jsonStub({ jsonrpc: "2.0", id: 1, result: "0x1" }, 503);
    try {
      await step("HTTP 503 is reported as a transport failure", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        expect(error.message).to.match(/HTTP request failed with status 503/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("rejects a body that is not valid JSON", async function () {
    await story("invalid JSON bodies are reported clearly");

    const stub = await rawStub("this is not json");
    try {
      await step("Invalid JSON body is rejected", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        expect(error.message).to.match(/not valid JSON/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("rejects a JSON payload that is not an object", async function () {
    await story("array and scalar payloads are rejected");

    const stub = await jsonStub([1, 2, 3]);
    try {
      await step("Array payload is rejected", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        expect(error.message).to.match(/must be a JSON object/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("rejects a response with the wrong jsonrpc version", async function () {
    await story("only jsonrpc 2.0 responses are accepted");

    const stub = await jsonStub({ jsonrpc: "1.0", id: 1, result: "0x1" });
    try {
      await step("jsonrpc 1.0 is rejected", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        expect(error.message).to.match(/invalid or missing jsonrpc version/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("rejects a response whose id does not match the request", async function () {
    await story("response id must match the request id");

    const stub = await jsonStub({ jsonrpc: "2.0", id: 999, result: "0x1" });
    try {
      await step("Mismatched id is rejected", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        expect(error.message).to.match(/id mismatch: expected 1, got 999/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("rejects a response with neither result nor error", async function () {
    await story("responses must carry a result or an error");

    const stub = await jsonStub({ jsonrpc: "2.0", id: 1 });
    try {
      await step("Empty envelope is rejected", async () => {
        const client = new RpcClient(stub.url);
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        expect(error.message).to.match(/neither result nor error/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("propagates non-timeout transport errors unchanged", async function () {
    await story("network failures are rethrown without being masked");

    const stub = await startStub((req) => {
      req.socket.destroy();
    });
    try {
      await step(
        "A dropped connection rejects with a transport error",
        async () => {
          const client = new RpcClient(stub.url);
          const error = (await captureError(() =>
            client.request("eth_chainId"),
          )) as Error;

          expect(error).to.be.instanceOf(Error);
          expect(error.message).to.not.match(/timed out/i);
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("times out a slow response and reports the configured budget", async function () {
    await story("requests abort once the timeout budget is exceeded");

    const stub = await startStub((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }));
      }, 2000);
    });
    try {
      await step("A 50ms budget times out on a 2s response", async (ctx) => {
        const client = new RpcClient(stub.url, { timeoutMs: 50 });
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        await ctx.parameter("message", error.message);
        expect(error.message).to.match(/timed out after 50ms/i);
      });
    } finally {
      await stub.close();
    }
  });

  it("times out when the response body stalls after headers", async function () {
    await story("the timeout budget also covers response body consumption");

    const stub = await startStub((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      // Send headers and a partial body, then stall without ending.
      res.write("{");
    });
    try {
      await step("A stalled body is aborted by the timeout", async (ctx) => {
        const client = new RpcClient(stub.url, { timeoutMs: 50 });
        const error = (await captureError(() =>
          client.request("eth_chainId"),
        )) as Error;

        await ctx.parameter("message", error.message);
        expect(error.message).to.match(/timed out after 50ms/i);
      });
    } finally {
      await stub.close();
    }
  });
});

describe("RPC runner startup diagnostics", function () {
  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("Runner startup");
  });

  it("formats EADDRINUSE startup failures with an actionable port message", async function () {
    await story("port conflicts surface EADDRINUSE guidance");

    const error = await step(
      "Build a startup error from EADDRINUSE output",
      () =>
        buildNodeStartupError({
          exitCode: 1,
          output:
            "Error: listen EADDRINUSE: address already in use 127.0.0.1:38421",
          host: "127.0.0.1",
          port: 38421,
        }),
    );

    await step("Message names the port and RPC_PORT guidance", async () => {
      expect(error.message).to.include("127.0.0.1:38421");
      expect(error.message).to.match(/EADDRINUSE/i);
      expect(error.message).to.match(/already in use|port is already in use/i);
      expect(error.message).to.match(/RPC_PORT/i);
    });
  });

  it("formats signal-terminated startup failures", async function () {
    await story("signals during startup are reported distinctly");

    const error = await step("Build a startup error from a signal", () =>
      buildNodeStartupError({
        signal: "SIGKILL",
        output: "boom",
        host: "127.0.0.1",
        port: 8545,
      }),
    );

    await step("Message names the terminating signal", async () => {
      expect(error.message).to.match(/terminated by signal SIGKILL/i);
    });
  });
});
