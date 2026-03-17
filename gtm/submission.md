# Go-To-Market Submission

## 1. Product Vision
> Where is your product headed long-term? Describe the future you're building toward.

Sentinel Protocol is building a **fair, transparent, and decentralized parametric insurance protocol**  starting with flight delays.

**Parametric insurance** pays out automatically when a predefined, measurable condition is met, with no claims process, no adjusters, no disputes. Unlike traditional insurance, where payouts depend on proving and assessing actual losses, parametric insurance relies solely on verifiable data triggers: was the flight delayed? Did the wildfire cross this boundary? The result is faster, fairer, and fully automatable.

**Near-term:** We launch as a niche prediction market for flight delays. Travelers stake a fixed USDC premium against a fixed payout on whether their flight is delayed or cancelled. Settlement is fully on-chain and automatic via Chainlink CRE oracles. Underwriters deposit into a shared risk vault and earn yield from premiums on on-time flights. No claim forms, no intermediaries, just code.

**Medium-term:** We transform from prediction market to **full parametric insurance** by adding two critical layers: **zkID** for decentralized KYC (regulatory compliance without centralized identity stores) and **zkTLS** to cryptographically prove boarding pass ownership, ensuring only real travelers with real flights can purchase coverage. On the pricing side, we move from static premium/payout pairs to **intelligent, dynamic pricing** with transparent AI agents that adjust premiums and payouts per route based on historical delay data, seasonal patterns, weather forecasts, and geopolitical risk (e.g., regional airspace shutdowns during conflicts). This protects underwriters from tail risk and ensures consistent, sustainable yield.

**Long-term:** Expand beyond flights into other domains where **verifiable, objective data feeds** make parametric triggers possible: wildfire insurance using NASA's FIRMS satellite data, crop insurance via remote sensing, earthquake coverage from USGS sensors. The protocol architecture stays the same: a verifiable data source, a parametric trigger, automatic settlement, and shared underwriter liquidity. Every parameter (pricing models, risk thresholds, coverage categories) is set by transparent, auditable AI agents. No black-box actuarial tables, no opaque denial decisions. Anyone can verify why a premium is what it is, how a payout was triggered, and where the capital sits. Insurance as public good infrastructure: fair to the insured, sustainable for underwriters, and trustless by design.


## 2. Supporting Documents / Links

- [Live Demo](https://sentinel-avax-7e2l.vercel.app/)
- [GitHub Repository](https://github.com/enderNakamoto/sentinel_avax?tab=readme-ov-file#sentinel-protocol)


## 3. Milestones & Roadmap
> Add your key milestones by period.

**Q2 2026**
- Mainnet launch on Avalanche C-Chain
- 1,000+ people on waitlist
- Closed beta as niche prediction market serving 100+ flights
- 100+ whitelisted routes across major US airports
- Seed underwriter liquidity onboarded
- Smart contract security audit
- Detailed analysis on airports and routes with Monte Carlo simulation based on historical data to project underwriter APY

**Q3 2026**
- Codebase hardening based on audit findings
- Load testing and scaling to 500+ whitelisted routes
- Open beta, serving 1,000+ flights
- AI-driven route whitelisting for dynamic coverage expansion
- zkID and zkTLS integration for decentralized KYC and boarding pass verification
- Dynamic pricing v1 with AI agents adjusting premiums based on historical route data
- Target: 500+ policies settled, $500K+ TVL in RiskVault

**Q4 2026**
- Transition from prediction market to full parametric insurance
- 1,000+ whitelisted routes
- Target: 1,000+ policies settled, $1M+ TVL in RiskVault

**Q1 2027**
- Second vertical launch (e.g., wildfire insurance via NASA FIRMS)
- Multi-chain expansion beyond Avalanche
- Partnership with travel platforms for embedded insurance
- Governance token launch if needed
- Target: 5,000+ policies settled, $2M+ TVL

## 4. User Acquisition Strategy
> How do you reach and convert your first users? Which channels — content, partnerships, referrals, community, or paid?

Sentinel Protocol sits at the intersection of web2 and web3. Our underwriters are DeFi natives seeking sustainable USDC yield. Our insurance buyers are everyday travelers who never need to know there is a blockchain backend.

**Conference-driven acquisition:**
We start by targeting the crypto-native conference circuit, where our early adopters already live. We will whitelist routes leading to major upcoming conferences like Token2049 (Dubai, October 2026), EthCC (Cannes, July 2026), and ETH Denver (February 2027), and run paid campaigns on X targeting attendees. We will pursue partnerships with event organizers like ETH Global and ETH Denver to offer flight delay coverage directly to their attendees as a perk or integration. Paid placements in communities like Crypto Nomad will help us reach frequent-flying crypto users. Target: first 2,000 customers through this channel.

**Yield-driven underwriter growth:**
Once we can demonstrate healthy, consistent USDC yield backed by real settlement data, we expect underwriter TVL to grow organically. Post-audit credibility combined with detailed Monte Carlo analysis showing projected APY per route based on real historical data will give DeFi-native capital allocators the confidence to deposit into the RiskVault.

**Web2 expansion:**
As the protocol matures and adds zkID/zkTLS, we expand to mainstream travelers who never interact with a wallet or know about the blockchain. We plan to build a Chrome extension that lets users buy flight delay coverage directly from booking sites like Expedia, embedding insurance seamlessly into the existing flight purchase flow. They just buy coverage and get paid if their flight is delayed.


## 5. Community Strategy
> How are you building and engaging your community? Discord, forums, ambassador programs, governance, events?

We will deploy Telegram bots that let users check routes, buy coverage, and track flight status directly in chat. Active usage will be rewarded to incentivize early adoption and referrals. A Discord channel will serve as the hub for underwriters, travelers, and contributors to engage with the protocol and provide feedback.

**Conference partnerships:**
We will partner with crypto conference organizers (ETH Global, ETH Denver, Token2049) to offer free flight delay coverage to attendees who join our Discord and engage with the community. This turns every conference into a funnel: attendees experience the product firsthand, join the community, and become organic advocates.

**Ambassador and KOL program:**
Selected ambassadors and KOLs will receive free insurance credits to share with their audiences. In return, they create content around their experience, whether their flight was on time or delayed, the payout was automatic, and the process was transparent. Ambassadors who actively participate in Discord and drive referrals will receive ongoing coverage credits and early access to new features.


## 6. Revenue & Sustainability Model
> How does your project generate sustainable revenue or value? Describe fees, subscriptions, token mechanics, or other monetization approaches.

We are deliberately designing a mechanism that is self-sustaining without a token from the very beginning. Revenue comes from real economic activity (insurance fees and underwriting yield), not token emissions or speculative incentives.

**Core revenue model:**
The protocol will take a 5-10% fee on every insurance policy sold. This fee is deducted from the premium before the remainder flows into the RiskVault as underwriter income. This creates a sustainable revenue stream that scales directly with policy volume. The fee switch is not yet implemented in the current contracts but will be added prior to mainnet launch.

**Protocol-as-underwriter:**
In addition to fees, the protocol deploys its own capital into the RiskVault alongside external underwriters, earning the same yield. Protocol-owned capital is always preferred, meaning it is deployed first and absorbs risk before external underwriter deposits. This aligns the protocol's incentives with its users and generates compounding returns on top of fee revenue.

**Sustainability analysis:**
A detailed Monte Carlo simulation based on historical flight delay data across major US routes projects underwriter APY and protocol profitability under various market conditions. [Link to analysis: TBD]


## 7. Competitive Landscape
> Name 2–3 direct competitors or alternatives. What makes users choose your project over them?

The parametric insurance market is valued at approximately $16-21 billion in 2025 and projected to reach $34-48 billion by 2033-2035, growing at a 9.7-13.1% CAGR. Within this, flight delay parametric insurance is one of the fastest-growing segments, driven by demand for instant, hassle-free payouts.

**Web2 competitors:**

- **Chubb (Travel Pro):** Launched October 2025. Digital-first parametric travel insurance embedded directly into booking flows, backed by one of the world's largest insurers. However, it remains a traditional insurance product with centralized control, opaque pricing, and no way for third parties to underwrite or earn yield.
- **Cover Genius (Delay Valet):** Parametric flight delay protection embedded in travel platforms with instant payouts. B2B distribution model, not accessible to independent underwriters.
- **Berkshire Hathaway (AirCare):** Monitors flights and processes reimbursements automatically. Massive brand trust, but closed system with no transparency into pricing logic or capital allocation.

**Web3 competitors:**

- **Etherisc:** Decentralized insurance protocol with an open-source Generic Insurance Framework covering flight delays and crop insurance. Most direct web3 competitor. However, Etherisc relies on its own DIP token for staking and governance, and its flight delay product has seen limited traction.
- **Arbol:** Blockchain-based parametric insurance focused on agriculture with 20+ contract types. Strong in weather/crop, but no presence in travel or flight delay coverage.
- **Lemonade Crypto Climate Coalition:** Nonprofit initiative backed by Avalanche, Chainlink, Etherisc, and Hannover Re providing at-cost crop insurance to African farmers. Uses the same infrastructure stack (Avalanche + Chainlink) but serves a completely different market segment.

**Why travelers will choose Sentinel Protocol:**

- **Transparent pricing:** Every premium and payout is on-chain and auditable. Unlike Chubb or Berkshire Hathaway, there is no black box deciding what you pay or what you receive. You see exactly where your money goes.
- **Guaranteed payout logic:** Settlement is handled by smart contracts, not a claims department. If your flight is delayed beyond the threshold, you get paid. There is no discretion, no denial, no fine print.
- **No claims process at all:** With competitors like AirCare or Travel Pro, there is still a company in the middle deciding when and how to pay. With Sentinel, the oracle writes the flight status on-chain and the contract settles automatically. The traveler does not need to file anything.
- **Web3 abstracted away:** Travelers will buy coverage through a simple UI or eventually a Chrome extension on booking sites like Expedia. They will not need a wallet, will not need to understand blockchain, and will not need to hold any token. The experience will be simpler than traditional insurance, not more complex.
- **Coverage where others do not offer it:** By dynamically whitelisting routes using AI agents and real-time data, we will offer coverage on routes that traditional insurers avoid due to limited actuarial data or low volume. Conference routes, seasonal destinations, and emerging airports will get coverage faster.

**Why underwriters will choose Sentinel Protocol:**

- **Sustainable USDC yield** backed by real premium income, not token emissions.
- **Full transparency:** Every pool, every settlement, every payout is on-chain. Underwriters can verify exactly how their capital is being used.
- **Shared liquidity pool:** A single RiskVault across all active flights improves capital efficiency compared to per-product silos used by competitors like Etherisc.
- **No token dependency:** The protocol is designed to be self-sustaining without a governance token from day one.

