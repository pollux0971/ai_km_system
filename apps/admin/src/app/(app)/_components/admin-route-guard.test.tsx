import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminRouteGuard } from "./admin-route-guard";

describe("AdminRouteGuard (E11-S023)", () => {
  it("renders children when the session has a required role for the route", () => {
    render(
      <AdminRouteGuard pathname="/users" userRoles={["it_administrator"]}>
        <p>使用者管理內容</p>
      </AdminRouteGuard>,
    );

    expect(screen.getByText("使用者管理內容")).toBeInTheDocument();
  });

  it("renders children for super_administrator on any classified route, even one requiring a different specific role", () => {
    render(
      <AdminRouteGuard pathname="/models" userRoles={["super_administrator"]}>
        <p>模型管理內容</p>
      </AdminRouteGuard>,
    );

    expect(screen.getByText("模型管理內容")).toBeInTheDocument();
  });

  it("shows an UNAUTHORIZED message and hides children when there is no session at all", () => {
    render(
      <AdminRouteGuard pathname="/users" userRoles={null}>
        <p>使用者管理內容</p>
      </AdminRouteGuard>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("請先登入。");
    expect(screen.queryByText("使用者管理內容")).not.toBeInTheDocument();
  });

  it("shows a FORBIDDEN message and hides children when the session's roles don't satisfy the route's requirement", () => {
    render(
      <AdminRouteGuard pathname="/roles" userRoles={["it_administrator"]}>
        <p>角色管理內容</p>
      </AdminRouteGuard>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("您沒有權限執行此操作。");
    expect(screen.queryByText("角色管理內容")).not.toBeInTheDocument();
  });

  it("denies access to a route not in the access table, even for super_administrator — fail-closed, not silently open", () => {
    render(
      <AdminRouteGuard pathname="/this-route-does-not-exist" userRoles={["super_administrator"]}>
        <p>不應該顯示的內容</p>
      </AdminRouteGuard>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("您沒有權限執行此操作。");
    expect(screen.queryByText("不應該顯示的內容")).not.toBeInTheDocument();
  });

  it("resolves a nested route (/users/[id]) using its parent /users's own requirement", () => {
    render(
      <AdminRouteGuard pathname="/users/mock-user-it-admin" userRoles={["it_administrator"]}>
        <p>使用者詳情內容</p>
      </AdminRouteGuard>,
    );

    expect(screen.getByText("使用者詳情內容")).toBeInTheDocument();
  });
});
