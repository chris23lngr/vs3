import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-full font-medium text-xs",
	{
		variants: {
			variant: {
				outline: ["border shadow-xs", "border-zinc-200 text-zinc-600"],
			},
			size: {
				default:
					"gap-2 px-2.5 py-0.5 [&_svg:not([class*='size-'])]:size-2 [:has(svg)]:ps-2.5",
			},
		},
		defaultVariants: {
			variant: "outline",
		},
	},
);

export function Badge({
	className,
	variant = "outline",
	size = "default",
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span
			className={cn(badgeVariants({ variant, size, className }))}
			data-slot="badge"
			{...props}
		/>
	);
}
