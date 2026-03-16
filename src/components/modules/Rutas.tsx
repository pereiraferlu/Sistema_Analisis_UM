import React, { useMemo, useState } from "react";
import { LogisticsData } from "../../types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  LabelList,
} from "recharts";
import SortableTable from "../SortableTable";
import Accordion from "../Accordion";
import ChartFilter from "../ChartFilter";

interface RutasProps {
  data: LogisticsData[];
  totalPiezas: number;
  renderIndicators: (title: string, value: number | string) => React.ReactNode;
  CustomTooltip: React.FC<any>;
  isGeneral: boolean;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

export default function Rutas({
  data,
  totalPiezas,
  renderIndicators,
  CustomTooltip,
  isGeneral,
}: RutasProps) {
  const [topRutas, setTopRutas] = useState("10");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const rutasData = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.forEach((d) => {
      const key = isGeneral ? d.sucursal : d.distribuidor;
      if (!map.has(key)) {
        map.set(key, new Set());
      }
      if (d.hojaRuta) {
        map.get(key)!.add(d.hojaRuta);
      }
    });

    return Array.from(map.entries())
      .map(([name, rutasSet]) => ({
        name,
        rutas: rutasSet.size,
      }))
      .sort((a, b) => b.rutas - a.rutas);
  }, [data, isGeneral]);

  const displayRutasData =
    topRutas === "all" ? rutasData : rutasData.slice(0, Number(topRutas));

  const evolutionData = useMemo(() => {
    const map = new Map<string, { [key: string]: Set<string> }>();
    data.forEach((d) => {
      if (!d.fecha) return;
      if (!map.has(d.fecha)) {
        map.set(d.fecha, {});
      }
      const dateObj = map.get(d.fecha)!;
      const key = isGeneral ? d.sucursal : d.distribuidor;
      if (!dateObj[key]) {
        dateObj[key] = new Set();
      }
      if (d.hojaRuta) {
        dateObj[key].add(d.hojaRuta);
      }
    });

    return Array.from(map.entries())
      .map(([fecha, keysObj]) => {
        const obj: any = { fecha };
        Object.entries(keysObj).forEach(([key, rutasSet]) => {
          obj[key] = rutasSet.size;
        });
        return obj;
      })
      .sort((a, b) => {
        const [dayA, monthA, yearA] = a.fecha.split("/");
        const [dayB, monthB, yearB] = b.fecha.split("/");
        return (
          new Date(+yearA, +monthA - 1, +dayA).getTime() -
          new Date(+yearB, +monthB - 1, +dayB).getTime()
        );
      });
  }, [data, isGeneral]);

  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    rutasData.forEach((d) => keys.add(d.name));
    return Array.from(keys);
  }, [rutasData]);

  const totalRutas = rutasData.reduce((acc, curr) => acc + curr.rutas, 0);

  const columns = [
    { key: "name", label: isGeneral ? "Sucursal" : "Distribuidor", align: "left" as const },
    { key: "rutas", label: "Total Rutas", align: "center" as const },
  ];

  return (
    <div className="space-y-6" onClick={() => setSelectedItem(null)}>
      <Accordion title="Indicadores" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {renderIndicators("Total Rutas", totalRutas)}
          {renderIndicators("Promedio Rutas/Día", (totalRutas / (evolutionData.length || 1)).toFixed(0))}
          {isGeneral && renderIndicators(
            "Sucursal con más rutas",
            rutasData.length > 0 ? `${rutasData[0].name} (${rutasData[0].rutas})` : "-"
          )}
        </div>
      </Accordion>

      <Accordion title="Tabla de Datos" defaultOpen={false}>
        <SortableTable data={rutasData} columns={columns} />
      </Accordion>

      <Accordion title="Gráficos" defaultOpen={false}>
        <div className="flex flex-col space-y-8 relative">
          <div className="h-[500px] w-full group">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-secondary-700">
                Rutas por {isGeneral ? "Sucursal" : "Distribuidor"}
              </h4>
              <select
                value={topRutas}
                onChange={(e) => setTopRutas(e.target.value)}
                className="text-sm border-secondary-300 rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="5">Top 5</option>
                <option value="10">Top 10</option>
                <option value="20">Top 20</option>
                <option value="all">Todos</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayRutasData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }} style={{ outline: "none" }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150} 
                  tick={(props: any) => {
                    const { x, y, payload } = props;
                    const isActive = selectedItem === payload.value;
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
                            setSelectedItem(selectedItem === payload.value ? null : payload.value);
                          }}
                          style={{ cursor: "pointer", outline: "none" }}
                        >
                          {payload.value}
                        </text>
                      </g>
                    );
                  }} 
                />
                <Tooltip cursor={{ fill: "transparent" }} />
                <Bar 
                  dataKey="rutas" 
                  name="Rutas" 
                  fill="#3b82f6" 
                  radius={[0, 4, 4, 0]}
                  onClick={(data, index, e) => {
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                    setSelectedItem(selectedItem === data.name ? null : data.name);
                  }}
                  style={{ cursor: "pointer", outline: "none" }}
                  activeBar={false}
                >
                  {displayRutasData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={!selectedItem || selectedItem === entry.name ? "#3b82f6" : "#cbd5e1"} 
                      style={{ outline: "none" }}
                    />
                  ))}
                  <LabelList dataKey="rutas" position="right" style={{ fontSize: '11px', fill: '#666' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
