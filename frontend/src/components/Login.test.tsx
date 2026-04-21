import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Login from "./Login";

jest.mock("../services/api", () => ({
  api: {
    login: jest.fn().mockResolvedValue({ access_token: "token123" }),
    register: jest.fn().mockResolvedValue({ id: 1, email: "user@example.com" }),
  },
  authStorage: {
    setToken: jest.fn(),
  },
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("Login", () => {
  it("renders login form", () => {
    render(<Login onAuthSuccess={jest.fn()} />);
    expect(screen.getByText("Login")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("switches to register mode", () => {
    render(<Login onAuthSuccess={jest.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Need an account? Register" }),
    );
    expect(screen.getByText("Create Account")).toBeInTheDocument();
  });

  it("submits login and calls onAuthSuccess", async () => {
    const onAuthSuccess = jest.fn();
    render(<Login onAuthSuccess={onAuthSuccess} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(onAuthSuccess).toHaveBeenCalled();
    });
  });
});
