"use client";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { FundingYield, Asset, Direction } from "../types";

interface FundingHarvestProps {
  yield_: FundingYield;
  asset: Asset;
  dir: Direction;
}

export default function FundingHarvest({ yield_, asset, dir }: FundingHarvestProps) {
  if (!asset.fundingRate || asset.fundingRate === 0) return null;

  var favorableDir = (asset.fundingRate > 0) ? "SHORT" : "LONG";
  var isFavorable = (dir === "long" && asset.fundingRate < 0) || (dir === "short" && asset.fundingRate > 0);
  var brAPR = yield_.breakEvenRate * 8760 * 100;
  var volAPR = yield_.rateVolatility * 8760 * 100;

  return (
    <div style={{ background: C.s, border: "1px solid " + (isFavorable ? C.g + "40" : C.r + "40"), borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 10, color: C.tx, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>
        Funding Harvest
        <HelpDot text={"Funding income from holding a " + dir + " position. " + favorableDir + " earns funding when rate is " + (asset.fundingRate > 0 ? "positive" : "negative") + ". Net yield = funding income minus hedge costs (re-hedged weekly)."} />
        {!isFavorable && <span style={{ fontSize: 8, marginLeft: 6, padding: "1px 5px", borderRadius: 3, background: C.r + "20", color: C.r, fontWeight: 700 }}>PAYING</span>}
        {isFavorable && <span style={{ fontSize: 8, marginLeft: 6, padding: "1px 5px", borderRadius: 3, background: C.g + "20", color: C.g, fontWeight: 700 }}>EARNING</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10, marginBottom: 8 }}>
        <div style={{ color: C.txM }}>Daily: <span style={{ color: yield_.dailyIncome >= 0 ? C.g : C.r, fontWeight: 600 }}>${yield_.dailyIncome}</span></div>
        <div style={{ color: C.txM }}>Weekly: <span style={{ color: yield_.weeklyIncome >= 0 ? C.g : C.r, fontWeight: 600 }}>${yield_.weeklyIncome}</span></div>
        <div style={{ color: C.txM }}>Monthly: <span style={{ color: yield_.monthlyIncome >= 0 ? C.g : C.r, fontWeight: 600 }}>${yield_.monthlyIncome}</span></div>
        <div style={{ color: C.txM }}>Gross APR: <span style={{ color: yield_.annualizedAPR >= 0 ? C.g : C.r, fontWeight: 600 }}>{(yield_.annualizedAPR * 100).toFixed(1)}%</span></div>
      </div>

      <div style={{ borderTop: "1px solid " + C.b, paddingTop: 6, fontSize: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 4 }}>
          <div style={{ color: C.txM }}>Hedge Cost: <span style={{ color: C.o, fontWeight: 600 }}>${yield_.hedgeCost}/wk</span></div>
          <div style={{ color: C.txM }}>Net APR: <span style={{ color: yield_.netAPR >= 0 ? C.g : C.r, fontWeight: 700, fontSize: 11 }}>{(yield_.netAPR * 100).toFixed(1)}%</span></div>
        </div>
        <div style={{ color: C.txM, marginBottom: 2 }}>
          Breakeven Rate: <span style={{ color: C.a, fontWeight: 600 }}>{brAPR.toFixed(1)}% APR</span>
          <HelpDot text="Minimum funding rate (annualized) to cover hedge costs over 1 week. If funding stays above this, you profit." />
        </div>
        <div style={{ color: C.txM }}>
          Rate Volatility: <span style={{ color: volAPR > 50 ? C.o : C.txD, fontWeight: 600 }}>\u00B1{volAPR.toFixed(0)}% APR</span>
          {volAPR > 100 && <span style={{ fontSize: 8, marginLeft: 4, color: C.o }}>HIGH VOL</span>}
        </div>
      </div>
    </div>
  );
}
