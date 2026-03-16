import { LogisticsData } from "./types";

export const normalizeString = (val: any) => {
  return String(val || "")
    .trim()
    .toUpperCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width spaces
    .replace(/\s+/g, " "); // Collapse all whitespace into a single space
};

export interface Difference {
  field: string;
  existing: any;
  incoming: any;
}

export const getDifferences = (a: LogisticsData, b: LogisticsData) => {
  const diffs: Difference[] = [];
  const num = (val: any) => {
    const n = Number(val);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  };

  const check = (field: string, label: string, valA: any, valB: any, isNum = false) => {
    if (isNum) {
      if (num(valA) !== num(valB)) {
        diffs.push({ field: label, existing: valA, incoming: valB });
      }
    } else {
      if (normalizeString(valA) !== normalizeString(valB)) {
        diffs.push({ field: label, existing: valA, incoming: valB });
      }
    }
  };

  check("distribuidor", "Distribuidor", a.distribuidor, b.distribuidor);
  check("vehiculo", "Vehículo", a.vehiculo, b.vehiculo);
  check("zona", "Zona", a.zona, b.zona);
  check("observaciones", "Observaciones", a.observaciones, b.observaciones);
  check("piezasTotal", "Piezas", a.piezasTotal, b.piezasTotal, true);
  check("bultosTotal", "Bultos", a.bultosTotal, b.bultosTotal, true);
  check("costoTotal", "Costo", a.costoTotal, b.costoTotal, true);
  check("piezasEntregadas", "Piezas Entregadas", a.piezasEntregadas, b.piezasEntregadas, true);
  check("piezasNoEntregadas", "Piezas No Entregadas", a.piezasNoEntregadas, b.piezasNoEntregadas, true);
  check("visitadasNovedad", "Visitadas Novedad", a.visitadasNovedad, b.visitadasNovedad, true);
  check("noVisitadas", "No Visitadas", a.noVisitadas, b.noVisitadas, true);
  check("bultosEntregados", "Bultos Entregados", a.bultosEntregados, b.bultosEntregados, true);
  check("bultosDevueltos", "Bultos Devueltos", a.bultosDevueltos, b.bultosDevueltos, true);
  check("retiros", "Retiros", a.retiros, b.retiros, true);
  check("palets", "Palets", a.palets, b.palets, true);
  check("peso", "Peso", a.peso, b.peso, true);

  return diffs;
};

export const normalizeDate = (dateStr: string) => {
  if (!dateStr) return "";
  // Try to normalize d/m/yyyy to dd/mm/yyyy or similar
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2];
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

export const normalizeHojaRuta = (val: any) => {
  return normalizeString(val).replace(/\s*-\s*/g, "-"); // Remove spaces around hyphens
};

export const normalizeZone = (zone: string) => {
  if (!zone) return "Desconocida";
  const normalized = normalizeString(zone);
  
  // Check for Capital and its abbreviations
  if (normalized.includes("CAPITAL") || normalized.includes("CAP") || 
      normalized.includes("CAPT") || normalized.includes("CAPTAL")) {
    return "CAPITAL";
  }
  
  // Check for Interior and its abbreviations
  if (normalized.includes("INTERIOR") || normalized.includes("INT") || 
      normalized.includes("INTR") || normalized.includes("INTER")) {
    return "INTERIOR";
  }
  
  return null; // Return null if not recognized as one of the two
};

export const getRouteId = (d: LogisticsData) => {
  const sucursal = normalizeString(d.sucursal);
  const hojaRuta = normalizeHojaRuta(d.hojaRuta);
  const fecha = normalizeDate(d.fecha);
  return `${sucursal}|${hojaRuta}|${fecha}`;
};
