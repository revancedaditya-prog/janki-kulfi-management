import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixSymbol?: string;
  suffixSymbol?: string;
  isPieceQuantity?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      prefixSymbol,
      suffixSymbol,
      isPieceQuantity,
      type = 'text',
      id,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const handleIncrement = () => {
      if (onChange) {
        const current = parseInt(String(value || 0), 10) || 0;
        const event = {
          target: { value: String(current + 1), name: props.name },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(event);
      }
    };

    const handleDecrement = () => {
      if (onChange) {
        const current = parseInt(String(value || 0), 10) || 0;
        const next = Math.max(0, current - 1);
        const event = {
          target: { value: String(next), name: props.name },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(event);
      }
    };

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-gray-800 tracking-tight"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixSymbol && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500 font-semibold text-base">
              {prefixSymbol}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            type={type}
            value={value}
            onChange={onChange}
            className={cn(
              'w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-base text-gray-900 placeholder-gray-400 min-h-[44px]',
              'focus:outline-none focus:ring-2 focus:ring-maroon-700 focus:border-transparent transition-colors',
              'disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed',
              prefixSymbol && 'pl-9',
              suffixSymbol && 'pr-12',
              isPieceQuantity && 'pr-24 font-mono font-bold text-lg',
              error && 'border-rose-500 focus:ring-rose-500',
              className
            )}
            {...props}
          />

          {suffixSymbol && !isPieceQuantity && (
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-500 text-sm font-medium">
              {suffixSymbol}
            </div>
          )}

          {isPieceQuantity && (
            <div className="absolute inset-y-1 right-1 flex items-center space-x-1">
              <button
                type="button"
                onClick={handleDecrement}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 font-bold text-lg select-none"
              >
                -
              </button>
              <button
                type="button"
                onClick={handleIncrement}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-maroon-100 text-maroon-800 hover:bg-maroon-200 active:bg-maroon-300 font-bold text-lg select-none"
              >
                +
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {helperText && !error && <p className="text-xs text-gray-500">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
