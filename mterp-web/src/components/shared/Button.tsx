import { LucideIcon } from "lucide-react";

interface ButtonProps {
  title: string;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "danger"
    | "warning"
    | "outline";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: React.CSSProperties;
  className?: string;
  type?: "button" | "submit" | "reset";
}

export default function Button({
  title,
  onClick,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = "left",
  fullWidth = false,
  style,
  className = "",
  type = "button",
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const getIconSize = () => {
    switch (size) {
      case "small": return 16;
      case "medium": return 20;
      case "large": return 24;
      default: return 20;
    }
  };

  const baseClasses = "inline-flex items-center justify-center font-bold outline-none transition-all duration-200";
  
  const sizeClasses = {
    small: "min-h-[40px] px-3 py-2 text-sm rounded-md",
    medium: "min-h-[48px] px-4 py-3 text-base rounded-lg",
    large: "min-h-[56px] px-6 py-4 text-lg rounded-xl",
  };

  const variantClasses = {
    primary: isDisabled 
      ? "bg-primary text-white shadow-hypr"
      : "bg-primary text-white shadow-hypr hover:bg-primary-light hover:-translate-y-[1px]",
    secondary: isDisabled
      ? "bg-text-secondary text-white"
      : "bg-text-secondary text-white hover:opacity-90",
    success: isDisabled
      ? "bg-semantic-success text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)]"
      : "bg-semantic-success text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:opacity-90 hover:-translate-y-[1px]",
    danger: isDisabled
      ? "bg-semantic-danger text-white shadow-[0_4px_14px_rgba(239,68,68,0.3)]"
      : "bg-semantic-danger text-white shadow-[0_4px_14px_rgba(239,68,68,0.3)] hover:opacity-90 hover:-translate-y-[1px]",
    warning: isDisabled
      ? "bg-semantic-warning text-white shadow-[0_4px_14px_rgba(245,158,11,0.3)]"
      : "bg-semantic-warning text-white shadow-[0_4px_14px_rgba(245,158,11,0.3)] hover:opacity-90 hover:-translate-y-[1px]",
    outline: isDisabled
      ? "bg-transparent text-primary border-2 border-primary"
      : "bg-transparent text-primary border-2 border-primary hover:bg-primary-bg",
  };

  const stateClasses = [
    fullWidth ? "w-full" : "",
    isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    className
  ].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${stateClasses}`}
      onClick={onClick}
      disabled={isDisabled}
      style={style}
    >
      {loading ? (
        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
      ) : (
        <span className="flex items-center justify-center">
          {Icon && iconPosition === "left" && (
            <Icon size={getIconSize()} style={{ marginRight: 8 }} />
          )}
          <span>{title}</span>
          {Icon && iconPosition === "right" && (
            <Icon size={getIconSize()} style={{ marginLeft: 8 }} />
          )}
        </span>
      )}
    </button>
  );
}
