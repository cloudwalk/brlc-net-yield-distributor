// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { INetYieldDistributorTypes } from "./interfaces/INetYieldDistributorTypes.sol";

/**
 * @title NetYieldDistributorStorageLayout contract
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the storage layout for the asset yield contract.
 */
abstract contract NetYieldDistributorStorageLayout is INetYieldDistributorTypes {
    // ------------------ Constants ------------------------------- //

    /// @dev The role of this contract owner.
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    /// @dev The role of minter that is allowed to mint and burn yield asset.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @dev The role of manager that is allowed to perform operations with the liability.
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    // ------------------ Storage layout -------------------------- //

    /*
     * ERC-7201: Namespaced Storage Layout
     * keccak256(abi.encode(uint256(keccak256("cloudwalk.storage.NetYieldDistributor")) - 1)) & ~bytes32(uint256(0xff))
     */
    bytes32 private constant ASSET_YIELD_STORAGE_LOCATION =
        0x04649658641e694a55129f42214ab5272db9dc0c1f7e0cb89509224043caec00;

    /**
     * @dev Defines the contract storage structure.
     *
     * The fields:
     *
     * - underlyingToken ------ The address of the underlying token contract.
     * - totalYieldSupply ----- The total supply of yield asset.
     * - totalLiability ------- The sum of all liabilities.
     * - liabilities ---------- The mapping of a liability for a given account.
     *
     * @custom:storage-location erc7201:cloudwalk.storage.NetYieldDistributor
     */
    struct NetYieldDistributorStorage {
        // Slot 1
        address underlyingToken;
        // uint96 __reserved1; // Reserved for future use until the end of the storage slot

        // Slot 2
        uint256 totalYieldSupply;

        // Slot 3
        uint256 totalLiability;

        // Slot 4
        mapping(address account => Liability liability) liabilities;
    }

    // ------------------ Internal functions ---------------------- //

    /// @dev Returns the storage slot location for the `NetYieldDistributorStorage` struct.
    function _getNetYieldDistributorStorage() internal pure returns (NetYieldDistributorStorage storage data) {
        bytes32 position = ASSET_YIELD_STORAGE_LOCATION;
        assembly {
            data.slot := position
        }
    }
}
