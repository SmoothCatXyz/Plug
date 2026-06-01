// Record audio from microphone and transcribe via Whisper API.

export async function startRecording(): Promise<MediaRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  recorder.start();
  return recorder;
}

export async function stopAndTranscribe(
  recorder: MediaRecorder,
  apiKey: string,
  baseURL: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      // Release the microphone track
      recorder.stream.getTracks().forEach((t) => t.stop());

      const audioBlob = new Blob(chunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("model", "whisper-1");

      const endpoint = baseURL.replace(/\/+$/, "") + "/audio/transcriptions";

      fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData
      })
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Whisper API error ${res.status}: ${text}`);
          }
          return res.json() as Promise<{ text?: string }>;
        })
        .then((data) => resolve(data.text ?? ""))
        .catch((err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
    };

    recorder.stop();
  });
}
