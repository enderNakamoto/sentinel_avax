import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  runSimulation,
  computeYieldAtP,
  DEFAULT_PARAMS,
  type SimulationParams,
} from './lib/monteCarlo';

/* ─── Sub-components ─── */

function StatCard({
  label,
  value,
  color,
  subtext,
}: {
  label: string;
  value: string;
  color: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-xl border border-[#1e2530] bg-[#0f1218] p-5">
      <p className="text-[11px] uppercase tracking-[0.15em] text-[#5a6478] mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-bold font-mono" style={{ color }}>
        {value}
      </p>
      {subtext && (
        <p className="text-xs text-[#5a6478] mt-1">{subtext}</p>
      )}
    </div>
  );
}

function ParamSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <label className="text-xs text-[#5a6478]">{label}</label>
        <span className="text-sm font-mono text-[#e8ecf4]">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#3b8ef3] h-1.5 bg-[#1e2530] rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#3b8ef3]
          [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,142,243,0.4)]"
      />
    </div>
  );
}

function FormulaCard({
  tag,
  formula,
  description,
  color = '#3b8ef3',
}: {
  tag: string;
  formula: string;
  description: string;
  color?: string;
}) {
  const bgColor = color === '#3b8ef3'
    ? 'rgba(59,142,243,0.06)'
    : color === '#2ecc8f'
    ? 'rgba(46,204,143,0.06)'
    : 'rgba(245,200,66,0.06)';
  const borderColor = color === '#3b8ef3'
    ? '#1a3a6b'
    : color === '#2ecc8f'
    ? '#0d3d27'
    : '#3d3210';

  return (
    <div
      className="rounded-xl border p-6"
      style={{ background: bgColor, borderColor }}
    >
      <p
        className="text-[11px] uppercase tracking-[0.15em] mb-3"
        style={{ color }}
      >
        {tag}
      </p>
      <p className="font-mono text-lg text-[#e8ecf4]">{formula}</p>
      <p className="text-sm text-[#5a6478] mt-3">{description}</p>
    </div>
  );
}

function InsightCard({
  title,
  body,
  color = '#3b8ef3',
}: {
  title: string;
  body: string;
  color?: string;
}) {
  const bgColor = color === '#3b8ef3'
    ? 'rgba(59,142,243,0.06)'
    : color === '#2ecc8f'
    ? 'rgba(46,204,143,0.06)'
    : color === '#f5c842'
    ? 'rgba(245,200,66,0.06)'
    : 'rgba(224,92,107,0.06)';
  const borderColor = color === '#3b8ef3'
    ? '#1a3a6b'
    : color === '#2ecc8f'
    ? '#0d3d27'
    : color === '#f5c842'
    ? '#3d3210'
    : '#5c1a22';

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: bgColor, borderColor }}
    >
      <p className="text-sm font-semibold text-[#e8ecf4] mb-2">{title}</p>
      <p className="text-sm text-[#5a6478] leading-relaxed">{body}</p>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { binCenter: number; count: number } }> }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#1e2530] bg-[#0f1218] px-3 py-2 text-xs shadow-lg">
      <p className="font-mono text-[#e8ecf4]">
        Yield: {data.binCenter.toFixed(1)}%
      </p>
      <p className="text-[#5a6478]">{data.count} simulations</p>
    </div>
  );
}

/* ─── Main App ─── */

export default function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [protocolFeeRate, setProtocolFeeRate] = useState(0.05);
  const [protocolCapital, setProtocolCapital] = useState(50000);

  const update = (key: keyof SimulationParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const result = useMemo(() => runSimulation(params), [params]);

  const protocolEarnings = useMemo(() => {
    const totalPremiums = params.numPolicies * params.premium;
    const feeIncome = totalPremiums * protocolFeeRate;
    const vaultYieldPct = result.meanYield / 100;
    const vaultIncome = protocolCapital * vaultYieldPct;
    const totalEarnings = feeIncome + vaultIncome;
    return { totalPremiums, feeIncome, vaultIncome, totalEarnings, vaultYieldPct };
  }, [params, protocolFeeRate, protocolCapital, result.meanYield]);

  const sensitivityPoints = [0.01, 0.03, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30].filter(
    (p) => p <= params.pMax + 0.05
  );

  const sensitivityData = useMemo(
    () =>
      sensitivityPoints.map((p) => ({
        delay: p,
        yield: computeYieldAtP(
          params.premium,
          params.payout,
          params.numPolicies,
          params.capital,
          p
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params]
  );

  return (
    <main className="min-h-screen bg-[#080a0f] text-[#e8ecf4]">
      {/* ─── Hero ─── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-10">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-3">
          Quantitative Analysis
        </p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4">
          Monte Carlo Simulation
        </h1>
        <p className="text-base md:text-lg text-[#8a93a8] leading-relaxed max-w-2xl">
          Modeling underwriter yield and protocol earnings for parametric flight
          delay insurance. Adjust the parameters below to explore how premiums,
          payouts, policy volume, and delay probabilities affect returns.
        </p>
      </section>

      {/* ─── Key Stats ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Average Yield"
            value={`${result.meanYield >= 0 ? '+' : ''}${result.meanYield.toFixed(1)}%`}
            color="#3b8ef3"
            subtext="Mean across all trials"
          />
          <StatCard
            label="Worst Case (5th %ile)"
            value={`${result.percentile5 >= 0 ? '+' : ''}${result.percentile5.toFixed(1)}%`}
            color={result.percentile5 >= 0 ? '#f5c842' : '#e05c6b'}
            subtext="5% of outcomes are worse"
          />
          <StatCard
            label="Best Case (95th %ile)"
            value={`+${result.percentile95.toFixed(1)}%`}
            color="#2ecc8f"
            subtext="5% of outcomes are better"
          />
          <StatCard
            label="Profit Probability"
            value={`${result.profitProbability.toFixed(1)}%`}
            color={result.profitProbability >= 90 ? '#2ecc8f' : result.profitProbability >= 50 ? '#f5c842' : '#e05c6b'}
            subtext="Chance of positive return"
          />
        </div>
      </section>

      {/* ─── Interactive Panel ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* Controls */}
          <div className="rounded-xl border border-[#1e2530] bg-[#0f1218] p-5 space-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
                Policy Terms
              </p>
              <div className="space-y-4">
                <ParamSlider
                  label="Premium (π)"
                  value={params.premium}
                  onChange={(v) => update('premium', v)}
                  min={1}
                  max={50}
                  step={1}
                  format={(v) => `$${v}`}
                />
                <ParamSlider
                  label="Payout (λ)"
                  value={params.payout}
                  onChange={(v) => update('payout', v)}
                  min={50}
                  max={500}
                  step={10}
                  format={(v) => `$${v}`}
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
                Scale
              </p>
              <div className="space-y-4">
                <ParamSlider
                  label="Policies Sold (M)"
                  value={params.numPolicies}
                  onChange={(v) => update('numPolicies', v)}
                  min={100}
                  max={50000}
                  step={100}
                  format={(v) => v.toLocaleString()}
                />
                <ParamSlider
                  label="Capital (C)"
                  value={params.capital}
                  onChange={(v) => update('capital', v)}
                  min={10000}
                  max={1000000}
                  step={10000}
                  format={(v) => `$${v.toLocaleString()}`}
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
                Delay Probability Range
              </p>
              <div className="space-y-4">
                <ParamSlider
                  label="Min Delay Rate"
                  value={params.pMin}
                  onChange={(v) => update('pMin', v)}
                  min={0.01}
                  max={0.15}
                  step={0.01}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <ParamSlider
                  label="Max Delay Rate"
                  value={params.pMax}
                  onChange={(v) => update('pMax', v)}
                  min={0.10}
                  max={0.40}
                  step={0.01}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[#1e2530]">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-[#5a6478]">Break-even delay rate</span>
                <span className="text-sm font-mono text-[#f5c842]">
                  p* = {(result.breakEvenP * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-[#5a6478] mt-1">
                Above this rate, underwriters lose money
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-[#1e2530] bg-[#0f1218] p-5">
            <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
              Distribution of Simulated Yields ({params.numSimulations.toLocaleString()} trials)
            </p>
            <ResponsiveContainer width="100%" height={380}>
              <BarChart
                data={result.histogram}
                margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
              >
                <CartesianGrid stroke="#1e2530" strokeDasharray="3 3" />
                <XAxis
                  dataKey="binCenter"
                  tick={{ fill: '#5a6478', fontSize: 10 }}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  interval={Math.max(0, Math.floor(result.histogram.length / 8) - 1)}
                  axisLine={{ stroke: '#1e2530' }}
                  tickLine={{ stroke: '#1e2530' }}
                  label={{
                    value: 'Yield (%)',
                    position: 'insideBottom',
                    offset: -10,
                    fill: '#5a6478',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  tick={{ fill: '#5a6478', fontSize: 10 }}
                  axisLine={{ stroke: '#1e2530' }}
                  tickLine={{ stroke: '#1e2530' }}
                  label={{
                    value: 'Frequency',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    fill: '#5a6478',
                    fontSize: 11,
                  }}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(59,142,243,0.08)' }} />
                <ReferenceLine
                  x={result.histogram.reduce((closest, bin) =>
                    Math.abs(bin.binCenter - result.meanYield) < Math.abs(closest.binCenter - result.meanYield) ? bin : closest
                  ).binCenter}
                  stroke="#e05c6b"
                  strokeDasharray="6 3"
                  strokeWidth={2}
                  label={{
                    value: `Mean: ${result.meanYield.toFixed(0)}%`,
                    position: 'top',
                    fill: '#e05c6b',
                    fontSize: 11,
                  }}
                />
                <ReferenceLine
                  x={result.histogram.reduce((closest, bin) =>
                    Math.abs(bin.binCenter - result.percentile5) < Math.abs(closest.binCenter - result.percentile5) ? bin : closest
                  ).binCenter}
                  stroke="#f5c842"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `5th: ${result.percentile5.toFixed(0)}%`,
                    position: 'top',
                    fill: '#f5c842',
                    fontSize: 10,
                  }}
                />
                <ReferenceLine
                  x={result.histogram.reduce((closest, bin) =>
                    Math.abs(bin.binCenter - result.percentile95) < Math.abs(closest.binCenter - result.percentile95) ? bin : closest
                  ).binCenter}
                  stroke="#2ecc8f"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `95th: ${result.percentile95.toFixed(0)}%`,
                    position: 'top',
                    fill: '#2ecc8f',
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {result.histogram.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.binCenter >= 0
                          ? 'rgba(59,142,243,0.7)'
                          : 'rgba(224,92,107,0.7)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ─── Protocol Earnings Explorer ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
          Protocol Earnings Explorer
        </p>
        <div className="rounded-xl border border-[#1e2530] bg-[#0f1218] p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
            {/* Protocol sliders */}
            <div className="space-y-5">
              <ParamSlider
                label="Protocol Fee Rate"
                value={protocolFeeRate}
                onChange={setProtocolFeeRate}
                min={0.01}
                max={0.20}
                step={0.01}
                format={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <ParamSlider
                label="Protocol Capital in Vault"
                value={protocolCapital}
                onChange={setProtocolCapital}
                min={10000}
                max={500000}
                step={5000}
                format={(v) => `$${v.toLocaleString()}`}
              />
              <div className="pt-3 border-t border-[#1e2530]">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-[#5a6478]">Vault Yield (mean)</span>
                  <span className="text-sm font-mono" style={{ color: result.meanYield >= 0 ? '#2ecc8f' : '#e05c6b' }}>
                    {result.meanYield >= 0 ? '+' : ''}{result.meanYield.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[10px] text-[#5a6478]">
                  From Monte Carlo simulation above
                </p>
              </div>
            </div>

            {/* Earnings breakdown */}
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  label="Premium Fee Income"
                  value={`$${Math.round(protocolEarnings.feeIncome).toLocaleString()}`}
                  color="#3b8ef3"
                  subtext={`${(protocolFeeRate * 100).toFixed(0)}% of $${protocolEarnings.totalPremiums.toLocaleString()}`}
                />
                <StatCard
                  label="Vault Yield Income"
                  value={`${protocolEarnings.vaultIncome >= 0 ? '' : '-'}$${Math.abs(Math.round(protocolEarnings.vaultIncome)).toLocaleString()}`}
                  color={protocolEarnings.vaultIncome >= 0 ? '#2ecc8f' : '#e05c6b'}
                  subtext={`${result.meanYield.toFixed(1)}% on $${protocolCapital.toLocaleString()}`}
                />
                <StatCard
                  label="Total Protocol Earnings"
                  value={`${protocolEarnings.totalEarnings >= 0 ? '' : '-'}$${Math.abs(Math.round(protocolEarnings.totalEarnings)).toLocaleString()}`}
                  color={protocolEarnings.totalEarnings >= 0 ? '#2ecc8f' : '#e05c6b'}
                  subtext="Fee + Vault yield"
                />
                <StatCard
                  label="Earnings Split"
                  value={protocolEarnings.totalEarnings > 0 ? `${((protocolEarnings.feeIncome / protocolEarnings.totalEarnings) * 100).toFixed(0)}% / ${((protocolEarnings.vaultIncome / protocolEarnings.totalEarnings) * 100).toFixed(0)}%` : '—'}
                  color="#f5c842"
                  subtext="Fee vs Vault"
                />
              </div>

              {/* Visual bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-[#5a6478] uppercase tracking-wider">
                  <span>Earnings Composition</span>
                  <span>
                    Total: ${Math.abs(Math.round(protocolEarnings.totalEarnings)).toLocaleString()}
                  </span>
                </div>
                {protocolEarnings.totalEarnings > 0 ? (
                  <div className="h-6 rounded-full bg-[#1e2530] overflow-hidden flex">
                    <div
                      className="h-full rounded-l-full transition-all duration-300"
                      style={{
                        width: `${(protocolEarnings.feeIncome / protocolEarnings.totalEarnings) * 100}%`,
                        background: 'rgba(59,142,243,0.6)',
                      }}
                    />
                    <div
                      className="h-full rounded-r-full transition-all duration-300"
                      style={{
                        width: `${(Math.max(0, protocolEarnings.vaultIncome) / protocolEarnings.totalEarnings) * 100}%`,
                        background: 'rgba(46,204,143,0.6)',
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-6 rounded-full bg-[rgba(224,92,107,0.3)]" />
                )}
                <div className="flex gap-4 text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-[rgba(59,142,243,0.6)]" />
                    <span className="text-[#5a6478]">Premium Fees</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-[rgba(46,204,143,0.6)]" />
                    <span className="text-[#5a6478]">Vault Yield</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Sensitivity Table ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
          Sensitivity Analysis
        </p>
        <div className="rounded-xl border border-[#1e2530] bg-[#0f1218] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2530]">
                <th className="text-left px-5 py-3 text-[11px] uppercase tracking-[0.15em] text-[#5a6478] font-medium">
                  Delay Rate (p)
                </th>
                <th className="text-right px-5 py-3 text-[11px] uppercase tracking-[0.15em] text-[#5a6478] font-medium">
                  Expected Yield
                </th>
                <th className="text-right px-5 py-3 text-[11px] uppercase tracking-[0.15em] text-[#5a6478] font-medium">
                  Outcome
                </th>
              </tr>
            </thead>
            <tbody>
              {sensitivityData.map(({ delay, yield: y }) => (
                <tr
                  key={delay}
                  className="border-b border-[#1e2530] last:border-b-0"
                >
                  <td className="px-5 py-3 font-mono text-[#e8ecf4]">
                    {(delay * 100).toFixed(0)}%
                  </td>
                  <td
                    className="px-5 py-3 text-right font-mono font-semibold"
                    style={{
                      color: y > 0 ? '#2ecc8f' : y === 0 ? '#f5c842' : '#e05c6b',
                    }}
                  >
                    {y >= 0 ? '+' : ''}{y.toFixed(1)}%
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background:
                          y > 0
                            ? 'rgba(46,204,143,0.12)'
                            : y === 0
                            ? 'rgba(245,200,66,0.12)'
                            : 'rgba(224,92,107,0.12)',
                        color: y > 0 ? '#2ecc8f' : y === 0 ? '#f5c842' : '#e05c6b',
                      }}
                    >
                      {y > 0 ? 'Profitable' : y === 0 ? 'Break-even' : 'Loss'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Methodology ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
          Methodology
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormulaCard
            tag="Underwriter Yield"
            formula="Yield = M × (π - λ × p) / C × 100%"
            description="Where M = policies sold, π = premium per policy, λ = payout per claim, p = delay probability, C = total vault capital."
            color="#3b8ef3"
          />
          <FormulaCard
            tag="Protocol Earnings"
            formula="E = f × M × π + Cp × Yield"
            description="Where f = protocol fee rate (1–20%), M × π = total premiums collected, Cp = protocol's own capital in the vault. The protocol earns from both fees and vault yield."
            color="#2ecc8f"
          />
          <FormulaCard
            tag="Break-Even Probability"
            formula="p* = π / λ"
            description="The delay probability at which premiums exactly equal expected payouts. Below this, the vault is profitable. Above, it loses money."
            color="#f5c842"
          />
          <FormulaCard
            tag="Monte Carlo Method"
            formula="p ~ Uniform(pMin, pMax)"
            description="Each trial draws a random delay probability from the specified range and computes the resulting yield. 10,000 trials produce the distribution above."
            color="#3b8ef3"
          />
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
          How It Works
        </p>
        <div className="rounded-xl border border-[#1e2530] bg-[#0f1218] p-6 space-y-4">
          <p className="text-sm text-[#8a93a8] leading-relaxed">
            In parametric flight delay insurance, underwriters pool capital into a shared vault (RiskVault).
            Travelers pay a fixed premium to insure a specific flight. If the flight is delayed
            beyond the 45-minute threshold, the traveler receives an automatic payout from the vault.
            If the flight is on time, the premium flows to the vault as income.
          </p>
          <p className="text-sm text-[#8a93a8] leading-relaxed">
            The <span className="text-[#e8ecf4] font-medium">protocol earns in two ways</span>: a configurable fee
            (1–20%) on every premium collected, and yield on its own capital deposited in the RiskVault
            alongside other underwriters. The underwriter yield section above models the vault-wide return;
            the Protocol Earnings Explorer shows the protocol's combined income from both sources.
          </p>
          <p className="text-sm text-[#8a93a8] leading-relaxed">
            The underwriter's return depends on the <span className="text-[#e8ecf4] font-medium">delay probability</span> across
            all insured flights. Since this probability is uncertain and varies by route, season,
            and conditions, we use Monte Carlo simulation to model the range of possible outcomes.
          </p>
          <p className="text-sm text-[#8a93a8] leading-relaxed">
            Currently, delay probability is sampled from a <span className="text-[#e8ecf4] font-medium">uniform distribution</span> between
            the min and max rates. Future iterations will calibrate these distributions using
            historical flight data from the Bureau of Transportation Statistics (BTS) and AeroAPI,
            giving route-specific yield projections.
          </p>
        </div>
      </section>

      {/* ─── Strategic Insights ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#3b8ef3] mb-4">
          Strategic Insights
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InsightCard
            title="Premium vs. Payout Tradeoff"
            body="Higher premiums raise the break-even threshold, making the vault profitable even at higher delay rates. But premiums that are too high will deter travelers from purchasing coverage."
            color="#3b8ef3"
          />
          <InsightCard
            title="Policy Volume Amplifies Everything"
            body="Selling more policies magnifies both gains and losses. At profitable delay rates, more volume means more income. But if delays spike, losses scale proportionally."
            color="#2ecc8f"
          />
          <InsightCard
            title="Capital Buffer Matters"
            body="Larger capital reserves reduce yield volatility and protect against short-term spikes in delay rates. A well-capitalized vault can weather bad months without becoming insolvent."
            color="#f5c842"
          />
          <InsightCard
            title="Tail Risk Is Real"
            body="Even with favorable average conditions, extreme events (regional shutdowns, severe weather) can cause delay rates to spike well beyond historical norms. Dynamic pricing and route diversification are essential hedges."
            color="#e05c6b"
          />
        </div>
      </section>
    </main>
  );
}
