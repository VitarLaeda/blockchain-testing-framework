/// <reference path="../../types/ethers-contracts/hardhat.d.ts" />

import { expect } from "chai";
import { epic, feature, story } from "allure-js-commons";
import { network } from "hardhat";
import { step } from "../support/reporting.js";

const { ethers, networkHelpers } = await network.create();

describe("MiniToken", function () {
  beforeEach(async function () {
    await epic("Solidity Contracts");
    await feature("MiniToken");
  });

  async function deployTokenFixture() {
    const [owner, holder, recipient, spender] = await ethers.getSigners();
    const token = await ethers.deployContract("MiniToken", [
      "Mini Token",
      "MINI",
      owner.address,
    ]);

    return { token, owner, holder, recipient, spender };
  }

  describe("metadata", function () {
    it("exposes name, symbol, and decimals", async function () {
      await story("token metadata is set at deployment");

      const { token } = await step("Deploy MiniToken fixture", () =>
        networkHelpers.loadFixture(deployTokenFixture),
      );

      await step("Metadata matches the constructor arguments", async (ctx) => {
        const [name, symbol, decimals] = await Promise.all([
          token.name(),
          token.symbol(),
          token.decimals(),
        ]);
        await ctx.parameter("name", name);
        await ctx.parameter("symbol", symbol);
        await ctx.parameter("decimals", decimals.toString());
        expect(name).to.equal("Mini Token");
        expect(symbol).to.equal("MINI");
        expect(decimals).to.equal(18n);
      });
    });
  });

  describe("mint", function () {
    it("mints tokens to an address and emits Transfer from zero", async function () {
      await story("Owner mints tokens");

      const { token, holder } = await step("Deploy MiniToken fixture", () =>
        networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: holder.address, amount: 1000n },
        async () => {
          await expect(token.mint(holder.address, 1000n))
            .to.emit(token, "Transfer")
            .withArgs(ethers.ZeroAddress, holder.address, 1000n);
        },
      );

      await step("Holder balance and total supply update", async (ctx) => {
        const balance = await token.balanceOf(holder.address);
        const totalSupply = await token.totalSupply();
        await ctx.parameter("balanceOf(holder)", balance.toString());
        await ctx.parameter("totalSupply", totalSupply.toString());
        expect(balance).to.equal(1000n);
        expect(totalSupply).to.equal(1000n);
      });
    });

    it("reverts mint from a non-owner with Unauthorized", async function () {
      await story("Only owner may mint");

      const { token, holder } = await step("Deploy MiniToken fixture", () =>
        networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Non-owner mint reverts with Unauthorized",
        { caller: holder.address, to: holder.address, amount: 1000n },
        async () => {
          await expect(token.connect(holder).mint(holder.address, 1000n))
            .to.be.revertedWithCustomError(token, "Unauthorized")
            .withArgs(holder.address);
        },
      );

      await step("Total supply stays at zero", async () => {
        expect(await token.totalSupply()).to.equal(0n);
      });
    });

    it("reverts mint to the zero address", async function () {
      await story("Minting to the zero address is rejected");

      const { token } = await step("Deploy MiniToken fixture", () =>
        networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Mint to zero address reverts with InvalidAddress",
        { to: ethers.ZeroAddress, amount: 1000n },
        async () => {
          await expect(
            token.mint(ethers.ZeroAddress, 1000n),
          ).to.be.revertedWithCustomError(token, "InvalidAddress");
        },
      );
    });
  });

  describe("transfer", function () {
    it("transfers tokens from the caller to another account", async function () {
      await story("Holder transfers its own tokens");

      const { token, holder, recipient } = await step(
        "Deploy MiniToken fixture",
        () => networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: holder.address, amount: 1000n },
        async () => {
          await token.mint(holder.address, 1000n);
        },
      );

      await step(
        "Holder transfers tokens to the recipient",
        { from: holder.address, to: recipient.address, amount: 400n },
        async () => {
          await expect(token.connect(holder).transfer(recipient.address, 400n))
            .to.emit(token, "Transfer")
            .withArgs(holder.address, recipient.address, 400n);
        },
      );

      await step("Balances reflect the transfer", async (ctx) => {
        const holderBalance = await token.balanceOf(holder.address);
        const recipientBalance = await token.balanceOf(recipient.address);
        await ctx.parameter("balanceOf(holder)", holderBalance.toString());
        await ctx.parameter(
          "balanceOf(recipient)",
          recipientBalance.toString(),
        );
        expect(holderBalance).to.equal(600n);
        expect(recipientBalance).to.equal(400n);
      });
    });

    it("reverts a transfer exceeding balance with InsufficientBalance", async function () {
      await story("Transfers above balance are rejected");

      const { token, holder, recipient } = await step(
        "Deploy MiniToken fixture",
        () => networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: holder.address, amount: 100n },
        async () => {
          await token.mint(holder.address, 100n);
        },
      );

      await step(
        "Over-balance transfer reverts with InsufficientBalance",
        {
          from: holder.address,
          to: recipient.address,
          amount: 250n,
          available: 100n,
        },
        async () => {
          await expect(token.connect(holder).transfer(recipient.address, 250n))
            .to.be.revertedWithCustomError(token, "InsufficientBalance")
            .withArgs(holder.address, 100n, 250n);
        },
      );
    });

    it("reverts a transfer to the zero address", async function () {
      await story("Transferring to the zero address is rejected");

      const { token, holder } = await step("Deploy MiniToken fixture", () =>
        networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: holder.address, amount: 500n },
        async () => {
          await token.mint(holder.address, 500n);
        },
      );

      await step(
        "Transfer to zero address reverts with InvalidAddress",
        { from: holder.address, to: ethers.ZeroAddress, amount: 100n },
        async () => {
          await expect(
            token.connect(holder).transfer(ethers.ZeroAddress, 100n),
          ).to.be.revertedWithCustomError(token, "InvalidAddress");
        },
      );
    });
  });

  describe("approve and transferFrom", function () {
    it("sets an allowance and emits Approval", async function () {
      await story("Holder approves a spender");

      const { token, holder, spender } = await step(
        "Deploy MiniToken fixture",
        () => networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Holder approves the spender",
        { owner: holder.address, spender: spender.address, amount: 300n },
        async () => {
          await expect(token.connect(holder).approve(spender.address, 300n))
            .to.emit(token, "Approval")
            .withArgs(holder.address, spender.address, 300n);
        },
      );

      await step("Allowance is recorded", async (ctx) => {
        const allowance = await token.allowance(
          holder.address,
          spender.address,
        );
        await ctx.parameter("allowance", allowance.toString());
        expect(allowance).to.equal(300n);
      });
    });

    it("spends an allowance through transferFrom and decrements it", async function () {
      await story("Spender moves tokens on the holder's behalf");

      const { token, owner, holder, recipient, spender } = await step(
        "Deploy MiniToken fixture",
        () => networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Owner mints and holder approves the spender",
        { to: holder.address, amount: 1000n, allowance: 400n },
        async () => {
          await token.connect(owner).mint(holder.address, 1000n);
          await token.connect(holder).approve(spender.address, 400n);
        },
      );

      await step(
        "Spender transfers holder tokens to the recipient",
        {
          caller: spender.address,
          from: holder.address,
          to: recipient.address,
          amount: 400n,
        },
        async () => {
          await expect(
            token
              .connect(spender)
              .transferFrom(holder.address, recipient.address, 400n),
          )
            .to.emit(token, "Transfer")
            .withArgs(holder.address, recipient.address, 400n);
        },
      );

      await step("Balances and allowance update", async (ctx) => {
        const holderBalance = await token.balanceOf(holder.address);
        const recipientBalance = await token.balanceOf(recipient.address);
        const remaining = await token.allowance(
          holder.address,
          spender.address,
        );
        await ctx.parameter("balanceOf(holder)", holderBalance.toString());
        await ctx.parameter(
          "balanceOf(recipient)",
          recipientBalance.toString(),
        );
        await ctx.parameter("allowance", remaining.toString());
        expect(holderBalance).to.equal(600n);
        expect(recipientBalance).to.equal(400n);
        expect(remaining).to.equal(0n);
      });
    });

    it("reverts transferFrom that exceeds the allowance", async function () {
      await story("Spending above the allowance is rejected");

      const { token, owner, holder, recipient, spender } = await step(
        "Deploy MiniToken fixture",
        () => networkHelpers.loadFixture(deployTokenFixture),
      );

      await step(
        "Owner mints and holder approves a small allowance",
        { to: holder.address, amount: 1000n, allowance: 100n },
        async () => {
          await token.connect(owner).mint(holder.address, 1000n);
          await token.connect(holder).approve(spender.address, 100n);
        },
      );

      await step(
        "Over-allowance transferFrom reverts with InsufficientAllowance",
        {
          caller: spender.address,
          from: holder.address,
          to: recipient.address,
          amount: 250n,
          allowance: 100n,
        },
        async () => {
          await expect(
            token
              .connect(spender)
              .transferFrom(holder.address, recipient.address, 250n),
          )
            .to.be.revertedWithCustomError(token, "InsufficientAllowance")
            .withArgs(spender.address, 100n, 250n);
        },
      );
    });
  });
});
