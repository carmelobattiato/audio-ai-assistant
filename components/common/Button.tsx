import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  isGlowing?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading,
  isGlowing,
  ...props
}) => {
  const baseStyle = "font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-75 transition-all duration-150 ease-in-out inline-flex items-center justify-center flex-shrink-0";
  
  const variantStyles = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed",
    secondary: "bg-gray-600 hover:bg-gray-700 text-gray-100 focus:ring-gray-500 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed",
    danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-400 disabled:bg-gray-500 disabled:text-gray-300 disabled:cursor-not-allowed",
    ghost: "bg-transparent hover:bg-gray-700 text-gray-300 hover:text-white focus:ring-gray-500 disabled:text-gray-500 disabled:hover:bg-transparent disabled:cursor-not-allowed",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const iconSize = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };
  
  const glowClass = isLoading || isGlowing ? 'btn-loading-glow' : '';
  // Ghost buttons need a temporary background when loading to make the glow visible.
  // The hover:bg-gray-700 color is a good choice.
  const ghostLoadingStyle = (variant === 'ghost' && (isLoading || isGlowing)) ? 'bg-gray-700' : '';

  return (
    <button
      type="button"
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${glowClass} ${ghostLoadingStyle} ${className || ''}`}
      {...props}
      disabled={props.disabled || isLoading}
    >
      {leftIcon && <span className={`mr-2 ${iconSize[size]}`}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={`ml-2 ${iconSize[size]}`}>{rightIcon}</span>}
    </button>
  );
};