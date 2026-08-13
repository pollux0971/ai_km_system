import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FileAttachmentPicker } from "./file-attachment-picker";

function makeFile(name: string, sizeBytes: number, type = "text/plain"): File {
  const file = new File(["x".repeat(Math.min(sizeBytes, 1))], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("FileAttachmentPicker (E03-S008)", () => {
  it("shows no list when there are no files", () => {
    render(<FileAttachmentPicker files={[]} onFilesSelected={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists each selected file with a human-readable size", () => {
    const files = [makeFile("報表.pdf", 2_500_000), makeFile("note.txt", 500)];

    render(<FileAttachmentPicker files={files} onFilesSelected={vi.fn()} onRemove={vi.fn()} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("報表.pdf（2.4 MB）");
    expect(items[1]).toHaveTextContent("note.txt（500 B）");
  });

  it("calls onFilesSelected with the chosen FileList when the input changes", () => {
    const onFilesSelected = vi.fn();
    render(<FileAttachmentPicker files={[]} onFilesSelected={onFilesSelected} onRemove={vi.fn()} />);

    const file = makeFile("photo.png", 1024, "image/png");
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    const [fileList] = onFilesSelected.mock.calls[0] as [FileList];
    expect(fileList).toHaveLength(1);
    expect(fileList[0]?.name).toBe("photo.png");
  });

  it("calls onRemove with the clicked file's index", () => {
    const onRemove = vi.fn();
    const files = [makeFile("a.txt", 10), makeFile("b.txt", 10)];

    render(<FileAttachmentPicker files={files} onFilesSelected={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "移除 b.txt" }));

    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("does not call onFilesSelected when the file input change carries no files (e.g. dialog cancelled)", () => {
    const onFilesSelected = vi.fn();
    render(<FileAttachmentPicker files={[]} onFilesSelected={onFilesSelected} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [] } });

    expect(onFilesSelected).not.toHaveBeenCalled();
  });
});
