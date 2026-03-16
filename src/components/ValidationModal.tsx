import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { LogisticsData } from "../types";
import { getRouteId, normalizeString, normalizeDate, getDifferences, normalizeZone } from "../utils";

interface ValidationModalProps {
  data: LogisticsData[];
  existingData?: LogisticsData[];
  totals?: { piezas: number; bultos: number };
  existingPresupuestos?: Record<string, number>;
  pendingPresupuestos?: Record<string, number>;
  onConfirm: (data: LogisticsData[], newPresupuestos?: Record<string, number>, overwritePresupuestos?: boolean, idsToRemove?: string[]) => void;
  onCancel: () => void;
}

const KNOWN_BRANCHES = [
  "Tucuman",
  "La Rioja",
  "Catamarca",
  "Salta",
  "Jujuy",
  "Santiago"
];

const KNOWN_VEHICLES = [
  "Auto",
  "Utilitario Chico",
  "Utilitario Grande",
  "Moto",
  "Local Comercial",
  "Camión"
];

const areRoutesEqual = (a: LogisticsData, b: LogisticsData) => {
  return getDifferences(a, b).length === 0;
};

export default function ValidationModal({
  data,
  existingData = [],
  totals,
  existingPresupuestos,
  pendingPresupuestos,
  onConfirm,
  onCancel,
}: ValidationModalProps) {
  const [selectedSucursal, setSelectedSucursal] = useState(KNOWN_BRANCHES[0]);
  const [budgetResolutions, setBudgetResolutions] = useState<Record<string, 'replace' | 'keep'>>({});
  const [conflictResolution, setConflictResolution] = useState<Record<string, 'replace' | 'keep'>>({});
  
  const unknownVehicles = useMemo(() => Array.from(new Set(data.map(d => d.vehiculo))).filter(v => !KNOWN_VEHICLES.includes(v)), [data]);
  const unknownZones = useMemo(() => Array.from(new Set(data.map(d => d.zona))).filter(z => normalizeZone(z) === null && z), [data]);
  
  const needsMapping = unknownVehicles.length > 0 || unknownZones.length > 0;
  const isPending = data.some((d) => d.sucursal === "PENDING_SUCURSAL");
  
  const hasDifferentPresupuestos = useMemo(() => {
    if (!pendingPresupuestos) return false;
    
    return Object.entries(pendingPresupuestos).some(([suc, amount]) => {
      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
      const normalizedBranch = normalizeString(branchName);
      const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
      
      if (!isKnown) return false;
      
      const existingAmount = existingPresupuestos?.[branchName];
      // Only consider it "different" if it's new or the amount changed
      return existingAmount === undefined || existingAmount !== amount;
    });
  }, [pendingPresupuestos, existingPresupuestos, selectedSucursal]);

  const [step, setStep] = useState<'mapping' | 'branch_selection' | 'budget_validation' | 'conflicts' | 'validation'>(
    needsMapping ? 'mapping' : 
    isPending ? 'branch_selection' : 
    hasDifferentPresupuestos ? 'budget_validation' : 
    'conflicts'
  );

  const [vehicleMapping, setVehicleMapping] = useState<Record<string, string>>({});
  const [zoneMapping, setZoneMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    const initialMapping: Record<string, string> = {};
    unknownVehicles.forEach(v => {
      initialMapping[v] = KNOWN_VEHICLES[0];
    });
    setVehicleMapping(initialMapping);

    const initialZoneMapping: Record<string, string> = {};
    unknownZones.forEach(z => {
      initialZoneMapping[z] = "CAPITAL";
    });
    setZoneMapping(initialZoneMapping);
  }, [unknownVehicles, unknownZones]);

  const mappedData = useMemo(() => {
    return data.map(d => ({
      ...d,
      vehiculo: vehicleMapping[d.vehiculo] || d.vehiculo,
      zona: normalizeZone(d.zona) || zoneMapping[d.zona] || d.zona,
    }));
  }, [data, vehicleMapping, zoneMapping]);

  const sucursalesEnArchivo = Array.from(new Set(mappedData.map(d => d.sucursal).filter(s => s !== "PENDING_SUCURSAL")));
  
  const hasExistingPresupuestos = existingPresupuestos && Object.keys(existingPresupuestos).length > 0;
  
  const budgetStatus = useMemo(() => {
    const hasExisting = existingPresupuestos && Object.keys(existingPresupuestos).length > 0;
    
    // Check if any budgets are actually being changed/added
    const anyChanges = Object.entries(budgetResolutions).some(([suc, res]) => {
      if (res !== 'replace') return false;
      
      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
      const amount = pendingPresupuestos?.[suc];
      const existing = existingPresupuestos?.[branchName];
      
      const normalizedBranch = normalizeString(branchName);
      const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
      if (!isKnown) return false;

      return existing === undefined || existing !== amount;
    });

    if (anyChanges) {
      return { text: "Reemplazado", color: "text-orange-500" };
    }
    
    if (hasExisting) {
      return { text: "Establecido", color: "text-black" };
    }

    if (hasDifferentPresupuestos) {
      return { text: "Agregado", color: "text-green-600" };
    }

    return { text: "No encontrados", color: "text-secondary-500" };
  }, [existingPresupuestos, pendingPresupuestos, budgetResolutions, hasDifferentPresupuestos, selectedSucursal]);

  const unknownZonesWithSucursal = unknownZones.map(z => {
    const sucursales = Array.from(new Set(data.filter(d => d.zona === z).map(d => d.sucursal)));
    return { zona: z, sucursales };
  });

  // Duplicate and Conflict detection
  const { duplicates, conflicts, newRoutes } = useMemo(() => {
    if (step === 'mapping') return { duplicates: [], conflicts: [], newRoutes: [] };

    const dups: LogisticsData[] = [];
    const confs: { id: string; existing: LogisticsData; incoming: LogisticsData }[] = [];
    const news: LogisticsData[] = [];

    const existingMap = new Map<string, LogisticsData>();
    existingData.forEach(d => {
      existingMap.set(getRouteId(d), d);
    });

    mappedData.forEach(incoming => {
      const sucursal = isPending ? selectedSucursal : incoming.sucursal;
      const incomingWithSucursal = { ...incoming, sucursal };
      const id = getRouteId(incomingWithSucursal);
      const existing = existingMap.get(id);

      if (existing) {
        if (areRoutesEqual(existing, incomingWithSucursal)) {
          dups.push(incomingWithSucursal);
        } else {
          confs.push({ id, existing, incoming: incomingWithSucursal });
        }
      } else {
        news.push(incomingWithSucursal);
      }
    });

    return { duplicates: dups, conflicts: confs, newRoutes: news };
  }, [mappedData, existingData, isPending, selectedSucursal, step]);

  useEffect(() => {
    if (step === 'conflicts' || step === 'validation') {
      const initialConflicts: Record<string, 'replace' | 'keep'> = {};
      conflicts.forEach(c => {
        if (conflictResolution[c.id] === undefined) {
          initialConflicts[c.id] = 'replace';
        }
      });
      if (Object.keys(initialConflicts).length > 0) {
        setConflictResolution(prev => ({ ...prev, ...initialConflicts }));
      }
    }
  }, [conflicts, step]);

  useEffect(() => {
    if (step === 'conflicts' && conflicts.length === 0) {
      setStep('validation');
    }
  }, [conflicts, step]);

  const uniqueDistribuidores = new Set(mappedData.map((d) => d.distribuidor)).size;
  const uniqueSucursales = isPending ? 1 : new Set(mappedData.map((d) => d.sucursal)).size;
  const totalPiezas =
    totals?.piezas ?? mappedData.reduce((acc, curr) => acc + curr.piezasTotal, 0);

  useEffect(() => {
    if (step === 'budget_validation') {
      const initial: Record<string, 'replace' | 'keep'> = {};
      Object.keys(pendingPresupuestos || {}).forEach(suc => {
        if (budgetResolutions[suc] === undefined) {
          initial[suc] = 'replace';
        }
      });
      if (Object.keys(initial).length > 0) {
        setBudgetResolutions(prev => ({ ...prev, ...initial }));
      }
    }
  }, [pendingPresupuestos, step]);

  const handleConfirm = () => {
    if (step === 'mapping') {
      if (isPending) {
        setStep('branch_selection');
      } else if (hasDifferentPresupuestos) {
        setStep('budget_validation');
      } else if (conflicts.length > 0) {
        setStep('conflicts');
      } else {
        setStep('validation');
      }
      return;
    }

    if (step === 'branch_selection') {
      if (hasDifferentPresupuestos) {
        setStep('budget_validation');
      } else if (conflicts.length > 0) {
        setStep('conflicts');
      } else {
        setStep('validation');
      }
      return;
    }

    if (step === 'budget_validation') {
      if (conflicts.length > 0) {
        setStep('conflicts');
      } else {
        setStep('validation');
      }
      return;
    }
    
    if (step === 'conflicts') {
      setStep('validation');
      return;
    }

    const dataToAdd = [
      ...newRoutes,
      ...conflicts.filter(c => conflictResolution[c.id] === 'replace').map(c => c.incoming)
    ].map((d) => ({
      ...d,
      vehiculo: vehicleMapping[d.vehiculo] || d.vehiculo,
      zona: normalizeZone(d.zona) || zoneMapping[d.zona] || d.zona,
    }));

    // For 'replace' conflicts, we need to tell App.tsx to remove the old ones.
    // I'll update the onConfirm signature to handle this if possible, 
    // or just handle it in App.tsx by passing the IDs to remove.
    
    // Actually, I'll just pass the final data to App.tsx and let it handle the merge logic.
    // But App.tsx is simple. Let's make it smarter.
    
    let finalPresupuestos: Record<string, number> = {};
    const incomingPresupuestos = { ...pendingPresupuestos };
    
    // Handle PENDING_SUCURSAL if exists
    if (isPending && incomingPresupuestos["PENDING_SUCURSAL"] !== undefined) {
      incomingPresupuestos[selectedSucursal] = incomingPresupuestos["PENDING_SUCURSAL"];
      delete incomingPresupuestos["PENDING_SUCURSAL"];
      
      // Also update resolution key
      if (budgetResolutions["PENDING_SUCURSAL"]) {
        budgetResolutions[selectedSucursal] = budgetResolutions["PENDING_SUCURSAL"];
      }
    }

    Object.entries(incomingPresupuestos).forEach(([suc, amount]) => {
      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
      const normalizedBranch = normalizeString(branchName);
      const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
      
      if (isKnown) {
        const resolution = budgetResolutions[suc] || 'replace';
        if (resolution === 'replace') {
          finalPresupuestos[suc] = amount as number;
        }
      }
    });

    const idsToRemove = conflicts
      .filter(c => conflictResolution[c.id] === 'replace')
      .map(c => c.id);

    onConfirm(dataToAdd, finalPresupuestos, true, idsToRemove);
  };

  const replacedRoutes = useMemo(() => {
    return conflicts.filter(c => conflictResolution[c.id] === 'replace');
  }, [conflicts, conflictResolution]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary-900/40 backdrop-blur-sm overflow-y-auto py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-4xl bg-white rounded-xl border border-secondary-200 overflow-hidden my-auto"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="px-5 py-4 border-b border-secondary-100 flex items-center space-x-3">
          <div className="p-2 bg-primary-50 rounded-lg">
            <FileSpreadsheet className="w-5 h-5 text-primary-600" />
          </div>
          <h2 className="text-lg font-semibold text-secondary-900">
            Validación de Datos
          </h2>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {step === 'mapping' ? (
            <div className="space-y-6">
              {unknownVehicles.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-center space-x-2 mb-4 text-amber-700">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-bold">Vehículos no reconocidos</h3>
                  </div>
                  <p className="text-sm text-amber-800 mb-4">
                    Se encontraron vehículos que no coinciden con las categorías del sistema. Por favor, asígnelos correctamente:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {unknownVehicles.map(v => (
                      <div key={v} className="space-y-1">
                        <label className="text-xs font-bold text-amber-900 uppercase tracking-wider">"{v}"</label>
                        <select
                          value={vehicleMapping[v] || KNOWN_VEHICLES[0]}
                          onChange={(e) => setVehicleMapping(prev => ({ ...prev, [v]: e.target.value }))}
                          className="w-full text-sm border-amber-300 rounded-lg bg-white focus:ring-amber-500 focus:border-amber-500"
                        >
                          {KNOWN_VEHICLES.map(kv => (
                            <option key={kv} value={kv}>{kv}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {unknownZones.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-center space-x-2 mb-4 text-amber-700">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-bold">Zonas no reconocidas</h3>
                  </div>
                  <p className="text-sm text-amber-800 mb-4">
                    Se encontraron zonas que no coinciden con "Capital" o "Interior". Por favor, verifique si están bien asignadas:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {unknownZonesWithSucursal.map(({ zona, sucursales }) => (
                      <div key={zona} className="space-y-1">
                        <label className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                          "{zona}" <span className="text-amber-600 font-normal lowercase">(en {sucursales.join(", ")})</span>
                        </label>
                        <select
                          value={zoneMapping[zona] || "CAPITAL"}
                          onChange={(e) => setZoneMapping(prev => ({ ...prev, [zona]: e.target.value }))}
                          className="w-full text-sm border-amber-300 rounded-lg bg-white focus:ring-amber-500 focus:border-amber-500"
                        >
                          <option value="CAPITAL">CAPITAL</option>
                          <option value="INTERIOR">INTERIOR</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="text-center py-4">
                <p className="text-sm font-medium text-secondary-600">
                  Una vez confirmadas las zonas y vehículos, el sistema procederá a validar duplicados y conflictos.
                </p>
              </div>
            </div>
          ) : step === 'branch_selection' ? (
            <div className="space-y-6">
              <div className="p-4 bg-primary-50 rounded-xl border border-primary-200">
                <div className="flex items-center space-x-2 mb-4 text-primary-700">
                  <FileSpreadsheet className="w-5 h-5" />
                  <h3 className="font-bold">Sucursal no detectada</h3>
                </div>
                <p className="text-sm text-primary-800 mb-6">
                  El sistema no pudo detectar automáticamente la sucursal en el archivo. Por favor, seleccione la sucursal correspondiente:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {KNOWN_BRANCHES.map((branch) => (
                    <button
                      key={branch}
                      onClick={() => setSelectedSucursal(branch)}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 text-center group ${
                        selectedSucursal === branch
                          ? "border-primary-600 bg-primary-100 shadow-md"
                          : "border-secondary-200 bg-white hover:border-primary-300 hover:bg-primary-50"
                      }`}
                    >
                      <span className={`text-sm font-bold ${
                        selectedSucursal === branch ? "text-primary-700" : "text-secondary-600 group-hover:text-primary-600"
                      }`}>
                        {branch}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : step === 'budget_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center space-x-2 mb-4 text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-bold">Presupuestos detectados</h3>
                </div>
                <p className="text-sm text-amber-800 mb-6">
                  Se encontraron presupuestos en el archivo cargado. Por favor, verifique la información:
                </p>
                
                <div className="space-y-2">
                  {Object.entries(pendingPresupuestos || {})
                    .filter(([suc, amount]) => {
                      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
                      const normalizedBranch = normalizeString(branchName);
                      const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
                      if (!isKnown) return false;
                      
                      const existingAmount = existingPresupuestos?.[branchName];
                      return existingAmount === undefined || existingAmount !== amount;
                    })
                    .map(([suc, amount]) => {
                      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
                      const existingAmount = existingPresupuestos?.[branchName];

                      return (
                        <div key={suc} className="px-3 py-2 bg-white rounded-lg border border-amber-100 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex-1 flex flex-wrap items-center gap-x-6 gap-y-1">
                              <span className="font-bold text-secondary-900 min-w-[100px]">{branchName}</span>
                              
                              <div className="flex items-center space-x-4">
                                {existingAmount !== undefined && (
                                  <div className="flex items-center space-x-1.5">
                                    <span className="text-[9px] font-bold text-secondary-500 uppercase">Establecido:</span>
                                    <span className="text-secondary-600 font-medium text-xs">${existingAmount.toLocaleString()}</span>
                                  </div>
                                )}
                                
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-[9px] font-bold text-primary-500 uppercase">Nuevo:</span>
                                  <span className="text-primary-700 font-bold text-xs">${amount.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-5 pt-2 sm:pt-0 border-t sm:border-t-0 border-amber-50">
                              <label className="flex items-center space-x-1.5 cursor-pointer group">
                                <input
                                  type="radio"
                                  checked={budgetResolutions[suc] === 'replace'}
                                  onChange={() => setBudgetResolutions(prev => ({ ...prev, [suc]: 'replace' }))}
                                  className="w-3.5 h-3.5 text-amber-600 focus:ring-amber-500"
                                />
                                <span className="text-[10px] font-bold text-amber-600 group-hover:text-amber-700 uppercase tracking-wider">Reemplazar</span>
                              </label>
                              <label className="flex items-center space-x-1.5 cursor-pointer group">
                                <input
                                  type="radio"
                                  checked={budgetResolutions[suc] === 'keep'}
                                  onChange={() => setBudgetResolutions(prev => ({ ...prev, [suc]: 'keep' }))}
                                  className="w-3.5 h-3.5 text-secondary-600 focus:ring-secondary-500"
                                />
                                <span className="text-[10px] font-bold text-secondary-500 group-hover:text-secondary-700 uppercase tracking-wider">Mantener</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : step === 'conflicts' ? (
            <div className="space-y-4">
              <div className="p-4 bg-danger-50 border border-danger-200 rounded-xl">
                <div className="flex items-center space-x-2 mb-4 text-danger-700">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-bold">Conflictos de datos detectados</h3>
                </div>
                <p className="text-sm text-danger-800 mb-4">
                  Se encontraron {conflicts.length} rutas que ya existen pero con datos diferentes. Por favor, seleccione qué acción tomar para cada una:
                </p>
                <div className="space-y-4">
                  {conflicts.map((c) => (
                    <div key={c.id} className="p-4 bg-white rounded-xl border border-danger-100 shadow-sm">
                      <div className="space-y-4">
                        {getDifferences(c.existing, c.incoming).map((diff, idx) => (
                          <div key={idx} className="space-y-2">
                            <p className="text-xs font-medium text-secondary-900">
                              {c.incoming.fecha} - {c.incoming.sucursal} - Ruta {c.incoming.hojaRuta} - <span className="text-danger-600 font-bold">Columna: {diff.field}</span>
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-2.5 bg-secondary-50 rounded-lg border border-secondary-200">
                                <span className="text-[9px] font-bold text-secondary-500 uppercase block mb-1">Dato Actual:</span>
                                <span className="text-xs text-secondary-900 font-medium">
                                  {typeof diff.existing === 'number' && diff.field === 'Costo' 
                                    ? `$${diff.existing.toLocaleString()}` 
                                    : String(diff.existing)}
                                </span>
                              </div>
                              <div className="p-2.5 bg-primary-50 rounded-lg border border-primary-200">
                                <span className="text-[9px] font-bold text-primary-500 uppercase block mb-1">Dato Nuevo:</span>
                                <span className="text-xs text-primary-900 font-bold">
                                  {typeof diff.incoming === 'number' && diff.field === 'Costo' 
                                    ? `$${diff.incoming.toLocaleString()}` 
                                    : String(diff.incoming)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center space-x-8 mt-4 pt-4 border-t border-danger-50">
                        <label className="flex items-center space-x-2.5 cursor-pointer group">
                          <input
                            type="radio"
                            checked={conflictResolution[c.id] === 'replace'}
                            onChange={() => setConflictResolution(prev => ({ ...prev, [c.id]: 'replace' }))}
                            className="w-4 h-4 text-danger-600 focus:ring-danger-500"
                          />
                          <span className="text-xs font-bold text-danger-800 group-hover:text-danger-900 uppercase tracking-wide">Reemplazar</span>
                        </label>
                        <label className="flex items-center space-x-2.5 cursor-pointer group">
                          <input
                            type="radio"
                            checked={conflictResolution[c.id] === 'keep'}
                            onChange={() => setConflictResolution(prev => ({ ...prev, [c.id]: 'keep' }))}
                            className="w-4 h-4 text-secondary-600 focus:ring-secondary-500"
                          />
                          <span className="text-xs font-bold text-secondary-800 group-hover:text-secondary-900 uppercase tracking-wide">Mantener actual</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: "Rutas extraídas", value: mappedData.length },
                  { label: "Distribuidores", value: uniqueDistribuidores },
                  { label: "Sucursales", value: uniqueSucursales },
                  { label: "Piezas Totales", value: totalPiezas },
                  { label: "Sucursales detectadas", value: sucursalesEnArchivo.length > 0 ? sucursalesEnArchivo.join(", ") : "Ninguna" },
                  { 
                    label: "Presupuestos", 
                    value: budgetStatus.text,
                    colorClass: budgetStatus.color
                  },
                  { 
                    label: "Rutas duplicadas detectadas", 
                    value: duplicates.length,
                    colorClass: duplicates.length > 0 ? "text-amber-600" : "text-secondary-500"
                  },
                  { 
                    label: "Rutas agregadas", 
                    value: newRoutes.length,
                    colorClass: newRoutes.length > 0 ? "text-primary-600" : "text-secondary-500"
                  },
                  { 
                    label: "Rutas modificadas", 
                    value: conflicts.length,
                    colorClass: conflicts.length > 0 ? "text-indigo-600" : "text-secondary-500"
                  },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex flex-col px-4 py-3 bg-secondary-50 rounded-lg border border-secondary-100 shadow-sm"
                  >
                    <span className="text-[10px] font-bold text-secondary-500 uppercase tracking-wider">
                      {item.label}
                    </span>
                    <span className={`text-sm font-bold mt-1 ${item.colorClass || 'text-secondary-900'}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              {newRoutes.length > 0 && (
                <div className="mt-4 p-3 bg-primary-50/50 border border-primary-100 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2 text-primary-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Lista de rutas agregadas</h3>
                  </div>
                  <div className="max-h-32 overflow-y-auto border border-primary-100 rounded bg-white">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-primary-50 text-primary-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 font-bold uppercase w-px whitespace-nowrap">Sucursal</th>
                          <th className="px-3 py-1.5 font-bold uppercase w-px whitespace-nowrap">Fecha</th>
                          <th className="px-3 py-1.5 font-bold uppercase">Ruta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-primary-50">
                        {newRoutes.map((route, idx) => (
                          <tr key={idx} className="hover:bg-primary-50/30">
                            <td className="px-3 py-1.5 text-secondary-700 whitespace-nowrap">{route.sucursal}</td>
                            <td className="px-3 py-1.5 text-secondary-700 whitespace-nowrap">{route.fecha}</td>
                            <td className="px-3 py-1.5 text-secondary-900 font-bold">{route.hojaRuta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {replacedRoutes.length > 0 && (
                <div className="mt-4 p-3 bg-primary-50/50 border border-primary-100 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2 text-primary-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Lista de rutas reemplazadas</h3>
                  </div>
                  <div className="max-h-32 overflow-y-auto border border-primary-100 rounded bg-white">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-primary-50 text-primary-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 font-bold uppercase w-px whitespace-nowrap">Sucursal</th>
                          <th className="px-3 py-1.5 font-bold uppercase w-px whitespace-nowrap">Fecha</th>
                          <th className="px-3 py-1.5 font-bold uppercase w-px whitespace-nowrap">Ruta</th>
                          <th className="px-3 py-1.5 font-bold uppercase">Cambios</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-primary-50">
                        {replacedRoutes.map((c, idx) => {
                          const diffs = getDifferences(c.existing, c.incoming);
                          return (
                            <tr key={idx} className="hover:bg-primary-50/30">
                              <td className="px-3 py-1.5 text-secondary-700 whitespace-nowrap">{c.incoming.sucursal}</td>
                              <td className="px-3 py-1.5 text-secondary-700 whitespace-nowrap">{c.incoming.fecha}</td>
                              <td className="px-3 py-1.5 text-secondary-900 font-bold whitespace-nowrap">{c.incoming.hojaRuta}</td>
                              <td className="px-3 py-1.5 text-primary-700">
                                <div className="flex flex-wrap gap-1">
                                  {diffs.map((d, i) => (
                                    <span key={i} className="bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100 whitespace-nowrap">
                                      {d.field}: {typeof d.incoming === 'number' && d.field === 'Costo' ? `$${d.incoming.toLocaleString()}` : String(d.incoming)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-4 text-center">
                <p className="text-sm font-medium text-secondary-800">
                  ¿Desea continuar con el análisis?
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 bg-secondary-50 border-t border-secondary-100 flex items-center justify-center space-x-4">
          <button
            onClick={onCancel}
            className="inline-flex justify-center items-center px-8 py-2.5 text-sm font-semibold text-white bg-danger-600 rounded-lg hover:bg-danger-700 transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-danger-500 cursor-pointer min-w-[140px]"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="inline-flex justify-center items-center px-8 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 cursor-pointer min-w-[140px]"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {step === 'mapping' ? 'Siguiente' : step === 'branch_selection' ? 'Siguiente' : step === 'budget_validation' ? 'Siguiente' : step === 'conflicts' ? 'Confirmar Diferencias' : 'Continuar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
