import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import KnowledgeDocumentUpload from "./knowledge-document-upload";
import { addKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";
import { simulateUploadStep } from "@/lib/upload-progress";
import { simulateParseStep } from "@/lib/parse-progress";

vi.mock("@/lib/knowledge-documents", () => ({
  addKnowledgeBaseDocument: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

// E05-S017: auto-resolves instantly by default (a bare vi.fn() with no
// configured return value resolves `undefined` synchronously-enough for
// RTL's own waitFor/findBy polling), so every pre-existing test above
// this story stays exactly as fast/deterministic as before — same
// "mock the whole delay-having module so consuming-component tests are
// unaffected by its real timing" idiom message-thread.test.tsx already
// established for generation-status.ts/file-processing.ts.
vi.mock("@/lib/upload-progress", () => ({
  simulateUploadStep: vi.fn().mockResolvedValue(undefined),
}));

// E05-S018: same auto-resolving wholesale-mock idiom as upload-progress
// above, for the exact same reason — every pre-existing test (including
// E05-S017's own) stays fast/deterministic and unaffected.
vi.mock("@/lib/parse-progress", () => ({
  simulateParseStep: vi.fn().mockResolvedValue(undefined),
}));

const mockedAddKnowledgeBaseDocument = vi.mocked(addKnowledgeBaseDocument);
const mockedTrackEvent = vi.mocked(trackEvent);
const mockedSimulateUploadStep = vi.mocked(simulateUploadStep);
const mockedSimulateParseStep = vi.mocked(simulateParseStep);

function sampleFile(name = "保固條款.pdf", byteLength = 500) {
  return new File([new Uint8Array(byteLength)], name, { type: "application/pdf" });
}

// jsdom's File constructor has no option for webkitRelativePath — real
// browsers set it automatically for files that came from a
// webkitdirectory picker. Object.defineProperty mirrors that after the
// fact for tests, same as how a real folder-selected File would arrive.
function sampleFolderFile(relativePath: string, byteLength = 500) {
  const name = relativePath.split("/").pop() ?? relativePath;
  const file = new File([new Uint8Array(byteLength)], name, { type: "application/pdf" });
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath, configurable: true });
  return file;
}

function sampleDocument(overrides: Partial<{ id: string; knowledgeBaseId: string; name: string; sizeBytes: number; uploadedAt: string }> = {}) {
  return {
    id: "doc1",
    knowledgeBaseId: "kb1",
    name: "a.pdf",
    sizeBytes: 500,
    uploadedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedAddKnowledgeBaseDocument.mockReset();
  mockedTrackEvent.mockReset();
  mockedSimulateUploadStep.mockReset();
  mockedSimulateUploadStep.mockResolvedValue(undefined);
  mockedSimulateParseStep.mockReset();
  mockedSimulateParseStep.mockResolvedValue(undefined);
});

describe("KnowledgeDocumentUpload (E05-S011 single-file base)", () => {
  it("does not show a 上傳 button before any file is selected", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "上傳" })).not.toBeInTheDocument();
  });

  it("shows the selected file's name and formatted size in a list item, plus a 上傳 button, once a file is picked", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("保固條款.pdf", 500)] } });

    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("保固條款.pdf(500 B)");
    expect(screen.getByRole("button", { name: "上傳" })).toBeInTheDocument();
  });

  it("uploads the selected file's name and size, and clears the selection and notifies the parent on success", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: sampleDocument({ name: "保固條款.pdf", sizeBytes: 500 }) });
    const onUploaded = vi.fn();

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={onUploaded} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("保固條款.pdf", 500)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "保固條款.pdf", 500);
    expect(screen.queryByRole("button", { name: "上傳" })).not.toBeInTheDocument();
  });

  it("shows a distinct error alert and keeps the file selected (not cleared) when the upload fails", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    const onUploaded = vi.fn();

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={onUploaded} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("保固條款.pdf", 500)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("1 個檔案上傳失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "上傳" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("保固條款.pdf");
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("disables the input, remove button, and 上傳 button while an upload is in flight, preventing a double submit", async () => {
    let resolveUpload!: (result: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void;
    mockedAddKnowledgeBaseDocument.mockReturnValueOnce(new Promise((resolve) => (resolveUpload = resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "上傳" })).toBeDisabled());
    expect(screen.getByLabelText("上傳文件")).toBeDisabled();
    expect(screen.getByRole("button", { name: /移除/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    resolveUpload({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledTimes(1));
  });

  it("emits attempt and success telemetry sharing the same correlation id, including sizeBytes but NEVER the file name", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: sampleDocument({ name: "機密專案報告.pdf", sizeBytes: 500 }) });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("機密專案報告.pdf", 500)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_upload_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_upload_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    expect(attempt[1].properties).toMatchObject({ knowledgeBaseId: "kb1", sizeBytes: 500 });
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("機密專案報告");
    }
  });

  it("emits failure telemetry with the error code when the upload fails", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_document_upload_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("KnowledgeDocumentUpload (E05-S012 multi-file)", () => {
  it("accumulates files across multiple selections instead of replacing the previous ones", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("第一份.pdf", 100)] } });
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("第二份.pdf", 200)] } });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("第一份.pdf");
    expect(items[1]).toHaveTextContent("第二份.pdf");
  });

  it("selecting multiple files in one dialog invocation adds all of them", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("a.pdf", 100), sampleFile("b.pdf", 200), sampleFile("c.pdf", 300)] },
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("removes only the targeted file when its own 移除 button is clicked, leaving the others", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("保留一.pdf", 100), sampleFile("移除我.pdf", 200), sampleFile("保留二.pdf", 300)] },
    });

    fireEvent.click(screen.getByRole("button", { name: "移除 移除我.pdf" }));

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.queryByText(/移除我\.pdf/)).not.toBeInTheDocument();
    expect(items[0]).toHaveTextContent("保留一.pdf");
    expect(items[1]).toHaveTextContent("保留二.pdf");
  });

  it("hides the file list and 上傳 button entirely once every selected file is removed", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("唯一.pdf", 100)] } });

    fireEvent.click(screen.getByRole("button", { name: "移除 唯一.pdf" }));

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上傳" })).not.toBeInTheDocument();
  });

  it("uploads every selected file sequentially, one addKnowledgeBaseDocument call per file, in selection order", async () => {
    const calls: string[] = [];
    mockedAddKnowledgeBaseDocument.mockImplementation(async (_kbId, name) => {
      calls.push(name);
      return { ok: true, value: sampleDocument({ name }) };
    });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("第一.pdf", 100), sampleFile("第二.pdf", 200), sampleFile("第三.pdf", 300)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledTimes(3));
    expect(calls).toEqual(["第一.pdf", "第二.pdf", "第三.pdf"]);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("on partial failure, keeps only the failed files selected and reports how many failed, while still refreshing the list for the successful ones", async () => {
    mockedAddKnowledgeBaseDocument.mockImplementation(async (_kbId, name) => {
      if (name === "會失敗.pdf") return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } };
      return { ok: true, value: sampleDocument({ name }) };
    });
    const onUploaded = vi.fn();

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={onUploaded} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("會成功.pdf", 100), sampleFile("會失敗.pdf", 200)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("1 個檔案上傳失敗，請稍後再試。");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("會失敗.pdf");
    expect(screen.queryByText(/會成功\.pdf/)).not.toBeInTheDocument();
    // At least one file succeeded, so the parent's list should still refresh.
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("when every file in the batch fails, does not call onUploaded at all", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    const onUploaded = vi.fn();

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={onUploaded} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("a.pdf", 100), sampleFile("b.pdf", 200)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("2 個檔案上傳失敗，請稍後再試。");
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("emits one attempt/success telemetry pair per file in the batch, not one for the whole batch", async () => {
    mockedAddKnowledgeBaseDocument.mockImplementation(async (_kbId, name) => ({ ok: true, value: sampleDocument({ name }) }));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("a.pdf", 100), sampleFile("b.pdf", 200)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledTimes(2));

    const attemptCalls = mockedTrackEvent.mock.calls.filter((call) => call[0] === "knowledge_base_document_upload_attempt");
    const successCalls = mockedTrackEvent.mock.calls.filter((call) => call[0] === "knowledge_base_document_upload_success");
    expect(attemptCalls).toHaveLength(2);
    expect(successCalls).toHaveLength(2);
    // Each file's attempt/success pair has its own distinct correlation id.
    const attemptIds = attemptCalls.map((call) => (call[1] as { correlationId: string }).correlationId);
    expect(new Set(attemptIds).size).toBe(2);
  });

  it("each 移除 button's accessible name includes its own file name, disambiguating multiple items", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("甲.pdf", 100), sampleFile("乙.pdf", 200)] },
    });

    const listContainer = screen.getByRole("list");
    expect(within(listContainer).getByRole("button", { name: "移除 甲.pdf" })).toBeInTheDocument();
    expect(within(listContainer).getByRole("button", { name: "移除 乙.pdf" })).toBeInTheDocument();
  });
});

describe("KnowledgeDocumentUpload (E05-S013 folder upload)", () => {
  it("shows a separate 上傳資料夾 input, distinct from 上傳文件", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    expect(screen.getByLabelText("上傳文件")).toBeInTheDocument();
    expect(screen.getByLabelText("上傳資料夾")).toBeInTheDocument();
    expect(screen.getByLabelText("上傳文件")).not.toBe(screen.getByLabelText("上傳資料夾"));
  });

  it("sets webkitdirectory on the folder input's underlying DOM node", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    const folderInput = screen.getByLabelText("上傳資料夾") as HTMLInputElement;
    expect(folderInput.webkitdirectory).toBe(true);
    expect(screen.getByLabelText("上傳文件")).not.toHaveProperty("webkitdirectory", true);
  });

  it("selecting files via the folder input adds them to the same preview list as 上傳文件", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("單獨檔案.pdf", 100)] } });
    fireEvent.change(screen.getByLabelText("上傳資料夾"), {
      target: { files: [sampleFolderFile("我的資料夾/報告.pdf", 200)] },
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the folder-relative path (not just the bare file name) for a folder-selected file", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳資料夾"), {
      target: { files: [sampleFolderFile("報告資料夾/2026/摘要.pdf", 300)] },
    });

    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("報告資料夾/2026/摘要.pdf");
  });

  it("uploads a folder-selected file using its relative path as the document name, not just the bare file name", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: sampleDocument({ name: "報告資料夾/摘要.pdf" }) });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳資料夾"), {
      target: { files: [sampleFolderFile("報告資料夾/摘要.pdf", 300)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalled());
    expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "報告資料夾/摘要.pdf", 300);
  });

  it("a regularly-selected file (no webkitRelativePath) still uploads under its plain name, unaffected by this story", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: true, value: sampleDocument({ name: "保固條款.pdf" }) });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile("保固條款.pdf", 500)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalled());
    expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledWith("kb1", "保固條款.pdf", 500);
  });

  it("disambiguates two same-named files from different subfolders in both the preview and their 移除 buttons", () => {
    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("上傳資料夾"), {
      target: { files: [sampleFolderFile("甲資料夾/report.pdf", 100), sampleFolderFile("乙資料夾/report.pdf", 200)] },
    });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("甲資料夾/report.pdf");
    expect(items[1]).toHaveTextContent("乙資料夾/report.pdf");
    expect(screen.getByRole("button", { name: "移除 甲資料夾/report.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除 乙資料夾/report.pdf" })).toBeInTheDocument();
  });

  it("disables the folder input while an upload is in flight, same as the regular file input", async () => {
    let resolveUpload!: (result: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void;
    mockedAddKnowledgeBaseDocument.mockReturnValueOnce(new Promise((resolve) => (resolveUpload = resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳資料夾"), { target: { files: [sampleFolderFile("a/b.pdf", 100)] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(screen.getByLabelText("上傳資料夾")).toBeDisabled());

    resolveUpload({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(mockedAddKnowledgeBaseDocument).toHaveBeenCalledTimes(1));
  });
});

describe("KnowledgeDocumentUpload (E05-S017 upload progress)", () => {
  it("shows 第 1 / 1 筆 for a single-file upload before it settles", async () => {
    let resolveUpload!: (result: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void;
    mockedAddKnowledgeBaseDocument.mockReturnValueOnce(new Promise((resolve) => (resolveUpload = resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    expect(await screen.findByRole("status")).toHaveTextContent("上傳中…（第 1 / 1 筆）");

    resolveUpload({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("advances the progress count from 1/3 to 2/3 to 3/3 only as each file's own upload resolves, then clears it", async () => {
    const resolvers: Array<(result: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void> = [];
    mockedAddKnowledgeBaseDocument.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("一.pdf", 100), sampleFile("二.pdf", 200), sampleFile("三.pdf", 300)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("第 1 / 3 筆"));

    resolvers[0]!({ ok: true, value: sampleDocument({ name: "一.pdf" }) });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("第 2 / 3 筆"));

    resolvers[1]!({ ok: true, value: sampleDocument({ name: "二.pdf" }) });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("第 3 / 3 筆"));

    resolvers[2]!({ ok: true, value: sampleDocument({ name: "三.pdf" }) });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("still advances the progress count on a file that fails, not just successful ones", async () => {
    const resolvers: Array<(result: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void> = [];
    mockedAddKnowledgeBaseDocument.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("會失敗.pdf", 100), sampleFile("會成功.pdf", 200)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("第 1 / 2 筆"));

    resolvers[0]!({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("第 2 / 2 筆"));

    resolvers[1]!({ ok: true, value: sampleDocument({ name: "會成功.pdf" }) });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("calls simulateUploadStep exactly once per file, after that file's own result is known", async () => {
    const order: string[] = [];
    mockedAddKnowledgeBaseDocument.mockImplementation(async (_kbId, name) => {
      order.push(`upload:${name}`);
      return { ok: true, value: sampleDocument({ name }) };
    });
    mockedSimulateUploadStep.mockImplementation(async () => {
      order.push("delay");
    });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("一.pdf", 100), sampleFile("二.pdf", 200)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedSimulateUploadStep).toHaveBeenCalledTimes(2));
    expect(order).toEqual(["upload:一.pdf", "delay", "upload:二.pdf", "delay"]);
  });
});

describe("KnowledgeDocumentUpload (E05-S018 parse progress)", () => {
  it("shows a 上傳中 phase then a 解析中 phase, in order, for a single successful file", async () => {
    let resolveUpload!: (result: Awaited<ReturnType<typeof addKnowledgeBaseDocument>>) => void;
    let resolveParse!: () => void;
    mockedAddKnowledgeBaseDocument.mockReturnValueOnce(new Promise((resolve) => (resolveUpload = resolve)));
    mockedSimulateParseStep.mockReturnValueOnce(new Promise((resolve) => (resolveParse = resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    expect(await screen.findByRole("status")).toHaveTextContent("上傳中…（第 1 / 1 筆）");

    resolveUpload({ ok: true, value: sampleDocument() });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("解析中…（第 1 / 1 筆）"));

    resolveParse();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("skips the 解析中 phase entirely for a file that fails to upload — nothing was recorded to parse", async () => {
    mockedAddKnowledgeBaseDocument.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), { target: { files: [sampleFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await screen.findByRole("alert");
    expect(mockedSimulateParseStep).not.toHaveBeenCalled();
  });

  it("still shows a 解析中 phase for every successful file in a batch, even one that follows a failed file", async () => {
    mockedAddKnowledgeBaseDocument.mockImplementation(async (_kbId, name) => {
      if (name === "會失敗.pdf") return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } };
      return { ok: true, value: sampleDocument({ name }) };
    });
    let resolveParse!: () => void;
    mockedSimulateParseStep.mockReturnValueOnce(new Promise((resolve) => (resolveParse = resolve)));

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("會失敗.pdf", 100), sampleFile("會成功.pdf", 200)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("解析中…（第 2 / 2 筆）"));
    resolveParse();
    await screen.findByRole("alert");
  });

  it("calls simulateParseStep exactly once per successful file, after simulateUploadStep for that same file", async () => {
    const order: string[] = [];
    mockedAddKnowledgeBaseDocument.mockImplementation(async (_kbId, name) => ({ ok: true, value: sampleDocument({ name }) }));
    mockedSimulateUploadStep.mockImplementation(async () => {
      order.push("upload-step");
    });
    mockedSimulateParseStep.mockImplementation(async () => {
      order.push("parse-step");
    });

    render(<KnowledgeDocumentUpload knowledgeBaseId="kb1" onUploaded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("上傳文件"), {
      target: { files: [sampleFile("一.pdf", 100), sampleFile("二.pdf", 200)] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上傳" }));

    await waitFor(() => expect(mockedSimulateParseStep).toHaveBeenCalledTimes(2));
    expect(order).toEqual(["upload-step", "parse-step", "upload-step", "parse-step"]);
  });
});
