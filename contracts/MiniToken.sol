// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MiniToken
/// @author VitarLaeda
/// @notice A compact ERC-20-style token with owner-restricted minting and standard
///         allowance-based transfers.
/// @dev Intentionally minimal for test-automation demonstrations; not audited for
///      production use. Implements the subset of ERC-20 exercised by the test suite.
contract MiniToken {
    /// @notice Human-readable token name.
    string public name;

    /// @notice Token ticker symbol.
    string public symbol;

    /// @notice Number of decimals used to represent balances.
    uint8 public constant decimals = 18;

    /// @notice Account allowed to mint new tokens.
    address public immutable OWNER;

    /// @notice Total number of tokens in existence.
    uint256 public totalSupply;

    /// @notice Token balance held by each account.
    mapping(address account => uint256 balance) public balanceOf;

    /// @notice Remaining amount a spender may transfer on behalf of an owner.
    mapping(address owner => mapping(address spender => uint256 remaining))
        public allowance;

    /// @notice Emitted on mint, transfer, and transferFrom.
    /// @param from Source account; the zero address for mints.
    /// @param to Destination account.
    /// @param amount Number of tokens moved.
    event Transfer(address indexed from, address indexed to, uint256 amount);

    /// @notice Emitted whenever an allowance is set via {approve}.
    /// @param owner Account granting the allowance.
    /// @param spender Account permitted to spend.
    /// @param amount Approved amount.
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 amount
    );

    /// @notice Thrown when a restricted action is attempted by a non-owner.
    /// @param caller The unauthorized caller.
    error Unauthorized(address caller);

    /// @notice Thrown when the zero address is supplied where a real account is required.
    error InvalidAddress();

    /// @notice Thrown when an account holds fewer tokens than a transfer requires.
    /// @param account The account that lacks balance.
    /// @param available The available balance.
    /// @param required The required amount.
    error InsufficientBalance(
        address account,
        uint256 available,
        uint256 required
    );

    /// @notice Thrown when a spender attempts to exceed its approved allowance.
    /// @param spender The spender whose allowance is insufficient.
    /// @param available The remaining allowance.
    /// @param required The required amount.
    error InsufficientAllowance(
        address spender,
        uint256 available,
        uint256 required
    );

    /// @notice Deploys the token with its metadata and mint-authorized owner.
    /// @param name_ Token name.
    /// @param symbol_ Token ticker symbol.
    /// @param owner_ Account granted minting rights.
    constructor(string memory name_, string memory symbol_, address owner_) {
        name = name_;
        symbol = symbol_;
        OWNER = owner_;
    }

    /// @notice Mints new tokens to an account.
    /// @dev Reverts with {Unauthorized} unless called by {OWNER}.
    /// @param to Recipient of the minted tokens.
    /// @param amount Number of tokens to mint.
    function mint(address to, uint256 amount) external {
        if (msg.sender != OWNER) {
            revert Unauthorized(msg.sender);
        }
        if (to == address(0)) {
            revert InvalidAddress();
        }

        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @notice Transfers tokens from the caller to another account.
    /// @param to Recipient of the tokens.
    /// @param amount Number of tokens to transfer.
    /// @return success True when the transfer succeeds; otherwise the call reverts.
    function transfer(
        address to,
        uint256 amount
    ) external returns (bool success) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Approves a spender to transfer up to `amount` on the caller's behalf.
    /// @param spender Account permitted to spend.
    /// @param amount Allowance granted to the spender.
    /// @return success True when the approval succeeds.
    function approve(
        address spender,
        uint256 amount
    ) external returns (bool success) {
        if (spender == address(0)) {
            revert InvalidAddress();
        }

        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Transfers tokens on behalf of an owner, consuming the caller's allowance.
    /// @dev Reverts with {InsufficientAllowance} when the caller's allowance is too low.
    /// @param from Account to debit.
    /// @param to Account to credit.
    /// @param amount Number of tokens to transfer.
    /// @return success True when the transfer succeeds; otherwise the call reverts.
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool success) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) {
            revert InsufficientAllowance(msg.sender, currentAllowance, amount);
        }

        allowance[from][msg.sender] = currentAllowance - amount;
        _transfer(from, to, amount);
        return true;
    }

    /// @notice Moves tokens between accounts after validating the transfer.
    /// @dev Shared transfer logic guarded by zero-address and balance checks.
    /// @param from Account to debit.
    /// @param to Account to credit.
    /// @param amount Number of tokens to move.
    function _transfer(address from, address to, uint256 amount) private {
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
