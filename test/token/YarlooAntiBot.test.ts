import { waffle } from "hardhat";
import { expect } from "chai";

import YarlooTokenTestArtifacts from "../../artifacts/contracts/YarlooTest.sol/YarlooTest.json";

import { YarlooTest } from "../../typechain";
import { Wallet, BigNumber } from "ethers";
import { getBigNumber, latest, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

describe("Yarloo Anti-bot", () => {
  const [deployer, alice, bob, carol, uniswap] = provider.getWallets() as Wallet[];

  let yarlooToken: YarlooTest;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, YarlooTokenTestArtifacts, [])) as YarlooTest;
  }

  beforeEach(async () => {
    yarlooToken = await makeSUT();
    await yarlooToken.setMaxTransferAmount(getBigNumber(60000));
    await yarlooToken.excludeFromFee(alice.address);
    await yarlooToken.excludeFromFee(bob.address);
    await yarlooToken.excludeFromFee(carol.address);
    await yarlooToken.excludeFromFee(uniswap.address);
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      await expect(yarlooToken.connect(alice).setTradingStart(1)).to.be.revertedWith("caller is not the owner");
      await expect(yarlooToken.connect(alice).setMaxTransferAmount(1)).to.be.revertedWith("caller is not the owner");
      await expect(yarlooToken.connect(alice).setRestrictionActive(false)).to.be.revertedWith("caller is not the owner");
      await expect(yarlooToken.connect(alice).unthrottleAccount(alice.address, true)).to.be.revertedWith("caller is not the owner");
      await expect(yarlooToken.connect(alice).whitelistAccount(alice.address, true)).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("Before trading time", () => {
    describe("transfer", () => {
      it("transfer should revert when executed before trading time and transaction is not from or to the owner", async function () {
        await expect(yarlooToken.connect(alice).transfer(bob.address, one_hundred)).to.be.revertedWith("Protection: Transfers disabled");
      });

      it("transfer should be executed if transaction is to or from the owner address", async function () {
        await expect(yarlooToken.transfer(alice.address, getBigNumber(150000)))
          .to.emit(yarlooToken, "Transfer")
          .withArgs(deployer.address, alice.address, getBigNumber(150000));

        await expect(yarlooToken.connect(alice).transfer(deployer.address, getBigNumber(150000)))
          .to.emit(yarlooToken, "Transfer")
          .withArgs(alice.address, deployer.address, getBigNumber(150000));
      });

      it("transfer should be executed if transaction is to or from the unthrottle address", async function () {
        await yarlooToken.transfer(alice.address, getBigNumber(150000));

        await yarlooToken.unthrottleAccount(alice.address, true);

        await expect(yarlooToken.connect(alice).transfer(bob.address, getBigNumber(150000)))
          .to.emit(yarlooToken, "Transfer")
          .withArgs(alice.address, bob.address, getBigNumber(150000));

        await expect(yarlooToken.connect(bob).transfer(alice.address, getBigNumber(150000)))
          .to.emit(yarlooToken, "Transfer")
          .withArgs(bob.address, alice.address, getBigNumber(150000));
      });
    });

    describe("transferFrom", () => {
      it("transferFrom should be reverted when executed before trading time and transaction is not from or to the owner", async function () {
        await yarlooToken.transfer(alice.address, getBigNumber(150000));
        await yarlooToken.connect(alice).approve(bob.address, getBigNumber(150000));

        await expect(yarlooToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(150000))).to.be.revertedWith("Protection: Transfers disabled");
      });

      it("transferFrom should be executed if transaction is to or from the owner address", async function () {
        await yarlooToken.approve(bob.address, getBigNumber(150000));
        await expect(yarlooToken.connect(bob).transferFrom(deployer.address, bob.address, getBigNumber(150000)))
          .to.emit(yarlooToken, "Transfer")
          .withArgs(deployer.address, bob.address, getBigNumber(150000));
      });
    });
  });

  describe("During restriction time", () => {
    beforeEach(async () => {
      await advanceTimeAndBlock(3 * 24 * 3600);
    });

    it("transfer should revert when amount exceeds max limit", async function () {
      await yarlooToken.transfer(uniswap.address, getBigNumber(150000));

      // transfer
      await expect(yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(150000))).to.be.revertedWith("Protection: Limit exceeded");

      // prevents 1 tx per 30 sec limit
      await advanceTimeAndBlock(30);

      // transferFrom
      await yarlooToken.connect(alice).approve(bob.address, getBigNumber(150000));
      await expect(yarlooToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(150000))).to.be.revertedWith("Protection: Limit exceeded");
    });

    it("should transfer correctly when amount under max limit", async function () {
      // transfer
      await expect(yarlooToken.transfer(alice.address, getBigNumber(50000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(50000));

      // prevents 1 tx per 30 sec limit
      await advanceTimeAndBlock(30);

      // transferFrom
      await yarlooToken.connect(alice).approve(bob.address, getBigNumber(50000));
      await expect(yarlooToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(50000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(50000));
    });

    it("should revert when more then one transfer per min for the same address when not whitelisted", async function () {
      await yarlooToken.transfer(uniswap.address, getBigNumber(50000));

      await yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(50000));

      await yarlooToken.connect(alice).approve(bob.address, getBigNumber(50000));
      await expect(yarlooToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(50000))).to.be.revertedWith("Protection: 30 sec/tx allowed");
    });

    it("whitelisted account should transfer to different accounts without transaction limits", async function () {
      await yarlooToken.whitelistAccount(uniswap.address, true);
      await yarlooToken.transfer(uniswap.address, getBigNumber(50000));

      await expect(yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      await expect(yarlooToken.connect(uniswap).transfer(bob.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(uniswap.address, bob.address, getBigNumber(1000));

      await yarlooToken.connect(uniswap).approve(carol.address, getBigNumber(10000));
      await expect(yarlooToken.connect(carol).transferFrom(uniswap.address, carol.address, getBigNumber(10000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(uniswap.address, carol.address, getBigNumber(10000));
    });

    it("whitelisted account should receive from different accounts without transaction limits", async function () {
      await yarlooToken.transfer(alice.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);
      await yarlooToken.transfer(bob.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);
      await yarlooToken.transfer(carol.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);

      await yarlooToken.whitelistAccount(uniswap.address, true);

      // transfer
      await expect(yarlooToken.connect(alice).transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, uniswap.address, getBigNumber(1000));

      // transferFrom
      await yarlooToken.connect(bob).approve(uniswap.address, getBigNumber(1000));
      await expect(yarlooToken.connect(uniswap).transferFrom(bob.address, uniswap.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(bob.address, uniswap.address, getBigNumber(1000));
    });

    it("transfers between whitelisted accounts should not be restricted by amount of transactions per min", async function () {
      await yarlooToken.whitelistAccount(deployer.address, true);
      await yarlooToken.whitelistAccount(uniswap.address, true);

      // transfer
      await expect(yarlooToken.transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(deployer.address, uniswap.address, getBigNumber(1000));

      // transferFrom
      await yarlooToken.connect(uniswap).approve(deployer.address, getBigNumber(1000));
      await expect(yarlooToken.connect(deployer).transferFrom(uniswap.address, deployer.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(uniswap.address, deployer.address, getBigNumber(1000));
    });

    it("sender to the whitelisted account should be restricted by amount of transactions per min", async function () {
      await yarlooToken.transfer(alice.address, getBigNumber(10000));
      await advanceTimeAndBlock(60);

      await yarlooToken.whitelistAccount(uniswap.address, true);

      // transfer 1
      await expect(yarlooToken.connect(alice).transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, uniswap.address, getBigNumber(1000));

      // transfer 2
      await expect(yarlooToken.connect(alice).transfer(uniswap.address, getBigNumber(1000))).to.be.revertedWith("Protection: 30 sec/tx allowed");
    });

    it("receiver from the whitelisted account should be restricted by amount of transactions per min", async function () {
      await yarlooToken.whitelistAccount(uniswap.address, true);
      await yarlooToken.transfer(uniswap.address, getBigNumber(10000));

      // transfer 1
      await expect(yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      // transfer 2
      await expect(yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(1000))).to.be.revertedWith("Protection: 30 sec/tx allowed");
    });
  });

  describe("Without transfer amount limit", () => {
    beforeEach(async () => {
      await advanceTimeAndBlock(3 * 24 * 3600);
      await yarlooToken.setMaxTransferAmount(0);
    });

    it("should transfer correctly without amount limits", async function () {
      // transfer
      await expect(yarlooToken.transfer(alice.address, getBigNumber(1000000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(1000000));

      await advanceTimeAndBlock(30);

      // transferFrom
      await yarlooToken.connect(alice).approve(bob.address, getBigNumber(1000000));
      await expect(yarlooToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(1000000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(1000000));
    });
  });

  describe("setTradingStart", () => {
    it("should change trading time correctly", async function () {
      const currentTradingTimeEnd: BigNumber = (await latest()).add(3 * 24 * 3600);

      await yarlooToken.transfer(alice.address, getBigNumber(200000));
      await expect(yarlooToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Transfers disabled");

      await expect(yarlooToken.setTradingStart(currentTradingTimeEnd.add(24 * 3600)))
        .to.emit(yarlooToken, "TradingTimeChanged")
        .withArgs(currentTradingTimeEnd.add(24 * 3600));

      // time after initial trading and restriction lift time
      await advanceTimeAndBlock(3 * 24 * 3600);
      // should still be disabled
      await expect(yarlooToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Transfers disabled");

      await advanceTimeAndBlock(24 * 3600);
      // should be restricted by limit
      await expect(yarlooToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Limit exceeded");

      // should transfer correctly
      await expect(yarlooToken.connect(alice).transfer(bob.address, getBigNumber(60000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(60000));
    });

    it("it should revert when trading time already started", async function () {
      await advanceTimeAndBlock(3 * 24 * 3600);
      await expect(yarlooToken.setTradingStart(1000)).to.be.revertedWith("To late");
    });
  });

  describe("setMaxTransferAmount", () => {
    it("it should correctly change max restriction amount", async function () {
      await yarlooToken.transfer(alice.address, getBigNumber(200000));
      await advanceTimeAndBlock(3 * 24 * 3600);

      await expect(yarlooToken.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Limit exceeded");

      await expect(yarlooToken.setMaxTransferAmount(getBigNumber(200000)))
        .to.emit(yarlooToken, "MaxTransferAmountChanged")
        .withArgs(getBigNumber(200000));

      await expect(yarlooToken.connect(alice).transfer(bob.address, getBigNumber(200000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(200000));
    });
  });

  describe("whitelistAccount", () => {
    it("should revert if address zero is passed as account argument", async function () {
      await expect(yarlooToken.whitelistAccount(ZERO_ADDRESS, true)).to.be.revertedWith("Zero address");
      await expect(yarlooToken.whitelistAccount(ZERO_ADDRESS, false)).to.be.revertedWith("Zero address");
    });

    it("should set unthrottled and emit event correctly", async function () {
      await expect(yarlooToken.whitelistAccount(alice.address, true)).to.emit(yarlooToken, "MarkedWhitelisted").withArgs(alice.address, true);

      expect(await yarlooToken.isWhitelisted(alice.address)).to.be.equal(true);

      await expect(yarlooToken.whitelistAccount(alice.address, false)).to.emit(yarlooToken, "MarkedWhitelisted").withArgs(alice.address, false);

      expect(await yarlooToken.isWhitelisted(alice.address)).to.be.equal(false);
    });

    it("should correctly add and remove user from whitelist and correctly emit event", async function () {
      expect(await yarlooToken.isWhitelisted(uniswap.address)).to.be.equal(false);

      await expect(yarlooToken.whitelistAccount(uniswap.address, true)).to.emit(yarlooToken, "MarkedWhitelisted").withArgs(uniswap.address, true);

      expect(await yarlooToken.isWhitelisted(uniswap.address)).to.be.equal(true);

      await expect(yarlooToken.whitelistAccount(uniswap.address, false)).to.emit(yarlooToken, "MarkedWhitelisted").withArgs(uniswap.address, false);
    });
  });

  describe("restriction active", () => {
    beforeEach(async () => {
      await advanceTimeAndBlock(3 * 24 * 3600);
    });

    it("should emit event correctly", async function () {
      await expect(yarlooToken.setRestrictionActive(false)).to.emit(yarlooToken, "RestrictionActiveChanged").withArgs(false);
    });

    it("should revert if restriction is active", async function () {
      await yarlooToken.transfer(uniswap.address, getBigNumber(1000000));

      // reverted on amount exceeded
      await expect(yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(1000000))).to.be.revertedWith("Protection: Limit exceeded");

      // transfer
      await expect(yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      // revert on 30 sec/tx allowed
      await expect(yarlooToken.connect(uniswap).transfer(alice.address, getBigNumber(1000))).to.be.revertedWith("Protection: 30 sec/tx allowed");
    });

    it("should not be restricted when restriction is not active", async function () {
      await yarlooToken.setRestrictionActive(false);

      // no revert on amount exceeded
      await expect(yarlooToken.transfer(alice.address, getBigNumber(1000000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(1000000));

      // no revert on 1 tx/min allowed
      await expect(yarlooToken.transfer(alice.address, getBigNumber(1000)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(1000));
    });
  });

  describe("unthrottle", () => {
    beforeEach(async () => {
      await advanceTimeAndBlock(3 * 24 * 3600);
    });

    it("should revert if address zero is passed as account argument", async function () {
      await expect(yarlooToken.unthrottleAccount(ZERO_ADDRESS, true)).to.be.revertedWith("Zero address");
      await expect(yarlooToken.unthrottleAccount(ZERO_ADDRESS, false)).to.be.revertedWith("Zero address");
    });

    it("should set unthrottled and emit event correctly", async function () {
      await expect(yarlooToken.unthrottleAccount(alice.address, true)).to.emit(yarlooToken, "MarkedUnthrottled").withArgs(alice.address, true);

      expect(await yarlooToken.isUnthrottled(alice.address)).to.be.equal(true);

      await expect(yarlooToken.unthrottleAccount(alice.address, false)).to.emit(yarlooToken, "MarkedUnthrottled").withArgs(alice.address, false);

      expect(await yarlooToken.isUnthrottled(alice.address)).to.be.equal(false);
    });
  });
});
