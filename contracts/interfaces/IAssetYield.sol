// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

/**
 * @title IAssetYieldPrimary interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the primary interface of the asset yield contract.
 */
interface IAssetYieldPrimary {
    // ------------------ Events----------------------------------- //

    /**
     * @dev Emitted when the yield asset has been minted.
     *
     * @param amount The amount of yield asset that has been minted.
     */
    event YieldMinted(uint256 amount);

    /**
     * @dev Emitted when the yield asset has been burned.
     *
     * @param amount The amount of yield asset that has been burned.
     */
    event YieldBurned(uint256 amount);

    /**
     * @dev Emitted when the liability of an account has been updated.
     *
     * @param account The account whose liability has been updated.
     * @param newLiability The new liability of the account.
     * @param oldLiability The previous liability of the account.
     */
    event LiabilityUpdated(address indexed account, uint256 newLiability, uint256 oldLiability);

    // ------------------ Transactional functions ----------------- //

    /**
     * @dev Mints a specified amount of underlying tokens as yield asset.
     *
     * This function can be called only by an account with a special role.
     *
     * @param amount The amount of yield asset to mint.
     */
    function mintYield(uint256 amount) external;

    /**
     * @dev Burns a specified amount of underlying tokens as yield asset.
     *
     * This function can be called only by an account with a special role.
     *
     * @param amount The amount of yield asset to burn.
     */
    function burnYield(uint256 amount) external;

    /**
     * @dev Transfers a specified amount of tokens from the contract to an account and
     * increases the liability of the account.
     *
     * This function can be called only by an account with a special role.
     *
     * Emits multiple {LiabilityUpdated} events.
     *
     * @param accounts The accounts to transfer the tokens to.
     * @param amounts The amounts of tokens to transfer.
     */
    function transferWithLiability(address[] calldata accounts, uint256[] calldata amounts) external;

    /**
     * @dev Decreases the liability of an account by a specified amount.
     *
     * This function can be called only by an account with a special role.
     *
     * Emits multiple {LiabilityUpdated} events.
     *
     * @param accounts The accounts to decrease the liability for.
     * @param amounts The amounts to decrease the liability by.
     */
    function decreaseLiability(address[] calldata accounts, uint256[] calldata amounts) external;

    // ------------------ View functions -------------------------- //

    /**
     * @dev Returns the liability of an account.
     *
     * @param account The account to get the liability of.
     * @return The liability of the account.
     */
    function liabilityOf(address account) external view returns (uint256);

    /**
     * @dev Returns the total supply of yield asset.
     *
     * @return The total supply of yield asset.
     */
    function totalYieldSupply() external view returns (uint256);

    /**
     * @dev Returns the total liability of all accounts.
     *
     * @return The total liability of all accounts.
     */
    function totalLiability() external view returns (uint256);
}

/**
 * @title IAssetYieldConfiguration interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the configuration interface of the asset yield contract.
 */
interface IAssetYieldConfiguration {
    // ------------------ View functions -------------------------- //

    /**
     * @dev Returns the address of the underlying token contract.
     *
     * @return The address of the underlying token contract.
     */
    function underlyingToken() external view returns (address);
}

/**
 * @title IAssetYieldErrors interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the errors of the asset yield contract.
 */
interface IAssetYieldErrors {
    /// @dev Thrown if the implementation address is invalid during an upgrade.
    error AssetYield_ImplementationAddressInvalid();

    /// @dev Thrown if the underlying token address provided is zero.
    error AssetYield_UnderlyingTokenAddressZero();

    /// @dev Thrown if the accounts and amounts arrays have different lengths.
    error AssetYield_AccountsAndAmountsLengthMismatch();

    /// @dev Thrown if the address of the account is zero.
    error AssetYield_AccountAddressZero();

    /// @dev Thrown if the amount is zero when its not allowed.
    error AssetYield_AmountZero();

    /// @dev Thrown if the decrease amount exceeds the current liability of an account.
    error AssetYield_DecreaseAmountExcess();

    /// @dev Thrown if the amount is too large to be stored in a uint64.
    error AssetYield_AmountOverflow();
}

/**
 * @title IAssetYield interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev The full interface of the asset yield contract.
 */
interface IAssetYield is IAssetYieldPrimary, IAssetYieldConfiguration, IAssetYieldErrors {
    /**
     * @dev Proves the contract is the asset yield one.
     *
     * It is used for simple contract compliance checks, e.g. during an upgrade.
     * This avoids situations where a wrong contract address is specified by mistake.
     */
    function proveAssetYield() external pure;
}
