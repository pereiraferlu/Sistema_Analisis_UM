export interface LogisticsData {
  fecha: string;
  distribuidor: string; // NOMBRE COMPLETO DEL MOVIL
  vehiculo: string; // TIPO DE VEHICULO, MARCA
  hojaRuta: string; // HOJAS DE RUTA- NUMERO
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
