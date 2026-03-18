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

const getShortName = (name: string, allNames: string[]) => {
  if (!name || name === "N/A" || name === "Sin Distribuidor") return name;
  const parts = name.split(" ");
  const firstName = parts[0];
  const duplicates = allNames.filter((n) => n && n.startsWith(firstName));
  if (duplicates.length > 1 && parts.length > 1) {
    return `${firstName} ${parts[1]}`;
  }
  return firstName;
};

interface ZonasProps {
  data: LogisticsData[];
  totalPiezas: number;
  renderIndicators: (title: string, value: number | string) => React.ReactNode;
  CustomTooltip: React.FC<any>;
  isGeneral?: boolean;
}

export default function Zonas({
  data,
  totalPiezas,
  renderIndicators,
  CustomTooltip,
  isGeneral,
}: ZonasProps) {
  const [selectedZonas, setSelectedZonas] = useState<string[]>([]);
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
  const [selectedDistribuidores, setSelectedDistribuidores] = useState<string[]>([]);
  const [chartView, setChartView] = useState<"Totales" | "INTERIOR" | "CAPITAL">("Totales");

  const chartDistribuidoresZonasData = useMemo(() => {
    if (isGeneral) return [];
    
    const counts: Record<string, {
      rutas_CAPITAL: Set<string>;
      rutas_INTERIOR: Set<string>;
      piezas_CAPITAL: number;
      piezas_INTERIOR: number;
    }> = {};

    data.forEach(d => {
      if (selectedDistribuidores.length > 0 && !selectedDistribuidores.includes(d.distribuidor)) return;
      
      const dist = d.distribuidor || "Sin Distribuidor";
      const zona = (d.zona || "").toUpperCase();
      
      if (!counts[dist]) {
        counts[dist] = {
          rutas_CAPITAL: new Set(),
          rutas_INTERIOR: new Set(),
          piezas_CAPITAL: 0,
          piezas_INTERIOR: 0
        };
      }
      
      if (zona === "CAPITAL") {
        if (d.hojaRuta) counts[dist].rutas_CAPITAL.add(d.hojaRuta);
        counts[dist].piezas_CAPITAL += (d.piezasTotal || 0);
      } else if (zona === "INTERIOR") {
        if (d.hojaRuta) counts[dist].rutas_INTERIOR.add(d.hojaRuta);
        counts[dist].piezas_INTERIOR += (d.piezasTotal || 0);
      }
    });

    let result = Object.entries(counts).map(([name, stats]) => ({
      name,
      rutas_CAPITAL: stats.rutas_CAPITAL.size,
      rutas_INTERIOR: stats.rutas_INTERIOR.size,
      piezas_CAPITAL: stats.piezas_CAPITAL,
      piezas_INTERIOR: stats.piezas_INTERIOR,
      total_rutas: stats.rutas_CAPITAL.size + stats.rutas_INTERIOR.size,
      total_piezas: stats.piezas_CAPITAL + stats.piezas_INTERIOR
    })).sort((a, b) => b.total_rutas - a.total_rutas);

    if (selectedDistribuidores.length === 0) {
      result = result.slice(0, 10);
    }

    const allNames = result.map(r => r.name);
    return result.map(d => ({
      ...d,
      shortName: getShortName(d.name, allNames)
    }));
  }, [data, isGeneral, selectedDistribuidores]);

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

  const zonasData = useMemo(() => {
    if (isGeneral) {
      const zonasMap = new Map<string, { [sucursal: string]: Set<string> }>();
      const sucursalesSet = new Set<string>();

      data.forEach((d) => {
        const zona = d.zona || "Sin Zona";
        const sucursal = d.sucursal;
        if (!sucursal || !d.hojaRuta) return;
        sucursalesSet.add(sucursal);

        if (selectedSucursales.length > 0 && !selectedSucursales.includes(sucursal)) return;

        if (!zonasMap.has(zona)) zonasMap.set(zona, {});
        const zonaObj = zonasMap.get(zona)!;
        if (!zonaObj[sucursal]) zonaObj[sucursal] = new Set();
        zonaObj[sucursal].add(d.hojaRuta);
      });

      const chartData = Array.from(zonasMap.entries())
        .map(([zona, sucursalesObj]) => {
          const obj: any = { name: zona, total: 0 };
          Object.entries(sucursalesObj).forEach(([sucursal, rutasSet]) => {
            obj[sucursal] = rutasSet.size;
            obj.total += rutasSet.size;
          });
          return obj;
        })
        .sort((a, b) => b.total - a.total);

      return { data: chartData, sucursales: Array.from(sucursalesSet), activeSucursales: selectedSucursales.length > 0 ? selectedSucursales : Array.from(sucursalesSet), distribuidores: [] };
    } else {
      const counts: Record<
        string,
        { total: number; entregadas: number; noEntregadas: number; rutas: Set<string> }
      > = {};
      const distribuidoresSet = new Set<string>();

      data.forEach((d) => {
        const zona = d.zona || "Sin Zona";
        if (d.distribuidor) distribuidoresSet.add(d.distribuidor);

        if (selectedDistribuidores.length > 0 && !selectedDistribuidores.includes(d.distribuidor)) return;

        if (!counts[zona]) {
          counts[zona] = { total: 0, entregadas: 0, noEntregadas: 0, rutas: new Set() };
        }
        counts[zona].total += d.piezasTotal;
        counts[zona].entregadas += d.piezasEntregadas;
        counts[zona].noEntregadas += d.piezasNoEntregadas;
        if (d.hojaRuta) counts[zona].rutas.add(d.hojaRuta);
      });
      return {
        data: Object.entries(counts)
          .map(([name, stats]) => ({
            name,
            value: stats.rutas.size,
            entregadas: stats.entregadas,
            noEntregadas: stats.noEntregadas,
            rutas: stats.rutas.size,
            piezasTotal: stats.total,
            efectividad:
              stats.total > 0 ? (stats.entregadas / stats.total) * 100 : 0,
          }))
          .sort((a, b) => b.value - a.value),
        sucursales: [],
        distribuidores: Array.from(distribuidoresSet),
      };
    }
  }, [data, isGeneral, selectedSucursales, selectedDistribuidores]);

  const chartData = useMemo(() => {
    if (selectedZonas.length > 0) {
      return zonasData.data.filter((d) => selectedZonas.includes(d.name));
    }
    return zonasData.data.slice(0, 10);
  }, [zonasData, selectedZonas]);

  const chartDataTransformed = useMemo(() => {
    if (!isGeneral) return chartData;
    
    const sucursalesMap = new Map<string, any>();
    
    zonasData.sucursales.forEach(sucursal => {
      if (selectedSucursales.length > 0 && !selectedSucursales.includes(sucursal)) return;
      sucursalesMap.set(sucursal, { name: sucursal, total: 0 });
    });

    chartData.forEach(zonaData => {
      const zonaName = zonaData.name;
      zonasData.sucursales.forEach(sucursal => {
        if (selectedSucursales.length > 0 && !selectedSucursales.includes(sucursal)) return;
        const val = zonaData[sucursal] || 0;
        if (val > 0) {
          const obj = sucursalesMap.get(sucursal);
          obj[zonaName] = val;
          obj.total += val;
        }
      });
    });

    return Array.from(sucursalesMap.values()).sort((a, b) => b.total - a.total);
  }, [chartData, isGeneral, zonasData.sucursales, selectedSucursales]);

  const activeZonas = useMemo(() => chartData.map(d => d.name), [chartData]);

  const columns = isGeneral
    ? [
        { key: "name", label: "Sucursal", align: "left" as const },
        ...activeZonas.map((zona) => ({
          key: zona,
          label: zona,
          align: "center" as const,
          render: (val: number) => val || 0,
        })),
        { key: "total", label: "Total Rutas", align: "center" as const },
      ]
    : [
        { key: "name", label: "Zona", align: "left" as const },
        { key: "rutas", label: "Total Rutas", align: "center" as const },
        { key: "piezasTotal", label: "Total Piezas", align: "center" as const },
        { key: "entregadas", label: "Piezas Entregadas", align: "center" as const },
        { key: "noEntregadas", label: "Piezas No Entregadas", align: "center" as const },
        {
          key: "efectividad",
          label: "% Eficiencia",
          align: "center" as const,
          render: (val: number) => `${val.toFixed(0)}%`,
        },
      ];

  const capitalRutas = zonasData.data.find(d => d.name === "CAPITAL")?.rutas || 0;
  const interiorRutas = zonasData.data.find(d => d.name === "INTERIOR")?.rutas || 0;

  return (
    <div className="space-y-6">
      <Accordion title="Indicadores" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
          {renderIndicators(
            "Total Zonas",
            zonasData.data.length,
          )}
          {isGeneral ? (
            <>
              {renderIndicators(
                "Top Zona",
                zonasData.data[0]?.name || "-",
              )}
              {renderIndicators(
                "Rutas Top Zona",
                zonasData.data[0]?.total?.toLocaleString() || "0",
              )}
            </>
          ) : (
            <>
              {renderIndicators(
                "Rutas Totales CAPITAL",
                capitalRutas.toLocaleString(),
              )}
              {renderIndicators(
                "Rutas Totales INTERIOR",
                interiorRutas.toLocaleString(),
              )}
            </>
          )}
        </div>
      </Accordion>

      <Accordion title="Tabla de Datos" defaultOpen={false}>
        <div className="min-h-[500px]">
          <SortableTable columns={columns} data={isGeneral ? chartDataTransformed : zonasData.data} />
        </div>
      </Accordion>

      <Accordion title="Gráficos" defaultOpen={false}>
        <div className="flex justify-end mb-4 space-x-2">
          {isGeneral ? (
            <>
              <ChartFilter
                options={zonasData.data.map((d) => d.name)}
                selectedOptions={selectedZonas}
                onChange={setSelectedZonas}
                label="Filtrar Zonas"
              />
              <ChartFilter
                options={zonasData.sucursales}
                selectedOptions={selectedSucursales}
                onChange={setSelectedSucursales}
                label="Filtrar Sucursal"
              />
            </>
          ) : (
            <ChartFilter
              options={zonasData.distribuidores}
              selectedOptions={selectedDistribuidores}
              onChange={setSelectedDistribuidores}
              label="Filtrar Distribuidor"
            />
          )}
        </div>
        {isGeneral ? (
          <div className="h-[500px] w-full group">
            <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
              Rutas por Zona en cada Sucursal
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartDataTransformed}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#e2e8f0"
                />
                <XAxis type="number" />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "transparent" }}
                />
                <Legend verticalAlign="top" height={36} />
                {activeZonas.map((zona, index) => (
                  <Bar
                    key={zona}
                    dataKey={zona}
                    name={zona}
                    stackId="a"
                    fill={COLORS[index % COLORS.length]}
                    radius={index === activeZonas.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                  >
                    <LabelList 
                      dataKey={zona} 
                      position="center" 
                      fill="#fff" 
                      fontSize={11} 
                      formatter={(val: number) => val > 0 ? val : ''}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col space-y-8">
            <div className="flex justify-center space-x-2 mb-4">
              {["Totales", "INTERIOR", "CAPITAL"].map((view) => (
                <button
                  key={view}
                  onClick={(e) => { e.stopPropagation(); setChartView(view as any); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    chartView === view ? "bg-primary-600 text-white" : "bg-secondary-100 text-secondary-600 hover:bg-secondary-200"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-[400px] w-full group">
                <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
                  Rutas por Distribuidor (por Zona)
                </h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartDistribuidoresZonasData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" />
                    <YAxis dataKey="shortName" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltipWithFullName />} cursor={{ fill: "transparent" }} />
                    <Legend verticalAlign="top" height={36} />
                    {(chartView === "Totales" || chartView === "INTERIOR") && (
                      <Bar dataKey="rutas_INTERIOR" name="Interior" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="rutas_INTERIOR" position="right" style={{ fontSize: '11px', fill: '#666' }} formatter={(val: number) => val > 0 ? val : ''} />
                      </Bar>
                    )}
                    {(chartView === "Totales" || chartView === "CAPITAL") && (
                      <Bar dataKey="rutas_CAPITAL" name="Capital" fill="#10b981" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="rutas_CAPITAL" position="right" style={{ fontSize: '11px', fill: '#666' }} formatter={(val: number) => val > 0 ? val : ''} />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[400px] w-full group">
                <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
                  Piezas por Distribuidor (por Zona)
                </h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartDistribuidoresZonasData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" />
                    <YAxis dataKey="shortName" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltipWithFullName />} cursor={{ fill: "transparent" }} />
                    <Legend verticalAlign="top" height={36} />
                    {(chartView === "Totales" || chartView === "INTERIOR") && (
                      <Bar dataKey="piezas_INTERIOR" name="Interior" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="piezas_INTERIOR" position="right" style={{ fontSize: '11px', fill: '#666' }} formatter={(val: number) => val > 0 ? val : ''} />
                      </Bar>
                    )}
                    {(chartView === "Totales" || chartView === "CAPITAL") && (
                      <Bar dataKey="piezas_CAPITAL" name="Capital" fill="#10b981" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="piezas_CAPITAL" position="right" style={{ fontSize: '11px', fill: '#666' }} formatter={(val: number) => val > 0 ? val : ''} />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </Accordion>
    </div>
  );
}
