import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";
import { request } from "./api.js";
import { money } from "./pricing.js";

export default function Dashboard() {
  const { user, loading, error, logout, refreshUser } = useContext(AuthContext);
  const [logoutError, setLogoutError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [credentialsError, setCredentialsError] = useState("");
  const [credentialsMessage, setCredentialsMessage] = useState("");
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState("");
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    request("/orders/me").then(data => {
      if (!Array.isArray(data)) throw new Error("Некорректный список заказов.");
      setOrders(data);
      setOrdersError("");
    }).catch(err => setOrdersError(err.message));
  }, [userId]);

  async function saveProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");
    try {
      await request("/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: String(form.get("name") || ""),
          phone: String(form.get("phone") || ""),
          address: String(form.get("address") || ""),
        }),
      });
      await refreshUser();
      setProfileMessage("Профиль обновлён.");
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveCredentials(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") || "");
    if (newPassword !== String(form.get("confirmPassword") || "")) {
      setCredentialsError("Новые пароли не совпадают.");
      return;
    }
    setCredentialsSaving(true);
    setCredentialsError("");
    setCredentialsMessage("");
    try {
      await request("/profile/credentials", {
        method: "PUT",
        body: JSON.stringify({
          login: String(form.get("login") || ""),
          currentPassword: String(form.get("currentPassword") || ""),
          newPassword,
        }),
      });
      await refreshUser();
      formElement.elements.currentPassword.value = "";
      formElement.elements.newPassword.value = "";
      formElement.elements.confirmPassword.value = "";
      setCredentialsMessage("Логин и пароль сохранены.");
    } catch (err) {
      setCredentialsError(err.message);
    } finally {
      setCredentialsSaving(false);
    }
  }

  async function handleLogout() {
    try { await logout(); } catch (err) { setLogoutError(err.message); }
  }
  return (
    <section className="dashboard">
      <h1>Личный кабинет</h1>
      {loading ? <p role="status">Загрузка пользователя...</p> : user ? (
        <>
          <p>Вы вошли: {user.name} ({user.email})</p>
          <p>Роль: {user.role === "admin" ? "Администратор" : "Пользователь"}</p>
          <p>Купон: {user.couponId ? `${user.couponName} - ${user.couponPercent}%` : "не назначен"}</p>
          <h2>Профиль</h2>
          <form className="form" onSubmit={saveProfile}>
            <label>Имя<input name="name" defaultValue={user.name} maxLength="100" required /></label>
            <label>Email<input value={user.email} readOnly /></label>
            <label>Телефон<input name="phone" type="tel" defaultValue={user.phone || ""} maxLength="30" /></label>
            <label>Адрес<input name="address" defaultValue={user.address || ""} maxLength="300" /></label>
            <button disabled={profileSaving}>{profileSaving ? "Сохранение..." : "Сохранить профиль"}</button>
          </form>
          {profileError && <p className="error" role="alert">{profileError}</p>}
          {profileMessage && <p className="success" role="status">{profileMessage}</p>}
          <h2>Логин и пароль</h2>
          <form className="form" onSubmit={saveCredentials}>
            <label>Логин<input name="login" type="text" defaultValue={user.login} maxLength="150"
              autoComplete="username" required /></label>
            <label>Текущий пароль<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label>Новый пароль<input name="newPassword" type="password" autoComplete="new-password"
              minLength="8" maxLength="128" /></label>
            <label>Повторите новый пароль<input name="confirmPassword" type="password" autoComplete="new-password"
              minLength="8" maxLength="128" /></label>
            <button disabled={credentialsSaving}>{credentialsSaving ? "Сохранение..." : "Сохранить логин и пароль"}</button>
          </form>
          {credentialsError && <p className="error" role="alert">{credentialsError}</p>}
          {credentialsMessage && <p className="success" role="status">{credentialsMessage}</p>}
          <h2>Мои заказы</h2>
          {ordersError && <p className="error" role="alert">{ordersError}</p>}
          {!ordersError && (orders.length === 0 ? <p>Заказов пока нет.</p> : (
            <ol className="order-list">
              {orders.map(order => <li key={order.id}>
                <strong>Заказ №{order.id}</strong> - {money(order.total)} · {order.status}
                <p>{new Date(order.createdAt).toLocaleString("ru-RU")} · {order.paymentMethod === "cash" ? "Наличными" : "Онлайн"}</p>
                <Link to={`/receipt/${order.id}`}>Чек</Link>
                <ul>{order.items.map(item => <li key={item.serviceId}>
                  {item.name} - Кол-во: {item.quantity} - {money(item.finalPrice * item.quantity)}
                </li>)}</ul>
              </li>)}
            </ol>
          ))}
          <button onClick={handleLogout}>Выйти</button>
        </>
      ) : <p>Сначала <Link to="/login">войдите</Link> через страницу «Вход».</p>}
      {(error || logoutError) && <p className="error" role="alert">{error || logoutError}</p>}
      {error && <button onClick={refreshUser}>Повторить</button>}
    </section>
  );
}
