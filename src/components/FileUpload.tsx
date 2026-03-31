import React, { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { UploadCloud, AlertCircle, Loader2 } from "lucide-react";
import { LogisticsData } from "../types";
import { normalizeZone, normalizeString, normalizeHojaRuta, normalizeDate, KNOWN_SUCURSALES, normalizeSucursalName } from "../utils";

interface FileUploadProps {
  onDataLoaded: (
    data: any[],
    fileName: string,
    type: "SUCURSAL" | "CONSULTA_GLOBAL" | "HDR_DISTRIBUIDOR" | "HISTORIAL",
    totals?: { piezas: number; bultos: number },
    presupuestosMap?: Record<string, number>,
    missingColumns?: string[]
  ) => void;
  type: "SUCURSAL" | "CONSULTA_GLOBAL" | "HDR_DISTRIBUIDOR" | "HISTORIAL";
  title: string;
  description: string;
  disabled?: boolean;
}


function isConsolidatedFile(workbook: XLSX.WorkBook): boolean {
  return workbook.SheetNames.includes("General") &&
         workbook.SheetNames.some(s => KNOWN_SUCURSALES.includes(normalizeSucursalName(s)));
}

function normalizeHeader(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseConsolidatedFile(workbook: XLSX.WorkBook): {
  records: LogisticsData[];
  presupuestos: Record<string, number>;
  missingColumns: string[];
} {
  const records: LogisticsData[] = [];
  const presupuestos: Record<string, number> = {};
  const missingColumnsSet = new Set<string>();

  // ── 1. Leer presupuestos desde hoja General ──────────────────────────────
  const generalWs = workbook.Sheets["General"];
  if (generalWs) {
    const ref = generalWs['!ref'] || "A1";
    const range = XLSX.utils.decode_range(ref);
    range.s.c = 0; // Force start from column A
    range.s.r = 0; // Force start from row 1
    
    const allRows = XLSX.utils.sheet_to_json<any[]>(generalWs, {
      header: 1,
      range: range,
      defval: null,
    });
    
    let costTableStart = -1;
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      
      // Check first few columns for the title (usually in Col B if Col A is empty)
      const rowText = row.slice(0, 5).map(c => String(c || "").toUpperCase()).join(" ");
      if (rowText.includes("DATOS DE COSTOS POR SUCURSAL")) {
        costTableStart = i + 2; // Table starts 2 rows after title
        break;
      }
    }

    if (costTableStart !== -1) {
      const headerRow = allRows[costTableStart - 1];
      const headerMap: Record<string, number> = {};
      if (Array.isArray(headerRow)) {
        headerRow.forEach((val, idx) => {
          if (val) headerMap[normalizeHeader(val)] = idx;
        });
      }

      const getColIdx = (keys: string[], fallback: number) => {
        for (const key of keys) {
          const idx = headerMap[normalizeHeader(key)];
          if (idx !== undefined) return idx;
        }
        return fallback;
      };

      const sucursalIdx = getColIdx(["sucursal"], 1);
      const presupuestoIdx = getColIdx(["presupuesto", "budget"], 2);
      // El mapeo ahora usa "% Gastado" en lugar de "Margen"
      const gastadoIdx = getColIdx(["% gastado", "gastado", "margen"], 3);

      for (let i = costTableStart; i < allRows.length; i++) {
        const row = allRows[i];
        if (!Array.isArray(row)) continue;
        
        const sucursalCell = row[sucursalIdx]; 
        if (!sucursalCell) continue;
        if (String(sucursalCell).toUpperCase() === 'TOTAL') break;

        const normalized = normalizeSucursalName(String(sucursalCell));
        if (KNOWN_SUCURSALES.includes(normalized)) {
          presupuestos[normalized] = parseCurrency(row[presupuestoIdx]);
        }
      }
    } else {
      missingColumnsSet.add("Presupuestos (Hoja General)");
    }
  } else {
    missingColumnsSet.add("Hoja General");
  }

  // ── 2. Leer datos de cada hoja de sucursal ───────────────────────────────
  for (const sheetName of workbook.SheetNames) {
    if (sheetName === "General") continue;
    const normalizedSheet = normalizeSucursalName(sheetName);
    if (!KNOWN_SUCURSALES.includes(normalizedSheet)) continue;

    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const ref = ws['!ref'] || "A1";
    const range = XLSX.utils.decode_range(ref);
    range.s.c = 0; // Force start from column A
    range.s.r = 0; // Force start from row 1

    const jsonData = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      range: range,
      defval: "",
    });

    let headerRowIdx = -1;
    const colMap: Record<string, number> = {};
    
    // Buscar fila de encabezado (suele estar en la fila 2, índice 1)
    for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
      const row = jsonData[i];
      if (!Array.isArray(row)) continue;
      
      const normalizedRow = row.map(c => normalizeHeader(c));
      if (
        normalizedRow.some(v => v.includes("hojaruta") || v.includes("hojasderuta")) || 
        (normalizedRow.includes("fecha") && normalizedRow.some(v => v.includes("movil") || v.includes("distribuidor"))) ||
        normalizedRow.includes("piezastotal") || 
        normalizedRow.includes("totalpiezas")
      ) {
        headerRowIdx = i;
        normalizedRow.forEach((val, idx) => {
          if (val) colMap[val] = idx;
        });
        break;
      }
    }

    const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 1;

    // Check for specific columns in consolidated file
    // Vehiculo should be in Col D (index 3)
    // Bultos No Entregados should be in Col N (index 13)
    const hasVehiculoHeader = colMap[normalizeHeader("vehiculo")] !== undefined || 
                             colMap[normalizeHeader("tipo de vehiculo marca")] !== undefined ||
                             colMap[normalizeHeader("tipo vehiculo")] !== undefined;
                             
    const hasBultosNoEntregadosHeader = colMap[normalizeHeader("bultos no entregados")] !== undefined || 
                                       colMap[normalizeHeader("bultos devueltos")] !== undefined ||
                                       colMap[normalizeHeader("bultos no entregados / devueltos")] !== undefined;

    if (!hasVehiculoHeader && (!jsonData[startRow] || jsonData[startRow][3] === undefined || jsonData[startRow][3] === "")) {
      missingColumnsSet.add("Vehículo (Columna D)");
    }
    if (!hasBultosNoEntregadosHeader && (!jsonData[startRow] || jsonData[startRow][13] === undefined || jsonData[startRow][13] === "")) {
      missingColumnsSet.add("Bultos No Entregados / Devueltos (Columna N)");
    }

    for (let i = startRow; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0 || row.every((cell) => cell === "")) continue;

      const getVal = (keys: string[], fallbackIdx?: number) => {
        for (const key of keys) {
          const normalizedKey = normalizeHeader(key);
          const idx = colMap[normalizedKey];
          if (idx !== undefined) return row[idx];
        }
        // Try partial match if exact match fails
        for (const key of keys) {
          const normalizedKey = normalizeHeader(key);
          const foundKey = Object.keys(colMap).find(k => k.includes(normalizedKey) || normalizedKey.includes(k));
          if (foundKey) return row[colMap[foundKey]];
        }
        // If no header match, use fallback index if provided
        if (fallbackIdx !== undefined && row[fallbackIdx] !== undefined && row[fallbackIdx] !== "") {
          return row[fallbackIdx];
        }
        return undefined;
      };

      const fechaVal = getVal(["fecha", "fechagestion"], 1);
      if (fechaVal === 'TOTAL' || fechaVal == null || fechaVal === "") continue;

      const piezasTotal = Number(getVal(["piezasTotal", "totalpiezas", "piezas Total", "cantidad de id piezas a gestionar", "piezas a gestionar"], 5) ?? 0);
      const bultosTotal = Number(getVal(["bultosTotal", "totalbultos", "bultos Total", "cantidad de bultos a gestionar", "bultos a gestionar"], 6) ?? 0);
      const palets = Number(getVal(["palets", "pallets"], 19) ?? 0);
      const pesoRaw = getVal(["peso", "kg transportado", "kg"], 20);
      const peso = typeof pesoRaw === 'number' 
        ? Number(pesoRaw.toFixed(2)) 
        : Number(parseFloat(String(pesoRaw || 0).replace(',', '.')).toFixed(2)) || 0;
      
      const distribuidor = String(getVal(["distribuidor", "nombre completo del movil", "movil"], 2) ?? '');
      if (!distribuidor) continue;

      records.push({
        sucursal:           normalizedSheet,
        distribuidor:       distribuidor,
        vehiculo:           String(getVal(['vehiculo', 'tipo de vehiculo marca', 'tipo vehiculo'], 3) ?? ''),
        hojaRuta:           String(getVal(['hojaRuta', 'hoja de ruta', 'hojas de ruta numero'], 4) ?? ''),
        ruta:               String(getVal(['ruta', 'rutas'], 9) ?? ''),
        fecha:              normalizeDate(fechaVal),
        piezasTotal:        piezasTotal,
        bultosTotal:        bultosTotal,
        zona:               String(getVal(['zona', 'zonas cap-int', 'zonas'], 7) ?? ''),
        piezasEntregadas:   Number(getVal(['piezasEntregadas', 'piezas Entregadas', 'cantidad de piezas entregas', 'entregadas'], 8) ?? 0),
        piezasNoEntregadas: Number(getVal(['piezasNoEntregadas', 'piezas No Entregadas', 'cantidad de no entregas', 'no entregas'], 9) ?? 0),
        visitadasNovedad:   Number(getVal(['visitadasNovedad', 'visitadas Novedad', 'visitadas con novedad'], 10) ?? 0),
        noVisitadas:        Number(getVal(['noVisitadas'], 11) ?? 0),
        bultosEntregados:   Number(getVal(['bultosEntregados', 'bultos entregado'], 12) ?? 0),
        bultosNoEntregados: Number(getVal(['bultosNoEntregados', 'bultos devueltos', 'bultos no entregados'], 13) ?? 0),
        costoTotal:         parseCurrency(getVal(['costoTotal', 'costo total jornal o pieza', 'costo'], 14)),
        observaciones:      String(getVal(['observaciones', 'obs', 'comentarios'], 15) ?? ''),
        cliente:            "N/A",
        piezasSinNovedad:   Number(getVal(['piezasEntregadas', 'piezas Entregadas'], 8) ?? 0),
        bultosDevueltos:    Number(getVal(['bultosDevueltos', 'bultos devueltos', 'bultos no entregados'], 13) ?? 0),
        palets:             palets,
        peso:               peso,
        retiros:            0
      });
    }
  }

  return { records, presupuestos, missingColumns: Array.from(missingColumnsSet) };
}

const parseCurrency = (val: any): number => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  return parseInt(String(val).replace(/[^0-9-]/g, "")) || 0;
};

const parseVehiculo = (vehiculoRaw: string, colQ: string): string => {
  const v = vehiculoRaw.toLowerCase().trim();
  
  if (v.includes("cartero") || v.includes("mensajero")) return "Cartero";
  if (v.includes("moto")) return "Moto";
  if (v.includes("auto")) return "Auto";
  
  if (
    v.includes("camioneta grande") || 
    v.includes("sprinter") || 
    v.includes("tipo grande") || 
    v.includes("peugeot boxer") || 
    v.includes("citroen jumper") || 
    v.includes("utilitario grande")
  ) {
    return "Utilitario Grande";
  }

  if (
    v.includes("utilitario mediano") ||
    v.includes("furgon mediano") ||
    v.includes("furgón mediano")
  ) {
    return "Utilitario Mediano";
  }

  if (
    v.includes("camioneta") || 
    v.includes("tipo pequeño") || 
    v.includes("utilitario pequeño") || 
    v.includes("utilitario chico") || 
    v.includes("kangoo") || 
    v.includes("partner") || 
    v.includes("fiorino") ||
    v.includes("utilitario")
  ) {
    return "Utilitario Chico";
  }

  if (v.includes("dayli") || v.includes("daily") || v.includes("camion") || v.includes("camiòn") || v.includes("camión")) return "Camión";
  
  if (v.includes("local comercial") || v.includes("local")) return "Local Comercial";
  
  if (!v) {
    const q = colQ.toLowerCase();
    if (q.includes("por pieza")) return "Moto";
    return "Local Comercial";
  }
  
  return vehiculoRaw;
};

const parseZona = (zonaRaw: string, colQ: string): string => {
  const normalized = normalizeZone(zonaRaw);
  if (normalized === "CAPITAL") return "Capital";
  if (normalized === "INTERIOR") return "Interior";

  if (zonaRaw) return zonaRaw;
  
  return "SIN_ZONA";
};

export default function FileUpload({ onDataLoaded, type, title, description, disabled }: FileUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const processFiles = async (files: FileList) => {
    setError(null);
    setIsProcessing(true);
    setProgress(0);

    const fileArray = Array.from(files);
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const fileProgressOffset = (i / fileArray.length) * 100;
      const fileProgressScale = 1 / fileArray.length;

      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: "array" });

            if (type === "SUCURSAL") {
              let parsedData: any[] = [];
              let totalPiezasExcel = 0;
              let totalBultosExcel = 0;
              let presupuestosMap: Record<string, number> = {};
              let missingColumns: string[] = [];

              if (isConsolidatedFile(workbook)) {
                const result = parseConsolidatedFile(workbook);
                parsedData = result.records;
                presupuestosMap = result.presupuestos;
                missingColumns = result.missingColumns;
                totalPiezasExcel = parsedData.reduce((acc, r) => acc + r.piezasTotal, 0);
                totalBultosExcel = parsedData.reduce((acc, r) => acc + r.bultosTotal, 0);
              } else {
                const dataSheets = workbook.SheetNames.filter(s => s !== 'General');
                let sheetsToProcess: string[] = [];
                let isSingleDataSheet = false;

                if (dataSheets.length === 1) {
                  sheetsToProcess = [dataSheets[0]];
                  isSingleDataSheet = true;
                } else {
                  sheetsToProcess = dataSheets.filter(s => {
                    const normalized = normalizeSucursalName(s);
                    return KNOWN_SUCURSALES.includes(normalized);
                  });
                }

                sheetsToProcess.forEach((sheetName) => {
                  const worksheet = workbook.Sheets[sheetName];
                  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
                    header: 1,
                    defval: "",
                  });

                  const normalizedSucursal = normalizeSucursalName(sheetName);
                  const isTucSuc = normalizedSucursal === "Tucuman";
                  const assignedSucursal = isSingleDataSheet ? "PENDING_SUCURSAL" : normalizedSucursal;

                  let headerRowIdx = -1;
                  const colMap: Record<string, number> = {};
                  
                  for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
                    const row = jsonData[i];
                    if (!Array.isArray(row)) continue;
                    
                    const normalizedRow = row.map(c => normalizeHeader(c));
                    if (
                      normalizedRow.some(v => v.includes("hojaruta") || v.includes("hojasderuta")) || 
                      (normalizedRow.includes("fecha") && normalizedRow.some(v => v.includes("movil") || v.includes("distribuidor"))) ||
                      normalizedRow.includes("piezastotal") || 
                      normalizedRow.includes("totalpiezas")
                    ) {
                      headerRowIdx = i;
                      normalizedRow.forEach((val, idx) => {
                        if (val) colMap[val] = idx;
                      });
                      break;
                    }
                  }

                  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 4;

                  for (let i = startRow; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0 || row.every((cell) => cell === ""))
                      continue;

                    try {
                      let item: LogisticsData;

                      if (headerRowIdx !== -1) {
                        const getVal = (keys: string[]) => {
                          for (const key of keys) {
                            const normalizedKey = normalizeHeader(key);
                            const idx = colMap[normalizedKey];
                            if (idx !== undefined) return row[idx];
                          }
                          for (const key of keys) {
                            const normalizedKey = normalizeHeader(key);
                            const foundKey = Object.keys(colMap).find(k => k.includes(normalizedKey) || normalizedKey.includes(k));
                            if (foundKey) return row[colMap[foundKey]];
                          }
                          return undefined;
                        };

                        const piezasTotal = Number(getVal(["piezasTotal", "piezas Total", "cantidad de id piezas a gestionar", "piezas a gestionar"])) || 0;
                        const bultosTotal = Number(getVal(["bultosTotal", "bultos Total", "cantidad de bultos a gestionar", "bultos a gestionar"])) || 0;
                        const distribuidor = normalizeString(getVal(["distribuidor", "nombre completo del movil", "movil"]));
                        const cliente = normalizeString(getVal(["cliente", "clientes", "nombre del cliente"]));
                        if (!distribuidor) continue;

                        totalPiezasExcel += piezasTotal;
                        totalBultosExcel += bultosTotal;

                        const fecha = normalizeDate(getVal(["fecha", "fecha de gestion"]));
                        const obs = String(getVal(["observaciones", "obs", "comentarios"]) || "");
                        const piezasEntregadas = Number(getVal(["piezasEntregadas", "piezas Entregadas", "cantidad de piezas entregas", "entregadas"])) || 0;
                        const piezasNoEntregadas = Number(getVal(["piezasNoEntregadas", "piezas No Entregadas", "cantidad de no entregas", "no entregas"])) || 0;
                        const bultosEntregados = Number(getVal(["bultosEntregados", "bultos entregado"])) || 0;
                        const bultosDevueltos = Number(getVal(["bultosDevueltos", "bultos devueltos"])) || 0;

                        item = {
                          fecha: fecha,
                          distribuidor: distribuidor,
                          cliente: cliente || "N/A",
                          vehiculo: parseVehiculo(String(getVal(["vehiculo", "tipo de vehiculo marca", "tipo vehiculo"]) || ""), obs),
                          hojaRuta: normalizeHojaRuta(getVal(["hojaRuta", "hoja de ruta", "hojas de ruta numero"])),
                          ruta: String(getVal(["ruta", "rutas"]) || ""),
                          retiros: Number(getVal(["retiros"])) || 0,
                          piezasTotal: piezasTotal,
                          bultosTotal: bultosTotal,
                          palets: Number(getVal(["palets"])) || 0,
                          peso: Number(getVal(["peso", "kg transportado", "kg"])) || 0,
                          zona: parseZona(String(getVal(["zona", "zonas cap-int", "zonas"]) || ""), obs),
                          piezasEntregadas: piezasEntregadas,
                          piezasNoEntregadas: piezasNoEntregadas,
                          piezasSinNovedad: piezasEntregadas,
                          visitadasNovedad: Number(getVal(["visitadasNovedad", "visitadas Novedad", "visitadas con novedad"])) || 0,
                          noVisitadas: Number(getVal(["noVisitadas"])) || 0,
                          bultosEntregados: bultosEntregados,
                          bultosDevueltos: bultosDevueltos,
                          bultosNoEntregados: bultosDevueltos,
                          costoTotal: parseCurrency(getVal(["costoTotal", "costo total jornal o pieza", "costo"])),
                          presupuesto: Number(getVal(["presupuesto"])) || presupuestosMap[assignedSucursal],
                          observaciones: obs,
                          sucursal: assignedSucursal,
                        };
                      } else {
                        const offset = isTucSuc ? 1 : 0;
                        const piezasTotal = Number(row[4 + offset]) || 0;
                        const bultosTotal = Number(row[5 + offset]) || 0;
                        const distribuidor = String(row[1] || "").trim();
                        if (!distribuidor) continue;

                        totalPiezasExcel += piezasTotal;
                        totalBultosExcel += bultosTotal;

                        const fecha = normalizeDate(row[0]);
                        const colQ = String(row[16 + offset] || "");
                        const piezasEntregadasLegacy = Number(row[9 + offset]) || 0;
                        const piezasNoEntregadasLegacy = Number(row[10 + offset]) || 0;
                        const bultosEntregadosLegacy = Number(row[13 + offset]) || 0;
                        const bultosDevueltosLegacy = Number(row[14 + offset]) || 0;

                        item = {
                          fecha: fecha,
                          distribuidor: distribuidor,
                          cliente: "N/A",
                          vehiculo: parseVehiculo(String(row[2] || ""), colQ),
                          hojaRuta: String(row[3] || ""),
                          ruta: String(row[9 + offset] || ""),
                          retiros: isTucSuc ? Number(row[4]) || 0 : 0,
                          piezasTotal: piezasTotal,
                          bultosTotal: bultosTotal,
                          palets: Number(row[6 + offset]) || 0,
                          peso: Number(row[7 + offset]) || 0,
                          zona: parseZona(String(row[8 + offset] || ""), colQ),
                          piezasEntregadas: piezasEntregadasLegacy,
                          piezasNoEntregadas: piezasNoEntregadasLegacy,
                          piezasSinNovedad: piezasEntregadasLegacy,
                          visitadasNovedad: Number(row[11 + offset]) || 0,
                          noVisitadas: Number(row[12 + offset]) || 0,
                          bultosEntregados: bultosEntregadosLegacy,
                          bultosDevueltos: bultosDevueltosLegacy,
                          bultosNoEntregados: bultosDevueltosLegacy,
                          costoTotal: parseCurrency(row[15 + offset]),
                          presupuesto: presupuestosMap[assignedSucursal],
                          observaciones: colQ,
                          sucursal: assignedSucursal,
                        };
                      }
                      parsedData.push(item);
                    } catch (err) {
                      console.error("Error parsing row", i, err);
                    }
                  }
                });
              }

              if (parsedData.length === 0 && Object.keys(presupuestosMap).length === 0 && missingColumns.length === 0) {
                reject(new Error(`El archivo "${file.name}" no contiene datos válidos.`));
              } else {
                onDataLoaded(parsedData, file.name, type, {
                  piezas: totalPiezasExcel,
                  bultos: totalBultosExcel,
                }, presupuestosMap, missingColumns);
                resolve();
              }
            } else if (type === "CONSULTA_GLOBAL") {
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
              
              let headerRowIdx = -1;
              const colMap: Record<string, number> = {};
              for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
                const row = jsonData[i];
                const normalizedRow = row.map(c => normalizeHeader(c));
                if (normalizedRow.includes("hojaderuta") || normalizedRow.includes("pieza") || normalizedRow.includes("estado")) {
                  headerRowIdx = i;
                  normalizedRow.forEach((val, idx) => { if (val) colMap[val] = idx; });
                  break;
                }
              }

              const records: any[] = [];
              const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 1;
              for (let i = startRow; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0 || row.every(c => c === "")) continue;
                
                const getVal = (keys: string[]) => {
                  for (const key of keys) {
                    const idx = colMap[normalizeHeader(key)];
                    if (idx !== undefined) return row[idx];
                  }
                  return undefined;
                };

                records.push({
                  hojaRuta: Number(getVal(["hoja de ruta", "hojaruta"])) || 0,
                  pieza: String(getVal(["pieza"]) || ""),
                  estado: String(getVal(["estado"]) || ""),
                  bultos: Number(getVal(["bultos", "cantidad"])) || 1,
                  cliente: String(getVal(["cliente", "nombre del cliente"]) || ""),
                  localidad: String(getVal(["localidad destino", "localidad"]) || "")
                });
              }
              onDataLoaded(records, file.name, type);
              resolve();
            } else if (type === "HDR_DISTRIBUIDOR") {
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
              
              const records: any[] = [];
              for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length < 5) continue;
                records.push({
                  hojaRuta: Number(row[0]) || 0,
                  fecha: String(row[1] || ""),
                  cantidad: Number(row[4]) || 0
                });
              }
              onDataLoaded(records, file.name, type);
              resolve();
            } else if (type === "HISTORIAL") {
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
              
              let headerRowIdx = -1;
              const colMap: Record<string, number> = {};
              
              // Buscar fila de encabezado para el historial
              for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
                const row = jsonData[i];
                if (!Array.isArray(row)) continue;
                const normalizedRow = row.map(c => normalizeHeader(c));
                if (
                  normalizedRow.includes("sucursal") && 
                  (normalizedRow.includes("fecha") || normalizedRow.includes("fechagestion"))
                ) {
                  headerRowIdx = i;
                  normalizedRow.forEach((val, idx) => {
                    if (val) colMap[val] = idx;
                  });
                  break;
                }
              }

              const records: any[] = [];
              const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 1;

              for (let i = startRow; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length < 2 || row.every(c => c === "")) continue;
                
                const getVal = (keys: string[], fallbackIdx?: number) => {
                  for (const key of keys) {
                    const idx = colMap[normalizeHeader(key)];
                    if (idx !== undefined) return row[idx];
                  }
                  if (fallbackIdx !== undefined && row[fallbackIdx] !== undefined) return row[fallbackIdx];
                  return undefined;
                };

                const sucursalRaw = String(getVal(["sucursal"], 0) || "").trim();
                if (!sucursalRaw || sucursalRaw.toUpperCase() === "SUCURSAL") continue;

                const sucursalName = normalizeSucursalName(sucursalRaw);
                const fechaVal = getVal(["fecha", "fechagestion"], 1);

                records.push({
                  sucursal:           sucursalName,
                  fecha:              normalizeDate(fechaVal),
                  distribuidor:       String(getVal(["distribuidor", "movil", "nombre completo del movil"], 2) || "N/A"),
                  vehiculo:           String(getVal(["vehiculo", "tipo vehiculo", "tipo de vehiculo marca"], 3) || "N/A"),
                  hojaRuta:           String(getVal(["hojaRuta", "hoja de ruta", "hojas de ruta numero"], 4) || ""),
                  piezasTotal:        Number(getVal(["piezasTotal", "totalpiezas", "cantidad de id piezas a gestionar"], 5)) || 0,
                  bultosTotal:        Number(getVal(["bultosTotal", "totalbultos", "cantidad de bultos a gestionar"], 6)) || 0,
                  palets:             Number(getVal(["palets", "pallets"], 7)) || 0,
                  peso:               getVal(["peso", "kg transportado"], 8) || 0,
                  zona:               String(getVal(["zona", "zonas", "zonas cap int"], 9) || "N/A"),
                  piezasEntregadas:   Number(getVal(["piezasEntregadas", "entregadas", "cantidad de piezas entregas"], 10)) || 0,
                  piezasNoEntregadas: Number(getVal(["piezasNoEntregadas", "no entregas", "cantidad de no entregas"], 11)) || 0,
                  visitadasNovedad:   Number(getVal(["visitadasNovedad", "visitadas con novedad"], 12)) || 0,
                  noVisitadas:        Number(getVal(["noVisitadas"], 13)) || 0,
                  bultosEntregados:   Number(getVal(["bultosEntregados", "bultos entregados"], 14)) || 0,
                  bultosNoEntregados: Number(getVal(["bultosNoEntregados", "bultos devueltos"], 15)) || 0,
                  costoTotal:         parseCurrency(getVal(["costoTotal", "costo", "costo total jornal o pieza"], 16)),
                });
              }
              onDataLoaded(records, file.name, type);
              resolve();
            }
          } catch (err: any) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("Error al leer el archivo."));
        reader.readAsArrayBuffer(file);
      });

      setProgress(fileProgressOffset + (100 * fileProgressScale));
    }

    setTimeout(() => {
      setIsProcessing(false);
      setProgress(0);
    }, 500);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (
        !isProcessing &&
        e.dataTransfer.files &&
        e.dataTransfer.files.length > 0
      ) {
        processFiles(e.dataTransfer.files);
      }
    },
    [isProcessing],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isProcessing) setIsDragging(true);
    },
    [isProcessing],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isProcessing && e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div className="w-full relative z-10">
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 ease-in-out h-48 flex flex-col items-center justify-center ${
          isDragging
            ? "border-primary-500 bg-primary-50"
            : "border-secondary-300 bg-white/90 backdrop-blur-sm hover:border-primary-400 hover:bg-white"
        } ${isProcessing || disabled ? "pointer-events-none opacity-80" : ""}`}
        style={{ boxShadow: "var(--shadow-professional)" }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept=".xls,.xlsx,.csv"
          multiple
          onChange={handleFileInput}
          disabled={isProcessing || disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
          {isProcessing ? (
            <div className="w-full flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin mb-4" />
              <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                Procesando archivo...
              </h3>
              <div className="w-full max-w-xs bg-secondary-200 rounded-full h-2.5 mb-1 overflow-hidden">
                <div
                  className="bg-primary-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-secondary-500">
                {progress}% completado
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 bg-primary-50 rounded-full">
                <UploadCloud className="w-10 h-10 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">
                  {title}
                </h3>
                <p className="text-sm text-secondary-500 mt-1">
                  {description}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-danger-50 border border-danger-100 rounded-lg flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-danger-50 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-danger-700">
              Error de validación
            </h4>
            <p className="text-sm text-danger-600 mt-1">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
