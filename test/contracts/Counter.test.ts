/// <reference path="../../types/ethers-contracts/hardhat.d.ts" />

import { expect } from "chai";
import { epic, feature, story } from "allure-js-commons";
import { network } from "hardhat";
import { step } from "../support/reporting.js";

const { ethers, networkHelpers } = await network.create();

describe("Counter", function () {
  beforeEach(async function () {
    await epic("Solidity Contracts");
    await feature("Counter");
  });

  async function deployCounterFixture() {
    const [owner, other, third] = await ethers.getSigners();
    const counter = await ethers.deployContract("Counter", [owner.address]);

    return { counter, owner, other, third };
  }

  describe("counter", function () {
    it("starts with value zero", async function () {
      await story("Initial deployment state");

      const { counter } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step("Read initial value", async () => {
        expect(await counter.value()).to.equal(0n);
      });
    });

    it("increments value and emits CounterIncremented", async function () {
      await story("Anyone can increment");

      const { counter, other } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Non-owner increments the counter",
        { caller: other.address },
        async () => {
          await expect(counter.connect(other).increment())
            .to.emit(counter, "CounterIncremented")
            .withArgs(1n);
        },
      );

      await step("Stored value equals 1", async (ctx) => {
        const value = await counter.value();
        await ctx.parameter("value", value.toString());
        expect(value).to.equal(1n);
      });
    });

    it("allows owner to reset and emits CounterReset", async function () {
      await story("Owner reset clears value");

      const { counter, owner } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step("Increment before reset", async () => {
        await counter.increment();
      });

      await step(
        "Owner resets the counter",
        { caller: owner.address },
        async () => {
          await expect(counter.reset())
            .to.emit(counter, "CounterReset")
            .withArgs(owner.address);
        },
      );

      await step("Stored value returns to 0", async () => {
        expect(await counter.value()).to.equal(0n);
      });
    });

    it("reverts reset from non-owner with Unauthorized error", async function () {
      await story("Only owner may reset");

      const { counter, other } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step("Increment before unauthorized reset", async () => {
        await counter.increment();
      });

      await step(
        "Non-owner reset reverts with Unauthorized",
        { caller: other.address },
        async () => {
          await expect(counter.connect(other).reset())
            .to.be.revertedWithCustomError(counter, "Unauthorized")
            .withArgs(other.address);
        },
      );

      await step("Stored value is unchanged", async (ctx) => {
        const value = await counter.value();
        await ctx.parameter("value", value.toString());
        expect(value).to.equal(1n);
      });
    });

    it("isolates deployment state between fixture calls", async function () {
      await story("Fixture snapshot restores initial state");

      const first = await step("Load first fixture and increment", async () => {
        const deployment =
          await networkHelpers.loadFixture(deployCounterFixture);
        await deployment.counter.increment();
        expect(await deployment.counter.value()).to.equal(1n);
        return deployment;
      });

      void first;

      await step("Second fixture starts fresh at 0", async () => {
        const second =
          await networkHelpers.loadFixture(deployCounterFixture);
        expect(await second.counter.value()).to.equal(0n);
      });
    });
  });

  describe("token", function () {
    it("mints tokens to an address and emits Transfer from zero", async function () {
      await story("Owner mints tokens");

      const { counter, other } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Owner mints tokens to recipient",
        { to: other.address, amount: 1000n },
        async () => {
          await expect(counter.mint(other.address, 1000n))
            .to.emit(counter, "Transfer")
            .withArgs(ethers.ZeroAddress, other.address, 1000n);
        },
      );

      await step("Recipient balance and total supply update", async (ctx) => {
        const balance = await counter.balanceOf(other.address);
        const totalSupply = await counter.totalSupply();
        await ctx.parameter("balanceOf(recipient)", balance.toString());
        await ctx.parameter("totalSupply", totalSupply.toString());
        expect(balance).to.equal(1000n);
        expect(totalSupply).to.equal(1000n);
      });
    });

    it("reverts mint from non-owner with Unauthorized", async function () {
      await story("Only owner may mint");

      const { counter, other } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Non-owner mint reverts with Unauthorized",
        { caller: other.address, to: other.address, amount: 1000n },
        async () => {
          await expect(counter.connect(other).mint(other.address, 1000n))
            .to.be.revertedWithCustomError(counter, "Unauthorized")
            .withArgs(other.address);
        },
      );

      await step("Total supply stays at zero", async () => {
        expect(await counter.totalSupply()).to.equal(0n);
      });
    });

    it("reverts mint to the zero address", async function () {
      await story("Minting to the zero address is rejected");

      const { counter } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Mint to zero address reverts with InvalidAddress",
        { to: ethers.ZeroAddress, amount: 1000n },
        async () => {
          await expect(
            counter.mint(ethers.ZeroAddress, 1000n),
          ).to.be.revertedWithCustomError(counter, "InvalidAddress");
        },
      );
    });

    it("transfers tokens from one address to another", async function () {
      await story("Holder transfers tokens address-to-address");

      const { counter, other, third } = await step(
        "Deploy Counter fixture",
        () => networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: other.address, amount: 1000n },
        async () => {
          await counter.mint(other.address, 1000n);
        },
      );

      await step(
        "Holder transfers tokens to the recipient",
        { from: other.address, to: third.address, amount: 400n },
        async () => {
          await expect(
            counter.connect(other).transfer(other.address, third.address, 400n),
          )
            .to.emit(counter, "Transfer")
            .withArgs(other.address, third.address, 400n);
        },
      );

      await step("Balances reflect the transfer", async (ctx) => {
        const holderBalance = await counter.balanceOf(other.address);
        const recipientBalance = await counter.balanceOf(third.address);
        const totalSupply = await counter.totalSupply();
        await ctx.parameter("balanceOf(holder)", holderBalance.toString());
        await ctx.parameter("balanceOf(recipient)", recipientBalance.toString());
        await ctx.parameter("totalSupply", totalSupply.toString());
        expect(holderBalance).to.equal(600n);
        expect(recipientBalance).to.equal(400n);
        expect(totalSupply).to.equal(1000n);
      });
    });

    it("reverts transfer exceeding balance with InsufficientBalance", async function () {
      await story("Transfers above balance are rejected");

      const { counter, other, third } = await step(
        "Deploy Counter fixture",
        () => networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: other.address, amount: 100n },
        async () => {
          await counter.mint(other.address, 100n);
        },
      );

      await step(
        "Over-balance transfer reverts with InsufficientBalance",
        { from: other.address, to: third.address, amount: 250n, available: 100n },
        async () => {
          await expect(
            counter.connect(other).transfer(other.address, third.address, 250n),
          )
            .to.be.revertedWithCustomError(counter, "InsufficientBalance")
            .withArgs(other.address, 100n, 250n);
        },
      );
    });

    it("reverts transfer when caller does not own the source balance", async function () {
      await story("Only the source address may move its tokens");

      const { counter, other, third } = await step(
        "Deploy Counter fixture",
        () => networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: other.address, amount: 500n },
        async () => {
          await counter.mint(other.address, 500n);
        },
      );

      await step(
        "Third-party transfer of the holder balance reverts",
        { caller: third.address, from: other.address, to: third.address, amount: 100n },
        async () => {
          await expect(
            counter.connect(third).transfer(other.address, third.address, 100n),
          )
            .to.be.revertedWithCustomError(counter, "Unauthorized")
            .withArgs(third.address);
        },
      );
    });

    it("reverts transfer to the zero address", async function () {
      await story("Transferring to the zero address is rejected");

      const { counter, other } = await step("Deploy Counter fixture", () =>
        networkHelpers.loadFixture(deployCounterFixture),
      );

      await step(
        "Owner mints tokens to the holder",
        { to: other.address, amount: 500n },
        async () => {
          await counter.mint(other.address, 500n);
        },
      );

      await step(
        "Transfer to zero address reverts with InvalidAddress",
        { from: other.address, to: ethers.ZeroAddress, amount: 100n },
        async () => {
          await expect(
            counter
              .connect(other)
              .transfer(other.address, ethers.ZeroAddress, 100n),
          ).to.be.revertedWithCustomError(counter, "InvalidAddress");
        },
      );
    });
  });
});
