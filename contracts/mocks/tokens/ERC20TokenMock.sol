// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Mintable } from "../../interfaces/IERC20Mintable.sol";

/**
 * @title ERC20TokenMock contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev An implementation of the {ERC20} contract for testing purposes.
 */
contract ERC20TokenMock is ERC20, IERC20Mintable {
    /**
     * @dev The constructor of the contract.
     * @param name_ The name of the token to set for this ERC20-comparable contract.
     * @param symbol_ The symbol of the token to set for this ERC20-comparable contract.
     */
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    // ------------------ Transactional functions ----------------- //

    /**
     * @dev Mints specified amount of tokens for an account.
     */
    function mint(address account, uint256 amount) external returns (bool) {
        _mint(account, amount);
        return true;
    }

    /**
     * @dev Burns a specified amount of tokens from the caller's balance.
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
