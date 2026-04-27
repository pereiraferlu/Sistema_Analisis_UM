import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, FileSpreadsheet, AlertTriangle, Download, Loader2 } from "lucide-react";
import { LogisticsData, ConsultaGlobalData, DistribuidorData } from "../types";
import { getRouteId, normalizeString, normalizeDate, getDifferences, normalizeZone, normalizeHojaRuta, isStateEntregado } from "../utils";

function removeHdrFromString(currentStr: string, hdrToRemove: string) {
  const parts = currentStr.split(/[\-\/]/).map(s => s.trim()).filter(s => s);
  const filtered = parts.filter(p => p !== hdrToRemove);
  return filtered.join(' / ');
}

function addHdrToString(currentStr: string, hdrToAdd: string) {
  const parts = currentStr.split(/[\-\/]/).map(s => s.trim()).filter(s => s);
  if (!parts.includes(hdrToAdd)) parts.push(hdrToAdd);
  return parts.join(' / ');
}

const getSystemTotalsForHdrString = (
  hdrStr: string,
  consultaCounts: Map<string, { entregadas: number, noEntregadas: number, total: number }>,
  hdrDistribuidores: { hojaRuta: string, cantidad: number }[]
) => {
  const hdrs = hdrStr.split(/[\-\/]/).map(h => h.trim()).filter(h => h);
  let total = 0;
  let entregadas = 0;
  
  hdrs.forEach(h => {
     const distData = hdrDistribuidores.find(d => String(d.hojaRuta) === h);
     const cCount = consultaCounts.get(h) || { entregadas: 0, noEntregadas: 0, total: 0 };
     const cTotal = distData?.cantidad ?? cCount.total;
     total += cTotal;
     entregadas += cCount.entregadas;
  });
  
  return {
    total,
    entregadas,
    noEntregadas: total - entregadas
  };
}

interface ValidationModalProps {
  data: LogisticsData[];
  existingData?: LogisticsData[];
  consultaGlobal?: ConsultaGlobalData[];
  hdrDistribuidores?: DistribuidorData[];
  totals?: { piezas: number; bultos: number };
  existingPresupuestos?: Record<string, number>;
  pendingPresupuestos?: Record<string, number>;
  onConfirm: (data: LogisticsData[], newPresupuestos?: Record<string, number>, overwritePresupuestos?: boolean, idsToRemove?: string[]) => void;
  onCancel: () => void;
  missingColumns?: string[];
  historialData?: any[];
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
  "Utilitario Mediano",
  "Utilitario Grande",
  "Moto",
  "Cartero",
  "Local Comercial",
  "Camión"
];

const areRoutesEqual = (a: LogisticsData, b: LogisticsData) => {
  return getDifferences(a, b).length === 0;
};

export default function ValidationModal({
  data,
  existingData = [],
  consultaGlobal = [],
  hdrDistribuidores = [],
  totals,
  existingPresupuestos,
  pendingPresupuestos,
  onConfirm,
  onCancel,
  missingColumns = [],
  historialData = [],
}: ValidationModalProps) {
  const [selectedSucursal, setSelectedSucursal] = useState(() => {
    const firstWithSucursal = data.find(d => d.sucursal !== "PENDING_SUCURSAL");
    return firstWithSucursal ? firstWithSucursal.sucursal : "";
  });
  const [budgetResolutions, setBudgetResolutions] = useState<Record<string, 'replace' | 'keep'>>({});
  const [conflictResolution, setConflictResolution] = useState<Record<string, Record<string, 'replace' | 'keep'>>>({});
  
  const detectedBranchesInfo = useMemo(() => {
    const branches = new Map<string, string>();
    data.forEach(d => {
      if (d.sucursal && d.sucursal !== "PENDING_SUCURSAL") {
        branches.set(d.sucursal, d.sheetName || d.sourceFile || "Hoja Desconocida");
      }
    });
    return Array.from(branches.entries()).map(([branch, sheet]) => ({ branch, sheet }));
  }, [data]);

  const unknownVehicles = useMemo(() => Array.from(new Set(data.map(d => (d.vehiculo || "").trim()))).filter(v => !KNOWN_VEHICLES.some(kv => kv.toLowerCase().trim() === v.toLowerCase().trim())), [data]);
  const unknownZones = useMemo(() => Array.from(new Set(data.map(d => d.zona))).filter(z => normalizeZone(z) === null && z), [data]);
  
  const isPending = data.some((d) => d.sucursal === "PENDING_SUCURSAL");
  
  const differentBudgetsCount = useMemo(() => {
    if (!pendingPresupuestos) return 0;
    return Object.entries(pendingPresupuestos).filter(([suc, amount]) => {
      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
      const normalizedBranch = normalizeString(branchName);
      const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
      if (!isKnown) return false;
      const existingAmount = existingPresupuestos?.[branchName] || 0;
      return existingAmount !== amount;
    }).length;
  }, [pendingPresupuestos, existingPresupuestos, selectedSucursal]);

  const hasDifferentPresupuestos = differentBudgetsCount > 0;

  const [step, setStep] = useState<'summary' | 'missing_columns' | 'quantity_validation' | 'novedad_validation' | 'route_validation' | 'estado_validation' | 'vehicle_mapping' | 'zone_mapping' | 'date_validation' | 'branch_selection' | 'budget_validation' | 'conflicts' | 'validation'>('summary');
  const [mode, setMode] = useState<'view' | 'edit' | null>(null);
  const [stepHistory, setStepHistory] = useState<string[]>([]);

  const [vehicleMapping, setVehicleMapping] = useState<Record<string, string>>({});
  const [zoneMapping, setZoneMapping] = useState<Record<string, string>>({});
  const [corrections, setCorrections] = useState<Record<number, Partial<LogisticsData>>>({});
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
  const [allDeliveredIndices, setAllDeliveredIndices] = useState<Set<number>>(new Set());
  const [allNoveltyIndices, setAllNoveltyIndices] = useState<Set<number>>(new Set());
  const [isAllDeliveredMassive, setIsAllDeliveredMassive] = useState(false);
  const [isAllNoveltyMassive, setIsAllNoveltyMassive] = useState(false);
  const [isAllRouteMassive, setIsAllRouteMassive] = useState(false);
  const [isAllEstadoMassive, setIsAllEstadoMassive] = useState(false);
  const [isAllDuplicatedMassive, setIsAllDuplicatedMassive] = useState(false);
  const [manualDupHdrs, setManualDupHdrs] = useState<string[]>([]);
  const [isExportingAllDiscrepancies, setIsExportingAllDiscrepancies] = useState(false);
  const [isExportingCorrected, setIsExportingCorrected] = useState(false);
  const [isExportingPiezasPlanilla, setIsExportingPiezasPlanilla] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const predominantMonth = useMemo(() => {
    if (data.length === 0) return null;
    const monthCounts: Record<string, number> = {};
    data.forEach(d => {
      const parts = d.fecha.split("-");
      if (parts.length === 3) {
        const monthYear = `${parts[1]}-${parts[2]}`;
        monthCounts[monthYear] = (monthCounts[monthYear] || 0) + d.piezasTotal;
      }
    });
    
    let maxCount = 0;
    let bestMonth = null;
    for (const [monthYear, count] of Object.entries(monthCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestMonth = monthYear;
      }
    }
    return bestMonth;
  }, [data]);

  const initialDateDiscrepancyIndices = useMemo(() => {
    if (!predominantMonth) return [];
    const currentMonth = new Date().getUTCMonth() + 1;
    const currentYear = String(new Date().getUTCFullYear()).slice(-2);
    const currentMonthYear = `${String(currentMonth).padStart(2, "0")}-${currentYear}`;

    return data.map((d, index) => {
      const parts = d.fecha.split("-");
      if (parts.length === 3) {
        const monthYear = `${parts[1]}-${parts[2]}`;
        if (monthYear !== predominantMonth && monthYear !== currentMonthYear) {
          return index;
        }
      }
      return -1;
    }).filter(idx => idx !== -1);
  }, [data, predominantMonth]);

  const dateDiscrepancies = useMemo(() => {
    return initialDateDiscrepancyIndices.filter(idx => !excludedIndices.has(idx));
  }, [initialDateDiscrepancyIndices, excludedIndices]);

  const mappedData = useMemo<LogisticsData[]>(() => {
    return data.map((d, index) => {
      const correction = corrections[index] || {};
      const isAllDelivered = allDeliveredIndices.has(index);
      const isAllNovelty = allNoveltyIndices.has(index);
      const sucursal = d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal;
      const vehiculoRaw = (d.vehiculo || "").trim();
      const canonicalVehicle = KNOWN_VEHICLES.find(kv => kv.toLowerCase().trim() === vehiculoRaw.toLowerCase());
      const vehiculo = vehicleMapping[vehiculoRaw] || canonicalVehicle || KNOWN_VEHICLES[0];

      const finalItem = {
        ...d,
        ...correction,
        sucursal,
        vehiculo,
        zona: normalizeZone(d.zona) || zoneMapping[d.zona] || "CAPITAL",
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
  }, [data, vehicleMapping, zoneMapping, corrections, allDeliveredIndices, allNoveltyIndices, selectedSucursal]);

  const pendingDateDiscrepancies = useMemo(() => {
    if (!predominantMonth) return [];
    const currentMonth = new Date().getUTCMonth() + 1;
    const currentYear = String(new Date().getUTCFullYear()).slice(-2);
    const currentMonthYear = `${String(currentMonth).padStart(2, "0")}-${currentYear}`;

    return mappedData.map((d, index) => {
      if (!initialDateDiscrepancyIndices.includes(index)) return -1;
      if (excludedIndices.has(index)) return -1;
      
      const parts = d.fecha.split("-");
      if (parts.length === 3) {
        const monthYear = `${parts[1]}-${parts[2]}`;
        if (monthYear !== predominantMonth && monthYear !== currentMonthYear) {
          return index;
        }
      }
      return -1;
    }).filter(idx => idx !== -1);
  }, [mappedData, excludedIndices, initialDateDiscrepancyIndices, predominantMonth]);

  const initialDiscrepancyIndices = useMemo(() => {
    return data.map((d, index) => {
      const hasQuantityError = (d.piezasEntregadas + d.piezasNoEntregadas !== d.piezasTotal) ||
                               (d.bultosEntregados + d.bultosDevueltos !== d.bultosTotal);
      const hasBultosPiezasError = d.bultosTotal < d.piezasTotal || 
                                   d.bultosEntregados < d.piezasEntregadas || 
                                   d.bultosDevueltos < d.piezasNoEntregadas;
      return (hasQuantityError || hasBultosPiezasError) ? index : -1;
    }).filter(idx => idx !== -1);
  }, [data]);

  const pendingQuantityDiscrepancies = useMemo(() => {
    return mappedData.map((d, index) => {
      if (!initialDiscrepancyIndices.includes(index)) return -1;
      if (excludedIndices.has(index)) return -1;
      
      const hasQuantityError = (d.piezasEntregadas + d.piezasNoEntregadas !== d.piezasTotal) ||
                               (d.bultosEntregados + d.bultosDevueltos !== d.bultosTotal);
      const hasBultosPiezasError = d.bultosTotal < d.piezasTotal || 
                                   d.bultosEntregados < d.piezasEntregadas || 
                                   d.bultosDevueltos < d.piezasNoEntregadas;
      return (hasQuantityError || hasBultosPiezasError) ? index : -1;
    }).filter(idx => idx !== -1);
  }, [mappedData, excludedIndices, initialDiscrepancyIndices]);

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
      const hasNovedadError = (d.visitadasNovedad + d.noVisitadas !== d.piezasTotal);
      return hasNovedadError ? index : -1;
    }).filter(idx => idx !== -1);
  }, [data]);

  const pendingNovedadDiscrepancies = useMemo(() => {
    return mappedData.map((d, index) => {
      if (!initialNovedadDiscrepancyIndices.includes(index)) return -1;
      if (excludedIndices.has(index)) return -1;
      
      const hasNovedadError = (d.visitadasNovedad + d.noVisitadas !== d.piezasTotal);
      return hasNovedadError ? index : -1;
    }).filter(idx => idx !== -1);
  }, [mappedData, excludedIndices, initialNovedadDiscrepancyIndices]);

  const novedadDiscrepancies = useMemo(() => {
    return initialNovedadDiscrepancyIndices.map(index => ({
      data: mappedData[index],
      index
    }));
  }, [initialNovedadDiscrepancyIndices, mappedData]);

  const estadoDiscrepancies = useMemo(() => {
    if (consultaGlobal.length === 0 || mappedData.length === 0) return { branch: [], route: [] };

    // Group consulta global by route for faster lookup
    const consultaByRoute = new Map<string, any[]>();
    consultaGlobal.forEach(c => {
      const routeStr = String(c.hojaRuta);
      if (!consultaByRoute.has(routeStr)) {
        consultaByRoute.set(routeStr, []);
      }
      consultaByRoute.get(routeStr)?.push(c);
    });

    // Group mappedData by 'ruta'
    const groupsByRuta = new Map<string, {
      sucursal: string;
      fecha: string;
      hojasRuta: Set<string>;
      piezasTotalOriginal: number;
      piezasTotal: number;
      piezasEntregadasOriginal: number;
      piezasEntregadas: number;
      piezasNoEntregadasOriginal: number;
      piezasNoEntregadas: number;
      bultosTotalOriginal: number;
      bultosTotal: number;
      bultosEntregadosOriginal: number;
      bultosEntregados: number;
      bultosDevueltosOriginal: number;
      bultosDevueltos: number;
      indices: number[];
    }>();

    mappedData.forEach((d, index) => {
      if (excludedIndices.has(index)) return;
      
      const rutaKey = normalizeHojaRuta(d.ruta || d.hojaRuta);
      if (!groupsByRuta.has(rutaKey)) {
        groupsByRuta.set(rutaKey, {
          sucursal: d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal,
          fecha: d.fecha,
          hojasRuta: new Set(),
          piezasTotalOriginal: 0,
          piezasTotal: 0,
          piezasEntregadasOriginal: 0,
          piezasEntregadas: 0,
          piezasNoEntregadasOriginal: 0,
          piezasNoEntregadas: 0,
          bultosTotalOriginal: 0,
          bultosTotal: 0,
          bultosEntregadosOriginal: 0,
          bultosEntregados: 0,
          bultosDevueltosOriginal: 0,
          bultosDevueltos: 0,
          indices: []
        });
      }

      const group = groupsByRuta.get(rutaKey)!;
      d.hojaRuta.split(/[\-\/]/).forEach(r => group.hojasRuta.add(r.trim()));
      group.indices.push(index);
      
      const correction = corrections[index] || {};
      group.piezasTotalOriginal += (data[index]?.piezasTotal ?? 0);
      group.piezasEntregadasOriginal += (data[index]?.piezasEntregadas ?? 0);
      group.piezasNoEntregadasOriginal += (data[index]?.piezasNoEntregadas ?? 0);
      group.bultosTotalOriginal += (data[index]?.bultosTotal ?? 0);
      group.bultosEntregadosOriginal += (data[index]?.bultosEntregados ?? 0);
      group.bultosDevueltosOriginal += (data[index]?.bultosDevueltos ?? 0);

      group.piezasTotal += (correction.piezasTotal ?? d.piezasTotal);
      group.piezasEntregadas += (correction.piezasEntregadas ?? d.piezasEntregadas);
      group.piezasNoEntregadas += (correction.piezasNoEntregadas ?? d.piezasNoEntregadas);
      group.bultosTotal += (correction.bultosTotal ?? d.bultosTotal);
      group.bultosEntregados += (correction.bultosEntregados ?? d.bultosEntregados);
      group.bultosDevueltos += (correction.bultosDevueltos ?? d.bultosDevueltos);
    });

    const routeDiscrepancies: {
      indices: number[];
      sucursal: string;
      fecha: string;
      hojaRuta: string;
      ruta: string;
      planillaNonDeliveredOriginal: number;
      planillaNonDelivered: number;
      consultaNonDelivered: number;
      planillaDeliveredOriginal: number;
      planillaDelivered: number;
      consultaDelivered: number;
      planillaBultosDeliveredOriginal: number;
      planillaBultosDelivered: number;
      consultaBultosDelivered: number;
      planillaBultosNonDeliveredOriginal: number;
      planillaBultosNonDelivered: number;
      consultaBultosNonDelivered: number;
      missingPieces: number;
      missingBultos: number;
      totalSystemNonDelivered: number;
      hasCorrections?: boolean;
    }[] = [];

    const branchTotalsPlanilla = new Map<string, number>();
    const branchTotalsConsulta = new Map<string, number>();

    const missingHdrs = new Set<string>();

    groupsByRuta.forEach((group, ruta) => {
      let piezasTotalConsulta = 0;
      let piezasEntregadasConsulta = 0;
      let piezasNoEntregadasConsulta = 0;
      let bultosTotalConsulta = 0;
      let bultosEntregadosConsulta = 0;
      let bultosNoEntregadosConsulta = 0;
      let foundAnyHdr = false;

      group.hojasRuta.forEach(hdr => {
        const pieces = consultaByRoute.get(hdr);
        if (pieces) {
          foundAnyHdr = true;
          pieces.forEach(p => {
            piezasTotalConsulta++;
            const pBultos = Number(p.bultos) || 1;
            bultosTotalConsulta += pBultos;
            if (isStateEntregado(p.estado)) {
              piezasEntregadasConsulta++;
              bultosEntregadosConsulta += pBultos;
            } else {
              piezasNoEntregadasConsulta++;
              bultosNoEntregadosConsulta += pBultos;
            }
          });
        } else {
          missingHdrs.add(hdr);
        }
      });

      // Validation 1: Aggregate Branch Totals (Delivered)
      // We always add the planilla delivered pieces to the branch total
      const branchName = group.sucursal;
      branchTotalsPlanilla.set(branchName, (branchTotalsPlanilla.get(branchName) || 0) + group.piezasEntregadas);
      
      if (!foundAnyHdr) {
        // If no HDR found in consultation, consultation delivered pieces for this group is 0
        branchTotalsConsulta.set(branchName, (branchTotalsConsulta.get(branchName) || 0) + 0);
        
        // Also add to route discrepancies since it's completely missing in system
        routeDiscrepancies.push({
          indices: group.indices,
          sucursal: group.sucursal,
          fecha: group.fecha,
          hojaRuta: Array.from(group.hojasRuta).join(', '),
          ruta: ruta,
          planillaNonDeliveredOriginal: group.piezasNoEntregadasOriginal,
          planillaNonDelivered: group.piezasNoEntregadas,
          consultaNonDelivered: 0,
          planillaDeliveredOriginal: group.piezasEntregadasOriginal,
          planillaDelivered: group.piezasEntregadas,
          consultaDelivered: 0,
          planillaBultosDeliveredOriginal: group.bultosEntregadosOriginal,
          planillaBultosDelivered: group.bultosEntregados,
          consultaBultosDelivered: 0,
          planillaBultosNonDeliveredOriginal: group.bultosDevueltosOriginal,
          planillaBultosNonDelivered: group.bultosDevueltos,
          consultaBultosNonDelivered: 0,
          missingPieces: group.piezasTotal, // All pieces are "missing" from system
          missingBultos: group.bultosTotal,
          totalSystemNonDelivered: 0 // System says 0 delivered, 0 non-delivered because it doesn't exist
        });
        return;
      }

      branchTotalsConsulta.set(branchName, (branchTotalsConsulta.get(branchName) || 0) + piezasEntregadasConsulta);

      // Validation 2: Route Totals (Non-Delivered)
      // Formula: Planilla Non-Delivered == (Consulta Non-Delivered + (Planilla Total - Consulta Total))
      const missingPieces = Math.max(0, group.piezasTotal - piezasTotalConsulta);
      const totalSystemNonDelivered = piezasNoEntregadasConsulta + missingPieces;

      const missingBultos = Math.max(0, group.bultosTotal - bultosTotalConsulta);
      // El sistema debe contabilizar solo las piezas con estado distinto a entregado encontrados en la consulta global y sumar una unidad por cada pieza no encontrada.
      const totalSystemBultosNonDelivered = bultosNoEntregadosConsulta + missingPieces;
      
      const hasCorrections = group.indices.some((idx: number) => corrections[idx]?.piezasNoEntregadas !== undefined || corrections[idx]?.piezasEntregadas !== undefined || corrections[idx]?.bultosEntregados !== undefined || corrections[idx]?.bultosDevueltos !== undefined);

      if (group.piezasNoEntregadas !== totalSystemNonDelivered || group.bultosEntregados !== bultosEntregadosConsulta || group.bultosDevueltos !== totalSystemBultosNonDelivered || hasCorrections) {
        routeDiscrepancies.push({
          indices: group.indices,
          sucursal: group.sucursal,
          fecha: group.fecha,
          hojaRuta: Array.from(group.hojasRuta).join(', '),
          ruta: ruta,
          planillaNonDeliveredOriginal: group.piezasNoEntregadasOriginal,
          planillaNonDelivered: group.piezasNoEntregadas,
          consultaNonDelivered: piezasNoEntregadasConsulta,
          planillaDeliveredOriginal: group.piezasEntregadasOriginal,
          planillaDelivered: group.piezasEntregadas,
          consultaDelivered: piezasEntregadasConsulta,
          planillaBultosDeliveredOriginal: group.bultosEntregadosOriginal,
          planillaBultosDelivered: group.bultosEntregados,
          consultaBultosDelivered: bultosEntregadosConsulta,
          planillaBultosNonDeliveredOriginal: group.bultosDevueltosOriginal,
          planillaBultosNonDelivered: group.bultosDevueltos,
          consultaBultosNonDelivered: totalSystemBultosNonDelivered,
          missingPieces: missingPieces,
          missingBultos: missingBultos,
          totalSystemNonDelivered: totalSystemNonDelivered,
          hasCorrections
        });
      }
    });

    const branchDiscrepancies: {
      sucursal: string;
      planillaTotal: number;
      consultaTotal: number;
      hasCorrections?: boolean;
      pieces: {
        hdrPlanilla: string;
        piezasConsulta: string;
        hdrConsulta: string;
        fechaCambioEstado?: string;
      }[];
    }[] = [];

    branchTotalsPlanilla.forEach((planillaTotal, sucursal) => {
      const consultaTotal = branchTotalsConsulta.get(sucursal) || 0;
      
      let branchHasCorrections = false;
      routeDiscrepancies.forEach(r => {
        if (r.sucursal === sucursal && r.hasCorrections) {
           branchHasCorrections = true;
        }
      });
      
      if (planillaTotal !== consultaTotal || branchHasCorrections) {
        // Collect all pieces for this branch to include in export
        const branchPieces: any[] = [];
        const branchRoutes = new Set<string>();
        mappedData.forEach((d, idx) => {
          if (excludedIndices.has(idx)) return;
          const currentSuc = d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal;
          if (currentSuc === sucursal) {
            d.hojaRuta.split(/[\-\/]/).forEach(r => branchRoutes.add(r.trim()));
          }
        });

        branchRoutes.forEach(hdr => {
          const pieces = consultaByRoute.get(hdr);
          if (pieces) {
            pieces.forEach(p => {
              if (isStateEntregado(p.estado)) {
                branchPieces.push({
                  hdrPlanilla: hdr,
                  piezasConsulta: p.pieza,
                  hdrConsulta: String(p.hojaRuta),
                  fechaCambioEstado: p.fechaCambioEstado
                });
              }
            });
          }
        });

        branchDiscrepancies.push({
          sucursal,
          planillaTotal,
          consultaTotal,
          pieces: branchPieces
        });
      }
    });

    return { 
      branch: branchDiscrepancies, 
      route: routeDiscrepancies,
      missingHdrs: Array.from(missingHdrs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    };
  }, [mappedData, consultaGlobal, excludedIndices, corrections, selectedSucursal]);

  const hdrDiscrepancies = useMemo(() => {
    if (hdrDistribuidores.length === 0 || mappedData.length === 0) return { branch: [], route: [] };

    const hdrByRoute = new Map<string, number>();
    hdrDistribuidores.forEach(h => {
      const key = String(h.hojaRuta).trim();
      hdrByRoute.set(key, (hdrByRoute.get(key) || 0) + h.cantidad);
    });

    const routeDiscrepancies: any[] = [];
    const branchTotalsPlanilla = new Map<string, number>();
    const branchTotalsHDR = new Map<string, number>();

    const groupsByRuta = new Map<string, any>();

    mappedData.forEach((d, index) => {
      if (excludedIndices.has(index)) return;
      const rutaKey = `${d.distribuidor}_${d.fecha}_${d.ruta}`;
      if (!groupsByRuta.has(rutaKey)) {
        groupsByRuta.set(rutaKey, {
          rutaKey,
          sucursal: d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal,
          fecha: d.fecha,
          hojasRuta: new Set<string>(),
          piezasPlanillaOriginal: 0,
          piezasPlanilla: 0,
          bultosPlanillaOriginal: 0,
          bultosPlanilla: 0,
          indices: []
        });
      }
      const group = groupsByRuta.get(rutaKey);
      group.indices.push(index);
      d.hojaRuta.split(/[\-\/]/).forEach(r => group.hojasRuta.add(r.trim()));
      group.piezasPlanillaOriginal += (data[index]?.piezasTotal ?? 0);
      group.bultosPlanillaOriginal += (data[index]?.bultosTotal ?? 0);
      group.piezasPlanilla += (corrections[index]?.piezasTotal ?? d.piezasTotal);
      group.bultosPlanilla += (corrections[index]?.bultosTotal ?? d.bultosTotal);
    });

    const consultaByRoute = new Map<string, any[]>();
    consultaGlobal.forEach(c => {
      const routeStr = String(c.hojaRuta);
      if (!consultaByRoute.has(routeStr)) {
        consultaByRoute.set(routeStr, []);
      }
      consultaByRoute.get(routeStr)!.push(c);
    });

    groupsByRuta.forEach((group) => {
      let piezasHDR = 0;
      let bultosConsulta = 0;
      let piezasConsulta = 0;
      group.hojasRuta.forEach((hdr: string) => {
        const trimmedHdr = hdr.trim();
        piezasHDR += hdrByRoute.get(trimmedHdr) || 0;
        
        const pieces = consultaByRoute.get(trimmedHdr);
        if (pieces) {
          piezasConsulta += pieces.length;
          pieces.forEach(p => bultosConsulta += (Number(p.bultos) || 1));
        }
      });
      
      const missingPieces = Math.max(0, piezasHDR - piezasConsulta);
      bultosConsulta += missingPieces;

      const branchName = group.sucursal;
      branchTotalsPlanilla.set(branchName, (branchTotalsPlanilla.get(branchName) || 0) + group.piezasPlanilla);
      branchTotalsHDR.set(branchName, (branchTotalsHDR.get(branchName) || 0) + piezasHDR);

      const hasCorrections = group.indices.some((idx: number) => corrections[idx]?.piezasTotal !== undefined);

      if (group.piezasPlanilla !== piezasHDR || hasCorrections || group.bultosPlanilla !== bultosConsulta) {
        routeDiscrepancies.push({
          rutaKey: group.rutaKey,
          indices: group.indices,
          sucursal: group.sucursal,
          fecha: group.fecha,
          hojasRuta: Array.from(group.hojasRuta).join(', '),
          piezasPlanillaOriginal: group.piezasPlanillaOriginal,
          piezasPlanilla: group.piezasPlanilla,
          piezasHDR: piezasHDR,
          bultosPlanillaOriginal: group.bultosPlanillaOriginal,
          bultosPlanilla: group.bultosPlanilla,
          bultosConsulta: bultosConsulta,
          diferencia: group.piezasPlanilla - piezasHDR,
          diferenciaBultos: group.bultosPlanilla - bultosConsulta,
          hasCorrections
        });
      }
    });

    const branchDiscrepancies: any[] = [];
    branchTotalsPlanilla.forEach((planillaTotal, sucursal) => {
      const hdrTotal = branchTotalsHDR.get(sucursal) || 0;
      
      // Calculate positive and negative sums for this branch
      let sumaPositiva = 0;
      let sumaNegativa = 0;
      let branchHasCorrections = false;
      
      routeDiscrepancies.forEach(r => {
        if (r.sucursal === sucursal) {
          if (r.diferencia > 0) {
            sumaPositiva += r.diferencia;
          } else if (r.diferencia < 0) {
            sumaNegativa += r.diferencia;
          }
          if (r.hasCorrections) {
            branchHasCorrections = true;
          }
        }
      });

      if (planillaTotal !== hdrTotal || sumaPositiva !== 0 || sumaNegativa !== 0 || branchHasCorrections) {
        branchDiscrepancies.push({
          sucursal,
          planillaTotal,
          hdrTotal,
          diferencia: planillaTotal - hdrTotal,
          sumaPositiva,
          sumaNegativa,
          hasCorrections: branchHasCorrections
        });
      }
    });

    return { branch: branchDiscrepancies, route: routeDiscrepancies };
  }, [mappedData, hdrDistribuidores, excludedIndices, corrections, selectedSucursal]);

  const hasEstadoDiscrepancies = useMemo(() => {
    return estadoDiscrepancies.branch.length > 0 || estadoDiscrepancies.route.length > 0;
  }, [estadoDiscrepancies]);

  const { duplicatedHdrs, consultaCounts } = useMemo(() => {
    const hdrToRows = new Map<string, {data: LogisticsData, index: number}[]>();
    
    mappedData.forEach((d, index) => {
      // Use the ORIGINAL data's hojaRuta to determine duplicates.
      // This prevents the card from disappearing when the user assigns the HDR.
      const originalHdr = data[index]?.hojaRuta || d.hojaRuta;
      const hdrs = String(originalHdr || "").split(/[\-\/]/).map(h => h.trim()).filter(h => h);
      hdrs.forEach(h => {
        if (!hdrToRows.has(h)) hdrToRows.set(h, []);
        hdrToRows.get(h)!.push({ data: d, index });
      });
    });

    const duplicates: { 
      hdr: string; 
      rows: {data: LogisticsData, index: number}[];
      systemData: {
        fecha: string;
        piezasTotal: number;
        entregadas: number;
        noEntregadas: number;
      }
    }[] = [];

    const countsMap = new Map<string, { entregadas: number, noEntregadas: number, total: number }>();
    consultaGlobal.forEach(c => {
      const h = String(c.hojaRuta).trim();
      if (!countsMap.has(h)) countsMap.set(h, { entregadas: 0, noEntregadas: 0, total: 0 });
      const counts = countsMap.get(h)!;
      counts.total++;
      if (isStateEntregado(c.estado)) counts.entregadas++;
      else counts.noEntregadas++;
    });

    hdrToRows.forEach((rows, hdr) => {
      if (rows.length > 1) {
        const hdrDistData = hdrDistribuidores.find(h => String(h.hojaRuta) === hdr);
        const cCounts = countsMap.get(hdr) || { entregadas: 0, noEntregadas: 0, total: 0 };
        
        let sysFecha = "No encontrada";
        if (hdrDistData?.fecha) sysFecha = hdrDistData.fecha;

        let sysTotal = hdrDistData?.cantidad ?? cCounts.total;

        duplicates.push({ 
          hdr, 
          rows,
          systemData: {
            fecha: sysFecha,
            piezasTotal: sysTotal,
            entregadas: cCounts.entregadas,
            noEntregadas: sysTotal - cCounts.entregadas // Calculation requested: noEntregadas = total - entregadas
          }
        });
      }
    });

    return {
      duplicatedHdrs: duplicates.sort((a, b) => a.hdr.localeCompare(b.hdr, undefined, { numeric: true })),
      consultaCounts: countsMap
    };
  }, [data, mappedData, hdrDistribuidores, consultaGlobal]);

  const hasHdrDiscrepancies = useMemo(() => {
    return hdrDiscrepancies.branch.length > 0 || hdrDiscrepancies.route.length > 0 || duplicatedHdrs.length > 0;
  }, [hdrDiscrepancies, duplicatedHdrs]);

  const piezasEntregadasCount = useMemo(() => {
    if (consultaGlobal.length === 0 || mappedData.length === 0) return 0;
    
    // Get all unique route IDs from mappedData (not excluded)
    const activeRouteIds = new Set<string>();
    mappedData.forEach((d, index) => {
      if (excludedIndices.has(index)) return;
      // Split routes if they contain hyphens (e.g., "20687-20688")
      d.hojaRuta.split(/[\-\/]/).forEach(r => activeRouteIds.add(r.trim()));
    });

    // Count pieces in consultaGlobal that match these routes AND are delivered
    return consultaGlobal.filter(p => {
      const routeStr = String(p.hojaRuta);
      return activeRouteIds.has(routeStr) && isStateEntregado(p.estado);
    }).length;
  }, [consultaGlobal, mappedData, excludedIndices]);

  const correctedNovedadesCount = useMemo(() => {
    return (Object.values(corrections) as Partial<LogisticsData>[]).filter(c => c.visitadasNovedad !== undefined || c.noVisitadas !== undefined).length;
  }, [corrections]);

  const modifiedRoutesCount = useMemo(() => {
    return data.filter((d, index) => {
      if (excludedIndices.has(index)) return false;
      const m = mappedData[index];
      return (
        d.piezasTotal !== m.piezasTotal ||
        d.piezasEntregadas !== m.piezasEntregadas ||
        d.piezasNoEntregadas !== m.piezasNoEntregadas ||
        d.bultosTotal !== m.bultosTotal ||
        d.bultosEntregados !== m.bultosEntregados ||
        d.bultosDevueltos !== m.bultosDevueltos ||
        d.visitadasNovedad !== m.visitadasNovedad ||
        d.noVisitadas !== m.noVisitadas ||
        d.vehiculo !== m.vehiculo ||
        d.zona !== m.zona
      );
    }).length;
  }, [data, mappedData, excludedIndices]);

  const totalNovedadesCorregidas = useMemo(() => {
    const pendingQuantitySet = new Set(pendingQuantityDiscrepancies);
    const pendingNovedadSet = new Set(pendingNovedadDiscrepancies);
    
    const allInitialDiscrepancies = new Set([
      ...initialDiscrepancyIndices,
      ...initialNovedadDiscrepancyIndices
    ]);
    
    return Array.from(allInitialDiscrepancies)
      .filter(idx => 
        !excludedIndices.has(idx) && 
        !pendingQuantitySet.has(idx) && 
        !pendingNovedadSet.has(idx)
      )
      .reduce((acc, idx) => acc + mappedData[idx].piezasTotal, 0);
  }, [initialDiscrepancyIndices, initialNovedadDiscrepancyIndices, pendingQuantityDiscrepancies, pendingNovedadDiscrepancies, excludedIndices, mappedData]);


  const sucursalesEnArchivo = useMemo(() => {
    const sucs = new Set(mappedData.map(d => d.sucursal));
    if (isPending) sucs.add(selectedSucursal);
    return Array.from(sucs).filter(s => s !== "PENDING_SUCURSAL");
  }, [mappedData, isPending, selectedSucursal]);
  
  const hasExistingPresupuestos = existingPresupuestos && Object.keys(existingPresupuestos).length > 0;
  
  const budgetStatus = useMemo(() => {
    const hasExisting = existingPresupuestos && Object.keys(existingPresupuestos).length > 0;
    
    // Check if any budgets are actually being changed/added
    const anyChanges = Object.entries(budgetResolutions).some(([suc, res]) => {
      if (res !== 'replace') return false;
      
      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
      const amount = pendingPresupuestos?.[suc] || 0;
      const existing = existingPresupuestos?.[branchName] || 0;
      
      const normalizedBranch = normalizeString(branchName);
      const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
      if (!isKnown) return false;

      return existing !== amount;
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
      const observations: any[] = [];
      data.forEach((d, idx) => {
        if (d.zona === z && !excludedIndices.has(idx)) {
          observations.push({
            sucursal: mappedData[idx].sucursal,
            fecha: mappedData[idx].fecha,
            hojaRuta: mappedData[idx].hojaRuta,
            distribuidor: mappedData[idx].distribuidor
          });
        }
      });
      return { zona: z, observations };
    }).filter(z => z.observations.length > 0);
  }, [unknownZones, data, mappedData, excludedIndices]);

  const unknownVehiclesWithDetails = useMemo(() => {
    return unknownVehicles.map(v => {
      const observations: any[] = [];
      data.forEach((d, idx) => {
        if ((d.vehiculo || "") === v && !excludedIndices.has(idx)) {
          observations.push({
            sucursal: mappedData[idx].sucursal,
            fecha: mappedData[idx].fecha,
            hojaRuta: mappedData[idx].hojaRuta,
            distribuidor: mappedData[idx].distribuidor
          });
        }
      });
      return { vehiculo: v, observations };
    }).filter(v => v.observations.length > 0);
  }, [unknownVehicles, data, mappedData, excludedIndices]);

  const needsVehicleMapping = unknownVehiclesWithDetails.length > 0;
  const needsZoneMapping = unknownZonesWithDetails.length > 0;

  // Duplicate and Conflict detection
  const { duplicates, conflicts, newRoutes } = useMemo(() => {
    if (step === 'vehicle_mapping' || step === 'zone_mapping') return { duplicates: [], conflicts: [], newRoutes: [] };

    const dups: LogisticsData[] = [];
    const confs: { id: string; existing: LogisticsData; incoming: LogisticsData }[] = [];
    const news: LogisticsData[] = [];

    const existingMap = new Map<string, LogisticsData>();
    const existingHdrNumbersMap = new Map<string, LogisticsData>();

    existingData.forEach(d => {
      const id = getRouteId(d);
      existingMap.set(id, d);
      
      // Map each individual number to its route for partial overlap detection
      const numbers = id.split("-");
      numbers.forEach(num => {
        const trimmed = num.trim();
        if (trimmed) {
          existingHdrNumbersMap.set(trimmed, d);
        }
      });
    });

    mappedData.forEach((incoming, index) => {
      if (excludedIndices.has(index)) return;
      
      const id = getRouteId(incoming);
      const existingById = existingMap.get(id);

      if (existingById) {
        if (areRoutesEqual(existingById, incoming)) {
          dups.push(incoming);
        } else {
          confs.push({ id, existing: existingById, incoming });
        }
      } else {
        // Check for partial overlaps in HDR numbers
        const incomingNumbers = id.split("-");
        let partialExisting: LogisticsData | undefined;
        
        for (const num of incomingNumbers) {
          const trimmed = num.trim();
          if (trimmed) {
            const found = existingHdrNumbersMap.get(trimmed);
            if (found) {
              partialExisting = found;
              break;
            }
          }
        }

        if (partialExisting) {
          // It's a conflict because it shares numbers but the full ID is different
          confs.push({ id, existing: partialExisting, incoming });
        } else {
          news.push(incoming);
        }
      }
    });

    return { duplicates: dups, conflicts: confs, newRoutes: news };
  }, [mappedData, existingData, isPending, selectedSucursal, step, excludedIndices]);

  const totalUnknownVehiclesRoutes = useMemo(() => {
    return unknownVehiclesWithDetails.reduce((acc, v) => acc + v.observations.length, 0);
  }, [unknownVehiclesWithDetails]);

  const totalUnknownZonesRoutes = useMemo(() => {
    return unknownZonesWithDetails.reduce((acc, z) => acc + z.observations.length, 0);
  }, [unknownZonesWithDetails]);

  const summaryItems = useMemo(() => {
    const items = [];
    if (missingColumns.length > 0) {
      items.push({
        type: 'missing_columns',
        title: 'Columnas Faltantes',
        description: 'Se detectaron columnas faltantes en el archivo.',
        count: missingColumns.length
      });
    }
    if (pendingQuantityDiscrepancies.length > 0) {
      items.push({
        type: 'quantity_validation',
        title: 'Rutas con Discrepancias en las Sumas de Piezas y Bultos.',
        description: 'Se detectaron inconsistencias en las sumas de cantidad de piezas y bultos',
        count: pendingQuantityDiscrepancies.length
      });
    }
    if (pendingNovedadDiscrepancies.length > 0) {
      items.push({
        type: 'novedad_validation',
        title: 'Rutas con Discrepancias en las Novedades.',
        description: 'Se detectaron inconsistencias en las novedades de las piezas',
        count: pendingNovedadDiscrepancies.length
      });
    }
    if (duplicatedHdrs.length > 0) {
      items.push({
        type: 'duplicated_hdr_validation',
        title: 'HDR Duplicadas en Múltiples Rutas',
        description: 'Se detectaron HDR asignadas a más de una ruta. Debe unificarlas o corregirlas.',
        count: duplicatedHdrs.length
      });
    }
    if (hdrDistribuidores.length > 0 && hasHdrDiscrepancies) {
      items.push({
        type: 'route_validation',
        title: 'Rutas con Discrepancias en la Cantidad de Piezas por HDR.',
        description: 'Existen diferencias entre las piezas de la planilla y las registradas en el archivo HDR',
        count: (hdrDiscrepancies.branch.length + hdrDiscrepancies.route.length)
      });
    }
    if (consultaGlobal.length > 0 && hasEstadoDiscrepancies) {
      items.push({
        type: 'estado_validation',
        title: 'Rutas con Discrepancias en los Estados.',
        description: 'Se encontraron inconsistencias en los estados de entrega comparados con la Consulta Global.',
        count: (estadoDiscrepancies.branch.length + estadoDiscrepancies.route.length)
      });
    }
    if (needsVehicleMapping) {
      items.push({
        type: 'vehicle_mapping',
        title: 'Rutas con Discrepancias en los Vehículos.',
        description: 'Se detectaron inconsistencias con los tipos de vehículos permitidos',
        count: totalUnknownVehiclesRoutes
      });
    }
    if (needsZoneMapping) {
      items.push({
        type: 'zone_mapping',
        title: 'Rutas con Discrepancias en las Zonas.',
        description: 'Se detectaron inconsistencias con las zonas habilitadas',
        count: totalUnknownZonesRoutes
      });
    }
    if (pendingDateDiscrepancies.length > 0) {
      items.push({
        type: 'date_validation',
        title: 'Rutas con Discrepancias en las Fechas.',
        description: 'Se detectaron rutas con diferencias en las fechas del mes analizado',
        count: pendingDateDiscrepancies.length
      });
    }
    if (hasDifferentPresupuestos) {
      items.push({
        type: 'budget_validation',
        title: 'Diferencias en Presupuestos',
        description: 'Se detectaron sucursales con presupuestos diferentes a los existentes.',
        count: differentBudgetsCount
      });
    }
    if (conflicts.length > 0) {
      items.push({
        type: 'conflicts',
        title: 'Conflictos con Datos Existentes',
        description: 'Se encontraron registros que ya existen en el sistema con datos diferentes.',
        count: conflicts.length
      });
    }
    return items;
  }, [missingColumns, pendingQuantityDiscrepancies, pendingNovedadDiscrepancies, hdrDistribuidores, hasHdrDiscrepancies, hdrDiscrepancies, consultaGlobal, hasEstadoDiscrepancies, estadoDiscrepancies, needsVehicleMapping, totalUnknownVehiclesRoutes, needsZoneMapping, totalUnknownZonesRoutes, pendingDateDiscrepancies, hasDifferentPresupuestos, differentBudgetsCount, conflicts]);

  const getFirstStep = () => {
    if (missingColumns.length > 0) return 'missing_columns';
    if (pendingQuantityDiscrepancies.length > 0) return 'quantity_validation';
    if (pendingNovedadDiscrepancies.length > 0) return 'novedad_validation';
    if (duplicatedHdrs.length > 0) return 'duplicated_hdr_validation';
    if (hdrDistribuidores.length > 0 && hasHdrDiscrepancies) return 'route_validation';
    if (consultaGlobal.length > 0 && hasEstadoDiscrepancies) return 'estado_validation';
    if (needsVehicleMapping) return 'vehicle_mapping';
    if (needsZoneMapping) return 'zone_mapping';
    if (pendingDateDiscrepancies.length > 0) return 'date_validation';
    if (hasDifferentPresupuestos) return 'budget_validation';
    if (conflicts.length > 0) return 'conflicts';
    return 'validation';
  };

  useEffect(() => {
    // Initial step determination: ALWAYS start with branch selection
    setStep('branch_selection');
  }, []); // Only on mount to set initial step

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
  const totalPiezas = mappedData.filter((_, idx) => !excludedIndices.has(idx)).reduce((acc, curr) => acc + curr.piezasTotal, 0);
  const totalBultos = mappedData.filter((_, idx) => !excludedIndices.has(idx)).reduce((acc, curr) => acc + curr.bultosTotal, 0);

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

  const getNextStep = (currentStep: string): any => {
    if (currentStep === 'summary') return getFirstStep();
    if (currentStep === 'missing_columns') {
      if (pendingQuantityDiscrepancies.length > 0) return 'quantity_validation';
      if (pendingNovedadDiscrepancies.length > 0) return 'novedad_validation';
      if (hdrDistribuidores.length > 0 && hasHdrDiscrepancies) return 'route_validation';
      if (consultaGlobal.length > 0 && hasEstadoDiscrepancies) return 'estado_validation';
      if (needsVehicleMapping) return 'vehicle_mapping';
      if (needsZoneMapping) return 'zone_mapping';
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'branch_selection') {
      const hasDiscrepancies = summaryItems.length > 0;
      return hasDiscrepancies ? 'summary' : 'validation';
    }
    if (currentStep === 'quantity_validation') {
      if (pendingNovedadDiscrepancies.length > 0) return 'novedad_validation';
      if (duplicatedHdrs.length > 0) return 'duplicated_hdr_validation';
      if (hdrDistribuidores.length > 0 && hasHdrDiscrepancies) return 'route_validation';
      if (consultaGlobal.length > 0 && hasEstadoDiscrepancies) return 'estado_validation';
      if (needsVehicleMapping) return 'vehicle_mapping';
      if (needsZoneMapping) return 'zone_mapping';
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'novedad_validation') {
      if (duplicatedHdrs.length > 0) return 'duplicated_hdr_validation';
      if (hdrDistribuidores.length > 0 && hasHdrDiscrepancies) return 'route_validation';
      if (consultaGlobal.length > 0 && hasEstadoDiscrepancies) return 'estado_validation';
      if (needsVehicleMapping) return 'vehicle_mapping';
      if (needsZoneMapping) return 'zone_mapping';
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'duplicated_hdr_validation') {
      if (hdrDistribuidores.length > 0 && hasHdrDiscrepancies) return 'route_validation';
      if (consultaGlobal.length > 0 && hasEstadoDiscrepancies) return 'estado_validation';
      if (needsVehicleMapping) return 'vehicle_mapping';
      if (needsZoneMapping) return 'zone_mapping';
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'route_validation') {
      if (consultaGlobal.length > 0 && hasEstadoDiscrepancies) return 'estado_validation';
      if (needsVehicleMapping) return 'vehicle_mapping';
      if (needsZoneMapping) return 'zone_mapping';
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'estado_validation') {
      if (needsVehicleMapping) return 'vehicle_mapping';
      if (needsZoneMapping) return 'zone_mapping';
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'vehicle_mapping') {
      if (needsZoneMapping) return 'zone_mapping';
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'zone_mapping') {
      if (pendingDateDiscrepancies.length > 0) return 'date_validation';
      if (hasDifferentPresupuestos) return 'budget_validation';
      if (conflicts.length > 0) return 'conflicts';
      return 'validation';
    }
    if (currentStep === 'date_validation') {
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

  const handleConfirm = () => {
    if (mode === 'view') {
      const next = getNextStep(step);
      if (next === 'validation') {
        setStep('summary');
        setStepHistory([]);
      } else if (next) {
        setStepHistory(prev => [...prev, step]);
        setStep(next);
      }
      return;
    }

    if (step === 'quantity_validation') {
      const nextS = getNextStep(step);
      if (nextS) {
        setStepHistory(prev => [...prev, step]);
        setStep(nextS);
        return;
      }
    }

    if (step === 'novedad_validation') {
      const nextS = getNextStep(step);
      if (nextS) {
        setStepHistory(prev => [...prev, step]);
        setStep(nextS);
        return;
      }
    }

    if (step === 'duplicated_hdr_validation') {
      const nextS = getNextStep(step);
      if (nextS) {
        setStepHistory(prev => [...prev, step]);
        setStep(nextS);
        return;
      }
    }

    if (step === 'vehicle_mapping') {
      const newMapping = { ...vehicleMapping };
      let changed = false;
      unknownVehicles.forEach(v => {
        if (!newMapping[v]) {
          newMapping[v] = "Local Comercial"; // Default to Local Comercial instead of Auto
          changed = true;
        }
      });
      if (changed) setVehicleMapping(newMapping);
    }

    if (step === 'zone_mapping') {
      const newMapping = { ...zoneMapping };
      let changed = false;
      unknownZones.forEach(z => {
        if (!newMapping[z]) {
          newMapping[z] = 'CAPITAL';
          changed = true;
        }
      });
      if (changed) setZoneMapping(newMapping);
    }

    const nextS = getNextStep(step);
    if (nextS) {
      setStepHistory(prev => [...prev, step]);
      setStep(nextS);
      return;
    }

    const finalData = mappedData.filter((_, idx) => !excludedIndices.has(idx));

    const dataToAdd = [
      ...newRoutes.filter(r => finalData.some(fd => getRouteId(fd) === getRouteId(r))),
      ...conflicts.filter(c => finalData.some(fd => getRouteId(fd) === c.id)).map(c => {
        const resolutions = conflictResolution[c.id] || {};
        const merged = { ...c.existing };
        const diffs = getDifferences(c.existing, c.incoming);
        
        // Apply resolutions for each difference
        diffs.forEach(diff => {
          const res = resolutions[diff.key] || 'replace';
          if (res === 'replace') {
            (merged as any)[diff.key] = c.incoming[diff.key];
          }
        });
        
        return merged;
      })
    ].map((d) => ({
      ...d,
      vehiculo: vehicleMapping[d.vehiculo] || d.vehiculo,
      zona: normalizeZone(d.zona) || zoneMapping[d.zona] || d.zona,
    }));

    // Deduplicate dataToAdd by ID (keep the last one found in the file)
    const uniqueDataToAdd: LogisticsData[] = [];
    const addedIds = new Set<string>();
    for (let i = dataToAdd.length - 1; i >= 0; i--) {
      const id = getRouteId(dataToAdd[i]);
      if (!addedIds.has(id)) {
        uniqueDataToAdd.unshift(dataToAdd[i]);
        addedIds.add(id);
      }
    }

    // For any conflict that has at least one 'replace' or is a partial overlap, we replace the existing one
    const idsToRemove = conflicts
      .filter(c => {
        const resolutions = conflictResolution[c.id] || {};
        const hasAnyReplace = Object.values(resolutions).some(r => r === 'replace');
        // If no resolutions set yet, default is replace all
        const isDefaultReplace = Object.keys(resolutions).length === 0;
        return hasAnyReplace || isDefaultReplace;
      })
      .map(c => c.id);

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

    onConfirm(uniqueDataToAdd, finalPresupuestos, true, idsToRemove);
  };

  const handleBack = () => {
    if (stepHistory.length > 0) {
      const newHistory = [...stepHistory];
      const prevStep = newHistory.pop();
      setStepHistory(newHistory);
      if (prevStep) {
        setStep(prevStep as any);
        if (prevStep === 'summary' || prevStep === 'branch_selection') {
          setMode(null);
        }
      }
    }
  };

  const replacedRoutes = useMemo(() => {
    return conflicts.filter(c => {
      const resolutions = conflictResolution[c.id] || {};
      return Object.values(resolutions).some(r => r === 'replace') || Object.keys(resolutions).length === 0;
    });
  }, [conflicts, conflictResolution]);

  const handleExportCorrectedData = async () => {
    setIsExportingCorrected(true);
    try {
      const mergedData = mappedData
        .map((d, index) => ({ d, index }))
        .filter(({ index }) => !excludedIndices.has(index))
        .map(({ d, index }) => {
          const correction = corrections[index] || {};
          const modifiedFields = new Set(Object.keys(correction));
          
          if (allDeliveredIndices.has(index)) {
            modifiedFields.add('piezasEntregadas');
            modifiedFields.add('piezasNoEntregadas');
            modifiedFields.add('bultosEntregados');
            modifiedFields.add('bultosDevueltos');
          }
          
          if (allNoveltyIndices.has(index)) {
            modifiedFields.add('visitadasNovedad');
            modifiedFields.add('noVisitadas');
          }
          
          const rawVehiculo = data[index]?.vehiculo?.trim() || "";
          const rawZona = data[index]?.zona || "";

          if (vehicleMapping[rawVehiculo] && vehicleMapping[rawVehiculo] !== rawVehiculo) {
            modifiedFields.add('vehiculo');
          }

          if (zoneMapping[rawZona] && zoneMapping[rawZona] !== rawZona) {
            modifiedFields.add('zona');
          }

          let vehiculo = d.vehiculo;
          let zona = d.zona;

          if (vehicleMapping[d.vehiculo] && vehicleMapping[d.vehiculo] !== d.vehiculo) {
            vehiculo = vehicleMapping[d.vehiculo];
            modifiedFields.add('vehiculo');
          }

          if (zoneMapping[d.zona] && zoneMapping[d.zona] !== d.zona) {
            zona = zoneMapping[d.zona];
            modifiedFields.add('zona');
          }

          return {
            ...d,
            ...correction,
            vehiculo,
            zona,
            _modified_fields: Array.from(modifiedFields)
          };
      });

      const payload = {
        filename: "Planilla_Corregida.xlsx",
        data: mergedData.map(d => {
          const exportRow: Record<string, any> = {
            "Sucursal": d.sucursal,
            "Fecha": d.fecha,
            "Distribuidor": d.distribuidor,
            "Vehículo": d.vehiculo,
            "Hoja de Ruta": d.hojaRuta,
            "Ruta": d.ruta,
            "Total Piezas": d.piezasTotal,
            "Total Bultos": d.bultosTotal,
            "Peso (Kg)": d.peso,
            "Pallets": d.palets,
            "Zona": d.zona,
            "Piezas Entregadas": d.piezasEntregadas,
            "Piezas No Entregadas": d.piezasNoEntregadas,
            "Visitadas con Novedad": d.visitadasNovedad,
            "No Visitadas": d.noVisitadas,
            "Bultos Entregados": d.bultosEntregados,
            "Bultos Devueltos": d.bultosDevueltos,
            "Costo Total": d.costoTotal,
            "Presupuesto": d.presupuesto,
            "Estado": d.estado,
            "Observaciones": d.observaciones,
          };

          const keyMap: Record<string, string> = {
            sucursal: "Sucursal", fecha: "Fecha", distribuidor: "Distribuidor",
            vehiculo: "Vehículo", hojaRuta: "Hoja de Ruta", ruta: "Ruta",
            piezasTotal: "Total Piezas", bultosTotal: "Total Bultos", peso: "Peso (Kg)",
            palets: "Pallets", zona: "Zona", piezasEntregadas: "Piezas Entregadas",
            piezasNoEntregadas: "Piezas No Entregadas", visitadasNovedad: "Visitadas con Novedad",
            noVisitadas: "No Visitadas", bultosEntregados: "Bultos Entregados",
            bultosDevueltos: "Bultos Devueltos", costoTotal: "Costo Total",
            presupuesto: "Presupuesto", estado: "Estado", observaciones: "Observaciones"
          };
          
          const highlightColumns = Array.from((d as any)._modified_fields || [])
            .map(k => keyMap[k as string])
            .filter(Boolean);

          exportRow["_highlight_columns"] = highlightColumns;
          return exportRow;
        })
      };

      const response = await fetch(`${window.location.origin}/api/export-corrected-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Error al exportar los datos corregidos');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Planilla_Corregida_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Export failed:", error);
      alert("Hubo un error al exportar la planilla corregida.");
    } finally {
      setIsExportingCorrected(false);
    }
  };

  const handleExportPiezasPlanilla = async () => {
    setIsExportingPiezasPlanilla(true);
    try {
      const activeHojasRuta = new Set<string>();
      mappedData.forEach((d, idx) => {
        if (!excludedIndices.has(idx) && d.hojaRuta) {
          // Splitting by ' / ' and '-' just in case there are multiple
          const hdrs = String(d.hojaRuta).split(/[\-\/]/).map(h => h.trim()).filter(h => h);
          hdrs.forEach(h => activeHojasRuta.add(normalizeHojaRuta(h)));
        }
      });

      const piezasData: any[] = [];
      consultaGlobal.forEach(p => {
        if (p.hojaRuta && activeHojasRuta.has(normalizeHojaRuta(p.hojaRuta))) {
          piezasData.push({
            pieza: p.pieza || "N/A",
            hojaRuta: p.hojaRuta,
            estado: p.estado || "N/A",
            codigo: p.codigo || "N/A",
            cliente: p.cliente || "N/A",
            fechaCambioEstado: p.fechaCambioEstado || "N/A"
          });
        }
      });

      const response = await fetch('/api/export-piezas-planilla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piezas: piezasData })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Error al exportar piezas de planilla');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Piezas_Planilla_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Export pieces failed:", error);
      alert("Hubo un error al exportar las piezas de la planilla.");
    } finally {
      setIsExportingPiezasPlanilla(false);
    }
  };

  const handleExportAllDiscrepancies = async () => {
    setIsExportingAllDiscrepancies(true);
    try {
      // Gather all data
      const quantityData = quantityDiscrepancies.map(({ data: d }) => ({
        sucursal: d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal,
        fecha: d.fecha,
        ruta: d.ruta || d.hojaRuta,
        piezasTotal: d.piezasTotal,
        piezasEntregadas: d.piezasEntregadas,
        piezasNoEntregadas: d.piezasNoEntregadas,
        bultosTotal: d.bultosTotal,
        bultosEntregados: d.bultosEntregados,
        bultosNoEntregados: d.bultosDevueltos,
        hdrConsulta: ""
      }));

      const novedadData = novedadDiscrepancies.map(({ data: d }) => ({
        sucursal: d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal,
        fecha: d.fecha,
        ruta: d.ruta || d.hojaRuta,
        piezasTotal: d.piezasTotal,
        piezasConNovedad: d.visitadasNovedad,
        piezasSinNovedad: d.noVisitadas,
        hdrConsulta: ""
      }));

      const routeDiscrepanciesData = hdrDiscrepancies.route.map(d => ({
        sucursal: d.sucursal,
        fecha: d.fecha,
        hojas_ruta: d.hojasRuta,
        piezas_planilla: d.piezasPlanilla,
        piezas_hdr: d.piezasHDR,
        diferencia: d.diferencia,
        hdr_consulta: "",
        hdrConsulta: ""
      }));

      // Calculate totals for the route sheet summary table
      const totalEntregadasPlanilla = estadoDiscrepancies.branch.reduce((acc, d) => acc + d.planillaTotal, 0);
      const totalEntregadasConsulta = estadoDiscrepancies.branch.reduce((acc, d) => acc + d.consultaTotal, 0);
      const totalNoEntregadasPlanilla = estadoDiscrepancies.route.reduce((acc, d) => acc + d.planillaNonDelivered, 0);
      const totalNoEntregadasConsulta = estadoDiscrepancies.route.reduce((acc, d) => acc + d.totalSystemNonDelivered, 0);

      const routeSummary = {
        total_piezas_entregadas_planilla: totalEntregadasPlanilla,
        total_piezas_entregadas_consulta: totalEntregadasConsulta,
        total_piezas_no_entregadas_planilla: totalNoEntregadasPlanilla,
        total_piezas_no_entregadas_consulta: totalNoEntregadasConsulta,
        diferencia_entregadas: totalEntregadasPlanilla - totalEntregadasConsulta,
        diferencia_no_entregadas: totalNoEntregadasPlanilla - totalNoEntregadasConsulta
      };

      const estadoBranchData = estadoDiscrepancies.branch.map(d => ({
        sucursal: d.sucursal,
        planillaTotal: d.planillaTotal,
        consultaTotal: d.consultaTotal,
        diferencia: d.planillaTotal - d.consultaTotal,
        pieces: d.pieces.map(p => ({
          hdrPlanilla: p.hdrPlanilla,
          piezasConsulta: p.piezasConsulta,
          hdrConsulta: p.hdrConsulta || "",
          fechaCambioEstado: p.fechaCambioEstado
        }))
      }));

      const estadoRouteData = estadoDiscrepancies.route.map(d => ({
        sucursal: d.sucursal,
        fecha: d.fecha,
        hoja_ruta: d.hojaRuta,
        ruta: d.ruta,
        planilla_no_entregado: d.planillaNonDelivered,
        consulta_no_entregado: d.consultaNonDelivered,
        piezas_faltantes: d.missingPieces,
        total_sistema_no_entregado: d.totalSystemNonDelivered,
        // New fields requested for the Excel
        rutas_planilla: d.hojaRuta,
        piezas_no_entregadas_planilla: d.planillaNonDelivered,
        piezas_no_entregadas_consulta_total: d.totalSystemNonDelivered
      }));

      const vehicleData = unknownVehiclesWithDetails.flatMap(v => v.observations.map(obs => ({
        sucursal: obs.sucursal === "Sucursal por definir" ? selectedSucursal : obs.sucursal,
        fecha: obs.fecha,
        ruta: obs.hojaRuta,
        vehiculo: v.vehiculo,
        hdrConsulta: ""
      })));

      const zoneData = unknownZonesWithDetails.flatMap(z => z.observations.map(obs => ({
        sucursal: obs.sucursal === "Sucursal por definir" ? selectedSucursal : obs.sucursal,
        fecha: obs.fecha,
        ruta: obs.hojaRuta,
        zona: z.zona,
        hdrConsulta: ""
      })));

      const dateData = pendingDateDiscrepancies.map(idx => {
        const d = mappedData[idx];
        return {
          sucursal: d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal,
          ruta: d.ruta || d.hojaRuta,
          fecha: d.fecha,
          hdrConsulta: ""
        };
      });

      const resumenGeneralData = [
        { descripcion: "Rutas con Discrepancias en las Sumas de Piezas y Bultos", cantidad: pendingQuantityDiscrepancies.length },
        { descripcion: "Rutas con Discrepancias en las Novedades", cantidad: pendingNovedadDiscrepancies.length },
        { descripcion: "Rutas con Discrepancias en la Cantidad de Piezas por HDR", cantidad: (hdrDiscrepancies.branch.length + hdrDiscrepancies.route.length) },
        { descripcion: "Rutas con Discrepancias en los Estados", cantidad: (estadoDiscrepancies.branch.length + estadoDiscrepancies.route.length) },
        { descripcion: "Rutas con Discrepancias en los Vehículos", cantidad: totalUnknownVehiclesRoutes },
        { descripcion: "Rutas con Discrepancias en las Zonas", cantidad: totalUnknownZonesRoutes },
        { descripcion: "Rutas con Discrepancias en las Fechas", cantidad: pendingDateDiscrepancies.length }
      ];

      const totalHdrMasPlanilla = hdrDiscrepancies.route.filter(d => d.piezasPlanilla > d.piezasHDR).length;
      const totalHdrMasArchivo = hdrDiscrepancies.route.filter(d => d.piezasHDR > d.piezasPlanilla).length;

      const rutasResumenData = [
        { descripcion: "Total HDR con discrepancias entre planilla y archivo HDR", cantidad: hdrDiscrepancies.route.length }
      ];

      if (totalHdrMasPlanilla > 0) {
        rutasResumenData.push({ descripcion: "Total HDR con más piezas en planilla que en archivo HDR", cantidad: totalHdrMasPlanilla });
      }
      if (totalHdrMasArchivo > 0) {
        rutasResumenData.push({ descripcion: "Total HDR con más piezas en archivo HDR que en planilla", cantidad: totalHdrMasArchivo });
      }

      rutasResumenData.push({ descripcion: "Total piezas encontradas en planilla", cantidad: hdrDiscrepancies.route.reduce((acc, d) => acc + d.piezasPlanilla, 0) });
      rutasResumenData.push({ descripcion: "Total piezas encontradas en consulta", cantidad: hdrDiscrepancies.route.reduce((acc, d) => acc + d.piezasHDR, 0) });
      rutasResumenData.push({ descripcion: "Total HDR no encontrada en consulta", cantidad: estadoDiscrepancies.missingHdrs.length });

      const response = await fetch(`${window.location.origin}/api/export-discrepancies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: quantityData,
          novedad: novedadData,
          route: routeDiscrepanciesData,
          route_summary: routeSummary,
          summary: routeSummary,
          estado_sucursal: estadoBranchData,
          estado_ruta: estadoRouteData,
          estados: {
            sucursal: estadoBranchData,
            ruta: estadoRouteData,
            missing_hdrs: estadoDiscrepancies.missingHdrs
          },
          missing_hdrs: estadoDiscrepancies.missingHdrs,
          vehicle: vehicleData,
          zone: zoneData,
          date: dateData,
          resumen_general: resumenGeneralData,
          rutas_resumen: rutasResumenData
        })
      });

      if (!response.ok) {
        let errorMsg = `Error del servidor: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.details || errorData.error || errorMsg;
        } catch (e) {
          // If not JSON, try to get text
          try {
            const text = await response.text();
            if (text && text.length < 200) errorMsg = text;
          } catch (e2) {}
        }
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Consolidado_Discrepancias_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Export failed", error);
      alert(`Error al exportar el consolidado de discrepancias: ${error.message}`);
    } finally {
      setIsExportingAllDiscrepancies(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary-900/40 backdrop-blur-sm overflow-y-auto py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-4xl bg-white rounded-xl border border-secondary-200 overflow-hidden my-auto min-h-[80vh] flex flex-col"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="px-5 py-4 border-b border-secondary-100 flex items-center">
          <h2 className="text-lg font-semibold text-secondary-900">
            Validación de Datos
          </h2>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[85vh]">
          {step === 'summary' ? (
            <div className="space-y-6">
              <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200">
                <div className="flex flex-col space-y-0.5 mb-4 text-amber-700">
                  <h3 className="text-lg font-bold tracking-tight">Resumen de Discrepancias Detectadas</h3>
                  <p className="text-secondary-700 text-sm leading-relaxed">
                    Se han encontrado {summaryItems.reduce((acc, item) => acc + (item.count || 0), 0)} inconsistencias en los datos cargados. Puede revisarlas una a una, exportarlas para un análisis externo, o proceder con las correcciones.
                  </p>
                </div>
                
                <div className="space-y-2 max-w-xl mx-auto">
                  {summaryItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 px-4 bg-white rounded-xl border border-amber-100 shadow-sm hover:border-amber-300 hover:bg-amber-100 transition-all group cursor-default">
                      <div className="flex items-center flex-1">
                        <AlertTriangle className="w-5 h-5 text-amber-700 mr-3 shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-secondary-900 tracking-wide">{item.title}</h4>
                          <p className="text-xs text-secondary-600 mt-0.5">{item.description}</p>
                        </div>
                      </div>
                      <div className="ml-4 w-12 flex items-center justify-center">
                        <span className="text-sm font-bold text-secondary-900">{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-8 max-w-2xl mx-auto">
                  {/* Column 1 */}
                  <div className="space-y-4">
                    <button
                      onClick={handleExportAllDiscrepancies}
                      disabled={isExportingAllDiscrepancies}
                      className="w-full flex items-center justify-center px-3 py-2 bg-blue-500 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md disabled:opacity-50"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {isExportingAllDiscrepancies ? 'Exportando...' : 'Exportar Discrepancias'}
                    </button>
                    <button
                      onClick={() => {
                        setMode('view');
                        setStepHistory(['summary']);
                        setStep(getFirstStep());
                      }}
                      className="w-full flex items-center justify-center px-3 py-2 bg-blue-500 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                    >
                      Revisar Discrepancias
                    </button>
                    <button
                      onClick={() => {
                        setStep('branch_selection');
                        setStepHistory(['summary']);
                      }}
                      className="w-full flex items-center justify-center px-3 py-2 bg-blue-500 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                    >
                      Reasignar Sucursal
                    </button>
                  </div>

                  {/* Column 2 */}
                  <div className="space-y-4">
                    <button
                      onClick={() => {
                        setMode('edit');
                        setStepHistory(['summary']);
                        setStep(getFirstStep());
                      }}
                      className="w-full flex items-center justify-center px-3 py-2 bg-blue-500 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                    >
                      Corregir Discrepancias
                    </button>
                    <button
                      onClick={() => {
                        onConfirm(data.map(d => ({
                          ...d,
                          sucursal: d.sucursal === "PENDING_SUCURSAL" ? selectedSucursal : d.sucursal
                        })));
                      }}
                      className="w-full flex items-center justify-center px-3 py-2 bg-blue-500 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                    >
                      Continuar Análisis
                    </button>
                    <button
                      onClick={onCancel}
                      className="w-full flex items-center justify-center px-3 py-2 bg-red-400 text-white text-sm font-bold rounded-xl hover:bg-red-800 active:scale-95 transition-all shadow-md"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 'missing_columns' ? (
            <div className="space-y-6">
              <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200">
                <div className="flex items-center mb-6 text-amber-700">
                  <h3 className="text-xl font-bold tracking-tight uppercase">Columnas Faltantes en Archivo Consolidado</h3>
                </div>
                
                <div className="bg-white rounded-xl border border-amber-200 p-6 shadow-sm mb-6">
                  <p className="text-secondary-700 mb-6 leading-relaxed">
                    Se ha detectado que el archivo cargado es un <span className="font-bold text-secondary-900">Archivo Consolidado</span>, pero no se han encontrado las siguientes columnas o datos críticos:
                  </p>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {missingColumns.map((col, idx) => (
                      <div key={idx} className="flex items-center space-x-3 p-3 bg-danger-50/50 rounded-lg border border-danger-100">
                        <div className="w-2 h-2 rounded-full bg-danger-500 flex-shrink-0" />
                        <span className="text-sm font-bold text-danger-900 uppercase tracking-wide">{col}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-amber-900 uppercase tracking-tight">Instrucciones de Corrección:</p>
                      <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4">
                        <li>Asegúrese de que el archivo tenga la estructura exacta exportada por el sistema.</li>
                        <li>La columna <span className="font-bold">Vehículo</span> debe estar en la <span className="font-bold text-secondary-900 uppercase">Columna D</span>.</li>
                        <li>La columna <span className="font-bold">Bultos No Entregados / Devueltos</span> debe estar en la <span className="font-bold text-secondary-900 uppercase">Columna N</span>.</li>
                        <li>Los <span className="font-bold">Presupuestos</span> deben estar en la hoja <span className="font-bold text-secondary-900 uppercase">"General"</span> dentro de la tabla de costos.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-secondary-500 italic">
                  Por favor, corrija el archivo Excel y vuelva a cargarlo para continuar con el análisis.
                </p>
              </div>
            </div>
          ) : step === 'quantity_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Validación de piezas y bultos</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron "{quantityDiscrepancies.length}" discrepancias en las cantidades totales de algunas rutas.</p>
                  </div>
                </div>

                {mode === 'edit' && (
                  <label className="flex items-center space-x-2 cursor-pointer group mb-4 p-3 bg-white rounded-xl border border-amber-100 shadow-sm w-fit">
                  <input
                    type="checkbox"
                    checked={isAllDeliveredMassive}
                    disabled={mode === 'view'}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsAllDeliveredMassive(checked);
                      const newAllDelivered = new Set(allDeliveredIndices);
                      quantityDiscrepancies.forEach(({ index }) => {
                        if (checked) newAllDelivered.add(index);
                        else newAllDelivered.delete(index);
                      });
                      setAllDeliveredIndices(newAllDelivered);
                    }}
                    className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                  />
                  <span className="text-[10px] font-bold text-secondary-500 uppercase tracking-wider">Poner todo a entregado</span>
                </label>
                )}
                
                <div className="space-y-3">
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
                      <div key={index} className={`p-2 bg-white rounded-xl border shadow-sm space-y-2 transition-opacity ${isExcluded ? 'opacity-50 grayscale border-secondary-200' : 'border-amber-200 hover:border-amber-400'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-secondary-50">
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
                          
                          {mode === 'edit' && (
                            <div className="flex flex-col items-end space-y-1">
                              <label className="flex items-center space-x-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={isExcluded}
                                  disabled={mode === 'view'}
                                  onChange={() => {
                                    const newExcluded = new Set(excludedIndices);
                                    if (isExcluded) newExcluded.delete(index);
                                    else newExcluded.add(index);
                                    setExcludedIndices(newExcluded);
                                  }}
                                  className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                                />
                                <span className="text-[10px] font-bold text-secondary-500 uppercase group-hover:text-secondary-700">No incluir ruta</span>
                              </label>

                              <label className="flex items-center space-x-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={allDeliveredIndices.has(index)}
                                  disabled={mode === 'view'}
                                  onChange={() => {
                                    const newAllDelivered = new Set(allDeliveredIndices);
                                    if (allDeliveredIndices.has(index)) {
                                      newAllDelivered.delete(index);
                                      setIsAllDeliveredMassive(false);
                                    } else {
                                      newAllDelivered.add(index);
                                    }
                                    setAllDeliveredIndices(newAllDelivered);
                                  }}
                                  className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                                />
                                <span className="text-[10px] font-bold text-secondary-500 uppercase group-hover:text-secondary-700">Poner a entregado</span>
                              </label>
                            </div>
                          )}
                        </div>

                        {!isExcluded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Piezas Section */}
                            <div className={`space-y-2 p-2 rounded-lg border ${piezasSectionError ? 'bg-danger-50/30 border-danger-100' : 'bg-secondary-50/30 border-secondary-100'}`}>
                              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${piezasSectionError ? 'text-danger-600' : 'text-secondary-500'}`}>
                                Validación de Piezas
                              </h4>
                              {mode === 'edit' ? (
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-secondary-500 uppercase">Total</label>
                                    <input
                                      type="number"
                                      value={isNaN(d.piezasTotal) ? 0 : d.piezasTotal}
                                      disabled={mode === 'view'}
                                      onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                      onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], piezasTotal: parseInt(e.target.value) || 0 } }))}
                                      className={`w-full text-xs p-1 border rounded font-bold ${piezasDiff ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-secondary-500 uppercase">Entreg.</label>
                                    <input
                                      type="number"
                                      value={isNaN(d.piezasEntregadas) ? 0 : d.piezasEntregadas}
                                      disabled={mode === 'view'}
                                      onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                      onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], piezasEntregadas: parseInt(e.target.value) || 0 } }))}
                                      className={`w-full text-xs p-1 border rounded ${bultosEntregadosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-secondary-500 uppercase">No Entreg.</label>
                                    <input
                                      type="number"
                                      value={isNaN(d.piezasNoEntregadas) ? 0 : d.piezasNoEntregadas}
                                      disabled={mode === 'view'}
                                      onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                      onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], piezasNoEntregadas: parseInt(e.target.value) || 0 } }))}
                                      className={`w-full text-xs p-1 border rounded ${bultosDevueltosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-4 text-xs font-bold">
                                  <div className={piezasDiff ? 'text-danger-600' : 'text-secondary-700'}>Total: {d.piezasTotal}</div>
                                  <div className={bultosEntregadosError ? 'text-danger-600' : 'text-secondary-700'}>Entreg: {d.piezasEntregadas}</div>
                                  <div className={bultosDevueltosError ? 'text-danger-600' : 'text-secondary-700'}>No Entreg: {d.piezasNoEntregadas}</div>
                                </div>
                              )}
                              {piezasDiff && (
                                <p className="text-[10px] text-danger-600 font-medium">
                                  Error Suma: {d.piezasTotal} ≠ {d.piezasEntregadas + d.piezasNoEntregadas}
                                </p>
                              )}
                            </div>

                            {/* Bultos Section */}
                            <div className={`space-y-2 p-2 rounded-lg border ${bultosSectionError ? 'bg-danger-50/30 border-danger-100' : 'bg-secondary-50/30 border-secondary-100'}`}>
                              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${bultosSectionError ? 'text-danger-600' : 'text-secondary-500'}`}>
                                Validación de Bultos
                              </h4>
                              {mode === 'edit' ? (
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-secondary-500 uppercase">Total</label>
                                    <input
                                      type="number"
                                      value={isNaN(d.bultosTotal) ? 0 : d.bultosTotal}
                                      disabled={mode === 'view'}
                                      onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                      onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], bultosTotal: parseInt(e.target.value) || 0 } }))}
                                      className={`w-full text-xs p-1 border rounded font-bold ${bultosDiff || bultosTotalError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-secondary-500 uppercase">Entreg.</label>
                                    <input
                                      type="number"
                                      value={isNaN(d.bultosEntregados) ? 0 : d.bultosEntregados}
                                      disabled={mode === 'view'}
                                      onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                      onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], bultosEntregados: parseInt(e.target.value) || 0 } }))}
                                      className={`w-full text-xs p-1 border rounded ${bultosEntregadosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-secondary-500 uppercase">No Entreg.</label>
                                    <input
                                      type="number"
                                      value={isNaN(d.bultosDevueltos) ? 0 : d.bultosDevueltos}
                                      disabled={mode === 'view'}
                                      onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                      onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], bultosDevueltos: parseInt(e.target.value) || 0 } }))}
                                      className={`w-full text-xs p-1 border rounded ${bultosDevueltosError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-4 text-xs font-bold">
                                  <div className={(bultosDiff || bultosTotalError) ? 'text-danger-600' : 'text-secondary-700'}>Total: {d.bultosTotal}</div>
                                  <div className={(bultosDiff || bultosEntregadosError) ? 'text-danger-600' : 'text-secondary-700'}>Entreg: {d.bultosEntregados}</div>
                                  <div className={(bultosDiff || bultosDevueltosError) ? 'text-danger-600' : 'text-secondary-700'}>No Entreg: {d.bultosDevueltos}</div>
                                </div>
                              )}
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
              
              {mode === 'edit' && (
                <div className="text-center py-4">
                  <p className="text-sm font-medium text-secondary-600">
                    Corrija los valores resaltados para que la suma coincida con el total.
                  </p>
                </div>
              )}
            </div>
          ) : step === 'novedad_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Validación de novedades</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron "{novedadDiscrepancies.length}" rutas donde la suma de (Visitadas con Novedad + No Visitadas) no coincide con el Total de Piezas.</p>
                  </div>
                </div>

                {mode === 'edit' && (
                  <label className="flex items-center space-x-2 cursor-pointer group mb-4 p-3 bg-white rounded-xl border border-amber-100 shadow-sm w-fit">
                    <input
                      type="checkbox"
                      checked={isAllNoveltyMassive}
                      disabled={mode === 'view'}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsAllNoveltyMassive(checked);
                        const newAllNovelty = new Set(allNoveltyIndices);
                        novedadDiscrepancies.forEach(({ index }) => {
                          if (checked) newAllNovelty.add(index);
                          else newAllNovelty.delete(index);
                        });
                        setAllNoveltyIndices(newAllNovelty);
                      }}
                      className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                    />
                    <span className="text-[10px] font-bold text-secondary-500 uppercase tracking-wider">Marcar todas las rutas con novedad</span>
                  </label>
                )}

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {novedadDiscrepancies.map(({ data: item, index }) => {
                    const correction = corrections[index] || {};
                    const isAllNovelty = allNoveltyIndices.has(index);
                    const isExcluded = excludedIndices.has(index);

                    const piezasTotal = Number(correction.piezasTotal ?? item.piezasTotal) || 0;
                    let visitadasNovedad = Number(correction.visitadasNovedad ?? item.visitadasNovedad) || 0;
                    let noVisitadas = Number(correction.noVisitadas ?? item.noVisitadas) || 0;

                    if (isAllNovelty) {
                      visitadasNovedad = piezasTotal;
                      noVisitadas = 0;
                    }
                    
                    const sum = visitadasNovedad + noVisitadas;
                    const diff = sum - piezasTotal;
                    const hasError = diff !== 0;

                    const isCollapsed = isExcluded;

                    return (
                      <div key={index} className={`p-2 rounded-xl border transition-all duration-200 ${isExcluded ? 'opacity-50 grayscale border-secondary-200 bg-secondary-50' : hasError ? 'bg-white border-amber-200 shadow-sm hover:border-amber-400' : 'bg-success-50 border-success-200'}`}>
                        <div className={`flex flex-wrap items-center justify-between gap-4 ${!isCollapsed ? 'mb-1 pb-1 border-b border-secondary-100' : ''}`}>
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
                          </div>

                          {mode === 'edit' && (
                            <div className="flex flex-col items-end space-y-1">
                              <label className="flex items-center space-x-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={isExcluded}
                                  disabled={mode === 'view'}
                                  onChange={() => {
                                    const newExcluded = new Set(excludedIndices);
                                    if (isExcluded) newExcluded.delete(index);
                                    else newExcluded.add(index);
                                    setExcludedIndices(newExcluded);
                                  }}
                                  className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                                />
                                <span className="text-[10px] font-bold text-secondary-500 uppercase group-hover:text-secondary-700">No incluir ruta</span>
                              </label>

                              <label className="flex items-center space-x-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={isAllNovelty}
                                  disabled={mode === 'view'}
                                  onChange={() => {
                                    const newAllNovelty = new Set(allNoveltyIndices);
                                    if (isAllNovelty) {
                                      newAllNovelty.delete(index);
                                      setIsAllNoveltyMassive(false);
                                    } else {
                                      newAllNovelty.add(index);
                                    }
                                    setAllNoveltyIndices(newAllNovelty);
                                  }}
                                  className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                                />
                                <span className="text-[10px] font-bold text-secondary-500 uppercase group-hover:text-secondary-700">Marcar piezas con novedad</span>
                              </label>
                            </div>
                          )}
                        </div>

                        {!isCollapsed && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-secondary-500 uppercase">Piezas Total</label>
                              <div className="text-xs font-bold text-secondary-900">{piezasTotal}</div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-secondary-500 uppercase">Visitadas con Novedad</label>
                              {mode === 'edit' ? (
                                <input
                                  type="number"
                                  value={visitadasNovedad}
                                  disabled={mode === 'view'}
                                  onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                  onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], visitadasNovedad: Number(e.target.value) } }))}
                                  className={`w-full px-3 py-1 text-sm rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all ${hasError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200 bg-secondary-50'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                />
                              ) : (
                                <div className={`text-xs font-bold ${hasError ? 'text-danger-600' : 'text-secondary-900'}`}>{visitadasNovedad}</div>
                              )}
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-secondary-500 uppercase">No Visitadas (Sin Novedad)</label>
                              {mode === 'edit' ? (
                                <input
                                  type="number"
                                  value={noVisitadas}
                                  disabled={mode === 'view'}
                                  onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                  onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], noVisitadas: Number(e.target.value) } }))}
                                  className={`w-full px-3 py-1 text-sm rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all ${hasError ? 'border-danger-300 bg-danger-50 text-danger-700' : 'border-secondary-200 bg-secondary-50'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                />
                              ) : (
                                <div className={`text-xs font-bold ${hasError ? 'text-danger-600' : 'text-secondary-900'}`}>{noVisitadas}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : step === 'duplicated_hdr_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">HDR Duplicadas</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron {duplicatedHdrs.length} HDR asignadas a más de una ruta.</p>
                  </div>
                  <div className="flex bg-white rounded-lg p-1 border border-amber-200">
                    <button
                      onClick={() => setMode('view')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${mode === 'view' ? 'bg-amber-100 text-amber-800' : 'text-secondary-500 hover:text-secondary-700'}`}
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => setMode('edit')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${mode === 'edit' ? 'bg-amber-100 text-amber-800' : 'text-secondary-500 hover:text-secondary-700'}`}
                    >
                      Corregir
                    </button>
                  </div>
                </div>

                {mode === 'edit' && (
                  <div className="flex items-center gap-4 mb-4">
                    <label className="flex items-center space-x-2 cursor-pointer group p-2.5 bg-white rounded-xl border border-amber-100 shadow-sm w-fit">
                      <input
                        type="checkbox"
                        checked={isAllDuplicatedMassive}
                        disabled={mode === 'view'}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsAllDuplicatedMassive(checked);
                          if (checked) {
                            const newCorrections: any = { ...corrections };
                            const requireManual: string[] = [];
                            
                            duplicatedHdrs.forEach(dup => {
                              const normalizeDateStr = (dateStr: string) => {
                                if (!dateStr) return '';
                                const parts = dateStr.trim().split(/[\/-]/);
                                if (parts.length === 3) {
                                  let [d, m, y] = parts;
                                  if (y.length === 2) y = '20' + y;
                                  return `${d}-${m}-${y}`;
                                }
                                return dateStr.trim();
                              };
                              const matchingRows = dup.rows.filter(r => normalizeDateStr(String(r.data.fecha)) === normalizeDateStr(String(dup.systemData.fecha)));
                              
                              if (matchingRows.length === 1) {
                                const correctRowIndex = matchingRows[0].index;
                                dup.rows.forEach(r => {
                                  let currentHdrText = newCorrections[r.index]?.hojaRuta ?? r.data.hojaRuta;
                                  const currentHdrsSet = new Set(currentHdrText.split(/[\-\/]/).map((h: string) => h.trim()).filter(Boolean));
                                  
                                  if (r.index === correctRowIndex) {
                                    currentHdrsSet.add(dup.hdr);
                                  } else {
                                    currentHdrsSet.delete(dup.hdr);
                                  }
                                  
                                  newCorrections[r.index] = {
                                    ...newCorrections[r.index],
                                    hojaRuta: Array.from(currentHdrsSet).join(' - ')
                                  };
                                });
                              } else {
                                requireManual.push(dup.hdr);
                              }
                            });
                            
                            setCorrections(newCorrections);
                            setManualDupHdrs(requireManual);
                          } else {
                            const newCorrections: any = { ...corrections };
                            duplicatedHdrs.forEach(dup => {
                              dup.rows.forEach(r => {
                                if (newCorrections[r.index] && newCorrections[r.index].hojaRuta !== undefined) {
                                  delete newCorrections[r.index].hojaRuta;
                                }
                              });
                            });
                            setCorrections(newCorrections);
                            setManualDupHdrs([]);
                          }
                        }}
                        className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-secondary-800 group-hover:text-primary-700 transition-colors">Corregir todas las duplicadas</span>
                        <span className="text-[10px] text-secondary-500">Asigna la HDR a la ruta que coincida con la fecha del sistema</span>
                      </div>
                    </label>
                    {manualDupHdrs.length > 0 && (
                      <div className="px-3 py-2 bg-danger-50 border border-danger-200 rounded-lg flex items-center">
                        <AlertTriangle className="w-4 h-4 text-danger-600 mr-2" />
                        <span className="text-[11px] font-bold text-danger-700 uppercase tracking-widest">
                          Revisar manual las HDR: {manualDupHdrs.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {duplicatedHdrs.map((dup, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                      <div className="p-4 bg-amber-50/50 border-b border-amber-100 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-amber-900 border border-amber-300 bg-white px-2 py-1 rounded">HDR: <span className="text-danger-600 ml-1">{dup.hdr}</span> <span className="text-xs font-normal text-amber-700 ml-2">(Duplicada en {dup.rows.length} rutas)</span></p>
                        </div>
                        <div className="bg-white p-3 border border-amber-200 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                           <div className="flex flex-col">
                             <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Información en Sistema</div>
                             <div className="text-xs text-amber-600 italic mb-1">Para ayudar a identificar la ruta correcta</div>
                           </div>
                           <div className="flex gap-4">
                             <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                               <span className="text-[10px] font-bold text-amber-700 uppercase">Fecha:</span>
                               <span className="text-sm font-bold text-amber-900">{dup.systemData.fecha}</span>
                             </div>
                             <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                               <span className="text-[10px] font-bold text-amber-700 uppercase">Total Piezas:</span>
                               <span className="text-sm font-bold text-amber-900">{dup.systemData.piezasTotal}</span>
                             </div>
                             <div className="flex items-center gap-1.5 bg-success-50 px-2 py-1 rounded border border-success-100">
                               <span className="text-[10px] font-bold text-success-700 uppercase">Entregadas:</span>
                               <span className="text-sm font-bold text-success-900">{dup.systemData.entregadas}</span>
                             </div>
                             <div className="flex items-center gap-1.5 bg-danger-50 px-2 py-1 rounded border border-danger-100">
                               <span className="text-[10px] font-bold text-danger-700 uppercase">No Ent.:</span>
                               <span className="text-sm font-bold text-danger-900">{dup.systemData.noEntregadas}</span>
                             </div>
                           </div>
                        </div>
                      </div>
                      
                      <div className="p-4 space-y-3 bg-secondary-50/50">
                        <p className="text-[10px] font-bold text-secondary-500 uppercase tracking-widest mb-2 border-b border-secondary-200 pb-1">Seleccione la ruta a la que pertenece esta HDR</p>
                         {dup.rows.map(row => {
                           const currentHdrText = corrections[row.index]?.hojaRuta ?? row.data.hojaRuta;
                           const isHdrChanged = currentHdrText !== row.data.hojaRuta;

                           // It's considered "assigned" ONLY if there's an explicit correction
                           // and the current string still includes the duplicated HDR.
                           // If no correction hasn't been made yet by the user on ANY row of THIS duplicate, 
                           // none should appear "assigned" (selected).
                           const hasAnyCorrectionForThisDup = dup.rows.some(r => corrections[r.index]?.hojaRuta !== undefined);
                           const isHdrAssignedToThisRow = hasAnyCorrectionForThisDup && currentHdrText.includes(dup.hdr);
                           
                           // Calculate dynamic system totals based on current HDR text assignment
                           // If NO correction has been made, we want to show the original state of the universe 
                           // for EACH row AS IF IT OWNED the HDR (which is what `currentHdrText` represents originally)
                           const dynamicTotals = getSystemTotalsForHdrString(currentHdrText, consultaCounts, hdrDistribuidores || []);
                           
                           // Compare Planilla vs Dynamic System
                           const diffTotal = row.data.piezasTotal - dynamicTotals.total;
                           const diffEntregadas = row.data.piezasEntregadas - dynamicTotals.entregadas;
                           const diffNoEntregadas = row.data.piezasNoEntregadas - dynamicTotals.noEntregadas;

                           const allMatch = diffTotal === 0 && diffEntregadas === 0 && diffNoEntregadas === 0;

                           const handleAssignHere = () => {
                             setCorrections(prev => {
                               const next = { ...prev };
                               dup.rows.forEach(r => {
                                 const rCurrentStr = next[r.index]?.hojaRuta ?? r.data.hojaRuta;
                                 if (r.index === row.index) {
                                   next[r.index] = { ...next[r.index], hojaRuta: addHdrToString(rCurrentStr, dup.hdr) };
                                 } else {
                                   next[r.index] = { ...next[r.index], hojaRuta: removeHdrFromString(rCurrentStr, dup.hdr) };
                                 }
                               });
                               return next;
                             });
                           };

                           return (
                             <div key={row.index} className={`flex flex-col xl:flex-row gap-4 items-start justify-between bg-white p-3 border rounded shadow-sm transition-all cursor-pointer hover:border-primary-400 ${isHdrAssignedToThisRow ? 'border-primary-400 bg-primary-50/20 shadow-md ring-1 ring-primary-400' : hasAnyCorrectionForThisDup ? 'border-secondary-300 opacity-60' : 'border-amber-300'}`} onClick={mode === 'edit' ? handleAssignHere : undefined}>
                               
                               <div className="flex-1 w-full space-y-2">
                                 <div className="flex items-center gap-3">
                                   {mode === 'edit' && (
                                     <input 
                                       type="radio" 
                                       checked={hasAnyCorrectionForThisDup ? isHdrAssignedToThisRow : false} 
                                       onChange={handleAssignHere}
                                       className="w-4 h-4 text-primary-600 border-secondary-300 focus:ring-primary-500 cursor-pointer pointer-events-none" 
                                     />
                                   )}
                                   <div className="flex items-center gap-2">
                                     <p className="text-xs font-bold text-secondary-900 uppercase tracking-widest">{row.data.sucursal}</p>
                                     <span className="text-[10px] px-1.5 py-0.5 bg-secondary-100 rounded text-secondary-800 font-bold">{row.data.fecha}</span>
                                   </div>
                                 </div>
                                 <p className="text-[10px] pl-7 text-secondary-600">Distribuidor: <span className="font-bold text-secondary-900">{row.data.distribuidor}</span></p>
                                 <div className="pl-7 grid grid-cols-3 gap-2">
                                   <div className={`p-1.5 rounded border border-secondary-200 text-center ${!hasAnyCorrectionForThisDup ? 'bg-secondary-50/50' : diffTotal === 0 ? 'bg-success-50/50 border-success-200' : 'bg-red-50/50 border-red-200'}`}>
                                      <div className="flex justify-between items-center text-[9px] uppercase font-bold px-1 mb-0.5">
                                        <span className="text-secondary-500 w-1/3 text-left">Planilla</span>
                                        <span className="text-secondary-900 w-1/3 text-center">Total</span>
                                        <span className="text-secondary-500 w-1/3 text-right">Sistema</span>
                                      </div>
                                      <div className="flex justify-between items-center space-x-1">
                                        <div className="text-xs font-bold text-secondary-700 w-1/3 text-left">{row.data.piezasTotal}</div>
                                        <div className={`text-[10px] font-bold w-1/3 text-center ${!hasAnyCorrectionForThisDup ? 'text-secondary-400' : diffTotal === 0 ? 'text-success-600' : diffTotal > 0 ? 'text-danger-600' : 'text-primary-600'}`}>
                                          {!hasAnyCorrectionForThisDup ? '-' : diffTotal !== 0 ? (diffTotal > 0 ? `+${diffTotal}` : diffTotal) : <CheckCircle2 className="w-3 h-3 mx-auto" />}
                                        </div>
                                        <div className="text-xs font-bold text-secondary-900 w-1/3 text-right">{dynamicTotals.total}</div>
                                      </div>
                                   </div>

                                   <div className={`p-1.5 rounded border border-secondary-200 text-center ${!hasAnyCorrectionForThisDup ? 'bg-secondary-50/50' : diffEntregadas === 0 ? 'bg-success-50/50 border-success-200' : 'bg-red-50/50 border-red-200'}`}>
                                      <div className="flex justify-between items-center text-[9px] uppercase font-bold px-1 mb-0.5">
                                        <span className="text-success-600/70 w-1/3 text-left">Planilla</span>
                                        <span className="text-success-700 w-1/3 text-center">Ent.</span>
                                        <span className="text-success-600/70 w-1/3 text-right">Sistema</span>
                                      </div>
                                      <div className="flex justify-between items-center space-x-1">
                                        <div className="text-xs font-bold text-success-800 w-1/3 text-left">{row.data.piezasEntregadas}</div>
                                        <div className={`text-[10px] font-bold w-1/3 text-center ${!hasAnyCorrectionForThisDup ? 'text-secondary-400' : diffEntregadas === 0 ? 'text-success-600' : diffEntregadas > 0 ? 'text-danger-600' : 'text-primary-600'}`}>
                                          {!hasAnyCorrectionForThisDup ? '-' : diffEntregadas !== 0 ? (diffEntregadas > 0 ? `+${diffEntregadas}` : diffEntregadas) : <CheckCircle2 className="w-3 h-3 mx-auto" />}
                                        </div>
                                        <div className="text-xs font-bold text-success-900 w-1/3 text-right">{dynamicTotals.entregadas}</div>
                                      </div>
                                   </div>

                                   <div className={`p-1.5 rounded border border-secondary-200 text-center ${!hasAnyCorrectionForThisDup ? 'bg-secondary-50/50' : diffNoEntregadas === 0 ? 'bg-success-50/50 border-success-200' : 'bg-red-50/50 border-red-200'}`}>
                                      <div className="flex justify-between items-center text-[9px] uppercase font-bold px-1 mb-0.5">
                                        <span className="text-danger-600/70 w-1/3 text-left">Planilla</span>
                                        <span className="text-danger-700 w-1/3 text-center">No Ent.</span>
                                        <span className="text-danger-600/70 w-1/3 text-right">Sistema</span>
                                      </div>
                                      <div className="flex justify-between items-center space-x-1">
                                        <div className="text-xs font-bold text-danger-800 w-1/3 text-left">{row.data.piezasNoEntregadas}</div>
                                        <div className={`text-[10px] font-bold w-1/3 text-center ${!hasAnyCorrectionForThisDup ? 'text-secondary-400' : diffNoEntregadas === 0 ? 'text-success-600' : diffNoEntregadas > 0 ? 'text-danger-600' : 'text-primary-600'}`}>
                                          {!hasAnyCorrectionForThisDup ? '-' : diffNoEntregadas !== 0 ? (diffNoEntregadas > 0 ? `+${diffNoEntregadas}` : diffNoEntregadas) : <CheckCircle2 className="w-3 h-3 mx-auto" />}
                                        </div>
                                        <div className="text-xs font-bold text-danger-900 w-1/3 text-right">{dynamicTotals.noEntregadas}</div>
                                      </div>
                                   </div>
                                 </div>
                               </div>

                               <div className="w-full xl:w-[220px] flex flex-col xl:justify-end xl:items-end p-2 bg-secondary-50 border border-secondary-200 rounded min-h-[90px]">
                                   {mode === 'edit' ? (
                                      <>
                                        <div className="text-[9px] font-bold text-secondary-500 uppercase tracking-widest mb-1 w-full text-left xl:text-right">Ajuste manual HDR</div>
                                        <input 
                                         type="text" 
                                         value={currentHdrText}
                                         onChange={(e) => setCorrections(prev => ({ ...prev, [row.index]: { ...prev[row.index], hojaRuta: e.target.value } }))}
                                         className="w-full p-1.5 text-xs border rounded focus:ring-primary-500 font-mono text-left xl:text-right"
                                         onClick={(e) => e.stopPropagation()}
                                        />
                                      </>
                                   ) : (
                                      <>
                                        <div className="text-[9px] font-bold text-secondary-500 uppercase tracking-widest mb-1 w-full text-left xl:text-right">HDR Resultantes</div>
                                        <div className="font-mono text-sm break-all text-left xl:text-right w-full">
                                          {currentHdrText.split(/[\-\/]/).map((part, i, arr) => {
                                            const trimmed = part.trim();
                                            return (
                                              <React.Fragment key={i}>
                                                {trimmed === dup.hdr ? <span className="text-danger-600 font-bold">{trimmed}</span> : <span className="text-secondary-800 font-bold">{trimmed}</span>}
                                                {i < arr.length - 1 && <span className="text-secondary-400 mx-1">/</span>}
                                              </React.Fragment>
                                            )
                                          })}
                                        </div>
                                      </>
                                   )}
                                   {hasAnyCorrectionForThisDup && allMatch && (
                                     <div className="mt-2 w-full flex justify-end">
                                       <span className="text-[10px] font-bold bg-success-100 text-success-800 px-2 py-0.5 rounded flex items-center gap-1">
                                         <CheckCircle2 className="w-3 h-3" /> ¡Coincide Exacto!
                                       </span>
                                     </div>
                                   )}
                               </div>
                               
                             </div>
                           )
                         })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : step === 'route_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Validación de rutas</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron "{hdrDiscrepancies.branch.length + hdrDiscrepancies.route.length}" discrepancias entre las piezas de la planilla y las registradas en el archivo HDR.</p>
                  </div>
                  <div className="flex bg-white rounded-lg p-1 border border-amber-200">
                    <button
                      onClick={() => setMode('view')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${mode === 'view' ? 'bg-amber-100 text-amber-800' : 'text-secondary-500 hover:text-secondary-700'}`}
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => setMode('edit')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${mode === 'edit' ? 'bg-amber-100 text-amber-800' : 'text-secondary-500 hover:text-secondary-700'}`}
                    >
                      Corregir
                    </button>
                  </div>
                </div>

                {mode === 'edit' && (
                  <label className="flex items-center space-x-2 cursor-pointer group mb-4 p-2.5 bg-white rounded-xl border border-amber-100 shadow-sm w-fit">
                    <input
                      type="checkbox"
                      checked={isAllRouteMassive}
                      disabled={mode === 'view'}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsAllRouteMassive(checked);
                        if (checked) {
                          const newCorrections: any = { ...corrections };
                          hdrDiscrepancies.route.forEach(disc => {
                            if (disc.indices && disc.indices.length > 0) {
                              const firstIdx = disc.indices[0];
                              newCorrections[firstIdx] = {
                                ...newCorrections[firstIdx],
                                piezasTotal: disc.piezasHDR,
                                bultosTotal: disc.bultosConsulta
                              };
                              for (let i = 1; i < disc.indices.length; i++) {
                                newCorrections[disc.indices[i]] = {
                                  ...newCorrections[disc.indices[i]],
                                  piezasTotal: 0,
                                  bultosTotal: 0
                                };
                              }
                            }
                          });
                          setCorrections(newCorrections);
                        } else {
                          const newCorrections: any = { ...corrections };
                          hdrDiscrepancies.route.forEach(disc => {
                            if (disc.indices) {
                              disc.indices.forEach(idx => {
                                if (newCorrections[idx]) {
                                  delete newCorrections[idx].piezasTotal;
                                  delete newCorrections[idx].bultosTotal;
                                }
                              });
                            }
                          });
                          setCorrections(newCorrections);
                        }
                      }}
                      className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-secondary-800 group-hover:text-primary-700 transition-colors">Corregir todas las rutas</span>
                      <span className="text-[10px] text-secondary-500">Iguala todas las rutas con discrepancias al Totales HDR/Sistema</span>
                    </div>
                  </label>
                )}

                <div className="space-y-4">
                  {hdrDiscrepancies.branch.map((b, i) => (
                    <div key={i} className={`p-4 bg-white rounded-xl border shadow-sm transition-all ${b.diferencia === 0 ? 'border-success-200' : 'border-amber-200 hover:border-amber-400'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-amber-900 uppercase tracking-wider">{b.sucursal}</span>
                          {b.diferencia === 0 && (
                            <span className="px-1.5 py-0.5 bg-success-50 text-success-700 text-[10px] font-bold rounded uppercase tracking-wider border border-success-200">
                              Corregido
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className={`p-3 rounded-lg border ${b.diferencia === 0 ? 'bg-success-50/50 border-success-200' : 'bg-amber-50/50 border-amber-200'}`}>
                          <p className={`text-[10px] font-bold uppercase mb-1 ${b.diferencia === 0 ? 'text-success-600' : 'text-amber-600'}`}>total piezas planilla</p>
                          <p className={`text-lg font-bold ${b.diferencia === 0 ? 'text-success-900' : 'text-amber-900'}`}>{b.planillaTotal}</p>
                        </div>
                        <div className={`p-3 rounded-lg border ${b.diferencia === 0 ? 'bg-success-50/50 border-success-200' : 'bg-amber-50/50 border-amber-200'}`}>
                          <p className={`text-[10px] font-bold uppercase mb-1 ${b.diferencia === 0 ? 'text-success-600' : 'text-amber-600'}`}>total piezas sistema (HDR)</p>
                          <p className={`text-lg font-bold ${b.diferencia === 0 ? 'text-success-900' : 'text-amber-900'}`}>{b.hdrTotal}</p>
                        </div>
                      </div>
                      <div className="flex flex-col space-y-1.5">
                        {b.sumaPositiva > 0 && (
                          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${b.diferencia === 0 ? 'text-success-600 bg-success-50 border-success-100' : 'text-danger-600 bg-danger-50 border-danger-100'}`}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              La planilla tiene {b.sumaPositiva} piezas más que el sistema.
                            </span>
                          </div>
                        )}
                        {b.sumaNegativa < 0 && (
                          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${b.diferencia === 0 ? 'text-success-600 bg-success-50 border-success-100' : 'text-primary-600 bg-primary-50 border-primary-100'}`}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              La planilla tiene {Math.abs(b.sumaNegativa)} piezas menos que el sistema.
                            </span>
                          </div>
                        )}
                        {b.sumaPositiva === 0 && b.sumaNegativa === 0 && b.hasCorrections && (
                          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg border text-success-600 bg-success-50 border-success-100">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              Todas las discrepancias han sido corregidas.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Missing HDRs Section (Moved inside and styled to match) */}
                {estadoDiscrepancies.missingHdrs && estadoDiscrepancies.missingHdrs.length > 0 && (
                  <div className="p-4 bg-white rounded-xl border border-amber-200 shadow-sm space-y-3">
                    <div className="flex items-center text-amber-700">
                      <h4 className="text-xs font-bold uppercase tracking-widest">
                        HDR no encontradas en consulta ({estadoDiscrepancies.missingHdrs.length})
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                      {estadoDiscrepancies.missingHdrs.map((hdr, idx) => (
                        <span key={idx} className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold rounded shadow-sm">
                          {hdr}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-amber-600 italic">
                      * Estas hojas de ruta están en la planilla pero no existen en el archivo de Consulta Global.
                    </p>
                  </div>
                )}

                {/* Route Details Section (Moved inside and styled to match) */}
                <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-amber-100 bg-amber-50/30">
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Detalle de Rutas con Diferencias</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-amber-50/50">
                          <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider">Ruta / HDRs</th>
                          {mode === 'edit' && <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">Corregir Total Piezas</th>}
                          {mode === 'edit' && <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">Corregir Total Bultos</th>}
                          <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">Piezas Planilla</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">Piezas HDR</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">Bultos Planilla</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">Bultos Sistema</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-amber-600 uppercase tracking-wider text-right">Dif.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {hdrDiscrepancies.route.map((r, i) => (
                          <React.Fragment key={i}>
                            <tr className={`transition-colors ${r.diferencia === 0 ? 'bg-success-50/30' : 'hover:bg-amber-50/30'}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-bold text-secondary-900 uppercase">{r.sucursal}</p>
                                </div>
                                <p className="text-[10px] text-secondary-500 font-mono mt-0.5">{r.hojasRuta}</p>
                                <div className="mt-1">
                                  {r.indices?.map((idx: number) => (
                                    <p key={idx} className="text-[9px] text-secondary-400">Distribuidor: {mappedData[idx]?.distribuidor}</p>
                                  ))}
                                </div>
                              </td>
                              {mode === 'edit' && (
                                <td className="px-4 py-3 text-right">
                                  <div className="flex flex-col items-end gap-1">
                                    {r.indices?.map((idx: number) => (
                                      <input
                                        key={idx}
                                        type="number"
                                        value={corrections[idx]?.piezasTotal ?? mappedData[idx]?.piezasTotal}
                                        onChange={(e) => setCorrections(prev => ({ ...prev, [idx]: { ...prev[idx], piezasTotal: parseInt(e.target.value) || 0 } }))}
                                        onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                        className="w-16 text-xs p-1 border rounded border-amber-300 bg-amber-50 text-amber-900 font-bold focus:ring-amber-500 focus:border-amber-500"
                                      />
                                    ))}
                                  </div>
                                </td>
                              )}
                              {mode === 'edit' && (
                                <td className="px-4 py-3 text-right">
                                  <div className="flex flex-col items-end gap-1">
                                    {r.indices?.map((idx: number) => (
                                      <input
                                        key={idx}
                                        type="number"
                                        value={corrections[idx]?.bultosTotal ?? mappedData[idx]?.bultosTotal}
                                        onChange={(e) => setCorrections(prev => ({ ...prev, [idx]: { ...prev[idx], bultosTotal: parseInt(e.target.value) || 0 } }))}
                                        onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                        className="w-16 text-xs p-1 border rounded border-amber-300 bg-amber-50 text-amber-900 font-bold focus:ring-amber-500 focus:border-amber-500"
                                      />
                                    ))}
                                  </div>
                                </td>
                              )}
                              <td className="px-4 py-3 text-right text-xs font-bold text-secondary-700">{r.piezasPlanillaOriginal}</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-secondary-700">{r.piezasHDR}</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-secondary-700">{r.bultosPlanillaOriginal}</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-secondary-700">{r.bultosConsulta}</td>
                              <td className="px-4 py-3 text-right">
                                <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${r.diferencia === 0 ? 'text-success-600' : 'text-danger-600'}`} title="Diferencia de Piezas">
                                  {r.diferencia === 0 ? 'CORREGIDO' : r.diferencia}
                                </div>
                                <div className={`text-xs font-bold uppercase tracking-wider ${r.diferenciaBultos === 0 ? 'text-success-600' : 'text-danger-600'}`} title="Diferencia de Bultos">
                                  {r.diferenciaBultos === 0 ? 'CORREGIDO' : r.diferenciaBultos}
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 'estado_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Validación de estados</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron discrepancias en {estadoDiscrepancies.branch.length} {estadoDiscrepancies.branch.length === 1 ? 'sucursal' : 'sucursales'} y {estadoDiscrepancies.route.length} {estadoDiscrepancies.route.length === 1 ? 'ruta' : 'rutas'} entre la planilla y el sistema.</p>
                  </div>
                  <div className="flex bg-white rounded-lg p-1 border border-amber-200">
                    <button
                      onClick={() => setMode('view')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${mode === 'view' ? 'bg-amber-100 text-amber-800' : 'text-secondary-500 hover:text-secondary-700'}`}
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => setMode('edit')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${mode === 'edit' ? 'bg-amber-100 text-amber-800' : 'text-secondary-500 hover:text-secondary-700'}`}
                    >
                      Corregir
                    </button>
                  </div>
                </div>

                {mode === 'edit' && (
                  <label className="flex items-center space-x-2 cursor-pointer group mb-4 p-2.5 bg-white rounded-xl border border-amber-100 shadow-sm w-fit">
                    <input
                      type="checkbox"
                      checked={isAllEstadoMassive}
                      disabled={mode === 'view'}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsAllEstadoMassive(checked);
                        if (checked) {
                          const newCorrections: any = { ...corrections };
                          estadoDiscrepancies.route.forEach(disc => {
                            if (disc.indices && disc.indices.length > 0) {
                              const firstIdx = disc.indices[0];

                              newCorrections[firstIdx] = {
                                ...newCorrections[firstIdx],
                                piezasEntregadas: disc.consultaDelivered,
                                piezasNoEntregadas: disc.totalSystemNonDelivered,
                                bultosEntregados: disc.consultaBultosDelivered,
                                bultosDevueltos: disc.consultaBultosNonDelivered
                              };
                              
                              for (let i = 1; i < disc.indices.length; i++) {
                                newCorrections[disc.indices[i]] = {
                                    ...newCorrections[disc.indices[i]],
                                    piezasEntregadas: 0,
                                    piezasNoEntregadas: 0,
                                    bultosEntregados: 0,
                                    bultosDevueltos: 0
                                };
                              }
                            }
                          });
                          setCorrections(newCorrections);
                        } else {
                          const newCorrections: any = { ...corrections };
                          estadoDiscrepancies.route.forEach(disc => {
                            if (disc.indices) {
                              disc.indices.forEach(idx => {
                                if (newCorrections[idx]) {
                                  delete newCorrections[idx].piezasEntregadas;
                                  delete newCorrections[idx].piezasNoEntregadas;
                                  delete newCorrections[idx].bultosEntregados;
                                  delete newCorrections[idx].bultosDevueltos;
                                }
                              });
                            }
                          });
                          setCorrections(newCorrections);
                        }
                      }}
                      className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-secondary-800 group-hover:text-primary-700 transition-colors">Corregir todos los estados</span>
                      <span className="text-[10px] text-secondary-500">Iguala todas las rutas con discrepancias al Totales HDR/Sistema</span>
                    </div>
                  </label>
                )}

                <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {/* Branch Level Discrepancies */}
                  {estadoDiscrepancies.branch.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-widest border-b border-amber-200 pb-1">
                        Discrepancias por Sucursal (Piezas Entregadas)
                      </h4>
                      {estadoDiscrepancies.branch.map((disc, idx) => (
                        <div key={`branch-${idx}`} className={`p-4 bg-white rounded-xl border shadow-sm space-y-3 transition-all ${disc.planillaTotal === disc.consultaTotal ? 'border-success-200' : 'border-amber-200 hover:border-amber-400'}`}>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {disc.sucursal}
                            </span>
                            {disc.planillaTotal === disc.consultaTotal && (
                              <span className="px-2 py-0.5 bg-success-50 text-success-700 text-[10px] font-bold rounded uppercase tracking-wider border border-success-200">
                                Corregido
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-2 bg-secondary-50 rounded-lg border border-secondary-100">
                              <span className="text-[9px] text-secondary-500 uppercase block">Planilla (Entregadas)</span>
                              <span className="text-xs font-bold text-secondary-900">{disc.planillaTotal}</span>
                            </div>
                            <div className="p-2 bg-primary-50 rounded-lg border border-primary-100">
                              <span className="text-[9px] text-primary-500 uppercase block">Sistema (Entregadas)</span>
                              <span className="text-xs font-bold text-primary-900">{disc.consultaTotal}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Route Level Discrepancies */}
                  {estadoDiscrepancies.route.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-widest border-b border-amber-200 pb-1">
                        Discrepancias por Ruta (Piezas No Entregadas)
                      </h4>
                      {estadoDiscrepancies.route.map((disc, idx) => {
                        const isTotalPiezasOk = disc.planillaNonDelivered === disc.totalSystemNonDelivered && disc.planillaDelivered === disc.consultaDelivered;
                        const isTotalBultosOk = disc.planillaBultosDelivered === disc.consultaBultosDelivered && disc.planillaBultosNonDelivered === disc.consultaBultosNonDelivered;
                        const isCorrected = isTotalPiezasOk && isTotalBultosOk;
                        return (
                        <div key={`route-${idx}`} className={`p-4 bg-white rounded-xl border shadow-sm space-y-3 transition-all ${isCorrected ? 'border-success-200' : 'border-amber-200 hover:border-amber-400'}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {disc.sucursal}
                            </span>
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {disc.fecha}
                            </span>
                            <span className="px-2 py-0.5 bg-primary-50 text-primary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              HDR: {disc.hojaRuta}
                            </span>
                            <span className="text-[10px] font-bold text-secondary-600 uppercase tracking-wider">
                              Dist: {Array.from(new Set(disc.indices.map(i => mappedData[i]?.distribuidor).filter(Boolean))).join(', ')}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-secondary-50 border-secondary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-secondary-500'}`}>Planilla (Piezas Entregadas)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-secondary-900'}`}>{disc.planillaDeliveredOriginal}</span>
                            </div>
                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-primary-50 border-primary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-primary-500'}`}>Sistema (Piezas Entregadas)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-primary-900'}`}>{disc.consultaDelivered}</span>
                            </div>
                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-secondary-50 border-secondary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-secondary-500'}`}>Planilla (Piezas No Entregadas)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-secondary-900'}`}>{disc.planillaNonDeliveredOriginal}</span>
                            </div>
                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-primary-50 border-primary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-primary-500'}`}>Sistema (Piezas No Entregadas)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-primary-900'}`}>{disc.totalSystemNonDelivered}</span>
                            </div>

                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-secondary-50 border-secondary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-secondary-500'}`}>Planilla (Bultos Entregados)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-secondary-900'}`}>{disc.planillaBultosDeliveredOriginal}</span>
                            </div>
                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-primary-50 border-primary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-primary-500'}`}>Sistema (Bultos Entregados)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-primary-900'}`}>{disc.consultaBultosDelivered}</span>
                            </div>
                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-secondary-50 border-secondary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-secondary-500'}`}>Planilla (Bultos Devueltos)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-secondary-900'}`}>{disc.planillaBultosNonDeliveredOriginal}</span>
                            </div>
                            <div className={`p-2 rounded-lg border ${isCorrected ? 'bg-success-50/50 border-success-100' : 'bg-primary-50 border-primary-100'}`}>
                              <span className={`text-[9px] uppercase block ${isCorrected ? 'text-success-600' : 'text-primary-500'}`}>Sistema (Bultos Devueltos)</span>
                              <span className={`text-xs font-bold ${isCorrected ? 'text-success-900' : 'text-primary-900'}`}>{disc.consultaBultosNonDelivered}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className={`text-[10px] font-bold uppercase ${isCorrected ? 'text-success-600' : 'text-amber-600'}`}>
                              {isCorrected ? (
                                <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Corregido</span>
                              ) : (
                                  <span>Diferencia Piezas: {(disc.planillaDelivered - disc.consultaDelivered) + (disc.planillaNonDelivered - disc.totalSystemNonDelivered)} | Diferencia Bultos: {(disc.planillaBultosDelivered - disc.consultaBultosDelivered) + (disc.planillaBultosNonDelivered - disc.consultaBultosNonDelivered)}</span>
                              )}
                            </div>
                            {mode === 'edit' && disc.indices?.some(dataIdx => {
                              const cTot = corrections[dataIdx]?.piezasTotal ?? mappedData[dataIdx]?.piezasTotal ?? 0;
                              const cEnt = corrections[dataIdx]?.piezasEntregadas ?? mappedData[dataIdx]?.piezasEntregadas ?? 0;
                              const cNoEnt = corrections[dataIdx]?.piezasNoEntregadas ?? mappedData[dataIdx]?.piezasNoEntregadas ?? 0;
                              return (cEnt + cNoEnt) !== cTot;
                            }) && (
                              <div className="text-[9px] font-bold text-danger-600 bg-danger-50 px-2 py-1 rounded flex items-center gap-1 border border-danger-100">
                                <AlertTriangle className="w-3 h-3" />
                                La suma de Entregadas y No Entregadas no coincide con los Totales.
                              </div>
                            )}
                            {mode === 'edit' && disc.indices?.some(dataIdx => {
                              const cTotB = corrections[dataIdx]?.bultosTotal ?? mappedData[dataIdx]?.bultosTotal ?? 0;
                              const cEntB = corrections[dataIdx]?.bultosEntregados ?? mappedData[dataIdx]?.bultosEntregados ?? 0;
                              const cNoEntB = corrections[dataIdx]?.bultosDevueltos ?? mappedData[dataIdx]?.bultosDevueltos ?? 0;
                              return (cEntB + cNoEntB) !== cTotB;
                            }) && (
                              <div className="text-[9px] font-bold text-danger-600 bg-danger-50 px-2 py-1 rounded flex items-center gap-1 border border-danger-100">
                                <AlertTriangle className="w-3 h-3" />
                                La suma de Bultos Entregados y Devueltos no coincide con el Total de Bultos.
                              </div>
                            )}
                          </div>
                          
                          {mode === 'edit' && disc.indices?.map(dataIdx => {
                            const d = mappedData[dataIdx];
                            return (
                                <div key={dataIdx} className="bg-amber-50/50 p-2 rounded border border-amber-100 mt-2">
                                  <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center justify-start gap-1.5">
                                      <label className="text-[9px] font-bold text-amber-700 uppercase">Totales:</label>
                                      <input
                                        type="number"
                                        value={corrections[dataIdx]?.piezasTotal ?? d.piezasTotal}
                                        disabled
                                        className="w-14 text-xs p-1 border rounded border-amber-300 bg-amber-100 text-amber-700 font-bold opacity-70 cursor-not-allowed text-center"
                                      />
                                    </div>
                                    <div className="flex items-center justify-start gap-1.5">
                                      <label className="text-[9px] font-bold text-amber-700 uppercase">Entregadas:</label>
                                      <input
                                        type="number"
                                        value={corrections[dataIdx]?.piezasEntregadas ?? d.piezasEntregadas}
                                        onChange={(e) => setCorrections(prev => ({ ...prev, [dataIdx]: { ...prev[dataIdx], piezasEntregadas: parseInt(e.target.value) || 0 } }))}
                                        onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                        className="w-14 text-xs p-1 border rounded border-amber-300 bg-white text-amber-900 font-bold focus:ring-amber-500 focus:border-amber-500 text-center shadow-sm"
                                      />
                                    </div>
                                    <div className="flex items-center justify-start gap-1.5">
                                      <label className="text-[9px] font-bold text-amber-700 uppercase">No Entregadas:</label>
                                      <input
                                        type="number"
                                        value={corrections[dataIdx]?.piezasNoEntregadas ?? d.piezasNoEntregadas}
                                        onChange={(e) => setCorrections(prev => ({ ...prev, [dataIdx]: { ...prev[dataIdx], piezasNoEntregadas: parseInt(e.target.value) || 0 } }))}
                                        onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                        className="w-14 text-xs p-1 border rounded border-amber-300 bg-white text-amber-900 font-bold focus:ring-amber-500 focus:border-amber-500 text-center shadow-sm"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4 mt-2">
                                    <div className="flex items-center justify-start gap-1.5">
                                      <label className="text-[9px] font-bold text-amber-700 uppercase">Totales Bultos:</label>
                                      <input
                                        type="number"
                                        value={corrections[dataIdx]?.bultosTotal ?? d.bultosTotal}
                                        disabled
                                        className="w-14 text-xs p-1 border rounded border-amber-300 bg-amber-100 text-amber-700 font-bold opacity-70 cursor-not-allowed text-center"
                                      />
                                    </div>
                                    <div className="flex items-center justify-start gap-1.5">
                                      <label className="text-[9px] font-bold text-amber-700 uppercase">Entregados (Bultos):</label>
                                      <input
                                        type="number"
                                        value={corrections[dataIdx]?.bultosEntregados ?? d.bultosEntregados}
                                        onChange={(e) => setCorrections(prev => ({ ...prev, [dataIdx]: { ...prev[dataIdx], bultosEntregados: parseInt(e.target.value) || 0 } }))}
                                        onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                        className="w-14 text-xs p-1 border rounded border-amber-300 bg-white text-amber-900 font-bold focus:ring-amber-500 focus:border-amber-500 text-center shadow-sm"
                                      />
                                    </div>
                                    <div className="flex items-center justify-start gap-1.5">
                                      <label className="text-[9px] font-bold text-amber-700 uppercase">Devueltos (Bultos):</label>
                                      <input
                                        type="number"
                                        value={corrections[dataIdx]?.bultosDevueltos ?? d.bultosDevueltos}
                                        onChange={(e) => setCorrections(prev => ({ ...prev, [dataIdx]: { ...prev[dataIdx], bultosDevueltos: parseInt(e.target.value) || 0 } }))}
                                        onFocus={(e) => e.target.value === '0' && (e.target.value = '')}
                                        className="w-14 text-xs p-1 border rounded border-amber-300 bg-white text-amber-900 font-bold focus:ring-amber-500 focus:border-amber-500 text-center shadow-sm"
                                      />
                                    </div>
                                  </div>
                                </div>
                            );
                          })}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : step === 'vehicle_mapping' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Validación de vehiculos</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron "{totalUnknownVehiclesRoutes}" rutas con vehículos que no coinciden con las categorías del sistema.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {unknownVehiclesWithDetails.map(({ vehiculo, observations }) => (
                    <div key={vehiculo} className="p-3 bg-white rounded-lg border border-amber-200 shadow-sm space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <label className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                          Vehículo: <span className="text-amber-600">"{vehiculo || "Sin especificar"}"</span>
                        </label>
                        <select
                          value={vehicleMapping[vehiculo] || "Local Comercial"}
                          disabled={mode === 'view'}
                          onChange={(e) => setVehicleMapping(prev => ({ ...prev, [vehiculo]: e.target.value }))}
                          className="text-sm border-amber-300 rounded-lg bg-white focus:ring-amber-500 focus:border-amber-500 min-w-[200px] disabled:bg-secondary-100 disabled:text-secondary-500"
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
                              <span>{obs.sucursal} - {obs.fecha} - Ruta: <span className="font-bold">{obs.hojaRuta}</span> - Distribuidor: <span className="font-bold">{obs.distribuidor}</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {mode === 'edit' && (
                <div className="text-center py-4">
                  <p className="text-sm font-medium text-secondary-600">
                    Una vez confirmados los vehículos, el sistema procederá a validar las zonas.
                  </p>
                </div>
              )}
            </div>
          ) : step === 'zone_mapping' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Validación de zonas</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron "{totalUnknownZonesRoutes}" rutas con zonas que no coinciden con "Capital" o "Interior".</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {unknownZonesWithDetails.map(({ zona, observations }) => (
                    <div key={zona} className="p-3 bg-white rounded-lg border border-amber-200 shadow-sm space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <label className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                          Zona: <span className="text-amber-600">"{zona === "SIN_ZONA" ? "Sin Zona (Celda vacía)" : zona}"</span>
                        </label>
                        <select
                          value={zoneMapping[zona] || "CAPITAL"}
                          disabled={mode === 'view'}
                          onChange={(e) => setZoneMapping(prev => ({ ...prev, [zona]: e.target.value }))}
                          className="text-sm border-amber-300 rounded-lg bg-white focus:ring-amber-500 focus:border-amber-500 min-w-[200px] disabled:bg-secondary-100 disabled:text-secondary-500"
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
                              <span>{obs.sucursal} - {obs.fecha} - Ruta: <span className="font-bold">{obs.hojaRuta}</span> - Distribuidor: <span className="font-bold">{obs.distribuidor}</span></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {mode === 'edit' && (
                <div className="text-center py-4">
                  <p className="text-sm font-medium text-secondary-600">
                    Una vez confirmadas las zonas, el sistema procederá a validar duplicados y conflictos.
                  </p>
                </div>
              )}
            </div>
          ) : step === 'date_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Validación de fecha</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron "{initialDateDiscrepancyIndices.length}" rutas con fechas que no corresponden al mes predominante ({predominantMonth}) ni al mes en curso.</p>
                  </div>
                </div>
                
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {initialDateDiscrepancyIndices.map((index) => {
                    const d = mappedData[index];
                    const isExcluded = excludedIndices.has(index);
                    
                    const parts = d.fecha.split("-");
                    const monthYear = parts.length === 3 ? `${parts[1]}-${parts[2]}` : "";
                    const currentMonth = new Date().getUTCMonth() + 1;
                    const currentYear = String(new Date().getUTCFullYear()).slice(-2);
                    const currentMonthYear = `${String(currentMonth).padStart(2, "0")}-${currentYear}`;
                    const hasError = monthYear !== predominantMonth && monthYear !== currentMonthYear;
                    
                    return (
                      <div key={index} className={`p-4 bg-white rounded-xl border shadow-sm space-y-4 transition-opacity ${isExcluded ? 'opacity-50 grayscale border-secondary-200' : 'border-amber-100'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-secondary-50">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 bg-secondary-100 text-secondary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              {d.sucursal}
                            </span>
                            <span className="px-2 py-0.5 bg-primary-50 text-primary-700 text-[10px] font-bold rounded uppercase tracking-wider">
                              HDR: {d.hojaRuta}
                            </span>
                          </div>
                          
                          <label className="flex items-center space-x-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={isExcluded}
                              disabled={mode === 'view'}
                              onChange={() => {
                                const newExcluded = new Set(excludedIndices);
                                if (isExcluded) newExcluded.delete(index);
                                else newExcluded.add(index);
                                setExcludedIndices(newExcluded);
                              }}
                              className="w-4 h-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                            />
                            <span className="text-[10px] font-bold text-secondary-500 uppercase group-hover:text-secondary-700">No incluir ruta</span>
                          </label>
                        </div>

                        {!isExcluded && (
                          <div className="flex items-center space-x-4">
                            <div className="flex-1 space-y-1.5">
                              <label className="text-[10px] font-bold text-secondary-500 uppercase">Fecha de la Ruta</label>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={d.fecha}
                                  disabled={mode === 'view'}
                                  onChange={(e) => setCorrections(prev => ({ ...prev, [index]: { ...prev[index], fecha: e.target.value } }))}
                                  placeholder="DD-MM-AA"
                                  className={`flex-1 px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary-500 transition-all font-mono ${hasError ? 'border-amber-300 bg-amber-50' : 'border-success-200 bg-success-50'} disabled:bg-secondary-100 disabled:text-secondary-500`}
                                />
                                <div className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${hasError ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-success-600 bg-success-50 border-success-100'}`}>
                                  Mes: {d.fecha.split("-")[1] || "?"}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {mode === 'edit' && (
                <div className="text-center py-4">
                  <p className="text-sm font-medium text-secondary-600">
                    Puede corregir la fecha manualmente o marcar la ruta para no ser incluida.
                  </p>
                </div>
              )}
            </div>
          ) : step === 'branch_selection' ? (
            <div className="space-y-6">
              <div className="p-4 bg-primary-50 rounded-xl border border-primary-200">
                <div className="flex items-center mb-4 text-primary-700">
                  <h3 className="font-bold uppercase tracking-wider">
                    {isPending ? "Sucursal no detectada" : detectedBranchesInfo.length > 1 ? "Sucursales detectadas" : "Sucursal detectada"}
                  </h3>
                </div>
                <p className="text-sm text-primary-800 mb-6">
                  {isPending 
                    ? "El sistema no pudo detectar automáticamente la sucursal en el archivo. Por favor, seleccione la sucursal correspondiente:" 
                    : detectedBranchesInfo.length > 1 
                      ? "El sistema ha detectado múltiples sucursales en el archivo. A continuación se muestra la vinculación de cada sucursal con su hoja correspondiente:"
                      : "El sistema ha detectado la sucursal automáticamente:"}
                </p>
                
                {isPending ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {KNOWN_BRANCHES.map((branch) => (
                      <button
                        key={branch}
                        disabled={mode === 'view'}
                        onClick={() => setSelectedSucursal(branch)}
                        className={`p-4 rounded-xl border-2 transition-all duration-200 text-center group ${
                          selectedSucursal === branch
                            ? "border-primary-600 bg-primary-100 shadow-md"
                            : "border-secondary-200 bg-white hover:border-primary-400 hover:bg-primary-100"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <span className={`text-sm font-bold ${
                          selectedSucursal === branch ? "text-primary-700" : "text-secondary-600 group-hover:text-primary-600"
                        }`}>
                          {branch}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {detectedBranchesInfo.map((info) => (
                      <div key={info.branch} className="p-4 rounded-xl border-2 border-primary-600 bg-primary-100 shadow-md flex flex-col">
                        <span className="text-sm font-bold text-primary-700 mb-1">
                          Sucursal: {info.branch}
                        </span>
                        <span className="text-xs text-primary-600">
                          Hoja: {info.sheet}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : step === 'budget_validation' ? (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center mb-4 text-amber-700">
                  <div className="flex flex-col text-amber-700">
                    <h3 className="font-bold uppercase tracking-wider">Presupuestos detectados</h3>
                    <p className="text-xs text-amber-600 mt-1">Se detectaron "{differentBudgetsCount}" presupuestos en el archivo cargado.</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {Object.entries(pendingPresupuestos || {})
                    .filter(([suc, amount]) => {
                      const branchName = suc === "PENDING_SUCURSAL" ? selectedSucursal : suc;
                      const normalizedBranch = normalizeString(branchName);
                      const isKnown = KNOWN_BRANCHES.some(kb => normalizeString(kb) === normalizedBranch);
                      if (!isKnown) return false;
                      
                      const existingAmount = existingPresupuestos?.[branchName] || 0;
                      return existingAmount !== amount;
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
                                  disabled={mode === 'view'}
                                  onChange={() => setBudgetResolutions(prev => ({ ...prev, [suc]: 'replace' }))}
                                  className="w-3.5 h-3.5 text-secondary-600 focus:ring-secondary-500 disabled:opacity-50"
                                />
                                <span className="text-[10px] font-bold text-secondary-500 group-hover:text-secondary-700 uppercase tracking-wider">
                                  {existingAmount === 0 || existingAmount === undefined ? "Agregar" : "Reemplazar"}
                                </span>
                              </label>
                              <label className="flex items-center space-x-1.5 cursor-pointer group">
                                <input
                                  type="radio"
                                  checked={budgetResolutions[suc] === 'keep'}
                                  disabled={mode === 'view'}
                                  onChange={() => setBudgetResolutions(prev => ({ ...prev, [suc]: 'keep' }))}
                                  className="w-3.5 h-3.5 text-secondary-600 focus:ring-secondary-500 disabled:opacity-50"
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
                <div className="flex items-center mb-4 text-danger-700">
                  <div className="flex flex-col text-danger-700">
                    <h3 className="font-bold uppercase tracking-wider">Conflictos de datos detectados</h3>
                    <p className="text-xs text-danger-600 mt-1">Se detectaron "{conflicts.length}" conflictos en rutas que ya existen pero con datos diferentes.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {conflicts.map((c) => {
                    const diffs = getDifferences(c.existing, c.incoming);
                    const isPartialOverlap = getRouteId(c.existing) !== getRouteId(c.incoming);
                    
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
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded uppercase tracking-wider">
                            Cliente: {c.incoming.cliente || "N/A"}
                          </span>
                        </div>

                        {isPartialOverlap && (
                          <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                            <p className="text-[10px] font-bold text-amber-800 uppercase mb-2 flex items-center gap-1.5">
                              <AlertTriangle className="w-3 h-3" />
                              Coincidencia Parcial Detectada
                            </p>
                            <p className="text-xs text-amber-700 leading-relaxed">
                              Esta ruta comparte números de hoja de ruta con una ruta existente:
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="p-2 bg-white/50 rounded border border-amber-200">
                                <span className="text-[9px] font-bold text-amber-600 uppercase block">Sucursal:</span>
                                <span className="text-xs text-amber-900 font-medium">{c.existing.sucursal}</span>
                              </div>
                              <div className="p-2 bg-white/50 rounded border border-amber-200">
                                <span className="text-[9px] font-bold text-amber-600 uppercase block">Fecha:</span>
                                <span className="text-xs text-amber-900 font-medium">{c.existing.fecha}</span>
                              </div>
                              <div className="p-2 bg-white/50 rounded border border-amber-200 col-span-2">
                                <span className="text-[9px] font-bold text-amber-600 uppercase block">Hojas de Ruta Existentes:</span>
                                <span className="text-xs text-amber-900 font-medium">{c.existing.hojaRuta}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-6">
                          {diffs.map((diff, idx) => {
                            const currentRes = conflictResolution[c.id]?.[diff.key] || 'replace';
                            
                            return (
                              <div key={idx} className="space-y-3 p-3 bg-secondary-50/50 rounded-xl border border-secondary-100">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-secondary-700 uppercase tracking-tight">
                                    Diferencia en: <span className="text-primary-600">{diff.field}</span>
                                  </p>
                                  
                                  <div className="flex items-center space-x-4">
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                      <input
                                        type="radio"
                                        checked={currentRes === 'replace'}
                                        disabled={mode === 'view'}
                                        onChange={() => setConflictResolution(prev => ({
                                          ...prev,
                                          [c.id]: { ...(prev[c.id] || {}), [diff.key]: 'replace' }
                                        }))}
                                        className="w-3.5 h-3.5 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                                      />
                                      <span className={`text-[10px] font-bold uppercase tracking-wide transition-colors ${currentRes === 'replace' ? 'text-primary-700' : 'text-secondary-400 group-hover:text-secondary-600'}`}>
                                        Usar Nuevo
                                      </span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                      <input
                                        type="radio"
                                        checked={currentRes === 'keep'}
                                        disabled={mode === 'view'}
                                        onChange={() => setConflictResolution(prev => ({
                                          ...prev,
                                          [c.id]: { ...(prev[c.id] || {}), [diff.key]: 'keep' }
                                        }))}
                                        className="w-3.5 h-3.5 text-secondary-600 focus:ring-secondary-500 disabled:opacity-50"
                                      />
                                      <span className={`text-[10px] font-bold uppercase tracking-wide transition-colors ${currentRes === 'keep' ? 'text-secondary-700' : 'text-secondary-400 group-hover:text-secondary-600'}`}>
                                        Mantener Actual
                                      </span>
                                    </label>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className={`p-2.5 rounded-lg border transition-all duration-200 ${currentRes === 'keep' ? 'bg-white border-secondary-300 shadow-sm ring-1 ring-secondary-200' : 'bg-secondary-100/50 border-secondary-200 opacity-60'}`}>
                                    <span className="text-[9px] font-bold text-secondary-500 uppercase block mb-1">Dato Actual:</span>
                                    <span className="text-xs text-secondary-900 font-medium">
                                      {typeof diff.existing === 'number' && diff.field === 'Costo' 
                                        ? `$${diff.existing.toLocaleString()}` 
                                        : String(diff.existing)}
                                    </span>
                                  </div>
                                  <div className={`p-2.5 rounded-lg border transition-all duration-200 ${currentRes === 'replace' ? 'bg-white border-primary-300 shadow-sm ring-1 ring-primary-200' : 'bg-secondary-100/50 border-secondary-200 opacity-60'}`}>
                                    <span className="text-[9px] font-bold text-primary-500 uppercase block mb-1">Dato Nuevo:</span>
                                    <span className="text-xs text-primary-900 font-bold">
                                      {typeof diff.incoming === 'number' && diff.field === 'Costo' 
                                        ? `$${diff.incoming.toLocaleString()}` 
                                        : String(diff.incoming)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-end space-x-4 mt-6 pt-4 border-t border-secondary-100">
                          <button
                            onClick={() => {
                              const allKeep: Record<string, 'replace' | 'keep'> = {};
                              diffs.forEach(d => allKeep[d.key] = 'keep');
                              setConflictResolution(prev => ({ ...prev, [c.id]: allKeep }));
                            }}
                            disabled={mode === 'view'}
                            className="text-[10px] font-bold text-secondary-500 hover:text-secondary-700 uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Mantener Todo el Actual
                          </button>
                          <button
                            onClick={() => {
                              const allReplace: Record<string, 'replace' | 'keep'> = {};
                              diffs.forEach(d => allReplace[d.key] = 'replace');
                              setConflictResolution(prev => ({ ...prev, [c.id]: allReplace }));
                            }}
                            disabled={mode === 'view'}
                            className="text-[10px] font-bold text-primary-600 hover:text-primary-700 uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Reemplazar Todo con Nuevo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { 
                    label: `Sucursales detectadas (${sucursalesEnArchivo.length})`, 
                    value: sucursalesEnArchivo.length > 0 ? sucursalesEnArchivo.join(", ") : "Ninguna" 
                  },
                  { label: "Rutas encontradas", value: mappedData.length },
                  { 
                    label: "Rutas agregadas", 
                    value: newRoutes.length,
                    colorClass: newRoutes.length > 0 ? "text-primary-600" : "text-secondary-500"
                  },
                  { 
                    label: "Rutas duplicadas detectadas", 
                    value: duplicates.length,
                    colorClass: duplicates.length > 0 ? "text-amber-600" : "text-secondary-500"
                  },
                  { label: "Rutas modificadas", value: modifiedRoutesCount },
                  { label: "Piezas cargadas", value: totalPiezas },
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
                  { label: "Cantidad de novedades corregidas", value: totalNovedadesCorregidas },
                  { label: "Distribuidores cargados", value: new Set(mappedData.filter((_, idx) => !excludedIndices.has(idx)).map(d => d.distribuidor)).size },
                  { 
                    label: "Presupuestos", 
                    value: budgetStatus.text,
                    colorClass: budgetStatus.color
                  },
                  { 
                    label: "Piezas con estado entregado", 
                    value: piezasEntregadasCount,
                    colorClass: piezasEntregadasCount > 0 ? "text-success-600" : "text-secondary-500"
                  },
                  { 
                    label: "Historial", 
                    value: historialData.length > 0 ? "Detectado" : "No detectado",
                    colorClass: historialData.length > 0 ? "text-success-600" : "text-danger-600"
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
                  <div className="flex items-center mb-2 text-primary-700">
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
                  <div className="flex items-center mb-2 text-primary-700">
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

              <div className="pt-4 text-center space-y-4">
                <p className="text-sm font-medium text-secondary-800">
                  ¿Desea continuar con el análisis?
                </p>
                
                <div className="flex flex-col items-center justify-center mt-2 space-y-3">
                  <button
                    onClick={handleExportCorrectedData}
                    disabled={isExportingCorrected}
                    className="inline-flex items-center px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isExportingCorrected ? 'Exportando Planilla...' : 'Exportar Planilla con Correcciones'}
                  </button>

                  <button
                    onClick={handleExportPiezasPlanilla}
                    disabled={isExportingPiezasPlanilla}
                    className="inline-flex items-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isExportingPiezasPlanilla ? 'Exportando Piezas...' : 'Exportar Piezas de Planilla'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {step !== 'summary' && (
          <div className="px-5 py-4 bg-secondary-50 border-t border-secondary-100 flex items-center justify-center space-x-4">
            {stepHistory.length > 0 && (
              <button
                onClick={handleBack}
                className="inline-flex justify-center items-center px-6 py-2.5 text-sm font-bold text-white bg-blue-500 hover:bg-blue-700 active:scale-95 rounded-xl transition-all duration-200 cursor-pointer shadow-md"
              >
                Volver Atrás
              </button>
            )}

            <button
              onClick={onCancel}
              className="inline-flex justify-center items-center px-8 py-2.5 text-sm font-bold text-white bg-red-400 hover:bg-red-800 active:scale-95 rounded-xl transition-all duration-200 cursor-pointer shadow-md min-w-[140px]"
            >
              Cancelar
            </button>

            <button
              onClick={handleConfirm}
              className={`inline-flex justify-center items-center px-8 py-2.5 text-sm font-bold text-white rounded-xl transition-all duration-200 shadow-md transform active:scale-95 cursor-pointer min-w-[140px] ${
                (step === 'missing_columns' || (step === 'branch_selection' && isPending && selectedSucursal === ""))
                  ? 'bg-secondary-400 cursor-not-allowed opacity-50' 
                  : 'bg-blue-500 hover:bg-blue-700'
              }`}
              disabled={step === 'missing_columns' || (step === 'branch_selection' && isPending && selectedSucursal === "")}
            >
              {step === 'validation' ? 'Confirmar y Finalizar' : 'Continuar'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
