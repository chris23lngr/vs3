"use client";

import { storageClient } from "@/server/storage/client";
import { cn } from "@/utils/cn";

export function DownloadDemo({
	className,
	...props
}: React.ComponentProps<"div">) {
	const { download, state } = storageClient.useDownload();

	return (
		<div className={cn("", className)} {...props}>
			<form
				action={async (formData) => {
					await download(formData.get("key") as string, { mode: "preview" });
				}}
				className="flex w-full items-center justify-start gap-2"
			>
				<input
					className="grow rounded-md border border-zinc-200 p-2 text-sm shadow-xs"
					name="key"
					placeholder="Key"
					type="text"
				/>
				<button
					className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
					type="submit"
				>
					Download
				</button>
			</form>

			<div className="mt-6 grid grid-cols-2 gap-6">
				<div className="space-y-1">
					<p className="font-medium text-xs text-zinc-700">Status</p>
					<p>{state.status}</p>
				</div>
				<div className="col-span-2 space-y-1">
					<p className="font-medium text-xs text-zinc-700">Error</p>
					{state.error ? (
						<div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm shadow-red-100 shadow-xs">
							<p className="font-medium text-red-800">
								{state.error.origin}: {state.error.code}
							</p>
							<p className="mt-2">{state.error.message}</p>
						</div>
					) : (
						<p>None</p>
					)}
				</div>
				<div className="col-span-2 space-y-1">
					<p className="font-medium text-xs text-zinc-700">Data</p>
					{state.data ? (
						<div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm shadow-xs">
							{Object.entries(state.data).map(([key, value]) => (
								<div className="space-y-1" key={key}>
									<p className="font-medium text-zinc-700">{key}: </p>
									<p className="font-normal">
										{typeof value === "string" ? value : JSON.stringify(value)}
									</p>
								</div>
							))}
						</div>
					) : (
						<p>null</p>
					)}
				</div>
			</div>
		</div>
	);
}
