import { useCallback, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "./AuthContext.jsx";
import { ShopContext } from "./ShopContext.jsx";
import { request } from "./api.js";
import { itemCode } from "./itemCode.js";
import { money } from "./pricing.js";

export default function Admin() {
  const { user, loading: authLoading, refreshUser } = useContext(AuthContext);
  const { services, categories, loading: shopLoading, error: shopError, reload } = useContext(ShopContext);
  const [users, setUsers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [discount, setDiscount] = useState("0");
  const [serviceSearch, setServiceSearch] = useState("");
  const [categoryServiceCode, setCategoryServiceCode] = useState("");
  const [serviceCategoryName, setServiceCategoryName] = useState("");
  const [editingCategoryKey, setEditingCategoryKey] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [userLogin, setUserLogin] = useState("");
  const [couponName, setCouponName] = useState("");
  const [editingCouponName, setEditingCouponName] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("0");

  const needle = serviceSearch.trim().toLowerCase();
  const matchingServices = services.filter(item => !needle ||
    [item.name, itemCode(item)].some(value => value.toLowerCase().includes(needle)));
  const filteredServices = services.filter(item => matchingServices.includes(item) ||
    [serviceCode, categoryServiceCode].includes(itemCode(item)));

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [people, types, orderList] = await Promise.all([
        request("/admin/users"), request("/admin/coupons"), request("/admin/orders"),
      ]);
      if (!Array.isArray(people) || !Array.isArray(types) || !Array.isArray(orderList)) {
        throw new Error("Некорректные данные администратора.");
      }
      setUsers(people);
      setCoupons(types);
      setOrders(orderList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user?.role === "admin") loadAdmin(); }, [user?.role, loadAdmin]);

  async function save(event, path, method, body, successMessage) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request(path, { method, body: JSON.stringify(body) });
      await reload();
      await loadAdmin();
      await refreshUser();
      setMessage(successMessage);
      if (path === "/admin/categories") setCategoryName("");
      if (path.startsWith("/admin/categories/")) {
        setEditingCategoryKey("");
        setEditingCategoryName("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder(orderId) {
    if (!window.confirm(`Удалить заказ №${orderId} и его чек?`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request(`/admin/orders/${orderId}`, { method: "DELETE" });
      await loadAdmin();
      setMessage(`Заказ №${orderId} и его чек удалены.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function selectService(code) {
    setServiceCode(code);
    const item = services.find(service => itemCode(service) === code);
    setDiscount(String(item?.discountPercent ?? 0));
  }

  function selectCategoryService(code) {
    setCategoryServiceCode(code);
    const item = services.find(service => itemCode(service) === code);
    const category = categories.find(entry => entry.id === item?.categoryId);
    setServiceCategoryName(category?.name ?? "");
  }

  function selectCategory(name) {
    setEditingCategoryKey(name);
    setEditingCategoryName(name);
  }

  function selectCoupon(name) {
    setEditingCouponName(name);
    const coupon = coupons.find(entry => entry.name === name);
    setCouponDiscount(String(coupon?.discountPercent ?? 0));
  }

  function selectUser(login) {
    setUserLogin(login);
    const person = users.find(entry => entry.login === login);
    setCouponName(person?.couponName ?? "");
  }

  if (authLoading) return <p role="status">Загрузка пользователя...</p>;
  if (!user) return <p>Сначала <Link to="/login">войдите</Link>.</p>;
  if (user.role !== "admin") return <p role="alert">Доступ разрешён только администратору.</p>;

  return (
    <section className="admin-page">
      <h1>Администратор</h1>
      {(loading || shopLoading) && <p role="status">Загрузка данных с API...</p>}
      {(error || shopError) && <p className="error" role="alert">{error || shopError}</p>}
      {(error || shopError) && <button onClick={() => { reload(); loadAdmin(); }}>Повторить</button>}
      {message && <p className="success" role="status">{message}</p>}
      {!loading && !shopLoading && !shopError && (
        <>
        <label className="admin-search">Поиск позиции по названию или коду
          <input type="search" value={serviceSearch} placeholder="Например, #0001 или название"
            onChange={event => setServiceSearch(event.target.value)} />
        </label>
        {needle && <div className="admin-search-results">
          {matchingServices.length === 0 ? <p>Ничего не найдено.</p> : (
            <ul>{matchingServices.map(item => <li key={itemCode(item)}>
              {itemCode(item)} - {item.name}{" "}
              <button type="button" onClick={() => selectService(itemCode(item))}>Скидка</button>{" "}
              <button type="button" onClick={() => selectCategoryService(itemCode(item))}>Категория</button>
            </li>)}</ul>
          )}
        </div>}
        <div className="admin-sections">
          <section>
            <h2>Добавить категорию</h2>
            <form className="form" onSubmit={event => save(event, "/admin/categories", "POST",
              { name: categoryName }, "Категория добавлена в каталог.")}>
              <label>Название категории<input value={categoryName} maxLength="100" required
                onChange={event => setCategoryName(event.target.value)} /></label>
              <button disabled={saving}>{saving ? "Сохранение..." : "Добавить категорию"}</button>
            </form>
          </section>
          <section>
            <h2>Переименовать категорию</h2>
            <form className="form" onSubmit={event => save(event, `/admin/categories/${encodeURIComponent(editingCategoryKey)}`, "PUT",
              { name: editingCategoryName }, "Категория обновлена.")}>
              <label>Категория<select value={editingCategoryKey} required onChange={event => selectCategory(event.target.value)}>
                <option value="">Выберите категорию</option>
                {categories.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
              </select></label>
              <label>Новое название<input value={editingCategoryName} maxLength="100" required
                onChange={event => setEditingCategoryName(event.target.value)} /></label>
              <button disabled={saving || !editingCategoryKey}>Сохранить категорию</button>
            </form>
          </section>
          <section>
            <h2>Общая скидка</h2>
            <form className="form" onSubmit={event => save(event, `/admin/services/${encodeURIComponent(serviceCode)}`, "PUT",
              { discountPercent: Number(discount) }, "Скидка обновлена.")}>
              <label>Товар или услуга<select value={serviceCode} required onChange={event => selectService(event.target.value)}>
                <option value="">Выберите позицию</option>
                {filteredServices.map(item => <option key={itemCode(item)} value={itemCode(item)}>{itemCode(item)} - {item.name}</option>)}
              </select></label>
              <label>Общая скидка, %<input type="number" min="0" max="99" step="1" required
                value={discount} onChange={event => setDiscount(event.target.value)} /></label>
              <button disabled={saving || !serviceCode}>Сохранить скидку</button>
            </form>
          </section>
          <section>
            <h2>Категория товара или услуги</h2>
            <form className="form" onSubmit={event => save(event, `/admin/services/${encodeURIComponent(categoryServiceCode)}/category`, "PUT",
              { categoryName: serviceCategoryName }, "Категория позиции обновлена.")}>
              <label>Товар или услуга<select value={categoryServiceCode} required
                onChange={event => selectCategoryService(event.target.value)}>
                <option value="">Выберите позицию</option>
                {filteredServices.map(item => <option key={itemCode(item)} value={itemCode(item)}>{itemCode(item)} - {item.name}</option>)}
              </select></label>
              <label>Категория<select value={serviceCategoryName} required
                onChange={event => setServiceCategoryName(event.target.value)}>
                <option value="">Выберите категорию</option>
                {categories.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
              </select></label>
              <button disabled={saving || !categoryServiceCode || !serviceCategoryName}>Сохранить категорию позиции</button>
            </form>
          </section>
          <section>
            <h2>Персональный купон</h2>
            <form className="form" onSubmit={event => save(event, `/admin/users/${encodeURIComponent(userLogin)}/coupon`, "PUT",
              { couponName: couponName || null }, "Персональный купон сохранён.")}>
              <label>Пользователь<select value={userLogin} required onChange={event => selectUser(event.target.value)}>
                <option value="">Выберите пользователя</option>
                {users.map(person => <option key={person.login} value={person.login}>{person.name} ({person.login})</option>)}
              </select></label>
              <label>Вид купона<select value={couponName} onChange={event => setCouponName(event.target.value)}>
                <option value="">Без купона</option>
                {coupons.map(coupon => <option key={coupon.name} value={coupon.name}>{coupon.name} - {coupon.discountPercent}%</option>)}
              </select></label>
              <button disabled={saving || !userLogin}>Назначить купон</button>
            </form>
          </section>
          <section>
            <h2>Список купонов</h2>
            <ul>
              {coupons.map(coupon => <li key={coupon.name}>{coupon.name} - {coupon.discountPercent}%</li>)}
            </ul>
            <form className="form" onSubmit={event => save(event, `/admin/coupons/${encodeURIComponent(editingCouponName)}`, "PUT",
              { discountPercent: Number(couponDiscount) }, "Скидка купона обновлена.")}>
              <label>Купон<select value={editingCouponName} required onChange={event => selectCoupon(event.target.value)}>
                <option value="">Выберите купон</option>
                {coupons.map(coupon => <option key={coupon.name} value={coupon.name}>{coupon.name}</option>)}
              </select></label>
              <label>Скидка купона, %<input type="number" min="0" max="99" step="1" required
                value={couponDiscount} onChange={event => setCouponDiscount(event.target.value)} /></label>
              <button disabled={saving || !editingCouponName}>Сохранить скидку купона</button>
            </form>
          </section>
          <section>
            <h2>Заказы</h2>
            {orders.length === 0 ? <p>Заказов пока нет.</p> : (
              <ol className="order-list">
                {orders.map(order => <li key={order.id}>
                  <strong>Заказ №{order.id}</strong> - {order.contactName}, {money(order.total)}
                  <p>{new Date(order.createdAt).toLocaleString("ru-RU")} · {order.status} · {order.paymentMethod === "cash" ? "Наличными" : "Онлайн"}</p>
                  <ul>{order.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.name} × {item.quantity}</li>)}</ul>
                  <button type="button" disabled={saving} onClick={() => deleteOrder(order.id)}>Удалить заказ и чек</button>
                </li>)}
              </ol>
            )}
          </section>
        </div>
        </>
      )}
    </section>
  );
}
