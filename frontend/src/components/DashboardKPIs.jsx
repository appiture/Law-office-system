import React from "react";
import BorderGlow from "./ui/BorderGlow/BorderGlow";
import { currency } from "../utils/formatters";

function DashboardKPIs({ summary, clients, activeCaseCount, finance }) {
  const kpis = [
    { label: "Total Clients", value: Number(summary?.totalClients ?? clients.length) },
    { label: "Active Cases", value: Number(activeCaseCount) },
    { label: "Overall Pending", value: currency(Number(finance.totalDue || 0)) },
    { label: "Lawyer Fees Due", value: currency(Number(finance.lawyerFeesDue || 0)) },
  ];

  return (
    <section className="card-grid mb-4">
      {kpis.map((item) => (
        <BorderGlow key={item.label} glowIntensity={0.3} borderRadius={16}>
          <div className="metric-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        </BorderGlow>
      ))}
    </section>
  );
}

export default DashboardKPIs;
