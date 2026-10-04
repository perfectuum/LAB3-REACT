import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import { CartContext } from "./CartContext.jsx";
import { ShopContext } from "./ShopContext.jsx";
import { AuthContext } from "./AuthContext.jsx";
import { getPrice, money } from "./pricing.js";
import { request } from "./api.js";
import { Receipt } from "./Receipt.jsx";

export default function Cart() {
  const { cart, addToCart, removeOne, removeFromCart, clearCart } = useContext(CartContext);
  const { services, loading, error, reload } = useContext(ShopContext);
  const { user } = useContext(AuthContext);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const rows = cart.map(entry => {
    const item = services.find(service => service.id === entry.id);
    if (!item) return { ...entry, item: null };
    const price = getPrice(item, user?.couponPercent);
    return { ...entry, item, price };
  });
  const totalCents = rows.reduce((sum, row) => sum + (row.item ? Math.round(row.price * 100) * row.quantity : 0), 0);
  const originalCents = rows.reduce((sum, row) => sum + (row.item ? Math.round(row.item.price * 100) * row.quantity : 0), 0);
  const hasProduct = rows.some(row => row.item?.kind === "product");

  async function placeOrder(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPlacing(true);
    setCheckoutError("");
    try {
      const order = await request("/orders", {
        method: "POST",
        body: JSON.stringify({
          items: cart,
          phone: String(form.get("phone") || ""),
          address: String(form.get("address") || ""),
          paymentMethod: String(form.get("paymentMethod") || ""),
        }),
      });
      setConfirmedOrder(order);
      clearCart();
      setCheckoutOpen(false);
    } catch (err) {
      setCheckoutError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <section>
      <h1>Корзина</h1>
      {confirmedOrder && <>
        <p className="success" role="status">Заказ №{confirmedOrder.id} оформлен.</p>
        <Receipt order={confirmedOrder} />
      </>}
      {cart.length === 0 ? (!confirmedOrder && <p>Корзина пуста</p>) : loading ? <p role="status">Загрузка цен с API...</p> : error ? (
        <p className="error" role="alert">{error} <button onClick={reload}>Повторить</button></p>
      ) : (
        <>
          <ul className="cart-list">
            {rows.map(({ id, item, quantity, price }) => (
              <li key={id}>
                {item ? (
                  <>
                    {item.image && <img src={item.image} alt={item.name} width="60" height="60" />}
                    <div className="cart-name">
                      <strong>{item.name}</strong>
                    </div>
                    <div className="quantity">
                      <button aria-label={`Уменьшить количество: ${item.name}`} onClick={() => removeOne(id)}>-</button>
                      <span>{quantity}</span>
                      <button aria-label={`Увеличить количество: ${item.name}`} onClick={() => addToCart(item)}>+</button>
                    </div>
                    <span className="cart-line-price">
                      <strong>{money(Math.round(price * 100) * quantity / 100)}</strong>
                      {price < item.price && <del>{money(Math.round(item.price * 100) * quantity / 100)}</del>}
                    </span>
                  </>
                ) : <p role="alert">Позиция больше не доступна в каталоге.</p>}
                <button onClick={() => removeFromCart(id)}>Удалить</button>
              </li>
            ))}
          </ul>
          {user?.couponPercent > 0 && <p>Персональный купон: {user.couponName} ({user.couponPercent}%)</p>}
          {originalCents > totalCents && <p>Без скидки: <del>{money(originalCents / 100)}</del></p>}
          <p className="total">Итого: {money(totalCents / 100)}</p>
          {user?.role === "admin" ? null : user ? (
            <>
              <button type="button" disabled={rows.some(row => !row.item)}
                onClick={() => setCheckoutOpen(open => !open)}>Оформить заказ</button>
              {checkoutOpen && <form className="form checkout-form" onSubmit={placeOrder}>
                <label>Телефон<input name="phone" type="tel" defaultValue={user.phone || ""}
                  minLength="6" maxLength="30" required /></label>
                <label>Адрес доставки{hasProduct ? "" : " (если нужен)"}
                  <input key={`${user.id}:${user.address || ""}`} name="address"
                    defaultValue={user.address || ""} maxLength="300" required={hasProduct} /></label>
                <label>Способ оплаты<select name="paymentMethod" defaultValue="cash">
                  <option value="cash">Наличными</option>
                  <option value="online">Онлайн</option>
                </select></label>
                <button type="submit" disabled={placing}>{placing ? "Оформление..." : "Подтвердить заказ"}</button>
              </form>}
              {checkoutError && <p className="error" role="alert">{checkoutError}</p>}
            </>
          ) : <p>Чтобы оформить заказ, <Link to="/login">войдите или зарегистрируйтесь</Link>.</p>}
        </>
      )}
    </section>
  );
}
