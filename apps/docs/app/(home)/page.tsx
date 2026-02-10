import {
	BadgeCheckIcon,
	CircleIcon,
	KeyIcon,
	LockIcon,
	ShieldCheckIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import AsciiBucket from "@/components/ascii-bucket";
import { SiteNav } from "@/components/site-nav";
import {
	PageDescription,
	PageTitle,
	SectionDescription,
	SectionTitle,
} from "@/components/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button-v2";
import { SiteConfig } from "@/lib/config";
import CornerLeftLight from "../../public/corner-left-light.svg";
import FooterTrapeze from "../../public/footer-trapeze.svg";
import { FrameworksSection } from "./sections/frameworks";

export default function HomePage() {
	return (
		<main className="">
			<SiteNav items={SiteConfig.nav.items} />

			<section className="relative min-h-[80svh] overflow-hidden pt-0 pb-20">
				<div className="absolute -right-32 -bottom-32 -z-20 xl:-bottom-42">
					<AsciiBucket className="text-[4px] text-zinc-400 leading-none xl:text-[5px]" />
				</div>
				<div className="border-border border-t border-dashed">
					<div className="mx-auto w-full max-w-7xl border-border border-l border-dashed">
						<div className="w-fit border-border border-r border-b border-dashed bg-background p-8">
							<Badge>
								<CircleIcon className="fill-violet-500 text-violet-500" />
								First beta release just went live
							</Badge>
							<PageTitle className="mt-6">
								Stop rebuilding S3 access in every app - we got you covered
							</PageTitle>
						</div>
						<div className="w-fit border-border border-r border-b border-dashed bg-background p-8">
							<PageDescription>
								A complete, opinionated toolkit for S3 storage access including
								authentication, security, and extensibility. Build your own S3 storage
								solution in minutes, not days.
							</PageDescription>
						</div>
						<div className="flex w-fit items-center justify-start gap-4 border-border border-r border-b border-dashed bg-background p-8">
							<Button
								nativeButton={false}
								render={<Link href={SiteConfig.paths.docs}>Get Started</Link>}
								variant="default"
							/>
							<Button
								nativeButton={false}
								render={
									<Link href={SiteConfig.repository.url} target="_blank">
										Star on GitHub
									</Link>
								}
								variant="outline"
							/>
						</div>
					</div>
				</div>
			</section>

			<section
				className="relative border-border border-y bg-zinc-50 py-20 dark:bg-zinc-900"
				id="features"
			>
				<Image
					alt="Frame 2"
					className="absolute top-0 left-0 z-20 -translate-y-full"
					src={CornerLeftLight}
				/>

				<div className="mx-auto w-full max-w-7xl px-8">
					<p className="flex items-center justify-start gap-1.5 font-medium text-sm text-violet-600">
						<LockIcon className="size-3.5" />
						Security
					</p>
					<SectionTitle className="mt-5">
						Secure by Design - extendable to your needs
					</SectionTitle>
					<SectionDescription className="mt-4">
						Presigned URLs, validation, metadata schemas, and Framework integrations –
						everything you need to ship secure S3 access fast.
					</SectionDescription>
				</div>
				<div className="mt-12 border-border border-y border-dashed dark:border-zinc-700">
					<div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-8 sm:grid-cols-2 lg:grid-cols-3">
						<div className="col-span-1 flex flex-col border-border border-x border-b border-dashed bg-white px-6 py-8 sm:col-span-2 lg:col-span-1 lg:border-b-0 dark:border-zinc-700 dark:bg-zinc-950">
							<div className="relative mb-8 before:absolute before:top-0 before:-left-6.25 before:h-full before:w-0.5 before:bg-violet-600 before:content-['']">
								<ShieldCheckIcon className="size-5 text-violet-600" />
							</div>
							<p className="font-semibold text-sm text-zinc-800 dark:text-zinc-50">
								Authentication
							</p>
							<p className="mt-1 max-w-prose text-sm/relaxed text-zinc-500">
								Protect your storage API with authentication using any auth provider of
								your choice. Integrates seamlessly with better-auth, clerk, and more.
							</p>
						</div>
						<div className="flex flex-col border-border border-x border-t border-b border-dashed bg-white px-6 py-8 sm:border-b-0 lg:border-t-0 dark:border-zinc-700 dark:bg-zinc-900">
							<div className="relative mb-8 before:absolute before:top-0 before:-left-6.25 before:h-full before:w-0.5 before:bg-violet-600 before:content-['']">
								<KeyIcon className="size-5 text-violet-600" />
							</div>
							<p className="font-semibold text-sm text-zinc-800 dark:text-zinc-50">
								Encryption
							</p>
							<p className="mt-1 max-w-prose text-sm/relaxed text-zinc-500">
								Add server-side encryption to your storage objects with{" "}
								<span className="rounded-sm border border-border bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800">
									SSE-S3
								</span>
								,{" "}
								<span className="rounded-sm border border-border bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800">
									SSE-KMS
								</span>
								, or{" "}
								<span className="rounded-sm border border-border bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800">
									SSE-C
								</span>
								.
							</p>
						</div>
						<div className="flex flex-col border-border border-x border-t border-dashed bg-white px-6 py-8 lg:border-t-0 dark:border-zinc-700 dark:bg-zinc-900">
							<div className="relative mb-8 before:absolute before:top-0 before:-left-6.25 before:h-full before:w-0.5 before:bg-violet-600 before:content-['']">
								<BadgeCheckIcon className="size-5 text-violet-600" />
							</div>
							<p className="font-semibold text-sm text-zinc-800 dark:text-zinc-50">
								Validation
							</p>
							<p className="mt-1 max-w-prose text-sm/relaxed text-zinc-500">
								Add validation to your storage objects with magic byte detection and
								file type and size checking or your own custom validators.
							</p>
						</div>
					</div>
				</div>
			</section>
			<FrameworksSection />
			<div className="flex translate-y-px items-center justify-center">
				<Image alt="Footer Trapeze" src={FooterTrapeze} />
			</div>
			<footer className="border-border border-t bg-zinc-50">
				<div className="mx-auto w-full max-w-7xl px-8 py-8">
					<div className="flex items-center justify-center gap-4">
						<Link
							className="font-medium text-sm text-zinc-700 hover:text-violet-600"
							href={SiteConfig.paths.home}
						>
							Home
						</Link>
						<span className="text-zinc-500">·</span>
						<Link
							className="font-medium text-sm text-zinc-700 hover:text-violet-600"
							href={SiteConfig.paths.docs}
						>
							Documentation
						</Link>
						<span className="text-zinc-500">·</span>
						<Link
							className="font-medium text-sm text-zinc-700 hover:text-violet-600"
							href={SiteConfig.paths.changelog}
						>
							Changelog
						</Link>
						<span className="text-zinc-500">·</span>
						<Link
							className="font-medium text-sm text-zinc-700 hover:text-violet-600"
							href={SiteConfig.repository.url}
							target="_blank"
						>
							GitHub
						</Link>
					</div>
					<p className="mt-4 text-center text-xs text-zinc-500">
						&copy; {new Date().getFullYear()} {SiteConfig.owner}. All rights reserved.
					</p>
				</div>
			</footer>
		</main>
	);
}
