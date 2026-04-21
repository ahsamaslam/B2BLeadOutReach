import { authStorage } from "./api";

describe("authStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sets and gets token", () => {
    authStorage.setToken("abc123");
    expect(authStorage.getToken()).toBe("abc123");
  });

  it("clears token", () => {
    authStorage.setToken("abc123");
    authStorage.clearToken();
    expect(authStorage.getToken()).toBeNull();
  });
});
