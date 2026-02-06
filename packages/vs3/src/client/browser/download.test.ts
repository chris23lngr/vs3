import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	extractFileName,
	openInBrowserTab,
	triggerBrowserDownload,
} from "./download";

describe("extractFileName", () => {
	it("extracts file name from a simple key", () => {
		expect(extractFileName("photo.png")).toBe("photo.png");
	});

	it("extracts file name from a nested key", () => {
		expect(extractFileName("uploads/users/photo.png")).toBe("photo.png");
	});

	it("returns default filename for key with trailing slash", () => {
		expect(extractFileName("uploads/")).toBe("download");
	});

	it("returns default filename for empty key", () => {
		expect(extractFileName("")).toBe("download");
	});

	it("handles key with single segment", () => {
		expect(extractFileName("document.pdf")).toBe("document.pdf");
	});

	it("handles deeply nested key", () => {
		expect(extractFileName("a/b/c/d/file.txt")).toBe("file.txt");
	});
});

describe("triggerBrowserDownload", () => {
	const mockObjectUrl = "blob:http://localhost/fake-object-url";
	let clickSpy: ReturnType<typeof vi.fn>;
	let appendChildSpy: ReturnType<typeof vi.fn>;
	let removeChildSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		clickSpy = vi.fn();
		appendChildSpy = vi.fn();
		removeChildSpy = vi.fn();

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				blob: vi.fn().mockResolvedValue(new Blob(["file content"])),
			}),
		);

		vi.stubGlobal(
			"URL",
			Object.assign(
				{},
				{
					createObjectURL: vi.fn().mockReturnValue(mockObjectUrl),
					revokeObjectURL: vi.fn(),
				},
			),
		);

		vi.stubGlobal("document", {
			createElement: vi.fn().mockReturnValue({
				href: "",
				download: "",
				style: { display: "" },
				click: clickSpy,
			}),
			body: {
				appendChild: appendChildSpy,
				removeChild: removeChildSpy,
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("throws when fetch response is not ok", async () => {
		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 403,
			statusText: "Forbidden",
		});

		await expect(
			triggerBrowserDownload("https://s3.example.com/file", "photo.png"),
		).rejects.toThrow("Download failed: 403 Forbidden");

		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	it("revokes object URL even when DOM operations fail", async () => {
		appendChildSpy.mockImplementation(() => {
			throw new Error("DOM error");
		});

		(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: vi.fn().mockResolvedValue(new Blob(["content"])),
		});

		await expect(
			triggerBrowserDownload("https://s3.example.com/file", "photo.png"),
		).rejects.toThrow("DOM error");

		expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
	});

	it("fetches the presigned URL and triggers anchor click", async () => {
		await triggerBrowserDownload("https://s3.example.com/file", "photo.png");

		expect(fetch).toHaveBeenCalledWith("https://s3.example.com/file", {
			headers: undefined,
		});
		expect(URL.createObjectURL).toHaveBeenCalled();
		expect(clickSpy).toHaveBeenCalled();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
	});

	it("sets the anchor download attribute to the file name", async () => {
		const anchor = {
			href: "",
			download: "",
			style: { display: "" },
			click: clickSpy,
		};
		(document.createElement as ReturnType<typeof vi.fn>).mockReturnValue(anchor);

		await triggerBrowserDownload("https://s3.example.com/file", "report.pdf");

		expect(anchor.download).toBe("report.pdf");
		expect(anchor.href).toBe(mockObjectUrl);
	});

	it("passes download headers to fetch", async () => {
		const headers = { "x-amz-server-side-encryption": "AES256" };

		await triggerBrowserDownload(
			"https://s3.example.com/file",
			"photo.png",
			headers,
		);

		expect(fetch).toHaveBeenCalledWith("https://s3.example.com/file", {
			headers,
		});
	});

	it("cleans up the anchor element after click", async () => {
		await triggerBrowserDownload("https://s3.example.com/file", "photo.png");

		expect(appendChildSpy).toHaveBeenCalled();
		expect(removeChildSpy).toHaveBeenCalled();
	});
});

describe("openInBrowserTab", () => {
	beforeEach(() => {
		vi.stubGlobal("window", {
			open: vi.fn(),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("opens the URL in a new tab with security attributes", () => {
		openInBrowserTab("https://s3.example.com/file");

		expect(window.open).toHaveBeenCalledWith(
			"https://s3.example.com/file",
			"_blank",
			"noopener,noreferrer",
		);
	});
});
