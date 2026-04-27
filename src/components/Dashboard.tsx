import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogisticsData, SistemaData } from "../types";
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
  Search,
  X,
} from "lucide-react";
import Distribuidores from "./modules/Distribuidores";
import Fechas from "./modules/Fechas";
import Zonas from "./modules/Zonas";
import Costos from "./modules/Costos";
import Piezas from "./modules/Piezas";
import Historial from "./modules/Historial";
import { PlusCircle, Users, CheckCircle2 } from "lucide-react";
import Sidebar from "./Sidebar";

interface DashboardProps {
  data: LogisticsData[];
  sistemaData: SistemaData[];
  fileName: string;
  onReset: () => void;
  onAddFiles?: () => void;
  onRevalidate?: () => void;
  presupuestos: Record<string, number>;
  onPresupuestoChange: (sucursal: string, value: string) => void;
  historialData?: any[];
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

export default function Dashboard({ data, sistemaData, fileName, onReset, onAddFiles, onRevalidate, presupuestos, onPresupuestoChange, historialData = [] }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("Distribuidores");
  const [selectedSucursal, setSelectedSucursal] = useState<string>("General");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSistema, setIsExportingSistema] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [historialFilterDay, setHistorialFilterDay] = useState<number | null>(null);
  const [historialShowCurrentMonth, setHistorialShowCurrentMonth] = useState(false);

  const sucursalesList = useMemo(() => {
    const sucursales = new Set<string>();
    data.forEach((d) => {
      if (d.sucursal && d.sucursal !== "N/A" && d.sucursal !== "PENDING_SUCURSAL") sucursales.add(d.sucursal);
    });
    // También detectar sucursales desde el historial para que aparezcan en el selector
    historialData.forEach((d) => {
      if (d.sucursal && d.sucursal !== "N/A" && d.sucursal !== "PENDING_SUCURSAL") sucursales.add(d.sucursal);
    });
    return ["General", ...Array.from(sucursales).sort()];
  }, [data, historialData]);

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

  const handleExportSistema = async (type: 'general' | 'missing', client?: string) => {
    setIsExportingSistema(true);
    try {
      const url = type === 'general' 
        ? `${window.location.origin}/api/export` 
        : `${window.location.origin}/api/export-consolidated`; 
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: selectedSucursal === "General" ? data : data.filter(d => d.sucursal === selectedSucursal),
          selectedSucursal: selectedSucursal,
          presupuestos: presupuestos,
          client: client,
          exportType: type
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Export failed');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || `Reporte_Sistema_${type}_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setIsSidebarOpen(false);
      setShowClientSelector(false);
    } catch (error) {
      console.error("Export failed", error);
      alert("Error al exportar reporte de sistema.");
    } finally {
      setIsExportingSistema(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportCols = [
        'sucursal', 'distribuidor', 'hojaRuta', 'vehiculo', 
        'piezasEntregadas', 'piezasTotal', 'piezasNoEntregadas', 
        'costoTotal', 'fecha', 'zona'
      ];

      const filteredData = selectedSucursal === "General" ? data : data.filter(d => d.sucursal === selectedSucursal);
      const filteredHistorial = selectedSucursal === "General" ? historialData : historialData.filter(d => d.sucursal === selectedSucursal);
      
      const cleanData = filteredData.map(item => {
        const filtered: any = {};
        exportCols.forEach(col => {
          if (col in item) filtered[col] = (item as any)[col];
        });
        return filtered;
      });

      const cleanHistorial = filteredHistorial.map(item => {
        const filtered: any = {};
        exportCols.forEach(col => {
          if (col in item) filtered[col] = (item as any)[col];
        });
        return filtered;
      });
      
      const response = await fetch(`${window.location.origin}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: cleanData,
          historial: cleanHistorial,
          selectedSucursal: selectedSucursal,
          presupuestos: presupuestos
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `Backend error: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || `Reporte_${selectedSucursal}_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Export error details:", error);
      const message = error instanceof Error ? error.message : "Error desconocido";
      alert(`Error al generar el archivo Excel: ${message}. Revisa la consola (F12) para más detalles.`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveAndExport = async () => {
    setIsSaving(true);
    try {
      const consolidatedCols = [
        'sucursal', 'fecha', 'distribuidor', 'vehiculo', 'hojaRuta', 'ruta', 'retiros',
        'piezasTotal', 'bultosTotal', 'palets', 'peso', 'zona',
        'piezasEntregadas', 'piezasNoEntregadas', 'visitadasNovedad',
        'noVisitadas', 'bultosEntregados', 'bultosDevueltos', 'bultosNoEntregados', 'costoTotal',
        'presupuesto', 'observaciones', 'cliente'
      ];

      const cleanData = data.map(item => {
        const filtered: any = {};
        consolidatedCols.forEach(col => {
          if (col in item) filtered[col] = (item as any)[col];
        });
        return filtered;
      });

      const response = await fetch(`${window.location.origin}/api/export-consolidated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: cleanData,
          historialData: historialData,
          presupuestos: presupuestos,
          filterDay: historialFilterDay,
          showCurrentMonth: historialShowCurrentMonth
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `Backend error: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || `Consolidado_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error("Consolidated export error details:", error);
      const message = error instanceof Error ? error.message : "Error desconocido";
      alert(`Error al generar el archivo consolidado: ${message}. Revisa la consola (F12) para más detalles.`);
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
    ...(historialData.length > 0 ? [{ id: "Historial", icon: <TrendingUp className="w-4 h-4 mr-2" /> }] : []),
  ];

  const renderIndicators = (title: string, value: number | string) => {
    const isText =
      typeof value === "string" &&
      isNaN(Number(value.replace(/[^0-9.-]+/g, "")));
    return (
      <div className="bg-secondary-100 hover:bg-secondary-300 hover:shadow-xl transform hover:-translate-y-2 rounded-xl p-6 flex flex-col justify-center transition-all duration-300 cursor-pointer border border-transparent hover:border-primary-200">
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
            sistemaData={selectedSucursal === "General" ? sistemaData : sistemaData.filter(d => d.sucursal === selectedSucursal)}
            totalPiezas={totalPiezas}
            renderIndicators={renderIndicators}
            CustomTooltip={CustomTooltip}
            isGeneral={isGeneral}
          />
        );
      case "Historial":
        return (
          <Historial
            data={selectedSucursal === "General" ? historialData : historialData.filter(d => d.sucursal === selectedSucursal)}
            currentMonthData={filteredData}
            renderIndicators={renderIndicators}
            isGeneral={isGeneral}
            selectedSucursal={selectedSucursal}
            filterDay={historialFilterDay}
            setFilterDay={setHistorialFilterDay}
            showCurrentMonth={historialShowCurrentMonth}
            setShowCurrentMonth={setHistorialShowCurrentMonth}
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
        onExportSistema={() => handleExportSistema('general')}
        onExportMissingClients={() => setShowClientSelector(true)}
        onAddFiles={onAddFiles || (() => {})}
        onRevalidate={onRevalidate || (() => {})}
        onReset={onReset}
        onSaveAndExport={handleSaveAndExport}
        isExporting={isExporting}
        isExportingSistema={isExportingSistema}
        isSaving={isSaving}
        hasSistemaData={sistemaData.length > 0}
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
            <div className="flex items-center space-x-4">
              <div className="relative group">
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
        <div className="mb-8">
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
        </div>

        {/* Active Module Content */}
        <div className="transition-all duration-300">
          {renderModuleContent(activeTab)}
        </div>
      </main>

      {showClientSelector && (
        <ClientSelectorModal
          clients={Array.from(new Set(sistemaData.map(d => d.cliente))).sort()}
          onSelect={(client) => {
            setShowClientSelector(false);
            handleExportSistema("missing", client);
          }}
          onClose={() => setShowClientSelector(false)}
        />
      )}
    </div>
  );
}

function ClientSelectorModal({ 
  clients, 
  onSelect, 
  onClose 
}: { 
  clients: string[]; 
  onSelect: (client: string) => void; 
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredClients = clients.filter(c => 
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-6 border-b border-secondary-100 flex justify-between items-center bg-secondary-50">
          <h3 className="text-xl font-bold text-secondary-900">Seleccionar Cliente</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>
        
        <div className="p-4 border-b border-secondary-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-secondary-50 border border-secondary-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredClients.length > 0 ? (
            <div className="space-y-1">
              {filteredClients.map((client) => (
                <button
                  key={client}
                  onClick={() => onSelect(client)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-primary-50 hover:text-primary-700 transition-all duration-200 text-sm font-medium border border-transparent hover:border-primary-100"
                >
                  {client}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-secondary-500 text-sm">
              No se encontraron clientes
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
