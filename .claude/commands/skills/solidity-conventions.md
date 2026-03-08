# Skill: Solidity Conventions

## Layer 1 — Naming and style (always read this)

### Function naming

| Type | Convention | Example |
|---|---|---|
| Public / external user-facing | camelCase, no prefix | `deposit()`, `withdraw()`, `claim()` |
| Protocol-internal (called by other protocol contracts, not end users) | `_` prefix, camelCase | `_recordDeposit()`, `_settleDelayed()`, `_processQueue()` |
| Private / internal helpers | `_` prefix, camelCase | `_mint()`, `_transfer()` |

**Rule:** Any function that is "internal to the protocol" — meaning it is called by another Sentinel contract rather than by a traveler, underwriter, or admin — uses a `_` prefix, even if its Solidity visibility is `external` or `public`.

This is distinct from Solidity's `internal` keyword (which restricts to same contract + children). The `_` prefix is a naming signal that the function is not part of the public API surface.

### Examples from this project

```solidity
// Called by FlightPool — protocol-internal, so _prefix
function _recordDeposit(address sourcePool, uint256 amount) external onlyFlightPool { ... }

// Called by Controller — protocol-internal
function _increaseLocked(uint256 amount) external onlyController { ... }

// Called by travelers — public API, no prefix
function claim() external { ... }

// Called by underwriters — public API, no prefix
function deposit(uint256 amount) external { ... }
```

### State variables

- `public` state variables: camelCase, no prefix — `totalManagedAssets`, `lockedCapital`
- `private` / `internal` state: camelCase, no prefix (do NOT use `s_` prefix or similar)
- Constants: `SCREAMING_SNAKE_CASE` — `MAX_QUEUE_SIZE`, `BASIS_POINTS`
- Immutables: camelCase, no prefix — `usdc`, `controller`

### Errors

Use custom errors (not `require` with string):

```solidity
error Unauthorized();
error InsufficientBalance(uint256 available, uint256 required);
error ZeroAddress();
```

Revert with `revert ErrorName()` or `revert ErrorName(args)`.

### Events

PascalCase, past tense:

```solidity
event DepositRecorded(address indexed sourcePool, uint256 amount);
event Withdrawn(address indexed recipient, uint256 amount);
```

### Modifiers

camelCase, descriptive:

```solidity
modifier onlyController() { ... }
modifier onlyCREWorkflow() { ... }
modifier onlyOwner() { ... }  // from OZ Ownable
```

### NatSpec

Only add NatSpec (`///`) to public/external functions that form part of the user-facing or inter-contract API. Do not add comments to internal helpers unless the logic is non-obvious.

---

## Layer 2 — Patterns used in this project

- **OZ v5 imports** — always `@openzeppelin/contracts/...`
- **OZ Ownable** — `Ownable(msg.sender)` in constructor, no separate `transferOwnership`
- **No `burn`** unless explicitly needed (MockUSDC has none)
- **Custom errors over require strings** — saves gas, better tooling support
- **`via_ir = false`** — default; enable only if stack-too-deep in RiskVault or Controller
- **6-decimal amounts** — 1 USDC = 1_000_000; always use underscored literals (`1_000_000`)
