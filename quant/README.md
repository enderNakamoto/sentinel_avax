# Sentinel Protocol — Quantitative Analysis

Interactive simulation for modeling underwriter yield and protocol earnings in parametric flight delay insurance.

## What This App Does

This is a standalone quantitative analysis tool for Sentinel Protocol. It lets you explore the financial dynamics of the insurance system through two lenses:

1. **Underwriter Yield Simulation** — Monte Carlo analysis of vault returns across 10,000 trials, modeling how delay probability uncertainty affects underwriter profitability.
2. **Protocol Earnings Explorer** — Models the protocol's revenue from two sources: a fee on every premium collected, and yield on the protocol's own capital staked in the RiskVault.

## How the Protocol Earns Money

The protocol has two revenue streams:

### 1. Premium Fees

The protocol takes a configurable cut (1–20%) of every premium paid by travelers:

```
Fee Income = feeRate × numPolicies × premium
```

Example: at 5% fee rate with 10,000 policies at $20 premium = **$10,000** in fee income.

### 2. Vault Yield

The protocol deposits its own capital into the RiskVault alongside third-party underwriters. It earns the same yield as all other vault depositors:

```
Vault Income = protocolCapital × vaultYield%
```

The vault yield depends on the delay probability across insured flights. When flights arrive on time, premiums flow into the vault as income. When flights are delayed, the vault pays out claims.

### Combined Earnings

```
Protocol Earnings = Fee Income + Vault Income
                  = (f × M × π) + (Cp × Yield)
```

Where:
- `f` = protocol fee rate (1–20%)
- `M` = number of policies sold
- `π` = premium per policy
- `Cp` = protocol's own capital in the vault
- `Yield` = vault yield from Monte Carlo simulation

## Underwriter Yield Model

### Expected Yield Formula

```
Yield = M × (π - λ × p) / C × 100%
```

Where:
- `M` = policies sold
- `π` = premium per policy (e.g., $20)
- `λ` = payout per claim (e.g., $100)
- `p` = delay probability
- `C` = total vault capital

### Break-Even Probability

```
p* = π / λ
```

With π = $20 and λ = $100, break-even is at **20% delay rate**. Below this, the vault is profitable.

### Monte Carlo Method

Since actual delay probability is uncertain and varies by route/season/weather:

1. Draw `p` from Uniform(pMin, pMax) for each trial
2. Compute yield for that trial
3. Repeat 10,000 times
4. Analyze: mean, median, percentiles, profit probability, distribution histogram

With default parameters (π=$20, λ=$100, M=10,000, C=$100,000, p∈[1%, 20%]):

| Statistic | Value |
|---|---|
| Average Yield | ~96% |
| 5th Percentile (worst case) | ~+10% |
| 95th Percentile (best case) | ~+180% |
| Profit Probability | 100% |

## Interactive Controls

### Underwriter Parameters
| Slider | Range | Default |
|---|---|---|
| Premium (π) | $1–$50 | $20 |
| Payout (λ) | $50–$500 | $100 |
| Policies Sold (M) | 100–50,000 | 10,000 |
| Capital (C) | $10k–$1M | $100,000 |
| Min Delay Rate | 1%–15% | 1% |
| Max Delay Rate | 10%–40% | 20% |

### Protocol Parameters
| Slider | Range | Default |
|---|---|---|
| Protocol Fee Rate | 1%–20% | 5% |
| Protocol Capital in Vault | $10k–$500k | $50,000 |

## Sensitivity Analysis

The app computes expected yield at fixed delay rates (1%, 3%, 5%, 10%, 15%, 20%, 25%, 30%) and classifies each as Profitable, Break-even, or Loss.

## Limitations of the Current Model

The current simulation uses simplifying assumptions. It is useful for building intuition but should not be used for production pricing decisions without the improvements listed below.

- **Uniform distribution** — delay probability is drawn from Uniform(pMin, pMax), which treats all probabilities in the range as equally likely. Real delay rates have skewed, route-specific distributions.
- **Single aggregate probability** — each trial uses one `p` for all policies. In reality, a portfolio covers many routes with different delay profiles.
- **No correlation modeling** — delays on different routes are treated as independent. In practice, weather systems, ATC issues, and airline-wide disruptions create correlated delay events.
- **Expected value, not binomial** — each trial computes the expected payout (M × λ × p) rather than sampling individual policy outcomes. This underestimates variance, especially at low policy counts.
- **Single-period model** — the simulation models one settlement cycle. Real vault economics involve capital rotating across many cycles, with compounding effects.
- **No time value of money** — capital is locked during the flight coverage period but the model doesn't account for opportunity cost or APY normalization.
- **Static pricing** — premium and payout are fixed. The protocol will likely need dynamic pricing based on route-specific risk.

## Roadmap: Better Analysis

### Near-term improvements
- **Historical data calibration** — replace Uniform distribution with empirical delay distributions from BTS on-time performance data and AeroAPI historical records, per route and per season.
- **Binomial sampling** — simulate individual policy outcomes (delayed/not-delayed) using Bernoulli trials instead of expected values, to capture realistic variance.
- **Per-route portfolio modeling** — simulate a portfolio of routes with different delay profiles (e.g., SFO-JFK at 8% vs. ORD-DEN at 18%) and model the diversification benefit.

### Medium-term improvements
- **Correlated event modeling** — introduce regional shock events (storms, ATC ground stops) that simultaneously spike delay rates across multiple routes. Model using copulas or factor models.
- **Multi-period simulation** — simulate capital rotation across settlement cycles (weekly/monthly) to compute true APY, accounting for capital lockup periods and withdrawal queue dynamics.
- **Dynamic pricing engine** — model premium adjustments based on recent delay history, seasonality, and vault utilization ratio. Test pricing strategies against the simulation.
- **Stress testing** — model extreme scenarios (volcanic ash events, pandemic-era disruptions, major airline IT failures) and compute Value-at-Risk (VaR) and Conditional VaR for the vault.

### Long-term improvements
- **Agent-based modeling** — simulate traveler purchase behavior and underwriter deposit/withdraw decisions to model protocol growth dynamics and liquidity risk.
- **Real-time calibration pipeline** — connect to live AeroAPI data to continuously update delay distributions and re-run simulations, providing real-time risk dashboards.
- **Optimal capital allocation** — solve for the optimal protocol capital allocation across the fee rate and vault deposit given target return and risk constraints.

## Running Locally

```sh
cd quant
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Source Files

| File | Description |
|---|---|
| `src/lib/monteCarlo.ts` | Simulation engine — pure TypeScript, deterministic RNG, no dependencies |
| `src/App.tsx` | Interactive UI — parameter sliders, yield histogram, protocol earnings, sensitivity table |

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Recharts (histogram visualization)
- Tailwind CSS 4
