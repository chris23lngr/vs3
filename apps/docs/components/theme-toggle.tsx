"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex h-fit w-fit items-center justify-center gap-0.25 rounded-full border p-0 shadow-xs",
				className,
			)}
			data-slot="theme-toggle"
			{...props}
		>
			<ThemeToggleButton theme="light">
				<SunIcon />
			</ThemeToggleButton>
			<ThemeToggleButton theme="dark">
				<MoonIcon />
			</ThemeToggleButton>
		</div>
	);
}

function ThemeToggleButton({
	className,
	theme,
	...props
}: Omit<React.ComponentProps<"button">, "type"> & { theme: "light" | "dark" }) {
	const { theme: currentTheme, setTheme } = useTheme();

	return (
		<button
			className={cn(
				"flex size-7 cursor-pointer items-center justify-center rounded-full ring-zinc-200 data-active:bg-zinc-100 data-active:ring-1 [&_svg]:size-4 [&_svg]:fill-zinc-200 [&_svg]:text-zinc-600",
				"dark:data-active:bg-zinc-900 dark:data-active:ring-zinc-800 dark:[&_svg]:fill-zinc-700 dark:[&_svg]:text-zinc-100",
				className,
			)}
			data-state={currentTheme === theme ? "active" : undefined}
			onClick={() => setTheme(theme)}
			type="button"
			{...props}
		/>
	);
}
