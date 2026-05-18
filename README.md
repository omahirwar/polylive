# Polymarket Airdrop Checker

Wallet paste karo, `Check` press karo, aur dashboard Polymarket public APIs se real wallet data fetch karega.

## Run

```powershell
node server.js
```

Open:

```text
http://127.0.0.1:4173
```

## What It Shows

- All-time volume and PnL from the Polymarket leaderboard API when available
- Buy/sell split, total bets, recent bets, and category split from fetched trades
- Open positions and PnL returned by the API
- Category-wise bets and volume
- Estimated airdrop reward based on editable FDV, pool %, supply, and eligible-score assumptions
- Airdrop estimate matrix for 1%-7% pool and $2B-$7B FDV
- Premium share banner after a wallet report is generated
- Share, copy text, or download a PNG report card

Polymarket trades endpoint currently allows `limit` up to `10000`, so trades are used for category/recent-bet analysis up to that API cap. Aggregate all-time volume/PnL comes from `/v1/leaderboard?timePeriod=ALL` when that endpoint returns the wallet.

## Assumptions

The checker does not know the real future airdrop formula. Edit these inputs in the page:

- `Token supply`
- `Total eligible score`
- `Bet value weight`
- `Category bonus`
- `Estimate FDV`
- `Reward pool %`

Your estimated share is:

```text
wallet score / total eligible score
```

Estimated airdrop value is:

```text
FDV * pool percent * wallet share
```
