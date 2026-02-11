import Link from "next/link";
import type React from "react";
import { cn } from "@/lib/utils";

export function Nav({ className, ...props }: React.ComponentProps<"nav">) {
	return (
		<nav
			className={cn(
				"mx-auto flex h-(--header-height) w-full items-center justify-start px-8 py-6",
				className,
			)}
			data-slot="nav"
			{...props}
		/>
	);
}

export function NavItem({
	className,
	...props
}: React.ComponentProps<typeof Link>) {
	return (
		<Link
			className={cn(
				"group/nav-item flex items-center justify-center gap-2 font-medium text-sm text-zinc-600 transition-colors hover:text-violet-600 dark:text-zinc-200 dark:hover:text-violet-500",
				className,
			)}
			data-slot="nav-item"
			{...props}
		/>
	);
}
