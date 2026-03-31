import React, { useMemo, useState } from "react";
import { LogisticsData } from "../../types";
import Accordion from "../Accordion";
import { 
  Calendar, 
  DollarSign, 
  Package, 
  Users, 
  Filter, 
  X, 
  BarChart3,
  TrendingUp,
  ArrowRight
} from "lucide-react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
  LabelList,
} from "recharts";

interface HistorialProps {
  data: LogisticsData[];
  currentMonthData: LogisticsData[];
  renderIndicators: (title: string, value: number | string, icon?: React.ReactNode) => React.ReactNode;
  isGeneral?: boolean;
  selectedSucursal?: string;
  filterDay: number | null;
  setFilterDay: (day: number | null) => void;
  showCurrentMonth: boolean;
  setShowCurrentMonth: (show: boolean) => void;
}

export default function Historial({
  data,
  currentMonthData,
  renderIndicators,
  isGeneral,
  selectedSucursal,
  filterDay,
  setFilterDay,
  showCurrentMonth,
  setShowCurrentMonth,
}: HistorialProps) {
  const [isFiltering, setIsFiltering] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const maxDayInCurrentMonth = useMemo(() => {
    if (currentMonthData.length === 0) return null;
    return Math.max(...currentMonthData.map(d => {
      const parts = d.fecha.split("-");
      return parts.length >= 1 ? parseInt(parts[0]) : 0;
    }));
  }, [currentMonthData]);

  const currentMonthLabel = useMemo(() => {
    if (currentMonthData.length === 0) return null;
    const firstDate = currentMonthData[0].fecha;
    const parts = firstDate.split("-");
    if (parts.length < 3) return null;
    return `${parts[1]}-${parts[2]}`;
  }, [currentMonthData]);

  const filteredData = useMemo(() => {
    if (filterDay === null) return data;
    return data.filter((d) => {
      const parts = d.fecha.split("-");
      if (parts.length < 3) return false;
      const day = parseInt(parts[0]);
      return day <= filterDay;
    });
  }, [data, filterDay]);

  const monthlyStats = useMemo(() => {
    const stats: Record<string, { pieces: number; routes: Set<string>; cost: number; distributors: Set<string> }> = {};

    filteredData.forEach((d) => {
      const parts = d.fecha.split("-");
      if (parts.length < 3) return;
      const monthYear = `${parts[1]}-${parts[2]}`; // MM-AA

      if (!stats[monthYear]) {
        stats[monthYear] = {
          pieces: 0,
          routes: new Set(),
          cost: 0,
          distributors: new Set(),
        };
      }

      stats[monthYear].pieces += d.piezasTotal;
      if (d.hojaRuta) stats[monthYear].routes.add(d.hojaRuta);
      stats[monthYear].cost += d.costoTotal;
      if (d.distribuidor) stats[monthYear].distributors.add(d.distribuidor);
    });

    const sortedMonths = Object.keys(stats).sort((a, b) => {
      const [mA, yA] = a.split("-").map(Number);
      const [mB, yB] = b.split("-").map(Number);
      if (yA !== yB) return yA - yB;
      return mA - mB;
    });

    return sortedMonths.map((m) => ({
      month: m,
      ...stats[m],
      routeCount: stats[m].routes.size,
      distributorCount: stats[m].distributors.size,
    }));
  }, [filteredData]);

  const combinedStats = useMemo(() => {
    const stats = [...monthlyStats];

    if (showCurrentMonth && currentMonthData.length > 0 && currentMonthLabel) {
      const filteredCurrent = filterDay === null 
        ? currentMonthData 
        : currentMonthData.filter(d => {
            const parts = d.fecha.split("-");
            return parts.length >= 1 && parseInt(parts[0]) <= filterDay;
          });

      const currentStats = {
        month: currentMonthLabel,
        pieces: 0,
        routes: new Set<string>(),
        cost: 0,
        distributors: new Set<string>(),
        isCurrent: true
      };

      filteredCurrent.forEach(d => {
        currentStats.pieces += d.piezasTotal;
        if (d.hojaRuta) currentStats.routes.add(d.hojaRuta);
        currentStats.cost += d.costoTotal;
        if (d.distribuidor) currentStats.distributors.add(d.distribuidor);
      });

      stats.push({
        month: currentMonthLabel,
        pieces: currentStats.pieces,
        cost: currentStats.cost,
        routeCount: currentStats.routes.size,
        distributorCount: currentStats.distributors.size,
        isCurrent: true
      });
    }

    return stats;
  }, [monthlyStats, showCurrentMonth, currentMonthData, currentMonthLabel, filterDay]);

  const averages = useMemo(() => {
    if (combinedStats.length === 0) return { cost: 0, pieces: 0, distributors: 0 };
    const totalCost = combinedStats.reduce((acc, m) => acc + m.cost, 0);
    const totalPieces = combinedStats.reduce((acc, m) => acc + m.pieces, 0);
    const totalDistributors = combinedStats.reduce((acc, m) => acc + m.distributorCount, 0);

    return {
      cost: Math.round(totalCost / combinedStats.length),
      pieces: Math.round(totalPieces / combinedStats.length),
      distributors: Math.round(totalDistributors / combinedStats.length),
    };
  }, [combinedStats]);

  const formatMonth = (monthStr: string) => {
    const [m, y] = monthStr.split('-');
    const months: Record<string, string> = {
      '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
      '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
    };
    return `${months[m] || m}-${y}`;
  };

  const formatInt = (val: number) => Math.round(val).toLocaleString('es-PY');

  const calculateTrend = (data: any[], key: string) => {
    if (data.length < 2) return data.map(d => ({ ...d, [`${key}Trend`]: d[key] }));
    
    const n = data.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i][key];
      sumXY += i * data[i][key];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return data.map((d, i) => ({
      ...d,
      [`${key}Trend`]: Math.max(0, slope * i + intercept)
    }));
  };

  const chartData = useMemo(() => {
    let dataWithTrends = calculateTrend(combinedStats, 'pieces');
    dataWithTrends = calculateTrend(dataWithTrends, 'routeCount');
    dataWithTrends = calculateTrend(dataWithTrends, 'cost');
    return dataWithTrends;
  }, [combinedStats]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const day = parseInt(inputValue);
    if (!isNaN(day) && day >= 1 && day <= 31) {
      setFilterDay(day);
      setIsFiltering(false);
    }
  };

  const handleAddCurrentMonth = () => {
    setShowCurrentMonth(true);
    if (maxDayInCurrentMonth !== null) {
      setFilterDay(maxDayInCurrentMonth);
    }
  };

  const clearFilter = () => {
    setFilterDay(null);
    setInputValue("");
    setIsFiltering(false);
  };

  if (data.length === 0 || filteredData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-secondary-200 shadow-sm text-center">
        <Calendar className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-secondary-900">Sin datos históricos</h3>
        <p className="text-secondary-500 mt-2">
          No se encontraron registros históricos para {isGeneral ? "la vista general" : `la sucursal ${selectedSucursal}`}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECCIÓN 1: INDICADORES */}
      <Accordion
        title="Indicadores de Historial"
        icon={<TrendingUp className="w-5 h-5 text-primary-600" />}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderIndicators(
            "Promedio Costo Total Mensual",
            `$${formatInt(averages.cost)}`,
            <DollarSign className="w-4 h-4" />
          )}
          {renderIndicators(
            "Promedio Piezas Mensuales",
            formatInt(averages.pieces),
            <Package className="w-4 h-4" />
          )}
          {renderIndicators(
            "Promedio Distribuidores Mensuales",
            formatInt(averages.distributors),
            <Users className="w-4 h-4" />
          )}
        </div>
      </Accordion>

      {/* SECCIÓN 2: TABLA DE DATOS */}
      <Accordion
        title="Tabla de Datos Históricos"
        icon={<Calendar className="w-5 h-5 text-primary-600" />}
        defaultOpen={false}
      >
        <div className="bg-white rounded-xl border border-secondary-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-secondary-100 flex justify-between items-center bg-secondary-50/50">
            <div className="flex items-center">
              {filterDay && (
                <span className="text-xs font-bold text-blue-600 animate-in fade-in duration-300">
                  (Acumulado al día {filterDay})
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {isFiltering ? (
                <form onSubmit={handleFilterSubmit} className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-2 duration-200">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Día (1-31)"
                    autoFocus
                    className="w-24 px-3 py-1.5 text-xs border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <button
                    type="submit"
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFiltering(false)}
                    className="p-1.5 bg-secondary-200 text-secondary-600 rounded-lg hover:bg-secondary-300 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center space-x-2">
                  {filterDay !== null && (
                    <button
                      onClick={clearFilter}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-secondary-100 text-secondary-600 rounded-lg hover:bg-secondary-200 transition-all text-xs font-bold cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Limpiar Filtro</span>
                    </button>
                  )}
                  {!showCurrentMonth && currentMonthData.length > 0 && (
                    <button
                      onClick={handleAddCurrentMonth}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg transform active:scale-95 text-xs font-bold cursor-pointer"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Agregar mes analizado</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsFiltering(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg transform active:scale-95 text-xs font-bold cursor-pointer"
                  >
                    <Filter className="w-4 h-4" />
                    <span>Filtrar por fecha</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary-50">
                  <th className="px-6 py-3 text-[10px] font-bold text-black uppercase tracking-wider border-b border-secondary-100">
                    Indicador
                  </th>
                  {combinedStats.map((m) => (
                    <th key={m.month} className="px-6 py-3 text-[10px] font-bold text-black uppercase tracking-wider border-b border-secondary-100 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <span>{formatMonth(m.month)}</span>
                        {(m as any).isCurrent && (
                          <button 
                            onClick={() => setShowCurrentMonth(false)}
                            className="p-0.5 hover:bg-secondary-200 rounded-full transition-colors text-secondary-400 hover:text-red-500 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100">
                <tr className="hover:bg-secondary-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-secondary-900">Piezas Totales</td>
                  {combinedStats.map((m) => (
                    <td key={m.month} className={`px-6 py-4 text-xs text-center font-medium ${(m as any).isCurrent ? 'text-blue-600 bg-blue-50/30' : 'text-secondary-600'}`}>
                      {formatInt(m.pieces)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-secondary-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-secondary-900">Rutas Totales</td>
                  {combinedStats.map((m) => (
                    <td key={m.month} className={`px-6 py-4 text-xs text-center font-medium ${(m as any).isCurrent ? 'text-blue-600 bg-blue-50/30' : 'text-secondary-600'}`}>
                      {formatInt(m.routeCount)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-secondary-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-secondary-900">Costos Totales</td>
                  {combinedStats.map((m) => (
                    <td key={m.month} className={`px-6 py-4 text-xs text-center font-medium ${(m as any).isCurrent ? 'text-blue-600 bg-blue-50/30 font-bold' : 'text-secondary-600'}`}>
                      ${formatInt(m.cost)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Accordion>

      {/* SECCIÓN 3: GRÁFICOS */}
      <Accordion
        title="Gráficos"
        icon={<BarChart3 className="w-5 h-5 text-primary-600" />}
        defaultOpen={false}
      >
        <div className="mb-4 flex justify-end">
          {!showCurrentMonth && currentMonthData.length > 0 && (
            <button
              onClick={handleAddCurrentMonth}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg transform active:scale-95 text-xs font-bold cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Agregar mes analizado</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gráfico 1: Piezas */}
          <div className="bg-white p-4 rounded-xl border border-secondary-200 shadow-sm h-[300px]">
            <h4 className="text-[10px] font-bold text-secondary-500 uppercase mb-4">Piezas Totales por Mes</h4>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  fontSize={9} 
                  fontWeight="bold" 
                  axisLine={false} 
                  tickLine={false} 
                  tickFormatter={formatMonth}
                />
                <YAxis fontSize={9} axisLine={false} tickLine={false} hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                  formatter={(val: number) => [formatInt(val), "Piezas"]}
                  labelFormatter={formatMonth}
                />
                <Bar dataKey="pieces" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30}>
                  <LabelList dataKey="pieces" position="top" fontSize={9} fontWeight="bold" formatter={(val: number) => formatInt(val)} />
                </Bar>
                <Line type="monotone" dataKey="piecesTrend" stroke="#059669" strokeWidth={2} dot={false} strokeDasharray="5 5" tooltipType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico 2: Rutas */}
          <div className="bg-white p-4 rounded-xl border border-secondary-200 shadow-sm h-[300px]">
            <h4 className="text-[10px] font-bold text-secondary-500 uppercase mb-4">Rutas Totales por Mes</h4>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  fontSize={9} 
                  fontWeight="bold" 
                  axisLine={false} 
                  tickLine={false} 
                  tickFormatter={formatMonth}
                />
                <YAxis fontSize={9} axisLine={false} tickLine={false} hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                  formatter={(val: number) => [formatInt(val), "Rutas"]}
                  labelFormatter={formatMonth}
                />
                <Bar dataKey="routeCount" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30}>
                  <LabelList dataKey="routeCount" position="top" fontSize={9} fontWeight="bold" formatter={(val: number) => formatInt(val)} />
                </Bar>
                <Line type="monotone" dataKey="routeCountTrend" stroke="#d97706" strokeWidth={2} dot={false} strokeDasharray="5 5" tooltipType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico 3: Costos */}
          <div className="bg-white p-4 rounded-xl border border-secondary-200 shadow-sm h-[300px]">
            <h4 className="text-[10px] font-bold text-secondary-500 uppercase mb-4">Costo Total por Mes</h4>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  fontSize={9} 
                  fontWeight="bold" 
                  axisLine={false} 
                  tickLine={false} 
                  tickFormatter={formatMonth}
                />
                <YAxis fontSize={9} axisLine={false} tickLine={false} hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                  formatter={(val: number) => [`$${formatInt(val)}`, "Costo"]}
                  labelFormatter={formatMonth}
                />
                <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30}>
                  <LabelList dataKey="cost" position="top" fontSize={9} fontWeight="bold" formatter={(val: number) => `$${formatInt(val)}`} />
                </Bar>
                <Line type="monotone" dataKey="costTrend" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="5 5" tooltipType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
