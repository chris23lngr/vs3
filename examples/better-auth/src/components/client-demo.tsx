"use client";

import { storageClient } from "@/server/storage/client";

export function StorageClientDemo() {
	const { upload, state, reset } = storageClient.useUpload();

	return (
		<div>
			<input
				onChange={(e) =>
					e.target.files?.[0] &&
					upload(e.target.files[0], {
						userId: "sdf",
					})
				}
				type="file"
			/>

			<div>
				<pre>
					{JSON.stringify(
						{
							state,
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
