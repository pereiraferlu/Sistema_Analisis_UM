export interface ConsultaGlobalData {
  hojaRuta: string;
  pieza: string;
  estado: string;
  bultos: number;
  cliente: string;
  localidad: string;
  fechaCambioEstado?: string;
  codigo?: string;
  sourceFile?: string;
}

export interface DistribuidorData {
  hojaRuta: string;
  fecha: string;
  cantidad: number;
  sourceFile?: string;
}

export interface HistorialData extends LogisticsData {}

export interface LogisticsData {
  fecha: string;
  distribuidor: string; // NOMBRE COMPLETO DEL MOVIL
  vehiculo: string; // TIPO DE VEHICULO, MARCA
  hojaRuta: string; // HOJAS DE RUTA- NUMERO
  ruta: string; // RUTA
  retiros?: number; // RETIROS (Only in TUC SUC)
  piezasTotal: number; // CANTIDAD DE ID-PIEZAS A GESTIONAR
  bultosTotal: number; // CANTIDAD DE BULTOS A GESTIONAR
  palets: number; // PALETS
  peso: number; // KG TRANSPORTADO
  zona: string; // ZONAS (CAP-INT)
  piezasEntregadas: number; // CANTIDAD DE PIEZAS ENTREGAS
  piezasNoEntregadas: number; // CANTIDAD DE NO ENTREGAS
  piezasSinNovedad: number; // PIEZAS SIN NOVEDAD (Usually same as piezasEntregadas)
  visitadasNovedad: number; // VISITADAS CON NOVEDAD
  noVisitadas: number; // NO VISITADAS
  bultosEntregados: number; // BULTOS ENTREGADOS
  bultosDevueltos: number; // BULTOS DEVUELTOS
  bultosNoEntregados: number; // BULTOS NO ENTREGADOS (Usually same as bultosDevueltos)
  costoTotal: number; // COSTO TOTAL - JORNAL O PIEZA
  presupuesto?: number; // PRESUPUESTO ESTABLECIDO
  observaciones: string; // OBSERVACIONES
  cliente: string; // CLIENTES
  sucursal: string; // Derived from sheet name
  sheetName?: string; // Original sheet name
  sourceFile?: string;
}

export interface DashboardState {
  data: LogisticsData[];
  isLoaded: boolean;
  fileName: string;
}

export interface ParseWarning {
  sheetName: string;
  missingColumns: string[];
}

export interface SistemaData {
  sucursal: string;
  fecha: string;
  ruta: string;
  distribuidor: string;
  movil: string;
  cliente: string;
  piezasPlanilla: number;
  piezasConsulta: number;
  piezasHDR: number;
  hojasRuta?: string;
  piezasEntregadasPlanilla?: number;
  piezasEntregadasConsulta?: number;
  diferencia: number;
}
