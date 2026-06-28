import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatINR } from './ui';

// Interactive EMI calculator with live sliders and an animated principal vs
// interest pie chart. Reusable across the Loans and Accounts pages.
export default function EMICalculator({
  initialAmount = 1000000,
  minAmount = 50000,
  maxAmount = 10000000,
  amountStep = 50000,
  initialRate = 9.5,
  minRate = 5,
  maxRate = 25,
  initialTenure = 10,
  minTenure = 1,
  maxTenure = 30,
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [rate, setRate] = useState(initialRate);
  const [tenure, setTenure] = useState(initialTenure);

  const { emi, totalInterest, totalPayment } = useMemo(() => {
    const principal = amount;
    const monthlyRate = rate / 12 / 100;
    const months = tenure * 12;
    let m;
    if (monthlyRate === 0) {
      m = principal / months;
    } else {
      m =
        (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
    }
    const total = m * months;
    return {
      emi: m,
      totalInterest: total - principal,
      totalPayment: total,
    };
  }, [amount, rate, tenure]);

  const data = [
    { name: 'Principal', value: amount },
    { name: 'Interest', value: Math.max(totalInterest, 0) },
  ];

  return (
    <div className="rounded-3xl al-glass border border-white/[0.08] p-6 sm:p-8 grid lg:grid-cols-2 gap-8 items-center">
      {/* Sliders */}
      <div className="space-y-7">
        <Slider
          label="Loan Amount"
          value={amount}
          display={formatINR(amount)}
          min={minAmount}
          max={maxAmount}
          step={amountStep}
          onChange={setAmount}
        />
        <Slider
          label="Interest Rate"
          value={rate}
          display={`${rate.toFixed(2)}% p.a.`}
          min={minRate}
          max={maxRate}
          step={0.25}
          onChange={setRate}
        />
        <Slider
          label="Tenure"
          value={tenure}
          display={`${tenure} ${tenure === 1 ? 'year' : 'years'}`}
          min={minTenure}
          max={maxTenure}
          step={1}
          onChange={setTenure}
        />
      </div>

      {/* Results + chart */}
      <div className="text-center">
        <div className="relative w-full h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={62}
                outerRadius={90}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive
              >
                <Cell fill="#2D2D2D" />
                <Cell fill="#CC0000" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Monthly EMI</p>
            <p className="text-2xl font-bold text-white">{formatINR(emi)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <Stat label="Principal" value={formatINR(amount)} dot="#2D2D2D" />
          <Stat label="Total Interest" value={formatINR(totalInterest)} dot="#CC0000" />
        </div>
        <div className="mt-3 rounded-xl py-3 px-4" style={{ background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.25)' }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Total Payment</p>
          <p className="text-xl font-bold text-white">{formatINR(totalPayment)}</p>
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

function Stat({ label, value, dot }) {
  return (
    <div className="rounded-xl py-3 px-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-2 justify-center mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} />
        <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
      </div>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}
