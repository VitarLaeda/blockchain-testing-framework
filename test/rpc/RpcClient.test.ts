import fs from "node:fs";
import path from "node:path";

import { expect } from "chai";
import { ethers } from "ethers";
import { epic, feature, story } from "allure-js-commons";
import { RpcClient, RpcError } from "../../src/rpc/RpcClient.js";
import { step } from "../support/reporting.js";

const HEX_QUANTITY_PATTERN = /^0x[0-9a-f]+$/i;

const COUNTER_ARTIFACT_PATH = "artifacts/contracts/Counter.sol/Counter.json";
const TOKEN_ARTIFACT_PATH = "artifacts/contracts/MiniToken.sol/MiniToken.json";

const counterInterface = new ethers.Interface([
  "function increment()",
  "function value() view returns (uint256)",
]);

const tokenInterface = new ethers.Interface([
  "function mint(address to, uint256 amount)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

interface TransactionReceipt {
  status: string;
  contractAddress: string | null;
}

function loadBytecode(artifactPath: string): string {
  const resolved = path.resolve(process.cwd(), artifactPath);
  const artifact = JSON.parse(fs.readFileSync(resolved, "utf8")) as {
    bytecode: string;
  };
  return artifact.bytecode;
}

function buildCounterDeployData(ownerAddress: string): string {
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address"],
    [ownerAddress],
  );
  return ethers.concat([loadBytecode(COUNTER_ARTIFACT_PATH), encodedArgs]);
}

function buildTokenDeployData(
  name: string,
  symbol: string,
  ownerAddress: string,
): string {
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "address"],
    [name, symbol, ownerAddress],
  );
  return ethers.concat([loadBytecode(TOKEN_ARTIFACT_PATH), encodedArgs]);
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

async function readTokenBalance(
  client: RpcClient,
  contractAddress: string,
  account: string,
): Promise<bigint> {
  const data = tokenInterface.encodeFunctionData("balanceOf", [account]);
  const raw = await client.request<string>("eth_call", [
    { to: contractAddress, data },
    "latest",
  ]);
  return tokenInterface.decodeFunctionResult("balanceOf", raw)[0] as bigint;
}

async function readCounterValue(
  client: RpcClient,
  contractAddress: string,
): Promise<bigint> {
  const data = counterInterface.encodeFunctionData("value", []);
  const raw = await client.request<string>("eth_call", [
    { to: contractAddress, data },
    "latest",
  ]);
  return counterInterface.decodeFunctionResult("value", raw)[0] as bigint;
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

describe("Counter over JSON-RPC", function () {
  let client: RpcClient;
  let owner: string;

  before(async function () {
    client = new RpcClient(requireRpcUrl());
    const accounts = await client.request<string[]>("eth_accounts");
    owner = accounts[0];
  });

  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("Contract calls");
  });

  it("deploys and increments the Counter through raw JSON-RPC", async function () {
    await story("eth_sendTransaction deploys and drives Counter state");

    const contractAddress = await step(
      "Deploy Counter through eth_sendTransaction",
      { method: "eth_sendTransaction", from: owner },
      async (ctx) => {
        const receipt = await sendTransaction(client, {
          from: owner,
          data: buildCounterDeployData(owner),
        });
        expect(receipt.status).to.equal("0x1");
        expect(receipt.contractAddress).to.be.a("string");
        await ctx.parameter(
          "contractAddress",
          receipt.contractAddress ?? "null",
        );
        return receipt.contractAddress as string;
      },
    );

    await step(
      "Increment the counter",
      { method: "eth_sendTransaction", call: "increment", from: owner },
      async (ctx) => {
        const data = counterInterface.encodeFunctionData("increment", []);
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
      "eth_call reports the incremented value",
      { method: "eth_call", call: "value" },
      async (ctx) => {
        const value = await readCounterValue(client, contractAddress);
        await ctx.parameter("value", value.toString());
        expect(value).to.equal(1n);
      },
    );
  });
});

describe("MiniToken over JSON-RPC", function () {
  let client: RpcClient;
  let owner: string;
  let holder: string;
  let recipient: string;
  let spender: string;

  before(async function () {
    client = new RpcClient(requireRpcUrl());
    const accounts = await client.request<string[]>("eth_accounts");
    expect(accounts.length).to.be.greaterThan(3);
    [owner, holder, recipient, spender] = accounts;
  });

  beforeEach(async function () {
    await epic("JSON-RPC");
    await feature("Contract calls");
  });

  async function deployToken(): Promise<string> {
    const receipt = await sendTransaction(client, {
      from: owner,
      data: buildTokenDeployData("Mini Token", "MINI", owner),
    });
    expect(receipt.status).to.equal("0x1");
    return receipt.contractAddress as string;
  }

  it("mints and transfers tokens through JSON-RPC calls", async function () {
    await story("eth_sendTransaction drives mint and transfer");

    const contractAddress = await step(
      "Deploy MiniToken contract",
      { method: "eth_sendTransaction", from: owner },
      async (ctx) => {
        const address = await deployToken();
        await ctx.parameter("contractAddress", address);
        return address;
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
        const data = tokenInterface.encodeFunctionData("mint", [holder, 1000n]);
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
        const balance = await readTokenBalance(client, contractAddress, holder);
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
        const data = tokenInterface.encodeFunctionData("transfer", [
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
        const holderBalance = await readTokenBalance(
          client,
          contractAddress,
          holder,
        );
        const recipientBalance = await readTokenBalance(
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

  it("spends an allowance via approve and transferFrom over JSON-RPC", async function () {
    await story("eth_sendTransaction drives approve and transferFrom");

    const contractAddress = await step(
      "Deploy MiniToken and mint to the holder",
      { call: "mint", from: owner, to: holder, amount: 1000n },
      async (ctx) => {
        const address = await deployToken();
        const mintData = tokenInterface.encodeFunctionData("mint", [
          holder,
          1000n,
        ]);
        const receipt = await sendTransaction(client, {
          from: owner,
          to: address,
          data: mintData,
        });
        expect(receipt.status).to.equal("0x1");
        await ctx.parameter("contractAddress", address);
        return address;
      },
    );

    await step(
      "Holder approves the spender",
      {
        method: "eth_sendTransaction",
        call: "approve",
        from: holder,
        spender,
        amount: 400n,
      },
      async (ctx) => {
        const data = tokenInterface.encodeFunctionData("approve", [
          spender,
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
      "Spender transfers holder tokens to the recipient",
      {
        method: "eth_sendTransaction",
        call: "transferFrom",
        from: spender,
        holder,
        to: recipient,
        amount: 400n,
      },
      async (ctx) => {
        const data = tokenInterface.encodeFunctionData("transferFrom", [
          holder,
          recipient,
          400n,
        ]);
        const receipt = await sendTransaction(client, {
          from: spender,
          to: contractAddress,
          data,
        });
        await ctx.parameter("status", receipt.status);
        expect(receipt.status).to.equal("0x1");
      },
    );

    await step(
      "eth_call confirms the recipient received the tokens",
      { method: "eth_call", call: "balanceOf", account: recipient },
      async (ctx) => {
        const recipientBalance = await readTokenBalance(
          client,
          contractAddress,
          recipient,
        );
        await ctx.parameter(
          "balanceOf(recipient)",
          recipientBalance.toString(),
        );
        expect(recipientBalance).to.equal(400n);
      },
    );
  });

  it("reverts an over-balance transfer surfaced through the receipt", async function () {
    await story("insufficient-balance transfers fail on-chain");

    const contractAddress = await step(
      "Deploy MiniToken and mint tokens to the holder",
      { call: "mint", from: owner, to: holder, amount: 100n },
      async (ctx) => {
        const address = await deployToken();
        const mintData = tokenInterface.encodeFunctionData("mint", [
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
        const data = tokenInterface.encodeFunctionData("transfer", [
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
        const balance = await readTokenBalance(client, contractAddress, holder);
        await ctx.parameter("balanceOf(holder)", balance.toString());
        expect(balance).to.equal(100n);
      },
    );
  });
});
