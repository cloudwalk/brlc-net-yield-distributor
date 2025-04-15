// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IAssetLiabilityTypes } from "./interfaces/IAssetLiabilityTypes.sol";

/**
 * @title AssetLiabilityStorageLayout contract
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the storage layout for the asset liability contract.
 */
abstract contract AssetLiabilityStorageLayout is IAssetLiabilityTypes {
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
     * keccak256(abi.encode(uint256(keccak256("cloudwalk.storage.AssetLiability")) - 1)) & ~bytes32(uint256(0xff))
     */
    bytes32 private constant ASSET_LIABILITY_STORAGE_LOCATION =
        0x001934aaca09350fe8ff6b8c7d5f6fad3d991d48c50551d7ada75910817eec00;

    /**
     * @dev Defines the contract storage structure.
     *
     * The fields:
     *
     * - underlyingToken ------ The address of the underlying token contract.
     * - operationalTreasury -- The address of the operational treasury.
     * - totalYieldSupply ----- The total supply of yield asset.
     * - totalLiability ------- The sum of all liabilities.
     * - liabilities ---------- The mapping of a liability for a given account.
     *
     * @custom:storage-location erc7201:cloudwalk.storage.AssetLiability
     */
    struct AssetLiabilityStorage {
        // Slot 1
        address underlyingToken;
        // uint96 __reserved1; // Reserved for future use until the end of the storage slot

        // Slot 2
        address operationalTreasury;
        // uint96 __reserved2; // Reserved for future use until the end of the storage slot

        // Slot 3
        uint256 totalYieldSupply;

        // Slot 4
        uint256 totalLiability;

        // Slot 5
        mapping(address account => Liability liability) liabilities;
    }

    // ------------------ Internal functions ---------------------- //

    /// @dev Returns the storage slot location for the `AssetLiabilityStorage` struct.
    function _getAssetLiabilityStorage() internal pure returns (AssetLiabilityStorage storage data) {
        bytes32 position = ASSET_LIABILITY_STORAGE_LOCATION;
        assembly {
            data.slot := position
        }
    }
}
