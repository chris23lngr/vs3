import { BoxesIcon, ChevronRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SectionDescription, SectionTitle } from "@/components/typography";
import BetterAuthLogo from "@/public/logos/better-auth.svg";
import NextJsLogo from "@/public/logos/next-js.svg";
import ReactLogo from "@/public/logos/react.svg";
import VueLogo from "@/public/logos/vue.svg";

export function FrameworksSection() {
	return (
		<section className="py-32" id="frameworks">
			<div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-16 px-8 lg:grid-cols-2">
				<div>
					<p className="flex items-center justify-start gap-1.5 font-medium text-sm text-violet-600">
						<BoxesIcon className="size-3.5" />
						Framework Agnostic
					</p>
					<SectionTitle className="mt-5">
						No need to change your stack - vS3 adapts to your framework.
					</SectionTitle>
					<SectionDescription className="mt-4">
						vS3 was built to be framework-agnostic, so you can use it with any
						framework you want. We provide built-in support for certain frameworks,
						but you can use it with the framework of your choice.
					</SectionDescription>
					<div className="mt-12 divide-y divide-border">
						<div className="relative py-4 transition-opacity hover:opacity-80">
							<Link
								className="flex items-center justify-start gap-1.5 font-medium text-sm text-violet-600"
								href={"/docs/integrations/next-js"}
							>
								<span className="absolute inset-0 h-full w-full" />
								Next.js
								<ChevronRightIcon className="size-3.5 shrink-0" />
							</Link>
							<span className="mt-1 block text-muted-foreground text-xs">
								React framework for building full-stack web applications.
							</span>
						</div>
						<div className="relative py-4 transition-opacity hover:opacity-80">
							<Link
								className="flex items-center justify-start gap-1.5 font-medium text-sm text-violet-600"
								href={"/docs/security/auth#better-auth"}
							>
								<span className="absolute inset-0 h-full w-full" />
								better-auth
								<ChevronRightIcon className="size-3.5 shrink-0" />
							</Link>
							<span className="mt-1 block text-muted-foreground text-xs">
								The most comprehensive authentication framework for TypeScript.
							</span>
						</div>
					</div>
				</div>
				<div className="flex items-center justify-center">
					<div className="grid w-full max-w-96 grid-cols-3 grid-rows-3 divide-x divide-y divide-dashed divide-zinc-200 border-zinc-200 border-t border-l border-dashed [&_div]:aspect-square [&_div]:last:border-r [&_div]:last:border-b [&_div]:last:border-dashed">
						<div className="flex items-center justify-center p-6">
							<Image
								alt="Next.js"
								className="h-8 w-auto max-w-full"
								src={NextJsLogo}
							/>
						</div>
						<div className="flex items-center justify-center p-6">
							<Image
								alt="Better Auth"
								className="h-8 w-auto max-w-full"
								src={BetterAuthLogo}
							/>
						</div>
						<div className="flex items-center justify-center p-6">
							<Image alt="React" className="h-8 w-auto max-w-full" src={ReactLogo} />
						</div>
						<div className="flex items-center justify-center p-6">
							<Image alt="Vue" className="h-8 w-auto max-w-full" src={VueLogo} />
						</div>
						{Array.from({ length: 5 }).map((_, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: Just a placeholder
							<div className="bg-zinc-50" key={index} />
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
