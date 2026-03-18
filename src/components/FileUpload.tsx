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

const KNOWN_BRANCHES = [
  "Tucuman",
  "La Rioja",
  "Catamarca",
  "Salta",
  "Jujuy",
  "Santiago"
];

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
  
  // Primero buscamos coincidencias de "Grande"
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

  // Luego buscamos coincidencias de "Chica" o genéricas de "Camioneta"
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

  // Camiones (se busca después para no confundir con camioneta)
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
  
  // Si no hay datos, devolvemos un marcador para que el modal de validación lo detecte
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
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        setProgress(50);

        const parsedData: LogisticsData[] = [];
        let totalPiezasExcel = 0;
        let totalBultosExcel = 0;

        let presupuestosMap: Record<string, number> = {};
        
        const isConsolidated = workbook.SheetNames.includes('General');
        
        if (isConsolidated) {
          const generalWs = workbook.Sheets['General'];
          const generalJson = XLSX.utils.sheet_to_json<any[]>(generalWs, { header: 1 });
          
          // Find Cost Table
          let costTableIdx = -1;
          for (let i = 0; i < generalJson.length; i++) {
            const row = generalJson[i];
            if (row && row[0] === 'DATOS DE COSTOS POR SUCURSAL') {
              costTableIdx = i + 2; // Skip title and header row
              break;
            }
          }
          
          if (costTableIdx !== -1) {
            for (let i = costTableIdx; i < generalJson.length; i++) {
              const row = generalJson[i];
              // Stop if we hit an empty row or the end of the table
              if (!row || !row[0] || row[0] === 'Total') break;
              
              const sucursalName = normalizeSucursalName(String(row[0]));
              const budgetValue = Number(row[1]) || 0;
              presupuestosMap[sucursalName] = budgetValue;
            }
          }
        }

        const budgetSheetName = workbook.SheetNames.find(s => {
          if (s === 'General') return false;
          const ws = workbook.Sheets[s];
          const json = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
          for (let i = 0; i < Math.min(json.length, 10); i++) {
            const row = json[i];
            if (row && row[1] && typeof row[1] === 'string') {
              const header = row[1].toLowerCase().trim();
              if (header === 'ppt' || header.includes('presupuesto') || header.includes('presu') || header === 'pres') {
                return true;
              }
            }
          }
          return false;
        });

        if (budgetSheetName) {
          const ws = workbook.Sheets[budgetSheetName];
          const json = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
          let headerRowIdx = -1;
          for (let i = 0; i < Math.min(json.length, 10); i++) {
            const row = json[i];
            if (row && row[1] && typeof row[1] === 'string') {
              const header = row[1].toLowerCase().trim();
              if (header === 'ppt' || header.includes('presupuesto') || header.includes('presu') || header === 'pres') {
                headerRowIdx = i;
                break;
              }
            }
          }
          
          if (headerRowIdx !== -1) {
            for (let i = headerRowIdx + 1; i < json.length; i++) {
              const row = json[i];
              if (row && row[0] && row[1] !== undefined) {
                const sucursalName = normalizeSucursalName(String(row[0]));
                const budgetValue = Number(row[1]) || 0;
                presupuestosMap[sucursalName] = budgetValue;
              }
            }
          }
        }

        const dataSheets = workbook.SheetNames.filter(s => s !== budgetSheetName && s !== 'General');
        
        let sheetsToProcess: string[] = [];
        let isSingleDataSheet = false;

        if (dataSheets.length === 1) {
          sheetsToProcess = [dataSheets[0]];
          isSingleDataSheet = true;
        } else {
          sheetsToProcess = dataSheets.filter(s => {
            const normalized = normalizeSucursalName(s);
            return KNOWN_BRANCHES.includes(normalized);
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

          // Find header row and map columns
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
                // Use header mapping
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
                if (!distribuidor) continue;

                totalPiezasExcel += piezasTotal;
                totalBultosExcel += bultosTotal;

                let fecha = "";
                const rawFecha = getVal(["fecha", "fecha de gestion"]);
                if (rawFecha) {
                  if (rawFecha instanceof Date) {
                    fecha = rawFecha.toLocaleDateString("es-AR");
                  } else {
                    fecha = String(rawFecha);
                  }
                }

                const obs = String(getVal(["observaciones", "obs", "comentarios"]) || "");

                const piezasEntregadas = Number(getVal(["piezasEntregadas", "piezas Entregadas", "cantidad de piezas entregas", "entregadas"])) || 0;
                const piezasNoEntregadas = Number(getVal(["piezasNoEntregadas", "piezas No Entregadas", "cantidad de no entregas", "no entregas"])) || 0;
                const bultosEntregados = Number(getVal(["bultosEntregados", "bultos entregado"])) || 0;
                const bultosDevueltos = Number(getVal(["bultosDevueltos", "bultos devueltos"])) || 0;

                item = {
                  fecha: fecha,
                  distribuidor: distribuidor,
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
                  piezasSinNovedad: piezasEntregadas, // Mapping to piezasEntregadas
                  visitadasNovedad: Number(getVal(["visitadasNovedad", "visitadas Novedad", "visitadas con novedad"])) || 0,
                  noVisitadas: Number(getVal(["noVisitadas"])) || 0,
                  bultosEntregados: bultosEntregados,
                  bultosDevueltos: bultosDevueltos,
                  bultosNoEntregados: bultosDevueltos, // Mapping to bultosDevueltos
                  costoTotal: Number(getVal(["costoTotal", "costo total jornal o pieza", "costo"])) || 0,
                  presupuesto: Number(getVal(["presupuesto"])) || presupuestosMap[assignedSucursal],
                  observaciones: obs,
                  sucursal: assignedSucursal,
                };
              } else {
                // Fallback to legacy fixed-index logic
                const offset = isTucSuc ? 1 : 0;
                const piezasTotal = Number(row[4 + offset]) || 0;
                const bultosTotal = Number(row[5 + offset]) || 0;
                const distribuidor = String(row[1] || "").trim();
                if (!distribuidor) continue;

                totalPiezasExcel += piezasTotal;
                totalBultosExcel += bultosTotal;

                let fecha = "";
                if (row[0]) {
                  if (row[0] instanceof Date) {
                    fecha = row[0].toLocaleDateString("es-AR");
                  } else {
                    fecha = String(row[0]);
                  }
                }

                const colQ = String(row[16 + offset] || "");

                const piezasEntregadasLegacy = Number(row[9 + offset]) || 0;
                const piezasNoEntregadasLegacy = Number(row[10 + offset]) || 0;
                const bultosEntregadosLegacy = Number(row[13 + offset]) || 0;
                const bultosDevueltosLegacy = Number(row[14 + offset]) || 0;

                item = {
                  fecha: fecha,
                  distribuidor: distribuidor,
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
                  costoTotal: Number(row[15 + offset]) || 0,
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

    reader.readAsBinaryString(file);
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
