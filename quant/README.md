# Monte Carlo Simulation: Underwriter Yield Analysis

Interactive simulation modeling underwriter yield for parametric flight delay insurance.

## Live Demo

The simulation runs as an interactive page in the Sentinel Protocol frontend at `/simulation`. Adjust parameters in real time and see how they affect the yield distribution.

## Summary

This simulation models flight-delay insurance underwriting using **10,000 trials**, where delay probabilities (`p`) are drawn from a **Uniform(1%, 20%)** distribution. The expected yield per trial is:

$$
\text{Yield} = \frac{M \cdot (\pi - \lambda \cdot p)}{C} \times 100\%
$$

With default parameters (**π = $20**, **λ = $100**, **M = 10,000** policies, **C = $100,000** capital), results show:

| Statistic | Value |
|---|---|
| Average Yield | ~96% |
| 5th Percentile (worst case) | ~+10% |
| 95th Percentile (best case) | ~+180% |
| Profit Probability | 100% |

## Methodology

### Problem Setup

In flight-delay insurance underwriting, underwriters pool capital into a shared vault. For each policy:
- The vault collects a **premium** (`π`, e.g., $20)
- If the flight is delayed, the vault pays a **payout** (`λ`, e.g., $100)

The probability of delay (`p`) varies between 1% and 20%, depending on flight routes, season, and weather.

### Expected Yield Formula

$$
\text{Yield} = \frac{M \cdot (\pi - \lambda \cdot p)}{C} \times 100\%
$$

Where:
- `M` = number of policies sold
- `π` = premium per policy
- `λ` = payout per claim
- `p` = probability of delay
- `C` = initial underwriter capital

### Break-Even Probability

$$
p^* = \frac{\pi}{\lambda}
$$

With π = $20 and λ = $100, the break-even delay rate is **20%**. Below this, underwriters profit. Above, they lose.

### Sensitivity Analysis

| Delay Rate | Yield (default params) | Outcome |
|---|---|---|
| 1% | +190% | Profitable |
| 5% | +150% | Profitable |
| 10% | +100% | Profitable |
| 15% | +50% | Profitable |
| 20% | 0% | Break-even |

### Monte Carlo Method

Since actual delay probability is uncertain:
1. Draw `p` from Uniform(pMin, pMax) for each trial
2. Compute yield for that trial
3. Repeat 10,000 times
4. Analyze the distribution: mean, percentiles, profit probability

### Strategic Takeaways

1. **Premium/Payout Tradeoff**: Higher premiums raise the break-even threshold but may deter buyers.
2. **Policy Volume**: More policies amplify both gains and losses.
3. **Capital Buffer**: Larger capital reduces yield volatility and protects against spikes.
4. **Tail Risk**: Extreme events (regional shutdowns, severe weather) can push delay rates well beyond historical norms.

## Future Improvements

- **Historical data calibration**: Replace Uniform distribution with empirical distributions from BTS/AeroAPI data per route
- **Per-route modeling**: Simulate a portfolio of routes with different delay profiles
- **Correlated events**: Model regional shocks that affect multiple routes simultaneously
- **Binomial sampling**: Simulate individual policy outcomes instead of expected values
- **Multi-period model**: Simulate capital rotation across settlement cycles for true APY

## Running Locally

The simulation is a standalone Vite + React app:

```sh
cd quant
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Source Files

| File | Description |
|---|---|
| `quant/src/lib/monteCarlo.ts` | Simulation engine (pure TypeScript, no dependencies) |
| `quant/src/App.tsx` | Interactive UI with charts and parameter controls |
