import { useContext } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CartContext } from "./CartContext.jsx";
import { ThemeContext } from "./ThemeContext.jsx";
import { AuthContext } from "./AuthContext.jsx";

export default function Menu() {
  const { pathname } = useLocation();
  const { cart } = useContext(CartContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { user } = useContext(AuthContext);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <nav>
      <NavLink to="/" end>Каталог</NavLink>
      {pathname !== "/admin" && <NavLink to="/cart">Корзина ({count})</NavLink>}
      {!user && <NavLink to="/login">Вход</NavLink>}
      <NavLink to="/dashboard">Личный кабинет</NavLink>
      {user?.role === "admin" && <NavLink to="/admin">Администратор</NavLink>}
      <button type="button" onClick={toggleTheme}>Переключить тему ({theme})</button>
    </nav>
  );
}
