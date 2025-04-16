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
  MANAGER_ROLE: ethers.id("MANAGER_ROLE")
};

const EVENTS = {
  LiabilityUpdated: "LiabilityUpdated",
  YieldMinted: "YieldMinted",
  YieldBurned: "YieldBurned"
};

const ERRORS = {
  NetYieldDistributor_InvalidInitialization: "InvalidInitialization",
  NetYieldDistributor_AccessControlUnauthorizedAccount: "AccessControlUnauthorizedAccount",
  NetYieldDistributor_ImplementationAddressInvalid: "NetYieldDistributor_ImplementationAddressInvalid",
  NetYieldDistributor_UnderlyingTokenAddressZero: "NetYieldDistributor_UnderlyingTokenAddressZero",
  NetYieldDistributor_AccountsAndAmountsLengthMismatch: "NetYieldDistributor_AccountsAndAmountsLengthMismatch",
  NetYieldDistributor_AccountAddressZero: "NetYieldDistributor_AccountAddressZero",
  NetYieldDistributor_AmountZero: "NetYieldDistributor_AmountZero",
  NetYieldDistributor_DecreaseAmountExcess: "NetYieldDistributor_DecreaseAmountExcess",
  NetYieldDistributor_AmountOverflow: "NetYieldDistributor_AmountOverflow",
  EnforcedPause: "EnforcedPause"
};

const ADDRESS_ZERO = ethers.ZeroAddress;

const LIABILITY_AMOUNT = 12_345_678n;
const LIABILITY_AMOUNTS: bigint[] = [
  LIABILITY_AMOUNT,
  LIABILITY_AMOUNT * 2n,
  LIABILITY_AMOUNT * 3n,
  LIABILITY_AMOUNT * 4n
];

const YIELD_AMOUNT = 5_000_000n;

interface Version {
  major: number;
  minor: number;
  patch: number;

  [key: string]: number; // Indexing signature to ensure that fields are iterated over in a key-value style
}

interface Fixture {
  assetYield: Contract;
  tokenMock: Contract;
}

describe("Contract 'NetYieldDistributor'", async () => {
  let assetYieldFactory: ContractFactory;

  let deployer: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let manager: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let users: HardhatEthersSigner[];

  before(async () => {
    let moreUsers: HardhatEthersSigner[];
    [deployer, minter, manager, stranger, user, ...moreUsers] = await ethers.getSigners();
    users = [user, ...moreUsers];

    // The contract factories with the explicitly specified deployer account
    assetYieldFactory = await ethers.getContractFactory("NetYieldDistributor");
    assetYieldFactory = assetYieldFactory.connect(deployer);
  });

  async function deployTokenMock(): Promise<Contract> {
    const name = "ERC20 Test";
    const symbol = "TEST";

    // The token contract factory with the explicitly specified deployer account
    let tokenMockFactory = await ethers.getContractFactory("ERC20TokenMock");
    tokenMockFactory = tokenMockFactory.connect(deployer);

    // The token contract with the explicitly specified initial account
    let tokenMock: Contract = await tokenMockFactory.deploy(name, symbol) as Contract;
    await tokenMock.waitForDeployment();
    tokenMock = connect(tokenMock, deployer); // Explicitly specifying the initial account

    return tokenMock;
  }

  async function deployContracts(): Promise<Fixture> {
    const tokenMock = await deployTokenMock();
    let assetYield: Contract = await upgrades.deployProxy(
      assetYieldFactory,
      [getAddress(tokenMock)]
    ) as Contract;
    await assetYield.waitForDeployment();
    assetYield = connect(assetYield, deployer); // Explicitly specifying the initial account

    return {
      assetYield,
      tokenMock
    };
  }

  async function deployAndConfigureContracts(): Promise<Fixture> {
    const fixture = await deployContracts();
    const { assetYield, tokenMock } = fixture;

    await proveTx(assetYield.grantRole(ROLES.MINTER_ROLE, minter.address));
    await proveTx(assetYield.grantRole(ROLES.MANAGER_ROLE, manager.address));

    return fixture;
  }

  async function pauseContract(contract: Contract) {
    await proveTx(contract.grantRole(ROLES.PAUSER_ROLE, deployer.address));
    await proveTx(contract.pause());
  }

  describe("Function 'initialize()'", async () => {
    it("Configures the contract as expected", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployContracts);

      // Verify underlying token address
      expect(await assetYield.underlyingToken()).to.equal(getAddress(tokenMock));

      // Verify role hashes
      expect(await assetYield.OWNER_ROLE()).to.equal(ROLES.OWNER_ROLE);
      expect(await assetYield.MANAGER_ROLE()).to.equal(ROLES.MANAGER_ROLE);
      expect(await assetYield.MINTER_ROLE()).to.equal(ROLES.MINTER_ROLE);
      expect(await assetYield.PAUSER_ROLE()).to.equal(ROLES.PAUSER_ROLE);

      // Verify role admins
      expect(await assetYield.getRoleAdmin(ROLES.OWNER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await assetYield.getRoleAdmin(ROLES.MANAGER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await assetYield.getRoleAdmin(ROLES.MINTER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await assetYield.getRoleAdmin(ROLES.PAUSER_ROLE)).to.equal(ROLES.OWNER_ROLE);

      // Verify deployer role assignments
      expect(await assetYield.hasRole(ROLES.OWNER_ROLE, deployer.address)).to.equal(true);
      expect(await assetYield.hasRole(ROLES.MANAGER_ROLE, deployer.address)).to.equal(false);
      expect(await assetYield.hasRole(ROLES.MINTER_ROLE, deployer.address)).to.equal(false);
      expect(await assetYield.hasRole(ROLES.PAUSER_ROLE, deployer.address)).to.equal(false);

      // Verify initial state values
      expect(await assetYield.totalYieldSupply()).to.equal(0);
      expect(await assetYield.totalLiability()).to.equal(0);
    });

    it("Is reverted if called a second time", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployContracts);
      
      // Verify error on second initialization
      await expect(
        assetYield.initialize(getAddress(tokenMock))
      ).to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_InvalidInitialization);
    });

    it("Is reverted if passed token address is zero", async () => {
      // Setup contract without initialization
      const anotherNetYieldDistributorContract: Contract = await upgrades.deployProxy(
        assetYieldFactory,
        [],
        { initializer: false }
      ) as Contract;

      // Verify error when initializing with zero address
      await expect(
        anotherNetYieldDistributorContract.initialize(ADDRESS_ZERO)
      ).to.be.revertedWithCustomError(assetYieldFactory, ERRORS.NetYieldDistributor_UnderlyingTokenAddressZero);
    });
  });

  describe("Function 'upgradeToAndCall()'", async () => {
    it("Executes as expected", async () => {
      // Setup
      const { assetYield } = await setUpFixture(deployContracts);
      
      // Execute and verify upgrade
      await checkContractUupsUpgrading(assetYield, assetYieldFactory);
    });

    it("Is reverted if caller lacks `OWNER_ROLE`", async () => {
      // Setup
      const { assetYield } = await setUpFixture(deployContracts);

      // Verify error when non-owner tries to upgrade
      await expect(connect(assetYield, stranger).upgradeToAndCall(getAddress(assetYield), "0x"))
        .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
        .withArgs(stranger.address, ROLES.OWNER_ROLE);
    });

    it("Is reverted if implementation address is invalid", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployContracts);

      // Verify error when using invalid implementation
      await expect(assetYield.upgradeToAndCall(getAddress(tokenMock), "0x"))
        .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_ImplementationAddressInvalid);
    });
  });

  describe("Function '$__VERSION()'", async () => {
    it("Returns expected values", async () => {
      // Setup
      const { assetYield } = await setUpFixture(deployAndConfigureContracts);
      
      // Execute and verify version
      const assetYieldVersion = await assetYield.$__VERSION();
      checkEquality(assetYieldVersion, EXPECTED_VERSION);
    });
  });

  describe("Function 'transferWithLiability()'", async () => {
    describe("Executes as expected if", async () => {
      it("Transfer is for a single account", async () => {
        const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const amount = LIABILITY_AMOUNT;
        const account = user.address;

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(amount * 2n));

        // Execute
        const tx = connect(assetYield, manager).transferWithLiability([account], [amount]);

        // Verify event emission
        await expect(tx)
          .to.emit(assetYield, EVENTS.LiabilityUpdated)
          .withArgs(account, amount, 0);

        // Verify token balance changes
        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(assetYield), account],
          [-amount, amount]
        );

        // Verify final state
        expect(await assetYield.liabilityOf(account)).to.equal(amount);
        expect(await assetYield.totalLiability()).to.equal(amount);
      });

      it("Transfer is for multiple accounts, including duplicates", async () => {
        const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const transferCount = 4;
        const accounts = users.slice(0, transferCount - 1).map(user => user.address);
        accounts.push(users[0].address);
        const amounts = LIABILITY_AMOUNTS.slice(0, transferCount - 1);
        amounts.push(LIABILITY_AMOUNTS[transferCount - 1]);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(totalAmount * 2n));

        // Execute
        const tx = await connect(assetYield, manager).transferWithLiability(accounts, amounts);

        // Verify events
        for (let i = 0; i < accounts.length - 1; ++i) {
          await expect(tx)
            .to.emit(assetYield, EVENTS.LiabilityUpdated)
            .withArgs(accounts[i], amounts[i], 0);
        }
        await expect(tx)
          .to.emit(assetYield, EVENTS.LiabilityUpdated)
          .withArgs(accounts[transferCount - 1], amounts[transferCount - 1] + amounts[0], amounts[0]);

        // Verify final state
        expect(await assetYield.liabilityOf(accounts[0])).to.equal(amounts[0] + amounts[transferCount - 1]);
        expect(await assetYield.liabilityOf(accounts[1])).to.equal(amounts[1]);
        expect(await assetYield.liabilityOf(accounts[2])).to.equal(amounts[2]);
        expect(await assetYield.totalLiability()).to.equal(totalAmount);

        // Verify token balance changes
        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(assetYield), accounts[0], accounts[1], accounts[2]],
          [-totalAmount, (amounts[0] + amounts[transferCount - 1]), amounts[1], amounts[2]]
        );
      });

      it("Transfer is for zero accounts", async () => {
        const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(LIABILITY_AMOUNT));

        // Execute
        const tx = connect(assetYield, manager).transferWithLiability([], []);

        // Verify no events emitted
        await expect(tx).not.to.emit(assetYield, EVENTS.LiabilityUpdated);

        // Verify no token balance changes
        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(assetYield)],
          [0]
        );

        // Verify final state
        expect(await assetYield.totalLiability()).to.equal(0);
      });
    });

    describe("Is reverted if", async () => {
      it("Contract is paused", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(LIABILITY_AMOUNT * 2n));
        await pauseContract(assetYield);

        // Verify error
        await expect(connect(assetYield, manager).transferWithLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.EnforcedPause);
      });

      it("Caller lacks `MANAGER_ROLE`", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(LIABILITY_AMOUNT * 2n));

        // Verify errors for different callers
        await expect(connect(assetYield, stranger).transferWithLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MANAGER_ROLE);

        await expect(connect(assetYield, deployer).transferWithLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(deployer.address, ROLES.MANAGER_ROLE);
      });

      it("Contract has insufficient balance", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup - mint less than required
        const smallAmount = LIABILITY_AMOUNT / 2n;
        await proveTx(connect(assetYield, minter).mintYield(smallAmount));

        // Verify error when attempting to transfer more than available
        await expect(
          connect(assetYield, manager).transferWithLiability([user.address], [LIABILITY_AMOUNT])
        ).to.be.reverted;
      });

      it("Arrays length mismatch", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(LIABILITY_AMOUNT * 2n));

        // Verify errors for different mismatch scenarios
        const accounts = [user.address, users[1].address];
        const amounts = [LIABILITY_AMOUNT];

        await expect(connect(assetYield, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccountsAndAmountsLengthMismatch);

        await expect(connect(assetYield, manager).transferWithLiability([], amounts))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccountsAndAmountsLengthMismatch);
      });

      it("Account address is zero", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(LIABILITY_AMOUNT * 2n));
        const accounts = [user.address, ADDRESS_ZERO];
        const amounts = [LIABILITY_AMOUNT, LIABILITY_AMOUNT];

        // Verify error
        await expect(connect(assetYield, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccountAddressZero);
      });

      it("Amount is zero", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(LIABILITY_AMOUNT * 2n));
        const accounts = [users[0].address, users[1].address];
        const amounts = [LIABILITY_AMOUNT, 0n];

        // Verify error
        await expect(connect(assetYield, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AmountZero);
      });

      it("Amount exceeds uint64 max value", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        const largeAmount = maxUintForBits(64) * 2n;
        await proveTx(connect(assetYield, minter).mintYield(largeAmount));
        const accounts = [users[0].address, users[1].address];
        const amounts = [LIABILITY_AMOUNT, maxUintForBits(64) + 1n];

        // Verify error
        await expect(connect(assetYield, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AmountOverflow);
      });

      it("Result liability exceeds uint64 max value", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        const largeAmount = maxUintForBits(64) * 2n;
        await proveTx(connect(assetYield, minter).mintYield(largeAmount));
        const accounts = [user.address, user.address];
        const amounts = [1n, maxUintForBits(64)];

        // Verify error
        await expect(connect(assetYield, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithPanic(0x11);
      });
    });
  });

  describe("Function 'decreaseLiability()'", async () => {
    describe("Executes as expected if", async () => {
      it("Decreasing a single account's full liability", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const amount = LIABILITY_AMOUNT;
        const account = user.address;

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(amount * 2n));
        await proveTx(connect(assetYield, manager).transferWithLiability([account], [amount]));

        // Execute and verify event
        await expect(connect(assetYield, manager).decreaseLiability([account], [amount]))
          .to.emit(assetYield, EVENTS.LiabilityUpdated)
          .withArgs(account, 0, amount);

        // Verify final state
        expect(await assetYield.liabilityOf(account)).to.equal(0);
        expect(await assetYield.totalLiability()).to.equal(0);
      });

      it("Decreasing liability for multiple accounts", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const accounts = users.slice(0, 3).map(user => user.address);
        const amounts = LIABILITY_AMOUNTS.slice(0, 3);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(totalAmount * 2n));
        await proveTx(connect(assetYield, manager).transferWithLiability(accounts, amounts));

        // Execute and verify events
        await expect(connect(assetYield, manager).decreaseLiability(accounts, amounts))
          .to.emit(assetYield, EVENTS.LiabilityUpdated)
          .withArgs(accounts[0], 0, amounts[0])
          .to.emit(assetYield, EVENTS.LiabilityUpdated)
          .withArgs(accounts[1], 0, amounts[1])
          .to.emit(assetYield, EVENTS.LiabilityUpdated)
          .withArgs(accounts[2], 0, amounts[2]);

        // Verify final state
        expect(await assetYield.liabilityOf(accounts[0])).to.equal(0);
        expect(await assetYield.liabilityOf(accounts[1])).to.equal(0);
        expect(await assetYield.liabilityOf(accounts[2])).to.equal(0);
        expect(await assetYield.totalLiability()).to.equal(0);
      });

      it("Performing partial liability decrease", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const fullAmount = LIABILITY_AMOUNT;
        const partialAmount = LIABILITY_AMOUNT / 2n;
        const account = user.address;

        // Setup
        await proveTx(connect(assetYield, minter).mintYield(fullAmount * 2n));
        await proveTx(connect(assetYield, manager).transferWithLiability([account], [fullAmount]));

        // Execute and verify event
        await expect(connect(assetYield, manager).decreaseLiability([account], [partialAmount]))
          .to.emit(assetYield, EVENTS.LiabilityUpdated)
          .withArgs(account, fullAmount - partialAmount, fullAmount);

        // Verify final state
        expect(await assetYield.liabilityOf(account)).to.equal(fullAmount - partialAmount);
        expect(await assetYield.totalLiability()).to.equal(fullAmount - partialAmount);
      });
    });

    describe("Updates `totalYieldSupply` correctly", async () => {
      it("When decreasing liability for accounts sequentially", async () => {
        const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        const initialAmount = LIABILITY_AMOUNT * 2n;
        await proveTx(connect(assetYield, minter).mintYield(initialAmount));

        const accounts = [users[0].address, users[1].address];
        const amounts = [LIABILITY_AMOUNT, LIABILITY_AMOUNT / 2n];
        const totalLiabilityAmount = amounts[0] + amounts[1];

        await proveTx(connect(assetYield, manager).transferWithLiability(accounts, amounts));

        // Verify initial state after transfer
        expect(await assetYield.totalYieldSupply()).to.equal(initialAmount);
        expect(await assetYield.totalLiability()).to.equal(totalLiabilityAmount);
        expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(initialAmount - totalLiabilityAmount);

        // Execute first decrease and verify
        await proveTx(connect(assetYield, manager).decreaseLiability([accounts[0]], [amounts[0]]));
        expect(await assetYield.totalYieldSupply()).to.equal(initialAmount - amounts[0]);
        expect(await assetYield.totalLiability()).to.equal(amounts[1]);

        // Execute second decrease and verify final state
        await proveTx(connect(assetYield, manager).decreaseLiability([accounts[1]], [amounts[1]]));
        expect(await assetYield.totalYieldSupply()).to.equal(initialAmount - totalLiabilityAmount);
        expect(await assetYield.totalLiability()).to.equal(0);
      });

      it("When decreasing liability for multiple accounts in batch", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Setup
        const initialAmount = LIABILITY_AMOUNT * 6n;
        await proveTx(connect(assetYield, minter).mintYield(initialAmount));

        const accounts = users.slice(0, 3).map(user => user.address);
        const amounts = LIABILITY_AMOUNTS.slice(0, 3);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        await proveTx(connect(assetYield, manager).transferWithLiability(accounts, amounts));

        // Verify initial state
        expect(await assetYield.totalYieldSupply()).to.equal(initialAmount);
        expect(await assetYield.totalLiability()).to.equal(totalAmount);

        // Execute batch decrease and verify final state
        await proveTx(connect(assetYield, manager).decreaseLiability(accounts, amounts));
        expect(await assetYield.totalYieldSupply()).to.equal(initialAmount - totalAmount);
        expect(await assetYield.totalLiability()).to.equal(0);
      });
    });

    describe("Is reverted if", async () => {
      it("Accounts and amounts arrays have different lengths", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const accounts = [user.address, users[1].address];
        const amounts = [LIABILITY_AMOUNT];

        // Verify error
        await expect(connect(assetYield, manager).decreaseLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccountsAndAmountsLengthMismatch);
      });

      it("Caller lacks `MANAGER_ROLE`", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Verify error
        await expect(connect(assetYield, stranger).decreaseLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MANAGER_ROLE);
      });

      it("Account address is zero", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Verify error
        await expect(connect(assetYield, manager).decreaseLiability([ADDRESS_ZERO], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccountAddressZero);
      });

      it("Amount is zero", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);

        // Verify error
        await expect(connect(assetYield, manager).decreaseLiability([user.address], [0]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AmountZero);
      });

      it("Decrease amount exceeds current liability", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const initialAmount = LIABILITY_AMOUNT;
        const excessAmount = initialAmount + 1n;
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetYield, minter).mintYield(initialAmount * 2n));

        // First create a liability
        await proveTx(connect(assetYield, manager).transferWithLiability([account], [initialAmount]));

        // Try to decrease more than the current liability
        await expect(connect(assetYield, manager).decreaseLiability([account], [excessAmount]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_DecreaseAmountExcess);
      });

      it("Amount exceeds uint64 max value", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const maxUint64 = maxUintForBits(64);
        const overflowAmount = maxUint64 + 1n;
        const initialAmount = LIABILITY_AMOUNT * 10n; // Create a valid initial liability
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetYield, minter).mintYield(initialAmount * 2n));

        // First create a valid liability
        await proveTx(connect(assetYield, manager).transferWithLiability([account], [initialAmount]));

        // Now try to decrease with an amount that exceeds uint64 max
        await expect(connect(assetYield, manager).decreaseLiability([account], [overflowAmount]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AmountOverflow);
      });

      it("Contract is paused", async () => {
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const amount = LIABILITY_AMOUNT;
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetYield, minter).mintYield(amount * 2n));

        // First create a liability
        await proveTx(connect(assetYield, manager).transferWithLiability([account], [amount]));

        // Pause the contract
        await pauseContract(assetYield);

        // Try to decrease while paused
        await expect(connect(assetYield, manager).decreaseLiability([account], [amount]))
          .to.be.revertedWithCustomError(assetYield, ERRORS.EnforcedPause);
      });
    });
  });

  describe("Function 'mintYield()'", async () => {
    it("Mints tokens and emits correct event", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const amount = YIELD_AMOUNT;

      // Verify initial state
      expect(await assetYield.totalYieldSupply()).to.equal(0);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(0);

      // Execute and verify event
      await expect(connect(assetYield, minter).mintYield(amount))
        .to.emit(assetYield, EVENTS.YieldMinted)
        .withArgs(amount);

      // Verify final state
      expect(await assetYield.totalYieldSupply()).to.equal(amount);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(amount);
    });

    it("Allows multiple mint operations", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const amount1 = YIELD_AMOUNT;
      const amount2 = YIELD_AMOUNT * 2n;
      const totalAmount = amount1 + amount2;

      // Execute first mint and verify
      await proveTx(connect(assetYield, minter).mintYield(amount1));
      expect(await assetYield.totalYieldSupply()).to.equal(amount1);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(amount1);

      // Execute second mint and verify event
      await expect(connect(assetYield, minter).mintYield(amount2))
        .to.emit(assetYield, EVENTS.YieldMinted)
        .withArgs(amount2);

      // Verify final state
      expect(await assetYield.totalYieldSupply()).to.equal(totalAmount);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(totalAmount);
    });

    describe("Is reverted if", async () => {
      it("Caller lacks `MINTER_ROLE`", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(assetYield, minter).mintYield(YIELD_AMOUNT));

        // Verify errors for different callers
        await expect(connect(assetYield, stranger).mintYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MINTER_ROLE);

        await expect(connect(assetYield, manager).mintYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(manager.address, ROLES.MINTER_ROLE);
      });

      it("Contract is paused", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(assetYield, minter).mintYield(YIELD_AMOUNT));
        await pauseContract(assetYield);

        // Verify error
        await expect(connect(assetYield, minter).mintYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetYield, ERRORS.EnforcedPause);
      });
    });
  });

  describe("Function 'burnYield()'", async () => {
    it("Burns tokens and emits correct event", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const mintAmount = YIELD_AMOUNT * 2n;
      const burnAmount = YIELD_AMOUNT;
      const remainingAmount = mintAmount - burnAmount;
      await proveTx(connect(assetYield, minter).mintYield(mintAmount));
      expect(await assetYield.totalYieldSupply()).to.equal(mintAmount);

      // Execute and verify event
      await expect(connect(assetYield, minter).burnYield(burnAmount))
        .to.emit(assetYield, EVENTS.YieldBurned)
        .withArgs(burnAmount);

      // Verify final state
      expect(await assetYield.totalYieldSupply()).to.equal(remainingAmount);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(remainingAmount);
    });

    it("Allows multiple burn operations", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const mintAmount = YIELD_AMOUNT * 4n;
      const burn1 = YIELD_AMOUNT;
      const burn2 = YIELD_AMOUNT * 2n;
      const remainingAmount = mintAmount - burn1 - burn2;
      await proveTx(connect(assetYield, minter).mintYield(mintAmount));

      // Execute first burn and verify
      await proveTx(connect(assetYield, minter).burnYield(burn1));
      expect(await assetYield.totalYieldSupply()).to.equal(mintAmount - burn1);

      // Execute second burn and verify final state
      await proveTx(connect(assetYield, minter).burnYield(burn2));
      expect(await assetYield.totalYieldSupply()).to.equal(remainingAmount);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(remainingAmount);
    });

    it("Can burn entire yield balance", async () => {
      // Setup
      const { assetYield, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const amount = YIELD_AMOUNT;
      await proveTx(connect(assetYield, minter).mintYield(amount));
      expect(await assetYield.totalYieldSupply()).to.equal(amount);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(amount);

      // Execute and verify final state
      await proveTx(connect(assetYield, minter).burnYield(amount));
      expect(await assetYield.totalYieldSupply()).to.equal(0);
      expect(await tokenMock.balanceOf(getAddress(assetYield))).to.equal(0);
    });

    describe("Is reverted if", async () => {
      it("Caller lacks `MINTER_ROLE`", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(assetYield, minter).mintYield(YIELD_AMOUNT));

        // Verify errors for different callers
        await expect(connect(assetYield, stranger).burnYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MINTER_ROLE);

        await expect(connect(assetYield, manager).burnYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetYield, ERRORS.NetYieldDistributor_AccessControlUnauthorizedAccount)
          .withArgs(manager.address, ROLES.MINTER_ROLE);
      });

      it("Contract is paused", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        await proveTx(connect(assetYield, minter).mintYield(YIELD_AMOUNT));
        await pauseContract(assetYield);

        // Verify error
        await expect(connect(assetYield, minter).burnYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetYield, ERRORS.EnforcedPause);
      });

      it("Amount exceeds contract token balance", async () => {
        // Setup
        const { assetYield } = await setUpFixture(deployAndConfigureContracts);
        const mintAmount = YIELD_AMOUNT;
        await proveTx(connect(assetYield, minter).mintYield(mintAmount));

        // Verify error when burning more than available
        const burnAmount = mintAmount * 2n;
        await expect(connect(assetYield, minter).burnYield(burnAmount))
          .to.be.reverted; // Exact error depends on token implementation
      });
    });
  });
});
