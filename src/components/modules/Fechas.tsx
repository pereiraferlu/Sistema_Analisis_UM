import React, { useMemo, useState } from "react";
import { LogisticsData } from "../../types";
import Accordion from "../Accordion";
import SortableTable from "../SortableTable";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from "recharts";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

interface FechasProps {
  data: LogisticsData[];
  totalPiezas: number;
  renderIndicators: (title: string, value: number | string) => React.ReactNode;
  CustomTooltip: React.FC<any>;
  isGeneral?: boolean;
}

export default function Fechas({
  data,
  renderIndicators,
  CustomTooltip,
  isGeneral,
}: FechasProps) {
  const [chartView, setChartView] = useState<string>("General");
  const [selectedSucursal, setSelectedSucursal] = useState<string | null>(null);

  const fechasData = useMemo(() => {
    const counts: Record<
      string,
      {
        total: number;
        entregadas: number;
        noEntregadas: number;
        entities: Set<string>;
        rutas: Set<string>;
      }
    > = {};

    data.forEach((d) => {
      const fechaStr = d.fecha || "Sin Fecha";
      if (!counts[fechaStr]) {
        counts[fechaStr] = {
          total: 0,
          entregadas: 0,
          noEntregadas: 0,
          entities: new Set(),
          rutas: new Set(),
        };
      }
      counts[fechaStr].total += d.piezasTotal;
      counts[fechaStr].entregadas += d.piezasEntregadas;
      counts[fechaStr].noEntregadas += d.piezasNoEntregadas;

      const entityKey = isGeneral ? d.sucursal : d.distribuidor;
      if (entityKey) {
        counts[fechaStr].entities.add(entityKey);
      }
      if (d.hojaRuta) {
        counts[fechaStr].rutas.add(d.hojaRuta);
      }
    });

    const sortedDates = Object.entries(counts).sort((a, b) => {
      const dateA = new Date(a[0].split("/").reverse().join("-"));
      const dateB = new Date(b[0].split("/").reverse().join("-"));
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateA.getTime() - dateB.getTime();
      }
      return a[0].localeCompare(b[0]);
    });

    return sortedDates.map(([name, stats]) => {
      const dateObj = new Date(name.split("/").reverse().join("-"));
      const dayOfWeek = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("es-ES", { weekday: "long" })
        : "Desconocido";

      return {
        name,
        dayOfWeek: dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
        value: stats.total,
        entregadas: stats.entregadas,
        noEntregadas: stats.noEntregadas,
        activeEntities: stats.entities.size,
        rutas: stats.rutas.size,
        efectividad:
          stats.total > 0 ? (stats.entregadas / stats.total) * 100 : 0,
      };
    });
  }, [data, isGeneral]);

  const generalData = useMemo(() => {
    if (!isGeneral) return { daysPerSucursal: [], evolution: [], sucursales: [] };

    const daysMap = new Map<string, Set<string>>();
    const evolutionMap = new Map<string, { [key: string]: number }>();
    const sucursalesSet = new Set<string>();

    data.forEach((d) => {
      if (!d.fecha || !d.sucursal) return;
      sucursalesSet.add(d.sucursal);

      if (!daysMap.has(d.sucursal)) {
        daysMap.set(d.sucursal, new Set());
      }
      daysMap.get(d.sucursal)!.add(d.fecha);

      if (!evolutionMap.has(d.fecha)) {
        evolutionMap.set(d.fecha, {});
      }
      const dateObj = evolutionMap.get(d.fecha)!;
      if (!dateObj[d.sucursal]) {
        dateObj[d.sucursal] = 0;
      }
      if (d.hojaRuta) {
        // We count unique rutas per date per sucursal. Wait, the previous logic just counted rows or unique rutas?
        // Let's count unique rutas. We need a set per sucursal per date.
      }
    });

    const evolutionMapRutas = new Map<string, { [key: string]: Set<string> }>();
    data.forEach((d) => {
      if (!d.fecha || !d.sucursal || !d.hojaRuta) return;
      if (!evolutionMapRutas.has(d.fecha)) evolutionMapRutas.set(d.fecha, {});
      const dateObj = evolutionMapRutas.get(d.fecha)!;
      if (!dateObj[d.sucursal]) dateObj[d.sucursal] = new Set();
      dateObj[d.sucursal].add(d.hojaRuta);
    });

    const daysPerSucursal = Array.from(daysMap.entries())
      .map(([name, daysSet]) => ({
        name,
        dias: daysSet.size,
      }))
      .sort((a, b) => b.dias - a.dias);

    const evolution = Array.from(evolutionMapRutas.entries())
      .map(([fecha, sucursalesObj]) => {
        const obj: any = { fecha };
        Object.entries(sucursalesObj).forEach(([sucursal, rutasSet]) => {
          obj[sucursal] = rutasSet.size;
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

    return { daysPerSucursal, evolution, sucursales: Array.from(sucursalesSet) };
  }, [data, isGeneral]);

  const dayOfWeekData = useMemo(() => {
    const days: Record<string, { totalEntities: number; count: number }> = {};
    const dayOrder = [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ];

    fechasData.forEach((d) => {
      if (d.dayOfWeek !== "Desconocido") {
        if (!days[d.dayOfWeek]) {
          days[d.dayOfWeek] = { totalEntities: 0, count: 0 };
        }
        days[d.dayOfWeek].totalEntities += d.activeEntities;
        days[d.dayOfWeek].count += 1;
      }
    });

    return Object.entries(days)
      .map(([name, stats]) => ({
        name,
        avgEntities: Math.round(stats.totalEntities / stats.count),
      }))
      .sort((a, b) => dayOrder.indexOf(a.name) - dayOrder.indexOf(b.name));
  }, [fechasData]);

  const columns = isGeneral ? [
    { key: "name", label: "Sucursal", align: "left" as const },
    { key: "dias", label: "Días con Rutas", align: "center" as const },
  ] : [
    { key: "name", label: "Fecha", align: "left" as const },
    { key: "dayOfWeek", label: "Día", align: "left" as const },
    { key: "rutas", label: "Total Rutas", align: "center" as const },
    { key: "value", label: "Total Piezas", align: "center" as const },
    { key: "entregadas", label: "Piezas Entregadas", align: "center" as const },
    { key: "noEntregadas", label: "Piezas No Entregadas", align: "center" as const },
    {
      key: "efectividad",
      label: "% Eficiencia",
      align: "center" as const,
      render: (val: number) => `${val.toFixed(0)}%`,
    },
  ];

  const peakDate = [...fechasData].sort(
    (a, b) => b.entregadas - a.entregadas,
  )[0];
  const peakEntitiesDate = [...fechasData].sort(
    (a, b) => b.activeEntities - a.activeEntities,
  )[0];
  const peakRutasDate = [...fechasData].sort(
    (a, b) => b.rutas - a.rutas,
  )[0];

  return (
    <div className="space-y-6" onClick={() => setSelectedSucursal(null)}>
      <Accordion title="Indicadores" defaultOpen={false}>
        <div className={`grid grid-cols-1 md:grid-cols-2 ${isGeneral ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-6 mb-2`}>
          {renderIndicators("Días Operativos", fechasData.length)}
          {!isGeneral && renderIndicators(
            "Día con más rutas",
            peakRutasDate
              ? `${peakRutasDate.name} (${peakRutasDate.rutas})`
              : "-",
          )}
          {renderIndicators(
            isGeneral ? "Pico de Entregas" : "Día con más entregas",
            peakDate
              ? `${peakDate.name} (${peakDate.entregadas.toLocaleString()})`
              : "-",
          )}
          {renderIndicators(
            isGeneral ? "Pico de Sucursales" : "Día con más distribuidores",
            peakEntitiesDate
              ? `${peakEntitiesDate.name} (${peakEntitiesDate.activeEntities})`
              : "-",
          )}
        </div>
      </Accordion>

      <Accordion title="Tabla de Datos" defaultOpen={false}>
        <div className="min-h-[500px]" onClick={(e) => e.stopPropagation()}>
          <SortableTable 
            columns={columns} 
            data={isGeneral ? generalData.daysPerSucursal : fechasData} 
            customTotals={isGeneral ? { dias: fechasData.length } : undefined}
          />
        </div>
      </Accordion>

      <Accordion title="Gráficos" defaultOpen={false}>
        <div className="flex flex-col space-y-8">
          {isGeneral ? (
            <>
              <div className="h-[400px] w-full">
                <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
                  Cantidad de Días con Rutas por Sucursal
                </h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={generalData.daysPerSucursal} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} interval={0} />
                    <YAxis />
                    <Tooltip cursor={false} />
                    <Bar dataKey="dias" name="Días" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="dias" position="top" style={{ fontSize: '11px', fill: '#666' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="h-[400px] w-full group mb-12">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-semibold text-secondary-700">
                    Evolución de Rutas por Fecha
                  </h4>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={fechasData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} interval={0} />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="rutas"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      name="Rutas"
                      activeDot={{ r: 6, fill: "#7c3aed" }}
                    >
                      <LabelList dataKey="rutas" position="top" style={{ fontSize: '11px', fill: '#666' }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="h-[400px] w-full group">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-semibold text-secondary-700">
                    Evolución de Piezas por Fecha
                  </h4>
                  <div className="flex space-x-2">
                    {["General", "Totales", "Entregadas", "No Entregadas"].map(
                      (view) => (
                        <button
                          key={view}
                          onClick={(e) => { e.stopPropagation(); setChartView(view); }}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                            chartView === view
                              ? "bg-primary-600 text-white"
                              : "bg-secondary-100 text-secondary-600 hover:bg-secondary-200"
                          }`}
                        >
                          {view}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  {chartView === "General" ? (
                    <LineChart
                      data={fechasData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="top" height={36} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name="Totales"
                        activeDot={{ r: 6, fill: "#2563eb" }}
                      >
                        <LabelList dataKey="value" position="top" style={{ fontSize: '11px', fill: '#666' }} />
                      </Line>
                      <Line
                        type="monotone"
                        dataKey="entregadas"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name="Entregadas"
                        activeDot={{ r: 6, fill: "#059669" }}
                      >
                        <LabelList dataKey="entregadas" position="top" style={{ fontSize: '11px', fill: '#666' }} />
                      </Line>
                      <Line
                        type="monotone"
                        dataKey="noEntregadas"
                        stroke="#ef4444"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name="No Entregadas"
                        activeDot={{ r: 6, fill: "#dc2626" }}
                      >
                        <LabelList dataKey="noEntregadas" position="top" style={{ fontSize: '11px', fill: '#666' }} />
                      </Line>
                    </LineChart>
                  ) : (
                    <AreaChart
                      data={fechasData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <defs>
                        <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor={
                              chartView === "Totales"
                                ? "#3b82f6"
                                : chartView === "Entregadas"
                                  ? "#10b981"
                                  : "#ef4444"
                            }
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={
                              chartView === "Totales"
                                ? "#3b82f6"
                                : chartView === "Entregadas"
                                  ? "#10b981"
                                  : "#ef4444"
                            }
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey={
                          chartView === "Totales"
                            ? "value"
                            : chartView === "Entregadas"
                              ? "entregadas"
                              : "noEntregadas"
                        }
                        stroke={
                          chartView === "Totales"
                            ? "#3b82f6"
                            : chartView === "Entregadas"
                              ? "#10b981"
                              : "#ef4444"
                        }
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorArea)"
                        name={chartView}
                        activeDot={{
                          r: 6,
                          fill:
                            chartView === "Totales"
                              ? "#2563eb"
                              : chartView === "Entregadas"
                                ? "#059669"
                                : "#dc2626",
                        }}
                      >
                        <LabelList 
                          dataKey={
                            chartView === "Totales"
                              ? "value"
                              : chartView === "Entregadas"
                                ? "entregadas"
                                : "noEntregadas"
                          } 
                          position="top" 
                          style={{ fontSize: '11px', fill: '#666' }} 
                        />
                      </Area>
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="h-[300px] w-full">
                  <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
                    Cantidad de Distribuidores por Fecha
                  </h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={fechasData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="activeEntities"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name="Distribuidores"
                        activeDot={{ r: 6, fill: "#7c3aed" }}
                      >
                        <LabelList dataKey="activeEntities" position="top" style={{ fontSize: '11px', fill: '#666' }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="h-[300px] w-full">
                  <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
                    Promedio de Distribuidores por Día de la Semana
                  </h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={dayOfWeekData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 25 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="avgEntities"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name="Promedio"
                        activeDot={{ r: 6, fill: "#d97706" }}
                      >
                        <LabelList dataKey="avgEntities" position="top" style={{ fontSize: '11px', fill: '#666' }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </Accordion>
    </div>
  );
}
