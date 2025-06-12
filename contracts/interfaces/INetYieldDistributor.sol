// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

/**
 * @title INetYieldDistributorPrimary interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the primary interface of the net yield distributor contract.
 */
interface INetYieldDistributorPrimary {
    // ------------------ Events ---------------------------------- //

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
    event AdvancedNetYieldReduced(address indexed account, uint256 amount);

    // ------------------ Transactional functions ----------------- //

    /**
     * @dev Mints a specified amount of asset yield tokens to the contract.
     * This increases the total supply of asset yield tokens available for distribution.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits an {AssetYieldMinted} event.
     *
     * @param amount The amount of asset yield tokens to mint.
     */
    function mintAssetYield(uint64 amount) external;

    /**
     * @dev Burns a specified amount of asset yield tokens from the contract.
     * This decreases the total supply of asset yield tokens available for distribution.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits an {AssetYieldBurned} event.
     *
     * @param amount The amount of asset yield tokens to burn.
     */
    function burnAssetYield(uint64 amount) external;

    /**
     * @dev Advances net yield to specified accounts by transferring asset yield tokens.
     * This operation both transfers tokens to accounts and records the advanced net yield amounts.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits a {NetYieldAdvanced} event for each account that receives net yield.
     *
     * @param accounts The accounts to advance net yield to.
     * @param amounts The amounts of net yield to advance to each account.
     */
    function advanceNetYield(address[] calldata accounts, uint64[] calldata amounts) external;

    /**
     * @dev Reduces the advanced net yield balance of specified accounts.
     * This operation decreases each account's current advanced net yield balance.
     * Tokens are transferred from the operational treasury to the contract and burned.
     *
     * This function can only be called by an account with the appropriate role.
     *
     * Emits a {AdvancedNetYieldReduced} event for each account whose advanced net yield is reduced.
     *
     * @param accounts The accounts to reduce the advanced net yield for.
     * @param amounts The amounts to reduce for each account.
     */
    function reduceAdvancedNetYield(address[] calldata accounts, uint64[] calldata amounts) external;

    // ------------------ View functions -------------------------- //

    /**
     * @dev Returns the current amount of advanced net yield for an account.
     * This represents the outstanding advanced net yield that has not been reduced.
     *
     * @param account The account to query.
     * @return The current amount of advanced net yield for the account.
     */
    function advancedNetYieldOf(address account) external view returns (uint256);

    /**
     * @dev Returns the cumulative amount of net yield that has been advanced to the account and then reduced.
     *
     * @param account The account to query.
     * @return The cumulative amount of reduced net yield for the account.
     */
    function cumulativeReducedNetYieldOf(address account) external view returns (uint256);

    /**
     * @dev Returns the total supply of asset yield tokens in circulation that is not necessarily distributed.
     *
     * @return The total supply of asset yield tokens.
     */
    function totalAssetYieldSupply() external view returns (uint256);

    /**
     * @dev Returns the total amount of advanced net yield across all accounts.
     *
     * @return The total amount of advanced net yield.
     */
    function totalAdvancedNetYield() external view returns (uint256);

    /**
     * @dev Returns the cumulative amount of all reductions of advanced net yield across all accounts for all time.
     *
     * @return The cumulative amount of advanced net yield reductions.
     */
    function cumulativeReducedNetYield() external view returns (uint256);
}

/**
 * @title INetYieldDistributorConfiguration interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the configuration interface of the net yield distributor contract.
 */
interface INetYieldDistributorConfiguration {
    // ------------------ Events ---------------------------------- //

    /**
     * @dev Emitted when the address of the operational treasury has been updated.
     *
     * @param newTreasury The new address of the operational treasury.
     * @param oldTreasury The previous address of the operational treasury.
     */
    event OperationalTreasuryUpdated(address indexed newTreasury, address indexed oldTreasury);

    // ------------------ Transactional functions ----------------- //

    /**
     * @dev Sets the address of the operational treasury.
     * The treasury holds tokens that will be transferred and burned during yield reduction.
     *
     * This function can be called only by an account with a special role.
     *
     * Emits an {OperationalTreasuryUpdated} event.
     *
     * @param operationalTreasury_ The address of the operational treasury.
     */
    function setOperationalTreasury(address operationalTreasury_) external;

    // ------------------ View functions -------------------------- //

    /**
     * @dev Returns the address of the operational treasury.
     * The operational treasury is responsible for providing tokens during yield reduction.
     *
     * @return The address of the operational treasury.
     */
    function operationalTreasury() external view returns (address);

    /**
     * @dev Returns the address of the underlying token contract.
     * This is the ERC20 token used for all yield operations.
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
    /// @dev Thrown if a zero address is provided for an account parameter where a valid address is required.
    error NetYieldDistributor_AccountAddressZero();

    /// @dev Thrown if the accounts and amounts arrays have different lengths when batch processing.
    error NetYieldDistributor_AccountsAndAmountsLengthMismatch();

    /// @dev Thrown if the accounts array is empty.
    error NetYieldDistributor_AccountsArrayEmpty();

    /// @dev Thrown if the amount to reduce exceeds the account's current advanced net yield balance.
    error NetYieldDistributor_AdvancedNetYieldInsufficientBalance();

    /// @dev Thrown if a zero amount is provided for an operation that requires a positive amount.
    error NetYieldDistributor_AmountZero();

    /// @dev Thrown if the total advanced net yield after a distribution would exceed the total asset yield supply.
    error NetYieldDistributor_TotalAdvancedNetYieldExcess();

    /// @dev Thrown if the new implementation address doesn't implement the {INetYieldDistributor} interface during upgrade.
    error NetYieldDistributor_ImplementationAddressInvalid();

    /// @dev Thrown if attempting to set an operational treasury address that is already set as the current one.
    error NetYieldDistributor_TreasuryAddressAlreadySet();

    /// @dev Thrown if trying to initialize the contract with a zero address for the underlying token.
    error NetYieldDistributor_UnderlyingTokenAddressZero();
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
     * This verification mechanism helps prevent upgrades to incompatible implementations
     * by ensuring that the new implementation correctly implements this interface.
     */
    function proveNetYieldDistributor() external pure;
}
