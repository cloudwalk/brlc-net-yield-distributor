// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { AccessControlExtUpgradeable } from "./base/AccessControlExtUpgradeable.sol";
import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";
import { RescuableUpgradeable } from "./base/RescuableUpgradeable.sol";
import { UUPSExtUpgradeable } from "./base/UUPSExtUpgradeable.sol";
import { Versionable } from "./base/Versionable.sol";

import { AssetLiabilityStorageLayout } from "./AssetLiabilityStorageLayout.sol";

import { IAssetLiability } from "./interfaces/IAssetLiability.sol";
import { IAssetLiabilityPrimary } from "./interfaces/IAssetLiability.sol";
import { IAssetLiabilityConfiguration } from "./interfaces/IAssetLiability.sol";
import { IERC20Mintable } from "./interfaces/IERC20Mintable.sol";

/**
 * @title AssetLiability contract
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev The contract that manages the asset liability of accounts.
 */
contract AssetLiability is
    AssetLiabilityStorageLayout,
    AccessControlExtUpgradeable,
    PausableExtUpgradeable,
    RescuableUpgradeable,
    UUPSExtUpgradeable,
    Versionable,
    IAssetLiability
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
     * This is the ERC20 token that will be used for transfers and liability tracking.
     * Cannot be zero address.
     */
    function initialize(address underlyingToken_) external initializer {
        __AccessControlExt_init_unchained(); // This is needed only to avoid errors during coverage assessment
        __PausableExt_init_unchained(OWNER_ROLE);
        __Rescuable_init_unchained(OWNER_ROLE);
        __UUPSExt_init_unchained(); // This is needed only to avoid errors during coverage assessment
        __AssetLiability_init_unchained(underlyingToken_);
    }

    /**
     * @dev Unchained version of the initializer.
     *
     * Requirements:
     *
     * - The token address must not be zero.
     *
     * @param underlyingToken_ The address of the token to set as the underlying one.
     */
    function __AssetLiability_init_unchained(address underlyingToken_) internal {
        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
        _setRoleAdmin(MINTER_ROLE, OWNER_ROLE);
        _setRoleAdmin(MANAGER_ROLE, OWNER_ROLE);
        _grantRole(OWNER_ROLE, _msgSender());

        if (underlyingToken_ == address(0)) {
            revert AssetLiability_UnderlyingTokenAddressZero();
        }

        _getAssetLiabilityStorage().underlyingToken = underlyingToken_;
    }

    // ------------------ Transactional functions ----------------- //

    /**
     * @inheritdoc IAssetLiabilityPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MINTER_ROLE} role.
     */
    function mintYield(uint256 amount) external whenNotPaused onlyRole(MINTER_ROLE) {
        AssetLiabilityStorage storage $ = _getAssetLiabilityStorage();

        IERC20Mintable($.underlyingToken).mint(address(this), amount);
        $.totalYieldSupply += amount;

        emit YieldMinted(amount);
    }

    /**
     * @inheritdoc IAssetLiabilityPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MINTER_ROLE} role.
     * - The contract must have sufficient token balance to cover the burn.
     */
    function burnYield(uint256 amount) external whenNotPaused onlyRole(MINTER_ROLE) {
        AssetLiabilityStorage storage $ = _getAssetLiabilityStorage();

        IERC20Mintable($.underlyingToken).burn(amount);
        $.totalYieldSupply -= amount;

        emit YieldBurned(amount);
    }

    /**
     * @inheritdoc IAssetLiabilityPrimary
     */
    function totalYieldSupply() external view returns (uint256) {
        return _getAssetLiabilityStorage().totalYieldSupply;
    }

    /**
     * @inheritdoc IAssetLiabilityPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MANAGER_ROLE} role.
     * - The length of accounts and amounts arrays must match.
     * - None of the account addresses can be zero.
     * - None of the amounts can be zero.
     * - None of the amounts can exceed the maximum uint64 value.
     * - The contract must have sufficient token balance to cover the transfers.
     */
    function transferWithLiability(
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        uint256 length = accounts.length;

        if (length != amounts.length) {
            revert AssetLiability_AccountsAndAmountsLengthMismatch();
        }

        AssetLiabilityStorage storage $ = _getAssetLiabilityStorage();

        for (uint256 i = 0; i < length; ) {
            _transferWithLiability($, accounts[i], amounts[i]);
            unchecked {
                ++i;
            } // Gas optimization - no risk of overflow with reasonable array sizes
        }
    }

    /**
     * @inheritdoc IAssetLiabilityPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MANAGER_ROLE} role.
     * - The length of accounts and amounts arrays must match.
     * - None of the account addresses can be zero.
     * - None of the amounts can be zero.
     * - None of the amounts can exceed the maximum uint64 value.
     * - None of the amounts can exceed the current liability of the respective account.
     */
    function decreaseLiability(
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        uint256 length = accounts.length;

        if (length != amounts.length) {
            revert AssetLiability_AccountsAndAmountsLengthMismatch();
        }

        AssetLiabilityStorage storage $ = _getAssetLiabilityStorage();
        uint256 totalAmount = 0;

        for (uint256 i = 0; i < length; ) {
            _decreaseLiability($, accounts[i], amounts[i]);
            totalAmount += amounts[i];
            unchecked {
                ++i;
            } // Gas optimization - no risk of overflow with reasonable array sizes
        }

        $.totalYieldSupply -= totalAmount;
    }

    // ------------------ View functions -------------------------- //

    /**
     * @inheritdoc IAssetLiabilityConfiguration
     */
    function underlyingToken() external view returns (address) {
        return _getAssetLiabilityStorage().underlyingToken;
    }

    /**
     * @inheritdoc IAssetLiabilityPrimary
     */
    function liabilityOf(address account) external view returns (uint256) {
        return _getAssetLiabilityStorage().liabilities[account].amount;
    }

    /**
     * @inheritdoc IAssetLiabilityPrimary
     */
    function totalLiability() external view returns (uint256) {
        return _getAssetLiabilityStorage().totalLiability;
    }

    // ------------------ Pure functions -------------------------- //

    /// @inheritdoc IAssetLiability
    function proveAssetLiability() external pure {}

    // ------------------ Internal functions ---------------------- //

    /**
     * @dev Transfers tokens to an account and increases its liability.
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
     * Emits a {LiabilityUpdated} event (via the _increaseLiability function).
     */
    function _transferWithLiability(AssetLiabilityStorage storage $, address account, uint256 amount) internal {
        _increaseLiability($, account, amount);
        SafeERC20.safeTransfer(IERC20($.underlyingToken), account, amount);
    }

    /**
     * @dev Increases the liability of an account.
     *
     * Requirements:
     *
     * - The account address must not be zero.
     * - The amount must not be zero.
     * - The amount must not exceed the maximum uint64 value.
     *
     * @param account The account to increase the liability for.
     * @param amount The amount to increase the liability by.
     *
     * Emits a {LiabilityUpdated} event.
     */
    function _increaseLiability(AssetLiabilityStorage storage $, address account, uint256 amount) internal {
        _checkLiabilityOperationParameters(account, amount);

        Liability storage liability = $.liabilities[account];
        uint256 oldLiability = liability.amount;

        uint256 newLiability = uint64(oldLiability) + uint64(amount); // Panic if result is larger than 64 bits
        liability.amount = uint64(newLiability);
        $.totalLiability += amount;

        emit LiabilityUpdated(account, newLiability, oldLiability);
    }

    /**
     * @dev Decreases the liability of an account.
     *
     * Requirements:
     *
     * - The account address must not be zero.
     * - The amount must not be zero.
     * - The amount must not exceed the maximum uint64 value.
     * - The amount must not exceed the current liability of the account.
     *
     * @param account The account to decrease the liability for.
     * @param amount The amount to decrease the liability by.
     *
     * Emits a {LiabilityUpdated} event.
     */
    function _decreaseLiability(AssetLiabilityStorage storage $, address account, uint256 amount) internal {
        _checkLiabilityOperationParameters(account, amount);

        Liability storage liability = $.liabilities[account];
        uint256 oldLiability = liability.amount;

        if (amount > oldLiability) {
            revert AssetLiability_DecreaseAmountExcess();
        }

        // Safe to use unchecked here because:
        // 1. We've verified that amount <= oldLiability above
        // 2. data.totalLiability >= liability.amount by definition
        uint256 newLiability;
        unchecked {
            newLiability = oldLiability - amount;
            liability.amount = uint64(newLiability);
            $.totalLiability -= amount;
        }

        emit LiabilityUpdated(account, newLiability, oldLiability);
    }

    /**
     * @dev Checks the parameters of the liability increase/decrease operation.
     * @param account The account to update the liability for.
     * @param amount The amount to update the liability by.
     */
    function _checkLiabilityOperationParameters(address account, uint256 amount) internal pure {
        if (account == address(0)) {
            revert AssetLiability_AccountAddressZero();
        }

        if (amount == 0) {
            revert AssetLiability_AmountZero();
        }

        if (amount > type(uint64).max) {
            revert AssetLiability_AmountOverflow();
        }
    }

    /**
     * @dev The upgrade validation function for the UUPSExtUpgradeable contract.
     *
     * Requirements:
     *
     * - The caller must have the {OWNER_ROLE} role.
     * - The new implementation address must be a valid AssetLiability contract.
     *
     * @param newImplementation The address of the new implementation.
     */
    function _validateUpgrade(address newImplementation) internal view override onlyRole(OWNER_ROLE) {
        try IAssetLiability(newImplementation).proveAssetLiability() {} catch {
            revert AssetLiability_ImplementationAddressInvalid();
        }
    }
}
