import { findNeighbour } from "fumadocs-core/page-tree";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LLMCopyButton, ViewOptions } from "@/components/ai/page-actions";
import { DocsToc } from "@/components/docs-toc";
import { PageDescription, PageTitle } from "@/components/typography";
import { Button } from "@/components/ui/button-v2";
import { SiteConfig } from "@/lib/config";
import { source } from "@/lib/source";
import { components } from "@/mdx-components";

export const revalidate = false;
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(props: {
	params: Promise<{ slug: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);

	if (!page) {
		notFound();
	}

	const doc = page.data;

	if (!doc.title || !doc.description) {
		notFound();
	}

	return {
		title: doc.title,
		description: doc.description,
		openGraph: {
			title: doc.title,
			description: doc.description,
			type: "article",
			images: [
				{
					url: `/og?title=${encodeURIComponent(
						doc.title,
					)}&description=${encodeURIComponent(doc.description)}`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: doc.title,
			description: doc.description,
			images: [
				{
					url: `/og?title=${encodeURIComponent(
						doc.title,
					)}&description=${encodeURIComponent(doc.description)}`,
				},
			],
			creator: "@shadcn",
		},
	};
}

export default async function Page(props: {
	params: Promise<{ slug: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) {
		notFound();
	}

	const doc = page.data;
	const MDX = doc.body;
	const isChangelog = params.slug?.[0] === "changelog";
	const neighbours = isChangelog
		? { previous: null, next: null }
		: findNeighbour(source.pageTree, page.url);

	return (
		<div
			className="flex scroll-mt-24 items-stretch pb-8 text-[1.05rem] sm:text-[15px] xl:w-full"
			data-slot="docs"
		>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="h-(--top-spacing) shrink-0" />
				<div className="mx-auto flex w-full min-w-0 max-w-[40rem] flex-1 flex-col gap-6 px-4 py-6 text-neutral-800 lg:py-8 dark:text-neutral-300">
					<div className="flex flex-col gap-2">
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between md:items-start">
								<PageTitle className="scroll-m-24">{doc.title}</PageTitle>
								<div className="docs-nav hidden items-center gap-2 md:flex">
									<div className="ml-auto flex gap-2">
										<LLMCopyButton markdownUrl={`${page.url}.mdx`} />
										<ViewOptions
											githubUrl={`https://github.com/${SiteConfig.repository.owner}/${SiteConfig.repository.name}/blob/${SiteConfig.repository.defaultBranch}/docs/content/docs/${page.path}`}
											// update it to match your repo
											markdownUrl={`${page.url}.mdx`}
										/>
									</div>
								</div>
							</div>
							{doc.description && <PageDescription>{doc.description}</PageDescription>}
						</div>
					</div>
					<div className="flex-1 pb-16 *:data-[slot=alert]:first:mt-0 sm:pb-0">
						<MDX components={components} />
					</div>
					<div className="grid grid-cols-2 gap-8">
						<div className="flex items-start justify-start">
							{neighbours.previous && (
								<Button
									nativeButton={false}
									render={
										<Link href={neighbours.previous.url}>
											<ArrowLeftIcon /> {neighbours.previous.name}
										</Link>
									}
									variant={"outline"}
								/>
							)}
						</div>
						<div className="flex items-start justify-end">
							{neighbours.next && (
								<Button
									nativeButton={false}
									render={
										<Link href={neighbours.next.url}>
											{neighbours.next.name}
											<ArrowRightIcon />
										</Link>
									}
									variant={"outline"}
								/>
							)}
						</div>
					</div>
				</div>
			</div>
			<div className="sticky top-24 hidden h-[calc(100svh-var(--header-height))] w-72 overflow-y-auto xl:block">
				{doc.toc?.length ? (
					<div className="no-scrollbar flex flex-col gap-8 overflow-y-auto px-8">
						<DocsToc toc={doc.toc} />
					</div>
				) : null}
			</div>
		</div>
	);
}
