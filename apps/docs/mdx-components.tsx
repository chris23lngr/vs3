import * as Steps from "fumadocs-ui/components/steps";
import * as Tabs from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { Callout } from "./components/callout";
import { CodeTabs, CodeTabsContent } from "./components/code-tabs";
import { cn } from "./lib/utils";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		...Steps,
		...Tabs,
		...components,
	};
}

export const components = {
	// ...defaultMdxComponents,
	...Steps,
	...Tabs,
	// ...Callout,
	h1: ({ children, className, ...props }: React.ComponentProps<"h1">) => (
		<h1
			className={cn(
				"scroll-mt-24 font-bold text-3xl text-zinc-800 dark:text-zinc-100",
				className,
			)}
			{...props}
		>
			{children}
		</h1>
	),
	h2: ({ children, className, ...props }: React.ComponentProps<"h2">) => (
		<h2
			className={cn(
				"mt-12 mb-2 scroll-mt-24 font-semibold text-2xl text-zinc-800 dark:text-zinc-100",
				className,
			)}
			{...props}
		>
			{children}
		</h2>
	),
	h3: ({ children, className, ...props }: React.ComponentProps<"h3">) => (
		<h3
			className={cn(
				"mt-8 mb-4 scroll-mt-24 font-semibold text-lg text-zinc-800 dark:text-zinc-100",
				className,
			)}
			{...props}
		>
			{children}
		</h3>
	),
	h4: ({ children, className, ...props }: React.ComponentProps<"h4">) => (
		<h4
			className={cn(
				"mt-10 mb-4 scroll-mt-24 font-semibold text-base text-zinc-800 dark:text-zinc-100",
				className,
			)}
			{...props}
		>
			{children}
		</h4>
	),
	h5: ({ children, className, ...props }: React.ComponentProps<"h5">) => (
		<h5
			className={cn(
				"scroll-mt-24 font-bold text-sm text-zinc-800 dark:text-zinc-100",
				className,
			)}
			{...props}
		>
			{children}
		</h5>
	),
	h6: ({ children, className, ...props }: React.ComponentProps<"h6">) => (
		<h6
			className={cn(
				"scroll-mt-24 font-bold text-xs text-zinc-800 dark:text-zinc-100",
				className,
			)}
			{...props}
		>
			{children}
		</h6>
	),
	strong: ({ children }: { children: React.ReactNode }) => (
		<strong className="font-medium text-zinc-800 dark:text-zinc-100">
			{children}
		</strong>
	),
	p: ({ children }: { children: React.ReactNode }) => (
		<p className="mb-4 text-[0.9375rem] text-zinc-600 leading-relaxed dark:text-zinc-400">
			{children}
		</p>
	),
	ul: ({ children }: { children: React.ReactNode }) => (
		<ul className="mt-4 mb-6 list-outside list-disc space-y-2 pl-3.5 text-[0.9375rem] text-body text-zinc-600 leading-7 marker:text-zinc-300 dark:text-zinc-400 dark:marker:text-zinc-500 [&>li]:pl-2">
			{children}
		</ul>
	),
	ol: ({ children }: { children: React.ReactNode }) => (
		<ol className="mt-4 mb-6 list-outside list-decimal space-y-2 pl-3.5 text-[0.9375rem] text-body text-zinc-600 leading-6 marker:text-zinc-400 dark:text-zinc-400 dark:marker:text-zinc-400 [&>li]:pl-2">
			{children}
		</ol>
	),
	a: ({ children, href }: { children: React.ReactNode; href: string }) => (
		<Link
			className="rounded-sm font-medium text-zinc-800 underline underline-offset-4 transition-colors hover:text-violet-600 focus-visible:text-violet-500 focus-visible:decoration-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:text-zinc-200 dark:hover:text-violet-500"
			href={href}
		>
			{children}
		</Link>
	),
	pre: ({
		className,
		children,
		title,
		...props
	}: React.ComponentProps<"pre">) => {
		return (
			<div className="mb-4 overflow-hidden rounded-xl bg-zinc-800 p-1">
				{title && (
					<div className="flex items-center justify-start gap-4 px-2 py-2">
						<p className="font-medium text-xs text-zinc-400">{title}</p>
					</div>
				)}
				<pre
					className={cn(
						"scrollbar-dark overflow-x-auto border border-zinc-900",
						"inset-shadow-2xs inset-shadow-white/15 rounded-lg bg-zinc-700 py-4 text-sm",
						"sm:[&>code]:[counter-reset:line] [&_.line]:before:mr-0 [&_.line]:before:w-0 [&_.line]:before:content-none sm:[&_.line]:before:mr-6 sm:[&_.line]:before:inline-block sm:[&_.line]:before:w-4 sm:[&_.line]:before:text-right sm:[&_.line]:before:text-xs sm:[&_.line]:before:text-zinc-400 sm:[&_.line]:[counter-increment:line] sm:[&_.line]:before:[content:counter(line)]",
						className,
					)}
					{...props}
				>
					{children}
				</pre>
			</div>
		);
	},
	code: ({ className, ...props }: React.ComponentProps<"code">) => {
		if (typeof props.children === "string") {
			return (
				<code
					className={cn(
						"mx-0.5 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-sm shadow-xs",
					)}
					{...props}
				>
					{props.children}
				</code>
			);
		}
		// return children
		return <code className={cn(className)} {...props} />;
	},
	table: ({ className, ...props }: React.ComponentProps<"table">) => (
		<div className="mt-6 mb-4 overflow-auto rounded-lg border border-border shadow-sm">
			<table className={cn("w-full text-left text-sm", className)} {...props} />
		</div>
	),
	thead: ({ className, ...props }: React.ComponentProps<"thead">) => (
		<thead
			className={cn("border-border border-b bg-zinc-100", className)}
			{...props}
		/>
	),
	tbody: ({ className, ...props }: React.ComponentProps<"tbody">) => (
		<tbody className={cn("rounded-lg bg-background p-1", className)} {...props} />
	),
	tr: ({ className, ...props }: React.ComponentProps<"tr">) => (
		<tr
			className={cn("border-border border-t first:border-t-0", className)}
			{...props}
		/>
	),
	th: ({ className, ...props }: React.ComponentProps<"th">) => (
		<th
			className={cn(
				"px-4 py-2 text-left font-medium text-sm text-zinc-900 dark:text-zinc-100",
				className,
			)}
			{...props}
		/>
	),
	td: ({ className, ...props }: React.ComponentProps<"td">) => (
		<td
			className={cn(
				"px-4 py-4 text-left text-sm text-zinc-500 dark:text-zinc-400",
				className,
			)}
			{...props}
		/>
	),
	Callout,
	CodeTabs,
	CodeTabsContent,
};
