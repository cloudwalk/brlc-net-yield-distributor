// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title INetYieldDistributorTypes interface
 * @author CloudWalk Inc. (See https://cloudwalk.io)
 * @dev Defines the types used in the net yield distributor contract.
 */
interface INetYieldDistributorTypes {
    /**
     * @dev Defines the advanced net yield structure.
     *
     * The fields:
     *
     * - current -- The current amount of advanced net yield for an account.
     *              Represents the outstanding balance that has not been reduced.
     * - total ---- The total amount of advanced net yield for an account.
     *              Tracks the historical total of all net yield ever advanced to the account.
     */
    struct AdvancedNetYield {
        // Slot 1

        uint64 current;
        uint64 total;
        // uint128 __reserved; // Reserved for future use until the end of the storage slot
    }
}
