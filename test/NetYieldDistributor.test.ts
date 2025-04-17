import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { checkContractUupsUpgrading, connect, getAddress, proveTx } from "../test-utils/eth";
import { checkEquality, maxUintForBits, setUpFixture } from "../test-utils/common";

const EXPECTED_VERSION: Version = {
  major: 1,
  minor: 0,
  patch: 0
};

const ROLES = {
  OWNER_ROLE: ethers.id("OWNER_ROLE"),
  PAUSER_ROLE: ethers.id("PAUSER_ROLE"),
  MINTER_ROLE: ethers.id("MINTER_ROLE"),
  MANAGER_ROLE: ethers.id("MANAGER_ROLE"),
  RESCUER_ROLE: ethers.id("RESCUER_ROLE")
};

const EVENTS = {
  OperationalTreasuryUpdated: "OperationalTreasuryUpdated",
  AssetYieldMinted: "AssetYieldMinted",
  AssetYieldBurned: "AssetYieldBurned",
  NetYieldAdvanced: "NetYieldAdvanced",
  NetYieldReduced: "NetYieldReduced"
};

const ERRORS = {
  NetYieldDistributor_InvalidInitialization: "InvalidInitialization",
  NetYieldDistributor_AccessControlUnauthorizedAccount: "AccessControlUnauthorizedAccount",
  NetYieldDistributor_ImplementationAddressInvalid: "NetYieldDistributor_ImplementationAddressInvalid",
  NetYieldDistributor_UnderlyingTokenAddressZero: "NetYieldDistributor_UnderlyingTokenAddressZero",
  NetYieldDistributor_TreasuryAddressAlreadySet: "NetYieldDistributor_TreasuryAddressAlreadySet",
  NetYieldDistributor_AccountsAndAmountsLengthMismatch: "NetYieldDistributor_AccountsAndAmountsLengthMismatch",
  NetYieldDistributor_AccountAddressZero: "NetYieldDistributor_AccountAddressZero",
  NetYieldDistributor_AmountZero: "NetYieldDistributor_AmountZero",
  NetYieldDistributor_AdvanceNetYieldInsufficientBalance: "NetYieldDistributor_AdvanceNetYieldInsufficientBalance",
  NetYieldDistributor_AccountsArrayEmpty: "NetYieldDistributor_AccountsArrayEmpty",
  EnforcedPause: "EnforcedPause"
};

const ADDRESS_ZERO = ethers.ZeroAddress;
const ALLOWANCE_MAX = ethers.MaxUint256;

const YIELD_AMOUNT_BASE = 12_345_678n;
const YIELD_AMOUNT_VARIANTS: bigint[] = [
  YIELD_AMOUNT_BASE,
  YIELD_AMOUNT_BASE * 2n,
  YIELD_AMOUNT_BASE * 3n,
  YIELD_AMOUNT_BASE * 4n
];

const YIELD_AMOUNT = 1_000_000_000n;

interface Version {
  major: number;
  minor: number;
  patch: number;

  [key: string]: number; // Indexing signature to ensure that fields are iterated over in a key-value style
}

interface Fixture {
  netYieldDistributor: Contract;
  tokenMock: Contract;
}

describe("Contract 'NetYieldDistributor'", async () => {
  let netYieldDistributorFactory: ContractFactory;

  let deployer: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let manager: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let users: HardhatEthersSigner[];

  before(async () => {
    let moreUsers: HardhatEthersSigner[];
    [deployer, minter, manager, treasury, stranger, user, ...moreUsers] = await ethers.getSigners();
    users = [user, ...moreUsers];

    netYieldDistributorFactory = await ethers.getContractFactory("NetYieldDistributor");
    netYieldDistributorFactory = netYieldDistributorFactory.connect(deployer);
  });

  async function deployTokenMock(): Promise<Contract> {
    const name = "ERC20 Test";
    const symbol = "TEST";

    let tokenMockFactory = await ethers.getContractFactory("ERC20TokenMock");
    tokenMockFactory = tokenMockFactory.connect(deployer);

    let tokenMock: Contract = await tokenMockFactory.deploy(name, symbol) as Contract;
    await tokenMock.waitForDeployment();
    tokenMock = connect(tokenMock, deployer);

    return tokenMock;
  }

  async function deployContracts(): Promise<Fixture> {
    const tokenMock = await deployTokenMock();

    let netYieldDistributor: Contract = await upgrades.deployProxy(
      netYieldDistributorFactory,
      [getAddress(tokenMock)]
    ) as Contract;
    await netYieldDistributor.waitForDeployment();
    netYieldDistributor = connect(netYieldDistributor, deployer);

    return {
      netYieldDistributor,
      tokenMock
    };
  }

  async function deployAndConfigureContracts(): Promise<Fixture> {
    const fixture = await deployContracts();
    const { netYieldDistributor, tokenMock } = fixture;

    await proveTx(netYieldDistributor.grantRole(ROLES.MINTER_ROLE, minter.address));
    await proveTx(netYieldDistributor.grantRole(ROLES.MANAGER_ROLE, manager.address));
    await proveTx(netYieldDistributor.setOperationalTreasury(treasury.address));

    await proveTx(tokenMock.mint(treasury.address, YIELD_AMOUNT));
    await proveTx(connect(tokenMock, treasury).approve(getAddress(netYieldDistributor), ALLOWANCE_MAX));

    return fixture;
  }

  async function pauseContract(contract: Contract) {
    await proveTx(contract.grantRole(ROLES.PAUSER_ROLE, deployer.address));
    await proveTx(contract.pause());
  }

  describe("Function 'initialize()'", async () => {
    it("Configures the contract correctly", async () => {
      const { netYieldDistributor, tokenMock } = await setUpFixture(deployContracts);

      expect(await netYieldDistributor.OWNER_ROLE()).to.equal(ROLES.OWNER_ROLE);
      expect(await netYieldDistributor.MANAGER_ROLE()).to.equal(ROLES.MANAGER_ROLE);
      expect(await netYieldDistributor.MINTER_ROLE()).to.equal(ROLES.MINTER_ROLE);
      expect(await netYieldDistributor.PAUSER_ROLE()).to.equal(ROLES.PAUSER_ROLE);
      expect(await netYieldDistributor.RESCUER_ROLE()).to.equal(ROLES.RESCUER_ROLE);

      expect(await netYieldDistributor.getRoleAdmin(ROLES.OWNER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await netYieldDistributor.getRoleAdmin(ROLES.MANAGER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await netYieldDistributor.getRoleAdmin(ROLES.MINTER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await netYieldDistributor.getRoleAdmin(ROLES.PAUSER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await netYieldDistributor.getRoleAdmin(ROLES.RESCUER_ROLE)).to.equal(ROLES.OWNER_ROLE);

      expect(await netYieldDistributor.hasRole(ROLES.OWNER_ROLE, deployer.address)).to.equal(true);
      expect(await netYieldDistributor.hasRole(ROLES.MANAGER_ROLE, deployer.address)).to.equal(false);
      expect(await netYieldDistributor.hasRole(ROLES.MINTER_ROLE, deployer.address)).to.equal(false);
      expect(await netYieldDistributor.hasRole(ROLES.PAUSER_ROLE, deployer.address)).to.equal(false);
      expect(await netYieldDistributor.hasRole(ROLES.RESCUER_ROLE, deployer.address)).to.equal(false);

      expect(await netYieldDistributor.underlyingToken()).to.equal(getAddress(tokenMock));
      expect(await netYieldDistributor.operationalTreasury()).to.equal(ADDRESS_ZERO);
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(0);
      expect(await netYieldDistributor.totalAdvancedYield()).to.equal(0);
      expect(await netYieldDistributor.totalReducedYield()).to.equal(0);
    });

    describe("Is reverted if", async () => {
      it("Called a second time", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployContracts);

        await expect(
          netYieldDistributor.initialize(getAddress(tokenMock))
        ).to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_InvalidInitialization);
      });

      it("Passed token address is zero", async () => {
        const anotherNetYieldDistributorContract: Contract = await upgrades.deployProxy(
          netYieldDistributorFactory,
          [],
          { initializer: false }
        ) as Contract;

        await expect(
          anotherNetYieldDistributorContract.initialize(ADDRESS_ZERO)
        ).to.be.revertedWithCustomError(netYieldDistributorFactory, ERRORS.NetYieldDistributor_UnderlyingTokenAddressZero);
      });
    });
  });

  describe("Function 'upgradeToAndCall()'", async () => {
    it("Performs the upgrade correctly", async () => {
      const { netYieldDistributor } = await setUpFixture(deployContracts);

      await checkContractUupsUpgrading(netYieldDistributor, netYieldDistributorFactory);
    });

    describe("Is reverted if", async () => {
      it("Caller lacks `OWNER_ROLE`", async () => {
        const { netYieldDistributor } = await setUpFixture(deployContracts);

        await expect(connect(netYieldDistributor, stranger).upgradeToAndCall(getAddress(netYieldDistributor), "0x"))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.OWNER_ROLE);
      });

      it("Implementation address is invalid", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployContracts);

        await expect(netYieldDistributor.upgradeToAndCall(getAddress(tokenMock), "0x"))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_ImplementationAddressInvalid);
      });
    });
  });

  describe("Function 'proveNetYieldDistributor()'", async () => {
    it("Executes without reverting", async () => {
      const { netYieldDistributor } = await setUpFixture(deployContracts);

      await expect(netYieldDistributor.proveNetYieldDistributor()).to.not.be.reverted;
    });
  });

  describe("Function 'setOperationalTreasury()'", async () => {
    it("Updates treasury and emits the correct event", async () => {
      const { netYieldDistributor } = await setUpFixture(deployContracts);

      await expect(netYieldDistributor.setOperationalTreasury(treasury.address))
        .to.emit(netYieldDistributor, EVENTS.OperationalTreasuryUpdated)
        .withArgs(treasury.address, ADDRESS_ZERO);
      expect(await netYieldDistributor.operationalTreasury()).to.eq(treasury.address);

      await expect(netYieldDistributor.setOperationalTreasury(ADDRESS_ZERO))
        .to.emit(netYieldDistributor, EVENTS.OperationalTreasuryUpdated)
        .withArgs(ADDRESS_ZERO, treasury.address);
      expect(await netYieldDistributor.operationalTreasury()).to.eq(ADDRESS_ZERO);
    });

    describe("Is reverted if", async () => {
      it("Caller lacks `OWNER_ROLE`", async () => {
        const { netYieldDistributor } = await setUpFixture(deployContracts);

        await expect(connect(netYieldDistributor, stranger).setOperationalTreasury(treasury.address))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.OWNER_ROLE);

        await proveTx(netYieldDistributor.grantRole(ROLES.MANAGER_ROLE, manager.address));
        await expect(connect(netYieldDistributor, manager).setOperationalTreasury(treasury.address))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(manager.address, ROLES.OWNER_ROLE);
      });

      it("New treasury address is the same as the previous one", async () => {
        const { netYieldDistributor } = await setUpFixture(deployContracts);

        await expect(netYieldDistributor.setOperationalTreasury(ADDRESS_ZERO))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_TreasuryAddressAlreadySet);

        await proveTx(netYieldDistributor.setOperationalTreasury(treasury.address));

        await expect(netYieldDistributor.setOperationalTreasury(treasury.address))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_TreasuryAddressAlreadySet);
      });
    });
  });

  describe("Function 'mintAssetYield()'", async () => {
    it("Mints tokens and emits the correct event", async () => {
      const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const amount = YIELD_AMOUNT;

      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(0);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(0);

      await expect(connect(netYieldDistributor, minter).mintAssetYield(amount))
        .to.emit(netYieldDistributor, EVENTS.AssetYieldMinted)
        .withArgs(amount);

      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(amount);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(amount);
    });

    it("Allows multiple mint operations", async () => {
      const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const amount1 = YIELD_AMOUNT;
      const amount2 = YIELD_AMOUNT * 2n;
      const totalAmount = amount1 + amount2;

      await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount1));
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(amount1);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(amount1);

      await expect(connect(netYieldDistributor, minter).mintAssetYield(amount2))
        .to.emit(netYieldDistributor, EVENTS.AssetYieldMinted)
        .withArgs(amount2);

      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(totalAmount);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(totalAmount);
    });

    describe("Is reverted if", async () => {
      it("Contract is paused", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT));
        await pauseContract(netYieldDistributor);

        await expect(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.EnforcedPause);
      });

      it("Caller lacks `MINTER_ROLE`", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT));

        await expect(connect(netYieldDistributor, stranger).mintAssetYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MINTER_ROLE);

        await expect(connect(netYieldDistributor, manager).mintAssetYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(manager.address, ROLES.MINTER_ROLE);
      });
    });
  });

  describe("Function 'burnAssetYield()'", async () => {
    it("Burns tokens and emits the correct event", async () => {
      const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const mintAmount = YIELD_AMOUNT * 2n;
      const burnAmount = YIELD_AMOUNT;
      const remainingAmount = mintAmount - burnAmount;
      await proveTx(connect(netYieldDistributor, minter).mintAssetYield(mintAmount));
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(mintAmount);

      await expect(connect(netYieldDistributor, minter).burnAssetYield(burnAmount))
        .to.emit(netYieldDistributor, EVENTS.AssetYieldBurned)
        .withArgs(burnAmount);

      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(remainingAmount);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(remainingAmount);
    });

    it("Allows multiple burn operations", async () => {
      const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const mintAmount = YIELD_AMOUNT * 4n;
      const burn1 = YIELD_AMOUNT;
      const burn2 = YIELD_AMOUNT * 2n;
      const remainingAmount = mintAmount - burn1 - burn2;
      await proveTx(connect(netYieldDistributor, minter).mintAssetYield(mintAmount));

      await proveTx(connect(netYieldDistributor, minter).burnAssetYield(burn1));
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(mintAmount - burn1);

      await proveTx(connect(netYieldDistributor, minter).burnAssetYield(burn2));
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(remainingAmount);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(remainingAmount);
    });

    it("Can burn entire yield balance", async () => {
      const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const amount = YIELD_AMOUNT;
      await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount));
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(amount);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(amount);

      await proveTx(connect(netYieldDistributor, minter).burnAssetYield(amount));
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(0);
      expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(0);
    });

    describe("Is reverted if", async () => {
      it("Contract is paused", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT));
        await pauseContract(netYieldDistributor);

        await expect(connect(netYieldDistributor, minter).burnAssetYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.EnforcedPause);
      });

      it("Caller lacks `MINTER_ROLE`", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT));

        await expect(connect(netYieldDistributor, stranger).burnAssetYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MINTER_ROLE);

        await expect(connect(netYieldDistributor, manager).burnAssetYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(manager.address, ROLES.MINTER_ROLE);
      });

      it("Amount exceeds contract token balance", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        const mintAmount = YIELD_AMOUNT;
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(mintAmount));

        const burnAmount = mintAmount * 2n;
        await expect(connect(netYieldDistributor, minter).burnAssetYield(burnAmount))
          .to.be.reverted;
      });
    });
  });

  describe("Function 'advanceNetYield()'", async () => {
    describe("Successfully executes when", async () => {
      it("Advancing to a single account", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const amount = YIELD_AMOUNT_BASE;
        const account = user.address;

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount * 2n));

        const tx = connect(netYieldDistributor, manager).advanceNetYield([account], [amount]);

        await expect(tx)
          .to.emit(netYieldDistributor, EVENTS.NetYieldAdvanced)
          .withArgs(account, amount);

        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(netYieldDistributor), account],
          [-amount, amount]
        );

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(account)).to.equal(amount);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(amount);

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(account)).to.equal(amount);
        expect(await netYieldDistributor.totalAdvanceNetYieldOf(account)).to.equal(amount);
      });

      it("Advancing to multiple accounts, including duplicates", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const transferCount = 4;
        const accounts = users.slice(0, transferCount - 1).map(user => user.address);
        accounts.push(users[0].address);
        const amounts = YIELD_AMOUNT_VARIANTS.slice(0, transferCount - 1);
        amounts.push(YIELD_AMOUNT_VARIANTS[transferCount - 1]);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(totalAmount * 2n));

        const tx = await connect(netYieldDistributor, manager).advanceNetYield(accounts, amounts);

        for (let i = 0; i < accounts.length - 1; ++i) {
          await expect(tx)
            .to.emit(netYieldDistributor, EVENTS.NetYieldAdvanced)
            .withArgs(accounts[i], amounts[i]);
        }
        await expect(tx)
          .to.emit(netYieldDistributor, EVENTS.NetYieldAdvanced)
          .withArgs(accounts[transferCount - 1], amounts[transferCount - 1]);

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[0])).to.equal(amounts[0] + amounts[transferCount - 1]);
        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[1])).to.equal(amounts[1]);
        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[2])).to.equal(amounts[2]);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(totalAmount);

        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(netYieldDistributor), accounts[0], accounts[1], accounts[2]],
          [-totalAmount, (amounts[0] + amounts[transferCount - 1]), amounts[1], amounts[2]]
        );

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[0])).to.equal(amounts[0] + amounts[transferCount - 1]);
        expect(await netYieldDistributor.totalAdvanceNetYieldOf(accounts[0])).to.equal(amounts[0] + amounts[transferCount - 1]);
        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[1])).to.equal(amounts[1]);
        expect(await netYieldDistributor.totalAdvanceNetYieldOf(accounts[1])).to.equal(amounts[1]);
        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[2])).to.equal(amounts[2]);
        expect(await netYieldDistributor.totalAdvanceNetYieldOf(accounts[2])).to.equal(amounts[2]);
      });
    });

    describe("Is reverted if", async () => {
      it("Contract is paused", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT_BASE * 2n));
        await pauseContract(netYieldDistributor);

        await expect(connect(netYieldDistributor, manager).advanceNetYield([user.address], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.EnforcedPause);
      });

      it("Caller lacks `MANAGER_ROLE`", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT_BASE * 2n));

        await expect(connect(netYieldDistributor, minter).advanceNetYield([user.address], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(minter.address, ROLES.MANAGER_ROLE);

        await expect(connect(netYieldDistributor, stranger).advanceNetYield([user.address], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MANAGER_ROLE);

        await expect(connect(netYieldDistributor, deployer).advanceNetYield([user.address], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(deployer.address, ROLES.MANAGER_ROLE);
      });

      it("Arrays length mismatch", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT_BASE * 2n));

        const accounts = [user.address, users[1].address];
        const amounts = [YIELD_AMOUNT_BASE];

        await expect(connect(netYieldDistributor, manager).advanceNetYield(accounts, amounts))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccountsAndAmountsLengthMismatch);

        await expect(connect(netYieldDistributor, manager).advanceNetYield([], amounts))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccountsAndAmountsLengthMismatch);
      });

      it("Accounts array is empty", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT_BASE));

        await expect(connect(netYieldDistributor, manager).advanceNetYield([], []))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccountsArrayEmpty);
      });

      it("Account address is zero", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT_BASE * 2n));
        const accounts = [user.address, ADDRESS_ZERO];
        const amounts = [YIELD_AMOUNT_BASE, YIELD_AMOUNT_BASE];

        await expect(connect(netYieldDistributor, manager).advanceNetYield(accounts, amounts))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccountAddressZero);
      });

      it("Amount is zero", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(YIELD_AMOUNT_BASE * 2n));
        const accounts = [users[0].address, users[1].address];
        const amounts = [YIELD_AMOUNT_BASE, 0n];

        await expect(connect(netYieldDistributor, manager).advanceNetYield(accounts, amounts))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AmountZero);
      });

      it("Contract has insufficient balance", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        const smallAmount = YIELD_AMOUNT_BASE / 2n;
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(smallAmount));

        await expect(
          connect(netYieldDistributor, manager).advanceNetYield([user.address], [YIELD_AMOUNT_BASE])
        ).to.be.reverted;
      });
    });
  });

  describe("Function 'reduceAdvanceNetYield()'", async () => {
    describe("Successfully executes when", async () => {
      it("Reducing a single account's full yield balance", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const amount = YIELD_AMOUNT_BASE;
        const account = user.address;

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount * 2n));
        await proveTx(connect(netYieldDistributor, manager).advanceNetYield([account], [amount]));

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(account)).to.equal(amount);
        expect(await netYieldDistributor.totalAdvanceNetYieldOf(account)).to.equal(amount);

        const tx = connect(netYieldDistributor, manager).reduceAdvanceNetYield([account], [amount]);
        await expect(tx)
          .to.emit(netYieldDistributor, EVENTS.NetYieldReduced)
          .withArgs(account, amount);

        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [treasury.address, getAddress(netYieldDistributor)],
          [-amount, 0]
        );

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(account)).to.equal(0);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(0);
        expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(amount);

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(account)).to.equal(0);
        expect(await netYieldDistributor.totalAdvanceNetYieldOf(account)).to.equal(amount);
      });

      it("Reducing yield balance for multiple accounts", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const accounts = users.slice(0, 3).map(user => user.address);
        const amounts = YIELD_AMOUNT_VARIANTS.slice(0, 3);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(totalAmount * 2n));
        await proveTx(connect(netYieldDistributor, manager).advanceNetYield(accounts, amounts));

        const initialTotals = [];
        for (let i = 0; i < accounts.length; i++) {
          expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[i])).to.equal(amounts[i]);
          const total = await netYieldDistributor.totalAdvanceNetYieldOf(accounts[i]);
          initialTotals.push(total);
          expect(total).to.equal(amounts[i]);
        }

        const tx = connect(netYieldDistributor, manager).reduceAdvanceNetYield(accounts, amounts);
        await expect(tx)
          .to.emit(netYieldDistributor, EVENTS.NetYieldReduced)
          .withArgs(accounts[0], amounts[0])
          .to.emit(netYieldDistributor, EVENTS.NetYieldReduced)
          .withArgs(accounts[1], amounts[1])
          .to.emit(netYieldDistributor, EVENTS.NetYieldReduced)
          .withArgs(accounts[2], amounts[2]);

        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [treasury.address, getAddress(netYieldDistributor)],
          [-totalAmount, 0]
        );

        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[0])).to.equal(0);
        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[1])).to.equal(0);
        expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[2])).to.equal(0);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(0);
        expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(totalAmount);

        for (let i = 0; i < accounts.length; i++) {
          expect(await netYieldDistributor.currentAdvanceNetYieldOf(accounts[i])).to.equal(0);
          expect(await netYieldDistributor.totalAdvanceNetYieldOf(accounts[i])).to.equal(initialTotals[i]);
        }
      });
    });

    describe("Updates `total net yield supply` correctly", async () => {
      it("When decreasing yield balance for accounts sequentially", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);

        const initialAmount = YIELD_AMOUNT_BASE * 2n;
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(initialAmount));

        const accounts = [users[0].address, users[1].address];
        const amounts = [YIELD_AMOUNT_BASE, YIELD_AMOUNT_BASE / 2n];
        const totalAdvancedYieldAmount = amounts[0] + amounts[1];

        await proveTx(connect(netYieldDistributor, manager).advanceNetYield(accounts, amounts));

        expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(initialAmount);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(totalAdvancedYieldAmount);
        expect(await tokenMock.balanceOf(getAddress(netYieldDistributor))).to.equal(initialAmount - totalAdvancedYieldAmount);

        await proveTx(connect(netYieldDistributor, manager).reduceAdvanceNetYield([accounts[0]], [amounts[0]]));

        expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(initialAmount - amounts[0]);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(amounts[1]);
        expect(await tokenMock.balanceOf(treasury.address)).to.equal(YIELD_AMOUNT - amounts[0]);

        await proveTx(connect(netYieldDistributor, manager).reduceAdvanceNetYield([accounts[1]], [amounts[1]]));

        expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(initialAmount - totalAdvancedYieldAmount);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(0);
        expect(await tokenMock.balanceOf(treasury.address)).to.equal(YIELD_AMOUNT - totalAdvancedYieldAmount);
      });

      it("When decreasing yield balance for multiple accounts in batch", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);

        const initialAmount = YIELD_AMOUNT_BASE * 6n;
        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(initialAmount));

        const accounts = users.slice(0, 3).map(user => user.address);
        const amounts = YIELD_AMOUNT_VARIANTS.slice(0, 3);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        await proveTx(connect(netYieldDistributor, manager).advanceNetYield(accounts, amounts));

        expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(initialAmount);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(totalAmount);
        const initialTreasuryBalance = await tokenMock.balanceOf(treasury.address);

        await proveTx(connect(netYieldDistributor, manager).reduceAdvanceNetYield(accounts, amounts));

        expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(initialAmount - totalAmount);
        expect(await netYieldDistributor.totalAdvancedYield()).to.equal(0);

        expect(await tokenMock.balanceOf(treasury.address)).to.equal(initialTreasuryBalance - totalAmount);
      });
    });

    describe("Is reverted if", async () => {
      it("Contract is paused", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        const amount = YIELD_AMOUNT_BASE;
        const account = user.address;

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount * 2n));
        await proveTx(connect(netYieldDistributor, manager).advanceNetYield([account], [amount]));
        await pauseContract(netYieldDistributor);

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([account], [amount]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.EnforcedPause);
      });

      it("Caller lacks `MANAGER_ROLE`", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(netYieldDistributor, stranger).reduceAdvanceNetYield([user.address], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MANAGER_ROLE);

        await expect(connect(netYieldDistributor, minter).reduceAdvanceNetYield([user.address], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(minter.address, ROLES.MANAGER_ROLE);

        await expect(connect(netYieldDistributor, deployer).reduceAdvanceNetYield([user.address], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(deployer.address, ROLES.MANAGER_ROLE);
      });

      it("Accounts and amounts arrays have different lengths", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        const accounts = [user.address, users[1].address];
        const amounts = [YIELD_AMOUNT_BASE];

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield(accounts, amounts))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccountsAndAmountsLengthMismatch);
      });

      it("Accounts array is empty", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([], []))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccountsArrayEmpty);
      });

      it("Account address is zero", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([ADDRESS_ZERO], [YIELD_AMOUNT_BASE]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AccountAddressZero);
      });

      it("Amount is zero", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([user.address], [0]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AmountZero);
      });

      it("Decrease amount exceeds current yield balance", async () => {
        const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
        const initialAmount = YIELD_AMOUNT_BASE;
        const excessAmount = initialAmount + 1n;
        const account = user.address;

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(initialAmount * 2n));

        await proveTx(connect(netYieldDistributor, manager).advanceNetYield([account], [initialAmount]));

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([account], [excessAmount]))
          .to.be.revertedWithCustomError(netYieldDistributor, ERRORS.NetYieldDistributor_AdvanceNetYieldInsufficientBalance);
      });

      it("Treasury has not approved the contract to spend its tokens", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployContracts);
        const amount = YIELD_AMOUNT_BASE;
        const account = user.address;

        await proveTx(netYieldDistributor.grantRole(ROLES.MINTER_ROLE, minter.address));
        await proveTx(netYieldDistributor.grantRole(ROLES.MANAGER_ROLE, manager.address));
        await proveTx(netYieldDistributor.setOperationalTreasury(treasury.address));

        await proveTx(tokenMock.mint(treasury.address, amount * 2n));

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount * 2n));
        await proveTx(connect(netYieldDistributor, manager).advanceNetYield([account], [amount]));

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([account], [amount]))
          .to.be.reverted;
      });

      it("Treasury has insufficient balance to cover the reduction", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployContracts);
        const amount = YIELD_AMOUNT_BASE;
        const account = user.address;

        await proveTx(netYieldDistributor.grantRole(ROLES.MINTER_ROLE, minter.address));
        await proveTx(netYieldDistributor.grantRole(ROLES.MANAGER_ROLE, manager.address));
        await proveTx(netYieldDistributor.setOperationalTreasury(treasury.address));

        await proveTx(connect(tokenMock, treasury).approve(getAddress(netYieldDistributor), ALLOWANCE_MAX));
        await proveTx(tokenMock.mint(treasury.address, amount / 2n));

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount * 2n));
        await proveTx(connect(netYieldDistributor, manager).advanceNetYield([account], [amount]));

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([account], [amount]))
          .to.be.reverted;
      });

      it("Operational treasury is not set", async () => {
        const { netYieldDistributor, tokenMock } = await setUpFixture(deployContracts);
        const amount = YIELD_AMOUNT_BASE;
        const account = user.address;

        await proveTx(netYieldDistributor.grantRole(ROLES.MINTER_ROLE, minter.address));
        await proveTx(netYieldDistributor.grantRole(ROLES.MANAGER_ROLE, manager.address));

        await proveTx(connect(netYieldDistributor, minter).mintAssetYield(amount * 2n));
        await proveTx(connect(netYieldDistributor, manager).advanceNetYield([account], [amount]));

        await expect(connect(netYieldDistributor, manager).reduceAdvanceNetYield([account], [amount]))
          .to.be.reverted;
      });
    });
  });

  describe("Edge cases", async () => {
    it("Handles maximum uint64 values", async () => {
      const { netYieldDistributor, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const maxUint64 = maxUintForBits(64);

      await proveTx(connect(netYieldDistributor, minter).mintAssetYield(maxUint64 / 2n));

      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(maxUint64 / 2n);

      await proveTx(connect(netYieldDistributor, manager).advanceNetYield([user.address], [maxUint64 / 2n]));

      expect(await netYieldDistributor.currentAdvanceNetYieldOf(user.address)).to.equal(maxUint64 / 2n);
      expect(await netYieldDistributor.totalAdvanceNetYieldOf(user.address)).to.equal(maxUint64 / 2n);
      expect(await netYieldDistributor.totalAdvancedYield()).to.equal(maxUint64 / 2n);
    });

    it("Maintaining correct state after multiple operations", async () => {
      const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);
      const initialAmount = YIELD_AMOUNT_BASE * 5n;
      const advanceAmount1 = YIELD_AMOUNT_BASE;
      const advanceAmount2 = YIELD_AMOUNT_BASE * 2n;
      const reduceAmount1 = YIELD_AMOUNT_BASE / 4n;
      const reduceAmount2 = YIELD_AMOUNT_BASE / 2n;

      await proveTx(connect(netYieldDistributor, minter).mintAssetYield(initialAmount));
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(initialAmount);

      await proveTx(connect(netYieldDistributor, manager).advanceNetYield([user.address], [advanceAmount1]));

      expect(await netYieldDistributor.currentAdvanceNetYieldOf(user.address)).to.equal(advanceAmount1);
      expect(await netYieldDistributor.totalAdvanceNetYieldOf(user.address)).to.equal(advanceAmount1);
      expect(await netYieldDistributor.totalAdvancedYield()).to.equal(advanceAmount1);

      await proveTx(connect(netYieldDistributor, manager).reduceAdvanceNetYield([user.address], [reduceAmount1]));

      expect(await netYieldDistributor.currentAdvanceNetYieldOf(user.address)).to.equal(advanceAmount1 - reduceAmount1);
      expect(await netYieldDistributor.totalAdvanceNetYieldOf(user.address)).to.equal(advanceAmount1);
      expect(await netYieldDistributor.totalReducedYield()).to.equal(reduceAmount1);
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(initialAmount - reduceAmount1);

      await proveTx(connect(netYieldDistributor, manager).advanceNetYield([user.address], [advanceAmount2]));

      const expectedCurrentAfterSecondAdvance = advanceAmount1 - reduceAmount1 + advanceAmount2;
      const expectedTotalAfterSecondAdvance = advanceAmount1 + advanceAmount2;

      expect(await netYieldDistributor.currentAdvanceNetYieldOf(user.address)).to.equal(expectedCurrentAfterSecondAdvance);
      expect(await netYieldDistributor.totalAdvanceNetYieldOf(user.address)).to.equal(expectedTotalAfterSecondAdvance);
      expect(await netYieldDistributor.totalAdvancedYield()).to.equal(expectedCurrentAfterSecondAdvance);

      await proveTx(connect(netYieldDistributor, manager).reduceAdvanceNetYield([user.address], [reduceAmount2]));

      const expectedFinalCurrent = expectedCurrentAfterSecondAdvance - reduceAmount2;
      const expectedFinalTotal = expectedTotalAfterSecondAdvance;
      const expectedTotalReduced = reduceAmount1 + reduceAmount2;
      const expectedNetYieldSupply = initialAmount - expectedTotalReduced;

      expect(await netYieldDistributor.currentAdvanceNetYieldOf(user.address)).to.equal(expectedFinalCurrent);
      expect(await netYieldDistributor.totalAdvanceNetYieldOf(user.address)).to.equal(expectedFinalTotal);
      expect(await netYieldDistributor.totalAdvancedYield()).to.equal(expectedFinalCurrent);
      expect(await netYieldDistributor.totalReducedYield()).to.equal(expectedTotalReduced);
      expect(await netYieldDistributor.totalNetYieldSupply()).to.equal(expectedNetYieldSupply);
    });
  });

  describe("Function '$__VERSION()'", async () => {
    it("Returns the expected version", async () => {
      const { netYieldDistributor } = await setUpFixture(deployAndConfigureContracts);

      const netYieldDistributorVersion = await netYieldDistributor.$__VERSION();
      checkEquality(netYieldDistributorVersion, EXPECTED_VERSION);
    });
  });
});
