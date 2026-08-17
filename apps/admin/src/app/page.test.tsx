import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminHomePage from "./page";

describe("AdminHomePage (E11-S001)", () => {
  it("renders the admin console landing heading", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("heading", { name: "AI KM 管理主控台", level: 1 })).toBeInTheDocument();
  });
});

describe("AdminHomePage entry links (E11-S002)", () => {
  it("links to the user list", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "使用者管理" })).toHaveAttribute("href", "/users");
  });
});

describe("AdminHomePage entry links (E11-S006)", () => {
  it("links to the role list", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "角色管理" })).toHaveAttribute("href", "/roles");
  });
});

describe("AdminHomePage entry links (E11-S008)", () => {
  it("links to the permission matrix", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "權限矩陣" })).toHaveAttribute("href", "/permissions");
  });
});

describe("AdminHomePage entry links (E11-S009)", () => {
  it("links to department management", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "部門管理" })).toHaveAttribute("href", "/departments");
  });
});

describe("AdminHomePage entry links (E11-S010)", () => {
  it("links to group management", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "群組管理" })).toHaveAttribute("href", "/groups");
  });
});

describe("AdminHomePage entry links (E11-S011)", () => {
  it("links to knowledge base admin", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "知識庫管理" })).toHaveAttribute("href", "/knowledge");
  });
});

describe("AdminHomePage entry links (E11-S012)", () => {
  it("links to prompt admin", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "提示詞管理" })).toHaveAttribute("href", "/prompts");
  });
});

describe("AdminHomePage entry links (E11-S013)", () => {
  it("links to model admin", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "模型管理" })).toHaveAttribute("href", "/models");
  });
});

describe("AdminHomePage entry links (E11-S014)", () => {
  it("links to connector admin", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "連接器管理" })).toHaveAttribute("href", "/connectors");
  });
});

describe("AdminHomePage entry links (E11-S015)", () => {
  it("links to the audit viewer", () => {
    render(<AdminHomePage />);

    expect(screen.getByRole("link", { name: "稽核紀錄" })).toHaveAttribute("href", "/audit");
  });
});
