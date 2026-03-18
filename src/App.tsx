import React, { useState } from "react";
import { LogisticsData } from "./types";
import { getRouteId } from "./utils";
import FileUpload from "./components/FileUpload";
import ValidationModal from "./components/ValidationModal";
import Dashboard from "./components/Dashboard";
import {
  BarChart3,
  LineChart,
  TrendingUp,
  Activity,
  X,
} from "lucide-react";

export default function App() {
  const [data, setData] = useState<LogisticsData[]>([]);
  const [pendingData, setPendingData] = useState<LogisticsData[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [isDashboardActive, setIsDashboardActive] = useState(false);
  const [totals, setTotals] = useState<
    { piezas: number; bultos: number } | undefined
  >();
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [presupuestos, setPresupuestos] = useState<Record<string, number>>({});
  const [pendingPresupuestos, setPendingPresupuestos] = useState<Record<string, number> | undefined>();
  
  // Store raw data for re-validation
  const [lastRawData, setLastRawData] = useState<LogisticsData[]>([]);
  const [lastRawTotals, setLastRawTotals] = useState<{ piezas: number; bultos: number } | undefined>();
  const [lastRawPresupuestos, setLastRawPresupuestos] = useState<Record<string, number> | undefined>();
  const [lastConfirmedData, setLastConfirmedData] = useState<LogisticsData[]>([]);

  const handleDataLoaded = (
    parsedData: LogisticsData[],
    name: string,
    parsedTotals?: { piezas: number; bultos: number },
    presupuestosMap?: Record<string, number>
  ) => {
    setPendingData(parsedData);
    setLastRawData(parsedData); // Save raw data
    setFileName(name);
    setTotals(parsedTotals);
    setLastRawTotals(parsedTotals); // Save raw totals
    setPendingPresupuestos(presupuestosMap);
    setLastRawPresupuestos(presupuestosMap); // Save raw budgets
    setShowModal(true);
  };

  const handleConfirm = (
    updatedData: LogisticsData[], 
    newPresupuestos?: Record<string, number>, 
    overwritePresupuestos?: boolean,
    idsToRemove?: string[]
  ) => {
    setShowModal(false);
    setLastConfirmedData(updatedData); // Track what was just added
    setData((prev) => {
      let filteredPrev = prev;
      if (idsToRemove && idsToRemove.length > 0) {
        filteredPrev = prev.filter(d => !idsToRemove.includes(getRouteId(d)));
      }
      return [...filteredPrev, ...updatedData];
    });
    
    if (newPresupuestos && Object.keys(newPresupuestos).length > 0) {
      setPresupuestos(prev => {
        if (overwritePresupuestos) {
          return { ...prev, ...newPresupuestos };
        } else {
          return { ...newPresupuestos, ...prev }; // Keep existing if not overwriting
        }
      });
    }

    setPendingPresupuestos(undefined);
    setIsDashboardActive(true);
    setIsAddingFile(false);
  };

  const handleCancel = () => {
    setShowModal(false);
    setPendingData([]);
    setPendingPresupuestos(undefined);
    if (!isDashboardActive) {
      setFileName("");
    }
    setIsAddingFile(false);
  };

  const handleReset = () => {
    setIsDashboardActive(false);
    setData([]);
    setFileName("");
    setPresupuestos({});
    setLastRawData([]);
    setLastRawTotals(undefined);
    setLastRawPresupuestos(undefined);
    setLastConfirmedData([]);
  };

  const handlePresupuestoChange = (sucursal: string, value: string) => {
    const num = parseFloat(value);
    setPresupuestos(prev => ({ ...prev, [sucursal]: isNaN(num) ? 0 : num }));
  };

  const handleRevalidate = () => {
    if (lastRawData.length === 0) return;

    // Get IDs of the data as it was confirmed to remove it from current state
    const confirmedIds = new Set(lastConfirmedData.map(d => getRouteId(d)));
    
    setPendingData(lastRawData);
    setTotals(lastRawTotals);
    setPendingPresupuestos(lastRawPresupuestos);
    
    // Remove the data that was last confirmed so we can re-process its original version
    setData(prev => prev.filter(d => !confirmedIds.has(getRouteId(d))));
    
    setShowModal(true);
  };

  if (isDashboardActive) {
    return (
      <>
        <Dashboard 
          data={data} 
          fileName={fileName} 
          onReset={handleReset} 
          onAddFile={() => setIsAddingFile(true)}
          onRevalidate={handleRevalidate}
          presupuestos={presupuestos}
          onPresupuestoChange={handlePresupuestoChange}
        />
        {isAddingFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-8 relative">
              <button
                onClick={() => setIsAddingFile(false)}
                className="absolute top-4 right-4 text-secondary-400 hover:text-secondary-600 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-secondary-900">Agregar Sucursal</h2>
                <p className="mt-2 text-secondary-600">Cargue el archivo de la nueva sucursal.</p>
              </div>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </div>
          </div>
        )}
        {showModal && (
          <ValidationModal
            data={pendingData}
            existingData={data}
            totals={totals}
            existingPresupuestos={presupuestos}
            pendingPresupuestos={pendingPresupuestos}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Watermarks */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03] overflow-hidden flex justify-between items-center">
        <BarChart3 className="w-[50vw] h-[50vw] text-primary-900 transform -rotate-45 -translate-x-1/4" />
        <TrendingUp className="w-[50vw] h-[50vw] text-primary-900 transform -rotate-12 translate-x-1/4 -translate-y-1/4" />
      </div>

      <div className="w-full max-w-3xl text-center mb-8 relative z-10">
        <div className="inline-flex items-center justify-center p-4 bg-primary-600 rounded-2xl mb-6 shadow-lg">
          <BarChart3 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-secondary-900 tracking-tight">
          Sistema de Análisis de Datos
        </h1>
        <p className="mt-4 text-lg text-secondary-600 max-w-2xl mx-auto">
          Plataforma de análisis de datos logísticos.
        </p>
      </div>

      <FileUpload onDataLoaded={handleDataLoaded} />

      {showModal && (
        <ValidationModal
          data={pendingData}
          existingData={data}
          totals={totals}
          existingPresupuestos={presupuestos}
          pendingPresupuestos={pendingPresupuestos}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
