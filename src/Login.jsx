import { useContext, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";

export default function Login() {
  const { user, login, register } = useContext(AuthContext);
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  async function handleSubmit(event) {
    event.preventDefault();
    if (isRegistering && (!name.trim() || name.trim().length > 100)) {
      setError("Введите имя длиной до 100 символов.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Заполните логин и пароль.");
      return;
    }
    const identifier = email.trim();
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const loginValid = /^[\p{L}\p{N}._-]{3,30}$/u.test(identifier);
    if (identifier.length > 150 || (isRegistering ? !emailValid : !emailValid && !loginValid)) {
      setError(isRegistering ? "Введите корректный email." : "Введите корректный логин или email.");
      return;
    }
    if (isRegistering && (password.length < 8 || password.length > 128)) {
      setError("Пароль должен содержать от 8 до 128 символов.");
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (isRegistering) {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <section>
      <h1>{isRegistering ? "Регистрация" : "Вход"}</h1>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {isRegistering && <label>Имя<input type="text" autoComplete="name" value={name}
          onChange={event => setName(event.target.value)} disabled={loading} /></label>}
        <label>{isRegistering ? "Email" : "Логин или email"}<input type={isRegistering ? "email" : "text"}
          autoComplete={isRegistering ? "email" : "username"} value={email}
          onChange={event => setEmail(event.target.value)} disabled={loading} /></label>
        <label>Пароль<input type="password" autoComplete={isRegistering ? "new-password" : "current-password"} value={password}
          onChange={event => setPassword(event.target.value)} disabled={loading} /></label>
        {isRegistering && <label>Повторите пароль<input type="password" autoComplete="new-password" value={confirmPassword}
          onChange={event => setConfirmPassword(event.target.value)} disabled={loading} /></label>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? (isRegistering ? "Регистрация..." : "Вход...") : (isRegistering ? "Зарегистрироваться" : "Войти")}
        </button>
      </form>
      <p>
        {isRegistering ? "Уже есть аккаунт? " : "Нет аккаунта? "}
        <button type="button" disabled={loading} onClick={() => {
          setIsRegistering(value => !value);
          setPassword("");
          setConfirmPassword("");
          setError("");
        }}>{isRegistering ? "Войти" : "Зарегистрироваться"}</button>
      </p>
    </section>
  );
}
