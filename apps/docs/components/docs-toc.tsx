"use client";

import type { TableOfContents } from "fumadocs-core/toc";
import { ListEndIcon } from "lucide-react";
import Link from "next/link";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface HeadingRef {
	url: string;
	element: HTMLElement;
}

function collectHeadings(toc: TableOfContents): HeadingRef[] {
	const headings: HeadingRef[] = [];
	for (const item of toc) {
		const el = document.getElementById(item.url.slice(1));
		if (el) headings.push({ url: item.url, element: el });
	}
	return headings;
}

function computeActiveUrls(headings: HeadingRef[]): Set<string> {
	const scrollY = window.scrollY;
	const viewportBottom = scrollY + window.innerHeight;
	const topOffset = 100;
	const active = new Set<string>();

	for (let i = 0; i < headings.length; i++) {
		const { url, element } = headings[i];
		const headingTop = element.getBoundingClientRect().top + scrollY;
		const nextEl = headings[i + 1]?.element;
		const sectionEnd = nextEl
			? nextEl.getBoundingClientRect().top + scrollY
			: document.documentElement.scrollHeight;

		if (headingTop < viewportBottom && sectionEnd > scrollY + topOffset) {
			active.add(url);
		}
	}

	return active;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}

function useActiveItems(toc: TableOfContents): Set<string> {
	const [active, setActive] = useState<Set<string>>(() => new Set());

	useEffect(() => {
		if (toc.length === 0) return;
		const headings = collectHeadings(toc);
		if (headings.length === 0) return;

		function update(): void {
			const next = computeActiveUrls(headings);
			setActive((prev) => (setsEqual(prev, next) ? prev : next));
		}

		update();
		window.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update, { passive: true });

		return () => {
			window.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
		};
	}, [toc]);

	return active;
}

function computeBaseDepth(toc: TableOfContents): number {
	let min = Number.POSITIVE_INFINITY;
	for (const item of toc) {
		if (item.depth < min) min = item.depth;
	}
	return min;
}

export function DocsToc({ toc }: { toc: TableOfContents }): ReactElement {
	const activeItems = useActiveItems(toc);
	const baseDepth = useMemo(() => computeBaseDepth(toc), [toc]);

	return (
		<nav aria-label="Table of contents">
			<div className="mb-4 flex items-center gap-2 font-medium text-xs text-zinc-500">
				<ListEndIcon className="size-3.5" />
				<p>On this page</p>
			</div>
			<ul className="flex flex-col">
				{toc.map((item) => (
					<li key={item.url}>
						<Link
							className={cn(
								"line-clamp-2 block border-l-2 py-1.5 text-sm transition-colors",
								activeItems.has(item.url)
									? "border-blue-500 text-blue-600 dark:text-blue-400"
									: "border-border text-muted-foreground hover:text-foreground",
							)}
							href={item.url}
							style={{
								paddingLeft: `${(item.depth - baseDepth + 1) * 16 - 2}px`,
							}}
						>
							<span className="line-clamp-2">{item.title}</span>
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
