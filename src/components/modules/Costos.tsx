import React, { useMemo, useState, useEffect } from "react";
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
  LineChart,
  Line,
  Legend,
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
  "#14b8a6",
  "#f43f5e",
  "#84cc16",
  "#6366f1",
];

interface CostosProps {
  data: LogisticsData[];
  totalPiezas: number;
  renderIndicators: (title: string, value: number | string) => React.ReactNode;
  CustomTooltip: React.FC<any>;
  isGeneral?: boolean;
  presupuestos: Record<string, number>;
  onPresupuestoChange: (sucursal: string, value: string) => void;
}

export default function Costos({
  data,
  renderIndicators,
  CustomTooltip,
  isGeneral,
  presupuestos,
  onPresupuestoChange,
}: CostosProps) {
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [activeSucursal, setActiveSucursal] = useState<string | null>(null);
  const [showPresupuesto, setShowPresupuesto] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    if (selectedVehicles.length === 0) return data;
    return data.filter(d => selectedVehicles.includes(d.vehiculo || "N/A"));
  }, [data, selectedVehicles]);

  const costosData = useMemo(() => {
    const counts: Record<
      string,
      {
        costoTotal: number;
        piezasEntregadas: number;
        piezasNoEntregadas: number;
        rutas: Set<string>;
        vehiculo: string;
      }
    > = {};
    let totalCosto = 0;
    let totalEntregadas = 0;
    let totalNoEntregadas = 0;
    let totalRutas = new Set<string>();

    filteredData.forEach((d) => {
      const key = isGeneral ? d.sucursal : d.distribuidor;
      if (!counts[key]) {
        counts[key] = {
          costoTotal: 0,
          piezasEntregadas: 0,
          piezasNoEntregadas: 0,
          rutas: new Set(),
          vehiculo: d.vehiculo || "N/A",
        };
      }
      const costo = Math.round(d.costoTotal);
      counts[key].costoTotal += costo;
      counts[key].piezasEntregadas += d.piezasEntregadas;
      counts[key].piezasNoEntregadas += d.piezasNoEntregadas;
      if (d.hojaRuta) {
        counts[key].rutas.add(d.hojaRuta);
        totalRutas.add(d.hojaRuta);
      }

      totalCosto += costo;
      totalEntregadas += d.piezasEntregadas;
      totalNoEntregadas += d.piezasNoEntregadas;
    });

    const entityData = Object.entries(counts)
      .map(([name, stats]) => {
        const pres = presupuestos[name] || 0;
        return {
          name,
          vehiculo: stats.vehiculo,
          costoTotal: stats.costoTotal,
          costoPromedioEntregada:
            stats.piezasEntregadas > 0
              ? Math.round(stats.costoTotal / stats.piezasEntregadas)
              : 0,
          costoPromedioNoEntregada:
            stats.piezasNoEntregadas > 0
              ? Math.round(stats.costoTotal / stats.piezasNoEntregadas)
              : 0,
          promedioCostoSucursal:
            stats.rutas.size > 0
              ? Math.round(stats.costoTotal / stats.rutas.size)
              : 0,
          presupuesto: pres,
          margen: pres - stats.costoTotal,
        };
      })
      .sort((a, b) => b.costoTotal - a.costoTotal);

    return {
      entityData,
      totalCosto,
      promedioEntregada:
        totalEntregadas > 0 ? Math.round(totalCosto / totalEntregadas) : 0,
      promedioNoEntregada:
        totalNoEntregadas > 0 ? Math.round(totalCosto / totalNoEntregadas) : 0,
      promedioCostoSucursal:
        totalRutas.size > 0 ? Math.round(totalCosto / totalRutas.size) : 0,
    };
  }, [filteredData, isGeneral, presupuestos]);

  const chartData = useMemo(() => {
    let filtered = costosData.entityData;
    if (selectedEntities.length > 0) {
      filtered = filtered.filter((d) =>
        selectedEntities.includes(d.name),
      );
    } else {
      filtered = filtered.slice(0, 10);
    }
    return filtered;
  }, [costosData.entityData, selectedEntities]);

  const topZonas = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach((d) => {
      const zona = isGeneral ? d.sucursal : d.zona || "Sin Zona";
      counts[zona] = (counts[zona] || 0) + Math.round(d.costoTotal);
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((z) => z[0]);
  }, [filteredData, isGeneral]);

  const costosPorZonaYFecha = useMemo(() => {
    const datesSet = new Set<string>();
    const dataMap: Record<string, Record<string, number>> = {};

    filteredData.forEach((d) => {
      const fecha = d.fecha || "Sin Fecha";
      const zona = isGeneral ? d.sucursal : d.zona || "Sin Zona";

      if (topZonas.includes(zona)) {
        datesSet.add(fecha);
        if (!dataMap[fecha]) dataMap[fecha] = {};
        dataMap[fecha][zona] =
          (dataMap[fecha][zona] || 0) + Math.round(d.costoTotal);
      }
    });

    const sortedDates = Array.from(datesSet).sort((a, b) => {
      const dateA = new Date(a.split("/").reverse().join("-"));
      const dateB = new Date(b.split("/").reverse().join("-"));
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.localeCompare(b);
    });

    return sortedDates.map((date) => {
      const obj: any = { name: date };
      topZonas.forEach((zona) => {
        obj[zona] = dataMap[date][zona] || 0;
      });
      return obj;
    });
  }, [filteredData, isGeneral, topZonas]);

  const getSubRows = (row: any) => {
    const entityName = row.name;
    const entityData = filteredData.filter(d => 
      isGeneral ? d.sucursal === entityName : d.distribuidor === entityName
    );

    const subRowsMap = new Map<string, any>();
    entityData.forEach(d => {
      const fecha = d.fecha || "Sin Fecha";
      const hojaRuta = d.hojaRuta || "N/A";
      // If general, group by fecha only. If sucursal, group by both.
      const key = isGeneral ? fecha : `${fecha}-${hojaRuta}`;
      
      if (!subRowsMap.has(key)) {
        subRowsMap.set(key, {
          name: isGeneral ? fecha : `${fecha} - ${hojaRuta}`,
          costoTotal: 0,
          costoPromedioEntregada: null,
          promedioCostoSucursal: null,
          vehiculo: null,
        });
      }
      const obj = subRowsMap.get(key);
      obj.costoTotal += Math.round(d.costoTotal);
    });

    return Array.from(subRowsMap.values()).sort((a, b) => {
      const dateA = new Date(a.name.split(" ")[0].split("/").reverse().join("-"));
      const dateB = new Date(b.name.split(" ")[0].split("/").reverse().join("-"));
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.name.localeCompare(b.name);
    });
  };

  const presupuestoColumns = [
    {
      key: "name",
      label: "Sucursal",
      align: "left" as const,
      renderExpanded: (val: any) => <span>{val}</span>,
    },
    {
      key: "costoTotal",
      label: "Costo Total",
      align: "center" as const,
      render: (val: number) => `$${val.toLocaleString()}`,
      renderExpanded: (val: any) => val !== null ? `$${val.toLocaleString()}` : "",
    },
    {
      key: "presupuesto",
      label: "Presupuesto",
      align: "center" as const,
      render: (val: number, row: any) => {
        const numVal = val || 0;
        if (row.name === undefined) {
          return <span className="font-bold">${numVal.toLocaleString()}</span>;
        }
        const isEditing = editingCell === row.name;
        if (isEditing) {
          return (
            <input
              type="number"
              autoFocus
              className="w-24 px-2 py-1 text-right border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={numVal || ""}
              onChange={(e) => onPresupuestoChange(row.name, e.target.value)}
              onBlur={() => setEditingCell(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setEditingCell(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return (
          <div 
            className="cursor-pointer hover:bg-secondary-300 px-2 py-1 rounded transition-colors"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingCell(row.name);
            }}
            title="Doble clic para editar"
          >
            ${numVal.toLocaleString()}
          </div>
        );
      },
      renderExpanded: () => "",
    },
    {
      key: "margen",
      label: "Margen",
      align: "center" as const,
      render: (val: number, row: any) => {
        const numVal = val || 0;
        return (
          <span className={numVal < 0 ? "text-danger-600 font-bold" : "text-primary-600 font-bold"}>
            ${numVal.toLocaleString()}
          </span>
        );
      },
      renderExpanded: () => "",
    }
  ];

  const columns = isGeneral ? [
    {
      key: "name",
      label: "Sucursal",
      align: "left" as const,
      renderExpanded: (val: any) => <span>{val}</span>,
    },
    {
      key: "costoTotal",
      label: "Costo Total",
      align: "center" as const,
      render: (val: number) => `$${val.toLocaleString()}`,
      renderExpanded: (val: any) => val !== null ? `$${val.toLocaleString()}` : "",
    },
    {
      key: "costoPromedioEntregada",
      label: "Promedio Pieza Entregada",
      align: "center" as const,
      render: (val: number) => `$${val.toLocaleString()}`,
      renderExpanded: () => "",
    },
    {
      key: "promedioCostoSucursal",
      label: "Promedio por Ruta",
      align: "center" as const,
      render: (val: number) => `$${val.toLocaleString()}`,
      renderExpanded: () => "",
    },
  ] : [
    {
      key: "name",
      label: "Distribuidor",
      align: "left" as const,
      renderExpanded: (val: any) => <span>{val}</span>,
    },
    {
      key: "vehiculo",
      label: "Tipo de Vehículo",
      align: "left" as const,
      renderExpanded: () => "",
    },
    {
      key: "costoTotal",
      label: "Costo Total",
      align: "center" as const,
      render: (val: number) => `$${val.toLocaleString()}`,
      renderExpanded: (val: any) => val !== null ? `$${val.toLocaleString()}` : "",
    },
    {
      key: "costoPromedioEntregada",
      label: "Promedio Entregada",
      align: "center" as const,
      render: (val: number) => `$${val.toLocaleString()}`,
      renderExpanded: () => "",
    },
    {
      key: "promedioCostoSucursal",
      label: "Costo Promedio por Distribuidor",
      align: "center" as const,
      render: (val: number) => `$${val.toLocaleString()}`,
      renderExpanded: () => "",
    },
  ];

  const CustomCurrencyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length > 0) {
      const fullName = payload[0]?.payload?.name || label;
      return (
        <div className="bg-white p-3 border border-secondary-200 shadow-lg rounded-lg z-50">
          <p className="text-sm font-semibold text-secondary-900 mb-1">
            {fullName}
          </p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              className="text-sm font-medium"
              style={{ color: entry.color || entry.fill }}
            >
              {entry.name || "Costo"}: ${entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };



  return (
    <div className="space-y-6" onClick={() => setActiveSucursal(null)}>
      <Accordion title="Indicadores" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-2">
          {renderIndicators(
            "Costo Total",
            `$${costosData.totalCosto.toLocaleString()}`,
          )}
          {renderIndicators(
            "Promedio por Entregada",
            `$${costosData.promedioEntregada.toLocaleString()}`,
          )}
          {renderIndicators(
            isGeneral ? "Promedio por ruta" : "Promedio por distribuidor",
            `$${costosData.promedioCostoSucursal.toLocaleString()}`,
          )}
        </div>
      </Accordion>

      <Accordion title="Tabla de Datos" defaultOpen={false}>
        <div className="flex justify-end mb-4">
          {isGeneral && (
            <button
              onClick={() => setShowPresupuesto(!showPresupuesto)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              {showPresupuesto ? "Tabla de Costos" : "Presupuesto"}
            </button>
          )}
        </div>
        <div className="min-h-[500px]" onClick={(e) => e.stopPropagation()}>
          <SortableTable 
            columns={showPresupuesto ? presupuestoColumns : columns} 
            data={costosData.entityData} 
            getSubRows={showPresupuesto ? undefined : getSubRows}
            customTotals={{
              costoPromedioEntregada: costosData.promedioEntregada,
              promedioCostoSucursal: costosData.promedioCostoSucursal
            }}
          />
        </div>
      </Accordion>

      <Accordion title="Gráficos" defaultOpen={false}>
        <div className="flex flex-col space-y-8 relative">
          <div className="w-full group mb-12">
            <div className="flex justify-between items-start mb-4">
              <h4 className="text-sm font-semibold text-secondary-700">
                Costo Total por {isGeneral ? "Sucursal" : "Distribuidor"}
              </h4>
              <div className="flex flex-col items-end space-y-2" onClick={(e) => e.stopPropagation()}>
                <ChartFilter
                  options={costosData.entityData.map((d) => d.name)}
                  selectedOptions={selectedEntities}
                  onChange={setSelectedEntities}
                  label={
                    isGeneral ? "Filtrar Sucursales" : "Filtrar Distribuidores"
                  }
                />
                <ChartFilter
                  options={Array.from(new Set(data.map(d => d.vehiculo))).filter((v): v is string => Boolean(v))}
                  selectedOptions={selectedVehicles}
                  onChange={setSelectedVehicles}
                  label="Filtrar Tipo de Vehículo"
                />
              </div>
            </div>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 50, left: 20, bottom: 5 }}
                  style={{ outline: "none" }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis type="number" tickFormatter={(val) => `$${val}`} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={150}
                    tick={(props: any) => {
                      const { x, y, payload } = props;
                      const isActive = activeSucursal === payload.value;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill={isActive ? "#8b5cf6" : "#666"}
                            fontSize={11}
                            fontWeight={isActive ? "bold" : "normal"}
                            onClick={(e) => {
                              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                              setActiveSucursal(activeSucursal === payload.value ? null : String(payload.value));
                            }}
                            style={{ cursor: "pointer", outline: "none" }}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Bar
                    dataKey="costoTotal"
                    name="Costo Total"
                    radius={[0, 4, 4, 0]}
                    onClick={(data, index, e) => {
                      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                      setActiveSucursal(activeSucursal === data.name ? null : data.name);
                    }}
                    style={{ cursor: "pointer", outline: "none" }}
                    activeBar={false}
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={!activeSucursal || activeSucursal === entry.name ? "#8b5cf6" : "#cbd5e1"} 
                        style={{ outline: "none" }}
                      />
                    ))}
                    <LabelList dataKey="costoTotal" position="right" formatter={(val: number) => `$${val.toLocaleString()}`} style={{ fontSize: '11px', fill: '#666' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="w-full group mb-12">
            <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
              {isGeneral ? "Promedio de Costo por Sucursal" : "Costo Promedio por Distribuidor"}
            </h4>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 50, left: 20, bottom: 5 }}
                  style={{ outline: "none" }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis type="number" tickFormatter={(val) => `$${val}`} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={150}
                    tick={(props: any) => {
                      const { x, y, payload } = props;
                      const isActive = activeSucursal === payload.value;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill={isActive ? "#10b981" : "#666"}
                            fontSize={11}
                            fontWeight={isActive ? "bold" : "normal"}
                            onClick={(e) => {
                              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                              setActiveSucursal(activeSucursal === payload.value ? null : String(payload.value));
                            }}
                            style={{ cursor: "pointer", outline: "none" }}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Bar
                    dataKey="promedioCostoSucursal"
                    name="Promedio Costo"
                    radius={[0, 4, 4, 0]}
                    onClick={(data, index, e) => {
                      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                      setActiveSucursal(activeSucursal === data.name ? null : data.name);
                    }}
                    style={{ cursor: "pointer", outline: "none" }}
                    activeBar={false}
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={!activeSucursal || activeSucursal === entry.name ? "#10b981" : "#cbd5e1"} 
                        style={{ outline: "none" }}
                      />
                    ))}
                    <LabelList dataKey="promedioCostoSucursal" position="right" formatter={(val: number) => `$${val.toLocaleString()}`} style={{ fontSize: '11px', fill: '#666' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="w-full group">
            <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
              {isGeneral ? "Evolución de Costos por Sucursal" : "Evolución de Costos por Distribuidor"}
            </h4>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={costosPorZonaYFecha}
                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
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
                  <YAxis tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length > 0) {
                        const activePayloads = activeSucursal 
                          ? payload.filter((p: any) => p.dataKey === activeSucursal)
                          : payload;
                        
                        if (activePayloads.length === 0) return null;

                        return (
                          <div className="bg-white p-3 border border-secondary-200 shadow-lg rounded-lg z-50">
                            <p className="text-sm font-semibold text-secondary-900 mb-2">{label}</p>
                            {activePayloads.map((p: any, i: number) => (
                              <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
                                {p.dataKey}: ${p.value.toLocaleString()}
                              </p>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend 
                    onClick={(e) => {
                      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                      setActiveSucursal(activeSucursal === e.dataKey ? null : String(e.dataKey));
                    }}
                    wrapperStyle={{ cursor: "pointer" }}
                  />
                  {topZonas.map((zona, index) => (
                    <Line
                      key={zona}
                      type="monotone"
                      dataKey={zona}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={!activeSucursal || activeSucursal === zona ? 3 : 1}
                      dot={false}
                      opacity={!activeSucursal || activeSucursal === zona ? 1 : 0.2}
                      activeDot={!activeSucursal || activeSucursal === zona ? { r: 6 } : false}
                      onClick={(e) => {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        setActiveSucursal(activeSucursal === zona ? null : zona);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
