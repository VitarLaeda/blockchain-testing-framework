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
      const deployment = await networkHelpers.loadFixture(deployCounterFixture);
      await deployment.counter.increment();
      expect(await deployment.counter.value()).to.equal(1n);
      return deployment;
    });

    void first;

    await step("Second fixture starts fresh at 0", async () => {
      const second = await networkHelpers.loadFixture(deployCounterFixture);
      expect(await second.counter.value()).to.equal(0n);
    });
  });
});
