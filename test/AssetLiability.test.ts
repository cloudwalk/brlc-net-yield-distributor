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
  OperationalTreasuryUpdated: "OperationalTreasuryUpdated",
  YieldMinted: "YieldMinted",
  YieldBurned: "YieldBurned"
};

const ERRORS = {
  AssetLiability_InvalidInitialization: "InvalidInitialization",
  AssetLiability_AccessControlUnauthorizedAccount: "AccessControlUnauthorizedAccount",
  AssetLiability_ImplementationAddressInvalid: "AssetLiability_ImplementationAddressInvalid",
  AssetLiability_UnderlyingTokenAddressZero: "AssetLiability_UnderlyingTokenAddressZero",
  AssetLiability_TreasuryAddressAlreadySet: "AssetLiability_TreasuryAddressAlreadySet",
  AssetLiability_AccountsAndAmountsLengthMismatch: "AssetLiability_AccountsAndAmountsLengthMismatch",
  AssetLiability_AccountAddressZero: "AssetLiability_AccountAddressZero",
  AssetLiability_AmountZero: "AssetLiability_AmountZero",
  AssetLiability_DecreaseAmountExcess: "AssetLiability_DecreaseAmountExcess",
  AssetLiability_AmountOverflow: "AssetLiability_AmountOverflow",
  EnforcedPause: "EnforcedPause"
};

const ADDRESS_ZERO = ethers.ZeroAddress;
const ALLOWANCE_MAX = ethers.MaxUint256;
const BALANCE_INITIAL = 1000_000_000_000n;

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
  assetLiability: Contract;
  tokenMock: Contract;
}

describe("Contract 'AssetLiability'", async () => {
  let assetLiabilityFactory: ContractFactory;

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

    // The contract factories with the explicitly specified deployer account
    assetLiabilityFactory = await ethers.getContractFactory("AssetLiability");
    assetLiabilityFactory = assetLiabilityFactory.connect(deployer);
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
    let assetLiability: Contract = await upgrades.deployProxy(
      assetLiabilityFactory,
      [getAddress(tokenMock)]
    ) as Contract;
    await assetLiability.waitForDeployment();
    assetLiability = connect(assetLiability, deployer); // Explicitly specifying the initial account

    return {
      assetLiability,
      tokenMock
    };
  }

  async function deployAndConfigureContracts(): Promise<Fixture> {
    const fixture = await deployContracts();
    const { assetLiability, tokenMock } = fixture;

    await proveTx(assetLiability.grantRole(ROLES.MINTER_ROLE, minter.address));
    await proveTx(assetLiability.grantRole(ROLES.MANAGER_ROLE, manager.address));
    await proveTx(assetLiability.setOperationalTreasury(treasury.address));

    // Mint initial balances
    await proveTx(tokenMock.mint(treasury.address, BALANCE_INITIAL));

    // Approvals
    await proveTx(connect(tokenMock, treasury).approve(getAddress(assetLiability), ALLOWANCE_MAX));

    return fixture;
  }

  async function pauseContract(contract: Contract) {
    await proveTx(contract.grantRole(ROLES.PAUSER_ROLE, deployer.address));
    await proveTx(contract.pause());
  }

  describe("Function 'initialize()'", async () => {
    it("Configures the contract as expected", async () => {
      const { assetLiability, tokenMock } = await setUpFixture(deployContracts);

      // The underlying token contract address
      expect(await assetLiability.underlyingToken()).to.equal(getAddress(tokenMock));

      // Role hashes
      expect(await assetLiability.OWNER_ROLE()).to.equal(ROLES.OWNER_ROLE);
      expect(await assetLiability.MANAGER_ROLE()).to.equal(ROLES.MANAGER_ROLE);
      expect(await assetLiability.PAUSER_ROLE()).to.equal(ROLES.PAUSER_ROLE);

      // The role admins
      expect(await assetLiability.getRoleAdmin(ROLES.OWNER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await assetLiability.getRoleAdmin(ROLES.MANAGER_ROLE)).to.equal(ROLES.OWNER_ROLE);
      expect(await assetLiability.getRoleAdmin(ROLES.PAUSER_ROLE)).to.equal(ROLES.OWNER_ROLE);

      // The deployer should have the owner role, but not the other roles
      expect(await assetLiability.hasRole(ROLES.OWNER_ROLE, deployer.address)).to.equal(true);
      expect(await assetLiability.hasRole(ROLES.MANAGER_ROLE, deployer.address)).to.equal(false);
      expect(await assetLiability.hasRole(ROLES.PAUSER_ROLE, deployer.address)).to.equal(false);

      // Default values for treasury and total liability
      expect(await assetLiability.operationalTreasury()).to.equal(ADDRESS_ZERO);
      expect(await assetLiability.totalLiability()).to.equal(0);
    });

    it("Is reverted if it is called a second time", async () => {
      const { assetLiability, tokenMock } = await setUpFixture(deployContracts);
      await expect(
        assetLiability.initialize(getAddress(tokenMock))
      ).to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_InvalidInitialization);
    });

    it("Is reverted if the passed token address is zero", async () => {
      const anotherAssetLiabilityContract: Contract = await upgrades.deployProxy(
        assetLiabilityFactory,
        [],
        { initializer: false }
      ) as Contract;

      await expect(
        anotherAssetLiabilityContract.initialize(ADDRESS_ZERO)
      ).to.be.revertedWithCustomError(assetLiabilityFactory, ERRORS.AssetLiability_UnderlyingTokenAddressZero);
    });
  });

  describe("Function 'upgradeToAndCall()'", async () => {
    it("Executes as expected", async () => {
      const { assetLiability } = await setUpFixture(deployContracts);
      await checkContractUupsUpgrading(assetLiability, assetLiabilityFactory);
    });

    it("Is reverted if the caller does not have the owner role", async () => {
      const { assetLiability } = await setUpFixture(deployContracts);

      await expect(connect(assetLiability, stranger).upgradeToAndCall(getAddress(assetLiability), "0x"))
        .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
        .withArgs(stranger.address, ROLES.OWNER_ROLE);
    });

    it("Is reverted if the provided implementation address does not belong to an AssetLiability contract", async () => {
      const { assetLiability, tokenMock } = await setUpFixture(deployContracts);

      await expect(assetLiability.upgradeToAndCall(getAddress(tokenMock), "0x"))
        .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_ImplementationAddressInvalid);
    });
  });

  describe("Function '$__VERSION()'", async () => {
    it("Returns expected values", async () => {
      const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
      const assetLiabilityVersion = await assetLiability.$__VERSION();
      checkEquality(assetLiabilityVersion, EXPECTED_VERSION);
    });
  });

  describe("Function 'setOperationalTreasury()'", async () => {
    it("Executes as expected and emits the correct event", async () => {
      const { assetLiability } = await setUpFixture(deployContracts);

      // Check it can be set to a non-zero address
      await expect(assetLiability.setOperationalTreasury(treasury.address))
        .to.emit(assetLiability, EVENTS.OperationalTreasuryUpdated)
        .withArgs(treasury.address, ADDRESS_ZERO);
      expect(await assetLiability.operationalTreasury()).to.eq(treasury.address);

      // Check it can be set to a zero address
      await expect(assetLiability.setOperationalTreasury(ADDRESS_ZERO))
        .to.emit(assetLiability, EVENTS.OperationalTreasuryUpdated)
        .withArgs(ADDRESS_ZERO, treasury.address);
      expect(await assetLiability.operationalTreasury()).to.eq(ADDRESS_ZERO);
    });

    it("Is reverted if caller does not have the owner role", async () => {
      const { assetLiability } = await setUpFixture(deployContracts);

      await expect(connect(assetLiability, stranger).setOperationalTreasury(treasury.address))
        .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
        .withArgs(stranger.address, ROLES.OWNER_ROLE);

      // An account with the manager role cannot do that too
      await proveTx(assetLiability.grantRole(ROLES.MANAGER_ROLE, manager.address));
      await expect(connect(assetLiability, manager).setOperationalTreasury(treasury.address))
        .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
        .withArgs(manager.address, ROLES.OWNER_ROLE);
    });

    it("Is reverted if the new treasury address is the same as the previous one", async () => {
      const { assetLiability } = await setUpFixture(deployContracts);

      // Check for the zero treasury address first
      await expect(assetLiability.setOperationalTreasury(ADDRESS_ZERO))
        .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_TreasuryAddressAlreadySet);

      // Set the treasury
      await proveTx(assetLiability.setOperationalTreasury(treasury.address));

      // Now try to set it to the same address
      await expect(assetLiability.setOperationalTreasury(treasury.address))
        .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_TreasuryAddressAlreadySet);
    });
  });

  describe("Function 'transferWithLiability()'", async () => {
    describe("Executes as expected if", async () => {
      it("The transfer is for a single account", async () => {
        const { assetLiability, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const amount = LIABILITY_AMOUNT;
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(amount * 2n));

        const tx = connect(assetLiability, manager).transferWithLiability([account], [amount]);

        // First check the event emission
        await expect(tx)
          .to.emit(assetLiability, EVENTS.LiabilityUpdated)
          .withArgs(account, amount, 0);

        // Then check the token balances change
        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(assetLiability), account],
          [-amount, amount]
        );

        expect(await assetLiability.liabilityOf(account)).to.equal(amount);
        expect(await assetLiability.totalLiability()).to.equal(amount);
      });

      it("The transfer is for multiple accounts, including 2 times for the first one", async () => {
        const { assetLiability, tokenMock } = await setUpFixture(deployAndConfigureContracts);
        const transferCount = 4;
        const accounts = users.slice(0, transferCount - 1).map(user => user.address);
        accounts.push(users[0].address);
        const amounts = LIABILITY_AMOUNTS.slice(0, transferCount - 1);
        amounts.push(LIABILITY_AMOUNTS[transferCount - 1]);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(totalAmount * 2n));

        // Check that the function emits the correct events
        const tx = await connect(assetLiability, manager).transferWithLiability(accounts, amounts);
        for (let i = 0; i < accounts.length - 1; ++i) {
          await expect(tx)
            .to.emit(assetLiability, EVENTS.LiabilityUpdated)
            .withArgs(accounts[i], amounts[i], 0);
        }
        await expect(tx)
          .to.emit(assetLiability, EVENTS.LiabilityUpdated)
          .withArgs(accounts[transferCount - 1], amounts[transferCount - 1] + amounts[0], amounts[0]);

        // Check the final state
        expect(await assetLiability.liabilityOf(accounts[0])).to.equal(amounts[0] + amounts[transferCount - 1]);
        expect(await assetLiability.liabilityOf(accounts[1])).to.equal(amounts[1]);
        expect(await assetLiability.liabilityOf(accounts[2])).to.equal(amounts[2]);
        expect(await assetLiability.totalLiability()).to.equal(totalAmount);

        // Check the token balance changes
        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(assetLiability), accounts[0], accounts[1], accounts[2]],
          [-totalAmount, (amounts[0] + amounts[transferCount - 1]), amounts[1], amounts[2]]
        );
      });

      it("The transfer is for the zero number of accounts", async () => {
        const { assetLiability, tokenMock } = await setUpFixture(deployAndConfigureContracts);

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(LIABILITY_AMOUNT));

        const tx = connect(assetLiability, manager).transferWithLiability([], []);

        // First check there is no event emission
        await expect(tx).not.to.emit(assetLiability, EVENTS.LiabilityUpdated);

        // Then check there is no token balance change
        await expect(tx).to.changeTokenBalances(
          tokenMock,
          [getAddress(assetLiability)],
          [0]
        );

        expect(await assetLiability.totalLiability()).to.equal(0);
      });
    });

    describe("Is reverted if", async () => {
      it("The contract is paused", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(assetLiability, minter).mintYield(LIABILITY_AMOUNT * 2n));
        await pauseContract(assetLiability);

        await expect(connect(assetLiability, manager).transferWithLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.EnforcedPause);
      });

      it("The caller lacks MANAGER_ROLE", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(assetLiability, minter).mintYield(LIABILITY_AMOUNT * 2n));

        await expect(connect(assetLiability, stranger).transferWithLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MANAGER_ROLE);

        await expect(connect(assetLiability, deployer).transferWithLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
          .withArgs(deployer.address, ROLES.MANAGER_ROLE);
      });

      it("The contract has insufficient balance", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        // Mint a small amount of yield
        const smallAmount = LIABILITY_AMOUNT / 2n;
        await proveTx(connect(assetLiability, minter).mintYield(smallAmount));

        // Try to transfer more than available
        await expect(
          connect(assetLiability, manager).transferWithLiability([user.address], [LIABILITY_AMOUNT])
        ).to.be.reverted;
      });

      it("The arrays length mismatch", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(assetLiability, minter).mintYield(LIABILITY_AMOUNT * 2n));

        const accounts = [user.address, users[1].address];
        const amounts = [LIABILITY_AMOUNT];

        await expect(connect(assetLiability, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccountsAndAmountsLengthMismatch);

        await expect(connect(assetLiability, manager).transferWithLiability([], amounts))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccountsAndAmountsLengthMismatch);
      });

      it("One of the provided accounts addresses is zero", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(assetLiability, minter).mintYield(LIABILITY_AMOUNT * 2n));

        const accounts = [user.address, ADDRESS_ZERO];
        const amounts = [LIABILITY_AMOUNT, LIABILITY_AMOUNT];

        await expect(connect(assetLiability, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccountAddressZero);
      });

      it("One of the provided amounts is zero", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(assetLiability, minter).mintYield(LIABILITY_AMOUNT * 2n));

        const accounts = [users[0].address, users[1].address];
        const amounts = [LIABILITY_AMOUNT, 0n];

        await expect(connect(assetLiability, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AmountZero);
      });

      it("One of the provided amounts exceeds 64-bit unsigned integer", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        // Mint a very large amount of yield
        const largeAmount = maxUintForBits(64) * 2n;
        await proveTx(connect(assetLiability, minter).mintYield(largeAmount));

        const accounts = [users[0].address, users[1].address];
        const amounts = [LIABILITY_AMOUNT, maxUintForBits(64) + 1n];

        await expect(connect(assetLiability, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AmountOverflow);
      });

      it("The result liability for an account exceeds 64-bit unsigned integer", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        // Mint a very large amount of yield
        const largeAmount = maxUintForBits(64) * 2n;
        await proveTx(connect(assetLiability, minter).mintYield(largeAmount));

        const accounts = [user.address, user.address];
        const amounts = [1n, maxUintForBits(64)];

        await expect(connect(assetLiability, manager).transferWithLiability(accounts, amounts))
          .to.be.revertedWithPanic(0x11);
      });
    });
  });

  describe("Function 'decreaseLiability()'", async () => {
    describe("Executes as expected if", async () => {
      it("The decrease is for a single account's full liability", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        const amount = LIABILITY_AMOUNT;
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(amount * 2n));

        // First create a liability
        await proveTx(connect(assetLiability, manager).transferWithLiability([account], [amount]));

        // Then decrease it
        await expect(connect(assetLiability, manager).decreaseLiability([account], [amount]))
          .to.emit(assetLiability, EVENTS.LiabilityUpdated)
          .withArgs(account, 0, amount);

        expect(await assetLiability.liabilityOf(account)).to.equal(0);
        expect(await assetLiability.totalLiability()).to.equal(0);
      });

      it("The decrease is for multiple accounts", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        const accounts = users.slice(0, 3).map(user => user.address);
        const amounts = LIABILITY_AMOUNTS.slice(0, 3);
        const totalAmount = amounts.reduce((acc, val) => acc + val, 0n);

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(totalAmount * 2n));

        // First create liabilities
        await proveTx(connect(assetLiability, manager).transferWithLiability(accounts, amounts));

        // Then decrease them
        await expect(connect(assetLiability, manager).decreaseLiability(accounts, amounts))
          .to.emit(assetLiability, EVENTS.LiabilityUpdated)
          .withArgs(accounts[0], 0, amounts[0])
          .to.emit(assetLiability, EVENTS.LiabilityUpdated)
          .withArgs(accounts[1], 0, amounts[1])
          .to.emit(assetLiability, EVENTS.LiabilityUpdated)
          .withArgs(accounts[2], 0, amounts[2]);

        expect(await assetLiability.liabilityOf(accounts[0])).to.equal(0);
        expect(await assetLiability.liabilityOf(accounts[1])).to.equal(0);
        expect(await assetLiability.liabilityOf(accounts[2])).to.equal(0);
        expect(await assetLiability.totalLiability()).to.equal(0);
      });

      it("The decrease is partial", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        const fullAmount = LIABILITY_AMOUNT;
        const partialAmount = LIABILITY_AMOUNT / 2n;
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(fullAmount * 2n));

        // First create a liability
        await proveTx(connect(assetLiability, manager).transferWithLiability([account], [fullAmount]));

        // Then decrease partially
        await expect(connect(assetLiability, manager).decreaseLiability([account], [partialAmount]))
          .to.emit(assetLiability, EVENTS.LiabilityUpdated)
          .withArgs(account, fullAmount - partialAmount, fullAmount);

        expect(await assetLiability.liabilityOf(account)).to.equal(fullAmount - partialAmount);
        expect(await assetLiability.totalLiability()).to.equal(fullAmount - partialAmount);
      });
    });

    describe("Is reverted if", async () => {
      it("The arrays length mismatch", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        const accounts = [user.address, users[1].address];
        const amounts = [LIABILITY_AMOUNT];

        await expect(connect(assetLiability, manager).decreaseLiability(accounts, amounts))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccountsAndAmountsLengthMismatch);
      });

      it("The caller lacks MANAGER_ROLE", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(assetLiability, stranger).decreaseLiability([user.address], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MANAGER_ROLE);
      });

      it("The account address is zero", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(assetLiability, manager).decreaseLiability([ADDRESS_ZERO], [LIABILITY_AMOUNT]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccountAddressZero);
      });

      it("The amount is zero", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(assetLiability, manager).decreaseLiability([user.address], [0]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AmountZero);
      });

      it("The decrease amount exceeds current liability", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        const initialAmount = LIABILITY_AMOUNT;
        const excessAmount = initialAmount + 1n;
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(initialAmount * 2n));

        // First create a liability
        await proveTx(connect(assetLiability, manager).transferWithLiability([account], [initialAmount]));

        // Try to decrease more than the current liability
        await expect(connect(assetLiability, manager).decreaseLiability([account], [excessAmount]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_DecreaseAmountExcess);
      });

      it("The amount exceeds uint64 max", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        const maxUint64 = maxUintForBits(64);
        const overflowAmount = maxUint64 + 1n;
        const initialAmount = LIABILITY_AMOUNT * 10n; // Create a valid initial liability
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(initialAmount * 2n));

        // First create a valid liability
        await proveTx(connect(assetLiability, manager).transferWithLiability([account], [initialAmount]));

        // Now try to decrease with an amount that exceeds uint64 max
        await expect(connect(assetLiability, manager).decreaseLiability([account], [overflowAmount]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AmountOverflow);
      });

      it("The contract is paused", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        const amount = LIABILITY_AMOUNT;
        const account = user.address;

        // Mint yield to the contract
        await proveTx(connect(assetLiability, minter).mintYield(amount * 2n));

        // First create a liability
        await proveTx(connect(assetLiability, manager).transferWithLiability([account], [amount]));

        // Pause the contract
        await pauseContract(assetLiability);

        // Try to decrease while paused
        await expect(connect(assetLiability, manager).decreaseLiability([account], [amount]))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.EnforcedPause);
      });
    });
  });

  describe("Function 'mintYield()'", async () => {
    it("Executes as expected and emits the correct event", async () => {
      const { assetLiability, tokenMock } = await setUpFixture(deployAndConfigureContracts);

      // Check initial state
      expect(await assetLiability.totalYieldSupply()).to.equal(0);
      expect(await tokenMock.balanceOf(getAddress(assetLiability))).to.equal(0);

      const amount = YIELD_AMOUNT;

      // Mint yield and check event emission
      await expect(connect(assetLiability, minter).mintYield(amount))
        .to.emit(assetLiability, EVENTS.YieldMinted)
        .withArgs(amount);

      // Check state after minting
      expect(await assetLiability.totalYieldSupply()).to.equal(amount);
      expect(await tokenMock.balanceOf(getAddress(assetLiability))).to.equal(amount);
    });

    describe("Is reverted if", async () => {
      it("The caller lacks MINTER_ROLE", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await expect(connect(assetLiability, stranger).mintYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MINTER_ROLE);

        await expect(connect(assetLiability, manager).mintYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
          .withArgs(manager.address, ROLES.MINTER_ROLE);
      });

      it("The contract is paused", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        await pauseContract(assetLiability);

        await expect(connect(assetLiability, minter).mintYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.EnforcedPause);
      });
    });
  });

  describe("Function 'burnYield()'", async () => {
    it("Executes as expected and emits the correct event", async () => {
      const { assetLiability, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const mintAmount = YIELD_AMOUNT * 2n;
      const burnAmount = YIELD_AMOUNT;
      const remainingAmount = mintAmount - burnAmount;

      // First mint some yield
      await proveTx(connect(assetLiability, minter).mintYield(mintAmount));
      expect(await assetLiability.totalYieldSupply()).to.equal(mintAmount);

      // Now burn part of it and check event emission
      await expect(connect(assetLiability, minter).burnYield(burnAmount))
        .to.emit(assetLiability, EVENTS.YieldBurned)
        .withArgs(burnAmount);

      // Check state after burning
      expect(await assetLiability.totalYieldSupply()).to.equal(remainingAmount);
      expect(await tokenMock.balanceOf(getAddress(assetLiability))).to.equal(remainingAmount);
    });

    describe("Is reverted if", async () => {
      it("The caller lacks MINTER_ROLE", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);
        // First mint some yield
        await proveTx(connect(assetLiability, minter).mintYield(YIELD_AMOUNT));

        await expect(connect(assetLiability, stranger).burnYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
          .withArgs(stranger.address, ROLES.MINTER_ROLE);

        await expect(connect(assetLiability, manager).burnYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.AssetLiability_AccessControlUnauthorizedAccount)
          .withArgs(manager.address, ROLES.MINTER_ROLE);
      });

      it("The contract is paused", async () => {
        const { assetLiability } = await setUpFixture(deployAndConfigureContracts);

        await proveTx(connect(assetLiability, minter).mintYield(YIELD_AMOUNT));
        await pauseContract(assetLiability);

        await expect(connect(assetLiability, minter).burnYield(YIELD_AMOUNT))
          .to.be.revertedWithCustomError(assetLiability, ERRORS.EnforcedPause);
      });
    });
  });
});
