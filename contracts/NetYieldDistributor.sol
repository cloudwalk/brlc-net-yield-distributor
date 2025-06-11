// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { AccessControlExtUpgradeable } from "./base/AccessControlExtUpgradeable.sol";
import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";
import { RescuableUpgradeable } from "./base/RescuableUpgradeable.sol";
import { UUPSExtUpgradeable } from "./base/UUPSExtUpgradeable.sol";
import { Versionable } from "./base/Versionable.sol";

import { NetYieldDistributorStorageLayout } from "./NetYieldDistributorStorageLayout.sol";

import { INetYieldDistributor } from "./interfaces/INetYieldDistributor.sol";
import { INetYieldDistributorPrimary } from "./interfaces/INetYieldDistributor.sol";
import { INetYieldDistributorConfiguration } from "./interfaces/INetYieldDistributor.sol";
import { IERC20Mintable } from "./interfaces/IERC20Mintable.sol";

/**
 * @title NetYieldDistributor contract
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev A contract that manages the distribution of net yield to accounts.
 *
 * This contract handles minting and burning of asset yield tokens, advancing net yield to accounts,
 * and tracking advanced net yield balances for each account. It also tracks the total advanced net yield
 * and the cumulative amount of advanced net yield reductions across all accounts.
 */
contract NetYieldDistributor is
    NetYieldDistributorStorageLayout,
    AccessControlExtUpgradeable,
    PausableExtUpgradeable,
    RescuableUpgradeable,
    UUPSExtUpgradeable,
    Versionable,
    INetYieldDistributor
{
    // ------------------ Constructor ----------------------------- //

    /// @dev Constructor that prohibits the initialization of the implementation of the upgradable contract.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ------------------ Initializers ---------------------------- //

    /**
     * @dev Initializer of the upgradable contract.
     *
     * See details: https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable
     *
     * Requirements:
     *
     * - The function must not be called more than once.
     * - The token address must not be zero.
     *
     * @param underlyingToken_ The address of the token to set as the underlying one.
     * This is the ERC20 token that will be used for transfers and advanced net yield tracking.
     * Cannot be zero address.
     */
    function initialize(address underlyingToken_) external initializer {
        __AccessControlExt_init_unchained(); // This is needed only to avoid errors during coverage assessment
        __PausableExt_init_unchained();
        __Rescuable_init_unchained();
        __UUPSExt_init_unchained(); // This is needed only to avoid errors during coverage assessment
        __NetYieldDistributor_init_unchained(underlyingToken_);
    }

    /**
     * @dev Unchained version of the initializer.
     *
     * Requirements:
     *
     * - The token address must not be zero.
     *
     * @param underlyingToken_ The address of the token to set as the underlying one.
     * This is the ERC20 token that will be used for transfers and advanced net yield tracking.
     */
    function __NetYieldDistributor_init_unchained(address underlyingToken_) internal {
        if (underlyingToken_ == address(0)) {
            revert NetYieldDistributor_UnderlyingTokenAddressZero();
        }

        _setRoleAdmin(MINTER_ROLE, GRANTOR_ROLE);
        _setRoleAdmin(MANAGER_ROLE, GRANTOR_ROLE);
        _grantRole(OWNER_ROLE, _msgSender());

        _getNetYieldDistributorStorage().underlyingToken = underlyingToken_;
    }

    // ------------------ Transactional functions ----------------- //

    /**
     * @inheritdoc INetYieldDistributorConfiguration
     *
     * @dev Requirements:
     *
     * - The caller must have the {OWNER_ROLE} role.
     * - The new treasury address must not be the same as currently set.
     */
    function setOperationalTreasury(address operationalTreasury_) external onlyRole(OWNER_ROLE) {
        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();

        if (operationalTreasury_ == $.operationalTreasury) {
            revert NetYieldDistributor_TreasuryAddressAlreadySet();
        }

        emit OperationalTreasuryUpdated(operationalTreasury_, $.operationalTreasury);

        $.operationalTreasury = operationalTreasury_;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MINTER_ROLE} role.
     * - The amount must not exceed the maximum uint64 value.
     */
    function mintAssetYield(uint64 amount) external whenNotPaused onlyRole(MINTER_ROLE) {
        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();

        IERC20Mintable($.underlyingToken).mint(address(this), amount);
        $.totalAssetYieldSupply += amount;

        emit AssetYieldMinted(amount);
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MINTER_ROLE} role.
     * - The amount must not exceed the maximum uint64 value.
     * - The contract must have sufficient token balance to cover the burn.
     */
    function burnAssetYield(uint64 amount) external whenNotPaused onlyRole(MINTER_ROLE) {
        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();

        IERC20Mintable($.underlyingToken).burn(amount);
        $.totalAssetYieldSupply -= amount;

        emit AssetYieldBurned(amount);
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MANAGER_ROLE} role.
     * - The length of accounts and amounts arrays must match.
     * - None of the account addresses must be zero.
     * - None of the amounts must be zero.
     * - The contract must have sufficient token balance to cover the transfers.
     * - The total advanced net yield after distribution must not exceed the total asset yield supply.
     */
    function advanceNetYield(
        address[] calldata accounts,
        uint64[] calldata amounts
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        uint256 length = accounts.length;

        if (length != amounts.length) {
            revert NetYieldDistributor_AccountsAndAmountsLengthMismatch();
        }

        if (length == 0) {
            revert NetYieldDistributor_AccountsArrayEmpty();
        }

        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();

        for (uint256 i = 0; i < length; ) {
            _advanceNetYield($, accounts[i], amounts[i]);
            unchecked {
                ++i;
            }
        }

        if ($.totalAdvancedNetYield > $.totalAssetYieldSupply) {
            revert NetYieldDistributor_TotalAdvancedNetYieldExcess();
        }
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MANAGER_ROLE} role.
     * - The length of accounts and amounts arrays must match.
     * - None of the account addresses must be zero.
     * - None of the amounts must be zero.
     * - None of the amounts must exceed the maximum uint64 value.
     * - None of the amounts must exceed the current advanced net yield balance of the respective account.
     * - The treasury must have sufficient tokens for the transaction.
     */
    function reduceAdvancedNetYield(
        address[] calldata accounts,
        uint64[] calldata amounts
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        uint256 length = accounts.length;

        if (length != amounts.length) {
            revert NetYieldDistributor_AccountsAndAmountsLengthMismatch();
        }

        if (accounts.length == 0) {
            revert NetYieldDistributor_AccountsArrayEmpty();
        }

        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();
        uint64 totalAmount = 0;

        for (uint256 i = 0; i < length; ) {
            _reduceAdvancedNetYield($, accounts[i], amounts[i]);
            totalAmount += amounts[i];
            unchecked {
                ++i;
            }
        }

        $.totalAssetYieldSupply -= totalAmount;
        $.cumulativeReducedNetYield += totalAmount;

        // Transfer the tokens from the treasury to the contract and burn them
        SafeERC20.safeTransferFrom(IERC20($.underlyingToken), $.operationalTreasury, address(this), totalAmount);
        IERC20Mintable($.underlyingToken).burn(totalAmount);
    }

    // ------------------ View functions -------------------------- //

    /**
     * @inheritdoc INetYieldDistributorConfiguration
     */
    function underlyingToken() external view returns (address) {
        return _getNetYieldDistributorStorage().underlyingToken;
    }

    /**
     * @inheritdoc INetYieldDistributorConfiguration
     */
    function operationalTreasury() external view returns (address) {
        return _getNetYieldDistributorStorage().operationalTreasury;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function advancedNetYieldOf(address account) external view returns (uint256) {
        return _getNetYieldDistributorStorage().yieldStates[account].advanced;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function cumulativeReducedNetYieldOf(address account) external view returns (uint256) {
        return _getNetYieldDistributorStorage().yieldStates[account].cumulativeReduced;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function totalAssetYieldSupply() external view returns (uint256) {
        return _getNetYieldDistributorStorage().totalAssetYieldSupply;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function totalAdvancedNetYield() external view returns (uint256) {
        return _getNetYieldDistributorStorage().totalAdvancedNetYield;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function cumulativeReducedNetYield() external view returns (uint256) {
        return _getNetYieldDistributorStorage().cumulativeReducedNetYield;
    }

    // ------------------ Pure functions -------------------------- //

    /// @inheritdoc INetYieldDistributor
    function proveNetYieldDistributor() external pure {}

    // ------------------ Internal functions ---------------------- //

    /**
     * @dev Transfers tokens to an account and increases its advanced net yield balance.
     *
     * Requirements:
     *
     * - The account address must not be zero.
     * - The amount must not be zero.
     * - The amount must not exceed the maximum uint64 value.
     * - The contract must have sufficient tokens to transfer.
     *
     * @param account The account to transfer tokens to.
     * @param amount The amount of tokens to transfer.
     *
     * Emits a {NetYieldAdvanced} event (via the _increaseAdvancedNetYield function).
     */
    function _advanceNetYield(NetYieldDistributorStorage storage $, address account, uint64 amount) internal {
        _increaseAdvancedNetYield($, account, amount);
        SafeERC20.safeTransfer(IERC20($.underlyingToken), account, amount);
    }

    /**
     * @dev Increases the advanced net yield balance of an account without transferring tokens.
     *
     * Requirements:
     *
     * - The account address must not be zero.
     * - The amount must not be zero.
     * - The amount must not exceed the maximum uint64 value.
     *
     * @param account The account to increase the advanced net yield for.
     * @param amount The amount to increase the advanced net yield by.
     *
     * Emits a {NetYieldAdvanced} event.
     */
    function _increaseAdvancedNetYield(NetYieldDistributorStorage storage $, address account, uint64 amount) internal {
        _checkAdvancedNetYieldOperationParameters(account, amount);

        YieldState storage yieldBalance = $.yieldStates[account];
        uint64 oldAdvanced = yieldBalance.advanced;

        uint64 newAdvanced = oldAdvanced + amount;
        yieldBalance.advanced = newAdvanced;
        $.totalAdvancedNetYield += amount;

        emit NetYieldAdvanced(account, amount);
    }

    /**
     * @dev Decreases the advanced net yield balance of an account without burning tokens.
     *
     * Requirements:
     *
     * - The account address must not be zero.
     * - The amount must not be zero.
     * - The amount must not exceed the maximum uint64 value.
     * - The amount must not exceed the current advanced net yield balance of the account.
     *
     * @param account The account to decrease the advanced net yield for.
     * @param amount The amount to decrease the advanced net yield by.
     *
     * Emits a {AdvancedNetYieldReduced} event.
     */
    function _reduceAdvancedNetYield(NetYieldDistributorStorage storage $, address account, uint64 amount) internal {
        _checkAdvancedNetYieldOperationParameters(account, amount);

        YieldState storage yieldBalance = $.yieldStates[account];
        uint64 oldAdvanced = yieldBalance.advanced;

        if (amount > oldAdvanced) {
            revert NetYieldDistributor_AdvancedNetYieldInsufficientBalance();
        }

        // Safe to use unchecked here because:
        // 1. We've verified that amount <= oldAdvancedNetYield above
        // 2. data.totalAdvancedNetYield >= advancedNetYield.current by definition
        uint64 newAdvanced;
        unchecked {
            newAdvanced = oldAdvanced - amount;
            yieldBalance.advanced = newAdvanced;
            yieldBalance.cumulativeReduced += amount;
            $.totalAdvancedNetYield -= amount;
        }

        emit AdvancedNetYieldReduced(account, amount);
    }

    /**
     * @dev Validates the parameters for advanced net yield operations to ensure they meet requirements.
     *
     * Requirements:
     *
     * - The account address must not be zero.
     * - The amount must not be zero.
     *
     * @param account The account to validate.
     * @param amount The amount to validate.
     */
    function _checkAdvancedNetYieldOperationParameters(address account, uint64 amount) internal pure {
        if (account == address(0)) {
            revert NetYieldDistributor_AccountAddressZero();
        }

        if (amount == 0) {
            revert NetYieldDistributor_AmountZero();
        }
    }

    /**
     * @dev The upgrade validation function for the UUPSExtUpgradeable contract.
     *
     * Requirements:
     *
     * - The caller must have the {OWNER_ROLE} role.
     * - The new implementation address must be a valid NetYieldDistributor contract.
     *
     * @param newImplementation The address of the new implementation.
     */
    function _validateUpgrade(address newImplementation) internal view override onlyRole(OWNER_ROLE) {
        try INetYieldDistributor(newImplementation).proveNetYieldDistributor() {} catch {
            revert NetYieldDistributor_ImplementationAddressInvalid();
        }
    }
}
