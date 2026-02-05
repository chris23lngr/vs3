"use client";

import { useUpload } from "vs3/client/react";
import { storageClient } from "@/server/storage/client";

export function StorageClientDemo() {
	const { upload, status, progress, error, data, reset } =
		useUpload(storageClient);

	return (
		<div>
			<input
				onChange={(e) => e.target.files?.[0] && upload({ file: e.target.files[0] })}
				type="file"
			/>

			<div>
				<pre>
					{JSON.stringify(
						{
							status,
							progress,
							error,
							data,
						},
						null,
						2,
					)}
				</pre>
			</div>

			<button onClick={reset} type="button">
				Reset
			</button>
		</div>
	);
}
