<script setup lang="ts">
import { computed, ref } from "vue";
import { useStorageClient } from "./composables/storage-client";

const storageClient = useStorageClient();
const uploadComposable = storageClient.useUpload();
const downloadComposable = storageClient.useDownload();

const selectedFile = ref<File | null>(null);
const downloadKey = ref("");

// biome-ignore lint/correctness/noUnusedVariables: Used in Vue template.
const uploadStateJson = computed(() =>
	JSON.stringify(uploadComposable.state.value, null, 2),
);
// biome-ignore lint/correctness/noUnusedVariables: Used in Vue template.
const downloadStateJson = computed(() =>
	JSON.stringify(downloadComposable.state.value, null, 2),
);

// biome-ignore lint/correctness/noUnusedVariables: Used in Vue template.
function onFileChange(event: Event): void {
	const target = event.target as HTMLInputElement;
	selectedFile.value = target.files?.[0] ?? null;
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Vue template.
async function uploadSelectedFile(): Promise<void> {
	if (!selectedFile.value) {
		return;
	}

	await uploadComposable.upload(selectedFile.value, {
		userId: "demo-user",
	});
}

// biome-ignore lint/correctness/noUnusedVariables: Used in Vue template.
async function previewDownload(): Promise<void> {
	if (!downloadKey.value.trim()) {
		return;
	}

	await downloadComposable.download(downloadKey.value.trim(), {
		mode: "preview",
	});
}
</script>

<template>
  <main class="page">
    <section class="hero">
      <h1>vs3 Vue Example</h1>
      <p>Nuxt 3 + <code>vs3/vue</code> with upload and download composables.</p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Upload</h2>
        <input type="file" @change="onFileChange" />
        <div class="actions">
          <button :disabled="!selectedFile" type="button" @click="uploadSelectedFile">
            Upload
          </button>
          <button type="button" @click="uploadComposable.reset">Reset</button>
        </div>
        <pre>{{ uploadStateJson }}</pre>
      </article>

      <article class="card">
        <h2>Download</h2>
        <input v-model="downloadKey" placeholder="uploads/example.txt" type="text" />
        <div class="actions">
          <button type="button" @click="previewDownload">Preview</button>
          <button type="button" @click="downloadComposable.reset">Reset</button>
        </div>
        <pre>{{ downloadStateJson }}</pre>
      </article>
    </section>
  </main>
</template>

<style scoped>
:root {
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

.page {
  min-height: 100vh;
  padding: 2.5rem 1.5rem 4rem;
  color: #1f2937;
  background:
    radial-gradient(circle at top left, rgba(16, 185, 129, 0.18), transparent 45%),
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.18), transparent 42%),
    linear-gradient(160deg, #f8fafc 0%, #eff6ff 50%, #ecfeff 100%);
}

.hero {
  max-width: 900px;
  margin: 0 auto;
}

.hero h1 {
  margin: 0;
  font-size: clamp(1.6rem, 1.9vw + 1rem, 2.7rem);
}

.hero p {
  margin: 0.75rem 0 0;
  color: #4b5563;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  max-width: 900px;
  margin: 1.5rem auto 0;
}

.card {
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.84);
  padding: 1rem;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.card h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

input,
button {
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

input[type="text"] {
  width: 100%;
}

button {
  cursor: pointer;
  color: #0f172a;
  background: #dbeafe;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

pre {
  overflow: auto;
  margin-top: 0.8rem;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.75rem;
  font-size: 0.75rem;
}
</style>
