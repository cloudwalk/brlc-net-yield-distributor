// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { INetYieldDistributorTypes } from "./interfaces/INetYieldDistributorTypes.sol";

/**
 * @title NetYieldDistributorStorageLayout contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Defines the storage layout for the net yield distributor contract.
 *
 * This contract uses ERC-7201 namespaced storage pattern to maintain upgradability.
 */
abstract contract NetYieldDistributorStorageLayout is INetYieldDistributorTypes {
    // ------------------ Constants ------------------------------- //

    /// @dev The role of a minter that is allowed to mint and burn asset yield tokens.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @dev The role of a manager that is allowed to perform operations with advanced net yield of accounts.
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    // ------------------ Storage layout -------------------------- //

    /*
     * ERC-7201: Namespaced Storage Layout
     * keccak256(abi.encode(uint256(keccak256("cloudwalk.storage.NetYieldDistributor")) - 1)) & ~bytes32(uint256(0xff))
     */
    bytes32 private constant NET_YIELD_DISTRIBUTOR_STORAGE_LOCATION =
        0x5cf268c37df8ee908cfc4ce728840165d3db872a975b57936977abc1fe583800;

    /**
     * @dev Defines the contract storage structure.
     *
     * The fields:
     *
     * - underlyingToken ------------ The address of the underlying token contract.
     * - operationalTreasury -------- The address of the operational treasury wallet.
     * - totalAssetYieldSupply ------ The current total supply of asset yield tokens in circulation.
     * - totalAdvancedNetYield ------ The current sum of all advanced net yield balances across all accounts.
     * - cumulativeReducedNetYield -- The cumulative sum of all reductions of advanced net yield across all accounts.
     * - yieldStates ---------------- The mapping of yield states for each account.
     *
     * @custom:storage-location erc7201:cloudwalk.storage.NetYieldDistributor
     */
    struct NetYieldDistributorStorage {
        // Slot 1
        address underlyingToken;
        // uint96 __reserved1; // Reserved until the end of the storage slot

        // Slot 2
        address operationalTreasury;
        // uint96 __reserved2; // Reserved until the end of the storage slot

        // Slot 3
        mapping(address account => YieldState) yieldStates;
        // No reserve until the end of the storage slot

        // Slot 4
        uint64 totalAssetYieldSupply;
        uint64 totalAdvancedNetYield;
        uint64 cumulativeReducedNetYield;
        // uint64 __reserved3; // Reserved until the end of the storage slot
    }

    // ------------------ Internal functions ---------------------- //

    /// @dev Returns the storage slot location for the `NetYieldDistributorStorage` struct.
    function _getNetYieldDistributorStorage() internal pure returns (NetYieldDistributorStorage storage data) {
        assembly {
            data.slot := NET_YIELD_DISTRIBUTOR_STORAGE_LOCATION
        }
    }
}
