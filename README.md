# 🔍 DefiDummy's Hedge Deal Sniffer v5.0

Multi-hedge simulator for Hyperliquid perpetual futures × Polymarket prediction bets.

## Features

- **Multi-hedge** — Stack multiple Yes/No Polymarket bets per perp position
- **3D P/L Surface** — Interactive Canvas 3D view across Price × Leverage
- **Price Variance** — Historical range overlay on P/L charts
- **Auto Optimizer** — Finds best hedge combination with scoring
- **7-Day Correlation** — Pearson ρ between price and bet odds
- **CSV Export** — Download full scenario data

## Run locally

```bash
npm install
npm run dev    # → http://localhost:3000
```

## Deploy

Push to GitHub → connect to Render as a Web Service:
- **Build:** `npm install && npm run build`
- **Start:** `npm start`
