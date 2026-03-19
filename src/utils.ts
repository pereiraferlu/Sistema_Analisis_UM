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
  check("cliente", "Cliente", a.cliente, b.cliente);
  check("vehiculo", "Vehículo", a.vehiculo, b.vehiculo);
  check("zona", "Zona", a.zona, b.zona);
  check("observaciones", "Observaciones", a.observaciones, b.observaciones);
  check("piezasTotal", "Piezas", a.piezasTotal, b.piezasTotal, true);
  check("bultosTotal", "Bultos", a.bultosTotal, b.bultosTotal, true);
  check("costoTotal", "Costo", a.costoTotal, b.costoTotal, true);
  check("piezasEntregadas", "Piezas Entregadas", a.piezasEntregadas, b.piezasEntregadas, true);
  check("piezasNoEntregadas", "Piezas No Entregadas", a.piezasNoEntregadas, b.piezasNoEntregadas, true);
  check("piezasSinNovedad", "Piezas Sin Novedad", a.piezasSinNovedad, b.piezasSinNovedad, true);
  check("visitadasNovedad", "Visitadas Novedad", a.visitadasNovedad, b.visitadasNovedad, true);
  check("noVisitadas", "No Visitadas", a.noVisitadas, b.noVisitadas, true);
  check("bultosEntregados", "Bultos Entregados", a.bultosEntregados, b.bultosEntregados, true);
  check("bultosDevueltos", "Bultos Devueltos", a.bultosDevueltos, b.bultosDevueltos, true);
  check("bultosNoEntregados", "Bultos No Entregados", a.bultosNoEntregados, b.bultosNoEntregados, true);
  check("retiros", "Retiros", a.retiros, b.retiros, true);
  check("palets", "Palets", a.palets, b.palets, true);
  check("peso", "Peso", a.peso, b.peso, true);

  return diffs;
};

export const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const normalizeDate = (val: any) => {
  if (!val) return "";
  
  let date: Date | null = null;

  // Handle Excel serial date (number or numeric string)
  const numVal = Number(val);
  if (!isNaN(numVal) && typeof val !== 'boolean' && /^\d{5}(\.\d+)?$/.test(String(val))) {
    // Excel base date is Dec 30, 1899. 
    // We use UTC to avoid timezone shifts that can move the date to the previous day.
    date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
  } else if (val instanceof Date) {
    // If it's already a Date object, we'll treat it as UTC to stay consistent
    date = val;
  } else {
    const dateStr = String(val).trim();
    if (!dateStr) return "";

    // Try parsing common formats
    // dd/mm/yyyy or dd-mm-yyyy or dd-mmm-yyyy or yyyy-mm-dd
    const parts = dateStr.split(/[\/\-\s]/);
    if (parts.length >= 2) {
      let d, m, y;
      if (parts[0].length === 4) {
        // yyyy-mm-dd
        y = parseInt(parts[0]);
        m = parseInt(parts[1]) - 1;
        d = parseInt(parts[2] || "1");
      } else {
        // dd/mm/yyyy
        d = parseInt(parts[0]);
        m = parseInt(parts[1]) - 1;

        // If month is not a number, try to find it in MONTHS
        if (isNaN(m) && parts[1]) {
          const monthStr = parts[1].toLowerCase().substring(0, 3);
          m = MONTHS.indexOf(monthStr);
        }

        y = new Date().getFullYear();
        if (parts.length === 3) {
          y = parseInt(parts[2]);
          if (y < 100) y += 2000;
        }
      }
      
      if (!isNaN(d) && !isNaN(m) && m >= 0 && m <= 11) {
        // Create date in UTC to avoid local timezone issues
        date = new Date(Date.UTC(y, m, d));
      }
    }
    
    if (!date || isNaN(date.getTime())) {
      // Fallback to native parsing
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
  }

  if (date && !isNaN(date.getTime())) {
    // We use UTC methods to ensure the day doesn't shift due to local timezone
    const d = String(date.getUTCDate()).padStart(2, "0");
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const y = String(date.getUTCFullYear()).slice(-2);
    return `${d}-${m}-${y}`;
  }

  return String(val);
};

export const parseNormalizedDate = (dateStr: string) => {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split("-");
  
  // Handle dd-mm-aa
  if (parts.length === 3) {
    const d = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    let y = parseInt(parts[2]);
    if (y < 100) y += 2000;
    // Return a UTC date for consistency
    return new Date(Date.UTC(y, m, d));
  }

  // Handle old dd-mon format
  if (parts.length === 2) {
    const day = parseInt(parts[0]);
    const monthIdx = MONTHS.indexOf(parts[1].toLowerCase());
    if (monthIdx !== -1) return new Date(Date.UTC(new Date().getFullYear(), monthIdx, day));
  }

  return new Date(dateStr);
};

export const KNOWN_SUCURSALES = ["Tucuman", "Salta", "Jujuy", "Catamarca", "Santiago", "La Rioja"];

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

export const normalizeHojaRuta = (val: any) => {
  return normalizeString(val).replace(/\s*-\s*/g, "-"); // Remove spaces around hyphens
};

export const normalizeZone = (zone: string) => {
  if (!zone || zone === "SIN_ZONA") return null;
  const normalized = normalizeString(zone);
  
  // Check for Capital and its abbreviations with more precision
  const isCapital = normalized === "CAPITAL" || 
                    normalized === "CAP" || 
                    normalized === "CAPT" || 
                    normalized === "CAPTAL" ||
                    normalized.startsWith("CAPITAL ") ||
                    normalized.includes(" CAPITAL ");
                    
  if (isCapital) return "CAPITAL";
  
  // Check for Interior and its abbreviations with more precision
  const isInterior = normalized === "INTERIOR" || 
                     normalized === "INT" || 
                     normalized === "INTR" || 
                     normalized === "INTER" ||
                     normalized.startsWith("INTERIOR ") ||
                     normalized.includes(" INTERIOR ");

  if (isInterior) return "INTERIOR";
  
  return null; // Return null if not recognized as one of the two
};

export const getRouteId = (d: LogisticsData) => {
  const sucursal = normalizeString(d.sucursal);
  const hojaRuta = normalizeHojaRuta(d.hojaRuta);
  const fecha = normalizeDate(d.fecha);
  return `${sucursal}|${hojaRuta}|${fecha}`;
};
