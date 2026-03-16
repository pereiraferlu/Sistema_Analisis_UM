import React, { useMemo, useState } from "react";
import { LogisticsData } from "../../types";
import Accordion from "../Accordion";
import SortableTable from "../SortableTable";
import ChartFilter from "../ChartFilter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Rectangle,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from "recharts";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
  "#84cc16",
  "#6366f1",
];

interface DistribuidoresProps {
  data: LogisticsData[];
  totalPiezas: number;
  renderIndicators: (title: string, value: number | string) => React.ReactNode;
  CustomTooltip: React.FC<any>;
  isGeneral?: boolean;
}

const getShortName = (name: string, allNames: string[]) => {
  if (!name) return "";
  const parts = name.trim().split(" ");
  const firstName = parts[0];
  const duplicates = allNames.filter(
    (n) => n.trim().split(" ")[0] === firstName,
  );
  if (duplicates.length > 1 && parts.length > 1) {
    return `${firstName} ${parts[1]}`;
  }
  return firstName;
};

export default function Distribuidores({
  data,
  totalPiezas,
  renderIndicators,
  CustomTooltip,
  isGeneral,
}: DistribuidoresProps) {
  const [selectedDistribuidores, setSelectedDistribuidores] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [chartView, setChartView] = useState<string>("Por Distribuidor");

  const distribuidoresData = useMemo(() => {
    const filteredData = selectedVehicles.length > 0 
      ? data.filter(d => selectedVehicles.includes(d.vehiculo || "N/A"))
      : data;

    if (isGeneral) {
      const counts: Record<string, { distribuidores: Set<string>; rutas: Set<string> }> = {};
      filteredData.forEach((d) => {
        if (!counts[d.sucursal]) counts[d.sucursal] = { distribuidores: new Set(), rutas: new Set() };
        if (d.distribuidor) counts[d.sucursal].distribuidores.add(d.distribuidor);
        if (d.hojaRuta) counts[d.sucursal].rutas.add(d.hojaRuta);
      });
      return Object.entries(counts)
        .map(([name, stats]) => ({
          name,
          value: stats.distribuidores.size,
          rutas: stats.rutas.size,
          entregadas: 0,
          noEntregadas: 0,
          efectividad: 0,
        }))
        .sort((a, b) => b.value - a.value);
    } else {
      const counts: Record<string, { total: number; entregadas: number; noEntregadas: number; vehiculo: string; rutas: Set<string> }> = {};
      filteredData.forEach((d) => {
        const key = d.distribuidor;
        if (!counts[key]) {
          counts[key] = { total: 0, entregadas: 0, noEntregadas: 0, vehiculo: d.vehiculo || "N/A", rutas: new Set() };
        }
        counts[key].total += d.piezasTotal;
        counts[key].entregadas += d.piezasEntregadas;
        counts[key].noEntregadas += d.piezasNoEntregadas;
        if (d.hojaRuta) counts[key].rutas.add(d.hojaRuta);
      });
      return Object.entries(counts)
        .map(([name, stats]) => ({
          name,
          vehiculo: stats.vehiculo,
          value: stats.rutas.size,
          entregadas: stats.entregadas,
          noEntregadas: stats.noEntregadas,
          efectividad: stats.total > 0 ? (stats.entregadas / stats.total) * 100 : 0,
          totalRutas: stats.rutas.size,
        }))
        .sort((a, b) => b.value - a.value);
    }
  }, [data, isGeneral, selectedVehicles]);

  const chartDistribuidoresData = useMemo(() => {
    const filteredData = selectedVehicles.length > 0 
      ? data.filter(d => selectedVehicles.includes(d.vehiculo || "N/A"))
      : data;

    const counts: Record<string, { total: number; entregadas: number; noEntregadas: number; vehiculo: string; rutas: Set<string> }> = {};
    filteredData.forEach((d) => {
      const key = d.distribuidor;
      if (!counts[key]) {
        counts[key] = { total: 0, entregadas: 0, noEntregadas: 0, vehiculo: d.vehiculo || "N/A", rutas: new Set() };
      }
      counts[key].total += d.piezasTotal;
      counts[key].entregadas += d.piezasEntregadas;
      counts[key].noEntregadas += d.piezasNoEntregadas;
      if (d.hojaRuta) counts[key].rutas.add(d.hojaRuta);
    });
    return Object.entries(counts)
      .map(([name, stats]) => ({
        name,
        vehiculo: stats.vehiculo,
        value: stats.rutas.size,
        entregadas: stats.entregadas,
        noEntregadas: stats.noEntregadas,
        efectividad: stats.total > 0 ? (stats.entregadas / stats.total) * 100 : 0,
        totalRutas: stats.rutas.size,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data, selectedVehicles]);

  const allNames = useMemo(() => chartDistribuidoresData.map((d) => d.name), [chartDistribuidoresData]);

  const chartData = useMemo(() => {
    let filtered = chartDistribuidoresData;
    if (selectedDistribuidores.length > 0) {
      filtered = filtered.filter((d) => selectedDistribuidores.includes(d.name));
    } else {
      filtered = filtered.slice(0, 10);
    }
    return filtered.map((d) => ({
      ...d,
      shortName: getShortName(d.name, allNames),
    }));
  }, [chartDistribuidoresData, selectedDistribuidores, allNames]);

  const vehicleChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    chartData.forEach(d => {
      const v = d.vehiculo || "N/A";
      counts[v] = (counts[v] || 0) + d.value;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value, shortName: name })).sort((a, b) => b.value - a.value);
  }, [chartData]);

  const totalValue = distribuidoresData.reduce((acc, curr) => acc + curr.value, 0);

  const columns = isGeneral ? [
    { key: "name", label: "Sucursal", align: "left" as const },
    { key: "value", label: "Total Distribuidores", align: "center" as const },
    { key: "rutas", label: "Cantidad de Rutas", align: "center" as const },
  ] : [
    { key: "name", label: "Distribuidor", align: "left" as const, render: (val: string) => getShortName(val, allNames) },
    { key: "vehiculo", label: "Tipo de Vehículo", align: "left" as const },
    { key: "value", label: "Total Rutas", align: "center" as const },
  ];

  const CustomTooltipWithFullName = ({ active, payload, label }: any) => {
    if (active && payload && payload.length > 0) {
      const fullName = payload[0]?.payload?.name || label;
      return (
        <div className="bg-white p-3 border border-secondary-200 shadow-lg rounded-lg z-50">
          <p className="text-sm font-semibold text-secondary-900 mb-1">{fullName}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color || entry.fill }}>
              {entry.name || "Valor"}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const handleLegendClick = (index: number, e: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setActiveIndex(activeIndex === index ? null : index);
  };

  const renderLegend = (props: any) => {
    const { payload } = props;
    if (!payload || !Array.isArray(payload)) return null;
    return (
      <ul className="flex flex-col space-y-2 max-h-64 overflow-y-auto pr-2">
        {payload.map((entry: any, index: number) => {
          const isSelected = activeIndex === index;
          const isFaded = activeIndex !== null && !isSelected;

          return (
            <li
              key={`item-${index}`}
              className="flex items-center cursor-pointer text-sm"
              onClick={(e) => handleLegendClick(index, e)}
              style={{
                color: isSelected ? "#0f172a" : "#64748b",
                fontWeight: isSelected ? "bold" : "normal",
                opacity: isFaded ? 0.5 : 1,
                transition: "all 0.2s",
              }}
            >
              <span
                className="w-3 h-3 mr-2 inline-block rounded-sm"
                style={{
                  backgroundColor: entry.color,
                  filter: isSelected ? "brightness(0.7)" : "brightness(1)",
                }}
              />
              {entry.value}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-6" onClick={() => setActiveIndex(null)}>
      <Accordion title="Indicadores" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
          {renderIndicators(isGeneral ? "Total Sucursales" : "Total Distribuidores", distribuidoresData.length)}
          {renderIndicators(isGeneral ? "Sucursal Top" : "Distribuidor Top", distribuidoresData[0]?.name || "-")}
          {renderIndicators(isGeneral ? "Cantidad Total Sucursal Top" : "Total Rutas del Distribuidor Top", isGeneral ? (distribuidoresData[0]?.value.toLocaleString() || "0") : (distribuidoresData[0]?.totalRutas?.toLocaleString() || "0"))}
        </div>
      </Accordion>

      <Accordion title="Tabla de Datos" defaultOpen={false}>
        <div className="min-h-[500px]" onClick={(e) => e.stopPropagation()}>
          <SortableTable columns={columns} data={distribuidoresData} />
        </div>
      </Accordion>

      <Accordion title="Gráficos" defaultOpen={false}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex space-x-2">
            {["Por Distribuidor", "Por Vehículo"].map((view) => (
              <button
                key={view}
                onClick={(e) => { e.stopPropagation(); setChartView(view); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                  chartView === view ? "bg-primary-600 text-white" : "bg-secondary-100 text-secondary-600 hover:bg-secondary-200"
                }`}
              >
                {view}
              </button>
            ))}
          </div>
          <div className="flex items-center space-x-4" onClick={(e) => e.stopPropagation()}>
            <ChartFilter
              options={chartDistribuidoresData.map((d) => d.name)}
              selectedOptions={selectedDistribuidores}
              onChange={setSelectedDistribuidores}
              label="Filtrar Distribuidores"
            />
            <ChartFilter
              options={Array.from(new Set(data.map(d => d.vehiculo))).filter((v): v is string => Boolean(v))}
              selectedOptions={selectedVehicles}
              onChange={setSelectedVehicles}
              label="Filtrar Tipo de Vehículo"
            />
          </div>
        </div>
        <div className="flex flex-col space-y-8">
          <div className="h-[500px] w-full group">
            <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
              {chartView === "Por Vehículo" ? "Total de Rutas por Tipo de Vehículo" : "Rutas por Distribuidor"}
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartView === "Por Vehículo" ? vehicleChartData : chartData} layout="vertical" margin={{ top: 5, right: 50, left: 20, bottom: 5 }} style={{ outline: "none" }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" />
                <YAxis 
                  dataKey="shortName" 
                  type="category" 
                  width={150} 
                  tick={(props: any) => {
                    const { x, y, payload, index } = props;
                    const isActive = activeIndex === index;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          x={0}
                          y={0}
                          dy={4}
                          textAnchor="end"
                          fill={isActive ? "#3b82f6" : "#666"}
                          fontSize={11}
                          fontWeight={isActive ? "bold" : "normal"}
                          onClick={(e) => {
                            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                            setActiveIndex(activeIndex === index ? null : index);
                          }}
                          style={{ cursor: "pointer", outline: "none" }}
                        >
                          {payload.value}
                        </text>
                      </g>
                    );
                  }} 
                />
                <Tooltip content={<CustomTooltipWithFullName />} cursor={{ fill: "transparent" }} />
                <Legend verticalAlign="top" height={36} />
                {chartView === "Por Distribuidor" && (
                  <Bar dataKey="value" name="Rutas" fill="#3b82f6" radius={[0, 4, 4, 0]} activeBar={<Rectangle fill="#2563eb" />}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: '11px', fill: '#666' }} />
                  </Bar>
                )}
                {chartView === "Por Vehículo" && (
                  <Bar dataKey="value" name="Rutas por Vehículo" fill="#8b5cf6" radius={[0, 4, 4, 0]} activeBar={<Rectangle fill="#7c3aed" />}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: '11px', fill: '#666' }} />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
