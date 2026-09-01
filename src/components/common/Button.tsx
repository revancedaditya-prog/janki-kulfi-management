import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  leftIcon,
  rightIcon,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 min-h-[44px]';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-base gap-2',
    lg: 'px-6 py-3.5 text-lg font-semibold gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-maroon-800 text-white hover:bg-maroon-900 shadow-md shadow-maroon-900/20 focus:ring-maroon-700',
    secondary:
      'bg-cream-200 text-maroon-900 hover:bg-cream-300 border border-cream-400 focus:ring-maroon-600',
    accent:
      'bg-saffron-600 text-white hover:bg-saffron-700 shadow-md shadow-saffron-700/20 focus:ring-saffron-500',
    outline:
      'bg-transparent text-maroon-900 border-2 border-maroon-800 hover:bg-maroon-50 focus:ring-maroon-700',
    danger:
      'bg-rose-700 text-white hover:bg-rose-800 shadow-md shadow-rose-900/20 focus:ring-rose-600',
    ghost:
      'bg-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-400',
  };

  return (
    <button
      className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};
