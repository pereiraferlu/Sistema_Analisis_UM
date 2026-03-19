import React, { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { UploadCloud, AlertCircle, Loader2 } from "lucide-react";
import { LogisticsData } from "../types";
import { normalizeZone, normalizeString, normalizeHojaRuta, normalizeDate } from "../utils";

interface FileUploadProps {
  onDataLoaded: (
    data: LogisticsData[],
    fileName: string,
    totals?: { piezas: number; bultos: number },
    presupuestosMap?: Record<string, number>
  ) => void;
}

const KNOWN_SUCURSALES = ["Tucuman", "Salta", "Jujuy", "Catamarca", "Santiago", "La Rioja"];

function isConsolidatedFile(workbook: XLSX.WorkBook): boolean {
  return workbook.SheetNames.includes("General") &&
         workbook.SheetNames.some(s => KNOWN_SUCURSALES.includes(s));
}

function parseConsolidatedFile(workbook: XLSX.WorkBook): {
  records: LogisticsData[];
  presupuestos: Record<string, number>;
} {
  const records: LogisticsData[] = [];
  const presupuestos: Record<string, number> = {};

  // ── 1. Leer presupuestos desde hoja General ──────────────────────────────
  const generalWs = workbook.Sheets["General"];
  if (generalWs) {
    const allRows = XLSX.utils.sheet_to_json<any[]>(generalWs, {
      header: 1,
      defval: null,
    });
    for (const row of allRows) {
      if (!Array.isArray(row)) continue;
      const colB = row[1]; 
      const colC = row[2]; 
      if (colB && KNOWN_SUCURSALES.includes(String(colB))) {
        presupuestos[String(colB)] = Number(colC) || 0;
      }
    }
  }

  // ── 2. Leer datos de cada hoja de sucursal ───────────────────────────────
  for (const sheetName of workbook.SheetNames) {
    if (sheetName === "General") continue;
    if (!KNOWN_SUCURSALES.includes(sheetName)) continue;

    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
      defval: null,
      raw: true,
    });

    for (const row of rows) {
      const fechaVal = row['Fecha'];
      if (fechaVal === 'TOTAL' || fechaVal == null) continue;
      if (typeof row['Total Piezas'] === 'string') continue;

      records.push({
        sucursal:           sheetName,
        distribuidor:       String(row['Distribuidor']          ?? ''),
        vehiculo:           String(row['Vehículo']              ?? ''),
        hojaRuta:           String(row['Hoja de Ruta']          ?? ''),
        fecha:              normalizeDate(row['Fecha']),
        piezasTotal:        Number(row['Total Piezas']          ?? 0),
        bultosTotal:        Number(row['Total Bultos']          ?? 0),
        zona:               String(row['Zona']                  ?? ''),
        piezasEntregadas:   Number(row['Piezas Entregadas']     ?? 0),
        piezasNoEntregadas: Number(row['Piezas No Entregadas']  ?? 0),
        visitadasNovedad:   Number(row['Visitadas con Novedad'] ?? 0),
        noVisitadas:        Number(row['No Visitadas']          ?? 0),
        bultosEntregados:   Number(row['Bultos Entregados']     ?? 0),
        bultosNoEntregados: Number(row['Bultos No Entregados']  ?? 0),
        costoTotal:         Number(row['Costo Total']           ?? 0),
        observaciones:      String(row['Observaciones']         ?? ''),
        cliente:            "N/A",
        piezasSinNovedad:   Number(row['Piezas Entregadas']     ?? 0),
        bultosDevueltos:    Number(row['Bultos No Entregados']  ?? 0),
        palets:             0,
        peso:               0,
        retiros:            0
      });
    }
  }

  return { records, presupuestos };
}

const parseCurrency = (val: any): number => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  return parseInt(String(val).replace(/[^0-9-]/g, "")) || 0;
};

export const normalizeSucursalName = (name: string): string => {
  if (!name) return "Desconocida";
  const upper = name.toUpperCase().replace(/ SUC$/, '').trim();
  if (upper === 'TUC' || upper === 'TUCUMAN' || upper === 'TUCUMÁN') return 'Tucuman';
  if (upper === 'LR' || upper === 'LA RIOJA') return 'La Rioja';
  if (upper === 'CAT' || upper === 'CATAMARCA') return 'Catamarca';
  if (upper === 'SLT' || upper === 'SA' || upper === 'SALTA' || upper === 'SALT') return 'Salta';
  if (upper === 'JJY' || upper === 'JY' || upper === 'JUJUY') return 'Jujuy';
  if (upper === 'SE' || upper === 'SGO' || upper === 'SANTIAGO DEL ESTERO' || upper === 'SANTIAGO') return 'Santiago';
  return name;
};

const parseVehiculo = (vehiculoRaw: string, colQ: string): string => {
  const v = vehiculoRaw.toLowerCase().trim();
  
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

export default function FileUpload({ onDataLoaded }: FileUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const processFile = (file: File) => {
    setError(null);
    setIsProcessing(true);
    setProgress(10);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        setProgress(30);
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        setProgress(50);

        let parsedData: LogisticsData[] = [];
        let totalPiezasExcel = 0;
        let totalBultosExcel = 0;
        let presupuestosMap: Record<string, number> = {};

        if (isConsolidatedFile(workbook)) {
          const result = parseConsolidatedFile(workbook);
          parsedData = result.records;
          presupuestosMap = result.presupuestos;
          totalPiezasExcel = parsedData.reduce((acc, r) => acc + r.piezasTotal, 0);
          totalBultosExcel = parsedData.reduce((acc, r) => acc + r.bultosTotal, 0);
        } else {
          // Legacy / Single Sheet Parsing Logic
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
            
            for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
              const row = jsonData[i];
              if (!Array.isArray(row)) continue;
              
              const rowStr = row.map(c => String(c || "").toLowerCase().trim().replace(/\s+/g, ""));
              if (rowStr.includes("hojaruta") || rowStr.includes("distribuidor") || rowStr.includes("piezastotal")) {
                headerRowIdx = i;
                rowStr.forEach((val, idx) => {
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
                      const idx = colMap[key.toLowerCase().replace(/\s+/g, "")];
                      if (idx !== undefined) return row[idx];
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
                    hojaRuta: normalizeHojaRuta(getVal(["hojaRuta", "hoja de ruta", "hojas de ruta numero", "ruta"])),
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

        setProgress(90);

        if (parsedData.length === 0 && Object.keys(presupuestosMap).length === 0) {
          throw new Error(
            "No se encontraron datos válidos ni presupuestos en el archivo.",
          );
        } else {
          setTimeout(() => {
            setProgress(100);
            setTimeout(() => {
              setIsProcessing(false);
              onDataLoaded(parsedData, file.name, {
                piezas: totalPiezasExcel,
                bultos: totalBultosExcel,
              }, presupuestosMap);
            }, 300);
          }, 500);
        }
      } catch (err: any) {
        setIsProcessing(false);
        setError(
          err.message ||
            "Error al procesar el archivo. Asegúrese de que sea un archivo Excel válido (.xls, .xlsx).",
        );
      }
    };

    reader.readAsArrayBuffer(file);
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
        processFile(e.dataTransfer.files[0]);
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
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-12 relative z-10">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ease-in-out ${
          isDragging
            ? "border-primary-500 bg-primary-50"
            : "border-secondary-300 bg-white/90 backdrop-blur-sm hover:border-primary-400 hover:bg-white"
        } ${isProcessing ? "pointer-events-none opacity-80" : ""}`}
        style={{ boxShadow: "var(--shadow-professional)" }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept=".xls,.xlsx"
          onChange={handleFileInput}
          disabled={isProcessing}
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
                  Cargar archivo de datos
                </h3>
                <p className="text-sm text-secondary-500 mt-1">
                  Arrastre y suelte su archivo Excel (.xls, .xlsx) aquí, o haga
                  clic para seleccionar
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
