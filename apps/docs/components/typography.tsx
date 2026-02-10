import { cn } from "@/lib/utils";

export function PageTitle({
	className,
	...props
}: React.ComponentProps<"h1">): React.ReactElement {
	return (
		<h1
			className={cn(
				"max-w-3xl font-semibold text-4xl leading-[1.3]",
				"bg-linear-to-t from-zinc-900 to-zinc-500 bg-clip-text text-transparent",
				"dark:from-white dark:to-zinc-400",
				"bg-position-[0_0] bg-size-[100%_1.3em] bg-repeat-y",
				className,
			)}
			data-slot="page-title"
			{...props}
		/>
	);
}

export function PageDescription({
	className,
	...props
}: React.ComponentProps<"p">): React.ReactElement {
	return (
		<p
			className={cn(
				"max-w-2xl text-base text-zinc-500 dark:text-zinc-300",
				className,
			)}
			data-slot="page-description"
			{...props}
		/>
	);
}

export function SectionTitle({
	className,
	...props
}: React.ComponentProps<"h2">): React.ReactElement {
	return (
		<h2
			className={cn(
				"max-w-2xl font-semibold text-3xl leading-[1.3]",
				"bg-linear-to-t from-zinc-900 to-zinc-600 bg-clip-text text-transparent",
				"dark:from-white dark:to-zinc-400",
				"bg-position-[0_0] bg-size-[100%_1.3em] bg-repeat-y",
				className,
			)}
			data-slot="section-title"
			{...props}
		/>
	);
}

export function SectionDescription({
	className,
	...props
}: React.ComponentProps<"p">): React.ReactElement {
	return (
		<p
			className={cn(
				"max-w-xl text-sm text-zinc-500 dark:text-zinc-300",
				className,
			)}
			data-slot="section-description"
			{...props}
		/>
	);
}
