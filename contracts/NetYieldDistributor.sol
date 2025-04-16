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
 * @dev The contract that manages the net yield for accounts.
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
        __PausableExt_init_unchained(OWNER_ROLE);
        __Rescuable_init_unchained(OWNER_ROLE);
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
     */
    function __NetYieldDistributor_init_unchained(address underlyingToken_) internal {
        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
        _setRoleAdmin(MINTER_ROLE, OWNER_ROLE);
        _setRoleAdmin(MANAGER_ROLE, OWNER_ROLE);
        _grantRole(OWNER_ROLE, _msgSender());

        if (underlyingToken_ == address(0)) {
            revert NetYieldDistributor_UnderlyingTokenAddressZero();
        }

        _getNetYieldDistributorStorage().underlyingToken = underlyingToken_;
    }

    // ------------------ Transactional functions ----------------- //

    /**
     * @inheritdoc INetYieldDistributorPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MINTER_ROLE} role.
     */
    function mintAssetYield(uint256 amount) external whenNotPaused onlyRole(MINTER_ROLE) {
        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();

        IERC20Mintable($.underlyingToken).mint(address(this), amount);
        $.totalNetYieldSupply += amount;

        emit AssetYieldMinted(amount);
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {MINTER_ROLE} role.
     * - The contract must have sufficient token balance to cover the burn.
     */
    function burnAssetYield(uint256 amount) external whenNotPaused onlyRole(MINTER_ROLE) {
        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();

        IERC20Mintable($.underlyingToken).burn(amount);
        $.totalNetYieldSupply -= amount;

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
     * - None of the account addresses can be zero.
     * - None of the amounts can be zero.
     * - None of the amounts can exceed the maximum uint64 value.
     * - The contract must have sufficient token balance to cover the transfers.
     */
    function advanceNetYield(
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        uint256 length = accounts.length;

        if (length != amounts.length) {
            revert NetYieldDistributor_AccountsAndAmountsLengthMismatch();
        }

        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();

        for (uint256 i = 0; i < length; ) {
            _advanceNetYield($, accounts[i], amounts[i]);
            unchecked {
                ++i;
            } // Gas optimization - no risk of overflow with reasonable array sizes
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
     * - None of the account addresses can be zero.
     * - None of the amounts can be zero.
     * - None of the amounts can exceed the maximum uint64 value.
     * - None of the amounts can exceed the current advanced net yield balance of the respective account.
     */
    function reduceAdvanceNetYield(
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        uint256 length = accounts.length;

        if (length != amounts.length) {
            revert NetYieldDistributor_AccountsAndAmountsLengthMismatch();
        }

        NetYieldDistributorStorage storage $ = _getNetYieldDistributorStorage();
        uint256 totalAmount = 0;

        for (uint256 i = 0; i < length; ) {
            _reduceAdvanceNetYield($, accounts[i], amounts[i]);
            totalAmount += amounts[i];
            unchecked {
                ++i;
            } // Gas optimization - no risk of overflow with reasonable array sizes
        }

        $.totalNetYieldSupply -= totalAmount;
    }

    // ------------------ View functions -------------------------- //

    /**
     * @inheritdoc INetYieldDistributorConfiguration
     */
    function underlyingToken() external view returns (address) {
        return _getNetYieldDistributorStorage().underlyingToken;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function advanceNetYieldOf(address account) external view returns (uint256) {
        return _getNetYieldDistributorStorage().advancedNetYields[account].current;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function totalNetYieldSupply() external view returns (uint256) {
        return _getNetYieldDistributorStorage().totalNetYieldSupply;
    }

    /**
     * @inheritdoc INetYieldDistributorPrimary
     */
    function totalAdvanceYield() external view returns (uint256) {
        return _getNetYieldDistributorStorage().totalAdvanceYield;
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
    function _advanceNetYield(NetYieldDistributorStorage storage $, address account, uint256 amount) internal {
        _increaseAdvancedNetYield($, account, amount);
        SafeERC20.safeTransfer(IERC20($.underlyingToken), account, amount);
    }

    /**
     * @dev Increases the advanced net yield balance of an account.
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
    function _increaseAdvancedNetYield(NetYieldDistributorStorage storage $, address account, uint256 amount) internal {
        _checkAdvancedNetYieldOperationParameters(account, amount);

        AdvancedNetYield storage advancedNetYield = $.advancedNetYields[account];
        uint256 oldAdvancedNetYield = advancedNetYield.current;

        uint256 newAdvancedNetYield = uint64(oldAdvancedNetYield) + uint64(amount); // Panic if result is larger than 64 bits
        advancedNetYield.current = uint64(newAdvancedNetYield);
        advancedNetYield.total += uint64(amount);
        $.totalAdvanceYield += amount;

        emit NetYieldAdvanced(account, amount);
    }

    /**
     * @dev Decreases the advanced net yield balance of an account.
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
     * Emits a {NetYieldReduced} event.
     */
    function _reduceAdvanceNetYield(NetYieldDistributorStorage storage $, address account, uint256 amount) internal {
        _checkAdvancedNetYieldOperationParameters(account, amount);

        AdvancedNetYield storage advancedNetYield = $.advancedNetYields[account];
        uint256 oldAdvancedNetYield = advancedNetYield.current;

        if (amount > oldAdvancedNetYield) {
            revert NetYieldDistributor_DecreaseAmountExcess();
        }

        // Safe to use unchecked here because:
        // 1. We've verified that amount <= oldAdvancedNetYield above
        // 2. data.totalAdvanceYield >= advancedNetYield.current by definition
        uint256 newAdvancedNetYield;
        unchecked {
            newAdvancedNetYield = oldAdvancedNetYield - amount;
            advancedNetYield.current = uint64(newAdvancedNetYield);
            $.totalAdvanceYield -= amount;
        }

        emit NetYieldReduced(account, amount);
    }

    /**
     * @dev Checks the parameters of the advanced net yield operation.
     * @param account The account to update the advanced net yield for.
     * @param amount The amount to update the advanced net yield by.
     */
    function _checkAdvancedNetYieldOperationParameters(address account, uint256 amount) internal pure {
        if (account == address(0)) {
            revert NetYieldDistributor_AccountAddressZero();
        }

        if (amount == 0) {
            revert NetYieldDistributor_AmountZero();
        }

        if (amount > type(uint64).max) {
            revert NetYieldDistributor_AmountOverflow();
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
