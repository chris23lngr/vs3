import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	[
		"inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
		"transition-opacity hover:opacity-90",
	],
	{
		variants: {
			variant: {
				default: [
					"border border-violet-600 bg-linear-to-b from-violet-500 to-violet-600 text-white",
					"inset-shadow-2xs inset-shadow-white/20",
				],
				outline: [
					"bg-background text-zinc-700 shadow-sm ring-1 ring-zinc-700/10 dark:text-zinc-200 dark:ring-zinc-200/20",
				],
			},
			size: {
				default: "h-7 px-3 py-1 text-sm [&_svg:not([class*='size-'])]:size-3.5",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			className={cn(buttonVariants({ variant, size, className }))}
			data-slot="button"
			{...props}
		/>
	);
}

export { Button, buttonVariants };
