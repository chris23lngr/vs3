import Link from "next/link";
import type React from "react";
import type { JSX } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export function SiteNav({
	className,
	items,
	...props
}: React.ComponentProps<"nav"> & {
	items: { label: string; href: string; icon?: JSX.Element }[];
}) {
	return (
		<nav
			className={cn(
				"mx-auto flex h-(--header-height) w-full max-w-7xl items-center justify-start px-8 py-6",
				className,
			)}
			data-slot="site-nav"
			{...props}
		>
			<div className="ml-auto flex items-center justify-center gap-8 [&_svg]:size-4 [&_svg]:fill-zinc-600 [&_svg]:group-hover/nav-item:fill-violet-600">
				{items.map(({ href, icon: Icon, label }) => (
					<Link
						className="group/nav-item flex items-center justify-center gap-2 font-medium text-sm text-zinc-600 transition-colors hover:text-violet-600 dark:text-zinc-200 dark:hover:text-violet-500"
						href={href}
						key={href}
					>
						{Icon && Icon}
						{label}
					</Link>
				))}
			</div>
			<ThemeToggle className="ms-4" />
		</nav>
	);
}
