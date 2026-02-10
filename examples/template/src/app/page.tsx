import { DownloadDemo } from "@/components/download-demo";
import { UploadDemo } from "@/components/upload-demo";

export default function HomePage() {
	return (
		<main className="min-h-svh py-20">
			<section className="mx-auto w-full max-w-5xl px-8">
				<h1 className="font-semibold text-2xl text-zinc-800">Template Example</h1>
				<p className="mt-2 max-w-lg text-sm text-zinc-500">
					This is a template for new examples on using vs3.
				</p>
			</section>
			<section className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-2 gap-8 px-8">
				<div className="rounded-lg border border-border p-8 shadow-xs">
					<p className="font-medium text-sm">Uploading</p>
					<UploadDemo className="mt-6" />
				</div>
				<div className="rounded-lg border border-border p-8 shadow-xs">
					<p className="font-medium text-sm">Downloading</p>
					<DownloadDemo className="mt-6" />
				</div>
			</section>
		</main>
	);
}
