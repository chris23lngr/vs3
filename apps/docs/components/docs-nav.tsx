import { cn } from "@/lib/utils";
import { Nav } from "./nav";
import { SidebarTrigger } from "./ui/sidebar";

export function DocsNav({
	className,
	...props
}: React.ComponentProps<typeof Nav>) {
	return (
		<Nav
			className={cn(
				"sticky top-0 z-20 w-full border-border border-b bg-background",
				className,
			)}
			{...props}
		>
			<SidebarTrigger className={"md:hidden"} />
		</Nav>
	);
}
