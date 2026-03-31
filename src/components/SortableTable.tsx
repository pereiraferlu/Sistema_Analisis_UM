import React, { useState, useMemo, useRef, useEffect } from "react";
import { ArrowUpDown, Filter, X } from "lucide-react";

interface Column {
  key: string;
  label: string;
  render?: (val: any, row: any) => React.ReactNode;
  renderExpanded?: (val: any, row: any) => React.ReactNode;
  align?: "left" | "right" | "center";
}

interface SortableTableProps {
  columns: Column[];
  data: any[];
  customTotals?: Record<string, any>;
  getSubRows?: (row: any) => any[];
  subColumns?: Column[];
}

export default function SortableTable({ columns, data, customTotals, getSubRows, subColumns }: SortableTableProps) {
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
        setActiveFilter(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handleFilterToggle = (key: string, value: string) => {
    setFilters((prev) => {
      const current = prev[key] || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: updated };
    });
  };

  const getUniqueValues = (key: string) => {
    let filteredForThisColumn = [...data];
    Object.keys(filters).forEach((filterKey) => {
      if (filterKey !== key) {
        const selectedValues = filters[filterKey];
        if (selectedValues && selectedValues.length > 0) {
          filteredForThisColumn = filteredForThisColumn.filter((item) => {
            return selectedValues.includes(String(item[filterKey]));
          });
        }
      }
    });
    const values = filteredForThisColumn.map((item) => String(item[key]));
    return Array.from(new Set(values)).sort();
  };

  const filteredAndSortedData = useMemo(() => {
    let sortableItems = [...data];

    // Filter
    Object.keys(filters).forEach((key) => {
      const selectedValues = filters[key];
      if (selectedValues && selectedValues.length > 0) {
        sortableItems = sortableItems.filter((item) => {
          return selectedValues.includes(String(item[key]));
        });
      }
    });

    // Sort
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig, filters]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    columns.forEach((col) => {
      if (
        col.key !== "name" &&
        col.key !== "sucursal" &&
        col.key !== "zona" &&
        col.key !== "distribuidor"
      ) {
        let sum = 0;
        filteredAndSortedData.forEach((row) => {
          const val = row[col.key];
          if (typeof val === "number") sum += val;
        });
        t[col.key] = sum;
      }
    });
    return { ...t, ...customTotals };
  }, [filteredAndSortedData, columns, customTotals]);

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {Object.values(filters).flat().length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => setFilters({})}
            className="inline-flex items-center px-3 py-1 text-xs font-medium text-danger-600 bg-danger-50 hover:bg-danger-100 rounded-md transition-colors"
          >
            <X className="w-3 h-3 mr-1" />
            Limpiar todos los filtros
          </button>
        </div>
      )}
      <div className="overflow-x-auto border border-secondary-200 rounded-lg bg-white min-h-[350px]">
        <table className="min-w-full divide-y divide-secondary-200 table-fixed">
        <thead className="bg-secondary-100">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-3 relative">
                <div className={`flex items-center space-x-1 ${col.align === 'left' || (!col.align && col.key === 'name') ? 'justify-start' : col.align === 'right' ? 'justify-end' : 'justify-center'}`}>
                  <span
                    className="text-xs font-bold text-secondary-900 uppercase tracking-wider truncate cursor-pointer"
                    title={col.label}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                  </span>
                  <button
                    onClick={() => handleSort(col.key)}
                    className="text-secondary-400 hover:text-secondary-700 flex-shrink-0 cursor-pointer"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <div className="flex items-center">
                    <button
                      onClick={() =>
                        setActiveFilter(
                          activeFilter === col.key ? null : col.key,
                        )
                      }
                      className={`flex-shrink-0 cursor-pointer ${filters[col.key]?.length ? "text-primary-600" : "text-secondary-400 hover:text-secondary-700"}`}
                    >
                      <Filter className="w-3 h-3" />
                    </button>
                    {filters[col.key]?.length > 0 && (
                      <button
                        onClick={(e) => {
                          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                          setFilters((prev) => ({ ...prev, [col.key]: [] }));
                        }}
                        className="ml-1 text-danger-500 hover:text-danger-700 cursor-pointer"
                        title="Borrar filtro"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {activeFilter === col.key && (
                  <div
                    ref={filterRef}
                    className="absolute z-50 mt-2 w-48 bg-white border border-secondary-200 rounded-md shadow-lg max-h-60 overflow-y-auto left-0"
                  >
                    <div className="p-2">
                      {getUniqueValues(col.key).map((val) => (
                        <label
                          key={val}
                          className="flex items-center space-x-2 p-1 hover:bg-secondary-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={(filters[col.key] || []).includes(val)}
                            onChange={() => handleFilterToggle(col.key, val)}
                            className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                          <span
                            className="text-xs text-secondary-700 truncate"
                            title={val}
                          >
                            {val || "(Vacío)"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-secondary-200">
          {filteredAndSortedData.map((row, idx) => {
            const isExpanded = getSubRows && expandedRows.has(idx);
            return (
            <React.Fragment key={idx}>
              <tr 
                className={`transition-all duration-200 relative ${
                  isExpanded 
                    ? 'bg-primary-50 ring-2 ring-primary-600 ring-inset z-10 font-semibold text-primary-900' 
                    : getSubRows 
                      ? 'cursor-pointer hover:bg-secondary-300' 
                      : 'hover:bg-secondary-300'
                }`}
                onClick={() => getSubRows && toggleRow(idx)}
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 whitespace-nowrap text-xs truncate ${
                      isExpanded ? 'text-primary-900' : 'text-secondary-700'
                    } ${
                      col.align === "left" || (colIdx === 0 && !col.align)
                        ? "text-left"
                        : col.align === "right"
                        ? "text-right"
                        : "text-center"
                    }`}
                    title={String(row[col.key])}
                  >
                    {col.align === "center" ? (
                      <div className="flex justify-center">
                        <div className="text-right min-w-[60px]">
                          {col.render ? col.render(row[col.key], row) : row[col.key]}
                        </div>
                      </div>
                    ) : (
                      col.render ? col.render(row[col.key], row) : row[col.key]
                    )}
                  </td>
                ))}
              </tr>
              {isExpanded && getSubRows(row).map((subRow, subIdx) => (
                <tr 
                  key={`sub-${idx}-${subIdx}`} 
                  className="bg-secondary-50/50 transition-colors font-medium text-secondary-900 relative hover:bg-secondary-200"
                >
                  {columns.map((col, colIdx) => (
                    <td
                      key={col.key}
                      className={`py-1.5 whitespace-nowrap text-[11px] text-secondary-600 border-b border-secondary-100/50 ${
                        colIdx === 0 
                          ? "pl-10 pr-3 border-l-4 border-primary-300" 
                          : colIdx === columns.length - 1
                            ? "pl-3 pr-10"
                            : "px-3"
                      } ${
                        col.align === "left" || (colIdx === 0 && !col.align)
                          ? "text-left"
                          : col.align === "right"
                          ? "text-right"
                          : "text-center"
                      }`}
                    >
                      {col.align === "center" ? (
                        <div className="flex justify-center">
                          <div className="text-right min-w-[60px]">
                            {col.renderExpanded ? col.renderExpanded(subRow[col.key], subRow) : (col.render ? col.render(subRow[col.key], subRow) : subRow[col.key])}
                          </div>
                        </div>
                      ) : (
                        col.renderExpanded ? col.renderExpanded(subRow[col.key], subRow) : (col.render ? col.render(subRow[col.key], subRow) : subRow[col.key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          )})}
        </tbody>
        <tfoot className="bg-secondary-50 font-bold border-t-2 border-secondary-200">
          <tr>
            {columns.map((col, idx) => {
              const alignClass = col.align === "left" || (idx === 0 && !col.align)
                ? "text-left"
                : col.align === "right"
                ? "text-right"
                : "text-center";

              if (idx === 0)
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-3 whitespace-nowrap text-xs text-secondary-900 ${alignClass}`}
                  >
                    Total
                  </td>
                );

              if (col.key === "efectividad") {
                const totalPiezas = totals["value"] || totals["total"] || 0;
                const totalEntregadas = totals["entregadas"] || 0;
                const eff = totalPiezas > 0 ? (totalEntregadas / totalPiezas) * 100 : 0;
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-3 whitespace-nowrap text-xs text-secondary-900 ${alignClass}`}
                  >
                    {col.align === "center" ? (
                      <div className="flex justify-center">
                        <div className="text-right min-w-[60px]">
                          {eff.toFixed(0)}%
                        </div>
                      </div>
                    ) : (
                      `${eff.toFixed(0)}%`
                    )}
                  </td>
                );
              }

              if (col.key === "pctSinNovedad") {
                const totalPiezas = totals["total"] || 0;
                const totalSinNovedad = totals["sinNovedad"] || 0;
                const pct = totalPiezas > 0 ? (totalSinNovedad / totalPiezas) * 100 : 0;
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-3 whitespace-nowrap text-xs text-secondary-900 ${alignClass}`}
                  >
                    {col.align === "center" ? (
                      <div className="flex justify-center">
                        <div className="text-right min-w-[60px]">
                          {pct.toFixed(0)}%
                        </div>
                      </div>
                    ) : (
                      `${pct.toFixed(0)}%`
                    )}
                  </td>
                );
              }

              if (col.key === "porcentajeGastado") {
                const totalPresupuesto = totals["presupuesto"] || 0;
                const totalCosto = totals["costoTotal"] || 0;
                const pct = totalPresupuesto > 0 ? (totalCosto / totalPresupuesto) * 100 : 0;
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-3 whitespace-nowrap text-xs text-secondary-900 ${alignClass}`}
                  >
                    {col.align === "center" ? (
                      <div className="flex justify-center">
                        <div className="text-right min-w-[60px]">
                          {pct.toFixed(0)}%
                        </div>
                      </div>
                    ) : (
                      `${pct.toFixed(0)}%`
                    )}
                  </td>
                );
              }

              if (col.key === "percent") {
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-3 whitespace-nowrap text-xs text-secondary-900 ${alignClass}`}
                  >
                    -
                  </td>
                );
              }

              const val = totals[col.key];
              const renderedVal = val !== undefined
                ? col.render
                  ? col.render(val, totals)
                  : val.toLocaleString()
                : "-";

              return (
                <td
                  key={col.key}
                  className={`px-3 py-3 whitespace-nowrap text-xs text-secondary-900 ${alignClass}`}
                >
                  {col.align === "center" ? (
                    <div className="flex justify-center">
                      <div className="text-right min-w-[60px]">
                        {renderedVal}
                      </div>
                    </div>
                  ) : (
                    renderedVal
                  )}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}
