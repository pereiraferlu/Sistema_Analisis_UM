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

  const differentBudgetsCount = useMemo(() => {
    return Object.entries(pendingPresupuestos || {})
      .filter(([suc, amount]) => {
        const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
        const normalizedBranch = normalizeString(branchName);
        const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
        if (!isKnown) return false;
        
        const existingAmount = existingPresupuestos?.[branchName];
        return existingAmount === undefined || existingAmount !== amount;
      }).length;
  }, [pendingPresupuestos, selectedSucursal, existingPresupuestos]);

  const [step, setStep] = useState<'quantity_validation' | 'novedad_validation' | 'mapping' | 'branch_selection' | 'budget_validation' | 'conflicts' | 'validation'>(
    'quantity_validation'
  );
  const [stepHistory, setStepHistory] = useState<string[]>([]);

  const [vehicleMapping, setVehicleMapping] = useState<Record<string, string>>({});
  const [zoneMapping, setZoneMapping] = useState<Record<string, string>>({});
  const [corrections, setCorrections] = useState<Record<number, Partial<LogisticsData>>>({});
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
  const [allDeliveredIndices, setAllDeliveredIndices] = useState<Set<number>>(new Set());
  const [allNoveltyIndices, setAllNoveltyIndices] = useState<Set<number>>(new Set());

  const mappedData = useMemo<LogisticsData[]>(() => {
    return data.map((d, index) => {
      const correction = corrections[index] || {};
      const isAllDelivered = allDeliveredIndices.has(index);
      const isAllNovelty = allNoveltyIndices.has(index);

      const finalItem = {
        ...d,
        ...correction,
        vehiculo: vehicleMapping[d.vehiculo] || d.vehiculo,
        zona: normalizeZone(d.zona) || zoneMapping[d.zona] || d.zona,
      } as LogisticsData;

      if (isAllDelivered && finalItem.bultosTotal >= finalItem.piezasTotal) {
        finalItem.piezasEntregadas = finalItem.piezasTotal;
        finalItem.piezasNoEntregadas = 0;
        finalItem.bultosEntregados = finalItem.bultosTotal;
        finalItem.bultosDevueltos = 0;
      }

      if (isAllNovelty) {
        finalItem.visitadasNovedad = finalItem.piezasTotal;
        finalItem.noVisitadas = 0;
      }

      // Sync extra fields to ensure backend receives correct data even after corrections
      finalItem.piezasSinNovedad = finalItem.piezasEntregadas;
      finalItem.bultosNoEntregados = finalItem.bultosDevueltos;

      return finalItem;
    });
  }, [data, vehicleMapping, zoneMapping, corrections, allDeliveredIndices, allNoveltyIndices]);

  const initialDiscrepancyIndices = useMemo(() => {
    return data.map((d, index) => {
      const correction = corrections[index] || {};
      
      const piezasTotal = correction.piezasTotal ?? d.piezasTotal;
      const bultosTotal = correction.bultosTotal ?? d.bultosTotal;
      
      const piezasEntregadas = correction.piezasEntregadas ?? d.piezasEntregadas;
      const piezasNoEntregadas = correction.piezasNoEntregadas ?? d.piezasNoEntregadas;
      const bultosEntregados = correction.bultosEntregados ?? d.bultosEntregados;
      const bultosDevueltos = correction.bultosDevueltos ?? d.bultosDevueltos;

      const hasQuantityError = (piezasEntregadas + piezasNoEntregadas !== piezasTotal) ||
                               (bultosEntregados + bultosDevueltos !== bultosTotal);
      const hasBultosPiezasError = bultosTotal < piezasTotal || 
                                   bultosEntregados < piezasEntregadas || 
                                   bultosDevueltos < piezasNoEntregadas;
      return (hasQuantityError || hasBultosPiezasError) ? index : -1;
    }).filter(idx => idx !== -1);
  }, [data, corrections]);

  const quantityDiscrepancies = useMemo(() => {
    return initialDiscrepancyIndices.map(index => ({
      data: mappedData[index],
      index
    }));
  }, [initialDiscrepancyIndices, mappedData]);

  const correctedPiezasCount = useMemo(() => {
    return (Object.values(corrections) as Partial<LogisticsData>[]).filter(c => c.piezasTotal !== undefined || c.piezasEntregadas !== undefined || c.piezasNoEntregadas !== undefined).length;
  }, [corrections]);

  const correctedBultosCount = useMemo(() => {
    return (Object.values(corrections) as Partial<LogisticsData>[]).filter(c => c.bultosTotal !== undefined || c.bultosEntregados !== undefined || c.bultosDevueltos !== undefined).length;
  }, [corrections]);

  const initialNovedadDiscrepancyIndices = useMemo(() => {
    return data.map((d, index) => {
      const correction = corrections[index] || {};

      const piezasTotal = correction.piezasTotal ?? d.piezasTotal;
      const visitadasNovedad = correction.visitadasNovedad ?? d.visitadasNovedad;
      const noVisitadas = correction.noVisitadas ?? d.noVisitadas;

      // The user's logic: visitadasNovedad + noVisitadas must equal piezasTotal
      const hasNovedadError = (visitadasNovedad + noVisitadas !== piezasTotal);
      return hasNovedadError ? index : -1;
    }).filter(idx => idx !== -1);
  }, [data, corrections]);

  const novedadDiscrepancies = useMemo(() => {
    return initialNovedadDiscrepancyIndices.map(index => ({
      data: mappedData[index],
      index
    }));
  }, [initialNovedadDiscrepancyIndices, mappedData]);

  const correctedNovedadesCount = useMemo(() => {
    return (Object.values(corrections) as Partial<LogisticsData>[]).filter(c => c.visitadasNovedad !== undefined || c.noVisitadas !== undefined).length;
  }, [corrections]);

  useEffect(() => {
    // Initial step determination
    if (isPending) {
      setStep('branch_selection');
    } else if (quantityDiscrepancies.length > 0) {
      setStep('quantity_validation');
    } else if (novedadDiscrepancies.length > 0) {
      setStep('novedad_validation');
    } else if (needsMapping) {
      setStep('mapping');
    } else if (hasDifferentPresupuestos) {
      setStep('budget_validation');
    } else if (conflicts.length > 0) {
      setStep('conflicts');
    } else {
      setStep('validation');
    }
  }, []); // Only on mount to set initial step

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

  const unknownZonesWithDetails = useMemo(() => {
    return unknownZones.map(z => {
      const observations = data.filter((d, idx) => d.zona === z && !excludedIndices.has(idx)).map(d => ({
        sucursal: d.sucursal === "PENDING_SUCURSAL" ? "Sucursal por definir" : d.sucursal,
        fecha: d.fecha,
        hojaRuta: d.hojaRuta
      }));
      return { zona: z, observations };
    }).filter(z => z.observations.length > 0);
  }, [unknownZones, data, excludedIndices]);

  const unknownVehiclesWithDetails = useMemo(() => {
    return unknownVehicles.map(v => {
      const observations = data.filter((d, idx) => d.vehiculo === v && !excludedIndices.has(idx)).map(d => ({
        sucursal: d.sucursal === "PENDING_SUCURSAL" ? "Sucursal por definir" : d.sucursal,
        fecha: d.fecha,
        hojaRuta: d.hojaRuta
      }));
      return { vehiculo: v, observations };
    }).filter(v => v.observations.length > 0);
  }, [unknownVehicles, data, excludedIndices]);

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
  const totalBultos =
    totals?.bultos ?? mappedData.reduce((acc, curr) => acc + curr.bultosTotal, 0);

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

  const totalUnknownVehiclesRoutes = useMemo(() => {
    return unknownVehiclesWithDetails.reduce((acc, v) => acc + v.observations.length, 0);
  }, [unknownVehiclesWithDetails]);

  const totalUnknownZonesRoutes = useMemo(() => {
    return unknownZonesWithDetails.reduce((acc, z) => acc + z.observations.length, 0);
  }, [unknownZonesWithDetails]);

  const handleConfirm = () => {
    const nextStep = (currentStep: string): any => {
      if (currentStep === 'branch_selection') {
        if (quantityDiscrepancies.length > 0) return 'quantity_validation';
        if (novedadDiscrepancies.length > 0) return 'novedad_validation';
        if (needsMapping) return 'mapping';
        if (hasDifferentPresupuestos) return 'budget_validation';
        if (conflicts.length > 0) return 'conflicts';
        return 'validation';
      }
      if (currentStep === 'quantity_validation') {
        if (novedadDiscrepancies.length > 0) return 'novedad_validation';
        if (needsMapping) return 'mapping';
        if (hasDifferentPresupuestos) return 'budget_validation';
        if (conflicts.length > 0) return 'conflicts';
        return 'validation';
      }
      if (currentStep === 'novedad_validation') {
        if (needsMapping) return 'mapping';
        if (hasDifferentPresupuestos) return 'budget_validation';
        if (conflicts.length > 0) return 'conflicts';
        return 'validation';
      }
      if (currentStep === 'mapping') {
        if (hasDifferentPresupuestos) return 'budget_validation';
        if (conflicts.length > 0) return 'conflicts';
        return 'validation';
      }
      if (currentStep === 'budget_validation') {
        if (conflicts.length > 0) return 'conflicts';
        return 'validation';
      }
      if (currentStep === 'conflicts') {
        return 'validation';
      }
      return null;
    };

    const next = nextStep(step);
    if (next) {
      setStepHistory(prev => [...prev, step]);
      setStep(next);
      return;
    }

    const finalData = mappedData.filter((_, idx) => !excludedIndices.has(idx));

    const dataToAdd = [
      ...newRoutes.filter(r => finalData.some(fd => getRouteId(fd) === getRouteId(r))),
      ...conflicts.filter(c => conflictResolution[c.id] === 'replace' && finalData.some(fd => getRouteId(fd) === c.id)).map(c => c.incoming)
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

  const handleBack = () => {
    if (stepHistory.length > 0) {
      const newHistory = [...stepHistory];
      const prevStep = newHistory.pop();
      setStepHistory(newHistory);
      if (prevStep) setStep(prevStep as any);
    }
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
          {step === 'quantity_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-danger-50 rounded-xl border border-danger-200">
                <div className="flex items-center space-x-2 mb-4 text-danger-700">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-bold uppercase tracking-wider">Validación de cantidades de piezas y bultos</h3>
                </div>
                <p className="text-sm text-danger-800 mb-4">
                  Se detectaron "{quantityDiscrepancies.length}" discrepancias en las cantidades totales de algunas rutas. Por favor, verifique y corrija los datos:
                </p>
                
                <div className="space-y-4">
                  {quantityDiscrepancies.map(({ data: d, index }) => {
                    const piezasDiff = d.piezasTotal !== (d.piezasEntregadas + d.piezasNoEntregadas);
                    const bultosDiff = d.bultosTotal !== (d.bultosEntregados + d.bultosDevueltos);
                    const bultosTotalError = d.bultosTotal < d.piezasTotal;
                    const bultosEntregadosError = d.bultosEntregados < d.piezasEntregadas;
                    const bultosDevueltosError = d.bultosDevueltos < d.piezasNoEntregadas;
                    
                    const piezasSectionError = piezasDiff || bultosEntregadosError || bultosDevueltosError;
                    const bultosSectionError = bultosDiff || bultosTotalError || bultosEntregadosError || bultosDevueltosError;
                    
                    const isExcluded = excludedIndices.has(index);
                    
                    return (
                      <div key={index} className={`p-4 bg-white rounded-xl border shadow-sm space-y-4 transition-opacity ${isExcluded ? 'opacity-50 grayscale border-secondary-200' : 'border-danger-100'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-secondary-50">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {d.sucursal === "PENDING_SUCURSAL" ? "Sucursal por definir" : d.sucursal}
                            </span>
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {d.fecha}
                            </span>
                            <span className="px-2 py-0.5 bg-primary-50 text-primary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              HDR: {d.hojaRuta}
                            </span>
                          </div>
                          
                          <div className="flex flex-col items-end space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={isExcluded}
                                onChange={() => {
                                  const newExcluded = new Set(excludedIndices);
                                  if (isExcluded) newExcluded.delete(index);
                                  else newExcluded.add(index);
                                  setExcludedIndices(newExcluded);
                                }}
                                className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500"
                              />
                              <span className="text-[10px] font-bold text-secondary-500 uppercase group-hover:text-secondary-700">No incluir ruta</span>
                            </label>

                            <label className="flex items-center space-x-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={allDeliveredIndices.has(index)}
                                onChange={() => {
                                  const newAllDelivered = new Set(allDeliveredIndices);
                                  if (allDeliveredIndices.has(index)) newAllDelivered.delete(index);
                                  else newAllDelivered.add(index);
                                  setAllDeliveredIndices(newAllDelivered);
                                }}
                                className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500"
                              />
                              <span className="text-[10px] font-bold text-primary-600 uppercase group-hover:text-primary-700">Poner todo a entregado</span>
                            </label>
                          </div>
                        </div>

                        {!isExcluded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Piezas Section */}
                            <div className={`space-y-3 p-3 rounded-lg border ${piezasSectionError ? 'bg-danger-50/30 border-danger-100' : 'bg-secondary-50/30 border-secondary-100'}`}>
                              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${piezasSectionError ? 'text-danger-600' : 'text-secondary-500'}`}>
                                Validación de Piezas
                              </h4>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-secondary-500 uppercase">Total</label>
                                  <input
                                    type="number"
                                    value={d.piezasTotal}
                                    onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                    onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], piezasTotal: parseInt(e.target.value) || 0 } }))}
                                    className={`w-full text-xs p-1.5 border rounded font-bold ${piezasDiff ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-secondary-500 uppercase">Entreg.</label>
                                  <input
                                    type="number"
                                    value={d.piezasEntregadas}
                                    onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                    onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], piezasEntregadas: parseInt(e.target.value) || 0 } }))}
                                    className={`w-full text-xs p-1.5 border rounded ${bultosEntregadosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-secondary-500 uppercase">No Entreg.</label>
                                  <input
                                    type="number"
                                    value={d.piezasNoEntregadas}
                                    onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                    onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], piezasNoEntregadas: parseInt(e.target.value) || 0 } }))}
                                    className={`w-full text-xs p-1.5 border rounded ${bultosDevueltosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'}`}
                                  />
                                </div>
                              </div>
                              {piezasDiff && (
                                <p className="text-[10px] text-danger-600 font-medium">
                                  Error Suma: {d.piezasTotal} ≠ {d.piezasEntregadas + d.piezasNoEntregadas}
                                </p>
                              )}
                              {(bultosEntregadosError || bultosDevueltosError) && (
                                <p className="text-[10px] text-danger-600 font-medium">
                                  Error: Bultos menores a piezas
                                </p>
                              )}
                            </div>

                            {/* Bultos Section */}
                            <div className={`space-y-3 p-3 rounded-lg border ${bultosSectionError ? 'bg-danger-50/30 border-danger-100' : 'bg-secondary-50/30 border-secondary-100'}`}>
                              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${bultosSectionError ? 'text-danger-600' : 'text-secondary-500'}`}>
                                Validación de Bultos
                              </h4>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-secondary-500 uppercase">Total</label>
                                  <input
                                    type="number"
                                    value={d.bultosTotal}
                                    onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                    onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], bultosTotal: parseInt(e.target.value) || 0 } }))}
                                    className={`w-full text-xs p-1.5 border rounded font-bold ${bultosDiff || bultosTotalError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-secondary-500 uppercase">Entreg.</label>
                                  <input
                                    type="number"
                                    value={d.bultosEntregados}
                                    onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                    onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], bultosEntregados: parseInt(e.target.value) || 0 } }))}
                                    className={`w-full text-xs p-1.5 border rounded ${bultosEntregadosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-secondary-500 uppercase">No Entreg.</label>
                                  <input
                                    type="number"
                                    value={d.bultosDevueltos}
                                    onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                    onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], bultosDevueltos: parseInt(e.target.value) || 0 } }))}
                                    className={`w-full text-xs p-1.5 border rounded ${bultosDevueltosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'}`}
                                  />
                                </div>
                              </div>
                              {bultosDiff && (
                                <p className="text-[10px] text-danger-600 font-medium">
                                  Error Suma: {d.bultosTotal} ≠ {d.bultosEntregados + d.bultosDevueltos}
                                </p>
                              )}
                              {bultosTotalError && (
                                <p className="text-[10px] text-danger-600 font-medium">
                                  Error: Bultos totales menores a piezas totales
                                </p>
                              )}
                              {(bultosEntregadosError || bultosDevueltosError) && (
                                <p className="text-[10px] text-danger-600 font-medium">
                                  Error: Bultos menores a piezas
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="text-center py-4">
                <p className="text-sm font-medium text-secondary-600">
                  Corrija los valores resaltados para que la suma coincida con el total.
                </p>
              </div>
            </div>
          ) : step === 'novedad_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center space-x-2 mb-4 text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-bold">Discrepancias en Novedades</h3>
                </div>
                <p className="text-sm text-amber-800 mb-6">
                  Se detectaron "{novedadDiscrepancies.length}" rutas donde la suma de (Visitadas con Novedad + No Visitadas) no coincide con el Total de Piezas. Por favor, corrija los datos:
                </p>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {novedadDiscrepancies.map(({ data: item, index }) => {
                    const correction = corrections[index] || {};
                    const isAllNovelty = allNoveltyIndices.has(index);
                    const isExcluded = excludedIndices.has(index);

                    const piezasTotal = correction.piezasTotal ?? item.piezasTotal;
                    let visitadasNovedad = correction.visitadasNovedad ?? item.visitadasNovedad;
                    let noVisitadas = correction.noVisitadas ?? item.noVisitadas;

                    if (isAllNovelty) {
                      visitadasNovedad = piezasTotal;
                      noVisitadas = 0;
                    }
                    
                    const sum = visitadasNovedad + noVisitadas;
                    const diff = sum - piezasTotal;
                    const hasError = diff !== 0;

                    const isCollapsed = isExcluded;

                    return (
                      <div key={index} className={`p-4 rounded-xl border transition-all duration-200 ${isExcluded ? 'opacity-50 grayscale border-secondary-200 bg-secondary-50' : hasError ? 'bg-white border-danger-200 shadow-sm' : 'bg-success-50 border-success-200'}`}>
                        <div className={`flex flex-wrap items-center justify-between gap-4 ${!isCollapsed ? 'mb-4 pb-3 border-b border-secondary-100' : ''}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {item.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : item.sucursal}
                            </span>
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {item.fecha}
                            </span>
                            <span className="px-2 py-0.5 bg-primary-50 text-primary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              HDR: {item.hojaRuta}
                            </span>
                            {!isCollapsed && (
                              <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${hasError ? 'bg-danger-100 text-danger-600' : 'bg-success-100 text-success-600'}`}>
                                {hasError ? `Diferencia: ${diff > 0 ? '+' : ''}${diff} (Suma: ${sum} / Total: ${piezasTotal})` : 'Corregido'}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end space-y-2">
                            <label className="flex items-center space-x-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={isExcluded}
                                onChange={() => {
                                  const newExcluded = new Set(excludedIndices);
                                  if (isExcluded) newExcluded.delete(index);
                                  else newExcluded.add(index);
                                  setExcludedIndices(newExcluded);
                                }}
                                className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500"
                              />
                              <span className="text-[10px] font-bold text-secondary-500 uppercase group-hover:text-secondary-700">No incluir ruta</span>
                            </label>

                            <label className="flex items-center space-x-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={isAllNovelty}
                                onChange={() => {
                                  const newAllNovelty = new Set(allNoveltyIndices);
                                  if (isAllNovelty) newAllNovelty.delete(index);
                                  else newAllNovelty.add(index);
                                  setAllNoveltyIndices(newAllNovelty);
                                }}
                                className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500"
                              />
                              <span className="text-[10px] font-bold text-primary-600 uppercase group-hover:text-primary-700">Marcar piezas con novedad</span>
                            </label>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-secondary-500 uppercase">Piezas Total</label>
                              <input
                                type="number"
                                value={piezasTotal}
                                onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], piezasTotal: Number(e.target.value) } }))}
                                className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all ${hasError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200 bg-secondary-50'}`}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-secondary-500 uppercase">Visitadas con Novedad</label>
                              <input
                                type="number"
                                value={visitadasNovedad}
                                onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], visitadasNovedad: Number(e.target.value) } }))}
                                className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all ${hasError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200 bg-secondary-50'}`}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-secondary-500 uppercase">No Visitadas (Sin Novedad)</label>
                              <input
                                type="number"
                                value={noVisitadas}
                                onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], noVisitadas: Number(e.target.value) } }))}
                                className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all ${hasError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200 bg-secondary-50'}`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : step === 'mapping' ? (
            <div className="space-y-6">
              {unknownVehicles.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-center space-x-2 mb-4 text-amber-700">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-bold">Vehículos no reconocidos</h3>
                  </div>
                  <p className="text-sm text-amber-800 mb-4">
                    Se detectaron "{totalUnknownVehiclesRoutes}" rutas con vehículos que no coinciden con las categorías del sistema. Por favor, asígnelos correctamente:
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    {unknownVehiclesWithDetails.map(({ vehiculo, observations }) => (
                      <div key={vehiculo} className="p-3 bg-white rounded-lg border border-amber-200 shadow-sm space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <label className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                            Vehículo: <span className="text-amber-600">"{vehiculo}"</span>
                          </label>
                          <select
                            value={vehicleMapping[vehiculo] || KNOWN_VEHICLES[0]}
                            onChange={(e) => setVehicleMapping(prev => ({ ...prev, [vehiculo]: e.target.value }))}
                            className="text-sm border-amber-300 rounded-lg bg-white focus:ring-amber-500 focus:border-amber-500 min-w-[200px]"
                          >
                            {KNOWN_VEHICLES.map(kv => (
                              <option key={kv} value={kv}>{kv}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="bg-amber-50/50 rounded-md p-2 border border-amber-100">
                          <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">Observaciones encontradas:</p>
                          <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                            {observations.map((obs, idx) => (
                              <div key={idx} className="text-[10px] text-amber-800 flex items-center space-x-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                <span>{obs.sucursal} - {obs.fecha} - Ruta: <span className="font-bold">{obs.hojaRuta}</span></span>
                              </div>
                            ))}
                          </div>
                        </div>
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
                    Se detectaron "{totalUnknownZonesRoutes}" rutas con zonas que no coinciden con "Capital" o "Interior". Por favor, verifique si están bien asignadas:
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    {unknownZonesWithDetails.map(({ zona, observations }) => (
                      <div key={zona} className="p-3 bg-white rounded-lg border border-amber-200 shadow-sm space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <label className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                            Zona: <span className="text-amber-600">"{zona === "SIN_ZONA" ? "Sin Zona (Celda vacía)" : zona}"</span>
                          </label>
                          <select
                            value={zoneMapping[zona] || "CAPITAL"}
                            onChange={(e) => setZoneMapping(prev => ({ ...prev, [zona]: e.target.value }))}
                            className="text-sm border-amber-300 rounded-lg bg-white focus:ring-amber-500 focus:border-amber-500 min-w-[200px]"
                          >
                            <option value="CAPITAL">CAPITAL</option>
                            <option value="INTERIOR">INTERIOR</option>
                          </select>
                        </div>

                        <div className="bg-amber-50/50 rounded-md p-2 border border-amber-100">
                          <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">Observaciones encontradas:</p>
                          <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                            {observations.map((obs, idx) => (
                              <div key={idx} className="text-[10px] text-amber-800 flex items-center space-x-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                <span>{obs.sucursal} - {obs.fecha} - Ruta: <span className="font-bold">{obs.hojaRuta}</span></span>
                              </div>
                            ))}
                          </div>
                        </div>
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
                  Se detectaron "{differentBudgetsCount}" presupuestos en el archivo cargado. Por favor, verifique la información:
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
                  Se detectaron "{conflicts.length}" conflictos en rutas que ya existen pero con datos diferentes. Por favor, seleccione qué acción tomar para cada una:
                </p>
                <div className="space-y-4">
                  {conflicts.map((c) => {
                    const diffs = getDifferences(c.existing, c.incoming);
                    return (
                      <div key={c.id} className="p-4 bg-white rounded-xl border border-danger-100 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-danger-50">
                          <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                            {c.incoming.sucursal}
                          </span>
                          <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                            {c.incoming.fecha}
                          </span>
                          <span className="px-2 py-0.5 bg-primary-50 text-primary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                            Ruta: {c.incoming.hojaRuta}
                          </span>
                        </div>

                        <div className="space-y-4">
                          {diffs.map((diff, idx) => (
                            <div key={idx} className="space-y-2">
                              <p className="text-xs font-bold text-danger-600">
                                Diferencia en: {diff.field}
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
                    );
                  })}
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
                  { label: "Bultos Totales", value: totalBultos },
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
                  { 
                    label: "Cantidad piezas corregidas", 
                    value: correctedPiezasCount,
                    colorClass: correctedPiezasCount > 0 ? "text-primary-600" : "text-secondary-500"
                  },
                  { 
                    label: "Cantidad bultos corregidos", 
                    value: correctedBultosCount,
                    colorClass: correctedBultosCount > 0 ? "text-primary-600" : "text-secondary-500"
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
                          <tr key={idx} className="hover:bg-secondary-300 transition-colors">
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
                            <tr key={idx} className="hover:bg-secondary-300 transition-colors">
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
          {stepHistory.length > 0 && (
            <button
              onClick={handleBack}
              className="inline-flex justify-center items-center px-6 py-2.5 text-sm font-semibold text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded-lg border border-primary-200 transition-all duration-200 cursor-pointer"
            >
              Volver Atrás
            </button>
          )}

          <button
            onClick={onCancel}
            className="inline-flex justify-center items-center px-6 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all duration-200 cursor-pointer shadow-sm"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancelar
          </button>

          <button
            onClick={handleConfirm}
            className="inline-flex justify-center items-center px-8 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform active:scale-95 cursor-pointer min-w-[140px]"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {step === 'validation' ? 'Confirmar y Finalizar' : 'Continuar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
