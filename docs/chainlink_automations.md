# Chainlink Automation: Agent Guide for Solidity Contracts

A complete reference for integrating Chainlink Automation into any Solidity smart contract. Covers Time-based and Custom Logic upkeeps, supported networks, contract patterns, Foundry integration, and the Log Trigger pattern.

---

## 1. What Chainlink Automation Does

Chainlink Automation is a decentralised keeper network. Automation nodes monitor your contract and call a specified function when a condition is met — no centralised cron job, no manual triggering.

**Three trigger types:**

| Type | How it works | Best for |
|---|---|---|
| **Time-based** | Cron schedule — calls a function at a fixed interval | Periodic settlement, rebasing, rewards distribution |
| **Custom Logic** | Your contract's `checkUpkeep()` returns `true` to trigger `performUpkeep()` | Condition-based triggers (price threshold, balance, state change) |
| **Log Trigger** | Triggers on an on-chain event log emitted by any contract | React to other contracts' events without polling |

---

## 2. Supported Networks & Contract Addresses

> ⚠️ Always verify addresses at `https://docs.chain.link/chainlink-automation/overview/supported-networks`.

### Mainnet Networks

| Network | Chain ID | Registry | Registrar |
|---|---|---|---|
| Ethereum Mainnet | 1 | `0x6593c7De001fC8542bB1703532EE1E5aA0D458fD` | `0x6B0d2C4F6EA8e5c19b97a4F9e7F6bEcF5CC27Af6` |
| Arbitrum One | 42161 | `0x37D9dC70bfcd8BC77Ec2858836B923c560E891D1` | `0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad` |
| Avalanche C-Chain | 43114 | `0x02777053d6764996e594c3E88AF1D58D5363a2e6` | `0x9a811502d843E5a03913d5A2cfb646c11463467A` |
| Base Mainnet | 8453 | `0xE226D5aCae908252CcA3F6CEFa577527650a9e1e` | `0xd8E75A5EB6FE6E8b8E5A9a7cBe28d17b741e3B89` |
| Optimism Mainnet | 10 | `0x75c0530885F385721fddA23C539AF3701d6183D4` | `0x696fB0d7D069cc0bb35a7AA8B3C9fEa7916EB919` |
| Polygon Mainnet | 137 | `0x08a8eea76D2395807Ce7D1FC942382515469cCA1` | `0x7b3EC232b08BD7b4b3305BE0C044D907B2DF960B` |
| BNB Chain Mainnet | 56 | `0x6593c7De001fC8542bB1703532EE1E5aA0D458fD` | `0xDb8e8e2ccb5C033938736aa89Fe4fa1eDfD15a1d` |

### Testnet Networks

| Network | Chain ID | Registry | LINK Token |
|---|---|---|---|
| Ethereum Sepolia | 11155111 | `0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad` | `0x779877A7B0D9E8603169DdbD7836e478b4624789` |
| Arbitrum Sepolia | 421614 | `0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad` | `0xd14838A68E8AFBAdE5efb411d5871ea0011AFd28` |
| Avalanche Fuji | 43113 | `0x819B58A646CDd8289275A87653a2aA4902b14fe6` | `0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846` |
| Base Sepolia | 84532 | `0xE226D5aCae908252CcA3F6CEFa577527650a9e1e` | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` |
| OP Sepolia | 11155420 | `0x75c0530885F385721fddA23C539AF3701d6183D4` | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` |
| Polygon Amoy | 80002 | `0x08a8eea76D2395807Ce7D1FC942382515469cCA1` | `0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904` |

**Automation UI:** `https://automation.chain.link`

---

## 3. Installation

```bash
# Foundry
forge install smartcontractkit/chainlink --no-commit

# npm (optional, for registration scripts)
npm install @chainlink/contracts
```

### foundry.toml remapping

```toml
remappings = [
  "@chainlink/contracts/=lib/chainlink/contracts/",
]
```

---

## 4. Custom Logic Upkeep — Contract Pattern

The most flexible trigger type. Your contract implements `AutomationCompatibleInterface` with two functions: `checkUpkeep` (view, called by keeper nodes off-chain) and `performUpkeep` (called on-chain when `checkUpkeep` returns `true`).

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AutomationCompatibleInterface} from
    "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract MyAutomatedContract is AutomationCompatibleInterface {

    // ── State ──────────────────────────────────────────────────────────────
    uint256 public lastTimestamp;
    uint256 public interval;           // seconds between triggers
    uint256 public counter;

    event UpkeepPerformed(uint256 indexed counter, uint256 timestamp);

    constructor(uint256 updateInterval) {
        interval      = updateInterval;
        lastTimestamp = block.timestamp;
    }

    // ── checkUpkeep: called off-chain by keeper nodes ──────────────────────
    // Return (true, performData) to trigger performUpkeep.
    // performData is arbitrary bytes you pass to performUpkeep.
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        upkeepNeeded = (block.timestamp - lastTimestamp) >= interval;
        performData  = abi.encode(block.timestamp); // pass context if needed
    }

    // ── performUpkeep: called on-chain by the keeper network ───────────────
    // Only executes when checkUpkeep returns true.
    // MUST be gas-efficient — keeper nodes simulate it first.
    function performUpkeep(bytes calldata performData) external override {
        // Re-validate the condition on-chain to prevent stale execution
        require((block.timestamp - lastTimestamp) >= interval, "Interval not elapsed");

        lastTimestamp = block.timestamp;
        counter++;
        // ↑ Put your application logic here
        emit UpkeepPerformed(counter, block.timestamp);
    }
}
```

### Key design rules

- `checkUpkeep` **must be a view function** — it cannot modify state. Keeper nodes call it for free.
- `performUpkeep` **must re-validate** the condition that triggered it — the blockchain state may have changed between check and execution.
- Keep `performUpkeep` **gas-efficient**. The keeper estimates gas before executing. If it reverts or costs too much, it won't be called.
- `checkData` is optional static bytes registered with the upkeep. Use it to parameterise your check without redeploying (e.g. pass a price threshold).
- `performData` is computed in `checkUpkeep` and passed directly to `performUpkeep`. Use it to carry computed context (e.g. which positions to liquidate).

---

## 5. Time-Based Upkeep

For simple time-based triggers, you don't need to implement any interface. Register any function on any contract with a cron schedule. The automation network calls it on schedule.

**Cron syntax** used by Chainlink Automation follows standard UNIX cron format:
```
* * * * *
│ │ │ │ └─ day of week (0-6, Sunday=0)
│ │ │ └─── month (1-12)
│ │ └───── day of month (1-31)
│ └─────── hour (0-23)
└───────── minute (0-59)
```

**Examples:**
```
0 * * * *      → every hour
0 0 * * *      → every day at midnight UTC
*/15 * * * *   → every 15 minutes
0 12 * * 1     → every Monday at 12:00 UTC
```

The target function signature can be anything, but it **must not require arguments** for time-based upkeep (arguments must be ABI-encoded and fixed at registration time).

```solidity
// Example — no interface needed for time-based
contract MySettlementContract {
    function settleAll() external {
        // called by Automation on schedule
        // add an authorized caller check for safety:
        require(msg.sender == automationRegistry, "Not keeper");
        // ... settlement logic
    }
}
```

---

## 6. Log Trigger Upkeep

Trigger `performUpkeep` when a specific event log is emitted by any contract:

```solidity
import {ILogAutomation, Log} from
    "@chainlink/contracts/src/v0.8/automation/interfaces/ILogAutomation.sol";

contract MyLogTriggeredContract is ILogAutomation {

    event ActionRequired(address indexed user, uint256 amount);

    // checkLog: called when the registered event fires
    function checkLog(
        Log calldata log,
        bytes memory /* checkData */
    ) external pure override returns (bool upkeepNeeded, bytes memory performData) {
        // Decode log data
        (address user, uint256 amount) = abi.decode(log.data, (address, uint256));
        upkeepNeeded = amount > 1 ether; // only act on large amounts
        performData  = abi.encode(user, amount);
    }

    function performUpkeep(bytes calldata performData) external override {
        (address user, uint256 amount) = abi.decode(performData, (address, uint256));
        // process the event
    }
}
```

---

## 7. Authorised Forwarder Pattern (Security Best Practice)

When your `performUpkeep` modifies sensitive state, restrict calls to the official keeper forwarder. Each registered upkeep gets a unique forwarder address after registration.

```solidity
contract SecureUpkeep is AutomationCompatibleInterface {
    address public s_forwarder;      // set after upkeep registration
    address public immutable owner;

    modifier onlyForwarder() {
        require(msg.sender == s_forwarder, "Only forwarder");
        _;
    }

    constructor() { owner = msg.sender; }

    function setForwarder(address forwarder) external {
        require(msg.sender == owner, "Not owner");
        s_forwarder = forwarder;
    }

    function checkUpkeep(bytes calldata) external view override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = /* your condition */;
    }

    function performUpkeep(bytes calldata performData) external override onlyForwarder {
        // secure — only callable by the registered keeper forwarder
    }
}
```

**How to get the forwarder address:** After registering the upkeep, call `getForwarder(upkeepId)` on the Automation Registry contract, or find it in the Automation UI.

---

## 8. Registering an Upkeep

### Option A — UI (simplest)

1. Go to `https://automation.chain.link`
2. Connect wallet, select network
3. Click "Register new Upkeep"
4. Choose trigger type (Time-based or Custom Logic)
5. Enter contract address, function selector, gas limit, starting LINK balance
6. Submit — costs ~0.1 LINK registration fee

### Option B — Programmatic Registration (Foundry script)

```solidity
// script/RegisterUpkeep.s.sol
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationRegistrarInterface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";

contract RegisterUpkeep is Script {
    // Avalanche Fuji addresses
    address constant REGISTRAR   = 0x819B58A646CDd8289275A87653a2aA4902b14fe6;
    address constant LINK_TOKEN  = 0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        LinkTokenInterface link = LinkTokenInterface(LINK_TOKEN);
        AutomationRegistrar2_1 registrar = AutomationRegistrar2_1(REGISTRAR);

        AutomationRegistrar2_1.RegistrationParams memory params =
            AutomationRegistrar2_1.RegistrationParams({
                name:                "My Upkeep",
                encryptedEmail:      "",
                upkeepContract:      address(YOUR_CONTRACT),
                gasLimit:            500_000,
                adminAddress:        msg.sender,
                triggerType:         0,              // 0=Custom Logic, 1=Log
                checkData:           "",
                triggerConfig:       "",
                offchainConfig:      "",
                amount:              2 ether         // 2 LINK initial funding
            });

        // Approve LINK transfer first
        link.approve(REGISTRAR, 2 ether);

        uint256 upkeepId = registrar.registerUpkeep(params);
        console.log("Upkeep ID:", upkeepId);

        vm.stopBroadcast();
    }
}
```

---

## 9. Funding Upkeeps

Upkeeps are funded with LINK. When the balance runs low, execution pauses.

```solidity
// Fund via the Registry contract directly
IKeeperRegistry registry = IKeeperRegistry(REGISTRY_ADDRESS);
LinkTokenInterface link   = LinkTokenInterface(LINK_ADDRESS);

// Approve + fund
link.approve(REGISTRY_ADDRESS, amount);
registry.addFunds(upkeepId, uint96(amount));
```

Or fund via the UI at `https://automation.chain.link`.

**Cost estimation:** Each `performUpkeep` execution costs gas (paid in native token, converted to LINK) + a small premium. For Avalanche at $0.03/tx average, a daily upkeep costs roughly $1–$3/month in LINK equivalent.

---

## 10. Combining Functions + Automation

A common pattern: Automation triggers a Functions request on a schedule or condition.

```solidity
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract AutomatedFunctionsConsumer is FunctionsClient, AutomationCompatibleInterface {
    using FunctionsRequest for FunctionsRequest.Request;

    uint256 public lastUpkeepTimestamp;
    uint256 public interval;
    string  public jsSource;
    uint64  public subscriptionId;
    uint32  public gasLimit;
    bytes32 public donId;

    constructor(
        address functionsRouter,
        uint64  _subscriptionId,
        uint32  _gasLimit,
        bytes32 _donId,
        uint256 _interval,
        string memory _jsSource
    ) FunctionsClient(functionsRouter) {
        subscriptionId    = _subscriptionId;
        gasLimit          = _gasLimit;
        donId             = _donId;
        interval          = _interval;
        jsSource          = _jsSource;
        lastUpkeepTimestamp = block.timestamp;
    }

    // ── Automation check ───────────────────────────────────────────────────
    function checkUpkeep(bytes calldata) external view override
        returns (bool upkeepNeeded, bytes memory)
    {
        upkeepNeeded = (block.timestamp - lastUpkeepTimestamp) >= interval;
    }

    // ── Automation trigger → Functions request ─────────────────────────────
    function performUpkeep(bytes calldata) external override {
        require((block.timestamp - lastUpkeepTimestamp) >= interval, "Too soon");
        lastUpkeepTimestamp = block.timestamp;

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineConfig(FunctionsRequest.Location.Inline);
        req.setSource(jsSource);

        _sendRequest(req.encodeCBOR(), subscriptionId, gasLimit, donId);
    }

    // ── Functions callback ─────────────────────────────────────────────────
    function fulfillRequest(bytes32, bytes memory response, bytes memory err) internal override {
        if (err.length > 0) { /* handle error */ return; }
        // process response
    }
}
```

---

## 11. Foundry Testing

Since keeper nodes don't run in local tests, simulate them by calling `checkUpkeep` and `performUpkeep` directly:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/MyAutomatedContract.sol";

contract AutomationTest is Test {
    MyAutomatedContract upkeep;

    function setUp() public {
        upkeep = new MyAutomatedContract(60); // 60 second interval
    }

    function test_CheckUpkeep_ReturnsFalseBeforeInterval() public {
        (bool needed,) = upkeep.checkUpkeep("");
        assertFalse(needed);
    }

    function test_CheckUpkeep_ReturnsTrueAfterInterval() public {
        vm.warp(block.timestamp + 61);
        (bool needed,) = upkeep.checkUpkeep("");
        assertTrue(needed);
    }

    function test_PerformUpkeep_UpdatesState() public {
        vm.warp(block.timestamp + 61);
        (bool needed, bytes memory performData) = upkeep.checkUpkeep("");
        assertTrue(needed);

        upkeep.performUpkeep(performData);
        assertEq(upkeep.counter(), 1);
    }

    function test_PerformUpkeep_RevertsIfTooSoon() public {
        vm.expectRevert("Interval not elapsed");
        upkeep.performUpkeep("");
    }
}
```

---

## 12. Gas Optimisation Tips

- Keep `checkUpkeep` as cheap as possible — keeper nodes call it frequently for free, but gas still costs them infra overhead.
- Batch operations in `performUpkeep` — process multiple items per call to amortise the fixed keeper overhead.
- Use `performData` to pass the pre-computed list of items to act on, so `performUpkeep` doesn't need to re-scan state.
- Set gas limit conservatively high at registration (e.g. 500,000), then tune it down after measuring actual usage.
- If `performUpkeep` might sometimes have nothing to do (race condition between check and exec), make it a no-op in that case rather than reverting — a revert wastes gas and counts against your upkeep.

---

## 13. Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| Upkeep not executing | Not enough LINK | Fund upkeep at `automation.chain.link` |
| Upkeep not executing | Gas limit too low | Increase gas limit in upkeep settings |
| `performUpkeep` keeps reverting | Condition re-check fails | Add re-validation with a guard, not a revert |
| `checkUpkeep` never returns true | Logic bug | Use Automation Simulator in the UI to debug |
| Forwarder check fails | Wrong forwarder address | Re-read `getForwarder(upkeepId)` from registry post-registration |
| Upkeep paused unexpectedly | Balance hit minimum | Auto-fund via `addFunds()` or top up manually |
| Time-based not firing on schedule | Function requires args | Time-based upkeeps can't pass args; use Custom Logic instead |

---

## 14. Quick Reference

**UI tools:**
- Automation Dashboard: `https://automation.chain.link`
- Automation Simulator: available in the UI per upkeep
- Chainlink Faucets: `https://faucets.chain.link`

**Always verify contract addresses at:**
- `https://docs.chain.link/chainlink-automation/overview/supported-networks`

**Key interface imports:**

```solidity
// Custom Logic / Time-based
import {AutomationCompatibleInterface} from
    "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

// Log Trigger
import {ILogAutomation, Log} from
    "@chainlink/contracts/src/v0.8/automation/interfaces/ILogAutomation.sol";

// Registry interaction
import {IKeeperRegistry} from
    "@chainlink/contracts/src/v0.8/automation/interfaces/IKeeperRegistry.sol";
```