// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract Counter {
    address private immutable owner;

    uint256 public value;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event CounterIncremented(uint256 newValue);
    event CounterReset(address indexed resetBy);
    event Transfer(address indexed from, address indexed to, uint256 amount);

    error Unauthorized(address caller);
    error InvalidAddress();
    error InsufficientBalance(address from, uint256 available, uint256 required);

    constructor(address owner_) {
        owner = owner_;
    }

    function increment() external {
        value += 1;
        emit CounterIncremented(value);
    }

    function reset() external {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender);
        }

        value = 0;
        emit CounterReset(msg.sender);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender);
        }
        if (to == address(0)) {
            revert InvalidAddress();
        }

        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address from, address to, uint256 amount) external {
        if (msg.sender != from) {
            revert Unauthorized(msg.sender);
        }
        if (to == address(0)) {
            revert InvalidAddress();
        }

        uint256 available = balanceOf[from];
        if (available < amount) {
            revert InsufficientBalance(from, available, amount);
        }

        balanceOf[from] = available - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
