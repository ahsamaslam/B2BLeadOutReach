def test_register_login_and_me(client):
    email = "unit@example.com"
    password = "strongpassword"

    register_response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert register_response.status_code == 200
    register_data = register_response.json()
    assert register_data["email"] == email

    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    assert token

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    me_data = me_response.json()
    assert me_data["email"] == email


def test_protected_endpoint_requires_token(client):
    response = client.get("/api/companies")
    assert response.status_code == 401
