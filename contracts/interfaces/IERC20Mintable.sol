// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IERC20Mintable interface
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The interface of a token that supports mint and burn operations.
 */
interface IERC20Mintable {
    /**
     * @dev Mints tokens.
     *
     * Emits a {Mint} event.
     *
     * @param account The address of a tokens recipient.
     * @param amount The amount of tokens to mint.
     * @return True if the operation was successful.
     */
    function mint(address account, uint256 amount) external returns (bool);

    /**
     * @dev Burns tokens.
     *
     * Emits a {Burn} event.
     *
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) external;
}
