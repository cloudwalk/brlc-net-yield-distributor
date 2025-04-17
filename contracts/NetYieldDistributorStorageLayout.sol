// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { INetYieldDistributorTypes } from "./interfaces/INetYieldDistributorTypes.sol";

/**
 * @title NetYieldDistributorStorageLayout contract
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the storage layout for the net yield distributor contract.
 * Uses ERC-7201 namespaced storage pattern to maintain upgradability.
 */
abstract contract NetYieldDistributorStorageLayout is INetYieldDistributorTypes {
    // ------------------ Constants ------------------------------- //

    /// @dev The role of this contract owner.
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    /// @dev The role of minter that is allowed to mint and burn asset yield tokens.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @dev The role of manager that is allowed to perform operations with advanced net yield balances.
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
     * - underlyingToken ------ The address of the underlying token contract.
     * - operationalTreasury -- The address of the operational treasury wallet.
     * - totalNetYieldSupply -- The total supply of asset yield tokens in circulation.
     * - totalAdvancedYield ---- The sum of all advanced net yield balances for all accounts.
     * - totalReducedYield ---- The sum of all reduced net yield balances for all accounts.
     * - advancedNetYields ---- The mapping of advanced net yield for a given account.
     *
     * @custom:storage-location erc7201:cloudwalk.storage.NetYieldDistributor
     */
    struct NetYieldDistributorStorage {
        // Slot 1
        address underlyingToken;
        // uint96 __reserved1; // Reserved for future use until the end of the storage slot

        // Slot 2
        address operationalTreasury;
        // uint96 __reserved2; // Reserved for future use until the end of the storage slot

        // Slot 3
        mapping(address account => AdvancedNetYield) advancedNetYields;

        // Slot 4
        uint64 totalNetYieldSupply;

        // Slot 4 (continued)
        uint64 totalAdvancedYield;

        // Slot 4 (continued)
        uint64 totalReducedYield;
    }

    // ------------------ Internal functions ---------------------- //

    /// @dev Returns the storage slot location for the `NetYieldDistributorStorage` struct.
    function _getNetYieldDistributorStorage() internal pure returns (NetYieldDistributorStorage storage data) {
        bytes32 position = NET_YIELD_DISTRIBUTOR_STORAGE_LOCATION;
        assembly {
            data.slot := position
        }
    }
}
