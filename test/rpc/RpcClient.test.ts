import http from "node:http";
import fs from "node:fs";
import path from "node:path";

import { expect } from "chai";
import { ethers } from "ethers";
import { epic, feature, story } from "allure-js-commons";
// @ts-expect-error run-rpc-tests.mjs has no TypeScript declaration file
import { buildNodeStartupError } from "../../scripts/run-rpc-tests.mjs";
import { RpcClient, RpcError } from "../../src/rpc/RpcClient.js";
import { step } from "../support/reporting.js";

const HEX_QUANTITY_PATTERN = /^0x[0-9a-f]+$/i;

const COUNTER_ARTIFACT_PATH =
  "artifacts/contracts/Counter.sol/Counter.json";

const counterInterface = new ethers.Interface([
  "function mint(address to, uint256 amount)",
  "function transfer(address from, address to, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

interface TransactionReceipt {
  status: string;
  contractAddress: string | null;
}

function loadCounterBytecode(): string {
  const artifactPath = path.resolve(process.cwd(), COUNTER_ARTIFACT_PATH);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
    bytecode: string;
  };
  return artifact.bytecode;
}

function buildDeployData(ownerAddress: string): string {
  const bytecode = loadCounterBytecode();
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address"],
    [ownerAddress],
  );
  return ethers.concat([bytecode, encodedArgs]);
}

async function sendTransaction(
  client: RpcClient,
  tx: Record<string, string>,
): Promise<TransactionReceipt> {
  const txHash = await client.request<string>("eth_sendTransaction", [tx]);
  return waitForReceipt(client, txHash);
}

async function waitForReceipt(
  client: RpcClient,
  txHash: string,
  attempts = 25,
): Promise<TransactionReceipt> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await client.request<TransactionReceipt | null>(
      "eth_getTransactionReceipt",
      [txHash],
    );
    if (receipt) {
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Transaction receipt not found for ${txHash}`);
}

async function readBalance(
  client: RpcClient,
  contractAddress: string,
  account: string,
): Promise<bigint> {
  const data = counterInterface.encodeFunctionData("balanceOf", [account]);
  const raw = await client.request<string>("eth_call", [
    { to: contractAddress, data },
    "latest",
  ]);
  return counterInterface.decodeFunctionResult("balanceOf", raw)[0] as bigint;
}

function assertHexQuantity(value: unknown): asserts value is string {
  expect(value).to.be.a("string");
  expect(value).to.match(HEX_QUANTITY_PATTERN);
}

function requireRpcUrl(): string {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error(
      "RPC_URL environment variable is required for Hardhat integration tests",
    );
  }
  return rpcUrl;
}

async function startJsonRpcStub(
  responseBody: unknown,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(responseBody));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind JSON-RPC stub server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("RpcClient malformed JSON-RPC error envelopes", function () {
  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("Malformed envelopes");
  });

  it("rejects non-object error envelopes with a descriptive Error", async function () {
    await story("string error envelopes are not treated as RpcError");

    const stub = await startJsonRpcStub({
      jsonrpc: "2.0",
      id: 1,
      error: "failure",
    });

    try {
      await step("Request a stub returning a string error envelope", async () => {
        const client = new RpcClient(stub.url);

        try {
          await client.request("test_method");
          expect.fail("Expected malformed JSON-RPC error envelope rejection");
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect(error).to.not.be.instanceOf(RpcError);
          expect(error).to.not.be.instanceOf(TypeError);
          expect((error as Error).message).to.match(
            /malformed error envelope/i,
          );
        }
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

    const error = await step("Build a startup error from EADDRINUSE output", () =>
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
});

describe("RpcClient URL validation", function () {
  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("Hardhat node");
  });

  it("rejects malformed endpoint URLs at construction", async function () {
    await story("constructor validates HTTP(S) endpoint URLs");

    await step("Non-URL and non-HTTP endpoints are rejected", async () => {
      expect(() => new RpcClient("not-a-url")).to.throw(
        /Invalid JSON-RPC endpoint URL/,
      );
      expect(() => new RpcClient("ftp://127.0.0.1:8545")).to.throw(
        /HTTP or HTTPS/,
      );
    });
  });
});

describe("RpcClient Hardhat integration", function () {
  let client: RpcClient;

  before(function () {
    client = new RpcClient(requireRpcUrl());
  });

  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("Hardhat node");
  });

  it("returns the local Hardhat chain id", async function () {
    await story("eth_chainId returns 0x7a69");

    const chainId = await step(
      "Call eth_chainId",
      { method: "eth_chainId" },
      async (ctx) => {
        const result = await client.request<string>("eth_chainId");
        await ctx.parameter("result", result);
        return result;
      },
    );

    await step("Chain id equals 0x7a69", async () => {
      expect(chainId).to.equal("0x7a69");
    });
  });

  it("returns a valid hex block number", async function () {
    await story("eth_blockNumber returns a hex quantity");

    const blockNumber = await step(
      "Call eth_blockNumber",
      { method: "eth_blockNumber" },
      async (ctx) => {
        const result = await client.request<string>("eth_blockNumber");
        await ctx.parameter("result", result);
        return result;
      },
    );

    await step("Block number is a hex quantity", async () => {
      assertHexQuantity(blockNumber);
    });
  });

  it("returns a positive balance for a funded test account", async function () {
    await story("eth_getBalance returns a positive hex quantity");

    const accounts = await step(
      "Call eth_accounts",
      { method: "eth_accounts" },
      async (ctx) => {
        const result = await client.request<string[]>("eth_accounts");
        expect(result).to.be.an("array").that.is.not.empty;
        await ctx.parameter("count", String(result.length));
        return result;
      },
    );

    const balance = await step(
      "Call eth_getBalance for the first account",
      { method: "eth_getBalance", account: accounts[0], block: "latest" },
      async (ctx) => {
        const result = await client.request<string>("eth_getBalance", [
          accounts[0],
          "latest",
        ]);
        await ctx.parameter("result", result);
        return result;
      },
    );

    await step("Balance is a positive hex quantity", async () => {
      assertHexQuantity(balance);
      expect(BigInt(balance)).to.be.greaterThan(0n);
    });
  });

  it("rejects unsupported RPC methods as RpcError", async function () {
    await story("unknown methods surface JSON-RPC errors");

    await step(
      "Unsupported method rejects with RpcError",
      { method: "eth_nonexistentMethod_xyz" },
      async (ctx) => {
        try {
          await client.request("eth_nonexistentMethod_xyz");
          expect.fail("Expected RpcError for unsupported method");
        } catch (error) {
          expect(error).to.be.instanceOf(RpcError);
          const rpcError = error as RpcError;
          await ctx.parameter("code", String(rpcError.code));
          await ctx.parameter("message", rpcError.message);
          expect(rpcError.code).to.equal(-32004);
          expect(rpcError.message).to.include("not supported");
        }
      },
    );
  });
});

describe("RpcClient contract methods over JSON-RPC", function () {
  let client: RpcClient;
  let accounts: string[];

  before(async function () {
    client = new RpcClient(requireRpcUrl());
    accounts = await client.request<string[]>("eth_accounts");
    expect(accounts.length).to.be.greaterThan(2);
  });

  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("Contract calls");
  });

  it("deploys the Counter contract via eth_sendTransaction", async function () {
    await story("eth_sendTransaction deploys contract bytecode");

    const owner = accounts[0];

    const receipt = await step(
      "Deploy Counter through eth_sendTransaction",
      { method: "eth_sendTransaction", from: owner },
      async (ctx) => {
        const result = await sendTransaction(client, {
          from: owner,
          data: buildDeployData(owner),
        });
        await ctx.parameter("status", result.status);
        await ctx.parameter("contractAddress", result.contractAddress ?? "null");
        return result;
      },
    );

    await step("Deployment receipt reports success and an address", async () => {
      expect(receipt.status).to.equal("0x1");
      expect(receipt.contractAddress).to.be.a("string");
    });
  });

  it("mints and transfers tokens through JSON-RPC calls", async function () {
    await story("eth_sendTransaction drives mint and address-to-address transfer");

    const owner = accounts[0];
    const holder = accounts[1];
    const recipient = accounts[2];

    const contractAddress = await step(
      "Deploy Counter contract",
      { method: "eth_sendTransaction", from: owner },
      async (ctx) => {
        const receipt = await sendTransaction(client, {
          from: owner,
          data: buildDeployData(owner),
        });
        expect(receipt.status).to.equal("0x1");
        expect(receipt.contractAddress).to.be.a("string");
        await ctx.parameter("contractAddress", receipt.contractAddress ?? "null");
        return receipt.contractAddress as string;
      },
    );

    await step(
      "Owner mints tokens to the holder",
      {
        method: "eth_sendTransaction",
        call: "mint",
        from: owner,
        to: holder,
        amount: 1000n,
      },
      async (ctx) => {
        const data = counterInterface.encodeFunctionData("mint", [
          holder,
          1000n,
        ]);
        const receipt = await sendTransaction(client, {
          from: owner,
          to: contractAddress,
          data,
        });
        await ctx.parameter("status", receipt.status);
        expect(receipt.status).to.equal("0x1");
      },
    );

    await step(
      "eth_call reports the minted holder balance",
      { method: "eth_call", call: "balanceOf", account: holder },
      async (ctx) => {
        const balance = await readBalance(client, contractAddress, holder);
        await ctx.parameter("balanceOf(holder)", balance.toString());
        expect(balance).to.equal(1000n);
      },
    );

    await step(
      "Holder transfers tokens to the recipient",
      {
        method: "eth_sendTransaction",
        call: "transfer",
        from: holder,
        to: recipient,
        amount: 400n,
      },
      async (ctx) => {
        const data = counterInterface.encodeFunctionData("transfer", [
          holder,
          recipient,
          400n,
        ]);
        const receipt = await sendTransaction(client, {
          from: holder,
          to: contractAddress,
          data,
        });
        await ctx.parameter("status", receipt.status);
        expect(receipt.status).to.equal("0x1");
      },
    );

    await step(
      "eth_call confirms balances after transfer",
      { method: "eth_call", call: "balanceOf" },
      async (ctx) => {
        const holderBalance = await readBalance(client, contractAddress, holder);
        const recipientBalance = await readBalance(
          client,
          contractAddress,
          recipient,
        );
        await ctx.parameter("balanceOf(holder)", holderBalance.toString());
        await ctx.parameter(
          "balanceOf(recipient)",
          recipientBalance.toString(),
        );
        expect(holderBalance).to.equal(600n);
        expect(recipientBalance).to.equal(400n);
      },
    );
  });

  it("reverts an over-balance transfer surfaced through the receipt", async function () {
    await story("insufficient-balance transfers fail on-chain");

    const owner = accounts[0];
    const holder = accounts[1];
    const recipient = accounts[2];

    const contractAddress = await step(
      "Deploy and mint tokens to the holder",
      { call: "mint", from: owner, to: holder, amount: 100n },
      async (ctx) => {
        const deployment = await sendTransaction(client, {
          from: owner,
          data: buildDeployData(owner),
        });
        const address = deployment.contractAddress as string;

        const mintData = counterInterface.encodeFunctionData("mint", [
          holder,
          100n,
        ]);
        await sendTransaction(client, {
          from: owner,
          to: address,
          data: mintData,
        });
        await ctx.parameter("contractAddress", address);
        return address;
      },
    );

    await step(
      "Over-balance transfer is rejected by the node",
      {
        method: "eth_sendTransaction",
        call: "transfer",
        from: holder,
        to: recipient,
        amount: 250n,
        available: 100n,
      },
      async () => {
        const data = counterInterface.encodeFunctionData("transfer", [
          holder,
          recipient,
          250n,
        ]);

        try {
          await sendTransaction(client, {
            from: holder,
            to: contractAddress,
            data,
          });
          expect.fail("Expected the over-balance transfer to revert");
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
        }
      },
    );

    await step(
      "Holder balance is unchanged after the failed transfer",
      { method: "eth_call", call: "balanceOf", account: holder },
      async (ctx) => {
        const balance = await readBalance(client, contractAddress, holder);
        await ctx.parameter("balanceOf(holder)", balance.toString());
        expect(balance).to.equal(100n);
      },
    );
  });
});
