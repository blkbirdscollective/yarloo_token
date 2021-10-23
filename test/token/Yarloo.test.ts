import { waffle } from "hardhat";
import { expect } from "chai";
import { Wallet, BigNumber, constants } from "ethers";

import YarlooTokenTestArtifacts from "../../artifacts/contracts/YarlooTest.sol/YarlooTest.json";

import { YarlooTest } from "../../typechain";
import { getBigNumber, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;
const { MaxUint256 } = constants;

describe("Yarloo BEP20", () => {
  const [deployer, alice, bob, staking] = provider.getWallets() as Wallet[];

  let yarlooToken: YarlooTest;

  const YARLOO_TOKENS: BigNumber = getBigNumber(25_000_000);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, YarlooTokenTestArtifacts, [])) as YarlooTest;
  }

  beforeEach(async () => {
    yarlooToken = await makeSUT();
    await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
    await yarlooToken.setRestrictionActive(false);
    await yarlooToken.excludeFromFee(alice.address);
    await yarlooToken.excludeFromFee(bob.address);
    await yarlooToken.excludeFromFee(staking.address);
  });

  it("should initialize as expected", async function () {
    const _yarlooToken = await makeSUT();
    expect(await _yarlooToken.name()).to.be.equal("Yarloo");
    expect(await _yarlooToken.symbol()).to.be.equal("YARL");
    expect(await _yarlooToken.decimals()).to.be.equal(18);
    expect(await _yarlooToken.totalSupply()).to.be.equal(YARLOO_TOKENS);
  });

  it("should distribute tokens correctly", async function () {
    expect(await yarlooToken.balanceOf(deployer.address)).to.be.equal(YARLOO_TOKENS);
  });

  describe("balanceOf", () => {
    it("should correctly return user balance", async function () {
      await yarlooToken.transfer(alice.address, 1007);

      expect(await yarlooToken.balanceOf(alice.address)).to.be.equal(1007);
      expect(await yarlooToken.balanceOf(deployer.address)).to.be.equal(YARLOO_TOKENS.sub(1007));
    });
  });

  describe("transfer", () => {
    it("should revert if transfer to the zero address", async function () {
      await expect(yarlooToken.transfer(ZERO_ADDRESS, getBigNumber(200))).to.be.revertedWith("BEP20: transfer to the zero address");
    });

    it("should revert if transfer amount exceeds balance", async function () {
      await expect(yarlooToken.connect(alice).transfer(alice.address, 1007)).to.be.revertedWith("BEP20: transfer amount exceeds balance");
    });

    it("should revert if amount is 0", async function () {
      await expect(yarlooToken.transfer(alice.address, 0)).to.be.revertedWith("Transfer amount must be greater than zero");
    });

    it("should transfer correctly with emit events", async function () {
      await expect(yarlooToken.transfer(alice.address, getBigNumber(200)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(200));
    });
  });

  describe("transferFrom", () => {
    it("should revert when amount exceeds allowance", async function () {
      await yarlooToken.transfer(alice.address, getBigNumber(200));
      await yarlooToken.connect(alice).approve(bob.address, getBigNumber(100));

      await expect(yarlooToken.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(150))).to.be.revertedWith(
        "BEP20: transfer amount exceeds allowance"
      );
    });

    it("should decrease allowance after transferFrom when allowance not set to MaxUint256", async function () {
      await yarlooToken.approve(alice.address, MaxUint256.sub(1));
      await yarlooToken.connect(alice).transferFrom(deployer.address, alice.address, one_hundred);

      expect(await yarlooToken.allowance(deployer.address, alice.address)).to.be.equal(MaxUint256.sub(1).sub(one_hundred));
    });

    it("should correctly transferFrom and emit events", async function () {
      await yarlooToken.transfer(alice.address, getBigNumber(200));
      await yarlooToken.connect(alice).approve(staking.address, getBigNumber(200));

      await expect(yarlooToken.connect(staking).transferFrom(alice.address, staking.address, getBigNumber(100)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, staking.address, getBigNumber(100))
        .and.to.emit(yarlooToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(100));

      expect(await yarlooToken.balanceOf(alice.address)).to.be.equal(getBigNumber(100));

      await expect(yarlooToken.connect(staking).transferFrom(alice.address, bob.address, getBigNumber(50)))
        .to.emit(yarlooToken, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(50))
        .and.to.emit(yarlooToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(50));

      expect(await yarlooToken.balanceOf(alice.address)).to.be.equal(getBigNumber(50));
    });
  });

  describe("approve", () => {
    it("should revert when approve to the zero address", async function () {
      await expect(yarlooToken.approve(ZERO_ADDRESS, getBigNumber(200))).to.be.revertedWith("BEP20: approve to the zero address");
    });

    it("should correctly update allowance", async function () {
      await expect(yarlooToken.connect(alice).approve(staking.address, getBigNumber(100)))
        .to.emit(yarlooToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(100));
      expect(await yarlooToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(100));

      await expect(yarlooToken.connect(alice).approve(staking.address, getBigNumber(40)))
        .to.emit(yarlooToken, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(40));
      expect(await yarlooToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(40));
    });
  });

  describe("increaseAllowance", () => {
    it("should correctly increase allowance", async function () {
      await yarlooToken.connect(alice).approve(staking.address, getBigNumber(100));
      await yarlooToken.connect(alice).increaseAllowance(staking.address, getBigNumber(40));

      expect(await yarlooToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(140));
    });
  });

  describe("decreaseAllowance", () => {
    it("should revert if amount to decrease is greater than allowance", async function () {
      await yarlooToken.connect(alice).approve(staking.address, getBigNumber(100));

      await expect(yarlooToken.connect(alice).decreaseAllowance(staking.address, getBigNumber(110))).to.be.revertedWith("BEP20: decreased allowance below zero");
    });

    it("should correctly decrease allowance", async function () {
      await yarlooToken.connect(alice).approve(staking.address, getBigNumber(100));
      await yarlooToken.connect(alice).decreaseAllowance(staking.address, getBigNumber(40));

      expect(await yarlooToken.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(60));
    });
  });
});
