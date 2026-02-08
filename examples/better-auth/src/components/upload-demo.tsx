"use client";

import { storageClient } from "@/server/storage/client";
import { cn } from "@/utils/cn";

export function UploadDemo({
	className,
	...props
}: React.ComponentProps<"div">) {
	const { upload, state } = storageClient.useUpload();

	return (
		<div className={cn("", className)} {...props}>
			<input
				className="w-full rounded-md border border-zinc-200 p-2 text-sm shadow-xs"
				onChange={(e) => {
					e.target.files?.[0] &&
						upload(e.target.files[0], {
							userId: "sdf",
						});
				}}
				type="file"
			/>
			<div className="mt-6 grid grid-cols-2 gap-6">
				<div className="space-y-1">
					<p className="font-medium text-xs text-zinc-700">Progress</p>
					<p>{state.progress}%</p>
				</div>
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
						<div className="space-y-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm shadow-xs">
							{Object.entries(state.data).map(([key, value]) => (
								<div className="space-y-1" key={key}>
									<p className="font-medium text-zinc-700">{key}: </p>
									<p className="break-all font-normal">
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
