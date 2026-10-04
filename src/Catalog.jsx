import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CartContext } from "./CartContext.jsx";
import { ShopContext } from "./ShopContext.jsx";
import { AuthContext } from "./AuthContext.jsx";
import { getPrice, money } from "./pricing.js";
import { itemCode } from "./itemCode.js";

export default function Catalog() {
  const { addToCart } = useContext(CartContext);
  const { services, categories, loading, error, reload } = useContext(ShopContext);
  const { user } = useContext(AuthContext);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const navigate = useNavigate();
  const needle = search.trim().toLowerCase();
  const filtered = services.filter(item =>
    (selected.length === 0 || selected.includes(item.categoryId)) &&
    (kind === "all" || item.kind === kind) &&
    (!needle || [item.name, item.description, itemCode(item)]
      .some(value => value.toLowerCase().includes(needle))));
  function toggleCategory(id) {
    setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  }
  return (
    <section>
      <h1>Каталог товаров и услуг</h1>
      {loading && <p role="status">Загрузка каталога с API...</p>}
      {error && <p className="error" role="alert">{error} <button onClick={reload}>Повторить</button></p>}
      {!loading && !error && (
        <div className="catalog-layout">
          <aside>
            <label className="search-field">Поиск по названию или коду
              <input type="search" value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            <label className="search-field">Тип
              <select value={kind} onChange={event => setKind(event.target.value)}>
                <option value="all">Все</option>
                <option value="product">Товары</option>
                <option value="service">Услуги</option>
              </select>
            </label>
            <h2>Категории</h2>
            {categories.map(category => (
              <label className="category" key={category.id}>
                <input type="checkbox" checked={selected.includes(category.id)}
                  onChange={() => toggleCategory(category.id)} />
                {category.name}
              </label>
            ))}
            {selected.length > 0 && <button onClick={() => setSelected([])}>Сбросить фильтр</button>}
          </aside>
          <div className="cards">
            {filtered.length === 0 && <p>{needle
              ? "По запросу ничего не найдено."
              : selected.length > 0
                ? "В выбранных категориях ничего нет."
                : kind === "service"
                  ? "Услуг пока нет."
                  : kind === "product"
                    ? "Товаров пока нет."
                    : "В каталоге пока ничего нет."}</p>}
            {filtered.map(item => {
              const price = getPrice(item, user?.couponPercent);
              return (
                <article className={`card ${item.kind === "product" ? "product-card" : ""}`} key={item.id}>
                  {item.image && <img src={item.image} alt={item.name} width="200" height="180" />}
                  <h2>{item.name}</h2>
                  <p>Код: {itemCode(item)}</p>
                  <p>{item.description}</p>
                  {item.kind === "service" && <p>Длительность: {item.duration} мин.</p>}
                  {item.discountPercent > 0 && <p className="discount">Скидка {item.discountPercent}%</p>}
                  {user?.couponPercent > 0 && <p>Ваш купон: {user.couponPercent}%</p>}
                  <p className="price">
                    {price < item.price && <del>{money(item.price)}</del>} {money(price)}
                  </p>
                  {user?.role !== "admin" && <button onClick={() => { addToCart(item); navigate("/cart"); }}>В корзину</button>}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
