import { useContext } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeContext } from "./ThemeContext.jsx";
import Menu from "./Menu.jsx";
import Catalog from "./Catalog.jsx";
import Cart from "./Cart.jsx";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Admin from "./Admin.jsx";
import ReceiptPage from "./Receipt.jsx";

export default function App() {
  const { theme } = useContext(ThemeContext);
  return (
    <BrowserRouter>
      <main className={`app ${theme}`}>
        <Menu />
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/receipt/:id" element={<ReceiptPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<p>Страница не найдена.</p>} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
