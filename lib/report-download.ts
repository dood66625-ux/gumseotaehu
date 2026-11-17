/** Fetch a bounded PDF; browser save completion is not observable here. */
export async function reportDownload(
  id: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const controller = new AbortController();
  const failure =
    "PDF를 가져오지 못했습니다. 추가 결제 없이 다시 시도하거나 이메일로 운명서를 다시 찾아주세요.";
  if (signal?.aborted) throw Error(failure);
  let cancelRequest: () => void = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    cancelRequest = () => {
      controller.abort();
      reject(Error(failure));
    };
  });
  signal?.addEventListener("abort", cancelRequest, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  let cancelBody: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Error(failure));
    }, 20000);
  });
  async function read() {
    const response = await fetch(
      "/api/reports/" + encodeURIComponent(id) + "/pdf",
      { cache: "no-store", redirect: "error", signal: controller.signal },
    );
    cancelBody = () => {
      void response.body?.cancel().catch(() => {});
    };
    if (controller.signal.aborted) {
      cancelBody();
      throw Error(failure);
    }
    if (!response.ok)
      throw Error(
        response.status === 401
          ? "인증이 만료됐습니다. 이메일로 다시 인증한 뒤 PDF를 받아주세요."
          : failure,
      );
    const maximum = 20 * 1024 * 1024;
    if (
      response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/pdf" ||
      Number(response.headers.get("content-length")) > maximum ||
      !response.body
    )
      throw Error(failure);
    const reader = response.body.getReader();
    cancelBody = () => {
      void reader.cancel().catch(() => {});
    };
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        if (controller.signal.aborted) throw Error(failure);
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw Error(failure);
        if (done) break;
        size += value.byteLength;
        if (size > maximum) throw Error(failure);
        chunks.push(new Uint8Array(value));
      }
      const blob = new Blob(chunks, { type: "application/pdf" });
      if (size < 8 || (await blob.slice(0, 5).text()) !== "%PDF-")
        throw Error(failure);
      return blob;
    } catch {
      void reader.cancel().catch(() => {});
      throw Error(failure);
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return await Promise.race([read(), deadline, cancellation]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("인증이 만료됐습니다.")
    )
      throw error;
    throw Error(failure);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener("abort", cancelRequest);
    controller.abort();
    cancelBody?.();
  }
}
