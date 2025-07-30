// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title INetYieldDistributorTypes interface
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Defines the types used in the net yield distributor contract.
 */
interface INetYieldDistributorTypes {
    /**
     * @dev Defines the yield state structure.
     *
     * The fields:
     *
     * - advanced ----------- The current amount of net yield that has been advanced to an account.
     * - cumulativeReduced -- The cumulative amount of net yield that has been advanced to an account and then reduced.
     */
    struct YieldState {
        // Slot 1

        uint64 advanced;
        uint64 cumulativeReduced;
        // uint128 __reserved; // Reserved until the end of the storage slot
    }
}
