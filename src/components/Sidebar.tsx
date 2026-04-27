import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Download, 
  PlusCircle, 
  RefreshCw, 
  Save,
  FileSpreadsheet
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onExportReport: () => void;
  onExportSistema: () => void;
  onExportMissingClients: () => void;
  onAddFiles: () => void;
  onRevalidate: () => void;
  onReset: () => void;
  onSaveAndExport: () => void;
  isExporting: boolean;
  isExportingSistema: boolean;
  isSaving: boolean;
  hasSistemaData: boolean;
}

export default function Sidebar({
  isOpen,
  onClose,
  onExportReport,
  onExportSistema,
  onExportMissingClients,
  onAddFiles,
  onRevalidate,
  onReset,
  onSaveAndExport,
  isExporting,
  isExportingSistema,
  isSaving,
  hasSistemaData
}: SidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col"
          >
            <div className="p-6 border-b border-secondary-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-secondary-900">Acciones</h2>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-secondary-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-6 h-6 text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-4">
              <button
                onClick={onExportReport}
                disabled={isExporting}
                className="w-full flex items-center p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all duration-200 group cursor-pointer disabled:opacity-50"
              >
                <div className="p-2 bg-blue-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <Download className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">
                  {isExporting ? "Exportando..." : "Exportar Reporte"}
                </span>
              </button>

              {hasSistemaData && (
                <>
                  <button
                    onClick={onExportSistema}
                    disabled={isExportingSistema}
                    className="w-full flex items-center p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all duration-200 group cursor-pointer disabled:opacity-50"
                  >
                    <div className="p-2 bg-indigo-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium text-left">
                      {isExportingSistema ? "Exportando..." : "Exportar Reporte Sistema"}
                    </span>
                  </button>

                  <button
                    onClick={onExportMissingClients}
                    disabled={isExportingSistema}
                    className="w-full flex items-center p-3 rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-all duration-200 group cursor-pointer disabled:opacity-50"
                  >
                    <div className="p-2 bg-cyan-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                      <Download className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium text-left">
                      Exportar Clientes Faltantes
                    </span>
                  </button>
                </>
              )}

              <button
                onClick={() => { onAddFiles(); onClose(); }}
                className="w-full flex items-center p-3 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 transition-all duration-200 group cursor-pointer"
              >
                <div className="p-2 bg-violet-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">Agregar o Quitar Archivos</span>
              </button>

              <button
                onClick={() => { onRevalidate(); onClose(); }}
                className="w-full flex items-center p-3 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-all duration-200 group cursor-pointer"
              >
                <div className="p-2 bg-orange-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">Validación de Datos</span>
              </button>

              <button
                onClick={onSaveAndExport}
                disabled={isSaving}
                className="w-full flex items-center p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all duration-200 group cursor-pointer disabled:opacity-50"
              >
                <div className="p-2 bg-emerald-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <Save className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">
                  {isSaving ? "Procesando..." : "Guardar y Exportar Datos"}
                </span>
              </button>

              <button
                onClick={() => { onReset(); onClose(); }}
                className="w-full flex items-center p-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-all duration-200 group cursor-pointer"
              >
                <div className="p-2 bg-red-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <RefreshCw className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">Cancelar Análisis</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
