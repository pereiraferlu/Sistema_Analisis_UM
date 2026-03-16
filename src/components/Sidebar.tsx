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
  onAddRoutes: () => void;
  onReset: () => void;
  onSaveAndExport: () => void;
  isExporting: boolean;
  isSaving: boolean;
}

export default function Sidebar({
  isOpen,
  onClose,
  onExportReport,
  onAddRoutes,
  onReset,
  onSaveAndExport,
  isExporting,
  isSaving
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
                onClick={() => {
                  onExportReport();
                }}
                disabled={isExporting}
                className="w-full flex items-center p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="p-2 bg-blue-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <Download className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">
                  {isExporting ? "Exportando..." : "Exportar Reporte"}
                </span>
              </button>

              <button
                onClick={() => {
                  onAddRoutes();
                  onClose();
                }}
                className="w-full flex items-center p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all group cursor-pointer"
              >
                <div className="p-2 bg-emerald-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">Agregar Rutas</span>
              </button>

              <button
                onClick={() => {
                  onSaveAndExport();
                }}
                disabled={isSaving}
                className="w-full flex items-center p-3 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all group cursor-pointer disabled:opacity-50"
              >
                <div className="p-2 bg-amber-600 rounded-lg mr-4 group-hover:scale-110 transition-transform">
                  <Save className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-left">
                  {isSaving ? "Procesando..." : "Guardar y Exportar Datos"}
                </span>
              </button>

              <button
                onClick={() => {
                  onReset();
                  onClose();
                }}
                className="w-full flex items-center p-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-all group cursor-pointer"
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
