import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

export function CodeTabs({
	values,
	children,
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
	values?: string[];
}) {
	return (
		<TabsPrimitive.Root
			className={cn("rounded-xl bg-zinc-800 ring-1 ring-zinc-900", className)}
			{...props}
		>
			<TabsPrimitive.List className="inset-shadow-2xs inset-shadow-white/15 flex justify-start gap-4 rounded-t-lg border-zinc-900 border-b pl-4">
				{values?.map((value) => (
					<CodeTabsTrigger key={value} value={value} />
				))}
			</TabsPrimitive.List>

			{children}
		</TabsPrimitive.Root>
	);
}

export function CodeTabsTrigger({
	className,
	value,
	children,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Tab>) {
	return (
		<TabsPrimitive.Tab
			className={cn(
				"group/tab relative inline-flex cursor-pointer py-2 font-medium text-sm text-zinc-300 transition-colors hover:text-zinc-100 data-active:text-violet-500 data-active:hover:text-violet-500",
				className,
			)}
			value={value}
			{...props}
		>
			{/* Hitbox */}
			<span className="absolute inset-0 top-1/2 left-1/2 h-full w-[calc(100%+1rem)] -translate-x-1/2 -translate-y-1/2" />
			{/* Indicator */}
			<span className="absolute -bottom-px left-0 hidden h-0.5 w-full bg-violet-500 group-data-active/tab:block" />
			{children ? children : value}
		</TabsPrimitive.Tab>
	);
}

export function CodeTabsContent({
	value,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Panel> & {
	value: string;
}) {
	return (
		<TabsPrimitive.Panel
			className="border-zinc-700 border-t"
			value={value}
			{...props}
		/>
	);
}
