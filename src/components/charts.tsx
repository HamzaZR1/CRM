"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(15,23,42,.2)" };

export function OrdersChart({ data }: { data: { day: string; orders: number; confirmed: number; delivered: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <defs>
          {[["o", "#3370fa"], ["c", "#10b981"], ["d", "#f59e0b"]].map(([id, c]) => (
            <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.25} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="orders" name="Orders" stroke="#3370fa" strokeWidth={2} fill="url(#go)" />
        <Area type="monotone" dataKey="confirmed" name="Confirmed" stroke="#10b981" strokeWidth={2} fill="url(#gc)" />
        <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#f59e0b" strokeWidth={2} fill="url(#gd)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, center, sub }: { data: { name: string; value: number; color: string }[]; center: string; sub: string }) {
  return (
    <div className="relative h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={68} outerRadius={95} paddingAngle={2} stroke="none">
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-2xl font-bold">{center}</div>
          <div className="text-xs text-slate-500">{sub}</div>
        </div>
      </div>
    </div>
  );
}

export function RevenueBars({ data }: { data: { day: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toLocaleString("fr-FR")} MAD`, "Delivered revenue"]} />
        <Bar dataKey="revenue" fill="#3370fa" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
