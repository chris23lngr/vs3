"use client";

import { useState } from "react";
import { storageClient } from "@/server/storage/client";

type DownloadMode = "url" | "direct-download" | "preview";

export function DownloadDemo() {
	const { download, state } = storageClient.useDownload();
	const [mode, setMode] = useState<DownloadMode>("url");

	return (
		<div>
			<form
				action={async (formData) => {
					await download(formData.get("key") as string, { mode });
				}}
				id="download-demo"
			>
				<input className="border" name="key" placeholder="Key" type="text" />

				<select
					onChange={(e) => setMode(e.target.value as DownloadMode)}
					value={mode}
				>
					<option value="url">URL only</option>
					<option value="direct-download">Direct download</option>
					<option value="preview">Preview in new tab</option>
				</select>

				<button type="submit">Download</button>
			</form>

			<div>
				<pre>{JSON.stringify({ state }, null, 2)}</pre>
			</div>
		</div>
	);
}
