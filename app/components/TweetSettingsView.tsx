"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "../utils/constants";
import type { TweetConfig } from "../types";

// ── Slider Component ──
function Slider(props: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; color: string; tip: string }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: C.tx, textTransform: "uppercase" }}>{props.label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: props.color }}>{props.value}{props.unit}</span>
      </div>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={function(e) { props.onChange(parseFloat(e.target.value)); }}
        style={{ width: "100%", accentColor: props.color, height: 4, cursor: "pointer" }}
      />
      <div style={{ fontSize: 8, color: C.txD }}>{props.tip}</div>
    </div>
  );
}

var DEFAULT_TWEET_CONFIG: TweetConfig = {
  enableHigh: true, enableSustained: true, enableDeals: true,
  extremeAPR: 9, highAPR: 5, sustainedAPR: 2, sustainedDays: 7,
  dealMinScore: 50, dealMinAPR: 0.5,
  cooldownHighHours: 4, cooldownSustainedHours: 24, cooldownDealHours: 8,
  globalCooldownMinutes: 30, maxTweetsPerRun: 1,
};

export default function TweetSettingsView() {
  var [config, setConfig] = useState<TweetConfig>(DEFAULT_TWEET_CONFIG);
  var [saving, setSaving] = useState(false);
  var [testing, setTesting] = useState(false);
  var [statusMsg, setStatusMsg] = useState<string | null>(null);
  var [testResult, setTestResult] = useState<any>(null);

  // Load config on mount
  useEffect(function() {
    fetch("/api/bot/tweet-config").then(function(r) { return r.json(); }).then(function(j) {
      if (j.ok && j.config) setConfig(j.config);
    }).catch(function() {});
  }, []);

  function upd(key: string, val: any) {
    setConfig(function(prev) { return { ...prev, [key]: val }; });
  }

  var saveConfig = useCallback(async function() {
    setSaving(true);
    setStatusMsg(null);
    try {
      var res = await fetch("/api/bot/tweet-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Save failed: " + res.status);
      setStatusMsg("Tweet config saved!");
      setTimeout(function() { setStatusMsg(null); }, 3000);
    } catch (e: any) {
      setStatusMsg("Save failed: " + (e.message || "unknown"));
    } finally {
      setSaving(false);
    }
  }, [config]);

  var testTweets = useCallback(async function() {
    setTesting(true);
    setTestResult(null);
    try {
      var res = await fetch("/api/cron/tweet-alerts");
      var json = await res.json();
      setTestResult(json);
    } catch (e: any) {
      setTestResult({ error: e.message });
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <div style={{ padding: "16px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ fontSize: 18, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, marginBottom: 16 }}>
        {"\uD83D\uDCE2"} <span style={{ color: C.y }}>Tweet Alert</span> Settings
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* LEFT: Thresholds & Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Feature Toggles */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: C.tx, marginBottom: 10 }}>{"\u2699"} ALERT TYPES</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { key: "enableHigh", label: "High Funding", icon: "\uD83D\uDEA8" },
                { key: "enableSustained", label: "Sustained", icon: "\uD83D\uDD25" },
                { key: "enableDeals", label: "Deal Alerts", icon: "\uD83C\uDFAF" },
              ].map(function(toggle) {
                var active = (config as any)[toggle.key];
                return (
                  <button key={toggle.key} onClick={function() { upd(toggle.key, !active); }} style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 11, fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                    border: "1px solid " + (active ? C.g : C.r) + "50",
                    background: (active ? C.g : C.r) + "15",
                    color: active ? C.g : C.r,
                    flex: 1, minWidth: 100,
                  }}>
                    {toggle.icon} {toggle.label} {active ? "ON" : "OFF"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thresholds */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: C.tx, marginBottom: 10 }}>{"\uD83C\uDFAF"} THRESHOLDS</div>
            <Slider label="Extreme APR (any coin)" value={+(config.extremeAPR * 100).toFixed(0)} onChange={function(v) { upd("extremeAPR", v / 100); }} min={100} max={5000} step={100} unit="%" color={C.r} tip="Tweet ANY coin above this funding APR — catches rare spikes" />
            <Slider label="High APR (known coins)" value={+(config.highAPR * 100).toFixed(0)} onChange={function(v) { upd("highAPR", v / 100); }} min={100} max={2000} step={50} unit="%" color={C.o} tip="Tweet known/popular coins above this APR" />
            <Slider label="Sustained APR" value={+(config.sustainedAPR * 100).toFixed(0)} onChange={function(v) { upd("sustainedAPR", v / 100); }} min={50} max={1000} step={25} unit="%" color={C.y} tip="Tweet if avg APR sustained above this over lookback period" />
            <Slider label="Sustained Lookback" value={config.sustainedDays} onChange={function(v) { upd("sustainedDays", v); }} min={1} max={30} step={1} unit="d" color={C.a} tip="Days to average funding rate for sustained alerts" />
            <Slider label="Deal Min Score" value={config.dealMinScore} onChange={function(v) { upd("dealMinScore", v); }} min={10} max={100} step={5} unit="" color={C.p} tip="Min deal quality score to tweet (higher = fewer, better deals)" />
            <Slider label="Deal Min APR" value={+(config.dealMinAPR * 100).toFixed(0)} onChange={function(v) { upd("dealMinAPR", v / 100); }} min={10} max={500} step={10} unit="%" color={C.p} tip="Min funding APR for deal tweets" />
          </div>
        </div>

        {/* RIGHT: Cooldowns & Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Cooldowns */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: C.tx, marginBottom: 10 }}>{"\u23F1"} COOLDOWNS & RATE LIMITS</div>
            <Slider label="Global Cooldown" value={config.globalCooldownMinutes} onChange={function(v) { upd("globalCooldownMinutes", v); }} min={5} max={180} step={5} unit="min" color={C.r} tip="Min minutes between ANY tweets — prevents rapid-fire posting" />
            <Slider label="High Alert Cooldown" value={config.cooldownHighHours} onChange={function(v) { upd("cooldownHighHours", v); }} min={1} max={48} step={1} unit="h" color={C.o} tip="Hours before tweeting the same coin again (high funding alerts)" />
            <Slider label="Sustained Cooldown" value={config.cooldownSustainedHours} onChange={function(v) { upd("cooldownSustainedHours", v); }} min={4} max={72} step={4} unit="h" color={C.y} tip="Hours before tweeting the same coin again (sustained alerts)" />
            <Slider label="Deal Cooldown" value={config.cooldownDealHours} onChange={function(v) { upd("cooldownDealHours", v); }} min={2} max={48} step={2} unit="h" color={C.p} tip="Hours before tweeting the same coin again (deal alerts)" />
            <Slider label="Max Tweets / Run" value={config.maxTweetsPerRun} onChange={function(v) { upd("maxTweetsPerRun", v); }} min={1} max={5} step={1} unit="" color={C.a} tip="Max tweets per cron invocation — prevents burst posting" />
          </div>

          {/* Actions */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveConfig} disabled={saving} style={{
                flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid " + C.g + "50",
                background: "linear-gradient(135deg," + C.g + "15," + C.a + "10)",
                color: C.g, fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
              }}>
                {saving ? "\u27F3 Saving..." : "\u2714 Save Settings"}
              </button>
              <button onClick={testTweets} disabled={testing} style={{
                flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid " + C.y + "50",
                background: "linear-gradient(135deg," + C.y + "15," + C.o + "10)",
                color: C.y, fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                cursor: testing ? "wait" : "pointer",
              }}>
                {testing ? "\u27F3 Scanning..." : "\uD83D\uDD0D Test Run"}
              </button>
            </div>
            {statusMsg && (
              <div style={{ fontSize: 10, color: statusMsg.includes("fail") ? C.r : C.g, textAlign: "center", padding: 6 }}>
                {statusMsg}
              </div>
            )}
          </div>

          {/* Current Config Summary */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: C.tx, marginBottom: 8 }}>{"\uD83D\uDCCB"} ACTIVE RULES</div>
            <div style={{ fontSize: 10, color: C.txM, fontFamily: "monospace", lineHeight: 1.8 }}>
              {config.enableHigh && <div>{"\u2022"} High funding: tweet any coin at <span style={{ color: C.r, fontWeight: 600 }}>{(config.extremeAPR * 100).toFixed(0)}%</span> APR, known coins at <span style={{ color: C.o, fontWeight: 600 }}>{(config.highAPR * 100).toFixed(0)}%</span></div>}
              {!config.enableHigh && <div style={{ color: C.txD }}>{"\u2022"} High funding alerts: OFF</div>}
              {config.enableSustained && <div>{"\u2022"} Sustained: tweet if avg APR {"\u2265"} <span style={{ color: C.y, fontWeight: 600 }}>{(config.sustainedAPR * 100).toFixed(0)}%</span> over <span style={{ color: C.a, fontWeight: 600 }}>{config.sustainedDays}d</span></div>}
              {!config.enableSustained && <div style={{ color: C.txD }}>{"\u2022"} Sustained alerts: OFF</div>}
              {config.enableDeals && <div>{"\u2022"} Deals: score {"\u2265"} <span style={{ color: C.p, fontWeight: 600 }}>{config.dealMinScore}</span>, APR {"\u2265"} <span style={{ color: C.p, fontWeight: 600 }}>{(config.dealMinAPR * 100).toFixed(0)}%</span></div>}
              {!config.enableDeals && <div style={{ color: C.txD }}>{"\u2022"} Deal alerts: OFF</div>}
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid " + C.b + "30" }}>
                {"\u23F1"} Global: <span style={{ color: C.r, fontWeight: 600 }}>{config.globalCooldownMinutes}min</span> between tweets, max <span style={{ color: C.a, fontWeight: 600 }}>{config.maxTweetsPerRun}</span>/run
              </div>
            </div>
          </div>

          {/* Test Results */}
          {testResult && (
            <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: C.tx, marginBottom: 8 }}>{"\uD83D\uDD0D"} TEST RESULT</div>
              <div style={{ fontSize: 10, color: C.txM, fontFamily: "monospace", lineHeight: 1.6 }}>
                {testResult.error && <div style={{ color: C.r }}>{"\u274C"} {testResult.error}</div>}
                {testResult.ok && (
                  <>
                    <div>Scanned: <span style={{ color: C.a, fontWeight: 600 }}>{testResult.scanned}</span> assets in {testResult.elapsed}</div>
                    <div>Posted: <span style={{ color: testResult.posted?.length > 0 ? C.g : C.txD, fontWeight: 600 }}>{testResult.posted?.length || 0}</span> tweets</div>
                    {testResult.posted?.map(function(p: any, i: number) {
                      return <div key={i} style={{ color: C.g, paddingLeft: 12 }}>{"\u2713"} {p.sym} ({p.apr}) — {p.type}</div>;
                    })}
                    {testResult.skipped?.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ color: C.txD }}>Skipped: {testResult.skipped.length}</div>
                        {testResult.skipped.slice(0, 5).map(function(s: any, i: number) {
                          return <div key={i} style={{ color: C.txD, paddingLeft: 12, fontSize: 9 }}>{s.sym}: {s.reason}</div>;
                        })}
                        {testResult.skipped.length > 5 && <div style={{ color: C.txD, paddingLeft: 12, fontSize: 9 }}>...and {testResult.skipped.length - 5} more</div>}
                      </div>
                    )}
                    {testResult.stats && (
                      <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid " + C.b + "30" }}>
                        High qualified: {testResult.stats.highQualified} | Sustained: {testResult.stats.sustainedQualified}/{testResult.stats.sustainedCandidates} | Deals: {testResult.stats.dealsQualified}/{testResult.stats.dealsFound}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
