import { DocsFooter } from "@/components/docs-footer";
import { DocsNav } from "@/components/docs-nav";
import { DocsSidebar } from "@/components/docs-sidebar";
import { SiteNav } from "@/components/site-nav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SiteConfig } from "@/lib/config";
import { source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/docs">) {
	return (
		<SidebarProvider>
			<DocsSidebar tree={source.getPageTree()} />
			<main className="relative min-w-0 flex-1">
				<DocsNav
					className="sticky top-0 z-20 border-border border-b bg-background"
					// items={SiteConfig.nav.items}
				/>
				{children}
				{/* <DocsFooter /> */}
			</main>
		</SidebarProvider>
	);
}
