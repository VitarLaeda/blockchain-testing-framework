# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions CI running type-check, lint, tests, and TypeScript coverage, and publishing the Allure report to GitHub Pages.
- `MiniToken.sol`: a compact ERC-20-style token (`mint`, `transfer`, `approve`, `transferFrom`) with full NatSpec and dedicated tests, including allowance flows over JSON-RPC.
- Node-independent `RpcClient` unit tests (URL validation, error envelopes, transport and timeout handling) reaching 100% line/branch coverage of `src/`.
- Tooling: oxlint, Prettier, solhint, `.editorconfig`, c8 coverage, and Husky + lint-staged pre-commit hooks.
- MIT `LICENSE`, `.nvmrc`, `CHANGELOG.md`, and GitHub issue/PR templates.

### Changed

- Split the former combined `Counter` contract into a focused `Counter` (counter only) and a standard `MiniToken` (token), each with NatSpec.
- `RpcClient` request timeout now also covers response-body consumption, not just the initial fetch.
- Renamed the package to `blockchain-testing-framework` and refreshed the README (badges, architecture diagram, skills, quality gates).
- Split the JSON-RPC suite into `test:rpc:unit` (no node) and `test:rpc:integration` (Hardhat node runner).

## [1.0.0] - 2026-07-13

### Added

- Initial Hardhat 3 + TypeScript testing framework with Solidity contract tests, JSON-RPC integration tests, MCP server tests, and parameterized Allure reporting.
