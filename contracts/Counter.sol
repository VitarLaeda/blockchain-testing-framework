// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Counter
/// @author VitarLaeda
/// @notice A minimal counter that anyone may increment but only the owner may reset.
/// @dev Educational contract used to demonstrate contract-level and JSON-RPC test automation.
contract Counter {
    /// @notice Account allowed to reset the counter.
    address public immutable OWNER;

    /// @notice Current counter value.
    uint256 public value;

    /// @notice Emitted whenever the counter is incremented.
    /// @param newValue The counter value after the increment.
    event CounterIncremented(uint256 indexed newValue);

    /// @notice Emitted whenever the counter is reset to zero.
    /// @param resetBy The account that performed the reset.
    event CounterReset(address indexed resetBy);

    /// @notice Thrown when a restricted action is attempted by a non-owner.
    /// @param caller The unauthorized caller.
    error Unauthorized(address caller);

    /// @notice Deploys the counter and assigns the reset-authorized owner.
    /// @param owner_ Account granted permission to reset the counter.
    constructor(address owner_) {
        OWNER = owner_;
    }

    /// @notice Increments the counter by one.
    function increment() external {
        ++value;
        emit CounterIncremented(value);
    }

    /// @notice Resets the counter to zero.
    /// @dev Reverts with {Unauthorized} when called by any account other than {OWNER}.
    function reset() external {
        if (msg.sender != OWNER) {
            revert Unauthorized(msg.sender);
        }

        value = 0;
        emit CounterReset(msg.sender);
    }
}
