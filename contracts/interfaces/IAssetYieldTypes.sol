// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IAssetYieldTypes interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the types used in the asset liability contract.
 */
interface IAssetYieldTypes {
    /**
     * @dev Defines the liability structure.
     *
     * The fields:
     *
     * - amount -- The amount of liability for an account.
     */
    struct Liability {
        // Slot 1

        uint64 amount;
        // uint192 __reserved; // Reserved for future use until the end of the storage slot
    }
}
