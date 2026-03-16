import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

interface ChartFilterProps {
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
  label: string;
}

export default function ChartFilter({
  options,
  selectedOptions,
  onChange,
  label,
}: ChartFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selectedOptions.includes(option)) {
      onChange(selectedOptions.filter((o) => o !== option));
    } else {
      if (selectedOptions.length < 10) {
        onChange([...selectedOptions, option]);
      }
    }
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div className="relative inline-block text-left mb-4" ref={dropdownRef}>
      <div className="flex items-center space-x-2">
        <span className="text-xs text-secondary-500 font-medium">{label}:</span>
        <button
          type="button"
          className="inline-flex justify-between items-center w-48 rounded-md border border-secondary-300 shadow-sm px-3 py-1.5 bg-white text-xs font-medium text-secondary-700 hover:bg-secondary-50 focus:outline-none cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="truncate">
            {selectedOptions.length === 0
              ? "Top 10 (Por defecto)"
              : `${selectedOptions.length} seleccionados`}
          </span>
          <div className="flex items-center space-x-1">
            {selectedOptions.length > 0 && (
              <X
                className="h-3 w-3 text-secondary-400 hover:text-danger-500 cursor-pointer"
                onClick={clearSelection}
              />
            )}
            <ChevronDown className="h-3 w-3 text-secondary-400" />
          </div>
        </button>
      </div>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div
            className="py-1 max-h-60 overflow-y-auto"
            role="menu"
            aria-orientation="vertical"
          >
            <div className="px-3 py-2 text-xs text-secondary-500 border-b border-secondary-100">
              Máximo 10 selecciones
            </div>
            {options.map((option) => {
              const isSelected = selectedOptions.includes(option);
              const isDisabled = !isSelected && selectedOptions.length >= 10;
              return (
                <label
                  key={option}
                  className={`flex items-center px-4 py-2 text-xs cursor-pointer hover:bg-secondary-50 ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="mr-3 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                    checked={isSelected}
                    onChange={() => !isDisabled && toggleOption(option)}
                    disabled={isDisabled}
                  />
                  <span className="truncate" title={option}>
                    {option}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
