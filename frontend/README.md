# Frontend

Scaffolded in **Phase 13** (Next.js + Reown AppKit + wagmi).

## ABI Access

Contract ABIs and build artifacts are read from `../contracts/out/` via the wagmi CLI Foundry plugin.

During frontend development, run `forge build` in `../contracts/` first, then `wagmi generate` in this directory to produce typed TypeScript hooks from the compiled artifacts.

## Stack

- Next.js
- wagmi / viem
- Reown AppKit (wallet connection)
- `@wagmi/cli` with Foundry plugin (ABI bridge)
