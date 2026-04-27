import React, { useState } from "react";
import { LogisticsData, ConsultaGlobalData, DistribuidorData } from "./types";
import { getRouteId, isStateEntregado } from "./utils";
import FileUpload from "./components/FileUpload";
import ValidationModal from "./components/ValidationModal";
import Dashboard from "./components/Dashboard";
import {
  BarChart3,
  LineChart,
  TrendingUp,
  Activity,
  X,
  CheckCircle2,
  UploadCloud,
} from "lucide-react";

export default function App() {
  const [sucursalFiles, setSucursalFiles] = useState<{name: string, data: LogisticsData[], totals?: { piezas: number; bultos: number }, presupuestos?: Record<string, number>, missingColumns?: string[], isConfirmed?: boolean}[]>([]);
  const [consolidatedFiles, setConsolidatedFiles] = useState<{name: string, data: LogisticsData[], totals?: { piezas: number; bultos: number }, presupuestos?: Record<string, number>, missingColumns?: string[], isConfirmed?: boolean}[]>([]);
  const [consultaGlobalFiles, setConsultaGlobalFiles] = useState<{name: string, data: ConsultaGlobalData[], isConfirmed?: boolean}[]>([]);
  const [hdrDistribuidorFiles, setHdrDistribuidorFiles] = useState<{name: string, data: DistribuidorData[], isConfirmed?: boolean}[]>([]);
  const [historialFiles, setHistorialFiles] = useState<{name: string, data: LogisticsData[], isConfirmed?: boolean}[]>([]);
  
  const [data, setData] = useState<LogisticsData[]>([]);
  const [sistemaData, setSistemaData] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isDashboardActive, setIsDashboardActive] = useState(false);
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [presupuestos, setPresupuestos] = useState<Record<string, number>>({});
  
  // Store raw data for re-validation
  const [lastRawData, setLastRawData] = useState<LogisticsData[]>([]);
  const [lastRawTotals, setLastRawTotals] = useState<{ piezas: number; bultos: number } | undefined>();
  const [lastRawPresupuestos, setLastRawPresupuestos] = useState<Record<string, number> | undefined>();
  const [lastConfirmedData, setLastConfirmedData] = useState<LogisticsData[]>([]);
  const [dataBackup, setDataBackup] = useState<LogisticsData[] | null>(null);

  // Backups for "Add Files" mode to allow canceling changes
  const [sucursalFilesBackup, setSucursalFilesBackup] = useState<typeof sucursalFiles | null>(null);
  const [consolidatedFilesBackup, setConsolidatedFilesBackup] = useState<typeof consolidatedFiles | null>(null);
  const [consultaGlobalFilesBackup, setConsultaGlobalFilesBackup] = useState<typeof consultaGlobalFiles | null>(null);
  const [hdrDistribuidorFilesBackup, setHdrDistribuidorFilesBackup] = useState<typeof hdrDistribuidorFiles | null>(null);
  const [historialFilesBackup, setHistorialFilesBackup] = useState<typeof historialFiles | null>(null);
  const [presupuestosBackup, setPresupuestosBackup] = useState<Record<string, number> | null>(null);
  const [lastRawDataBackup, setLastRawDataBackup] = useState<LogisticsData[] | null>(null);
  const [lastRawTotalsBackup, setLastRawTotalsBackup] = useState<{ piezas: number; bultos: number } | undefined | null>(null);
  const [lastRawPresupuestosBackup, setLastRawPresupuestosBackup] = useState<Record<string, number> | undefined | null>(null);

  const pendingData = [
    ...sucursalFiles.filter(f => !f.isConfirmed).flatMap(f => f.data),
    ...consolidatedFiles.filter(f => !f.isConfirmed).flatMap(f => f.data)
  ];
  const consultaGlobal = consultaGlobalFiles.flatMap(f => f.data);
  const hdrDistribuidores = hdrDistribuidorFiles.flatMap(f => f.data);
  const historialData = historialFiles.flatMap(f => f.data);
  const totals = [...sucursalFiles, ...consolidatedFiles].reduce((acc, f) => ({
    piezas: acc.piezas + (f.totals?.piezas || 0),
    bultos: acc.bultos + (f.totals?.bultos || 0)
  }), { piezas: 0, bultos: 0 });
  const pendingPresupuestos = [...sucursalFiles, ...consolidatedFiles].filter(f => !f.isConfirmed).reduce((acc, f) => ({ ...acc, ...(f.presupuestos || {}) }), {});
  const missingColumns: string[] = Array.from(new Set([...sucursalFiles, ...consolidatedFiles].filter(f => !f.isConfirmed).flatMap(f => f.missingColumns || [])));
  const fileName = [...sucursalFiles, ...consolidatedFiles].map(f => f.name).join(", ");

  const handleDataLoaded = (
    parsedData: any[],
    name: string,
    type: "SUCURSAL" | "CONSULTA_GLOBAL" | "HDR_DISTRIBUIDOR" | "HISTORIAL" | "CONSOLIDADO",
    parsedTotals?: { piezas: number; bultos: number },
    presupuestosMap?: Record<string, number>,
    missingCols?: string[],
    historialData?: any[]
  ) => {
    if (type === "SUCURSAL") {
      setSucursalFiles(prev => {
        const newFiles = [...prev, { name, data: parsedData as LogisticsData[], totals: parsedTotals, presupuestos: presupuestosMap, missingColumns: missingCols, isConfirmed: false }];
        updateRawData([...newFiles, ...consolidatedFiles]);
        return newFiles;
      });
    } else if (type === "CONSOLIDADO") {
      setConsolidatedFiles(prev => {
        const newFiles = [...prev, { name, data: parsedData as LogisticsData[], totals: parsedTotals, presupuestos: presupuestosMap, missingColumns: missingCols, isConfirmed: false }];
        updateRawData([...sucursalFiles, ...newFiles]);
        return newFiles;
      });
      if (historialData && historialData.length > 0) {
        setHistorialFiles(prev => [...prev, { name: `${name} (Historial)`, data: historialData as LogisticsData[], isConfirmed: false }]);
      }
    } else if (type === "CONSULTA_GLOBAL") {
      setConsultaGlobalFiles(prev => [...prev, { name, data: parsedData as ConsultaGlobalData[], isConfirmed: false }]);
    } else if (type === "HDR_DISTRIBUIDOR") {
      setHdrDistribuidorFiles(prev => [...prev, { name, data: parsedData as DistribuidorData[], isConfirmed: false }]);
    } else if (type === "HISTORIAL") {
      setHistorialFiles(prev => [...prev, { name, data: parsedData as LogisticsData[], isConfirmed: false }]);
    }
  };

  const updateRawData = (files: any[]) => {
    setLastRawData(files.flatMap(f => f.data));
    setLastRawTotals(files.reduce((acc, f) => ({
      piezas: acc.piezas + (f.totals?.piezas || 0),
      bultos: acc.bultos + (f.totals?.bultos || 0)
    }), { piezas: 0, bultos: 0 }));
    setLastRawPresupuestos(files.reduce((acc, f) => ({ ...acc, ...(f.presupuestos || {}) }), {}));
  };

  const removeFile = (index: number, type: "SUCURSAL" | "CONSULTA_GLOBAL" | "HDR_DISTRIBUIDOR" | "HISTORIAL" | "CONSOLIDADO") => {
    if (type === "SUCURSAL") {
      setSucursalFiles(prev => {
        const newFiles = prev.filter((_, i) => i !== index);
        updateRawData([...newFiles, ...consolidatedFiles]);
        return newFiles;
      });
    } else if (type === "CONSOLIDADO") {
      setConsolidatedFiles(prev => {
        const newFiles = prev.filter((_, i) => i !== index);
        updateRawData([...sucursalFiles, ...newFiles]);
        return newFiles;
      });
    } else if (type === "CONSULTA_GLOBAL") {
      setConsultaGlobalFiles(prev => prev.filter((_, i) => i !== index));
    } else if (type === "HDR_DISTRIBUIDOR") {
      setHdrDistribuidorFiles(prev => prev.filter((_, i) => i !== index));
    } else if (type === "HISTORIAL") {
      setHistorialFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleConfirm = (
    updatedData: LogisticsData[], 
    newPresupuestos?: Record<string, number>, 
    overwritePresupuestos?: boolean,
    idsToRemove?: string[]
  ) => {
    setShowModal(false);
    setLastConfirmedData(updatedData);
    setDataBackup(null);
    
    // Get all current file names to filter out records from removed files
    const allFileNames = new Set([
      ...sucursalFiles.map(f => f.name),
      ...consolidatedFiles.map(f => f.name)
    ]);

    const mergedData = [
      ...data.filter(d => d.sourceFile && allFileNames.has(d.sourceFile) && !(idsToRemove || []).includes(getRouteId(d))),
      ...updatedData
    ];

    // Final deduplication to ensure no duplicates remain in the state
    const finalData: LogisticsData[] = [];
    const seenIds = new Set<string>();
    // We iterate backwards to keep the "newest" ones (from updatedData)
    for (let i = mergedData.length - 1; i >= 0; i--) {
      const id = getRouteId(mergedData[i]);
      if (!seenIds.has(id)) {
        finalData.unshift(mergedData[i]);
        seenIds.add(id);
      }
    }
    setData(finalData);
    
    if (consultaGlobal.length > 0 || hdrDistribuidores.length > 0) {
      const crossAnalysis = performCrossAnalysis(finalData, consultaGlobal, hdrDistribuidores);
      setSistemaData(crossAnalysis);
    }

    if (newPresupuestos && Object.keys(newPresupuestos).length > 0) {
      setPresupuestos(prev => {
        if (overwritePresupuestos) {
          return { ...prev, ...newPresupuestos };
        } else {
          return { ...newPresupuestos, ...prev };
        }
      });
    }

    setIsDashboardActive(true);
    setIsAddingFile(false);
    
    // Clear backups
    setSucursalFilesBackup(null);
    setConsolidatedFilesBackup(null);
    setConsultaGlobalFilesBackup(null);
    setHdrDistribuidorFilesBackup(null);
    setHistorialFilesBackup(null);
    setPresupuestosBackup(null);
    setLastRawDataBackup(null);
    setLastRawTotalsBackup(null);
    setLastRawPresupuestosBackup(null);
    setDataBackup(null);
    
    // Mark all current files as confirmed
    setSucursalFiles(prev => prev.map(f => ({ ...f, isConfirmed: true })));
    setConsolidatedFiles(prev => prev.map(f => ({ ...f, isConfirmed: true })));
    setConsultaGlobalFiles(prev => prev.map(f => ({ ...f, isConfirmed: true })));
    setHdrDistribuidorFiles(prev => prev.map(f => ({ ...f, isConfirmed: true })));
    setHistorialFiles(prev => prev.map(f => ({ ...f, isConfirmed: true })));
  };

  const performCrossAnalysis = (
    sucursalData: LogisticsData[],
    globalData: ConsultaGlobalData[],
    hdrData: DistribuidorData[]
  ) => {
    const sucursales = Array.from(new Set(sucursalData.map(d => d.sucursal)));
    const results: any[] = [];

    sucursales.forEach(sucName => {
      const sucRows = sucursalData.filter(d => d.sucursal === sucName);
      const groups: Record<string, LogisticsData[]> = {};
      
      sucRows.forEach(row => {
        const key = `${row.distribuidor}_${row.fecha}_${row.ruta}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });

      Object.entries(groups).forEach(([key, rows]) => {
        const first = rows[0];
        const hrs = Array.from(new Set(rows.flatMap(r => {
          const val = String(r.hojaRuta || "");
          if (val.includes("-") || val.includes("/")) {
            return val.split(/[\-\/]/).map(s => s.trim()).filter(s => s !== "");
          }
          return val.trim() !== "" ? [val.trim()] : [];
        })));
        
        const p_c = rows.reduce((acc, r) => acc + (r.piezasTotal || 0), 0);
        const e_c = rows.reduce((acc, r) => acc + (r.piezasEntregadas || 0), 0);
        const b_c = rows.reduce((acc, r) => acc + (r.bultosTotal || 0), 0);
        const costo_total = rows.reduce((acc, r) => acc + (r.costoTotal || 0), 0);

        const relevantGlobal = globalData.filter(g => hrs.includes(g.hojaRuta));
        const p_db = relevantGlobal.length;
        const e_db = relevantGlobal.filter(g => isStateEntregado(g.estado)).length;
        const ne_db = p_db - e_db;
        const b_db = relevantGlobal.reduce((acc, g) => acc + (g.bultos || 0), 0);

        const relevantHdr = hdrData.filter(h => hrs.includes(h.hojaRuta));
        const p_dist = relevantHdr.reduce((acc, h) => acc + (h.cantidad || 0), 0);

        const hrsNoEncontradas = hrs.filter(hr => !globalData.some(g => g.hojaRuta === hr));
        const clientesRuta = Array.from(new Set(relevantGlobal.map(g => g.cliente))).join(", ");
        const localidadesRuta = Array.from(new Set(relevantGlobal.map(g => g.localidad))).join(", ");

        results.push({
          fecha: first.fecha,
          distribuidor: first.distribuidor,
          sucursal: sucName,
          ruta: first.ruta,
          hojasRuta: hrs.join(", "),
          movil: first.vehiculo || "N/A",
          cliente: clientesRuta || "N/A",
          piezasPlanilla: p_c,
          piezasConsulta: p_db,
          piezasHDR: p_dist,
          piezasEntregadasPlanilla: e_c,
          piezasEntregadasConsulta: e_db,
          diferencia: p_c - p_dist,
          sourceFile: first.sourceFile
        });
      });
    });

    return results;
  };

  const handleCancel = () => {
    setShowModal(false);
    
    // Restore backups if they exist
    if (sucursalFilesBackup !== null) setSucursalFiles(sucursalFilesBackup);
    if (consolidatedFilesBackup !== null) setConsolidatedFiles(consolidatedFilesBackup);
    if (consultaGlobalFilesBackup !== null) setConsultaGlobalFiles(consultaGlobalFilesBackup);
    if (hdrDistribuidorFilesBackup !== null) setHdrDistribuidorFiles(hdrDistribuidorFilesBackup);
    if (historialFilesBackup !== null) setHistorialFiles(historialFilesBackup);
    if (presupuestosBackup !== null) setPresupuestos(presupuestosBackup);
    if (lastRawDataBackup !== null) setLastRawData(lastRawDataBackup);
    if (lastRawTotalsBackup !== null) setLastRawTotals(lastRawTotalsBackup);
    if (lastRawPresupuestosBackup !== null) setLastRawPresupuestos(lastRawPresupuestosBackup);
    if (dataBackup !== null) setData(dataBackup);

    // Clear backups
    setSucursalFilesBackup(null);
    setConsolidatedFilesBackup(null);
    setConsultaGlobalFilesBackup(null);
    setHdrDistribuidorFilesBackup(null);
    setHistorialFilesBackup(null);
    setPresupuestosBackup(null);
    setLastRawDataBackup(null);
    setLastRawTotalsBackup(null);
    setLastRawPresupuestosBackup(null);
    setDataBackup(null);
    
    setIsAddingFile(false);
  };

  const handleReset = () => {
    setIsDashboardActive(false);
    setData([]);
    setSistemaData([]);
    setSucursalFiles([]);
    setConsolidatedFiles([]);
    setConsultaGlobalFiles([]);
    setHdrDistribuidorFiles([]);
    setHistorialFiles([]);
    setPresupuestos({});
    setIsAddingFile(false);
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

    setDataBackup([...data]);

    const confirmedIds = new Set(lastConfirmedData.map(d => getRouteId(d)));
    
    setSucursalFiles([{ name: "Re-validación", data: lastRawData, totals: lastRawTotals, presupuestos: lastRawPresupuestos }]);
    
    setData(prev => prev.filter(d => !confirmedIds.has(getRouteId(d))));
    
    setShowModal(true);
  };

  const startAddingFiles = () => {
    setSucursalFilesBackup([...sucursalFiles]);
    setConsolidatedFilesBackup([...consolidatedFiles]);
    setConsultaGlobalFilesBackup([...consultaGlobalFiles]);
    setHdrDistribuidorFilesBackup([...hdrDistribuidorFiles]);
    setHistorialFilesBackup([...historialFiles]);
    setPresupuestosBackup({...presupuestos});
    setLastRawDataBackup([...lastRawData]);
    setLastRawTotalsBackup(lastRawTotals ? {...lastRawTotals} : undefined);
    setLastRawPresupuestosBackup(lastRawPresupuestos ? {...lastRawPresupuestos} : undefined);
    setDataBackup([...data]);
    setIsAddingFile(true);
  };

  if (isDashboardActive) {
    return (
      <>
        <Dashboard 
          data={data} 
          sistemaData={sistemaData}
          fileName={fileName} 
          onReset={handleReset} 
          onAddFiles={startAddingFiles}
          onRevalidate={handleRevalidate}
          presupuestos={presupuestos}
          onPresupuestoChange={handlePresupuestoChange}
          historialData={historialData}
        />
        {isAddingFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full p-8 relative my-8">
              <button
                onClick={handleCancel}
                className="absolute top-4 right-4 text-secondary-400 hover:text-secondary-600 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-secondary-900">Agregar o Quitar Archivos</h2>
                <p className="mt-2 text-secondary-600">Gestione los archivos cargados para el análisis.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                <div className="space-y-4">
                  <FileUpload 
                    onDataLoaded={handleDataLoaded} 
                    type="SUCURSAL"
                    title="Cargar Planilla Sucursal"
                    description="Archivo principal de costos y rutas"
                  />
                  <div className="space-y-2">
                    {sucursalFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between px-3 py-1.5 text-green-600 bg-green-50 rounded-lg border border-green-100">
                        <span className="text-xs font-medium truncate">{file.name}</span>
                        <button onClick={() => removeFile(index, "SUCURSAL")} className="ml-1 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <FileUpload 
                    onDataLoaded={handleDataLoaded} 
                    type="CONSOLIDADO"
                    title="Cargar Consolidado"
                    description="Archivo exportado con datos completos"
                  />
                  <div className="space-y-2">
                    {consolidatedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between px-3 py-1.5 text-primary-600 bg-primary-50 rounded-lg border border-primary-100">
                        <span className="text-xs font-medium truncate">{file.name}</span>
                        <button onClick={() => removeFile(index, "CONSOLIDADO")} className="ml-1 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <FileUpload 
                    onDataLoaded={handleDataLoaded} 
                    type="CONSULTA_GLOBAL"
                    title="Cargar Consulta Global"
                    description="Datos del sistema para cruce"
                  />
                  <div className="space-y-2">
                    {consultaGlobalFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between px-3 py-1.5 text-blue-600 bg-blue-50 rounded-lg border border-blue-100">
                        <span className="text-xs font-medium truncate">{file.name}</span>
                        <button onClick={() => removeFile(index, "CONSULTA_GLOBAL")} className="ml-1 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <FileUpload 
                    onDataLoaded={handleDataLoaded} 
                    type="HDR_DISTRIBUIDOR"
                    title="Cargar HDR Distribuidores"
                    description="Datos de distribuidores para cruce"
                  />
                  <div className="space-y-2">
                    {hdrDistribuidorFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between px-3 py-1.5 text-purple-600 bg-purple-50 rounded-lg border border-purple-100">
                        <span className="text-xs font-medium truncate">{file.name}</span>
                        <button onClick={() => removeFile(index, "HDR_DISTRIBUIDOR")} className="ml-1 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <FileUpload 
                    onDataLoaded={handleDataLoaded} 
                    type="HISTORIAL"
                    title="Cargar Historial"
                    description="Historial de meses pasados"
                  />
                  <div className="space-y-2">
                    {historialFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between px-3 py-1.5 text-orange-600 bg-orange-50 rounded-lg border border-orange-100">
                        <span className="text-xs font-medium truncate">{file.name}</span>
                        <button onClick={() => removeFile(index, "HISTORIAL")} className="ml-1 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {(sucursalFiles.length > 0 || consolidatedFiles.length > 0 || consultaGlobalFiles.length > 0 || hdrDistribuidorFiles.length > 0 || historialFiles.length > 0) && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => {
                      if (pendingData.length > 0) {
                        setShowModal(true);
                      } else {
                        handleConfirm([], {}, false, []);
                        setIsAddingFile(false);
                      }
                    }}
                    className="flex items-center space-x-3 px-8 py-3 bg-primary-600 text-white rounded-xl font-bold shadow-lg hover:bg-primary-700 transition-all cursor-pointer"
                  >
                    <Activity className="w-5 h-5" />
                    <span>Actualizar Análisis</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {showModal && (
          <ValidationModal
            data={pendingData}
            existingData={data}
            consultaGlobal={consultaGlobal}
            totals={totals}
            existingPresupuestos={presupuestos}
            pendingPresupuestos={pendingPresupuestos}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            missingColumns={missingColumns}
            historialData={historialData}
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

      <div className="w-full max-w-4xl text-center mb-8 relative z-10">
        <div className="inline-flex items-center justify-center p-4 bg-primary-600 rounded-2xl mb-6 shadow-lg">
          <BarChart3 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-secondary-900 tracking-tight">
          Sistema de Análisis Logístico Flash
        </h1>
        <p className="mt-4 text-lg text-secondary-600 max-w-2xl mx-auto">
          Cargue sus planillas de sucursal para comenzar el análisis. 
          Opcionalmente, cargue el archivo consolidado para recuperar datos completos.
        </p>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10 mb-8">
        <div className="space-y-4">
          <FileUpload 
            onDataLoaded={handleDataLoaded} 
            type="SUCURSAL"
            title="Cargar Planilla Sucursal"
            description="Archivo principal de costos y rutas"
          />
          <div className="space-y-2">
            {sucursalFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2 text-green-600 bg-green-50 rounded-lg border border-green-100 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(index, "SUCURSAL")}
                  className="ml-2 p-1 hover:bg-green-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <FileUpload 
            onDataLoaded={handleDataLoaded} 
            type="CONSOLIDADO"
            title="Cargar Consolidado"
            description="Archivo exportado con datos completos"
          />
          <div className="space-y-2">
            {consolidatedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2 text-primary-600 bg-primary-50 rounded-lg border border-primary-100 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(index, "CONSOLIDADO")}
                  className="ml-2 p-1 hover:bg-primary-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <FileUpload 
            onDataLoaded={handleDataLoaded} 
            type="CONSULTA_GLOBAL"
            title="Cargar Consulta Global"
            description="Datos del sistema para cruce"
          />
          <div className="space-y-2">
            {consultaGlobalFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2 text-blue-600 bg-blue-50 rounded-lg border border-blue-100 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(index, "CONSULTA_GLOBAL")}
                  className="ml-2 p-1 hover:bg-blue-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <FileUpload 
            onDataLoaded={handleDataLoaded} 
            type="HDR_DISTRIBUIDOR"
            title="Cargar HDR Distribuidores"
            description="Datos de distribuidores para cruce"
          />
          <div className="space-y-2">
            {hdrDistribuidorFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2 text-purple-600 bg-purple-50 rounded-lg border border-purple-100 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(index, "HDR_DISTRIBUIDOR")}
                  className="ml-2 p-1 hover:bg-purple-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <FileUpload 
            onDataLoaded={handleDataLoaded} 
            type="HISTORIAL"
            title="Cargar Historial"
            description="Historial de meses pasados"
          />
          <div className="space-y-2">
            {historialFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2 text-orange-600 bg-orange-50 rounded-lg border border-orange-100 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(index, "HISTORIAL")}
                  className="ml-2 p-1 hover:bg-orange-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(sucursalFiles.length > 0 || consolidatedFiles.length > 0 || consultaGlobalFiles.length > 0 || hdrDistribuidorFiles.length > 0 || historialFiles.length > 0) && (
        <div className="w-full max-w-5xl flex justify-center mb-8 relative z-10">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-3 px-8 py-4 bg-primary-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-primary-700 transform hover:scale-105 transition-all cursor-pointer"
          >
            <Activity className="w-6 h-6" />
            <span>{pendingData.length > 0 ? "Realizar Análisis" : "Actualizar Análisis"}</span>
          </button>
        </div>
      )}

      <div className="w-full max-w-4xl bg-white rounded-2xl p-8 shadow-sm border border-secondary-100 relative z-10">
        <h2 className="text-xl font-semibold text-secondary-900 mb-6 flex items-center">
          <Activity className="w-6 h-6 mr-2 text-primary-600" />
          Resumen de Capacidades
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="font-medium text-secondary-800">Análisis Estándar</h3>
            <ul className="space-y-2 text-sm text-secondary-600">
              <li className="flex items-start">
                <span className="mr-2 text-primary-500">•</span>
                Validación automática de columnas y datos
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-primary-500">•</span>
                Cálculo de costos por pieza y eficiencia
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-primary-500">•</span>
                Dashboard interactivo por sucursal y zona
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h3 className="font-medium text-secondary-800">Análisis de Sistema (Cruce)</h3>
            <ul className="space-y-2 text-sm text-secondary-600">
              <li className="flex items-start">
                <span className="mr-2 text-primary-500">•</span>
                Detección de diferencias entre planilla y sistema
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-primary-500">•</span>
                Control de piezas entregadas vs reportadas
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-primary-500">•</span>
                Identificación de hojas de ruta no encontradas
              </li>
            </ul>
          </div>
        </div>
      </div>

      {showModal && (
        <ValidationModal
          data={pendingData}
          existingData={data}
          consultaGlobal={consultaGlobal}
          hdrDistribuidores={hdrDistribuidores}
          totals={totals}
          existingPresupuestos={presupuestos}
          pendingPresupuestos={pendingPresupuestos}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          missingColumns={missingColumns}
          historialData={historialData}
        />
      )}
    </div>
  );
}
