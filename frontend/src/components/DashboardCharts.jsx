import { useId, useEffect, useState } from "react";
import "./DashboardCharts.css";

const CHART_COLORS = [
  "var(--chart-1)", 
  "var(--chart-2)", 
  "var(--chart-3)", 
  "var(--chart-4)", 
  "var(--chart-5)", 
  "var(--chart-6)"
];

function getNumericValue(value) {
  return Number(value || 0);
}

function formatPercent(value, total) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function buildLineChart(data, width, height, padding) {
  const values = data.map((item) => getNumericValue(item.value));
  const maxValue = Math.max(1, ...values);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((item, index) => {
    const denominator = Math.max(data.length - 1, 1);
    const x = padding + (index / denominator) * innerWidth;
    const y = padding + innerHeight - (getNumericValue(item.value) / maxValue) * innerHeight;
    return { x, y, label: item.label, value: item.value };
  });

  if (points.length === 1) {
    points[0].x = width / 2;
  }

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;

  return { maxValue, points, linePath, areaPath };
}

export function TrendAreaChart({ data, valueFormatter, emptyMessage }) {
  const gradientId = useId();
  const [animated, setAnimated] = useState(false);
  const width = 600; 
  const height = 240; // Reduced height for more compact look
  const padding = 30; // Tighter padding

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!data.length) {
    return <p className="dashboard-chart-empty">{emptyMessage}</p>;
  }

  const { maxValue, points, linePath, areaPath } = buildLineChart(data, width, height, padding);

  return (
    <div className="dashboard-chart-shell">
      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        className={`dashboard-line-chart ${animated ? "is-animated" : ""}`} 
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", minHeight: "200px" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((step) => {
          const y = padding + (height - padding * 2) * step;
          const value = Math.round(maxValue - maxValue * step);
          return (
            <g key={step}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} className="dashboard-line-grid" />
              <text x={4} y={y + 4} className="dashboard-line-axis-label" style={{ fontSize: "12px", fill: "var(--color-text)" }}>
                {valueFormatter(value)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} className="dashboard-line-area" />
        <path d={linePath} className="dashboard-line-path" />

        {points.map((point, index) => {
          // Only show labels for all points if count <= 6, else skip some to avoid overlap
          const shouldShowLabel = points.length <= 6 || (index % Math.ceil(points.length / 6) === 0) || index === points.length - 1;
          return (
            <g key={`${point.label}-${point.x}`}>
              <circle cx={point.x} cy={point.y} r="5" className="dashboard-line-dot" />
              {shouldShowLabel && (
                <>
                  <text x={point.x} y={point.y - 12} textAnchor="middle" className="dashboard-line-value" style={{ fontSize: "11px", fontWeight: "600", fill: "var(--color-text)" }}>
                    {valueFormatter(point.value)}
                  </text>
                  <text x={point.x} y={height - 10} textAnchor="middle" className="dashboard-line-label" style={{ fontSize: "10px", fontWeight: "700", fill: "var(--color-text)" }}>
                    {point.label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutBreakdownChart({ data, centerLabel, centerValue, emptyMessage }) {
  const chartId = useId();
  const [animated, setAnimated] = useState(false);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + getNumericValue(item.value), 0);
  const segments = data.reduce((collection, item, index) => {
    const value = getNumericValue(item.value);
    const segment = total ? (value / total) * circumference : 0;
    const previousOffset = collection.at(-1)?.nextOffset || 0;
    collection.push({
      key: item.label,
      color: CHART_COLORS[index % CHART_COLORS.length],
      segment,
      strokeDashoffset: -previousOffset,
      nextOffset: previousOffset + segment,
    });
    return collection;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(timer);
  }, []);

  if (!total) {
    return <p className="dashboard-chart-empty">{emptyMessage}</p>;
  }

  return (
    <div className="dashboard-donut-layout">
      <div className={`dashboard-donut-wrap ${animated ? "is-animated" : ""}`} style={{ maxWidth: "160px", margin: "0 auto" }}>
        <svg viewBox="0 0 160 160" className="dashboard-donut-chart" style={{ width: "100%", height: "auto" }}>
          <circle cx="80" cy="80" r={radius} className="dashboard-donut-track" fill="none" stroke="var(--color-bg)" strokeWidth="16" />
          <g transform="rotate(-90 80 80)">
            {segments.map((segment) => (
                <circle
                  key={`${chartId}-${segment.key}`}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="16"
                  strokeDasharray={animated ? `${segment.segment} ${circumference - segment.segment}` : `0 ${circumference}`}
                  strokeDashoffset={segment.strokeDashoffset}
                  className="dashboard-donut-segment"
                />
            ))}
          </g>
        </svg>

        <div className="dashboard-donut-center">
          <span style={{ color: "var(--color-text)", opacity: 0.6, fontSize: "0.8rem" }}>{centerLabel}</span>
          <strong style={{ fontSize: "1.4rem", color: "var(--color-text)" }}>{centerValue}</strong>
        </div>
      </div>

      <div className="dashboard-donut-legend boxes-grid">
        {data.map((item, index) => {
          const value = getNumericValue(item.value);
          if (value === 0) return null;
          return (
            <div key={item.label} className="donut-legend-box">
              <span className="donut-swatch-circle" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
              <div className="legend-box-content">
                <strong style={{ fontSize: "13px", color: "var(--color-text)" }}>{item.label}</strong>
                <div className="legend-box-meta">
                  <span className="count-pill">{value} Cases</span>
                  <span className="percent-pill">{formatPercent(value, total)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LollipopRankChart({ data, valueFormatter, emptyMessage }) {
  const [animated, setAnimated] = useState(false);
  const values = data.map((item) => getNumericValue(item.value));
  const maxValue = Math.max(1, ...values);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!data.length || values.every((v) => v === 0)) {
    return <p className="dashboard-chart-empty">{emptyMessage}</p>;
  }

  return (
    <div className={`dashboard-lollipop-list ${animated ? "is-animated" : ""}`}>
      {data.map((item, index) => {
        const value = getNumericValue(item.value);
        return (
          <div key={item.label} className="dashboard-lollipop-row">
            <div className="dashboard-lollipop-copy">
              <strong style={{ color: "var(--color-text)" }}>{item.label}</strong>
              <span style={{ color: "var(--color-primary)", fontWeight: "700" }}>{valueFormatter(value)}</span>
            </div>
            <div className="dashboard-lollipop-track" style={{ background: "var(--color-bg)", borderRadius: "999px", height: "8px", overflow: "hidden" }}>
              <div
                className="dashboard-lollipop-line"
                style={{
                  width: animated ? `${(value / maxValue) * 100}%` : "0%",
                  height: "100%",
                  background: CHART_COLORS[index % CHART_COLORS.length],
                  borderRadius: "999px",
                  transition: "width 1s ease-out"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AttentionHeatChart({ data, emptyMessage }) {
  const [animated, setAnimated] = useState(false);
  const total = data.reduce((sum, item) => sum + getNumericValue(item.value), 0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(timer);
  }, []);

  if (!data.length || total === 0) {
    return <p className="dashboard-chart-empty">{emptyMessage}</p>;
  }

  return (
    <div className={`dashboard-heat-grid ${animated ? "is-animated" : ""}`}>
      {data.map((item, index) => {
        const value = getNumericValue(item.value);
        const color = CHART_COLORS[index % CHART_COLORS.length];

        return (
          <div
            key={item.label}
            className="dashboard-heat-card"
            style={{
              background: "var(--color-bg)",
              border: `1px solid ${color}44`,
              padding: "16px",
              borderRadius: "16px"
            }}
          >
            <div className="dashboard-heat-top">
              <span className="dashboard-donut-swatch" style={{ backgroundColor: color, width: "8px", height: "8px", borderRadius: "50%", display: "inline-block", marginRight: "8px" }} />
              <strong style={{ color: "var(--color-text)", fontSize: "0.9rem" }}>{item.label}</strong>
            </div>
            <div className="dashboard-heat-count" style={{ fontSize: "1.5rem", fontWeight: "800", color: color, margin: "8px 0" }}>{value}</div>
            <div className="dashboard-heat-meta">
              <strong style={{ color: "var(--color-text)", opacity: 0.6, fontSize: "0.8rem" }}>{formatPercent(value, total)}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}




