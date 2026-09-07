import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "default" | "primary";

/** Shared bevel + typography. `btn` handles the press nudge. */
const base = (variant: Variant, className?: string) =>
  cn("bevel btn", variant === "primary" && "btn-primary", className);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function BevelButton({
  variant = "default",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={base(variant, className)} {...rest}>
      {children}
    </button>
  );
}

type LinkProps = {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
};

/** Same visual control, but navigates. Stays a real anchor for a11y. */
export function BevelLink({
  href,
  variant = "default",
  className,
  children,
}: LinkProps) {
  return (
    <Link href={href} className={cn(base(variant, className), "no-underline")}>
      {children}
    </Link>
  );
}
