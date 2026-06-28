import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatINR, formatINRShort } from './ui';

// SIP growth calculator with sliders and an animated invested-vs-value area chart.
export default function SIPCalculator() {
  const [monthly, setMonthly] = useState(10000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(15);

  const { chartData, invested, futureValue, gains } = useMemo(() => {
    const monthlyRate = rate / 12 / 100;
    const data = [];
    let totalInvested = 0;
    for (let y = 1; y <= years; y++) {
      const months = y * 12;
      totalInvested = monthly * months;
      // Future value of a series of monthly investments (annuity due not used; ordinary).
      const fv =
        monthlyRate === 0
          ? totalInvested
          : monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
      data.push({
        year: `Y${y}`,
        Invested: Math.round(monthly * months),
        Value: Math.round(fv),
      });
    }
    const last = data[data.length - 1] || { Invested: 0, Value: 0 };
    return {
      chartData: data,
      invested: last.Invested,
      futureValue: last.Value,
      gains: last.Value - last.Invested,
    };
  }, [monthly, rate, years]);

  return (
    <div className="rounded-3xl al-glass border border-white/[0.08] p-6 sm:p-8">
      <div className="grid lg:grid-cols-5 gap-8">
        {/* Sliders */}
        <div className="lg:col-span-2 space-y-7">
          <Slider label="Monthly SIP" value={monthly} display={formatINR(monthly)} min={500} max={200000} step={500} onChange={setMonthly} />
          <Slider label="Expected Return" value={rate} display={`${rate}% p.a.`} min={8} max={15} step={0.5} onChange={setRate} />
          <Slider label="Duration" value={years} display={`${years} years`} min={5} max={30} step={1} onChange={setYears} />

          <div className="space-y-3 pt-2">
            <Result label="Invested Amount" value={formatINR(invested)} muted />
            <Result label="Est. Returns" value={formatINR(gains)} accent />
            <Result label="Total Value" value={formatINR(futureValue)} big />
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-3 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sipValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF3333" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#CC0000" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="sipInvested" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#888" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#444" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatINRShort} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 12, color: '#fff' }}
                formatter={(v) => formatINR(v)}
              />
              <Area type="monotone" dataKey="Invested" stroke="#888" strokeWidth={2} fill="url(#sipInvested)" />
              <Area type="monotone" dataKey="Value" stroke="#FF3333" strokeWidth={2.5} fill="url(#sipValue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, display, min, max, step, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</span>
        <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ color: '#FF3333', background: 'rgba(204,0,0,0.12)' }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        className="al-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

function Result({ label, value, muted, accent, big }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{
        background: big ? 'rgba(204,0,0,0.1)' : 'rgba(255,255,255,0.03)',
        border: big ? '1px solid rgba(204,0,0,0.25)' : '1px solid transparent',
      }}
    >
      <span className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <span
        className={big ? 'text-lg font-bold' : 'text-sm font-bold'}
        style={{ color: accent ? '#FF3333' : muted ? 'rgba(255,255,255,0.8)' : '#fff' }}
      >
        {value}
      </span>
    </div>
  );
}
