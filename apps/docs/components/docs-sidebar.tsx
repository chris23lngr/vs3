"use client";

import { BlocksIcon, BookmarkIcon, DownloadIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { source } from "@/lib/source";
import Logo from "@/public/vS3-logo.svg";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "./ui/sidebar";

const TOP_LEVEL_SECTIONS = [
	{
		name: "Introduction",
		href: "/docs",
		icon: BlocksIcon,
	},
	{
		name: "Installation",
		href: "/docs/installation",
		icon: DownloadIcon,
	},
	{
		name: "Concepts",
		href: "/docs/concepts",
		icon: BookmarkIcon,
	},
];

export function DocsSidebar({
	tree,
	...props
}: React.ComponentProps<typeof Sidebar> & { tree: typeof source.pageTree }) {
	const pathname = usePathname();

	return (
		<Sidebar
			className="sticky top-0 h-svh border-border border-r border-dashed bg-transparent"
			collapsible="none"
			{...props}
		>
			<SidebarHeader className="flex h-(--header-height) flex-row items-center justify-center border-b">
				<Image alt="vS3 Logo" className="h-8 w-auto" src={Logo} />
				<Badge>Docs</Badge>
			</SidebarHeader>
			<SidebarContent className="">
				<SidebarGroup className="pt-6">
					<SidebarGroupContent>
						<SidebarMenu className="space-y-0.5">
							{TOP_LEVEL_SECTIONS.map(({ name, href, icon: Icon }) => (
								<SidebarMenuItem key={name}>
									<SidebarMenuButton
										className="group/menu-button relative font-medium text-sm text-zinc-600 dark:text-zinc-200"
										isActive={
											href === "/docs" ? pathname === href : pathname.startsWith(href)
										}
										render={
											<Link href={href}>
												{Icon && (
													<Icon className="size-3.5 fill-zinc-100 text-zinc-500 group-data-active/menu-button:fill-violet-200 group-data-active/menu-button:text-violet-500 dark:fill-zinc-700 dark:text-zinc-400" />
												)}
												<span className="absolute inset-0 flex w-(--sidebar-menu-width) bg-transparent" />
												{name}
											</Link>
										}
									/>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<Separator className={"my-2"} />
				<SidebarGroup>
					<SidebarGroupContent className="space-y-1">
						{tree.children.map((child) => {
							if (child.type === "page") {
								return (
									<SidebarMenuItem key={child.$id}>
										<SidebarMenuButton
											render={<Link href={child.url}>{child.name}</Link>}
										/>
									</SidebarMenuItem>
								);
							}

							if (child.type === "folder") {
								return (
									<SidebarMenuItem key={child.$id}>
										<SidebarMenuButton className={"data-active:text-violet-500"}>
											<Link href={"#"}>{child.name}</Link>
										</SidebarMenuButton>
										<SidebarMenuSub key={child.$id}>
											{child.children.map((child) => {
												if (child.type === "page") {
													return (
														<SidebarMenuSubItem key={child.$id}>
															<SidebarMenuSubButton
																isActive={pathname.startsWith(child.url)}
																render={<Link href={child.url}>{child.name}</Link>}
															/>
														</SidebarMenuSubItem>
													);
												}

												return null;
											})}
										</SidebarMenuSub>
									</SidebarMenuItem>
								);
							}

							return null;
						})}
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
