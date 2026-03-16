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
  Legend,
  LabelList,
} from "recharts";
import SortableTable from "../SortableTable";
import Accordion from "../Accordion";
import ChartFilter from "../ChartFilter";

interface PiezasProps {
  data: LogisticsData[];
  totalPiezas: number;
  renderIndicators: (title: string, value: number | string) => React.ReactNode;
  CustomTooltip: React.FC<any>;
  isGeneral: boolean;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

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

export default function Piezas({
  data,
  totalPiezas,
  renderIndicators,
  CustomTooltip,
  isGeneral,
}: PiezasProps) {
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "Totales",
    "Entregadas",
    "No Entregadas",
    "Bultos Entregados",
    "Bultos No Entregados"
  ]);
  const [selectedNovedadEntity, setSelectedNovedadEntity] = useState<string | null>(null);
  const [showNovedadesTable, setShowNovedadesTable] = useState(false);
  const [chartView, setChartView] = useState<"Totales" | "INTERIOR" | "CAPITAL">("Totales");

  const METRIC_OPTIONS = [
    "Totales",
    "Entregadas",
    "No Entregadas",
    "Bultos Entregados",
    "Bultos No Entregados"
  ];

  const chartSucursalesZonasData = useMemo(() => {
    if (!isGeneral) return [];
    
    const counts: Record<string, {
      rutas_CAPITAL: Set<string>;
      rutas_INTERIOR: Set<string>;
      piezas_CAPITAL: number;
      piezas_INTERIOR: number;
    }> = {};

    data.forEach(d => {
      if (selectedEntities.length > 0 && !selectedEntities.includes(d.sucursal)) return;
      if (selectedVehicles.length > 0 && !selectedVehicles.includes(d.vehiculo || "N/A")) return;
      
      const suc = d.sucursal || "Sin Sucursal";
      const zona = (d.zona || "").toUpperCase();
      
      if (!counts[suc]) {
        counts[suc] = {
          rutas_CAPITAL: new Set(),
          rutas_INTERIOR: new Set(),
          piezas_CAPITAL: 0,
          piezas_INTERIOR: 0
        };
      }
      
      if (zona === "CAPITAL") {
        if (d.hojaRuta) counts[suc].rutas_CAPITAL.add(d.hojaRuta);
        counts[suc].piezas_CAPITAL += (d.piezasTotal || 0);
      } else if (zona === "INTERIOR") {
        if (d.hojaRuta) counts[suc].rutas_INTERIOR.add(d.hojaRuta);
        counts[suc].piezas_INTERIOR += (d.piezasTotal || 0);
      }
    });

    let result = Object.entries(counts).map(([name, stats]) => ({
      name,
      shortName: name,
      rutas_CAPITAL: stats.rutas_CAPITAL.size,
      rutas_INTERIOR: stats.rutas_INTERIOR.size,
      piezas_CAPITAL: stats.piezas_CAPITAL,
      piezas_INTERIOR: stats.piezas_INTERIOR,
      total_rutas: stats.rutas_CAPITAL.size + stats.rutas_INTERIOR.size,
      total_piezas: stats.piezas_CAPITAL + stats.piezas_INTERIOR
    })).sort((a, b) => b.total_rutas - a.total_rutas);

    if (selectedEntities.length === 0) {
      result = result.slice(0, 10);
    }

    return result;
  }, [data, isGeneral, selectedEntities, selectedVehicles]);

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

  const filteredData = useMemo(() => {
    if (selectedVehicles.length === 0) return data;
    return data.filter(d => selectedVehicles.includes(d.vehiculo || "N/A"));
  }, [data, selectedVehicles]);

  const piezasData = useMemo(() => {
    const map = new Map<string, { total: number; entregadas: number; noEntregadas: number; bultosEntregados: number; bultosNoEntregados: number }>();
    filteredData.forEach((d) => {
      const key = isGeneral ? d.sucursal : d.distribuidor;
      if (!map.has(key)) {
        map.set(key, { total: 0, entregadas: 0, noEntregadas: 0, bultosEntregados: 0, bultosNoEntregados: 0 });
      }
      const obj = map.get(key)!;
      obj.total += d.piezasTotal;
      obj.entregadas += d.piezasEntregadas;
      obj.noEntregadas += d.piezasNoEntregadas;
      obj.bultosEntregados += d.bultosEntregados || 0;
      obj.bultosNoEntregados += d.bultosDevueltos || 0;
    });

    const allNames = Array.from(map.keys());

    return Array.from(map.entries())
      .map(([name, obj]) => ({
        name: isGeneral ? name : getShortName(name, allNames),
        originalName: name,
        total: obj.total,
        entregadas: obj.entregadas,
        noEntregadas: obj.noEntregadas,
        bultosEntregados: obj.bultosEntregados,
        bultosNoEntregados: obj.bultosNoEntregados,
        efectividad: obj.total > 0 ? (obj.entregadas / obj.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredData, isGeneral]);

  const displayPiezasData = useMemo(() => {
    let filtered = piezasData;
    if (selectedEntities.length > 0) {
      filtered = filtered.filter((d) => selectedEntities.includes(d.originalName));
    } else {
      filtered = filtered.slice(0, 10);
    }
    return filtered;
  }, [piezasData, selectedEntities]);

  const evolutionData = useMemo(() => {
    const map = new Map<string, { total: number; entregadas: number; noEntregadas: number; bultosEntregados: number; bultosNoEntregados: number }>();
    filteredData.forEach((d) => {
      if (!d.fecha) return;
      if (!map.has(d.fecha)) {
        map.set(d.fecha, { total: 0, entregadas: 0, noEntregadas: 0, bultosEntregados: 0, bultosNoEntregados: 0 });
      }
      const dateObj = map.get(d.fecha)!;
      dateObj.total += d.piezasTotal;
      dateObj.entregadas += d.piezasEntregadas;
      dateObj.noEntregadas += d.piezasNoEntregadas;
      dateObj.bultosEntregados += d.bultosEntregados || 0;
      dateObj.bultosNoEntregados += d.bultosDevueltos || 0;
    });

    return Array.from(map.entries())
      .map(([fecha, obj]) => ({
        fecha,
        ...obj,
      }))
      .sort((a, b) => {
        const [dayA, monthA, yearA] = a.fecha.split("/");
        const [dayB, monthB, yearB] = b.fecha.split("/");
        return (
          new Date(+yearA, +monthA - 1, +dayA).getTime() -
          new Date(+yearB, +monthB - 1, +dayB).getTime()
        );
      });
  }, [data, isGeneral]);

  const totalEntregadas = piezasData.reduce((acc, curr) => acc + curr.entregadas, 0);
  const totalNoEntregadas = piezasData.reduce((acc, curr) => acc + curr.noEntregadas, 0);
  const totalBultosEntregados = piezasData.reduce((acc, curr) => acc + curr.bultosEntregados, 0);
  const totalBultosNoEntregados = piezasData.reduce((acc, curr) => acc + curr.bultosNoEntregados, 0);

  const novedadesData = useMemo(() => {
    const map = new Map<string, { total: number; conNovedad: number; sinNovedad: number; fechas: Map<string, { total: number; conNovedad: number; sinNovedad: number }> }>();
    filteredData.forEach((d) => {
      const key = isGeneral ? d.sucursal : d.distribuidor;
      if (!map.has(key)) {
        map.set(key, { total: 0, conNovedad: 0, sinNovedad: 0, fechas: new Map() });
      }
      const obj = map.get(key)!;
      obj.total += d.piezasTotal;
      obj.conNovedad += d.visitadasNovedad || 0;
      obj.sinNovedad += d.noVisitadas || 0;

      if (d.fecha) {
        if (!obj.fechas.has(d.fecha)) {
          obj.fechas.set(d.fecha, { total: 0, conNovedad: 0, sinNovedad: 0 });
        }
        const dateObj = obj.fechas.get(d.fecha)!;
        dateObj.total += d.piezasTotal;
        dateObj.conNovedad += d.visitadasNovedad || 0;
        dateObj.sinNovedad += d.noVisitadas || 0;
      }
    });

    const allNames = Array.from(map.keys());

    return Array.from(map.entries())
      .map(([name, obj]) => ({
        name: isGeneral ? name : getShortName(name, allNames),
        originalName: name,
        total: obj.total,
        conNovedad: obj.conNovedad,
        sinNovedad: obj.sinNovedad,
        pctSinNovedad: obj.total > 0 ? (obj.sinNovedad / obj.total) * 100 : 0,
        fechas: Array.from(obj.fechas.entries()).map(([fecha, fObj]) => ({
          name: fecha,
          fecha,
          total: fObj.total,
          conNovedad: fObj.conNovedad,
          sinNovedad: fObj.sinNovedad,
          pctSinNovedad: fObj.total > 0 ? (fObj.sinNovedad / fObj.total) * 100 : 0,
        })).sort((a, b) => {
          const [dayA, monthA, yearA] = a.fecha.split("/");
          const [dayB, monthB, yearB] = b.fecha.split("/");
          return new Date(+yearA, +monthA - 1, +dayA).getTime() - new Date(+yearB, +monthB - 1, +dayB).getTime();
        })
      }))
      .sort((a, b) => b.sinNovedad - a.sinNovedad);
  }, [filteredData, isGeneral]);

  const novedadesIndicatorsData = useMemo(() => {
    return novedadesData.filter(d => d.sinNovedad > 0);
  }, [novedadesData]);

  const getSubRowsPiezas = (row: any) => {
    const entityData = filteredData.filter(d => (isGeneral ? d.sucursal : d.distribuidor) === row.originalName);
    const dateMap = new Map<string, any>();
    entityData.forEach(d => {
      if (!d.fecha) return;
      if (!dateMap.has(d.fecha)) {
        dateMap.set(d.fecha, {
          name: d.fecha,
          total: 0,
          entregadas: 0,
          noEntregadas: 0,
          bultosEntregados: 0,
          bultosNoEntregados: 0,
        });
      }
      const obj = dateMap.get(d.fecha);
      obj.total += d.piezasTotal;
      obj.entregadas += d.piezasEntregadas;
      obj.noEntregadas += d.piezasNoEntregadas;
      obj.bultosEntregados += d.bultosEntregados || 0;
      obj.bultosNoEntregados += d.bultosDevueltos || 0;
    });
    return Array.from(dateMap.values()).map(obj => ({
      ...obj,
      efectividad: obj.total > 0 ? (obj.entregadas / obj.total) * 100 : 0
    })).sort((a, b) => {
      const [dayA, monthA, yearA] = a.name.split("/");
      const [dayB, monthB, yearB] = b.name.split("/");
      return new Date(+yearA, +monthA - 1, +dayA).getTime() - new Date(+yearB, +monthB - 1, +dayB).getTime();
    });
  };

  const columns = [
    { key: "name", label: isGeneral ? "Sucursal" : "Distribuidor", align: "left" as const, renderExpanded: (val: any) => <span className="pl-6 font-medium">{val}</span> },
    { key: "total", label: "Total Piezas", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "entregadas", label: "Piezas Entregadas", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "noEntregadas", label: "Piezas No Entregadas", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "bultosEntregados", label: "Bultos Entregados", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "bultosNoEntregados", label: "Bultos No Entregados", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "efectividad", label: "% Efectividad", align: "center" as const, render: (val: number) => `${val.toFixed(0)}%`, renderExpanded: (val: number) => `${val.toFixed(0)}%` },
  ];

  const novedadesColumns = [
    { key: "name", label: isGeneral ? "Sucursal" : "Distribuidor", align: "left" as const, renderExpanded: (val: any) => <span className="pl-6 font-medium">{val}</span> },
    { key: "total", label: "Total Piezas", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "conNovedad", label: "Con Novedad", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "sinNovedad", label: "Sin Novedad", align: "center" as const, renderExpanded: (val: any) => val },
    { key: "pctSinNovedad", label: "% Sin Novedad", align: "center" as const, render: (val: number) => `${val.toFixed(0)}%`, renderExpanded: (val: number) => `${val.toFixed(0)}%` },
  ];

  const selectedEntityData = novedadesIndicatorsData.find(e => e.name === selectedNovedadEntity);
  const unselectedEntities = novedadesIndicatorsData.filter(e => e.name !== selectedNovedadEntity);

  return (
    <div className="space-y-6" onClick={() => setSelectedItem(null)}>
      <Accordion title="Indicadores" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {renderIndicators("Total Piezas", totalPiezas)}
          {renderIndicators("Entregadas", totalEntregadas)}
          {renderIndicators("No Entregadas", totalNoEntregadas)}
          {renderIndicators("% Efectividad", `${((totalEntregadas / (totalPiezas || 1)) * 100).toFixed(0)}%`)}
        </div>
      </Accordion>

      <Accordion title="Tabla de Datos" defaultOpen={false}>
        <SortableTable data={piezasData} columns={columns} getSubRows={getSubRowsPiezas} />
      </Accordion>

      <Accordion title="Novedades" defaultOpen={false}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-normal text-secondary-900">
              {isGeneral ? "Sucursales sin Novedad" : "Distribuidores sin Novedad"}
            </h3>
            <button
              onClick={() => setShowNovedadesTable(!showNovedadesTable)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              {showNovedadesTable ? "Indicadores" : "Tabla de Datos de Novedades"}
            </button>
          </div>

          {!showNovedadesTable ? (
            <div className="flex flex-col space-y-4">
              {selectedEntityData && (
                <div className="w-full animate-in fade-in slide-in-from-top-2">
                  <div
                    onClick={() => setSelectedNovedadEntity(null)}
                    className="p-3 rounded-lg border-2 cursor-pointer transition-all border-primary-500 bg-primary-50 flex justify-between items-center shadow-sm"
                  >
                    <div className="text-sm font-bold text-primary-700 uppercase tracking-wider truncate mr-2">
                      {selectedEntityData.name}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-primary-600 font-medium hidden sm:inline">Sin novedad:</span>
                      <span className="text-lg font-black text-primary-900">
                        {selectedEntityData.sinNovedad.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-xl border border-secondary-200 overflow-hidden mt-4 shadow-sm">
                    <SortableTable 
                      data={selectedEntityData.fechas.filter(f => f.sinNovedad > 0)} 
                      columns={[
                        { key: "fecha", label: "Fecha", align: "left" as const },
                        { key: "total", label: "Total Piezas", align: "center" as const },
                        { key: "conNovedad", label: "Con Novedad", align: "center" as const },
                        { key: "sinNovedad", label: "Sin Novedad", align: "center" as const },
                        { key: "pctSinNovedad", label: "% Sin Novedad", align: "center" as const, render: (val: number) => `${val.toFixed(0)}%` },
                      ]} 
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {unselectedEntities.slice(0, 20).map((entity, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedNovedadEntity(entity.name)}
                    className="p-3 rounded-lg border cursor-pointer transition-all border-secondary-200 bg-white hover:border-primary-300 hover:shadow-md flex justify-between items-center shadow-sm group"
                  >
                    <div className="text-xs font-semibold text-secondary-700 uppercase tracking-wider truncate mr-2 group-hover:text-primary-700 transition-colors">
                      {entity.name}
                    </div>
                    <div className="text-base font-bold text-secondary-900 group-hover:text-primary-700 transition-colors">
                      {entity.sinNovedad.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-secondary-200 overflow-hidden">
              <SortableTable 
                data={novedadesData} 
                columns={novedadesColumns} 
                getSubRows={(row) => row.fechas}
              />
            </div>
          )}
        </div>
      </Accordion>

      <Accordion title="Gráficos" defaultOpen={false}>
        <div className="flex flex-col space-y-8 relative">
          {isGeneral ? (
            <div className="flex flex-col space-y-8">
              <div className="flex justify-between items-start mb-4">
                <div className="flex space-x-2">
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
                <div className="flex items-center space-x-4" onClick={(e) => e.stopPropagation()}>
                  <ChartFilter
                    options={piezasData.map((d) => d.originalName)}
                    selectedOptions={selectedEntities}
                    onChange={setSelectedEntities}
                    label="Filtrar Sucursales"
                  />
                  <ChartFilter
                    options={Array.from(new Set(data.map(d => d.vehiculo))).filter((v): v is string => Boolean(v))}
                    selectedOptions={selectedVehicles}
                    onChange={setSelectedVehicles}
                    label="Filtrar Tipo de Vehículo"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="h-[400px] w-full group">
                  <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
                    Rutas por Sucursal (por Zona)
                  </h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartSucursalesZonasData}
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
                    Piezas por Sucursal (por Zona)
                  </h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartSucursalesZonasData}
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
          ) : (
            <div className="h-[400px] w-full group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col space-y-2">
                  <h4 className="text-sm font-semibold text-secondary-700">
                    Piezas por Distribuidor
                  </h4>
                  <ChartFilter
                    options={METRIC_OPTIONS}
                    selectedOptions={selectedMetrics}
                    onChange={setSelectedMetrics}
                    label="Filtrar Métricas"
                  />
                </div>
                <div className="flex flex-col items-end space-y-2" onClick={(e) => e.stopPropagation()}>
                  <ChartFilter
                    options={piezasData.map((d) => d.originalName)}
                    selectedOptions={selectedEntities}
                    onChange={setSelectedEntities}
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
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayPiezasData} layout="vertical" margin={{ left: 50, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
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
                            fill={isActive ? COLORS[0] : "#666"}
                            fontSize={11}
                            fontWeight={isActive ? "bold" : "normal"}
                            onClick={(e) => {
                              if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                              setSelectedItem(selectedItem === payload.value ? null : String(payload.value));
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  {selectedMetrics.includes("Totales") && (
                    <Bar 
                      dataKey="total" 
                      name="Total"
                      radius={[0, 4, 4, 0]}
                      onClick={(data, index, e) => {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        setSelectedItem(selectedItem === data.name ? null : data.name);
                      }}
                      style={{ cursor: "pointer" }}
                      activeBar={false}
                    >
                      {displayPiezasData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={!selectedItem || selectedItem === entry.name ? COLORS[0] : "#cbd5e1"}
                        />
                      ))}
                      <LabelList dataKey="total" position="right" style={{ fontSize: '11px', fill: '#666' }} />
                    </Bar>
                  )}
                  {selectedMetrics.includes("Entregadas") && (
                    <Bar 
                      dataKey="entregadas" 
                      name="Entregadas"
                      radius={[0, 4, 4, 0]}
                      onClick={(data, index, e) => {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        setSelectedItem(selectedItem === data.name ? null : data.name);
                      }}
                      style={{ cursor: "pointer" }}
                      activeBar={false}
                    >
                      {displayPiezasData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={!selectedItem || selectedItem === entry.name ? COLORS[1] : "#cbd5e1"}
                        />
                      ))}
                      {selectedMetrics.length === 1 && <LabelList dataKey="entregadas" position="right" style={{ fontSize: '11px', fill: '#666' }} />}
                    </Bar>
                  )}
                  {selectedMetrics.includes("No Entregadas") && (
                    <Bar 
                      dataKey="noEntregadas" 
                      name="No Entregadas"
                      radius={[0, 4, 4, 0]}
                      onClick={(data, index, e) => {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        setSelectedItem(selectedItem === data.name ? null : data.name);
                      }}
                      style={{ cursor: "pointer" }}
                      activeBar={false}
                    >
                      {displayPiezasData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={!selectedItem || selectedItem === entry.name ? COLORS[2] : "#cbd5e1"}
                        />
                      ))}
                      {selectedMetrics.length === 1 && <LabelList dataKey="noEntregadas" position="right" style={{ fontSize: '11px', fill: '#666' }} />}
                    </Bar>
                  )}
                  {selectedMetrics.includes("Bultos Entregados") && (
                    <Bar 
                      dataKey="bultosEntregados" 
                      name="Bultos Entregados"
                      radius={[0, 4, 4, 0]}
                      onClick={(data, index, e) => {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        setSelectedItem(selectedItem === data.name ? null : data.name);
                      }}
                      style={{ cursor: "pointer" }}
                      activeBar={false}
                    >
                      {displayPiezasData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={!selectedItem || selectedItem === entry.name ? COLORS[3] : "#cbd5e1"}
                        />
                      ))}
                      {selectedMetrics.length === 1 && <LabelList dataKey="bultosEntregados" position="right" style={{ fontSize: '11px', fill: '#666' }} />}
                    </Bar>
                  )}
                  {selectedMetrics.includes("Bultos No Entregados") && (
                    <Bar 
                      dataKey="bultosNoEntregados" 
                      name="Bultos No Entregadas"
                      radius={[0, 4, 4, 0]}
                      onClick={(data, index, e) => {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        setSelectedItem(selectedItem === data.name ? null : data.name);
                      }}
                      style={{ cursor: "pointer" }}
                      activeBar={false}
                    >
                      {displayPiezasData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={!selectedItem || selectedItem === entry.name ? COLORS[4] : "#cbd5e1"}
                        />
                      ))}
                      {selectedMetrics.length === 1 && <LabelList dataKey="bultosNoEntregados" position="right" style={{ fontSize: '11px', fill: '#666' }} />}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="h-[400px] w-full mt-24">
            <h4 className="text-center text-sm font-semibold text-secondary-700 mb-4">
              Evolución de Piezas por Fecha
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke={COLORS[0]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="entregadas"
                  name="Entregadas"
                  stroke={COLORS[1]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="noEntregadas"
                  name="No Entregadas"
                  stroke={COLORS[2]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
