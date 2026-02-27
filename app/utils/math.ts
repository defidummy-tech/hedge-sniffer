// ═══ Math utilities: correlation, P/L calculations ═══

import type { Asset, Correlation } from "../types";

/** Pearson correlation coefficient between two series */
export function pearson(x: number[], y: number[]): number {
  var n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  var mx = x.reduce(function(a, b) { return a + b; }, 0) / n;
  var my = y.reduce(function(a, b) { return a + b; }, 0) / n;
  var num = 0, dx = 0, dy = 0;
  for (var i = 0; i < n; i++) {
    var xi = x[i] - mx, yi = y[i] - my;
    num += xi * yi;
    dx += xi * xi;
    dy += yi * yi;
  }
  var d = Math.sqrt(dx * dy);
  return d === 0 ? 0 : +(num / d).toFixed(3);
}

/** Compute correlation of each bet's odds with the asset's price changes */
export function compCorr(asset: Asset): Correlation[] {
  var pD = asset.priceHistory.slice(1).map(function(p, i) {
    return p.price - asset.priceHistory[i].price;
  });
  return asset.bets.map(function(b) {
    var oD = b.oddsHistory.slice(1).map(function(o, i) {
      return o.odds - b.oddsHistory[i].odds;
    });
    return { betId: b.id, question: b.q, correlation: pearson(pD, oD) };
  });
}
