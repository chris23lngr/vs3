import { StorageClientDemo } from "@/components/client-demo";

export default function HomePage() {
	return (
		<main className="min-h-svh py-20">
			<div className="mx-auto w-full max-w-3xl px-8">
				<h1 className="font-semibold text-2xl">Storage Demo</h1>
				<StorageClientDemo />
			</div>
		</main>
	);
}
