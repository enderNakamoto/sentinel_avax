# Frontend details

This document describes the UI in this repository: the **Hedera System Contract DApp Playground**, located at **`lib/hedera-smart-contracts/system-contract-dapp-playground/`**. It is a Next.js 14 app that showcases Hedera system contracts and ERC tokens; it is not flight-insurance-specific but lives in this repo as the reference frontend.

---

## 1. Frontend location and stack

| Item | Detail |
|------|--------|
| **Path** | `lib/hedera-smart-contracts/system-contract-dapp-playground/` |
| **Framework** | Next.js 14 (App Router) |
| **UI** | React 18, Chakra UI, Tailwind CSS |
| **Animations** | Framer Motion |
| **Chain / wallet** | ethers v6, BrowserProvider (e.g. MetaMask), Hedera networks |
| **Font** | Styrene A (local webfont, `src/fonts/`) |

---

## 2. Pages and routes

### 2.1 Route structure

| Route | Page component | Layout | Description |
|-------|----------------|--------|-------------|
| **`/`** | `src/app/page.tsx` | Root | Home: Navbar + Landing + Footer |
| **`/activity`** | `src/app/activity/page.tsx` | Activity layout | Session transaction history; Navbar + Sidebar + Footer |
| **`/hedera/overview`** | `src/app/hedera/overview/page.tsx` | Hedera layout | Overview of Hedera network and smart contract library |
| **`/hedera/hts-hip-206`** | `src/app/hedera/hts-hip-206/page.tsx` | Hedera layout | HTS system contract wrapper (HIP-206): Token Create, Management, Query, Transfer |
| **`/hedera/hrc-719`** | `src/app/hedera/hrc-719/page.tsx` | Hedera layout | Token associate (HIP-719 / HRC-719) |
| **`/hedera/exchange-rate-hip-475`** | `src/app/hedera/exchange-rate-hip-475/page.tsx` | Hedera layout | Exchange rate system contract (HIP-475) |
| **`/hedera/prng-hip-351`** | `src/app/hedera/prng-hip-351/page.tsx` | Hedera layout | Pseudo-random number system contract (HIP-351) |
| **`/hedera/erc-20`** | `src/app/hedera/erc-20/page.tsx` | Hedera layout | Fungible token (ERC-20) deploy and interact |
| **`/hedera/erc-721`** | `src/app/hedera/erc-721/page.tsx` | Hedera layout | Non-fungible token (ERC-721) deploy and interact |

All `/hedera/*` and `/activity` routes are **protected**: they require wallet connection (account info is read from cookies; middleware/cookies gate access).

### 2.2 What each page contains

- **Home (`/`)**  
  - **Navbar**: Logo, “Hedera” text; when connected, “App Playground” label and wallet pill (address + dropdown).  
  - **Landing**: Hero “App Playground”, short description, **Connect Wallet** CTA. After connect, user is redirected to `/hedera/overview`.  
  - **Footer**: Logo, copyright, social links.

- **Activity (`/activity`)**  
  - **ActivitySection**: Table of session transactions (from localStorage), sort (oldest/latest), pagination, CSV export, clear, query response modal. No contract deploy/interact here—only history.

- **Hedera layout pages (`/hedera/*`)**  
  - **Navbar** (same as home, with wallet when connected).  
  - **Sidebar**: Nav links for Overview, HTS (HIP-206), Token associate (HIP-719), Exchange rate (HIP-475), PRNG (HIP-351), ERC-20, ERC-721. Active route highlighted (e.g. `bg-black/30 text-hedera-purple`).  
  - **Main**: Each route renders a **section** (from `src/sections/`) that includes title, contract info, and a **ContractInteraction** component (deploy + method tabs/forms).

- **Overview**  
  - Text about Hedera network and smart contract library, plus links to Hedera and GitHub.

- **Contract pages (e.g. ERC-20, ERC-721, HTS, etc.)**  
  - Section title and links (e.g. EIP-20, GitHub).  
  - **ContractInteraction**: Deploy (if applicable), contract address, tabs per contract/method group, forms for each method (inputs + Execute), and result display.

---

## 3. Forms and organization

### 3.1 Form components (contract interaction)

- **ContractInteraction** (`src/components/contract-interaction/index.tsx`) is the central wrapper:
  - Loads contract address from cookies (or deploy flow).
  - Creates **ethers.Contract** via `generateBaseContractInstance(address, ABI)`.
  - For deployable contracts: deploy form (e.g. ERC20DeployField), then **ConfirmModal** and cookie storage.
  - **Tabs** (Chakra) for method groups; each tab panel renders method-specific components.

- **Shared form building blocks** (under `src/components/common/`):
  - **OneLineMethod**: Title, tooltip, output placeholder, Execute button (read-only / simple calls).
  - **MultiLineMethod**: Multi-parameter forms for write/read methods.
  - **HederaCommonTextField**, **ParamInputForm**, **TokenAddressesInputForm**, **MetadataInputForm**, **SigningKeysForm**, etc., for inputs.
  - **ConfirmModal**, **AlertDialog** for confirmations and errors.
  - **TransactionResultTable** for tx results; **QueryResponseModal** for query responses.

- **Contract-specific method UIs** live under `src/components/contract-interaction/`:
  - **erc/erc-20/methods**: tokenInformation, mint, balanceOf, tokenPermissions, transfer.
  - **erc/erc-721/methods**: tokenInformation, mint, tokenURI, balance, owner, approve, operatorApproval, transferFrom.
  - **hts/**: token-create-custom, token-management-contract, token-query-contract, token-transfer-contract (each with methods subfolders).
  - **exchange-rate/methods**, **prng/methods**, **ihrc/methods** for HIP-475, HIP-351, HIP-719.

Forms typically: read ABI and params → call `baseContract.methodName(...)` (or deploy via Hedera API) → show loading → on success, toast and optionally store tx in localStorage for Activity.

### 3.2 Activity section

- **ActivitySection** (`src/sections/activity/index.tsx`):  
  - **ActivityTransactionTable**: Rows from `transactionList` (localStorage).  
  - **ExtraOptionsButton**: Sort order, export CSV, clear cache.  
  - **QueryResponseModal**: Inspect a single transaction/query result.  
  - **ConfirmModal** for clear confirmation.

Data comes from **localStorage** keys defined in `HEDERA_TRANSACTION_RESULT_STORAGE_KEYS`; contract deploy and method executions write there via `src/api/localStorage` and helpers.

---

## 4. Color scheme and theme

### 4.1 Tailwind theme (`tailwind.config.js`)

- **Background**
  - **primary**: `#1A232E` (main app background, e.g. `bg-primary`).
  - **secondary**: `#303337`.
  - **panel**: `#374151` (contract panels, cards).

- **Text**
  - **landing-text-hero**: `#8C8C8C` (muted hero text).
  - White used widely (`text-white`, `text-white/70`).

- **Brand / accents**
  - **hedera.green**: `#07E78E` (e.g. `text-hedera-green`, borders).
  - **hedera.purple**: `#A98DF4` (e.g. `text-hedera-purple`, links).
  - **button-stroke.violet**: `#82ACF9`.
  - **button-stroke.green**: `#07E78E`.
  - **hedera.gradient-1**: blue `#2D84EB`, purple `#8259EF` (e.g. Connect Wallet button).
  - **hedera.gradient-2**: lime `#D4F392`, teal `#00BDC9` (e.g. wallet pill).

- **Other**
  - **button**: `#202225`.

### 4.2 Chakra / constants

- **HEDERA_BRANDING_COLORS** (`src/utils/common/constants.ts`): `violet: '#82ACF9'`, `purple: '#A98DF4'`, `panel: '#374151'` (used in tables/panels).
- Chakra used for: **Tabs**, **Modal**, **Toast**, **Select**, **Tooltip**, **Popover**, **useDisclosure**, etc., with no custom theme override in the provider (default Chakra theme).

### 4.3 Global CSS (`src/styles/globals.css`)

- **Gradient blurs** (decorative):
  - **.gradient-01**: light blue blur `rgba(207, 236, 253, 0.8)`.
  - **.gradient-02**: `#7d7afb` blur.
  - **.gradient-03**: `#cfecfd` blur.
  - **.gradient-04**: `#7aebfb` blur (bottom).
- **.no-scrollbar**: Hides scrollbar (Chrome/Safari/Opera/IE/Edge/Firefox).

**Background gradients** are rendered by **BgGradient** (`src/components/background-gradients/index.tsx`) as absolutely positioned divs with these classes.

---

## 5. Animations

- **Framer Motion** is used across the app:
  - **Root layout**: No animation on layout itself; **BgGradient** is static.
  - **Navbar**: `motion.nav` with `initial={{ opacity: 0 }}`, `whileInView={{ opacity: 1 }}`, delay 0.3, duration 0.3.
  - **Footer**: Same pattern (opacity 0 → 1, delay 0.3).
  - **Landing**: `VerticalCommonVariants(30, 0.5)` for staggered vertical reveal (opacity + y); applied to hero block, “App”, “Playground”, description, Connect button, signature.
  - **Nav variants** (`src/libs/framer-motion/variants.tsx`): `navVariants` (hidden: opacity 0, y -30, spring; show: opacity 1, y 0, delay 0.6) for unconnected navbar.
  - **Sidebar**: `motion.div` opacity 0 → 1, delay 0.3, duration 0.3.
  - **Sections** (Overview, ERC-20, Activity, etc.): `initial={{ opacity: 0 }}`, `whileInView={{ opacity: 1 }}`, delay 0.3, duration 0.6 (or 0.3), `viewport={{ once: true }}`.

No complex page transitions; animations are entrance-only (fade/slide in).

---

## 6. Contract integration (technical)

### 6.1 Wallet and provider

- **Wallet** (`src/api/wallet/index.ts`):
  - **getWalletObject()**: `window.ethereum`.
  - **getWalletProvider()**: `new ethers.BrowserProvider(ethereum)`; returns `{ walletProvider }` or `{ err: '!HEDERA' }` if no wallet.
  - **requestAccount(walletProvider)**: `walletProvider.getSigner()` and account list (connect flow).
  - **getCurrentChainId(walletProvider)**: current chain ID for network check.
- **Network**: Hedera mainnet (295), testnet (296), previewnet (297), localnet (298); RPC and block explorer URLs in **HEDERA_NETWORKS** (`src/utils/common/constants.ts`). Landing checks **isCorrectHederaNetwork** before allowing connect.

### 6.2 Account persistence and protected routes

- **Cookies** (`src/api/cookies/`): Store account list, “isConnected”, and network (e.g. `_network`). **storeAccountInfoInCookies** after connect; **loadAccountInfoFromCookies** on protected routes.
- **Protected routes** list: `PROTECTED_ROUTES` in constants (all `/hedera/*` and `/activity`). Middleware/helpers use this to redirect or show errors if not connected.

### 6.3 Contract deployment

- **Hedera API** (`src/api/hedera/index.ts`):
  - **deploySmartContract(contractABI, contractBytecode, params)**:
    - Uses **getWalletProvider()** → `getSigner()`.
    - `new ethers.ContractFactory(ABI, bytecode, signer)` then `contract.deploy(...params, { gasLimit: 4_000_000 })`.
    - Reads/writes transaction result to **localStorage** (key from `HEDERA_TRANSACTION_RESULT_STORAGE_KEYS['CONTRACT-CREATE']`).
    - Returns `{ contractAddress }` or `{ err }`.
  - Contract addresses are then stored in **cookies** by contract name (e.g. ERC20Mock) via **storeInfoInCookies** (`src/api/cookies`).

### 6.4 Contract reads and writes (method calls)

- **Ethers API** (`src/api/ethers/index.ts`):
  - **generateBaseContractInstance(contractAddress, contractABI)**:
    - Gets **BrowserProvider** from **getWalletProvider()**, then `provider.getSigner()`.
    - `new ethers.Contract(contractAddress, ABI, signer)`.
    - Returns `{ baseContract }` or `{ err }`.
- **ContractInteraction** keeps `baseContract` in state and passes it to method components. Each method component:
  - For **read-only**: calls `baseContract.methodName(...args)` (no signer needed for view calls; ethers still uses signer for the contract instance).
  - For **write**: calls `baseContract.methodName(...args)` which returns a transaction; frontend can wait for receipt and then push result to **localStorage** for Activity.
- Contract ABIs and bytecode come from **@hashgraph-smartcontract/artifacts** (mapped in tsconfig from `../` relative to the playground). Constants (**HEDERA_SMART_CONTRACTS_ASSETS**, **CONTRACT_NAMES**) map contract names to ABI, bytecode, and method lists.

### 6.5 Mirror node (Hedera native ID)

- **Mirror node API** (`src/api/mirror-node/`): **getHederaNativeIDFromEvmAddress(evmAddress, network, type)** to resolve Hedera native contract/account ID from EVM address (e.g. for display or links). Used after deploy to show contract ID.

### 6.6 Flow summary

1. User connects wallet on **/** → account + network stored in cookies → redirect to **/hedera/overview**.
2. On contract pages, **ContractInteraction** loads contract address from cookies (or user deploys first). It creates **ethers.Contract** with signer and renders method tabs/forms.
3. User fills forms and clicks Execute → component calls `baseContract.methodName(...)` (or deploy via **deploySmartContract**). Results are shown and optionally stored in localStorage.
4. **Activity** reads from localStorage and displays session transaction list; no direct contract calls.

This frontend does **not** call the **FlightDataAggregator** or any flight-insurance contracts; those are used by the **flight-oracle** and **flight-oracle-acu** services. To build a flight-insurance UI, you would add new pages/sections and reuse the same patterns (wallet, ethers, cookies, Chakra/Tailwind) and point to the aggregator/controller ABIs and addresses.

---

## 7. File reference (high level)

| Area | Path |
|------|------|
| App routes | `src/app/` (page.tsx, layout.tsx per route) |
| Sections (page content) | `src/sections/` (landing, overview, activity, erc-20, erc-721, hts, etc.) |
| Layout UI | `src/components/navbar`, `footer`, `sidebar`, `background-gradients` |
| Contract UI | `src/components/contract-interaction/` (index + erc, hts, exchange-rate, prng, ihrc) |
| Shared form/UI | `src/components/common/` (components, methods) |
| Wallet / chain | `src/api/wallet`, `src/api/hedera`, `src/api/ethers`, `src/api/cookies` |
| Theme / motion | `tailwind.config.js`, `src/styles/globals.css`, `src/libs/framer-motion/variants.tsx` |
| Constants / config | `src/utils/common/constants.ts` (networks, routes, contract assets, colors) |
