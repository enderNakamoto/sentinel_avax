# Sentinel Protocol — Presentation Script

**Total time: 5 minutes**
- Slides: ~3 minutes
- Demo: ~2 minutes

---

## Slide 1 — The Problem (~25s)

Sarah's flight lands two hours late.

She missed her connection. Rebooked. Lost a night at the hotel.

She had insurance. She paid for it.

She filed a claim. Waited six weeks. Got denied — wrong form.

Nobody called back.

That's 700 billion dollars of "trust us."

We built something different.

---

## Slide 2 — How It Works (~60s)

Meet Sentinel Protocol.

Parametric insurance. On-chain. Automatic.

Two types of people use this.

**Underwriters** — they provide the capital.
They deposit USDC into the RiskVault.
That's the shared pool that backs every payout in the system.

**Travelers** — they buy the protection.
Sarah goes to the app. Picks her flight. Pays a fixed USDC premium.
That premium goes into a FlightPool — one pool, per flight, per date.

Now — every 10 minutes — a Chainlink workflow fires.

It reads active flights straight from the blockchain.

It calls AeroAPI for live flight status.

If Sarah's flight is delayed — it writes that on-chain. Right now.

Then it calls the Controller. The Controller settles the pool.

The RiskVault releases Sarah's payout.

She claims it. Done.

No form. No adjuster. No six weeks.

The contract is the policy. The oracle is the judge.

---

## Slide 3 — For Underwriters (~20s)

Underwriters deposit USDC. Receive shares.

Every on-time flight sends premiums back to the vault.

Share price goes up. Passively.

If capital is locked when they want to withdraw — they join a queue.

It drains automatically after each settlement.

---

## Slide 4 — Solvency (~25s)

Before every purchase, one question:

Can the vault cover every worst-case payout right now?

If yes — purchase goes through.

If no — it reverts. Hard stop. No exceptions.

You can never buy a policy that isn't fully backed.

This runs on-chain, every single time, enforced by code.

Not a promise. A guarantee.

---

## Slide 5 — The CRE Workflow (~35s)

This is the engine behind every settlement — a single TypeScript workflow, compiled to WASM, fired by a cron trigger every 10 minutes on the Chainlink DON.

Each tick, it uses the EVM capability to read OracleAggregator and pull every active flight registered in the system.

For each unknown-status flight, it uses the HTTP capability to call AeroAPI — the API key never touches the code, it's fetched securely at runtime via the CRE secrets store.

If a flight is delayed or cancelled, it uses an EVM write to update OracleAggregator on-chain, then calls Controller.checkAndSettle() to settle every ready pool, and finally RiskVault.snapshot() to update the share price.

Three contracts. One cron tick. Zero human intervention.

Sarah gets paid. Nobody had to approve it.

---

## Demo (~2 minutes)

1. **Buy insurance** — connect wallet, pick a flight, pay premium
2. **Underwriter view** — deposit USDC, show share price and locked vs free capital
3. **Settlement** — mark flight delayed, call `checkAndSettle()`, show payout credited
4. **Claim** — traveler calls `claim()`, USDC received

> "Fully on-chain. Fully automatic. No humans required between a delayed flight and a paid-out traveler."
