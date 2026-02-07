import { ArrowRightIcon, PackageIcon } from "lucide-react";
import Link from "next/link";
import AsciiBucket from "@/components/ascii-bucket";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
	return (
		<main>
			<section className="relative min-h-svh overflow-hidden py-20" id="hero">
				<div className="mx-auto w-full max-w-7xl px-8">
					<div className="mb-8 grid grid-cols-2 gap-4">
						<div className="hidden md:block">
							<span className="flex items-center gap-2">
								<PackageIcon className="size-4 text-blue-600" />
								<span className="font-mono text-sm">npm install vs3</span>
							</span>
						</div>
						<div>
							<Link
								className="block font-mono text-sm underline underline-offset-4"
								href="/docs"
							>
								Documentation
							</Link>
						</div>
						<div className="md:col-start-2">
							<Link
								className="block font-mono text-sm underline underline-offset-4"
								href="/docs"
							>
								GitHub
							</Link>
						</div>
					</div>
					<h1 className="max-w-3xl font-semibold text-3xl leading-[1.3] md:text-4xl">
						Typesafe S3 Uploads Without the Glue Code. Built for the Web.
					</h1>
					<p className="mt-6 max-w-xl text-base text-muted-foreground">
						Presigned URLs, validation, metadata schemas, and Framework integrations –
						everything you need to ship secure S3 access fast.
					</p>
					<div className="mt-12 flex flex-col items-center justify-start gap-2 sm:flex-row">
						<Button className={"w-full px-4 sm:w-auto"} size={"lg"}>
							Get Started
						</Button>
						<Button className={"w-full px-4 sm:w-auto"} size={"lg"} variant={"ghost"}>
							View Documentation <ArrowRightIcon />
						</Button>
					</div>
				</div>
				{/* <div className="absolute bottom-0 left-0 -z-20 size-[200%] -translate-x-1/2 translate-y-1/2 bg-radial from-blue-500 to-blue-500/0 opacity-20" /> */}
				<div
					className={cn(
						"absolute -z-10 w-fit **:leading-none",
						// sm
						"-right-64 -bottom-1/3 text-[4px]",
						"sm:-right-80 sm:text-[5px]",
						"lg:-right-96 lg:-bottom-72 lg:text-[6px]",
					)}
				>
					<AsciiBucket />
				</div>
			</section>
		</main>
	);
}
