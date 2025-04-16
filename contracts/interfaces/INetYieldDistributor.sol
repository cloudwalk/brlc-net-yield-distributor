// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

/**
 * @title INetYieldDistributorPrimary interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the primary interface of the net yield distributor contract.
 */
interface INetYieldDistributorPrimary {
    // ------------------ Events----------------------------------- //

    /**
     * @dev Emitted when asset yield tokens are minted.
     *
     * @param amount The amount of asset yield tokens that were minted.
     */
    event AssetYieldMinted(uint256 amount);

    /**
     * @dev Emitted when asset yield tokens are burned.
     *
     * @param amount The amount of asset yield tokens that were burned.
     */
    event AssetYieldBurned(uint256 amount);

    /**
     * @dev Emitted when net yield is advanced to an account.
     *
     * @param account The account that received the advanced net yield.
     * @param amount The amount of net yield advanced to the account.
     */
    event NetYieldAdvanced(address indexed account, uint256 amount);

    /**
     * @dev Emitted when advanced net yield is reduced for an account.
     *
     * @param account The account that had its advanced net yield reduced.
     * @param amount The amount by which the advanced net yield was reduced.
     */
    event NetYieldReduced(address indexed account, uint256 amount);

    // ------------------ Transactional functions ----------------- //

    /**
     * @dev Mints a specified amount of asset yield tokens to the contract.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits an {AssetYieldMinted} event.
     *
     * @param amount The amount of asset yield tokens to mint.
     */
    function mintAssetYield(uint256 amount) external;

    /**
     * @dev Burns a specified amount of asset yield tokens from the contract.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits an {AssetYieldBurned} event.
     *
     * @param amount The amount of asset yield tokens to burn.
     */
    function burnAssetYield(uint256 amount) external;

    /**
     * @dev Advances net yield to specified accounts by transferring asset yield tokens.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits a {NetYieldAdvanced} event for each account that receives net yield.
     *
     * @param accounts The accounts to advance net yield to.
     * @param amounts The amounts of net yield to advance to each account.
     */
    function advanceNetYield(address[] calldata accounts, uint256[] calldata amounts) external;

    /**
     * @dev Reduces the advanced net yield balance of specified accounts.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits a {NetYieldReduced} event for each account whose advanced net yield is reduced.
     *
     * @param accounts The accounts to reduce the advanced net yield for.
     * @param amounts The amounts to reduce for each account.
     */
    function reduceAdvanceNetYield(address[] calldata accounts, uint256[] calldata amounts) external;

    // ------------------ View functions -------------------------- //

    /**
     * @dev Returns the amount of advanced net yield for an account.
     *
     * @param account The account to query.
     * @return The amount of advanced net yield for the account.
     */
    function advanceNetYieldOf(address account) external view returns (uint256);

    /**
     * @dev Returns the total supply of asset yield tokens.
     *
     * @return The total supply of asset yield tokens.
     */
    function totalNetYieldSupply() external view returns (uint256);

    /**
     * @dev Returns the total amount of advanced net yield across all accounts.
     *
     * @return The total amount of advanced net yield.
     */
    function totalAdvanceYield() external view returns (uint256);
}

/**
 * @title INetYieldDistributorConfiguration interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the configuration interface of the net yield distributor contract.
 */
interface INetYieldDistributorConfiguration {
    // ------------------ View functions -------------------------- //

    /**
     * @dev Returns the address of the underlying token contract.
     *
     * @return The address of the underlying token contract.
     */
    function underlyingToken() external view returns (address);
}

/**
 * @title INetYieldDistributorErrors interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the errors of the net yield distributor contract.
 */
interface INetYieldDistributorErrors {
    /// @dev Thrown if the implementation address is invalid during an upgrade.
    error NetYieldDistributor_ImplementationAddressInvalid();

    /// @dev Thrown if the underlying token address provided is zero.
    error NetYieldDistributor_UnderlyingTokenAddressZero();

    /// @dev Thrown if the accounts and amounts arrays have different lengths.
    error NetYieldDistributor_AccountsAndAmountsLengthMismatch();

    /// @dev Thrown if the account address is zero.
    error NetYieldDistributor_AccountAddressZero();

    /// @dev Thrown if the amount is zero when a non-zero amount is required.
    error NetYieldDistributor_AmountZero();

    /// @dev Thrown if the decrease amount exceeds the current advanced net yield balance of an account.
    error NetYieldDistributor_DecreaseAmountExcess();

    /// @dev Thrown if the amount is too large to be stored in a uint64.
    error NetYieldDistributor_AmountOverflow();
}

/**
 * @title INetYieldDistributor interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev The complete interface of the net yield distributor contract.
 */
interface INetYieldDistributor is
    INetYieldDistributorPrimary,
    INetYieldDistributorConfiguration,
    INetYieldDistributorErrors
{
    /**
     * @dev Provides a way to verify this is the correct net yield distributor contract.
     *
     * Used for contract compliance checks, particularly during upgrades.
     * This helps prevent errors where an incorrect contract address might be specified.
     */
    function proveNetYieldDistributor() external pure;
}
