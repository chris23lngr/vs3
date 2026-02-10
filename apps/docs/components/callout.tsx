"use client";

import { cva, type VariantProps } from "class-variance-authority";
import {
	CircleCheckIcon,
	CircleXIcon,
	InfoIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const calloutVariants = cva(
	"my-8 flex gap-5 rounded-xl border border-border p-4 shadow-xs first:mt-0 last:mb-0 [&_p]:last:mb-0",
	{
		variants: {
			type: {
				info: "",
				warn: "",
				error: "",
				success: "",
			},
		},
		defaultVariants: {
			type: "info",
		},
	},
);

const barVariants = cva("w-0.75 self-stretch rounded-full", {
	variants: {
		type: {
			info: "bg-blue-500 dark:bg-blue-700",
			warn: "bg-yellow-500 dark:bg-yellow-700",
			error: "bg-red-500 dark:bg-red-700",
			success: "bg-green-500 dark:bg-green-700",
		},
	},
	defaultVariants: {
		type: "info",
	},
});

const titleVariants = cva("block font-medium text-sm", {
	variants: {
		type: {
			info: "text-blue-600 dark:text-blue-500",
			warn: "text-yellow-600 dark:text-yellow-500",
			error: "text-red-600 dark:text-red-500",
			success: "text-green-600 dark:text-green-500",
		},
	},
	defaultVariants: {
		type: "info",
	},
});

const DEFAULT_TITLES: Record<"info" | "warn" | "error" | "success", string> = {
	info: "Information",
	warn: "Warning",
	error: "Error",
	success: "Success",
};

function CalloutIcon({
	type,
}: {
	type: "info" | "warn" | "error" | "success";
}): React.ReactElement {
	const base = "size-3.5 shrink-0";
	switch (type) {
		case "info":
			return (
				<InfoIcon
					className={cn(
						base,
						"fill-blue-100 text-blue-500 dark:fill-blue-950 dark:text-blue-500",
					)}
				/>
			);
		case "warn":
			return (
				<TriangleAlertIcon
					className={cn(
						base,
						"fill-yellow-100 text-yellow-500 dark:fill-yellow-950 dark:text-yellow-500",
					)}
				/>
			);
		case "error":
			return (
				<CircleXIcon
					className={cn(
						base,
						"fill-red-100 text-red-500 dark:fill-red-950 dark:text-red-500",
					)}
				/>
			);
		case "success":
			return (
				<CircleCheckIcon
					className={cn(
						base,
						"fill-green-100 text-green-500 dark:fill-green-950 dark:text-green-500",
					)}
				/>
			);
	}
}

export type CalloutType = "info" | "warn" | "error" | "success";

export interface CalloutProps
	extends Omit<React.ComponentProps<"div">, "title">,
		VariantProps<typeof calloutVariants> {
	title?: string;
}

function Callout({
	children,
	type = "info",
	title,
	className,
	...props
}: CalloutProps): React.ReactElement {
	const resolvedType: CalloutType = type ?? "info";
	const label = title ?? DEFAULT_TITLES[resolvedType];
	return (
		<div
			className={cn(calloutVariants({ type: resolvedType, className }))}
			{...props}
		>
			<div className={barVariants({ type: resolvedType })} />
			<div>
				<div className="mb-2 flex items-center gap-2">
					<CalloutIcon type={resolvedType} />
					<span className={titleVariants({ type: resolvedType })}>{label}</span>
				</div>
				{children}
			</div>
		</div>
	);
}

export { Callout, calloutVariants, barVariants, titleVariants };
