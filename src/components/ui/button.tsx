import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0",
  {
    variants: {
      variant: {
        default: "bg-sky-600 text-white shadow-sm shadow-sky-600/25 hover:bg-sky-500 active:scale-[0.98] font-medium transition-all dark:bg-sky-400 dark:hover:bg-sky-300 dark:text-slate-950",
        secondary: "bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200/60 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-900/50",
        outline: "border border-sky-200/80 bg-card hover:bg-sky-50/70 hover:text-sky-700 hover:border-sky-300 shadow-xs dark:border-sky-950/80 dark:hover:bg-sky-950/40 dark:hover:text-sky-300",
        ghost: "hover:bg-sky-50/80 hover:text-sky-700 dark:hover:bg-sky-950/40 dark:hover:text-sky-300",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        success: "bg-[var(--success)] text-white shadow-sm hover:opacity-90",
        link: "text-sky-600 underline-offset-4 hover:underline dark:text-sky-400",
      },
      size: {
        sm: "h-8 px-3 text-xs has-[>svg]:px-2.5",
        default: "h-9 px-4 has-[>svg]:px-3.5",
        lg: "h-10 px-5 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

function Button({ className, variant, size, asChild = false, loading, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
