import React, { useState, useMemo } from "react";
import { LogisticsData } from "../types";
import Accordion from "./Accordion";
import SortableTable from "./SortableTable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Rectangle,
} from "recharts";
import {
  Truck,
  MapPin,
  Calendar,
  Activity,
  Download,
  RefreshCw,
  TrendingUp,
  Package,
  BarChart3,
  DollarSign,
  Plus,
  Menu,
} from "lucide-react";
import Distribuidores from "./modules/Distribuidores";
import Fechas from "./modules/Fechas";
import Zonas from "./modules/Zonas";
import Costos from "./modules/Costos";
import Piezas from "./modules/Piezas";
import { Route, PlusCircle } from "lucide-react";
import Sidebar from "./Sidebar";

interface DashboardProps {
  data: LogisticsData[];
  fileName: string;
  onReset: () => void;
  onAddFile?: () => void;
  presupuestos: Record<string, number>;
  onPresupuestoChange: (sucursal: string, value: string) => void;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

export default function Dashboard({ data, fileName, onReset, onAddFile, presupuestos, onPresupuestoChange }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("Distribuidores");
  const [selectedSucursal, setSelectedSucursal] = useState<string>("General");
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const sucursalesList = useMemo(() => {
    const sucursales = new Set<string>();
    data.forEach((d) => {
      if (d.sucursal && d.sucursal !== "N/A") {
        sucursales.add(d.sucursal);
      }
    });
    return ["General", ...Array.from(sucursales).sort()];
  }, [data]);

  const filteredData = useMemo(() => {
    if (selectedSucursal === "General") return data;
    return data.filter((d) => d.sucursal === selectedSucursal);
  }, [data, selectedSucursal]);

  // Aggregated Data
  const totalPiezas = filteredData.reduce(
    (acc, curr) => acc + curr.piezasTotal,
    0,
  );

  const isGeneral = selectedSucursal === "General";
  // URL directa al backend en Render para producción (Vercel)
  const BACKEND_URL = "https://flash-backend-lbej.onrender.com";

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          data: filteredData, 
          selectedSucursal, 
          presupuestos 
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error response:", errorText);
        throw new Error(`Error al exportar los datos: ${response.status} ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_${selectedSucursal === "General" ? "General" : selectedSucursal}_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Export failed", error);
      alert("Hubo un error al generar el archivo Excel. Por favor, asegúrate de que el servidor backend en Render esté funcionando correctamente.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveAndExport = async () => {
    setIsSaving(true);
    try {
      // Apuntando directamente al backend de Python en Render
      const response = await fetch(`${BACKEND_URL}/api/export-consolidated`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data, presupuestos }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error al exportar consolidado: ${response.status} ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getFullYear()).slice(-2)}`;
      
      a.download = `Consolidado ${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Consolidated export failed", error);
      alert("Error al generar el archivo consolidado. Asegúrate de que el backend en Render esté activo.");
    } finally {
      setIsSaving(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length > 0 && payload[0]) {
      return (
        <div className="bg-white p-3 border border-secondary-200 shadow-lg rounded-lg z-50">
          <p className="text-sm font-semibold text-secondary-900 mb-1">
            {label}
          </p>
          <p className="text-sm text-primary-600 font-medium">
            Piezas: {payload[0].value?.toLocaleString() || 0}
          </p>
        </div>
      );
    }
    return null;
  };

  const tabs = [
    { id: "Distribuidores", icon: <Truck className="w-4 h-4 mr-2" /> },
    { id: "Costos", icon: <DollarSign className="w-4 h-4 mr-2" /> },
    { id: "Piezas", icon: <Package className="w-4 h-4 mr-2" /> },
    { id: "Fechas", icon: <Calendar className="w-4 h-4 mr-2" /> },
    { id: "Zonas", icon: <MapPin className="w-4 h-4 mr-2" /> },
  ];

  const renderIndicators = (title: string, value: number | string) => {
    const isText =
      typeof value === "string" &&
      isNaN(Number(value.replace(/[^0-9.-]+/g, "")));
    return (
      <div className="bg-secondary-100 hover:bg-secondary-200 hover:shadow-md transform hover:-translate-y-1 rounded-xl p-6 flex flex-col justify-center transition-all duration-300 cursor-pointer">
        <p className="text-sm font-medium text-secondary-700 uppercase tracking-wider">
          {title}
        </p>
        <p
          className={`font-bold text-secondary-900 mt-2 ${isText ? "text-lg" : "text-2xl"}`}
        >
          {value}
        </p>
      </div>
    );
  };

  const renderModuleContent = (tabId: string) => {
    switch (tabId) {
      case "Distribuidores":
        return (
          <Distribuidores
            data={filteredData}
            totalPiezas={totalPiezas}
            renderIndicators={renderIndicators}
            CustomTooltip={CustomTooltip}
            isGeneral={isGeneral}
          />
        );
      case "Fechas":
        return (
          <Fechas
            data={filteredData}
            totalPiezas={totalPiezas}
            renderIndicators={renderIndicators}
            CustomTooltip={CustomTooltip}
            isGeneral={isGeneral}
          />
        );
      case "Zonas":
        return (
          <Zonas
            data={filteredData}
            totalPiezas={totalPiezas}
            renderIndicators={renderIndicators}
            CustomTooltip={CustomTooltip}
            isGeneral={isGeneral}
          />
        );
      case "Costos":
        return (
          <Costos
            data={filteredData}
            totalPiezas={totalPiezas}
            renderIndicators={renderIndicators}
            CustomTooltip={CustomTooltip}
            isGeneral={isGeneral}
            presupuestos={presupuestos}
            onPresupuestoChange={onPresupuestoChange}
          />
        );
      case "Piezas":
        return (
          <Piezas
            data={filteredData}
            totalPiezas={totalPiezas}
            renderIndicators={renderIndicators}
            CustomTooltip={CustomTooltip}
            isGeneral={isGeneral}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50">
      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onExportReport={handleExport}
        onAddRoutes={onAddFile || (() => {})}
        onReset={onReset}
        onSaveAndExport={handleSaveAndExport}
        isExporting={isExporting}
        isSaving={isSaving}
      />

      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-secondary-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-600 rounded-lg">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-secondary-900 tracking-tight">
                  Sistema de Análisis de Datos
                </h1>
                <p className="text-xs text-secondary-500 font-medium">
                  Archivo: {fileName}
                </p>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-secondary-100 rounded-lg transition-colors cursor-pointer"
              >
                <Menu className="w-6 h-6 text-secondary-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs Navigation */}
        <div className="mb-8 flex justify-between items-center">
          <nav className="flex space-x-2 overflow-x-auto" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap py-3 px-6 rounded-xl font-medium text-sm flex items-center transition-all duration-200 active:scale-95 cursor-pointer
                  ${
                    activeTab === tab.id
                      ? "bg-primary-700 text-white shadow-md"
                      : "bg-secondary-200 text-secondary-600 hover:bg-secondary-300"
                  }
                `}
              >
                {tab.icon}
                {tab.id}
              </button>
            ))}
          </nav>
          
          <div className="relative group ml-4">
            <select
              value={selectedSucursal}
              onChange={(e) => setSelectedSucursal(e.target.value)}
              className="appearance-none bg-secondary-900 text-white pl-4 pr-10 py-2 rounded-md text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 cursor-pointer"
            >
              {sucursalesList.map((sucursal) => (
                <option key={sucursal} value={sucursal}>
                  {sucursal}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
              <svg
                className="h-4 w-4 fill-current"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Active Module Content */}
        <div className="transition-all duration-300">
          {renderModuleContent(activeTab)}
        </div>
      </main>
    </div>
  );
}